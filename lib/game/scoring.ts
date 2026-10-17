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
 * The basketball game's bands.
 *
 * Graded in plain years for the reason football's and film's are: every event
 * in the pool is between 2 and 135 years old, so `relative * depth` would
 * always resolve to the floor and an event's age carries no information when
 * every event in the pool is roughly as old as every other. `relative` is 0
 * throughout — a statement, not a placeholder.
 *
 * The numbers are between the two existing subject sets, because this pool's
 * shape is: the rail is 151 years wide (`BASKETBALL_MIN_YEAR` to the present),
 * which sits between football's 176 and film's 126, and like film it is dense
 * at the right-hand end — 54 of the 105 events are 2000 or later, which is 17%
 * of the rail, and 80 of them are 1980 or later, which is 30%.
 *
 * So `great` takes film's ±2 rather than football's ±3: inside a cluster that
 * tight, three years spans most of a dynasty and the Warriors' 2015–2019 run
 * would grade the same whichever of its five seasons a player named. The two
 * wider bands keep football's share of the rail instead of film's, because the
 * events themselves are decades apart in a way premieres are not — ±7 / ±20 is
 * 4.6% / 13.2% of this rail, against football's 4.5% / 14% and film's 4.8% /
 * 11.9%. `wayOff` beyond 20 years still means a wrong era of the sport rather
 * than a wrong guess at the era's end.
 *
 * `perfect` stays the exact year and nothing else, reachable on purpose with
 * the arrow keys or the date entry. Both sequences are monotonic, which is what
 * the first-match search below relies on. Retuning this game's difficulty is
 * this array and nothing else.
 */
export const BASKETBALL_BANDS: readonly Band[] = [
  { verdict: "perfect", relative: 0, floorYears: 0 },
  { verdict: "great", relative: 0, floorYears: 2 },
  { verdict: "good", relative: 0, floorYears: 7 },
  { verdict: "bad", relative: 0, floorYears: 20 },
];

/**
 * The film & television game's bands.
 *
 * Graded in plain years for the same reason football's are — every entry in
 * the pool is between 2 and 95 years old, so an event's age carries no
 * information and `relative` is 0 throughout — but the numbers are not
 * football's, because the two pools are not shaped alike.
 *
 * The rail is 126 years wide (`SCREEN_MIN_YEAR` to the present) and more than
 * half the 200 entries sit in the twenty years from 2000, which is 16% of it.
 * So the game is decided inside the cluster, and the bands have to be narrow
 * enough to say something there: at football's ±8 for `good`, a player who
 * knew nothing beyond "it looks recent" and parked the marker on 2010 would
 * earn `good` or better on roughly a quarter of the pool.
 *
 * ±2 / ±6 / ±15 is 1.6% / 4.8% / 11.9% of the rail, against football's 1.7% /
 * 4.5% / 14%. Tighter at the floor and at the top, which is the right trade
 * for a dataset this dense: a five-year window for `great` is what a player
 * who reads a poster's typography, cast and film stock can actually hit, and
 * `wayOff` beyond 15 years still means a wrong decade rather than a wrong
 * guess at the decade's end.
 *
 * `perfect` stays the exact year and nothing else, reachable on purpose with
 * the arrow keys or the date entry. Both sequences are monotonic, which is
 * what the first-match search below relies on. Retuning this game's
 * difficulty is this array and nothing else.
 */
export const SCREEN_BANDS: readonly Band[] = [
  { verdict: "perfect", relative: 0, floorYears: 0 },
  { verdict: "great", relative: 0, floorYears: 2 },
  { verdict: "good", relative: 0, floorYears: 6 },
  { verdict: "bad", relative: 0, floorYears: 15 },
];

