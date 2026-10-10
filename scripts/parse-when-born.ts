/**
 * Parser for data/when-born.json — the "Born When?" game's own event set.
 *
 * Structurally identical to data/screen.json: an object with a header and an
 * array of entries, which is the one difference from data/football.json (a
 * bare array):
 *
 *   { "version": "1.0", "languages": ["tr","en","es","fr","de"], "count": 150,
 *     "items": [
 *       { "id": "tutankhamun", "type": "leader", "year": -1341,
 *         "title":       { "tr": …, "en": …, "es": …, "fr": …, "de": … },
 *         "description": { "tr": …, "en": …, "es": …, "fr": …, "de": … } },
 *       …
 *     ] }
 *
 * `count` is checked against the array's own length rather than trusted: a
 * truncated download is the one corruption a header like that can catch, and
 * it would otherwise show up as a game quietly short of fifty people.
 *
 * Same discipline as `parse-events.ts`, `parse-football.ts` and
 * `parse-screen.ts`: anything that does not validate is reported with the entry
 * it came from rather than coerced. A silently mis-dated entry would be taught
 * as fact by the game.
 *
 * **`year` is a birth year, and it is astronomical.** That is the one thing
 * this parser has to get right that `parse-screen.ts` never faced: fifteen of
 * these people were born BCE, so the file's negative years go straight into
 * `event.year` with no conversion (1 BCE = 0, 1000 BCE = -999; see
 * lib/historical-date.ts). The source writes -1341 for Tutankhamun and the
 * database stores -1341; nothing here branches on era.
 *
 * `type` is kept and mapped, as the film parser keeps `movie` / `series`:
 * fourteen fields become `kind = 'other'` categories (see the migration),
 * because a photograph of a person with no label is close to unanswerable —
 * lib/game/when-born.ts has the argument. Unlike football's sub-genres it is
 * not reported and dropped.
 *
 * `title` rather than `names` is only a key name; it is read into the same
 * `names` record so `seed-when-born.ts` writes translations exactly as
 * `seed-screen.ts` and `seed-football.ts` do.
 *
 * There is no month or day in this data, so every entry stores
 * `precision = 'year'`. That is honest rather than lossy: the pool's older
 * entries are dated "around 570 BCE" by the sources themselves.
 *
 * Run standalone to inspect the file without touching the database:
 *   npm run when-born:check
 */

import { readFileSync } from "node:fs";

import { PARSED_LOCALES, type ParsedLocale } from "./parse-events.ts";

export const WHEN_BORN_DATA_PATH = "data/when-born.json";

/** The slug of the topic category every entry in this file is filed under. */
export const WHEN_BORN_CATEGORY_SLUG = "when-born";

/**
 * The source's values for `type`, mapped to the category slug each one means.
 *
 * A map rather than a pass-through because three of the fourteen are not words
 * for a person: the file says `religious` (an adjective) and `business` (a
 * thing, not someone who does it). The stored slugs are read by people as well
 * as by code — they are what `PERSON_FIELDS` in lib/game/when-born.ts
 * validates against and what the five category translations hang off — so the
 * translation happens here, once, rather than being worked around at every
 * place the slug is printed.
 *
 * A `type` the file uses that is missing from this map is a rejected entry, not
 * a silently unlabelled one: a new field needs a category row (and so a
 * migration) before it can be seeded at all, and failing here is what says so.
 */
export const PERSON_FIELD_SLUGS = {
  leader: "leader",
  religious: "religious-figure",
  philosopher: "philosopher",
  explorer: "explorer",
  scientist: "scientist",
  inventor: "inventor",
  writer: "writer",
  artist: "artist",
  musician: "musician",
  actor: "actor",
  director: "director",
  athlete: "athlete",
  business: "entrepreneur",
  activist: "activist",
} as const;

export type PersonSourceType = keyof typeof PERSON_FIELD_SLUGS;
export type PersonFieldSlug = (typeof PERSON_FIELD_SLUGS)[PersonSourceType];

export interface ParsedWhenBornEvent {
  /** `id` from the file, with underscores turned into hyphens. */
  slug: string;
  /** Astronomical birth year; negative for the fifteen BCE entries. */
  year: number;
  /** The field category this entry is linked to. */
  field: PersonFieldSlug;
  names: Record<ParsedLocale, string>;
  /** Null for a locale whose description is missing or blank. */
  descriptions: Record<ParsedLocale, string | null>;
  /** Position in `items`, for error reporting. */
  index: number;
}

