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
 * relative band there would demand the exact year for anything above the
 * bottom tier. The floors are the point at which the relative rule stops being
 * the binding one, not a fudge: by `tolerance()` below, whichever of the two is
 * more generous wins.
 *
 * Both sequences are monotonic, so the bands nest and the first match is
 * always the best one.
 */

import { PRESENT_YEAR } from "../historical-date.ts";

/**
 * Best to worst. The order is the order they are tested in.
 *
 * Five tiers since 2026-10-07, up from four. The old ladder was perfect →
 * great → good → bad, where "bad" was labelled "Way off" and swallowed
 * everything outside the widest band — about half of all guesses, which is
 * what made the game read as unfair. The new rung is a real tier between
 * "good" and the floor, and `wayOff` is now only the genuinely hopeless
 * answers.
 *
 * `wayOff` rather than keeping `bad` as the worst id: the labels on screen are
 * Way off / Bad / Good / Great / Perfect, and an id that printed as "Way off"
 * while a different id printed as "Bad" is exactly the kind of thing that gets
 * mis-read later. The one price is that the timed-out answer in
 * `versus_seat_result()` names this string in SQL — see
 * supabase/migrations/20261007120000_versus_way_off_verdict.sql.
 */
export const VERDICTS = ["perfect", "great", "good", "bad", "wayOff"] as const;
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
 *
 * **`perfect` is the exact year and nothing else.** It carried a 2.5% band
 * until 2026-10-07, which made it the commonest verdict of all on a drag: 40%
 * of guesses at a realistic aim. It is now the thing you can only do on
 * purpose, with the arrow keys, and the tier under it is what a very good drag
 * earns.
 *
 * The other three were widened in the same pass, and the numbers are calibrated
 * rather than picked. Modelling a player who lands within ~8% of the rail's
 * width — the error that reproduces the reported "five in ten are way off"
 * under the old bands — these give: great 15%, good 32%, bad 37%, way off 15%.
 * A player holding ~4% gets great 26%, good 40%, bad 29%, way off 5%. What they
 * mean in years is easier to judge from an example or two: on Columbus (1492)
 * great is 27 years, good 107, bad 454; on the moon landing, where the floors
 * are doing all the work, 8 / 35 / 100.
 */
const BANDS: readonly Band[] = [
  { verdict: "perfect", relative: 0, floorYears: 0 },
  { verdict: "great", relative: 0.05, floorYears: 8 },
  { verdict: "good", relative: 0.2, floorYears: 35 },
  { verdict: "bad", relative: 0.85, floorYears: 100 },
];

/**
 * The football game's bands, and the reason a second set exists at all.
 *
 * Everything above is built on time depth, which is the right yardstick for a
 * dataset spanning 4.54 billion years. A *subject* pool is the case it does
 * not fit: every football event is between 1872 and 2024, so every depth is
 * between 2 and 154 years and the relative term is tiny — `max(floor,
 * relative * depth)` resolves to the floor every single time. The general
 * floors then measure a 176-year rail in units of 8, 35 and 100 years, which
 * puts `bad` at ±100 and so over half the rail. More than half of all guesses
 * would come out `bad` or better regardless of judgement, and `wayOff` would
 * be close to unreachable: the ladder stops reporting anything.
 *
 * So the subject rail is graded in plain years, which on a rail of one human
 * century and a half is the thing a player is actually judging. `relative` is
 * 0 throughout — not a placeholder, a statement that an event's age carries no
 * information here, because every event in the pool is roughly as old as every
 * other. The floors become the whole rule and read directly as a share of the
 * rail: great ±3 (1.7%), good ±8 (4.5%), bad ±25 (14%).
 *
 * `perfect` stays the exact year and nothing else, as on the general ladder —
 * reachable on purpose with the arrow keys, since the football rail steps one
 * year at a time.
 *
 * Both sequences are still monotonic, which is what the first-match search
 * below relies on. Retuning football's difficulty is this array and nothing
 * else, exactly as `BANDS` is for the general game.
 */
