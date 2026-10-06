/**
 * Asserts that the era rule has exactly one meaning.
 *
 *   npm run era:check
 *
 * `public.era_slug_for_year(bigint)` in the database and `eraForYear()` in
 * lib/historical-date.ts are deliberate duplicates: the database maintains the
 * category link by trigger, while TypeScript needs the same answer to build R2
 * object keys. Duplication is the cost of not round-tripping to Postgres just to
 * name a file — this check is what keeps it honest.
 *
 * Also verifies that every event's stored era link matches the rule, which is
 * what the trigger is responsible for.
 */

import assert from "node:assert/strict";

import { connect, loadEnvFile } from "./db.ts";
import { eraForYear, ERA_FOLDERS, PRESENT_YEAR } from "../lib/historical-date.ts";

/** Boundaries, their neighbours, and the extremes of the allowed column range. */
const PROBES = [
  -15_000_000_000, -4_539_999_999, -1000, -2, -1,
  0, 1, 2,
  PRESENT_YEAR - 1, PRESENT_YEAR, PRESENT_YEAR + 1,
  3000,
];

async function main(): Promise<void> {
  loadEnvFile();
  const client = await connect();
  let failures = 0;

  try {
    console.log("era rule, SQL vs TypeScript:");
    for (const year of PROBES) {
      const { rows } = await client.query<{ era: string }>(
        "select public.era_slug_for_year($1::bigint) as era",
        [year],
      );
      const sql = rows[0]!.era;
      const ts = eraForYear(year);
      const agree = sql === ts;
      if (!agree) failures += 1;
      console.log(
        `  ${String(year).padStart(14)}  sql=${sql.padEnd(6)} ts=${ts.padEnd(6)} ` +
          (agree ? "agree" : "** DIVERGED **"),
      );
      assert.ok(
        (ERA_FOLDERS as readonly string[]).includes(ts),
        `eraForYear(${year}) returned "${ts}", which is not an era folder`,
      );
    }

    const checks: [string, string][] = [
      [
        "events with no era category",
        `select count(*)::int n from public.event e
         where not exists (
           select 1 from public.event_category ec
           join public.category c on c.id = ec.category_id
           where ec.event_id = e.id and c.kind = 'era')`,
      ],
      [
        "events with more than one era category",
        `select count(*)::int n from (
           select ec.event_id from public.event_category ec
           join public.category c on c.id = ec.category_id
           where c.kind = 'era' group by ec.event_id having count(*) > 1) x`,
      ],
      [
        "era links contradicting the rule",
        `select count(*)::int n
         from public.event_category ec
         join public.category c on c.id = ec.category_id
         join public.event e on e.id = ec.event_id
         where c.kind = 'era' and c.slug <> public.era_slug_for_year(e.year)`,
      ],
    ];

    console.log("\nstored mapping (every count must be 0):");
    for (const [label, sql] of checks) {
      const { rows } = await client.query<{ n: number }>(sql);
      const n = rows[0]!.n;
      if (n !== 0) failures += 1;
      console.log(`  ${label.padEnd(40)} ${n}${n === 0 ? "" : "  ** FAIL **"}`);
    }

    const { rows: counts } = await client.query<{ slug: string; n: number }>(
      // count(ec.event_id), not count(*): the left join yields one null row for
      // an era with no events, which count(*) would report as 1.
      `select c.slug, count(ec.event_id)::int n
       from public.category c
       left join public.event_category ec on ec.category_id = c.id
       where c.kind = 'era' group by c.slug order by n desc`,
    );
    console.log("\nevents per era:");
    for (const r of counts) console.log(`  ${r.slug.padEnd(7)} ${r.n}`);

    console.log(failures === 0 ? "\nok" : `\n${failures} failure(s)`);
    if (failures > 0) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
