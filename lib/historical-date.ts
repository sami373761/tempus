/**
 * Historical date handling.
 *
 * Storage uses ASTRONOMICAL YEAR NUMBERING, which has a year zero:
 *
 *   historical        astronomical
 *   ----------        ------------
 *   1000 BCE          -999
 *    500 BCE          -499
 *      1 BCE             0
 *      1 CE              1
 *   1000 CE           1000
 *
 * Because there is no gap at the BCE/CE boundary, every comparison the game
 * needs — ordering, ranges, "how many years off was the guess" — is plain
 * integer arithmetic on `year`. Nothing has to special-case BCE.
 *
 * `event.year` is a Postgres bigint reaching -15,000,000,000 (deep time), but
 * every value and its derived sort key stay far inside Number.MAX_SAFE_INTEGER
 * (worst case ~1.5e14 vs ~9.0e15), so plain JS numbers are exact here.
 */

import type { DatePrecision } from "./db/types.ts";

export type Era = "BCE" | "CE";

export interface HistoricalDateParts {
  year: number;
  month?: number | null;
  day?: number | null;
}

/** `1000 BCE` -> `-999`; `1000 CE` -> `1000`. */
export function toAstronomicalYear(year: number, era: Era): number {
  if (!Number.isInteger(year) || year < 1) {
    throw new RangeError(`Historical year must be a positive integer, got ${year}`);
  }
  return era === "BCE" ? 1 - year : year;
}

/** Inverse of `toAstronomicalYear`. */
export function fromAstronomicalYear(year: number): { year: number; era: Era } {
  return year <= 0 ? { year: 1 - year, era: "BCE" } : { year, era: "CE" };
}

export function isBce(year: number): boolean {
  return year <= 0;
}

/**
 * Mirrors the generated `event.sort_key` column so client-side sorting of an
 * already-fetched list matches the database ordering exactly.
 */
export function sortKey({ year, month, day }: HistoricalDateParts): number {
  return year * 10_000 + (month ?? 1) * 100 + (day ?? 1);
}

/** Signed year gap; positive when `a` is later than `b`. */
export function yearsBetween(a: number, b: number): number {
  return a - b;
}

/** Absolute year gap — the raw input to date-guessing scoring. */
export function yearDistance(guess: number, actual: number): number {
  return Math.abs(guess - actual);
}

/**
 * Era buckets used both as category slugs and as R2 folder prefixes. ASCII
 * only, because they appear in object keys and URLs.
 */
export const ERA_FOLDERS = ["bce", "ce", "future"] as const;
export type EraFolder = (typeof ERA_FOLDERS)[number];

/** Last year counted as present rather than future. */
export const PRESENT_YEAR = 2026;

/**
 * Mirrors `public.era_slug_for_year(bigint)`, last set by
 * supabase/migrations/20261002120600_era_boundary_fix.sql. The database is the
 * authority — it maintains the category link by trigger — so if you change the
 * thresholds here, change them there in the same commit.
 *
 * The boundary is `<= 0` because astronomical year 0 is historically 1 BCE.
 * Year numbering has a zero so arithmetic crosses the boundary without a gap;
 * the era of that year is still BCE.
 */
export function eraForYear(year: number): EraFolder {
  if (year <= 0) return "bce";
  if (year <= PRESENT_YEAR) return "ce";
  return "future";
}

export function isEraFolder(value: string): value is EraFolder {
  return (ERA_FOLDERS as readonly string[]).includes(value);
}

/**
 * The locale-dependent half of a rendered date.
 *
 * Era abbreviations and the words for a decade, a century and a millennium are
 * chrome, not data — the same year is "1200 BCE" in English and "MÖ 1200" in
 * Turkish — so every function below takes them rather than printing the
 * English ones. They are passed in rather than read from the dictionary here
 * because this module is also run by `scripts/` under plain node and must stay
 * free of UI imports; `dateLabels()` in lib/i18n/dictionary.ts is the one
 * place a `Dict` is turned into this.
 *
 * `pattern` exists because the era does not sit in the same place in every
 * language: it follows the number in English, German, French and Spanish and
 * precedes it in Turkish. Swapping a label without swapping the order would
 * only move the mistake.
 *
 * The three period templates take `{n}` and `{th}` — the latter is the English
 * ordinal suffix, and the languages that do not inflect that way simply leave
 * it out of their template.
 */
export interface DateLabels {
  bce: string;
  ce: string;
  /** `{year}` and `{era}`. */
  pattern: string;
  /** `{n}`, `{th}`. */
  decade: string;
  century: string;
  millennium: string;
  /**
   * The scale words a deep-time year is printed on: "4.54 billion BCE".
   *
   * Here rather than hard-coded for the same reason the era abbreviation is —
   * they are part of a rendered date, not data — and because the head-to-head
   * reveal prints that date in capitals: under `lang="tr"`, CSS
   * `text-transform: uppercase` maps i to İ, so an English "million" left in a
   * Turkish sentence came out as "MİLLİON".
   */
  million: string;
  billion: string;
}

/**
 * The default, and the one `formatYear` must keep producing when it is called
 * with no labels at all: SQL's `historical_year_label()` prints exactly these
 * strings and the two are a paired rule (CLAUDE.md).
 */