export const FOOTBALL_BANDS: readonly Band[] = [
  { verdict: "perfect", relative: 0, floorYears: 0 },
  { verdict: "great", relative: 0, floorYears: 3 },
  { verdict: "good", relative: 0, floorYears: 8 },
  { verdict: "bad", relative: 0, floorYears: 25 },
];

/**
 * A tolerance ladder, worst tier implied.
 *
 * Passed wherever a guess is graded or scored, so the subject games can bring
 * their own without `gradeGuess` growing an opinion about which game is
 * calling. Defaults to `BANDS` at every call site, so nothing that plays over
 * the whole of history reads any differently.
 *
 * **The same ladder has to grade and score one guess.** A verdict chosen by
 * one set and points interpolated against another would put a guess in a tier
 * whose slice of the scale it does not sit in — so `roundPoints` takes this
 * too, and both must be given the same value.
 */
export type BandSet = readonly Band[];

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
export function gradeGuess(
  guess: number,
  actual: number,
  bands: BandSet = BANDS,
): GuessAccuracy {
  const distance = Math.abs(guess - actual);
  const depth = Math.max(1, Math.abs(PRESENT_YEAR - actual));
  const matched = bands.find((band) => distance <= tolerance(band, depth));

  return {
    distance,
    depth,
    relativeError: distance / depth,
    verdict: matched?.verdict ?? "wayOff",
  };
}

/**
 * The same grading as a number, for the head-to-head mode.
 *
 * Two players need to be ranked against each other, and a tier cannot do it:
 * at five tiers over ten questions most matches would end level. So this turns
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
 * `wayOff` has no outer edge to interpolate against, so it decays
 * hyperbolically from the last band's tolerance: twice as far out is half the
 * points. That is scale-free, which is the whole point of grading on relative
 * error — it means "less hopelessly wrong" still beats "more hopelessly wrong"
 * without deep-time answers and modern ones needing different rules.
 *
 * Note this is not the same question as `timelineResult`'s hit/miss, which is
 * about whether a guess counted toward a solo set's percentage. A "way off"
 * guess is still a miss there; here it can still out-score a worse one.
 */

/**
 * Where each tier's slice of the scale starts and ends: `great` spans
 * (70, 90], `good` (45, 70], `bad` (20, 45], `wayOff` [0, 20]. One more entry
 * than there are tiers, because each boundary is shared by the pair it
 * separates — which is what makes the scale continuous across a tier change
 * rather than stepping.
 *
 * `perfect` is the exception, and it is the band structure that makes it one:
 * its tolerance is zero, so its slice is the single point `distance === 0` and
 * it is always worth the full 100. The ten points between it and the top of
 * `great` are deliberately unreachable — an exact answer is a different kind of
 * thing from a near miss, and the scale says so.
 */
const POINT_BOUNDS = [100, 90, 70, 45, 20, 0] as const;

/** The most one round can be worth. */
export const MAX_ROUND_POINTS = POINT_BOUNDS[0];

export function roundPoints(
  accuracy: GuessAccuracy,
  bands: BandSet = BANDS,
): number {
  const { distance, depth, verdict } = accuracy;
  const tier = VERDICTS.indexOf(verdict);
  const top = POINT_BOUNDS[tier]!;

  if (verdict === "wayOff") {
    // Outside every band: decay from the widest one's edge, where this picks
    // up exactly the 20 that `bad` bottoms out at.
    const widest = tolerance(bands[bands.length - 1]!, depth);
    if (distance <= 0) return top;
    return Math.round(Math.max(0, Math.min(top, top * (widest / distance))));
  }

  // The slice of the year-gap this tier covers: from the previous band's
  // tolerance (0 for the best tier) out to its own.
  const inner = tier === 0 ? 0 : tolerance(bands[tier - 1]!, depth);
  const outer = tolerance(bands[tier]!, depth);
  const span = outer - inner;
  const into = span <= 0 ? 0 : (distance - inner) / span;

  return Math.round(top - into * (top - POINT_BOUNDS[tier + 1]!));
}

/** Narrows a verdict that has been round-tripped through the database. */
export function isVerdict(value: string): value is Verdict {
  return (VERDICTS as readonly string[]).includes(value);
}
