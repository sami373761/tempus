/**
 * Parses data/tarihsel_olaylar_500_5_dil.txt and prints a report without touching the database.
 *
 *   npm run events:check [-- path/to/file.txt]
 */

import { formatHistoricalDate } from "../lib/historical-date.ts";
import { parseEventsFile } from "./parse-events.ts";

const path = process.argv[2] ?? "data/tarihsel_olaylar_500_5_dil.txt";
const result = parseEventsFile(path);

console.log(`file     : ${path}`);
console.log(`parsed   : ${result.events.length} event(s)`);
console.log(`skipped  : ${result.failures.length} line(s)`);
console.log(`ignored  : ${result.ignored} blank/comment line(s)\n`);

const byPrecision = new Map<string, number>();
for (const event of result.events) {
  byPrecision.set(event.precision, (byPrecision.get(event.precision) ?? 0) + 1);
}
console.log("precision breakdown:");
for (const [precision, count] of [...byPrecision].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${precision.padEnd(11)} ${count}`);
}

const sorted = [...result.events].sort((a, b) => a.year - b.year);
const sample = [
  ...sorted.slice(0, 5),
  ...(sorted.length > 10 ? sorted.slice(-5) : []),
];

console.log("\noldest and newest, as stored:");
for (const event of sample) {
  console.log(
    `  ${String(event.year).padStart(12)}  ${formatHistoricalDate(event).padEnd(22)}` +
      `  ${event.precision.padEnd(11)} ${event.names.en}  (raw: ${event.rawDate})`,
  );
}

if (result.failures.length > 0) {
  console.log("\nskipped lines:");
  for (const failure of result.failures) {
    console.log(`  line ${failure.line}: ${failure.reason}`);
    console.log(`    ${failure.raw.slice(0, 120)}`);
  }
  process.exitCode = 1;
}
