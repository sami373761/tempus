/**
 * Parses data/screen.json and prints a report without touching the database.
 *
 *   npm run screen:check [-- path/to/file.json]
 */

import {
  SCREEN_DATA_PATH,
  parseScreenFile,
  type ParsedScreenEvent,
} from "./parse-screen.ts";

const path = process.argv[2] ?? SCREEN_DATA_PATH;
const { events, failures, missingDescriptions, header } = parseScreenFile(path);

console.log(`file     : ${path}`);
console.log(`version  : ${header.version ?? "(none)"}`);
console.log(`parsed   : ${events.length} entr(ies)`);
console.log(`rejected : ${failures.length} entr(ies)`);
console.log(`category : screen (topic) — film & TV game only`);

// The header's own count against the array it describes. A truncated file is
// the one corruption that claim can catch.
if (header.count !== null && header.count !== header.items) {
  console.log(
    `\nWARNING: header says count ${header.count} but "items" holds ${header.items}.`,
  );
  process.exitCode = 1;
}

if (events.length > 0) {
  const years = events.map((event) => event.year);
  console.log(`\nyears    : ${Math.min(...years)} .. ${Math.max(...years)}`);

  const distinctYears = new Set(years).size;
  console.log(`distinct : ${distinctYears} year(s)`);

  // The format split, which *is* stored (unlike football's sub-genres): it
  // decides which of the two pills the poster wears, and for a series the
  // stored year is the premiere rather than a release.
  const byFormat = new Map<string, number>();
  for (const event of events) {
    byFormat.set(event.format, (byFormat.get(event.format) ?? 0) + 1);
  }
  console.log("\nformat categories (stored):");
  for (const [format, count] of [...byFormat].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${format.padEnd(10)} ${count}`);
  }

  // How the pool is spread over the rail. The rail is 126 years wide and a
  // decade is 8% of it, so a decade holding half the pool would be a game
  // about one decade — worth being able to see at a glance.
  const byDecade = new Map<number, number>();
  for (const event of events) {
    const decade = Math.floor(event.year / 10) * 10;
    byDecade.set(decade, (byDecade.get(decade) ?? 0) + 1);
  }
  console.log("\nby decade:");
  for (const [decade, count] of [...byDecade].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${decade}s  ${"#".repeat(count)} ${count}`);
  }
}

const sorted = [...events].sort((a, b) => a.year - b.year);
const sample = [
  ...sorted.slice(0, 5),
  ...(sorted.length > 10 ? sorted.slice(-5) : []),
];

console.log("\noldest and newest, as stored:");
for (const event of sample) {
  console.log(`  ${String(event.year).padStart(6)}  ${line(event)}`);
}

if (missingDescriptions.length > 0) {
  console.log(
    `\nmissing descriptions (${missingDescriptions.length}) — these fall back to the placeholder:`,
  );
  for (const miss of missingDescriptions.slice(0, 25)) {
    console.log(`  ${miss.slug} [${miss.locale}]`);
  }
  if (missingDescriptions.length > 25) {
    console.log(`  ... and ${missingDescriptions.length - 25} more`);
  }
}

if (failures.length > 0) {
  console.log("\nrejected entries (not inserted):");
  for (const failure of failures) {
    console.log(`  #${failure.index} ${failure.id || "(no id)"}: ${failure.reason}`);
  }
  process.exitCode = 1;
}

function line(event: ParsedScreenEvent): string {
  return `${event.format.padEnd(7)} ${event.slug.padEnd(46)} ${event.names.en}`;
}
