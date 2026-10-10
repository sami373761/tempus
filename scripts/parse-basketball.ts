/**
 * Parser for data/basketball.json — the basketball game's own event set.
 *
 * The file is a bare JSON array, one object per event, like data/football.json
 * and unlike data/screen.json (which carries a header):
 *
 *   { "id": "wilt-100-points", "year": 1962,
 *     "title":       { "en": …, "tr": …, "de": …, "fr": …, "es": … },
 *     "description": { "en": …, "tr": …, "de": …, "fr": …, "es": … } }
 *
 * The source arrived as four separate arrays (30 + 30 + 25 + 20) in one file;
 * they are one array here because nothing downstream distinguishes them — the
 * split was how the data was written, not a fact about the events.
 *
 * Same discipline as `parse-events.ts` and `parse-football.ts`: anything that
 * does not validate is reported with the entry it came from rather than
 * coerced, because a silently mis-dated event would be taught as fact by the
 * game.
 *
 * Two differences from the football parser, both of them key names rather than
 * rules:
 *
 *   * `title` rather than `names`, read into the same `names` record so
 *     `seed-basketball.ts` writes translations exactly as the other seeds do;
 *   * there is no `category` field, so there is no sub-genre to report and
 *     drop. Every entry gets the single `basketball` topic category, which is
 *     what decides which game may deal it.
 *
 * There is no month or day in this data, so every event stores
 * `precision = 'year'`.
 *
 * Run standalone to inspect the file without touching the database:
 *   npm run basketball:check
 */

import { readFileSync } from "node:fs";

import { PARSED_LOCALES, type ParsedLocale } from "./parse-events.ts";

export const BASKETBALL_DATA_PATH = "data/basketball.json";

/** The slug of the topic category every event in this file is filed under. */
export const BASKETBALL_CATEGORY_SLUG = "basketball";

export interface ParsedBasketballEvent {
  /** `id` from the file, with underscores turned into hyphens. */
  slug: string;
  /** Astronomical year; this dataset is entirely within the common era. */
  year: number;
  names: Record<ParsedLocale, string>;
  /** Null for a locale whose description is missing or blank. */
  descriptions: Record<ParsedLocale, string | null>;
  /** Position in the array, for error reporting. */
  index: number;
}

export interface BasketballParseFailure {
  index: number;
  id: string;
  reason: string;
}

export interface BasketballParseResult {
  events: ParsedBasketballEvent[];
  failures: BasketballParseFailure[];
  /** (event slug, locale) pairs with no description text. */
  missingDescriptions: { slug: string; locale: ParsedLocale }[];
}

/** `public.event`'s own slug CHECK, so a refused slug is refused here first. */
const SLUG_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * The window this game's rail covers — `BASKETBALL_MIN_YEAR` in
 * lib/game/timeline.ts and `CE_MAX_YEAR`'s present year.
 *
 * Stricter than `era_slug_for_year()`'s common era, and deliberately so: the
 * screen parser's reasoning applies unchanged here. An entry outside this
 * range would be filed under a year the rail cannot mark, so the guess would
 * be graded against an answer the player had no way to reach. For a dataset
 * that starts with the invention of the sport in 1891, that can only mean a
 * typo.
 */
const MIN_YEAR = 1875;
const MAX_YEAR = 2026;

export function parseBasketballFile(
  path: string = BASKETBALL_DATA_PATH,
): BasketballParseResult {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, ""));

  if (!Array.isArray(raw)) {
    throw new Error(`${path}: expected a JSON array of events`);
  }

  const events: ParsedBasketballEvent[] = [];
  const failures: BasketballParseFailure[] = [];
  const missingDescriptions: { slug: string; locale: ParsedLocale }[] = [];
  const seen = new Set<string>();

  for (const [index, entry] of raw.entries()) {
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

    const year = entry.year;
    if (typeof year !== "number" || !Number.isInteger(year)) {
      fail(`year is not an integer (got ${JSON.stringify(year)})`);
      continue;
    }
    if (year < MIN_YEAR || year > MAX_YEAR) {
      fail(`year ${year} is outside this game's rail (${MIN_YEAR}..${MAX_YEAR})`);
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
      // description, and an event with a name and a date is still playable.
      if (description === null) missingDescriptions.push({ slug, locale });
    }

    seen.add(slug);
    events.push({ slug, year, names, descriptions, index });
  }

  return { events, failures, missingDescriptions };
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
