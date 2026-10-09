/**
 * Parser for data/football.json — the football game's own event set.
 *
 * The file is a JSON array, one object per event:
 *
 *   { "id": "miracle_of_bern", "category": "tarihi_basari", "year": 1954,
 *     "names":       { "tr": …, "en": …, "de": …, "fr": …, "es": … },
 *     "description": { "tr": …, "en": …, "de": …, "fr": …, "es": … } }
 *
 * Same discipline as `parse-events.ts`: anything that does not validate is
 * reported with the entry it came from rather than coerced, because a silently
 * mis-dated event would be taught as fact by the game.
 *
 * Two fields of the source are deliberately not carried through:
 *
 *   * `category` holds a Turkish sub-genre (`kulup_kurulusu`, `trajedi`, …).
 *     Every one of these events gets the single `football` topic category
 *     instead — that is what decides which game may deal it. The sub-genres
 *     are reported by `npm run football:check` so they are not lost; turning
 *     them into their own `kind = 'topic'` rows later is an insert, not a
 *     migration.
 *   * there is no month or day in this data, so every event stores
 *     `precision = 'year'`.
 *
 * Run standalone to inspect the file without touching the database:
 *   npm run football:check
 */

import { readFileSync } from "node:fs";

import { PARSED_LOCALES, type ParsedLocale } from "./parse-events.ts";

export const FOOTBALL_DATA_PATH = "data/football.json";

/** The slug of the topic category every event in this file is filed under. */
export const FOOTBALL_CATEGORY_SLUG = "football";

export interface ParsedFootballEvent {
  /** `id` from the file, with underscores turned into hyphens. */
  slug: string;
  /** Astronomical year; this dataset is entirely within the common era. */
  year: number;
  names: Record<ParsedLocale, string>;
  /** Null for a locale whose description is missing or blank. */
  descriptions: Record<ParsedLocale, string | null>;
  /** The source's own sub-genre. Reported, never stored — see above. */
  sourceCategory: string | null;
  /** Position in the array, for error reporting. */
  index: number;
}

export interface FootballParseFailure {
  index: number;
  id: string;
  reason: string;
}

export interface FootballParseResult {
  events: ParsedFootballEvent[];
  failures: FootballParseFailure[];
  /** (event slug, locale) pairs with no description text. */
  missingDescriptions: { slug: string; locale: ParsedLocale }[];
}

/** `public.event`'s own slug CHECK, so a refused slug is refused here first. */
const SLUG_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * The common era, as `era_slug_for_year()` draws it. A football event outside
 * it would be filed under `bce/` or `future/` in R2, which for this dataset
 * can only mean a typo in the year.
 */
const MIN_YEAR = 1;
const MAX_YEAR = 2026;

export function parseFootballFile(
  path: string = FOOTBALL_DATA_PATH,
): FootballParseResult {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, ""));

  if (!Array.isArray(raw)) {
    throw new Error(`${path}: expected a JSON array of events`);
  }

  const events: ParsedFootballEvent[] = [];
  const failures: FootballParseFailure[] = [];
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
      fail(`year ${year} is outside the common era (${MIN_YEAR}..${MAX_YEAR})`);
      continue;
    }

    const names = {} as Record<ParsedLocale, string>;
    let namesOk = true;
    for (const locale of PARSED_LOCALES) {
      const name = readString(entry.names, locale);
      if (name === null) {
        fail(`missing ${locale} name`);
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
    events.push({
      slug,
      year,
      names,
      descriptions,
      sourceCategory: readString(entry, "category"),
      index,
    });
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
