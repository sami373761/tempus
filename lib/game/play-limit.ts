/**
 * How many games a day the subject modes allow.
 *
 * **Only the subject games are limited**, and that is the whole of the rule:
 * football, basketball, Born When? and Film & TV. Date Guessing, Comparison
 * and the survival run stay unlimited, because they draw on the whole of
 * history and a player who wants to keep going there is doing the thing the
 * site is for. A subject pool is a few hundred events — a player who runs
 * through it in one sitting has seen the mode, and the limit is what keeps a
 * second visit worth making.
 *
 * **A guest gets one, an account gets three.** The guest's one is a trial:
 * they play the mode, and the screen at the end of it says what an account
 * adds. That is also why the limit is a *gate* and not a nag — a guest who has
 * used their game is sent to the notice rather than into a second one.
 *
 * **The day is the daily's day**: midnight UTC, one boundary for everybody
 * (see `dailyPuzzleDate` in ./daily.ts, which this reuses rather than measuring
 * its own). A player's "today" is the same today in every time zone, and the
 * reset is a date comparison rather than a clock that has to be reset by
 * anything.
 *
 * Pure, and deliberately so: the ledger behind it is ./play-ledger.ts (a table
 * for an account, a cookie for a guest), and the limits themselves live here so
 * that neither half of that owns the number.
 */

import { dailyPuzzleDate } from "./daily.ts";
import type { SoloGame } from "./points.ts";

/**
 * The games a day's worth of plays is counted for.
 *
 * `satisfies readonly SoloGame[]` so a renamed game is a compile error here
 * rather than a limit that silently stops applying to anything.
 */
export const LIMITED_GAMES = [
  "football",
  "basketball",
  "screen",
  "when-born",
] as const satisfies readonly SoloGame[];

export type LimitedGame = (typeof LIMITED_GAMES)[number];

export function isLimitedGame(value: string): value is LimitedGame {
  return (LIMITED_GAMES as readonly string[]).includes(value);
}

/** Where each limited game lives, for the notice's "come back" links and the
 *  `next` a guest is sent to sign in with. */
export const LIMITED_GAME_PATH: Record<LimitedGame, string> = {
  football: "/football",
  basketball: "/basketball",
  screen: "/screen",
  "when-born": "/when-born",
};

/** Games an account may play of one subject mode per day. */
export const MEMBER_PLAYS_PER_DAY = 3;

/**
 * Games a guest may play. One, and the second attempt is the sign-up notice —
 * which is the only thing on the site that asks for an account before showing
 * something rather than after.
 */
export const GUEST_PLAYS_PER_DAY = 1;

export function playsPerDay(member: boolean): number {
  return member ? MEMBER_PLAYS_PER_DAY : GUEST_PLAYS_PER_DAY;
}

/**
 * One player's standing in one game today.
 *
 * `used` counts **games begun**, not games finished: a set is spent by its
 * first locked-in guess (see ./play-ledger.ts), so quitting half way through
 * costs the play and opening the page and leaving costs nothing.
 */
export interface PlayAllowance {
  game: LimitedGame;
  /** Whether this is an account's allowance. False is a guest's. */
  member: boolean;
  /** Games begun today. */
  used: number;
  limit: number;
  /** The UTC day `used` was counted for — what the client's reset reads. */
  day: string;
}

export function playsLeft(allowance: PlayAllowance): number {
  return Math.max(0, allowance.limit - allowance.used);
}

/** Whether another game may be begun. The entry gate on every limited page. */
export function canPlay(allowance: PlayAllowance): boolean {
  return playsLeft(allowance) > 0;
}

/** The day plays are counted against: the daily's day, for the daily's reason. */
export function playDay(now: Date = new Date()): string {
  return dailyPuzzleDate(now);
}

/** Midnight UTC at the start of a play day — the lower bound a count reads. */
export function playDayStart(day: string = playDay()): string {
  return `${day}T00:00:00.000Z`;
}

/** An allowance built from a count, so the ledger has one shape to return. */
export function allowanceOf(
  game: LimitedGame,
  member: boolean,
  used: number,
  day: string = playDay(),
): PlayAllowance {
  return { game, member, used, limit: playsPerDay(member), day };
}
