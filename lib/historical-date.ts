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

const ERA_LABEL: Record<Era, string> = { BCE: "BCE", CE: "CE" };

/** Deep-time magnitudes, largest first. */
const MAGNITUDES: { threshold: number; divisor: number; unit: string }[] = [
  { threshold: 1_000_000_000, divisor: 1_000_000_000, unit: "billion" },
  { threshold: 1_000_000, divisor: 1_000_000, unit: "million" },
];

/**
 * `-999` -> `"1000 BCE"`, `476` -> `"476 CE"`.
 *
 * Years of a million or more are rendered on their natural scale — printing
 * "4540000000 BCE" for the formation of the Earth is unreadable.
 */
export function formatYear(year: number): string {
  const { year: display, era } = fromAstronomicalYear(year);
  return `${scaleYear(display)} ${ERA_LABEL[era]}`;
}

/**
 * The magnitude half of `formatYear` with the era dropped: `-999` -> `"1000"`,
 * `-4539999999` -> `"4.54 billion"`.
 *
 * Used for timeline tick labels, where repeating "BCE" under every tick is
 * noise — the era is already obvious from the pointer and the scale.
 */
export function formatYearMagnitude(year: number): string {
  return scaleYear(fromAstronomicalYear(year).year);
}

/**
 * A *count* of years, on the same scale `formatYear` prints the years
 * themselves at: `1551` -> `"1,551"`, `4539998933` -> `"4.54 billion"`.
 *
 * The date-guessing result is a count rather than a date, and a nine-digit one
 * is exactly as unreadable there as it is on a tick label. Below a million the
 * locale's own grouping is used, because that is the range a player reads as a
 * number rather than as a magnitude. The unit words above it stay English for
 * the same reason they do in `formatYear` — SQL's `historical_year_label()`
 * produces the same strings, and the two must agree.
 */
export function formatYearCount(count: number, locale = "en"): string {
  return count >= MAGNITUDES[MAGNITUDES.length - 1]!.threshold
    ? scaleYear(count)
    : count.toLocaleString(locale);
}

function scaleYear(display: number): string {
  for (const { threshold, divisor, unit } of MAGNITUDES) {
    if (display >= threshold) {
      const scaled = display / divisor;
      // Two decimals at most, with trailing zeros dropped: 4.54, 2.5, 13.
      const rounded = Number(scaled.toFixed(2));
      return `${rounded} ${unit}`;
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
): string {
  const { year, month, day, precision } = parts;
  const { year: display, era } = fromAstronomicalYear(year);

  switch (precision) {
    case "day":
    case "month": {
      if (month == null) return formatYear(year);
      // Only CE dates are rendered with month/day names; BCE falls back to the
      // year, which is all the game ever asks about anyway.
      if (era === "BCE") return formatYear(year);
      const date = new Date(Date.UTC(display, month - 1, day ?? 1));
      return new Intl.DateTimeFormat(locale, {
        timeZone: "UTC",
        year: "numeric",
        month: "long",
        ...(precision === "day" ? { day: "numeric" } : {}),
      }).format(date);
    }
    case "decade":
      if (display >= 1_000_000) return formatYear(year);
      return `${Math.floor(display / 10) * 10}s ${ERA_LABEL[era]}`;
    case "century": {
      if (display >= 1_000_000) return formatYear(year);
      const n = Math.ceil(display / 100);
      return `${n}${ordinalSuffix(n)} century ${ERA_LABEL[era]}`;
    }
    case "millennium": {
      if (display >= 1_000_000) return formatYear(year);
      const n = Math.ceil(display / 1000);
      return `${n}${ordinalSuffix(n)} millennium ${ERA_LABEL[era]}`;
    }
    case "year":
    default:
      return formatYear(year);
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
