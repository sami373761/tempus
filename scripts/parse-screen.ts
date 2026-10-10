/**
 * Parser for data/screen.json — the film & television game's own event set.
 *
 * The file is an object with a header and an array of entries, which is the
 * one structural difference from data/football.json (a bare array):
 *
 *   { "version": "1.0", "languages": ["tr","en","es","fr","de"], "count": 200,
 *     "items": [
 *       { "id": "the-shawshank-redemption", "type": "movie", "year": 1994,
 *         "title":       { "tr": …, "en": …, "es": …, "fr": …, "de": … },
 *         "description": { "tr": …, "en": …, "es": …, "fr": …, "de": … } },
 *       …
 *     ] }
 *
 * `count` is checked against the array's own length rather than trusted: a
 * truncated download is the one corruption a header like that can catch, and
 * it would otherwise show up as a game quietly short of a hundred films.
 *
 * Same discipline as `parse-events.ts` and `parse-football.ts`: anything that
 * does not validate is reported with the entry it came from rather than
 * coerced. A silently mis-dated entry would be taught as fact by the game.
 *
 * Two things this parser carries that the football one does not:
 *
 *   * `type` is kept. `movie` and `series` become the `film` / `series`
 *     categories (`kind = 'other'`, see the migration), because the stored
 *     year means a release for one and a premiere for the other — the game
 *     prints which on the poster, so it is not a sub-genre to be reported and
 *     dropped the way football's were.
 *   * `title` rather than `names`, which is only a key name; it is read into
 *     the same `names` record so `seed-screen.ts` and `seed-football.ts` write
 *     translations the same way.
 *
 * There is no month or day in this data, so every entry stores
 * `precision = 'year'`.
 *
 * Run standalone to inspect the file without touching the database:
 *   npm run screen:check
 */

import { readFileSync } from "node:fs";

import { PARSED_LOCALES, type ParsedLocale } from "./parse-events.ts";

export const SCREEN_DATA_PATH = "data/screen.json";

/** The slug of the topic category every entry in this file is filed under. */
export const SCREEN_CATEGORY_SLUG = "screen";

/**
 * The source's two values for `type`, mapped to the category slug each one
 * means. The source word and the stored slug differ for films (`movie` ->
 * `film`), which is why this is a map rather than a pass-through: `film` is
 * what the category is called in all five languages, and `movie` is what the
 * file says.
 */
export const SCREEN_FORMAT_SLUGS = {
  movie: "film",
  series: "series",
} as const;

export type ScreenSourceType = keyof typeof SCREEN_FORMAT_SLUGS;
export type ScreenFormatSlug = (typeof SCREEN_FORMAT_SLUGS)[ScreenSourceType];

export interface ParsedScreenEvent {
  /** `id` from the file, with underscores turned into hyphens. */
  slug: string;
  /** Astronomical year; this dataset is entirely within the common era. */
  year: number;
  /** The format category this entry is linked to: `film` or `series`. */
  format: ScreenFormatSlug;
  names: Record<ParsedLocale, string>;
  /** Null for a locale whose description is missing or blank. */
  descriptions: Record<ParsedLocale, string | null>;
  /** Position in `items`, for error reporting. */
  index: number;
}

export interface ScreenParseFailure {
  index: number;
  id: string;
  reason: string;
}

export interface ScreenParseResult {
  events: ParsedScreenEvent[];
  failures: ScreenParseFailure[];
  /** (event slug, locale) pairs with no description text. */
  missingDescriptions: { slug: string; locale: ParsedLocale }[];
  /** The header's own claims, reported so a mismatch is visible. */
  header: { version: string | null; count: number | null; items: number };
}

/** `public.event`'s own slug CHECK, so a refused slug is refused here first. */
const SLUG_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * The window this game's rail covers — `SCREEN_MIN_YEAR` in lib/game/timeline.ts
 * and `CE_MAX_YEAR`'s present year.
 *
 * Stricter than `era_slug_for_year()`'s common era, and deliberately so: an
 * entry outside this range would be filed under a year the rail cannot mark,
 * so the guess would be graded against an answer the player had no way to
 * reach. For a dataset of films that can only mean a typo. The oldest entry in
 * the file is 1931.
 */
const MIN_YEAR = 1900;
const MAX_YEAR = 2026;

export function parseScreenFile(
  path: string = SCREEN_DATA_PATH,
): ScreenParseResult {
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

  const events: ParsedScreenEvent[] = [];
  const failures: ScreenParseFailure[] = [];
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
    if (typeof type !== "string" || !(type in SCREEN_FORMAT_SLUGS)) {
      fail(
        `type must be one of ${Object.keys(SCREEN_FORMAT_SLUGS).join(", ")} ` +
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
      fail(`year ${year} is outside the rail this game covers (${MIN_YEAR}..${MAX_YEAR})`);
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
      // description, and an entry with a title and a year is still playable.
      if (description === null) missingDescriptions.push({ slug, locale });
    }

    seen.add(slug);
    events.push({
      slug,
      year,
      format: SCREEN_FORMAT_SLUGS[type as ScreenSourceType],
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
