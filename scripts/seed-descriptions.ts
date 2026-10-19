/**
 * Fills in `event_translation.description` from data/event-descriptions.json.
 *
 *   npm run db:seed:descriptions                  write
 *   npm run db:seed:descriptions -- --dry-run     validate and report only
 *   npm run db:seed:descriptions -- path/to.json
 *
 * Separate from `db:seed:events` on purpose. That seeder's input is the
 * five-language source dataset, which carries names and dates and no prose, and
 * re-running it reintroduces the three known duplicate lines; this one touches
 * exactly one column and cannot create, delete or re-date an event. It is an
 * UPDATE rather than an upsert for the same reason — `event_translation.name`
 * is NOT NULL, so an insert here would have to invent a name, and a slug with
 * no translation row is a fault to report rather than a row to conjure.
 *
 * Descriptions are shown beside the photograph once a guess is locked in
 * (`NoteFlank` in components/round-flank.tsx), which is why every entry must
 * carry all five locales: a player on a language with a gap would read the
 * Lorem Ipsum placeholder in the middle of an otherwise finished game. The file
 * is validated in full before anything is written, so a partial batch cannot
 * leave the dataset half translated.
 */

import { connect, describeTarget, loadEnvFile } from "./db.ts";
import { PARSED_LOCALES } from "./parse-events.ts";

const DEFAULT_PATH = "data/event-descriptions.json";
const CHUNK_SIZE = 50;

interface DescriptionEntry {
  slug: string;
  description: Record<string, string>;
}

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    path: args.find((a) => !a.startsWith("--")) ?? DEFAULT_PATH,
    dryRun: args.includes("--dry-run"),
  };
}

/**
 * Reads the file and refuses anything that would write a partial translation.
 * Every failure is collected rather than thrown on the first one, so one run
 * reports every problem in the file instead of one per attempt.
 */
async function readEntries(path: string): Promise<DescriptionEntry[]> {
  const raw: unknown = JSON.parse(
    await (await import("node:fs/promises")).readFile(path, "utf8"),
  );
  if (!Array.isArray(raw)) throw new Error(`${path} must hold a JSON array.`);

  const problems: string[] = [];
  const seen = new Set<string>();
  const entries: DescriptionEntry[] = [];

  raw.forEach((item, index) => {
    const where = `entry #${index + 1}`;
    if (typeof item !== "object" || item === null) {
      problems.push(`${where}: not an object`);
      return;
    }
    const { slug, description } = item as Partial<DescriptionEntry>;

    if (typeof slug !== "string" || slug === "") {
      problems.push(`${where}: missing slug`);
      return;
    }
    if (seen.has(slug)) problems.push(`${slug}: appears more than once`);
    seen.add(slug);

    if (typeof description !== "object" || description === null) {
      problems.push(`${slug}: missing description object`);
      return;
    }
    for (const locale of PARSED_LOCALES) {
      const text = description[locale];
      if (typeof text !== "string" || text.trim() === "") {
        problems.push(`${slug}: ${locale} is missing or blank`);
      }
    }
    const extra = Object.keys(description).filter(
      (locale) => !(PARSED_LOCALES as readonly string[]).includes(locale),
    );
    if (extra.length > 0) {
      problems.push(`${slug}: unknown locale(s) ${extra.join(", ")}`);
    }

    entries.push({ slug, description: description as Record<string, string> });
  });

  if (problems.length > 0) {
    throw new Error(
      `${problems.length} problem(s) in ${path}:\n  ` +
        problems.slice(0, 25).join("\n  ") +
        (problems.length > 25 ? `\n  ... and ${problems.length - 25} more` : ""),
    );
  }

  return entries;
}

async function main(): Promise<void> {
  loadEnvFile();
  const { path, dryRun } = parseArgs();

  const entries = await readEntries(path);
  const lengths = entries.flatMap((e) =>
    PARSED_LOCALES.map((l) => e.description[l]!.length),
  );

  console.log(`file     : ${path}`);
  console.log(`entries  : ${entries.length} event(s)`);
  console.log(`locales  : ${PARSED_LOCALES.join(", ")}`);
  console.log(
    `length   : ${Math.min(...lengths)}-${Math.max(...lengths)} characters, ` +
      `${Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)} average`,
  );

  const client = await connect();
  try {
    // Checked before any write: a slug the dataset does not have is a typo,
    // and silently skipping it would leave a description nobody can find.
    const { rows: known } = await client.query<{ slug: string }>(
      `select slug from public.event where slug = any($1::text[])`,
      [entries.map((e) => e.slug)],
    );
    const knownSlugs = new Set(known.map((r) => r.slug));
    const unknown = entries.filter((e) => !knownSlugs.has(e.slug));

    if (unknown.length > 0) {
      throw new Error(
        `${unknown.length} slug(s) are not in public.event:\n  ` +
          unknown
            .slice(0, 25)
            .map((e) => e.slug)
            .join("\n  "),
      );
    }

    console.log(`target   : ${describeTarget()}`);

    if (dryRun) {
      console.log("\nDry run — nothing was written.");
      return;
    }

    await client.query("begin");

    let updated = 0;
    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
      const chunk = entries.slice(i, i + CHUNK_SIZE);
      updated += await updateDescriptions(client, chunk);
      process.stdout.write(
        `\r  updated ${Math.min(i + CHUNK_SIZE, entries.length)}/${entries.length} events`,
      );
    }

    await client.query("commit");

    const expected = entries.length * PARSED_LOCALES.length;
    console.log(`\n\nTranslation rows updated: ${updated} of ${expected}`);
    if (updated < expected) {
      // A missing (event, locale) row means the event was never seeded in that
      // language, which this script must not paper over by inventing a name.
      console.log(
        "Fewer rows than expected — some events are missing a translation " +
          "row in one or more locales. Run `npm run db:seed:events` first.",
      );
      process.exitCode = 1;
    }
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

type PgClient = Awaited<ReturnType<typeof connect>>;

/**
 * One statement per chunk, joining the incoming rows to the table by slug and
 * locale. `where description is distinct from` keeps `updated` an honest count
 * of rows that actually changed, so re-running reports zero rather than 1,600.
 */
async function updateDescriptions(
  client: PgClient,
  chunk: DescriptionEntry[],
): Promise<number> {
  const values: unknown[] = [];
  const tuples: string[] = [];

  for (const entry of chunk) {
    for (const locale of PARSED_LOCALES) {
      const base = values.length;
      values.push(entry.slug, locale, entry.description[locale]);
      tuples.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
    }
  }

  const { rowCount } = await client.query(
    `update public.event_translation t
        set description = incoming.description
       from (values ${tuples.join(", ")}) as incoming (slug, locale_code, description)
       join public.event e on e.slug = incoming.slug
      where t.event_id = e.id
        and t.locale_code = incoming.locale_code
        and t.description is distinct from incoming.description
        and e.admin_edited_at is null`,
    values,
  );

  return rowCount ?? 0;
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
