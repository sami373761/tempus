/**
 * Parser for data/events.txt.
 *
 * One event per line, six colon-separated fields:
 *
 *   TR Name : EN Name : DE Name : FR Name : ES Name : Date
 *
 * Blank lines and lines starting with `#` are ignored. Anything that does not
 * parse cleanly is reported rather than guessed at — a silently mis-dated event
 * is worse than a skipped one, because the game would teach it as fact.
 *
 * Run standalone to inspect a file without touching the database:
 *   npm run events:check
 */

import { readFileSync } from "node:fs";

import type { DatePrecision } from "../lib/db/types.ts";

export const PARSED_LOCALES = ["tr", "en", "de", "fr", "es"] as const;
export type ParsedLocale = (typeof PARSED_LOCALES)[number];

export interface ParsedDate {
  /** Astronomical year: 1 BCE = 0, 1000 BCE = -999, 4.54e9 BCE = -4539999999. */
  year: number;
  month: number | null;
  day: number | null;
  precision: DatePrecision;
}

export interface ParsedEvent extends ParsedDate {
  slug: string;
  names: Record<ParsedLocale, string>;
  /** Source line number, for error reporting. */
  line: number;
  rawDate: string;
}

export interface ParseFailure {
  line: number;
  raw: string;
  reason: string;
}

export interface ParseResult {
  events: ParsedEvent[];
  failures: ParseFailure[];
  /** Lines ignored on purpose (blank or comment). */
  ignored: number;
}

// ---------------------------------------------------------------------------
// Date parsing
// ---------------------------------------------------------------------------

const BCE_PREFIX = /^(?:M\.?\s*Ö\.?|MO|B\.?C\.?E\.?|B\.?C\.?)\s+/i;
const CE_PREFIX = /^(?:M\.?\s*S\.?|C\.?E\.?|A\.?D\.?)\s+/i;

