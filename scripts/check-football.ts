/**
 * Parses data/football.json and prints a report without touching the database.
 *
 *   npm run football:check [-- path/to/file.json]
 */

import {
  FOOTBALL_DATA_PATH,
  parseFootballFile,
  type ParsedFootballEvent,
} from "./parse-football.ts";

const path = process.argv[2] ?? FOOTBALL_DATA_PATH;
const { events, failures, missingDescriptions } = parseFootballFile(path);

console.log(`file     : ${path}`);
console.log(`parsed   : ${events.length} event(s)`);
console.log(`rejected : ${failures.length} entr(ies)`);
console.log(`category : football (topic) — football game only\n`);

if (events.length > 0) {
  const years = events.map((event) => event.year);
  console.log(`years    : ${Math.min(...years)} .. ${Math.max(...years)}`);

  const distinctYears = new Set(years).size;
  console.log(
    `distinct : ${distinctYears} year(s) — the comparison format needs three per round`,
  );
}

// The source's own sub-genres. Not stored (see parse-football.ts), printed so
// the information in the file is visible rather than silently dropped.
const byGenre = new Map<string, number>();
for (const event of events) {
  const genre = event.sourceCategory ?? "(none)";
  byGenre.set(genre, (byGenre.get(genre) ?? 0) + 1);
}
console.log("\nsource sub-genres (not stored):");
for (const [genre, count] of [...byGenre].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${genre.padEnd(26)} ${count}`);
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

function line(event: ParsedFootballEvent): string {
  return `${event.slug.padEnd(38)} ${event.names.en}`;
}
