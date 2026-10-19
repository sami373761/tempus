/**
 * npm run admin:check — does the database in SUPABASE_DB_URL (and this
 * checkout) match the admin panel's contract? READ ONLY: one transaction,
 * `set transaction read only`, rolled back at the end.
 *
 *   npm run admin:check                       # .env.local (the live project)
 *   SUPABASE_DB_URL=… npm run admin:check     # any other database
 *
 * Checks (docs/admin/ADMIN_PANEL_RAPORU.md §11.3):
 *   1. every admin_* function in the contract exists; service_role may
 *      execute it, anon and authenticated may not;
 *   2. the new tables exist, have RLS on, and give anon/authenticated no
 *      write privilege;
 *   3. game_category holds the four built-ins with exactly the values the
 *      code derives (lib/game/builtin-categories.ts);
 *   4. the new columns exist (event_challenge_stats and friends);
 *   5. static: every exported function in app/actions/admin/*.ts starts
 *      with `await requireAdmin()`;
 *   6. no app/admin outside the secret folder.
 *
 * Prints ✓/✗ per check, and for ✗ what to do. Exit code 1 on any ✗.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { connect, describeTarget, loadEnvFile } from "./db.ts";
import { BUILTIN_CATEGORIES } from "../lib/game/builtin-categories.ts";
import { ADMIN_SEGMENT } from "../lib/admin/path.ts";
import { COLUMNS, CONTRACT_FUNCTIONS, INTERNAL_FUNCTIONS, NEW_TABLES, scanActions } from "./admin-contract.ts";

loadEnvFile();

type Result = { ok: boolean; name: string; fix?: string };
const results: Result[] = [];
const check = (ok: boolean, name: string, fix?: string) => results.push({ ok, name, fix });

function sameJson(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(norm)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([x], [y]) => x.localeCompare(y)).map(([k, x]) => [k, norm(x)]))
        : v;
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

async function main(): Promise<void> {
  console.log(`target: ${describeTarget()}\n`);
  const db = await connect();
  try {
    await db.query("begin");
    await db.query("set transaction read only");

    // 1. Functions and their privileges.
    for (const sig of CONTRACT_FUNCTIONS) {
      const { rows } = await db.query<{ exists: boolean; svc: boolean | null; anon: boolean | null; auth: boolean | null }>(
        `select to_regprocedure($1) is not null as exists,
           case when to_regprocedure($1) is null then null else has_function_privilege('service_role', to_regprocedure($1), 'execute') end as svc,
           case when to_regprocedure($1) is null then null else has_function_privilege('anon', to_regprocedure($1), 'execute') end as anon,
           case when to_regprocedure($1) is null then null else has_function_privilege('authenticated', to_regprocedure($1), 'execute') end as auth`,
        [`public.${sig}`],
      );
      const r = rows[0]!;
      check(r.exists, `function ${sig} exists`, "npm run db:migrate (the admin migrations are missing)");
      if (r.exists) {
        check(Boolean(r.svc), `  service_role can execute ${sig}`, "grant execute … to service_role (see the migration's grant block)");
        check(!r.anon && !r.auth, `  anon/authenticated cannot execute ${sig}`, "revoke execute … from public, anon, authenticated");
      }
    }
    for (const sig of INTERNAL_FUNCTIONS) {
      const { rows } = await db.query<{ open: boolean | null }>(
        `select case when to_regprocedure($1) is null then null else
           has_function_privilege('service_role', to_regprocedure($1), 'execute')
           or has_function_privilege('anon', to_regprocedure($1), 'execute')
           or has_function_privilege('authenticated', to_regprocedure($1), 'execute') end as open`,
        [`public.${sig}`],
      );
      check(rows[0]!.open === false, `internal ${sig} exists and nobody may call it directly`, "revoke execute … from public, anon, authenticated, service_role");
    }

    // 2. Tables.
    for (const table of NEW_TABLES) {
      const { rows } = await db.query<{ exists: boolean; rls: boolean | null; write: boolean | null }>(
        `select to_regclass($1) is not null as exists,
           (select relrowsecurity from pg_class where oid = to_regclass($1)) as rls,
           case when to_regclass($1) is null then null else (
             has_table_privilege('anon', to_regclass($1), 'insert') or has_table_privilege('anon', to_regclass($1), 'update')
             or has_table_privilege('anon', to_regclass($1), 'delete') or has_table_privilege('anon', to_regclass($1), 'truncate')
             or has_table_privilege('authenticated', to_regclass($1), 'insert') or has_table_privilege('authenticated', to_regclass($1), 'update')
             or has_table_privilege('authenticated', to_regclass($1), 'delete') or has_table_privilege('authenticated', to_regclass($1), 'truncate')) end as write`,
        [`public.${table}`],
      );
      const r = rows[0]!;
      check(r.exists, `table ${table} exists`, "npm run db:migrate");
      if (r.exists) {
        check(Boolean(r.rls), `  ${table}: RLS enabled`, `alter table public.${table} enable row level security`);
        check(r.write === false, `  ${table}: no write privilege for anon/authenticated`, `revoke all on public.${table} from anon, authenticated`);
      }
    }
    for (const table of ["admin_audit", "admin_login_attempt", "event_challenge_review"]) {
      const { rows } = await db.query<{ read: boolean | null }>(
        `select case when to_regclass($1) is null then null else
           has_table_privilege('anon', to_regclass($1), 'select') or has_table_privilege('authenticated', to_regclass($1), 'select') end as read`,
        [`public.${table}`],
      );
      check(rows[0]!.read === false, `  ${table}: not readable by anon/authenticated`, `revoke all on public.${table} from anon, authenticated`);
    }

    // 3. Built-in categories.
    const hasCategories = (await db.query("select to_regclass('public.game_category') is not null as ok")).rows[0]?.ok;
    if (hasCategories) {
      const { rows } = await db.query<{
        slug: string; layout: string; panes: unknown; default_pane: string; bands: unknown; image_prefix: string; tag_kind: string | null; is_builtin: boolean;
      }>("select slug, layout, panes, default_pane, bands, image_prefix, tag_kind, is_builtin from public.game_category where is_builtin order by slug");
      check(rows.length === BUILTIN_CATEGORIES.length, `game_category has ${BUILTIN_CATEGORIES.length} built-in rows (found ${rows.length})`, "the category migration did not run, or a row was deleted");
      for (const expected of BUILTIN_CATEGORIES) {
        const row = rows.find((r) => r.slug === expected.slug);
        const same =
          !!row &&
          row.layout === expected.layout &&
          row.default_pane === expected.defaultPane &&
          row.image_prefix === expected.imagePrefix &&
          row.tag_kind === expected.tagKind &&
          sameJson(row.panes, expected.panes) &&
          sameJson(row.bands, expected.bands);
        check(same, `  built-in ${expected.slug} matches the code (panes, bands, layout, folder, tag group)`,
          "the code's constants changed after the migration: write a migration that updates the row, or revert the constant");
      }
    }

    // 4. Columns.
    for (const [table, column] of COLUMNS) {
      const { rows } = await db.query<{ ok: boolean }>(
        `select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2) as ok`,
        [table, column],
      );
      check(rows[0]!.ok, `column ${table}.${column} exists`, "npm run db:migrate");
    }
    const nullable = await db.query<{ ok: boolean }>(
      `select is_nullable = 'YES' as ok from information_schema.columns where table_schema = 'public' and table_name = 'image' and column_name = 'source_page_url'`,
    );
    check(Boolean(nullable.rows[0]?.ok), "image.source_page_url is nullable (PD uploads)", "npm run db:migrate");

    await db.query("rollback");
  } finally {
    await db.end();
  }

  // 5. Static scan.
  const bad = scanActions();
  check(bad.length === 0, "every export in app/actions/admin/*.ts starts with `await requireAdmin()`",
    `fix: ${bad.map((b) => `${b.file}:${b.fn}`).join(", ")}`);

  // 6. No /admin.
  const stray = existsSync("app/admin");
  check(!stray, "no app/admin folder (the panel lives only under the secret segment)", "delete app/admin");
  check(existsSync(join("app", ADMIN_SEGMENT)), "the secret panel folder exists", "the branch is incomplete");

  let failed = 0;
  for (const r of results) {
    if (r.ok) console.log(`✓ ${r.name}`);
    else {
      failed += 1;
      console.log(`✗ ${r.name}${r.fix ? `\n    → ${r.fix}` : ""}`);
    }
  }
  console.log(`\n${results.length - failed}/${results.length} passed${failed ? `, ${failed} failed` : ""}.`);
  if (failed) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
