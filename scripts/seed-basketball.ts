/**
 * Parses data/basketball.json and upserts it into the database.
 *
 *   npm run db:seed:basketball                       insert as published
 *   npm run db:seed:basketball -- --status draft     insert hidden from the public
 *   npm run db:seed:basketball -- --dry-run          parse and report only
 *   npm run db:seed:basketball -- path/to/file.json
 *
 * Idempotent: keyed on event.slug, so re-running updates in place rather than
 * duplicating. It is `seed-football.ts` over a different file — same three
 * things that seed does and `db:seed:events` does not:
 *
 *   * it writes `event_translation.description`, which the game shows beside
 *     the photograph (the 497 historical events have none, which is why the
 *     date-guessing screen still shows placeholder prose);
 *   * it links every event to the `basketball` topic category, which is what
 *     keeps these events out of the other games — see
 *     20261010160000_basketball_topic_category.sql and `randomEvents`;
 *   * it refuses to run if that category is missing, rather than seeding
 *     events that would immediately be dealt by the date-guessing game.
 *
 * Images are a separate pass, as always: `image` rows need real provenance to
 * be inserted at all, and an event with no primary image is hidden from the
 * site — so the basketball game has nothing to deal until its photographs are
 * attached (`npm run images:attach`, keys `ce/<slug>.<ext>`).
 */

import { connect, describeTarget, loadEnvFile } from "./db.ts";
import {
  BASKETBALL_CATEGORY_SLUG,
  BASKETBALL_DATA_PATH,
  parseBasketballFile,
  type ParsedBasketballEvent,
} from "./parse-basketball.ts";
import { PARSED_LOCALES } from "./parse-events.ts";

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
    BASKETBALL_DATA_PATH;

  return { status, path, dryRun: args.includes("--dry-run") };
}

async function main(): Promise<void> {
  loadEnvFile();
  const { status, path, dryRun } = parseArgs();

  const { events, failures, missingDescriptions } = parseBasketballFile(path);

  console.log(`file     : ${path}`);
  console.log(`parsed   : ${events.length} event(s)`);
  console.log(`rejected : ${failures.length} entr(ies)`);
  console.log(`category : ${BASKETBALL_CATEGORY_SLUG} (topic)`);

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

    const { rows } = await client.query<{ id: string }>(
      `select id from public.category where slug = $1 and kind = 'topic'`,
      [BASKETBALL_CATEGORY_SLUG],
    );
    const categoryId = rows[0]?.id;
    if (!categoryId) {
      throw new Error(
        `public.category has no kind='topic' row with slug "${BASKETBALL_CATEGORY_SLUG}".\n` +
          "Run `npm run db:migrate` first — without that link these events " +
          "would be dealt by the date-guessing game.",
      );
    }

    let eventRows = 0;
    let translationRows = 0;
    let categoryRows = 0;

    for (let i = 0; i < events.length; i += CHUNK_SIZE) {
      const chunk = events.slice(i, i + CHUNK_SIZE);
      eventRows += await upsertEvents(client, chunk, status);
      translationRows += await upsertTranslations(client, chunk);
      categoryRows += await linkCategory(client, chunk, categoryId);
      process.stdout.write(
        `\r  upserted ${Math.min(i + CHUNK_SIZE, events.length)}/${events.length} events`,
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

/**
 * `precision` is always 'year': the source carries no month or day, and the
 * column's CHECK requires month and day to be null at that precision.
 */
async function upsertEvents(
  client: PgClient,
  chunk: ParsedBasketballEvent[],
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
  chunk: ParsedBasketballEvent[],
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

async function linkCategory(
  client: PgClient,
  chunk: ParsedBasketballEvent[],
  categoryId: string,
): Promise<number> {
  const values: unknown[] = [categoryId];
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

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
