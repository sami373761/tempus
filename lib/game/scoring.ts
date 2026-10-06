/**
 * Date-guessing accuracy, scored on time depth rather than on raw years.
 *
 * A linear year gap is the wrong yardstick for this dataset, and badly so. The
 * events run from 4.54 billion BCE to 2022 CE, so the same "900 years off"
 * is a hopeless answer for something in 1900 and an almost uncanny one for
 * something in 110,000 BCE. Scoring the gap directly would mark the first as
 * the better guess of the two.
 *
 * So the gap is measured against how far back the event is in the first place:
 *
 *     depth    = |PRESENT_YEAR - actual|      how old the event is
 *     relative = |guess - actual| / depth     the gap as a share of that age
 *
 * Being 10,000 years out on a 112,000-year-old event is a relative error of
 * 0.09 and lands in "great"; being 900 out on a 126-year-old one is 7.14 and
 * lands nowhere near it. That is the intended ordering.
 *
 * **Each band also carries a floor in years**, which is what keeps events
 * inside living memory playable. Depth shrinks to nothing as the event
 * approaches the present — the moon landing is 57 years deep — and a purely
 * relative band there would demand the exact year for anything above "bad".
 * The floors are the point at which the relative rule stops being the binding
 * one, not a fudge: by `tolerance()` below, whichever of the two is more
 * generous wins.
 *
 * Both sequences are monotonic, so the bands nest and the first match is
 * always the best one.
 */

import { PRESENT_YEAR } from "../historical-date.ts";

/** Best to worst. The order is the order they are tested in. */
export const VERDICTS = ["perfect", "great", "good", "bad"] as const;
export type Verdict = (typeof VERDICTS)[number];

interface Band {
  verdict: Verdict;
  /** Share of the event's own age that may be missed by. */
  relative: number;
  /** Years that are always forgiven, however shallow the event. */
  floorYears: number;
}

/**
 * The tolerance structure. Widening a band here is the whole of retuning the
 * game's difficulty — nothing else reads these numbers.
 */
const BANDS: readonly Band[] = [
  { verdict: "perfect", relative: 0.025, floorYears: 1 },
  { verdict: "great", relative: 0.1, floorYears: 5 },
  { verdict: "good", relative: 0.3, floorYears: 25 },
];

export interface GuessAccuracy {
  /** Plain year gap. Still what the player is told, because it is what they feel. */
  distance: number;
  /** The event's age — the yardstick the gap is judged against. */
  depth: number;
  /** `distance / depth`. 0 is exact; 1 means the guess missed by the event's own age. */
  relativeError: number;
  verdict: Verdict;
}

/** How far a guess at this event may stray and still earn `band`. */
function tolerance(band: Band, depth: number): number {
  return Math.max(band.floorYears, band.relative * depth);
}

/**
 * Grade one locked-in guess.
 *
 * `depth` is floored at 1 so an event dated to the present year cannot divide
 * by zero; at that depth the floors are doing all the work anyway.
 */
export function gradeGuess(guess: number, actual: number): GuessAccuracy {
  const distance = Math.abs(guess - actual);
  const depth = Math.max(1, Math.abs(PRESENT_YEAR - actual));
  const matched = BANDS.find((band) => distance <= tolerance(band, depth));

  return {
    distance,
    depth,
    relativeError: distance / depth,
    verdict: matched?.verdict ?? "bad",
  };
}

/**
 * The same grading as a number, for the head-to-head mode.
 *
 * Two players need to be ranked against each other, and a tier cannot do it:
 * at four tiers over ten questions most matches would end level. So this turns
 * the grade into points — but it is **the existing grade**, read off more
 * finely, not a second opinion about difficulty sitting beside the first.
 *
 * Every number below comes out of `BANDS`. A tier owns a contiguous slice of
 * the scale, and inside its slice the points slide with the same relative
 * error that chose the tier in the first place. Two consequences, both
 * deliberate:
 *
 *   * **Points can never disagree with the word on screen.** Any "great" beats
 *     any "good", because their slices do not overlap. A player told they did
 *     better cannot have scored less.
 *   * **Retuning difficulty is still one edit.** Move a band and both the tier
 *     and the points move with it; there is no second table to keep in step.
 *
 * `bad` has no outer edge to interpolate against, so it decays hyperbolically
 * from the last band's tolerance: twice as far out is half the points. That is
 * scale-free, which is the whole point of grading on relative error — it means
 * "less hopelessly wrong" still beats "more hopelessly wrong" without deep-time
 * answers and modern ones needing different rules.
 *
 * Note this is not the same question as `timelineResult`'s hit/miss, which is
 * about whether a guess counted toward a solo set's percentage. A "bad" guess
 * is still a miss there; here it can still out-score a worse one.
 */

/**
 * Where each tier's slice of the scale starts and ends: `perfect` spans
 * (85, 100], `great` (60, 85], `good` (30, 60], `bad` [0, 30]. One more entry
 * than there are tiers, because each boundary is shared by the pair it
 * separates — which is what makes the scale continuous across a tier change
 * rather than stepping.
 */
const POINT_BOUNDS = [100, 85, 60, 30, 0] as const;

/** The most one round can be worth. */
export const MAX_ROUND_POINTS = POINT_BOUNDS[0];

export function roundPoints(accuracy: GuessAccuracy): number {
  const { distance, depth, verdict } = accuracy;
  const tier = VERDICTS.indexOf(verdict);
  const top = POINT_BOUNDS[tier]!;

  if (verdict === "bad") {
    // Outside every band: decay from the widest one's edge, where this picks
    // up exactly the 30 that `good` bottoms out at.
    const widest = tolerance(BANDS[BANDS.length - 1]!, depth);
    if (distance <= 0) return top;
    return Math.round(Math.max(0, Math.min(top, top * (widest / distance))));
  }

  // The slice of the year-gap this tier covers: from the previous band's
  // tolerance (0 for the best tier) out to its own.
  const inner = tier === 0 ? 0 : tolerance(BANDS[tier - 1]!, depth);
  const outer = tolerance(BANDS[tier]!, depth);
  const span = outer - inner;
  const into = span <= 0 ? 0 : (distance - inner) / span;

  return Math.round(top - into * (top - POINT_BOUNDS[tier + 1]!));
}

/** Narrows a verdict that has been round-tripped through the database. */
export function isVerdict(value: string): value is Verdict {
  return (VERDICTS as readonly string[]).includes(value);
}
