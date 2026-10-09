/**
 * Survival: one run, no bracket, over at the first wrong answer.
 *
 * The sibling of lib/game/set.ts and deliberately shaped like it — same
 * `SetResult` per question, same purity, same ignorance of which game is being
 * scored. A set is ten questions whatever happens in them; a run is however
 * many the player gets right, plus the one they do not. That is the whole
 * difference, and it is why this is a module of its own rather than a flag on
 * `summarizeSet`: a set's headline is a percentage of a fixed ten and a run's
 * is a count with no ceiling, so almost nothing a summary wants to say about
 * one is true of the other.
 *
 * **What ends a run is the game's existing notion of wrong, not a new one.**
 * The comparison round is right-or-wrong on which half the target sits in
 * (`isComparisonCorrect` in ./rounds.ts) and `comparisonVerdict` already
 * reports that as a five-rung tier: the top three rungs are correct answers at
 * three margins and the bottom two are wrong ones. So "correct" here is
 * `SetResult.hit` and nothing in this file re-decides it — retuning what counts
 * as survivable means editing the rail's sections, not this module.
 *
 * **Nothing is persisted.** There are no game tables (CLAUDE.md), so a run
 * lives in component state and dies with the tab, exactly as a set does. A
 * best-ever run would be the first thing this module cannot answer on its own.
 */

import { VERDICTS, type Verdict } from "./scoring.ts";
import type { SetResult } from "./set.ts";

/**
 * One answered question in a run.
 *
 * Unlike the comparison game's set results, which record `verdict: null`
 * because that mode is scored right-or-wrong, a run keeps the tier. It is the
 * same grade the result card beside the rail has already shown the player —
 * the margin in sections, as a rung — and a run is the one screen with enough
 * answers on it for the distribution of those rungs to say something. It is
 * what the results screen's breakdown is made of.
 */
export function survivalResult(correct: boolean, verdict: Verdict): SetResult {
  return { hit: correct, verdict };
}

/** A finished run, as the results screen needs it. */
export interface SurvivalSummary {
  /**
   * Correct answers — the score, and the only number the player was playing
   * for. Every one of them is consecutive by construction: the run ends at the
   * first miss, so there is no "best streak" to report that is not this.
   */
  cleared: number;
  /** Questions answered, so `total - cleared` is the one that ended it (0 or 1). */
  total: number;
  /** Count per tier, in `VERDICTS` order. Always present: a run is always graded. */
  byVerdict: Record<Verdict, number>;
  /**
   * How accurately, as one number out of 100 — the mean of the per-answer
   * weights below. Display only: `cleared` is the score and this is the shape
   * of it, so a rounded 74 can never disagree with anything.
   */
  precision: number;
  /** Longest unbroken run of exact answers, which is the run's own high-water mark. */
  bestExact: number;
}

/**
 * What one answer is worth towards `precision`, best to worst.
 *
 * Derived from the tier's rank rather than written out, so the five rungs come
 * out evenly spaced over 0-100 (100, 75, 50, 25, 0) and a sixth rung added to
 * `VERDICTS` would re-space itself instead of landing on an undefined weight.
 * The ladder is ordinal — one section out is one section out, whatever the
 * round's scale — so even spacing is the honest reading of it, and this is not
 * a second scoring system: `roundPoints` in ./scoring.ts grades a *guess* on a
 * continuous rail, which is a different question from the shape of a whole run.
 */
function verdictWeight(verdict: Verdict): number {
  const rank = VERDICTS.indexOf(verdict);
  return ((VERDICTS.length - 1 - rank) / (VERDICTS.length - 1)) * 100;
}

export function summarizeSurvival(
  results: readonly SetResult[],
): SurvivalSummary {
  const total = results.length;
  const cleared = results.filter((result) => result.hit).length;

  const byVerdict = Object.fromEntries(
    VERDICTS.map((verdict) => [
      verdict,
      results.filter((result) => result.verdict === verdict).length,
    ]),
  ) as Record<Verdict, number>;

  let bestExact = 0;
  let running = 0;
  for (const result of results) {
    running = result.verdict === "perfect" ? running + 1 : 0;
    if (running > bestExact) bestExact = running;
  }

  const weighed = results.reduce(
    (sum, result) => sum + (result.verdict ? verdictWeight(result.verdict) : 0),
    0,
  );

  return {
    cleared,
    total,
    byVerdict,
    // An empty run is 0, not NaN. The screen is never shown for one, but a
    // number that can be NaN is a number that will be.
    precision: total === 0 ? 0 : Math.round(weighed / total),
    bestExact,
  };
}