/**
 * The "Born When?" game's bands — and the one subject pool that goes back to
 * depth rather than to plain years.
 *
 * Football and film are graded in plain years because their pools are thin
 * slices of time: every entry is 2 to 154 years old, so `relative * depth` is
 * always smaller than the floor and the relative term carries no information.
 * This pool is the opposite case. Its people were born between 1341 BCE and
 * 1997, so depth runs from 29 years to 3,367 — a factor of 116, which is the
 * situation the general `BANDS` were designed for.
 *
 * It matters because knowing a birth year is not equally hard across that
 * span. Pythagoras is dated "around 570 BCE" by the sources themselves; the
 * year is genuinely uncertain and a player who answers 600 BCE has understood
 * the question. Einstein's 1879 is a fact, and 1909 is not a near miss. Plain
 * years cannot say both: ±12 for Pythagoras is a tolerance no one can honestly
 * hit, and ±65 for Einstein rewards not knowing. Depth says both at once.
 *
 * **The three rails are what make depth safe here.** The general ladder's
 * `bad: 0.85` would put Tutankhamun's bottom band at 2,862 years — 191% of the
 * rail he stands on, so every possible drag would score `bad` or better and
 * `wayOff` would be unreachable. That is the same failure the football note
 * describes, arriving from the other direction. These bands are tightened until
 * the widest tolerance in the pool fits inside its own rail with room to miss:
 *
 *   great 0.025 / 12y     Einstein ±12 (2.3% of his rail), Pythagoras ±65 (4.3%)
 *   good  0.10  / 30y     Einstein ±30 (5.7%),             Pythagoras ±260 (17.3%)
 *   bad   0.20  / 75y     Einstein ±75 (14.3%),            Pythagoras ±519 (34.6%)
 *
 * Calibrated the way `BANDS` was, against a player who lands within a given
 * share of the rail's width: at ~4% that gives great 22% / good 52% / bad 25%,
 * and at ~8% great 11% / good 30% / bad 43% / way off 16%. So the ladder keeps
 * reporting at both ends — which is the whole test a band set has to pass.
 *
 * `perfect` is the exact year and nothing else, as on every other ladder. Each
 * rail steps one year per arrow press (`keyStepFraction`), so it is reachable
 * on all three.
 *
 * Both sequences are monotonic, which is what the first-match search below
 * relies on. Retuning this game's difficulty is this array and nothing else.
 */
export const WHEN_BORN_BANDS: readonly Band[] = [
  { verdict: "perfect", relative: 0, floorYears: 0 },
  { verdict: "great", relative: 0.025, floorYears: 12 },
  { verdict: "good", relative: 0.1, floorYears: 30 },
  { verdict: "bad", relative: 0.2, floorYears: 75 },
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
 * `gradeGuess` run backwards: the whole-year gaps that grade as `verdict` for
 * an event at `actual`, inclusive.
 *
 * For a caller that has to *produce* a guess of a given quality rather than
 * judge one — the head-to-head's computer opponent (lib/game/versus-bot.ts)
 * picks a tier first and then a gap inside it. Read off the same `tolerance()`
 * and the same first-match order as the grader, so the two cannot drift: an
 * integer gap is within a tolerance exactly when it is within that
 * tolerance's floor, so band `i` owns `floor(tol(i-1)) < d <= floor(tol(i))`.
 * The floors rather than the raw tolerances, because a fractional edge like
 * 1724.65 admits 1724 and refuses 1725 exactly as 1724 would. "Tune only via
 * `BANDS`" stays true: nothing here is a number of its own.
 *
 * `perfect`'s zero tolerance makes it `[0, 0]`. `wayOff` has no band of its
 * own, so it opens one year past the widest band and has no outer edge —
 * `max` is `Infinity`; the rails are the caller's business, not the ladder's.
 *
 * Null when the band is empty for this event: two tolerances that floor to the
 * same year leave nothing between them. The general ladder never does that
 * (its floors alone strictly increase), but a subject ladder could, and a
 * caller has to be told rather than handed an inverted range.
 */
export function verdictDistanceRange(
  verdict: Verdict,
  actual: number,
  bands: BandSet = BANDS,
): { min: number; max: number } | null {
  const depth = Math.max(1, Math.abs(PRESENT_YEAR - actual));
  const found = bands.findIndex((band) => band.verdict === verdict);
  // `wayOff` is the implied tier after the last band; any other verdict the
  // ladder does not name can never be returned by `gradeGuess`.
  const at = found === -1 && verdict === "wayOff" ? bands.length : found;
  if (at === -1) return null;

  // The largest gap a better band already claims — the grader takes the first
  // band that fits, so everything up to here is somebody else's.
  let claimed = -1;
  for (let i = 0; i < at; i += 1) {
    claimed = Math.max(claimed, Math.floor(tolerance(bands[i]!, depth)));
  }

  const min = claimed + 1;
  if (at === bands.length) return { min, max: Infinity };

  const max = Math.floor(tolerance(bands[at]!, depth));
  return min <= max ? { min, max } : null;
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
