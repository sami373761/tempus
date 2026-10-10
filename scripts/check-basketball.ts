/**
 * Parses data/basketball.json and prints a report without touching the
 * database.
 *
 *   npm run basketball:check [-- path/to/file.json]
 */

import {
  BASKETBALL_DATA_PATH,
  parseBasketballFile,
  type ParsedBasketballEvent,
} from "./parse-basketball.ts";

const path = process.argv[2] ?? BASKETBALL_DATA_PATH;
const { events, failures, missingDescriptions } = parseBasketballFile(path);

console.log(`file     : ${path}`);
console.log(`parsed   : ${events.length} event(s)`);
console.log(`rejected : ${failures.length} entr(ies)`);
console.log(`category : basketball (topic) — basketball game only\n`);

if (events.length > 0) {
  const years = events.map((event) => event.year);
  console.log(`years    : ${Math.min(...years)} .. ${Math.max(...years)}`);

  const distinctYears = new Set(years).size;
  console.log(
    `distinct : ${distinctYears} year(s) — the comparison format needs three per round`,
  );

  // Where the pool actually sits, which is what `BASKETBALL_BANDS` is tuned
  // against (lib/game/scoring.ts): a tolerance that reads well across the
  // whole rail can still be meaningless inside the cluster the game is
  // decided in.
  console.log("\nby decade:");
  const byDecade = new Map<number, number>();
  for (const event of events) {
    const decade = Math.floor(event.year / 10) * 10;
    byDecade.set(decade, (byDecade.get(decade) ?? 0) + 1);
  }
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

function line(event: ParsedBasketballEvent): string {
  return `${event.slug.padEnd(38)} ${event.names.en}`;
}