/** Best to worst. Picks the headline the results screen leads with. */
export const SURVIVAL_GRADES = ["legendary", "deep", "solid", "short"] as const;
export type SurvivalGrade = (typeof SURVIVAL_GRADES)[number];

/**
 * The headline tier for a finished run.
 *
 * Thresholds on the count rather than on the precision, because the count is
 * what the mode asks for: a careless run of forty is a better run than a
 * flawless run of three, and the headline has to agree with the number printed
 * above it. Four rungs over the counts a comparison round actually produces —
 * the question is three-in-six at worst, so double figures is a real run and
 * forty is a long one.
 */
export function gradeSurvival(summary: SurvivalSummary): SurvivalGrade {
  if (summary.cleared >= 40) return "legendary";
  if (summary.cleared >= 20) return "deep";
  if (summary.cleared >= 8) return "solid";
  return "short";
}

/**
 * How many squares the share text's grid may hold.
 *
 * A run has no ceiling and a pasted message does: 200 answers is 200 emoji,
 * which is a wall of colour in a chat window and several screens on a phone.
 * Past this the grid keeps the *end* of the run — the part with the miss in it,
 * which is the part that reads as a result — and says how many squares were
 * dropped off the front.
 */
const SHARE_SQUARE_LIMIT = 60;

/** Squares per line in the share grid, so a long run pastes as a block. */
const SHARE_SQUARES_PER_LINE = 10;

/**
 * One square per tier, the same five the set's share grid uses (lib/game/set.ts)
 * and in the tiers' own colours — blue down to red.
 */
const VERDICT_SQUARE: Record<Verdict, string> = {
  perfect: "🟦",
  great: "🟩",
  good: "🟨",
  bad: "🟧",
  wayOff: "🟥",
};

const UNGRADED_SQUARE = "⬛";

/**
 * The run's grid, newest line last, wrapped at ten and trimmed at the front
 * when the run is longer than the limit above.
 */
export function survivalSquares(results: readonly SetResult[]): string[] {
  const shown = results.slice(-SHARE_SQUARE_LIMIT);
  const lines: string[] = [];

  for (let at = 0; at < shown.length; at += SHARE_SQUARES_PER_LINE) {
    lines.push(
      shown
        .slice(at, at + SHARE_SQUARES_PER_LINE)
        .map((result) =>
          result.verdict ? VERDICT_SQUARE[result.verdict] : UNGRADED_SQUARE,
        )
        .join(""),
    );
  }

  return lines;
}

/** How many answers the grid above left out, for the line that says so. */
export function survivalSquaresOmitted(results: readonly SetResult[]): number {
  return Math.max(0, results.length - SHARE_SQUARE_LIMIT);
}

/**
 * The text the share button puts on the clipboard or hands to the OS sheet.
 *
 * The same shape as a set's (lib/game/set.ts) — title, score, grid, link — so
 * the two modes paste as the same game. It differs in two ways, both forced by
 * a run having no fixed length: the score is a count rather than a fraction of
 * ten, and the grid is wrapped and trimmed, with a line saying how much was
 * trimmed when it was.
 *
 * `moreLabel` arrives already translated and formatted, because this module
 * holds rules and the dictionary belongs to the component that reads it.
 */
export function survivalShareText({
  title,
  results,
  summary,
  url,
  moreLabel,
}: {
  title: string;
  results: readonly SetResult[];
  summary: SurvivalSummary;
  url: string;
  /** "+12 earlier", or null when the whole run fitted in the grid. */
  moreLabel: string | null;
}): string {
  const omitted = survivalSquaresOmitted(results);

  return [
    `TEMPUS · ${title}`,
    `${summary.cleared} · ${summary.precision}%`,
    "",
    // Above the grid rather than below it: the grid keeps the *end* of the run,
    // so the answers this stands in for are the ones before its first square.
    ...(omitted > 0 && moreLabel ? [moreLabel] : []),
    ...survivalSquares(results),
    "",
    url,
  ].join("\n");
}
