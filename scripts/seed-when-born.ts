/**
 * Parses data/when-born.json and upserts it into the database.
 *
 *   npm run db:seed:when-born                       insert as published
 *   npm run db:seed:when-born -- --status draft     insert hidden from the public
 *   npm run db:seed:when-born -- --dry-run          parse and report only
 *   npm run db:seed:when-born -- path/to/file.json
 *
 * Idempotent: keyed on event.slug, so re-running updates in place rather than
 * duplicating. It is `seed-screen.ts` with one difference — fourteen field
 * categories where that script has two formats — and the same refusals:
 *
 *   * it writes `event_translation.description`, which this game shows beside
 *     the photograph;
 *   * it links every entry to the `when-born` topic category, which is what
 *     keeps these people out of every other game — see
 *     20261010140000_when_born_topic_category.sql and `randomEvents`;
 *   * it links every entry to its field (`kind = 'other'`), which is not a pool
 *     and is only ever read to label the picture;
 *   * it refuses to run if any of those fifteen categories is missing, rather
 *     than seeding 150 people that the date-guessing game would immediately
 *     start dealing — and grading against a *birth* year while asking "when did
 *     this happen".
 *
 * Images are a separate pass, as always: `image` rows need real provenance to
 * be inserted at all, and an event with no primary image is hidden from the
 * site — so this game deals only the people whose photographs have been
 * attached.
 */

import { connect, describeTarget, loadEnvFile } from "./db.ts";
import { PARSED_LOCALES } from "./parse-events.ts";
import {
  WHEN_BORN_CATEGORY_SLUG,
  WHEN_BORN_DATA_PATH,
  PERSON_FIELD_SLUGS,
  parseWhenBornFile,
  type ParsedWhenBornEvent,
  type PersonFieldSlug,
} from "./parse-when-born.ts";

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
    WHEN_BORN_DATA_PATH;

  return { status, path, dryRun: args.includes("--dry-run") };
}

async function main(): Promise<void> {
  loadEnvFile();
  const { status, path, dryRun } = parseArgs();

  const { events, failures, missingDescriptions, header } =
    parseWhenBornFile(path);

  console.log(`file     : ${path}`);
  console.log(`parsed   : ${events.length} entr(ies) of ${header.items}`);
  console.log(`rejected : ${failures.length} entr(ies)`);
  console.log(
    `category : ${WHEN_BORN_CATEGORY_SLUG} (topic) + ${
      new Set(Object.values(PERSON_FIELD_SLUGS)).size
    } fields (other)`,
  );

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

    // Every category up front, so a missing one fails the run before a single
    // event is written.
    const topicId = await categoryId(client, WHEN_BORN_CATEGORY_SLUG, "topic");
    const fieldIds = new Map<PersonFieldSlug, string>();
    for (const slug of new Set(Object.values(PERSON_FIELD_SLUGS))) {
      fieldIds.set(slug, await categoryId(client, slug, "other"));
    }

    let eventRows = 0;
    let translationRows = 0;
    let categoryRows = 0;

    for (let i = 0; i < events.length; i += CHUNK_SIZE) {
      const chunk = events.slice(i, i + CHUNK_SIZE);
      eventRows += await upsertEvents(client, chunk, status);
      translationRows += await upsertTranslations(client, chunk);
      categoryRows += await linkTopic(client, chunk, topicId);
      categoryRows += await linkFields(client, chunk, fieldIds);
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
 * column's CHECK requires month and day to be null at that precision. For the
 * older half of this pool that is the honest precision as well as the available
 * one — the sources date Pythagoras to "around 570 BCE".
 *
 * The year goes in as it is read. It is astronomical in the file and
 * astronomical in the column, so the fifteen BCE entries need no conversion;
 * `event.sort_key` and the era link are both derived by the database.
 */
async function upsertEvents(
  client: PgClient,
  chunk: ParsedWhenBornEvent[],
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
  chunk: ParsedWhenBornEvent[],
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
  chunk: ParsedWhenBornEvent[],
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
 * One link per entry, to whichever of the fourteen fields it is.
 *
 * An entry that has changed field between seeds has to lose the old link or it
 * would carry both and `personFieldOf` would print whichever came back first,
 * so the others are deleted rather than left behind — the only destructive
 * statement in this script, and scoped to the fourteen category ids it owns.
 * The `<> v.keep` is what makes it safe to run against a pool that has not
 * changed: the link being kept is never in the delete's range.
 */
async function linkFields(
  client: PgClient,
  chunk: ParsedWhenBornEvent[],
  fieldIds: Map<PersonFieldSlug, string>,
): Promise<number> {
  const values: unknown[] = [];
  const tuples = chunk.map((event, i) => {
    const base = i * 2;
    values.push(event.slug, fieldIds.get(event.field));
    return `((select id from public.event where slug = $${base + 1}), $${base + 2}::uuid)`;
  });

  await client.query(
    `delete from public.event_category ec
     using (values ${tuples.join(", ")}) as v(event_id, keep)
     where ec.event_id = v.event_id
       and ec.category_id = any($${values.length + 1}::uuid[])
       and ec.category_id <> v.keep`,
    [...values, [...fieldIds.values()]],
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
