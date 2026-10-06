/**
 * Play happens in sets of ten questions.
 *
 * Both games deal rounds forever — the queue in each component tops itself up
 * and would never stop. A set is the bracket around that: ten questions, then a
 * summary, then the player chooses to go again. Nothing here knows which game
 * it is scoring, which is the point — `SetResult` is the one shape both games
 * record, so a single summary screen serves them both.
 *
 * **Pure, and deliberately so.** There are no game tables (see CLAUDE.md), so a
 * set lives entirely in component state and dies with the tab. These functions
 * are the whole of the rules; when sets do get persisted, this is the module
 * that already knows what a set *is*.
 */

import { VERDICTS, type Verdict } from "./scoring.ts";

/**
 * Questions in a set. Ten for now — the number is a product decision rather
 * than a constraint of anything below it, so this is the only place it is
 * written down and both games read it from here.
 */
export const QUESTIONS_PER_SET = 10;

/**
 * Which tiers of `gradeGuess` count toward the set's percentage.
 *
 * The same split the game already makes visually: `VERDICT_COLORS` in
 * `components/timeline-game.tsx` paints the top two green, "good" in plain ink
 * and only "bad" in red. So "bad" is the miss and the other three are hits —
 * this is not a second opinion about difficulty, it is the existing one written
 * as a boolean. Retuning what counts as a hit means editing `BANDS` in
 * lib/game/scoring.ts, not this line.
 */
const MISSED_VERDICT: Verdict = "bad";

/** One answered question, in the form both games can produce. */
export interface SetResult {
  /** Whether it counted toward the percentage. */
  hit: boolean;
  /**
   * The tier earned, where the game grades in tiers. The comparison game is
   * right-or-wrong and records `null`, which is what makes the summary show a
   * per-tier breakdown for one game and not the other.
   */
  verdict: Verdict | null;
}

/** A date-guessing answer: hit or miss follows from the tier. */
export function timelineResult(verdict: Verdict): SetResult {
  return { hit: verdict !== MISSED_VERDICT, verdict };
}

/** A comparison answer: right or wrong, with no tier to report. */
export function comparisonResult(correct: boolean): SetResult {
  return { hit: correct, verdict: null };
}

/**
 * How well the set went. `percent` is rounded for display only — `hits` and
 * `total` are what the share text quotes, so a rounded 80% can never disagree
 * with the "8 of 10" beside it.
 */
export interface SetSummary {
  total: number;
  hits: number;
  percent: number;
  /** Longest run of consecutive hits. 10 means the set was flawless. */
  bestStreak: number;
  /**
   * Count per tier, in `VERDICTS` order, or `null` for a game that does not
   * grade in tiers. Absent rather than all-zero so the summary can tell "this
   * game has no tiers" from "this player earned none of them".
   */
  byVerdict: Record<Verdict, number> | null;
}

export function summarizeSet(results: readonly SetResult[]): SetSummary {
  const total = results.length;
  const hits = results.filter((result) => result.hit).length;

  let bestStreak = 0;
  let running = 0;
  for (const result of results) {
    running = result.hit ? running + 1 : 0;
    if (running > bestStreak) bestStreak = running;
  }

  const graded = results.some((result) => result.verdict !== null);
  const byVerdict = graded
    ? (Object.fromEntries(
        VERDICTS.map((verdict) => [
          verdict,
          results.filter((result) => result.verdict === verdict).length,
        ]),
      ) as Record<Verdict, number>)
    : null;

  return {
    total,
    hits,
    // An empty set is 0%, not NaN — the summary is never shown for one, but a
    // percentage that can be NaN is a percentage that will be, eventually.
    percent: total === 0 ? 0 : Math.round((hits / total) * 100),
    bestStreak,
    byVerdict,
  };
}

/** Best to worst. Picks the headline the summary screen leads with. */
export const SET_GRADES = ["flawless", "strong", "fair", "rough"] as const;
export type SetGrade = (typeof SET_GRADES)[number];

/**
 * The headline tier for a finished set.
 *
 * Only "flawless" is pinned to an exact result; the rest are thresholds, so
 * retuning them is a matter of moving two numbers. A perfect set has to be
 * perfect — a rounded 100% from 9.6 hits is not a thing that can happen at ten
 * questions, but it is exactly the kind of thing that starts happening when the
 * set length changes, so it is tested against the counts and not the percent.
 */
export function gradeSet(summary: SetSummary): SetGrade {
  if (summary.total > 0 && summary.hits === summary.total) return "flawless";
  if (summary.percent >= 70) return "strong";
  if (summary.percent >= 40) return "fair";
  return "rough";
}

/**
 * The share grid: one square per question, in the order they were played.
 *
 * Three colours for four tiers, matching `VERDICT_COLORS` in the game itself —
 * green is the reward, so the top two tiers share it and only the words tell
 * them apart. The white square is "good" because the UI paints that tier in
 * plain ink; a miss is the black square, so on a dark client it reads as the
 * absence it is. A game with no tiers gets the plain hit/miss pair.
 */
const VERDICT_SQUARE: Record<Verdict, string> = {
  perfect: "🟩",
  great: "🟩",
  good: "⬜",
  bad: "⬛",
};

const HIT_SQUARE = "🟩";
const MISS_SQUARE = "⬛";

export function setSquares(results: readonly SetResult[]): string {
  return results
    .map((result) =>
      result.verdict
        ? VERDICT_SQUARE[result.verdict]
        : result.hit
          ? HIT_SQUARE
          : MISS_SQUARE,
    )
    .join("");
}

/**
 * The text the share button puts on the clipboard or hands to the OS sheet.
 *
 * Shaped like the puzzle-game results people already paste into chat: a title,
 * the score, the grid, the link. The grid spoils nothing — the squares say how
 * well it went, never which events came up, so a set can be shared with someone
 * who has not played it.
 */
export function shareText({
  title,
  results,
  summary,
  url,
}: {
  title: string;
  results: readonly SetResult[];
  summary: SetSummary;
  url: string;
}): string {
  return [
    `TEMPUS · ${title}`,
    `${summary.hits}/${summary.total} · ${summary.percent}%`,
    "",
    setSquares(results),
    "",
    url,
  ].join("\n");
}