export const EN_DATE_LABELS: DateLabels = {
  bce: "BCE",
  ce: "CE",
  pattern: "{year} {era}",
  decade: "{n}s",
  century: "{n}{th} century",
  millennium: "{n}{th} millennium",
  million: "million",
  billion: "billion",
};

function eraLabel(labels: DateLabels, era: Era): string {
  return era === "BCE" ? labels.bce : labels.ce;
}

/** `{year} {era}` the way this language writes it. */
function withEra(labels: DateLabels, year: string, era: Era): string {
  return labels.pattern
    .replace("{year}", year)
    .replace("{era}", eraLabel(labels, era));
}

/** Fills a period template. No `format()` import: see `DateLabels`. */
function period(template: string, n: number): string {
  return template.replace("{n}", String(n)).replace("{th}", ordinalSuffix(n));
}

/**
 * Deep-time magnitudes, largest first.
 *
 * The word is looked up on `DateLabels` rather than written here, so one
 * language's "billion" cannot leak into another's date. The thresholds are not
 * language-dependent: every locale this site ships in breaks a long year at
 * the same two places, and a language that did not would need its own
 * `MAGNITUDES`, not a different word in this one.
 */
const MAGNITUDES: {
  threshold: number;
  divisor: number;
  unit: (labels: DateLabels) => string;
}[] = [
  {
    threshold: 1_000_000_000,
    divisor: 1_000_000_000,
    unit: (labels) => labels.billion,
  },
  { threshold: 1_000_000, divisor: 1_000_000, unit: (labels) => labels.million },
];

/**
 * `-999` -> `"1000 BCE"`, `476` -> `"476 CE"`.
 *
 * Years of a million or more are rendered on their natural scale — printing
 * "4540000000 BCE" for the formation of the Earth is unreadable.
 */
export function formatYear(
  year: number,
  labels: DateLabels = EN_DATE_LABELS,
): string {
  const { year: display, era } = fromAstronomicalYear(year);
  return withEra(labels, scaleYear(display, labels), era);
}

/**
 * The magnitude half of `formatYear` with the era dropped: `-999` -> `"1000"`,
 * `-4539999999` -> `"4.54 billion"`.
 *
 * Used for timeline tick labels, where repeating "BCE" under every tick is
 * noise — the era is already obvious from the pointer and the scale.
 */
export function formatYearMagnitude(
  year: number,
  labels: DateLabels = EN_DATE_LABELS,
): string {
  return scaleYear(fromAstronomicalYear(year).year, labels);
}

/**
 * A *count* of years, on the same scale `formatYear` prints the years
 * themselves at: `1551` -> `"1,551"`, `4539998933` -> `"4.54 billion"`.
 *
 * The date-guessing result is a count rather than a date, and a nine-digit one
 * is exactly as unreadable there as it is on a tick label. Below a million the
 * locale's own grouping is used, because that is the range a player reads as a
 * number rather than as a magnitude; above it the scale word comes from
 * `labels`, like every other word in a rendered date.
 */
export function formatYearCount(
  count: number,
  locale = "en",
  labels: DateLabels = EN_DATE_LABELS,
): string {
  return count >= MAGNITUDES[MAGNITUDES.length - 1]!.threshold
    ? scaleYear(count, labels)
    : count.toLocaleString(locale);
}

function scaleYear(display: number, labels: DateLabels): string {
  for (const { threshold, divisor, unit } of MAGNITUDES) {
    if (display >= threshold) {
      const scaled = display / divisor;
      // Two decimals at most, with trailing zeros dropped: 4.54, 2.5, 13.
      const rounded = Number(scaled.toFixed(2));
      return `${rounded} ${unit(labels)}`;
    }
  }

  return `${display}`;
}

/**
 * Renders a stored date at the granularity its `precision` claims, so a
 * year-only event never pretends to know a day.
 */
export function formatHistoricalDate(
  parts: HistoricalDateParts & { precision: DatePrecision },
  locale = "en",
  labels: DateLabels = EN_DATE_LABELS,
): string {
  const { year, month, day, precision } = parts;
  const { year: display, era } = fromAstronomicalYear(year);

  switch (precision) {
    case "day":
    case "month": {
      if (month == null) return formatYear(year, labels);
      // Only CE dates are rendered with month/day names; BCE falls back to the
      // year, which is all the game ever asks about anyway.
      if (era === "BCE") return formatYear(year, labels);
      const date = new Date(Date.UTC(display, month - 1, day ?? 1));
      return new Intl.DateTimeFormat(locale, {
        timeZone: "UTC",
        year: "numeric",
        month: "long",
        ...(precision === "day" ? { day: "numeric" } : {}),
      }).format(date);
    }
    case "decade":
      if (display >= 1_000_000) return formatYear(year, labels);
      return withEra(
        labels,
        period(labels.decade, Math.floor(display / 10) * 10),
        era,
      );
    case "century": {
      if (display >= 1_000_000) return formatYear(year, labels);
      return withEra(
        labels,
        period(labels.century, Math.ceil(display / 100)),
        era,
      );
    }
    case "millennium": {
      if (display >= 1_000_000) return formatYear(year, labels);
      return withEra(
        labels,
        period(labels.millennium, Math.ceil(display / 1000)),
        era,
      );
    }
    case "year":
    default:
      return formatYear(year, labels);
  }
}

function ordinalSuffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}
