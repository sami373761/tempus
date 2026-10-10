/**
 * Parses data/screen.json and upserts it into the database.
 *
 *   npm run db:seed:screen                       insert as published
 *   npm run db:seed:screen -- --status draft     insert hidden from the public
 *   npm run db:seed:screen -- --dry-run          parse and report only
 *   npm run db:seed:screen -- path/to/file.json
 *
 * Idempotent: keyed on event.slug, so re-running updates in place rather than
 * duplicating. It is `seed-football.ts` with one addition — the format link —
 * and the same two refusals:
 *
 *   * it writes `event_translation.description`, which this game shows beside
 *     the poster;
 *   * it links every entry to the `screen` topic category, which is what keeps
 *     these events out of every other game — see
 *     20261009120000_screen_topic_category.sql and `randomEvents`;
 *   * it links every entry to `film` or `series` (`kind = 'other'`), which is
 *     not a pool and is only ever read to label the poster;
 *   * it refuses to run if any of those three categories is missing, rather
 *     than seeding 200 films that the date-guessing game would immediately
 *     start dealing.
 *
 * Images are a separate pass, as always: `image` rows need real provenance to
 * be inserted at all, and an event with no primary image is hidden from the
 * site — so this game deals only the entries whose posters have been attached.
 */

import { connect, describeTarget, loadEnvFile } from "./db.ts";
import { PARSED_LOCALES } from "./parse-events.ts";
import {
  SCREEN_CATEGORY_SLUG,
  SCREEN_DATA_PATH,
  SCREEN_FORMAT_SLUGS,
  parseScreenFile,
  type ParsedScreenEvent,
  type ScreenFormatSlug,
} from "./parse-screen.ts";

const CHUNK_SIZE = 100;

function parseArgs() {
  const args = process.argv.slice(2);
  const statusIndex = args.indexOf("--status");
  const status = statusIndex === -1 ? "published" : args[statusIndex + 1];

  if (status !== "published" && status !== "draft" && status !== "review") {
    throw new Error(`--status must be published, draft or review (got ${status})`);
  }

  const path =
    args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--status") ??
    SCREEN_DATA_PATH;

  return { status, path, dryRun: args.includes("--dry-run") };
}