export interface WhenBornParseFailure {
  index: number;
  id: string;
  reason: string;
}

export interface WhenBornParseResult {
  events: ParsedWhenBornEvent[];
  failures: WhenBornParseFailure[];
  /** (event slug, locale) pairs with no description text. */
  missingDescriptions: { slug: string; locale: ParsedLocale }[];
  /** The header's own claims, reported so a mismatch is visible. */
  header: { version: string | null; count: number | null; items: number };
}

/** `public.event`'s own slug CHECK, so a refused slug is refused here first. */
const SLUG_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * The window this game's rails cover — `WHEN_BORN_MIN_BCE` in
 * lib/game/timeline.ts (as an astronomical year) and `CE_MAX_YEAR`'s present
 * year.
 *
 * Stricter than `era_slug_for_year()`'s range, and deliberately so: an entry
 * outside this span would be filed under a year no rail can mark, so the guess
 * would be graded against an answer the player had no way to reach.
 * `fractionAtYear` clamps such a year to a rail's edge, which would put the
 * answer marker under the end of the line and make the round unwinnable rather
 * than hard. For a dataset of birth years that can only mean a typo — a missing
 * minus sign, or a four-digit year with a digit too many.
 *
 * The oldest entry in the file is Tutankhamun at 1341 BCE (astronomical -1341)
 * and the newest is 1997.
 */
const MIN_YEAR = -1499;
const MAX_YEAR = 2026;

export function parseWhenBornFile(
  path: string = WHEN_BORN_DATA_PATH,
): WhenBornParseResult {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, ""));

  if (!isRecord(raw) || !Array.isArray(raw.items)) {
    throw new Error(`${path}: expected an object with an "items" array`);
  }

  const items = raw.items;
  const header = {
    version: readString(raw, "version"),
    count: typeof raw.count === "number" ? raw.count : null,
    items: items.length,
  };

  const events: ParsedWhenBornEvent[] = [];
  const failures: WhenBornParseFailure[] = [];
  const missingDescriptions: { slug: string; locale: ParsedLocale }[] = [];
  const seen = new Set<string>();

  for (const [index, entry] of items.entries()) {
    const id = readString(entry, "id") ?? "";
    const fail = (reason: string) => failures.push({ index, id, reason });

    if (!isRecord(entry)) {
      fail("not an object");
      continue;
    }
    if (id === "") {
      fail("missing id");
      continue;
    }

    const slug = id.replace(/_/g, "-").toLowerCase();
    if (!SLUG_FORMAT.test(slug)) {
      fail(`id does not yield a valid slug (got "${slug}")`);
      continue;
    }
    if (seen.has(slug)) {
      fail(`duplicate id "${id}"`);
      continue;
    }

    const type = entry.type;
    if (typeof type !== "string" || !(type in PERSON_FIELD_SLUGS)) {
      fail(
        `type must be one of ${Object.keys(PERSON_FIELD_SLUGS).join(", ")} ` +
          `(got ${JSON.stringify(type)})`,
      );
      continue;
    }

    const year = entry.year;
    if (typeof year !== "number" || !Number.isInteger(year)) {
      fail(`year is not an integer (got ${JSON.stringify(year)})`);
      continue;
    }
    if (year < MIN_YEAR || year > MAX_YEAR) {
      fail(
        `year ${year} is outside the rails this game covers (${MIN_YEAR}..${MAX_YEAR})`,
      );
      continue;
    }

    const names = {} as Record<ParsedLocale, string>;
    let namesOk = true;
    for (const locale of PARSED_LOCALES) {
      const name = readString(entry.title, locale);
      if (name === null) {
        fail(`missing ${locale} title`);
        namesOk = false;
        break;
      }
      names[locale] = name;
    }
    if (!namesOk) continue;

    const descriptions = {} as Record<ParsedLocale, string | null>;
    for (const locale of PARSED_LOCALES) {
      const description = readString(entry.description, locale);
      descriptions[locale] = description;
      // Not a failure: the games fall back to a placeholder for a missing
      // description, and an entry with a name and a year is still playable.
      if (description === null) missingDescriptions.push({ slug, locale });
    }

    seen.add(slug);
    events.push({
      slug,
      year,
      field: PERSON_FIELD_SLUGS[type as PersonSourceType],
      names,
      descriptions,
      index,
    });
  }

  return { events, failures, missingDescriptions, header };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A non-blank string at `key`, trimmed; null if absent, blank or not a string. */
function readString(source: unknown, key: string): string | null {
  if (!isRecord(source)) return null;
  const value = source[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
