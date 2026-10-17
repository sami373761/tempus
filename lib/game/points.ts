/**
 * Tempus Points (TP): the one currency every game pays out in, and the number
 * the leaderboard ranks and the badge ladder climbs.
 *
 * **A round is worth its tier, not its distance.** `roundPoints` in
 * ./scoring.ts already reads a guess off finely (0–100) and stays what the
 * head-to-head mode ranks two players by inside one match. TP deliberately
 * does not reuse it: a career total built from a continuous scale reads as
 * noise ("4,317"), and a player cannot tell from the round on screen what it
 * was worth. Five fixed amounts, one per verdict, can be printed beside the
 * verdict itself — the same word, the same colour, the same number every time.
 *
 * **Every game prices the same ladder.** The date games grade by year, the
 * comparison games by section, and both end on the same five verdicts
 * (`comparisonVerdict` in ./rounds.ts), so one table pays both. The one
 * difference is that a comparison verdict below the line is a *wrong answer*,
 * and a wrong answer earns nothing, however near it was.
 *
 * **The bonuses are mirrored in SQL.** Rounds are graded here, but a set is
 * only known to be finished by the database, under the set row's lock (see
 * `bank_solo_round` in
 * supabase/migrations/20261017120000_scoring.sql), and the daily streak and
 * head-to-head results are banked by triggers there. So the amounts below are
 * the ones those functions write, copied for display — change one, change the
 * other.
 */

import type { Verdict } from "./scoring.ts";

/** What each verdict is worth, best to worst. */
export const TIER_TP: Readonly<Record<Verdict, number>> = {
  perfect: 10,
  great: 5,
  good: 3,
  bad: 1,
  wayOff: 0,
};

/** The games that pay out TP, as the ids the ledger stores. */
export const SCORED_GAMES = [
  "history",
  "football",
  "basketball",
  "screen",
  "when-born",
  "compare",
  "survival",
  "daily",
  "versus",
] as const;

export type ScoredGame = (typeof SCORED_GAMES)[number];

/**
 * The solo games: dealt by an action, graded on reveal, banked a round at a
 * time into a set (or, for survival, a run).
 */
export const SOLO_GAMES = [
  "history",
  "football",
  "basketball",
  "screen",
  "when-born",
  "compare",
  "survival",
] as const;

export type SoloGame = (typeof SOLO_GAMES)[number];

export function isSoloGame(value: string): value is SoloGame {
  return (SOLO_GAMES as readonly string[]).includes(value);
}

/**
 * The five games answered with a year. These are the ones a Perfect means
 * "the exact year" in, and so the only ones the badge quests count Perfects
 * from — a Perfect on the comparison rail is the right sixth of a span, which
 * is a different (and much easier) thing.
 */
export const DATE_GAMES = [
  "history",
  "football",
  "basketball",
  "screen",
  "when-born",
] as const satisfies readonly SoloGame[];

export type DateGame = (typeof DATE_GAMES)[number];

/** The two games answered by picking a section between anchors. */
export type ComparisonGameId = Extract<SoloGame, "compare" | "survival">;

/** A date round's TP. */
export function tierPoints(verdict: Verdict): number {
  return TIER_TP[verdict];
}

/**
 * A comparison round's TP: the tier, but nothing for the wrong half. See the
 * note at the top of this file.
 */
export function comparisonPoints(verdict: Verdict, correct: boolean): number {
  return correct ? TIER_TP[verdict] : 0;
}

/* -------------------------------------------------------------------------
   Bonuses — mirrored in SQL, see the header.
   ------------------------------------------------------------------------- */

/** Finishing a set of ten, in any set-based solo game. */
export const SET_COMPLETE_TP = 5;

/** A date-game set whose every answer is Great or Perfect. */
export const SET_FLAWLESS_TP = 20;

/** Survival milestones: the run length that pays, and what it pays. */
export const SURVIVAL_MILESTONES: readonly { streak: number; tp: number }[] = [
  { streak: 10, tp: 10 },
  { streak: 25, tp: 30 },
  { streak: 50, tp: 75 },
];

/** The daily is worth three times a solo round. */
export const DAILY_TP_MULTIPLIER = 3;

/** Every seventh consecutive day of finished dailies. */
export const DAILY_STREAK_DAYS = 7;
export const DAILY_STREAK_TP = 50;

/** One finished head-to-head match between two different accounts. */
export const VERSUS_TP = { win: 30, draw: 10, loss: 5 } as const;

/** How many matches against the same opponent pay out per (UTC) day. */
export const VERSUS_DAILY_PAIR_CAP = 3;