async function main(): Promise<void> {
  loadEnvFile();
  const { status, path, dryRun } = parseArgs();

  const { events, failures, missingDescriptions, header } =
    parseScreenFile(path);

  console.log(`file     : ${path}`);
  console.log(`parsed   : ${events.length} entr(ies) of ${header.items}`);
  console.log(`rejected : ${failures.length} entr(ies)`);
  console.log(`category : ${SCREEN_CATEGORY_SLUG} (topic) + film/series (other)`);

  if (failures.length > 0) {
    console.log("\nrejected entries (not inserted):");
    for (const failure of failures.slice(0, 25)) {
      console.log(`  #${failure.index} ${failure.id || "(no id)"}: ${failure.reason}`);
    }
    if (failures.length > 25) {
      console.log(`  ... and ${failures.length - 25} more`);
    }
  }

  if (missingDescriptions.length > 0) {
    console.log(
      `\nmissing descriptions: ${missingDescriptions.length} (stored as null)`,
    );
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

    // All three categories up front, so a missing one fails the run before a
    // single event is written.
    const topicId = await categoryId(client, SCREEN_CATEGORY_SLUG, "topic");
    const formatIds = new Map<ScreenFormatSlug, string>();
    for (const slug of Object.values(SCREEN_FORMAT_SLUGS)) {
      formatIds.set(slug, await categoryId(client, slug, "other"));
    }

    let eventRows = 0;
    let translationRows = 0;
    let categoryRows = 0;

    for (let i = 0; i < events.length; i += CHUNK_SIZE) {
      const chunk = events.slice(i, i + CHUNK_SIZE);
      eventRows += await upsertEvents(client, chunk, status);
      translationRows += await upsertTranslations(client, chunk);
      categoryRows += await linkTopic(client, chunk, topicId);
      categoryRows += await linkFormats(client, chunk, formatIds);
      process.stdout.write(
        `\r  upserted ${Math.min(i + CHUNK_SIZE, events.length)}/${events.length} entries`,
      );
    }

    await client.query("commit");
    console.log(
      `\n\nEvents upserted      : ${eventRows}` +
        `\nTranslations upserted: ${translationRows}` +
        `\nCategory links       : ${categoryRows}`,
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

type PgClient = Awaited<ReturnType<typeof connect>>;

/** The id of one category, or a refusal naming what has to be migrated first. */
async function categoryId(
  client: PgClient,
  slug: string,
  kind: string,
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `select id from public.category where slug = $1 and kind = $2`,
    [slug, kind],
  );
  const id = rows[0]?.id;
  if (!id) {
    throw new Error(
      `public.category has no kind='${kind}' row with slug "${slug}".\n` +
        "Run `npm run db:migrate` first — without the topic link these events " +
        "would be dealt by the date-guessing game.",
    );
  }
  return id;
}

/**
 * `precision` is always 'year': the source carries no month or day, and the
 * column's CHECK requires month and day to be null at that precision.
 */
async function upsertEvents(
  client: PgClient,
  chunk: ParsedScreenEvent[],
  status: string,
): Promise<number> {
  const values: unknown[] = [];
  const tuples = chunk.map((event, i) => {
    const base = i * 3;
    values.push(event.slug, event.year, status);
    return `($${base + 1}, $${base + 2}, 'year'::public.date_precision, $${base + 3}::public.publication_status)`;
  });

  const { rowCount } = await client.query(
    `insert into public.event (slug, year, precision, status)
     values ${tuples.join(", ")}
     on conflict (slug) do update
       set year      = excluded.year,
           month     = null,
           day       = null,
           precision = excluded.precision,
           status    = excluded.status`,
    values,
  );

  return rowCount ?? 0;
}

async function upsertTranslations(
  client: PgClient,
  chunk: ParsedScreenEvent[],
): Promise<number> {
  const values: unknown[] = [];
  const tuples: string[] = [];

  for (const event of chunk) {
    for (const locale of PARSED_LOCALES) {
      const base = values.length;
      values.push(
        event.slug,
        locale,
        event.names[locale],
        event.descriptions[locale],
      );
      tuples.push(
        `((select id from public.event where slug = $${base + 1}), $${base + 2}, $${base + 3}, $${base + 4})`,
      );
    }
  }

  const { rowCount } = await client.query(
    `insert into public.event_translation (event_id, locale_code, name, description)
     values ${tuples.join(", ")}
     on conflict (event_id, locale_code) do update
       set name        = excluded.name,
           description = excluded.description`,
    values,
  );

  return rowCount ?? 0;
}

/** One link per entry, all to the same category: the pool. */
async function linkTopic(
  client: PgClient,
  chunk: ParsedScreenEvent[],
  topicId: string,
): Promise<number> {
  const values: unknown[] = [topicId];
  const tuples = chunk.map((event, i) => {
    values.push(event.slug);
    return `((select id from public.event where slug = $${i + 2}), $1)`;
  });

  const { rowCount } = await client.query(
    `insert into public.event_category (event_id, category_id)
     values ${tuples.join(", ")}
     on conflict (event_id, category_id) do nothing`,
    values,
  );

  return rowCount ?? 0;
}

/**
 * One link per entry, to whichever of `film` / `series` it is.
 *
 * An entry that has changed format between seeds has to lose the old link or
 * it would carry both, so the other format is deleted rather than left behind
 * — the only destructive statement in this script, and scoped to the two
 * category ids it owns.
 */
async function linkFormats(
  client: PgClient,
  chunk: ParsedScreenEvent[],
  formatIds: Map<ScreenFormatSlug, string>,
): Promise<number> {
  const values: unknown[] = [];
  const tuples = chunk.map((event, i) => {
    const base = i * 2;
    values.push(event.slug, formatIds.get(event.format));
    return `((select id from public.event where slug = $${base + 1}), $${base + 2}::uuid)`;
  });

  await client.query(
    `delete from public.event_category ec
     using (values ${tuples.join(", ")}) as v(event_id, keep)
     where ec.event_id = v.event_id
       and ec.category_id = any($${values.length + 1}::uuid[])
       and ec.category_id <> v.keep`,
    [...values, [...formatIds.values()]],
  );

  const { rowCount } = await client.query(
    `insert into public.event_category (event_id, category_id)
     values ${tuples.join(", ")}
     on conflict (event_id, category_id) do nothing`,
    values,
  );

  return rowCount ?? 0;
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
