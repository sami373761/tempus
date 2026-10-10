/**
 * Parses data/when-born.json and prints a report without touching the database.
 *
 *   npm run when-born:check [-- path/to/file.json]
 */

import {
  WHEN_BORN_DATA_PATH,
  parseWhenBornFile,
  type ParsedWhenBornEvent,
} from "./parse-when-born.ts";
import { formatYear } from "../lib/historical-date.ts";
import {
  paneBounds,
  paneForYear,
  WHEN_BORN_PANES,
} from "../lib/game/timeline.ts";

const path = process.argv[2] ?? WHEN_BORN_DATA_PATH;
const { events, failures, missingDescriptions, header } =
  parseWhenBornFile(path);

console.log(`file     : ${path}`);
console.log(`version  : ${header.version ?? "(none)"}`);
console.log(`parsed   : ${events.length} entr(ies)`);
console.log(`rejected : ${failures.length} entr(ies)`);
console.log(`category : when-born (topic) — "Born When?" game only`);

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
  console.log(
    `\nyears    : ${formatYear(Math.min(...years))} .. ${formatYear(Math.max(...years))}`,
  );
  console.log(`distinct : ${new Set(years).size} year(s)`);

  // The field split, which *is* stored (unlike football's sub-genres): it
  // decides which pill the photograph wears, and a portrait with no label is
  // most of the way to unanswerable.
  const byField = new Map<string, number>();
  for (const event of events) {
    byField.set(event.field, (byField.get(event.field) ?? 0) + 1);
  }
  console.log("\nfield categories (stored):");
  for (const [field, count] of [...byField].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${field.padEnd(18)} ${count}`);
  }

  // **How the pool falls across the three rails**, which is the one report
  // this game needs that the film one did not: the rails exist because the
  // pool is not spread evenly over 3,338 years (see `WHEN_BORN_PANES`), so a
  // re-seed that shifted the balance — a rail left with two people on it — is
  // worth seeing at a glance rather than discovering in play.
  console.log("\nby rail:");
  for (const pane of WHEN_BORN_PANES) {
    const { min, max } = paneBounds(pane);
    const on = events.filter(
      (event) => paneForYear(event.year, WHEN_BORN_PANES) === pane,
    );
    const span = max - min;
    console.log(
      `  ${pane.padEnd(16)} ${formatYear(min).padStart(10)} .. ${formatYear(max).padEnd(10)}` +
        ` ${String(on.length).padStart(4)} people  ${(span / 690).toFixed(2)} yr/px`,
    );
  }

  // Density within each rail, since that is what the bands are tuned against.
  console.log("\nby century:");
  const byCentury = new Map<number, number>();
  for (const event of events) {
    byCentury.set(
      Math.floor(event.year / 100) * 100,
      (byCentury.get(Math.floor(event.year / 100) * 100) ?? 0) + 1,
    );
  }
  for (const [century, count] of [...byCentury].sort((a, b) => a[0] - b[0])) {
    console.log(
      `  ${formatYear(century).padStart(10)}  ${"#".repeat(count)} ${count}`,
    );
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

function line(event: ParsedWhenBornEvent): string {
  return `${event.field.padEnd(17)} ${event.slug.padEnd(30)} ${event.names.en}`;
}
