/**
 * The acceptance test for moving the four subject games into
 * public.game_category (§7.10): the migrated rows must behave exactly like
 * the constants they replace.
 *
 *   1. panes, default pane and bands of every built-in row equal the old
 *      constants (PANE_SPEC + *_PANES, *_BANDS);
 *   2. the same seed, 1000 random guesses per category: gradeGuess gives the
 *      same verdict with the old bands and with the row's bands;
 *   3. the deal pool: the old rule (random_events' topic restriction by the
 *      category slug) and the new one (events linked through
 *      game_category.category_id) are the same set of events.
 *
 * versus:bot:check and era:check cover the general game; run them beside
 * this. Read only.
 *
 *   SUPABASE_DB_URL=… node --experimental-strip-types scripts/admin-test-db/category-parity.ts
 */

import { connect, describeTarget, loadEnvFile } from "../db.ts";
import { BUILTIN_CATEGORIES } from "../../lib/game/builtin-categories.ts";
import {
  BASKETBALL_BANDS,
  FOOTBALL_BANDS,
  gradeGuess,
  SCREEN_BANDS,
  WHEN_BORN_BANDS,
  type BandSet,
} from "../../lib/game/scoring.ts";
import {
  BASKETBALL_DEFAULT_PANE,
  BASKETBALL_PANES,
  FOOTBALL_DEFAULT_PANE,
  FOOTBALL_PANES,
  PANE_SPEC,
  SCREEN_DEFAULT_PANE,
  SCREEN_PANES,
  WHEN_BORN_DEFAULT_PANE,
  WHEN_BORN_PANES,
  type BuiltinPane,
  type PaneSet,
} from "../../lib/game/timeline.ts";
import { paneYearRange } from "../../lib/game/auto-bands.ts";

// The throwaway database when its file exists, otherwise .env.local (the
// live project): this script only reads, so both are safe.
loadEnvFile("scripts/admin-test-db/.env.test-db");
loadEnvFile();

/** The constants exactly as the four game pages pass them today. */
const OLD: Record<string, { panes: PaneSet; home: string; bands: BandSet }> = {
  football: { panes: FOOTBALL_PANES, home: FOOTBALL_DEFAULT_PANE, bands: FOOTBALL_BANDS },
  basketball: { panes: BASKETBALL_PANES, home: BASKETBALL_DEFAULT_PANE, bands: BASKETBALL_BANDS },
  screen: { panes: SCREEN_PANES, home: SCREEN_DEFAULT_PANE, bands: SCREEN_BANDS },
  "when-born": { panes: WHEN_BORN_PANES, home: WHEN_BORN_DEFAULT_PANE, bands: WHEN_BORN_BANDS },
};

/** jsonb does not keep key order; compare with keys sorted. */
function same(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(norm)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([x], [y]) => x.localeCompare(y)).map(([k, x]) => [k, norm(x)]))
        : v;
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

let passed = 0;
let failed = 0;
function ok(cond: boolean, name: string, detail?: unknown): void {
  if (cond) passed += 1;
  else failed += 1;
  console.log(`${cond ? "✓" : "✗"} ${name}${!cond && detail !== undefined ? `  — ${JSON.stringify(detail)}` : ""}`);
}

/** Mulberry32: the same 1000 guesses on every run. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const db = await connect();
console.log(`target: ${describeTarget()}\n`);
try {
  await db.query("begin");
  await db.query("set transaction read only");
  const { rows } = await db.query<{ slug: string; panes: unknown; default_pane: string; bands: BandSet; category_id: string }>(
    "select slug, panes, default_pane, bands, category_id from public.game_category where is_builtin order by slug",
  );

  for (const [slug, old] of Object.entries(OLD)) {
    const row = rows.find((r) => r.slug === slug);
    if (!row) {
      ok(false, `${slug}: row exists`);
      continue;
    }
    const panes = row.panes as ({ key: string } & Record<string, unknown>)[];

    // 1. Same rails, same opening rail, same ladder.
    const keys = panes.map((p) => p.key);
    ok(JSON.stringify(keys) === JSON.stringify(old.panes), `${slug}: pane keys = *_PANES`, { keys, old: old.panes });
    for (const p of panes) {
      const { key, label: _label, ...spec } = p;
      void _label;
      ok(same(spec, PANE_SPEC[key as BuiltinPane]), `${slug}: pane ${key} spec = PANE_SPEC.${key}`);
    }
    ok(row.default_pane === old.home, `${slug}: default pane = *_DEFAULT_PANE`);
    ok(same(row.bands, old.bands), `${slug}: bands = *_BANDS`);
    const builtin = BUILTIN_CATEGORIES.find((c) => c.slug === slug)!;
    ok(same(builtin.bands, row.bands), `${slug}: lib/game/builtin-categories.ts agrees`);

    // 2. 1000 guesses graded both ways.
    const random = rng(slug.length * 7919);
    const lo = Math.min(...panes.map((p) => paneYearRange(p as never).min));
    const hi = Math.max(...panes.map((p) => paneYearRange(p as never).max));
    let mismatches = 0;
    for (let i = 0; i < 1000; i += 1) {
      const actual = lo + Math.floor(random() * (hi - lo + 1));
      const guess = lo + Math.floor(random() * (hi - lo + 1));
      if (gradeGuess(guess, actual, old.bands).verdict !== gradeGuess(guess, actual, row.bands).verdict) mismatches += 1;
    }
    ok(mismatches === 0, `${slug}: 1000 random guesses, same verdict with old and new bands`, { mismatches });

    // 3. The pool.
    const oldPool = await db.query<{ id: string }>(
      "select event_id as id from public.random_events(100000, array['en'], null, null, false, false, $1, false, array[]::text[]) order by 1",
      [slug],
    );
    const newPool = await db.query<{ id: string }>(
      `select e.id from public.event e join public.event_category ec on ec.event_id = e.id
       where ec.category_id = $1 and e.status = 'published' order by 1`,
      [row.category_id],
    );
    const a = oldPool.rows.map((r) => r.id).join(",");
    const b = newPool.rows.map((r) => r.id).join(",");
    ok(a === b && oldPool.rows.length > 0, `${slug}: deal pool identical (${oldPool.rows.length} events)`, { old: oldPool.rows.length, new: newPool.rows.length });
  }
  await db.query("rollback");
} finally {
  await db.end();
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed) process.exitCode = 1;
