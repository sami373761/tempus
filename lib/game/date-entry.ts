/**
 * Typing a date instead of dragging for it.
 *
 * The rail is the game: a drag is a *judgement* about where in history
 * something sits, and the panes are scaled so that judgement is the thing
 * being tested. But a player who already knows the year is being made to hunt
 * for it — the civilisation rail is 10,000 years over ~940px, so landing on
 * 1453 means dragging to the neighbourhood and then stepping onto the year.
 * This is the other door: the same guess, stated outright.
 *
 * It grades through `gradeGuess` like any other guess, so nothing about
 * scoring, verdicts or sets knows which door a year came in through.
 *
 * **The limits are the timeline's own, read rather than repeated.** The entry
 * can reach exactly what a drag can: the newest year on the common-era pane,
 * and the oldest on the cosmos pane. A hand-written 2026 here would be a
 * second copy of `PRESENT_YEAR` to keep in step.
 *
 * **Digits are capped at the input and values at the submit, which is not an
 * inconsistency.** The widest year each era accepts has a fixed number of
 * digits (4 for CE, 11 for BCE), so a cap on digits is a rule the field can
 * enforce as it is typed — a keystroke that would overflow simply does
 * nothing. A cap on the *value* is not: 2800 CE and 2026 CE are both four
 * digits, and a field that silently rewrote the first into the second as it
 * was typed would be worse than one that says so when it is locked in. So the
 * field refuses what it can refuse without editing the player's number, and
 * `directYear` is what refuses the rest.
 */

import { toAstronomicalYear, type Era } from "../historical-date.ts";
import { CE_MAX_YEAR, paneBounds, yearToBceDisplay } from "./timeline.ts";

export type { Era };

export interface DateEntryValue {
  era: Era;
  /**
   * What has been typed: digits only, no leading zero, empty until something
   * has been. Held as a string rather than a number because "" and "0" are
   * both states a number cannot represent, and the field has to be able to be
   * empty without standing for a year.
   */
  digits: string;
}

export const EMPTY_DATE_ENTRY: DateEntryValue = { era: "CE", digits: "" };

/**
 * The widest year each era accepts, in display years — the two ends of the
 * timeline, read off the panes themselves.
 */
const MAX_DISPLAY_YEAR: Record<Era, number> = {
  CE: CE_MAX_YEAR,
  BCE: yearToBceDisplay(paneBounds("cosmos").min),
};

export function maxDisplayYear(era: Era): number {
  return MAX_DISPLAY_YEAR[era];
}

/**
 * How many digits the field will hold. Derived from the limit above rather
 * than written down, so the two can never disagree about whether a 5th digit
 * is possible.
 */
export function maxDigits(era: Era): number {
  return String(MAX_DISPLAY_YEAR[era]).length;
}

/**
 * What the field is allowed to contain, applied to every input event — which
 * covers a paste as well as a keystroke, since a paste *is* an input event.
 * Anything that is not a digit is dropped, a leading zero is dropped with it
 * (`0002` is not how a year is written, and allowing it would make two
 * spellings of the same guess), and what is left is cut to the era's width.
 */
export function sanitizeDigits(raw: string, era: Era): string {
  return raw.replace(/\D+/g, "").replace(/^0+/, "").slice(0, maxDigits(era));
}

/**
 * The span of years an entry may name, in astronomical years.
 *
 * The general timeline is both ends of the whole ruler and needs no such
 * argument. A *subject* game is the case that does: football's rail runs 1850
 * to 2026, so "500 BCE" is a year the game has nowhere to put. Without a
 * bound it would be accepted, clamped to the rail's left edge by
 * `fractionAtYear`, and then marked at 1850 while being graded as -499 — a
 * marker that disagrees with the guess it stands for.
 *
 * It is the same refusal 2800 CE already gets, applied to the set being
 * played: `directYear` returns null and the caller shows its warning.
 */
export interface YearRange {
  min: number;
  max: number;
}

/**
 * The entry as an astronomical year, or null if it is not a date the timeline
 * holds — empty, zero, past the era's end, or outside `range` when the game
 * being played has one. The caller shows the warning; this only decides.
 */
export function directYear(
  value: DateEntryValue,
  range?: YearRange,
): number | null {
  if (!value.digits) return null;

  const display = Number(value.digits);
  if (!Number.isSafeInteger(display)) return null;
  if (display < 1 || display > MAX_DISPLAY_YEAR[value.era]) return null;

  const year = toAstronomicalYear(display, value.era);
  if (range && (year < range.min || year > range.max)) return null;

  return year;
}
