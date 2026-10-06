/**
 * Applies supabase/migrations/*.sql to the database in SUPABASE_DB_URL.
 *
 *   npm run db:migrate              apply pending migrations
 *   npm run db:migrate -- --dry-run list what would be applied
 *
 * Each file runs inside a transaction and is recorded in
 * internal.schema_migrations, so re-running only applies what is new. This is a
 * deliberately small stand-in for `supabase db push` that needs no CLI install.
 *
 * The ledger lives in `internal`, not `public`: PostgREST only exposes `public`,
 * and Supabase grants anon ALL privileges on new tables there by default, which
 * would leave the ledger truncatable with the public anon key.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { connect, describeTarget, loadEnvFile } from "./db.ts";

const MIGRATIONS_DIR = "supabase/migrations";

const TRACKING_TABLE = `
  create schema if not exists internal;
  revoke all on schema internal from anon, authenticated;

  create table if not exists internal.schema_migrations (
    version     text        primary key,
    checksum    text        not null,
    applied_at  timestamptz not null default now()
  );
  revoke all on internal.schema_migrations from anon, authenticated;

  -- One-time relocation of a ledger created by an earlier version of this
  -- script, which put it in the API-exposed public schema.
  do $$
  begin
    if exists (
      select 1 from pg_tables
      where schemaname = 'public' and tablename = 'schema_migrations'
    ) then
      insert into internal.schema_migrations (version, checksum, applied_at)
        select version, checksum, applied_at from public.schema_migrations
        on conflict (version) do nothing;
      drop table public.schema_migrations;
    end if;
  end $$;
`;

async function main(): Promise<void> {
  loadEnvFile();
  const dryRun = process.argv.includes("--dry-run");

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) throw new Error(`No .sql files in ${MIGRATIONS_DIR}`);

  console.log(`target : ${describeTarget()}`);
  console.log(`found  : ${files.length} migration file(s)\n`);

  const client = await connect();
  try {
    await client.query(TRACKING_TABLE);

    const { rows } = await client.query<{ version: string; checksum: string }>(
      "select version, checksum from internal.schema_migrations",
    );
    const applied = new Map(rows.map((r) => [r.version, r.checksum]));

    let appliedCount = 0;

    for (const file of files) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = applied.get(file);

      if (previous !== undefined) {
        const drifted = previous !== checksum;
        console.log(
          `  skip   ${file}${drifted ? "  !! file changed since it was applied" : ""}`,
        );
        if (drifted) {
          console.log(
            "         (edit history is not rewritten; add a new migration instead)",
          );
        }
        continue;
      }

      if (dryRun) {
        console.log(`  would apply  ${file}`);
        continue;
      }

      process.stdout.write(`  apply  ${file} ... `);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          "insert into internal.schema_migrations (version, checksum) values ($1, $2)",
          [file, checksum],
        );
        await client.query("commit");
        console.log("ok");
        appliedCount += 1;
      } catch (error) {
        await client.query("rollback");
        console.log("FAILED");
        throw error;
      }
    }

    console.log(
      dryRun
        ? "\nDry run — nothing was changed."
        : `\nApplied ${appliedCount} migration(s).`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
