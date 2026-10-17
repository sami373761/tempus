/**
 * The solo games' rounds as they cross the wire: masked on deal, completed on
 * reveal.
 *
 * Until TP, the solo games were dealt whole events and graded in the browser —
 * harmless while a score died with the tab, and the end of any leaderboard the
 * moment it did not, since the answer was in the payload before the guess.
 * So a solo round now travels the way a daily or head-to-head round always
 * has: the date fields are stripped (`MaskedEvent` in ./versus.ts is the same
 * idea), a signed token rides along, and the year arrives in the reply to a
 * guess that has already been made (app/actions/scoring.ts).
 *
 * The masked type is generic so each game's own extra field survives — a
 * film's format, a person's field — while every date-bearing one is dropped
 * at the type level, as `maskEvent` does for the head-to-head mode.
 */

import type { BadgeSlug } from "../badges.ts";
import type { DatePrecision, LocalizedEvent } from "../db/types.ts";
import type { ComparisonRound } from "./rounds.ts";
import type { Verdict } from "./scoring.ts";

/** The fields that give a round's answer away. */
type DateFields = "year" | "month" | "day" | "sortKey" | "precision";

/** A dealt date round: everything but the date, plus the token that grades it. */
export type DealtEvent<E extends LocalizedEvent = LocalizedEvent> = Omit<
  E,
  DateFields
> & { token: string };

/** The date fields, which are what a reveal hands back. */
export interface RevealedDate {
  year: number;
  month: number | null;
  day: number | null;
  precision: DatePrecision;
  sortKey: number;
}

/** A dealt round put back together once its answer is known. */
export function completeEvent<E extends LocalizedEvent>(
  dealt: DealtEvent<E>,
  date: RevealedDate,
): E {
  const { token: _token, ...rest } = dealt;
  return { ...rest, ...date } as unknown as E;
}

export function maskForDeal<E extends LocalizedEvent>(
  event: E,
  token: string,
): DealtEvent<E> {
  // Destructured rather than spread-and-delete, so the discarded fields are
  // named here and a new date-bearing column has to be thought about.
  const { year: _y, month: _m, day: _d, sortKey: _s, precision: _p, ...rest } =
    event;
  return { ...rest, token };
}

/**
 * A dealt comparison round. **All three events are masked**, the anchors
 * included: the game hides their dates until the reveal (`HIDDEN_DATE` in
 * components/comparison-game.tsx), so that the round is answered by knowing
 * the events rather than by arithmetic on two printed numbers — and a date the
 * screen hides must not be sitting in the payload either.
 */
export interface DealtComparisonRound {
  left: DealtEvent;
  right: DealtEvent;
  target: DealtEvent;
  token: string;
}

/** The three dates of a comparison round, as its reveal hands them back. */
export interface RevealedComparison {
  left: RevealedDate;
  target: RevealedDate;
  right: RevealedDate;
}

export function completeComparisonRound(
  dealt: DealtComparisonRound,
  dates: RevealedComparison,
): ComparisonRound {
  return {
    left: completeEvent(dealt.left, dates.left),
    right: completeEvent(dealt.right, dates.right),
    target: completeEvent(dealt.target, dates.target),
  };
}

/** What banking a round did, for a member. Null in a reveal means a guest. */
export interface BankedRound {
  /** False when the round was refused: a finished set, a foreign set id. */
  counted: boolean;
  /** TP this round paid, bonuses not included. */
  tp: number;
  /** Set or streak bonus this round triggered. */
  bonus: number;
  /** The set's own running total, bonuses included. */
  setTp: number;
  /** Badges this round's payout unlocked, bottom rung first. */
  newBadges: BadgeSlug[];
}

export type RevealResult =
  | {
      ok: true;
      date: RevealedDate;
      verdict: Verdict;
      /** For the comparison games: whether the pick was in the right half. */
      correct: boolean;
      /** What this round is worth, whoever is playing. */
      tp: number;
      banked: BankedRound | null;
      /** A comparison round's three dates; absent for a date round. */
      comparison?: RevealedComparison;
    }
  | { ok: false; reason: "bad-token" | "bad-input" | "failed" };