const CENTURY = /^(\d{1,3})\s*\.?\s*(?:yüzyıl|yuzyil|yy|century)$/i;
const MILLENNIUM = /^(\d{1,3})\s*\.?\s*(?:bin\s*yıl|binyıl|bin\s*yil|binyil|millennium)$/i;
const ISO_DATE = /^(\d{1,10})-(\d{1,2})-(\d{1,2})$/;
const PLAIN_YEAR = /^\d[\d.,\s' ]*$/;

const MONTH_NAMES: Record<string, number> = {
  ocak: 1, şubat: 2, subat: 2, mart: 3, nisan: 4, mayıs: 5, mayis: 5,
  haziran: 6, temmuz: 7, ağustos: 8, agustos: 8, eylül: 9, eylul: 9,
  ekim: 10, kasım: 11, kasim: 11, aralık: 12, aralik: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9,
  oct: 10, nov: 11, dec: 12,
};

const DAY_MONTH_YEAR = /^(\d{1,2})\s+([^\s\d]+)\s+(\d{1,10})$/;
const MONTH_YEAR = /^([^\s\d]+)\s+(\d{1,10})$/;

/** Historical year + era -> astronomical year. BCE n becomes 1 - n. */
function toAstronomical(year: number, isBce: boolean): number {
  return isBce ? 1 - year : year;
}

/**
 * Strips digit-group separators. Turkish writes 4.540.000.000 for 4.54 billion,
 * so dots here are thousands separators, never a decimal point. Century and
 * millennium forms are matched *before* this runs, because their dot is an
 * ordinal marker ("5. yüzyıl") rather than a separator.
 */
function parseGroupedInteger(text: string): number | null {
  const digits = text.replace(/[.,\s' ]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : null;
}

/** Midpoint of century n, in historical years: 5th c. -> 450, 14th c. -> 1350. */
function centuryMidpoint(n: number): number {
  return n * 100 - 50;
}

/** Midpoint of millennium n: 3rd millennium -> 2500. */
function millenniumMidpoint(n: number): number {
  return n * 1000 - 500;
}

export function parseDateExpression(raw: string): ParsedDate | { error: string } {
  const normalized = raw
    .replace(/ /g, " ")
    .replace(/[–—]/g, "-")
    .trim()
    .replace(/\s+/g, " ");

  if (normalized === "") return { error: "empty date field" };

  let rest = normalized;
  let isBce = false;

  if (BCE_PREFIX.test(rest)) {
    isBce = true;
    rest = rest.replace(BCE_PREFIX, "").trim();
  } else if (CE_PREFIX.test(rest)) {
    rest = rest.replace(CE_PREFIX, "").trim();
  }

  // "yaklaşık" / "circa" qualifiers carry no extra information for us: the
  // precision enum already records how exact the value is.
  rest = rest.replace(/^(?:yaklaşık|yaklasik|circa|c\.|ca\.|~|yak\.)\s*/i, "").trim();

  if (rest === "") return { error: "no date left after the era prefix" };

  const century = CENTURY.exec(rest);
  if (century?.[1]) {
    const n = Number(century[1]);
    if (n < 1) return { error: `century must be 1 or greater: "${raw}"` };
    return {
      year: toAstronomical(centuryMidpoint(n), isBce),
      month: null,
      day: null,
      precision: "century",
    };
  }

  const millennium = MILLENNIUM.exec(rest);
  if (millennium?.[1]) {
    const n = Number(millennium[1]);
    if (n < 1) return { error: `millennium must be 1 or greater: "${raw}"` };
    return {
      year: toAstronomical(millenniumMidpoint(n), isBce),
      month: null,
      day: null,
      precision: "millennium",
    };
  }

  const iso = ISO_DATE.exec(rest);
  if (iso?.[1] && iso[2] && iso[3]) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const invalid = validateMonthDay(month, day);
    if (invalid) return { error: invalid };
    return { year: toAstronomical(year, isBce), month, day, precision: "day" };
  }

  const dmy = DAY_MONTH_YEAR.exec(rest);
  if (dmy?.[1] && dmy[2] && dmy[3]) {
    const month = MONTH_NAMES[dmy[2].toLowerCase()];
    if (month !== undefined) {
      const day = Number(dmy[1]);
      const year = parseGroupedInteger(dmy[3]);
      if (year === null) return { error: `unreadable year in "${raw}"` };
      const invalid = validateMonthDay(month, day);
      if (invalid) return { error: invalid };
      return { year: toAstronomical(year, isBce), month, day, precision: "day" };
    }
  }

  const my = MONTH_YEAR.exec(rest);
  if (my?.[1] && my[2]) {
    const month = MONTH_NAMES[my[1].toLowerCase()];
    if (month !== undefined) {
      const year = parseGroupedInteger(my[2]);
      if (year === null) return { error: `unreadable year in "${raw}"` };
      return {
        year: toAstronomical(year, isBce),
        month,
        day: null,
        precision: "month",
      };
    }
  }

  if (PLAIN_YEAR.test(rest)) {
    const year = parseGroupedInteger(rest);
    if (year === null) return { error: `unreadable year in "${raw}"` };
    if (year === 0) return { error: `year zero does not exist: "${raw}"` };
    return { year: toAstronomical(year, isBce), month: null, day: null, precision: "year" };
  }

  return { error: `unrecognised date format: "${raw}"` };
}

function validateMonthDay(month: number, day: number): string | null {
  if (month < 1 || month > 12) return `month out of range: ${month}`;
  if (day < 1 || day > 31) return `day out of range: ${day}`;
  return null;
}

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

/** Characters that do not decompose under NFD and need explicit mapping. */
const TRANSLITERATE: Record<string, string> = {
  ı: "i", İ: "i", ş: "s", Ş: "s", ğ: "g", Ğ: "g",
  ø: "o", Ø: "o", æ: "ae", Æ: "ae", œ: "oe", Œ: "oe",
  ß: "ss", đ: "d", Đ: "d", ł: "l", Ł: "l", þ: "th", ð: "d",
};

export function slugify(input: string): string {
  const mapped = [...input]
    .map((char) => TRANSLITERATE[char] ?? char)
    .join("")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

  return mapped
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------------------
// File parsing
// ---------------------------------------------------------------------------

const FIELD_COUNT = PARSED_LOCALES.length + 1;

export function parseEventsFile(path: string): ParseResult {
  const text = readFileSync(path, "utf8").replace(/^﻿/, "");
  const events: ParsedEvent[] = [];
  const failures: ParseFailure[] = [];
  const usedSlugs = new Set<string>();
  let ignored = 0;

  const lines = text.split(/\r?\n/);

  for (const [index, rawLine] of lines.entries()) {
    const lineNumber = index + 1;
    const line = rawLine.trim();

    if (line === "" || line.startsWith("#")) {
      ignored += 1;
      continue;
    }

    const fields = line.split(":").map((f) => f.trim());

    if (fields.length !== FIELD_COUNT) {
      failures.push({
        line: lineNumber,
        raw: line,
        reason: `expected ${FIELD_COUNT} colon-separated fields, found ${fields.length}` +
          (fields.length > FIELD_COUNT
            ? " (a name probably contains a colon — escape or remove it)"
            : ""),
      });
      continue;
    }

    const names = {} as Record<ParsedLocale, string>;
    let missingName: string | null = null;
    for (const [i, locale] of PARSED_LOCALES.entries()) {
      const value = fields[i] ?? "";
      if (value === "") missingName = locale;
      names[locale] = value;
    }
    if (missingName) {
      failures.push({
        line: lineNumber,
        raw: line,
        reason: `missing ${missingName} name`,
      });
      continue;
    }

    const rawDate = fields[FIELD_COUNT - 1] ?? "";
    const date = parseDateExpression(rawDate);
    if ("error" in date) {
      failures.push({ line: lineNumber, raw: line, reason: date.error });
      continue;
    }

    const slug = uniqueSlug(names.en || names.tr, lineNumber, usedSlugs);

    events.push({ slug, names, rawDate, line: lineNumber, ...date });
  }

  return { events, failures, ignored };
}

function uniqueSlug(
  source: string,
  lineNumber: number,
  used: Set<string>,
): string {
  const base = slugify(source) || `event-${lineNumber}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}-${suffix++}`;
  used.add(candidate);
  return candidate;
}
