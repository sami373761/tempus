/**
 * Parses data/events.txt and upserts it into the database.
 *
 *   npm run db:seed:events                       insert as published
 *   npm run db:seed:events -- --status draft     insert hidden from the public
 *   npm run db:seed:events -- --dry-run          parse and report only
 *   npm run db:seed:events -- path/to/file.txt
 *
 * Idempotent: keyed on event.slug, so re-running updates in place rather than
 * duplicating. Image relations are deliberately left empty — images arrive in a
 * later pass, and `image` rows require real provenance to be inserted at all.
 */

import { connect, describeTarget, loadEnvFile } from "./db.ts";
import {
  PARSED_LOCALES,
  parseEventsFile,
  type ParsedEvent,
} from "./parse-events.ts";

const CHUNK_SIZE = 200;

function parseArgs() {
  const args = process.argv.slice(2);
  const statusIndex = args.indexOf("--status");
  const status = statusIndex === -1 ? "published" : args[statusIndex + 1];

  if (status !== "published" && status !== "draft" && status !== "review") {
    throw new Error(`--status must be published, draft or review (got ${status})`);
  }

  const path =
    args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--status") ??
    "data/events.txt";

  return { status, path, dryRun: args.includes("--dry-run") };
}

async function main(): Promise<void> {
  loadEnvFile();
  const { status, path, dryRun } = parseArgs();

  const { events, failures, ignored } = parseEventsFile(path);

  console.log(`file     : ${path}`);
  console.log(`parsed   : ${events.length} event(s)`);
  console.log(`skipped  : ${failures.length} unparseable line(s)`);
  console.log(`ignored  : ${ignored} blank/comment line(s)`);

  if (failures.length > 0) {
    console.log("\nskipped lines (not inserted):");
    for (const f of failures.slice(0, 25)) {
      console.log(`  line ${f.line}: ${f.reason}`);
    }
    if (failures.length > 25) {
      console.log(`  ... and ${failures.length - 25} more`);
    }
  }

  if (events.length === 0) {
    console.log("\nNothing to insert.");
    return;
  }

  if (dryRun) {
    console.log("\nDry run — nothing was written.");
    return;
  }

  console.log(`\ntarget   : ${describeTarget()}`);
  console.log(`status   : ${status}\n`);

  const client = await connect();
  try {
    await client.query("begin");

    let eventRows = 0;
    let translationRows = 0;

    for (let i = 0; i < events.length; i += CHUNK_SIZE) {
      const chunk = events.slice(i, i + CHUNK_SIZE);
      eventRows += await upsertEvents(client, chunk, status);
      translationRows += await upsertTranslations(client, chunk);
      process.stdout.write(
        `\r  upserted ${Math.min(i + CHUNK_SIZE, events.length)}/${events.length} events`,
      );
    }

    await client.query("commit");
    console.log(
      `\n\nEvents upserted      : ${eventRows}` +
        `\nTranslations upserted: ${translationRows}`,
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

type PgClient = Awaited<ReturnType<typeof connect>>;

async function upsertEvents(
  client: PgClient,
  chunk: ParsedEvent[],
  status: string,
): Promise<number> {
  const values: unknown[] = [];
  const tuples = chunk.map((event, i) => {
    const base = i * 6;
    values.push(
      event.slug,
      event.year,
      event.month,
      event.day,
      event.precision,
      status,
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::public.date_precision, $${base + 6}::public.publication_status)`;
  });

  const { rowCount } = await client.query(
    `insert into public.event (slug, year, month, day, precision, status)
     values ${tuples.join(", ")}
     on conflict (slug) do update
       set year      = excluded.year,
           month     = excluded.month,
           day       = excluded.day,
           precision = excluded.precision,
           status    = excluded.status`,
    values,
  );

  return rowCount ?? 0;
}

async function upsertTranslations(
  client: PgClient,
  chunk: ParsedEvent[],
): Promise<number> {
  const values: unknown[] = [];
  const tuples: string[] = [];

  for (const event of chunk) {
    for (const locale of PARSED_LOCALES) {
      const base = values.length;
      values.push(event.slug, locale, event.names[locale]);
      tuples.push(
        `((select id from public.event where slug = $${base + 1}), $${base + 2}, $${base + 3})`,
      );
    }
  }

  const { rowCount } = await client.query(
    `insert into public.event_translation (event_id, locale_code, name)
     values ${tuples.join(", ")}
     on conflict (event_id, locale_code) do update
       set name = excluded.name`,
    values,
  );

  return rowCount ?? 0;
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
