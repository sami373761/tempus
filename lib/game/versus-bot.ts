/**
 * The online head-to-head's stand-in opponent: what it guesses, how well, and
 * how long it takes to say so.
 *
 * When nobody else is searching, a public lobby is filled after a few seconds
 * by a seat with no browser behind it (see `versus_seat_bot()` in
 * supabase/migrations/20261017180000_versus_online.sql). Its ten answers are
 * planned here, all at once, the moment it sits down; the database keeps them
 * on `match_round` and commits each one when its thinking time has passed. So
 * this module is pure — no clock, no database, no `server-only` — and runs the
 * same under Next and under plain node, which is how
 * scripts/check-versus-bot.ts can play it half a million times a run.
 *
 * **Strength is chosen, not simulated.** The obvious design — aim at the right
 * year, add noise — makes the bot's tier distribution a side effect of a noise
 * model and of the band maths together, different for every event and
 * impossible to read off. This goes the other way: a profile states the share
 * of answers it gives in each tier (`CHARACTER_MATRIX`), a tier is drawn from
 * that, and only then is a year found that *grades as* that tier
 * (`verdictDistanceRange` in lib/game/scoring.ts is `gradeGuess` run
 * backwards). Every step after the draw is checked against the grader and
 * retried if it moved the answer into another tier, so the matrix is what a
 * player meets, on the moon landing and on the formation of the Earth alike.
 *
 * **Everything after the draw is about looking like a person.** A person's
 * misses have a shape, and a bot whose misses do not would be spotted within a
 * match:
 *
 *   1. the gap is drawn inside the tier's own range, nearer its inner edge;
 *   2. era perception bends it — nobody guesses the 1600s for the moon landing
 *      as a *near* miss, but nobody guesses 3000 BCE for it either, while for
 *      deep time people lose whole orders of magnitude;
 *   3. it is snapped to a year the slider can actually produce — an opponent
 *      marker on a year no drag can reach (1,234,567 BCE on a 10-year grid)
 *      would out the bot to anyone who looked;
 *   4. sometimes it is rounded, the way people say "about 1900" or "ten
 *      million years ago", but never into a different tier.
 *
 * History mode only: the panes are `TIMELINE_PANES` and the ladder is the
 * default `BANDS`. Public matches are history-only by constraint
 * (`match_public_is_history`), so a bot never meets a subject rail.
 *
 * `verdict` and `points` on a planned move are always `gradeGuess` /
 * `roundPoints` of the final year — the one grader — never the tier that was
 * drawn. The draw is an intention; the grade is the fact.
 */

import { PRESENT_YEAR } from "../historical-date.ts";
import {
  gradeGuess,
  roundPoints,
  VERDICTS,
  verdictDistanceRange,
  type Verdict,
} from "./scoring.ts";
import {
  bceDisplayToYear,
  fractionAtYear,
  paneBounds,
  paneForYear,
  TIMELINE_PANES,
  yearAtFraction,
  yearToBceDisplay,
  type TimelinePane,
} from "./timeline.ts";

/* -------------------------------------------------------------------------
   Profiles
   ------------------------------------------------------------------------- */

/**
 * The six characters. Stored on `match_player.bot_archetype` as these strings,
 * so a rename is a data migration, not a refactor.
 */
export const BOT_ARCHETYPES = [
  "rookie",
  "gambler",
  "clerk",
  "modernist",
  "sniper",
  "historian",
] as const;
export type BotArchetype = (typeof BOT_ARCHETYPES)[number];

/** A bot's level is the league of the player it was seated against. */
export type BotLevel = 1 | 2 | 3;

/** Uniform on [0, 1). The server passes a crypto source; the check a seeded one. */
export type Rng = () => number;

export interface BotProfile {
  archetype: BotArchetype;
  level: BotLevel;
  /** Share of answers in each tier, summing to 1, before the modernist rule. */
  weights: Readonly<Record<Verdict, number>>;
  /** Thinking time, seconds, [min, max). */
  thinkSeconds: readonly [number, number];
}

/** One matrix row: the five tier weights in percent, then the think window in seconds. */
type MatrixRow = readonly [
  perfect: number,
  great: number,
  good: number,
  bad: number,
  wayOff: number,
  thinkMin: number,
  thinkMax: number,
];

/**
 * The character matrix, in percent, transcribed from the design brief.
 *
 * Read across a row for what a character is like and down a column for how a
 * level changes it. The shapes are the characters: the rookie is mostly wrong
 * and quick about it; the gambler swings — more `great` than `good`, and more
 * `wayOff` than anyone; the clerk is slow, lives in `good` and is almost never
 * far out; the sniper has the most exact answers in the table and still misses
 * like anyone; the historian puts the most mass in the two tiers above `bad`.
 * The modernist's row is its average — see `tierWeightsFor`, which bends it by
 * era. Each row sums to 100; the check script asserts it.
 *
 * The think windows all close well inside `ROUND_SECONDS` (25 s) because
 * `versus_reconcile()` only commits an answer whose moment falls before the
 * deadline — a bot that thought for 26 seconds would simply time out.
 */
const CHARACTER_MATRIX: Readonly<
  Record<BotArchetype, Readonly<Record<BotLevel, MatrixRow>>>
> = {
  rookie: {
    1: [0.5, 8.0, 22.0, 37.0, 32.5, 2, 5],
    2: [1.0, 12.0, 27.0, 35.0, 25.0, 2, 6],
    3: [1.5, 16.0, 32.0, 32.0, 18.5, 3, 6],
  },
  gambler: {
    1: [3.0, 22.0, 12.0, 25.0, 38.0, 4, 10],
    2: [4.0, 27.0, 15.0, 22.0, 32.0, 4, 10],
    3: [5.5, 32.0, 16.0, 20.0, 26.5, 4, 9],
  },
  clerk: {
    1: [0.5, 16.0, 48.0, 27.0, 8.5, 7, 14],
    2: [1.0, 21.0, 53.0, 20.0, 5.0, 8, 14],
    3: [1.5, 26.0, 56.0, 14.0, 2.5, 8, 15],
  },
  modernist: {
    1: [2.0, 22.0, 30.0, 26.0, 20.0, 5, 11],
    2: [3.0, 27.0, 33.0, 22.0, 15.0, 5, 11],
    3: [4.0, 32.0, 36.0, 18.0, 10.0, 5, 10],
  },
  sniper: {
    1: [4.5, 18.0, 32.0, 27.0, 18.5, 4, 12],
    2: [6.0, 21.0, 35.0, 23.0, 15.0, 4, 12],
    3: [7.5, 23.0, 38.0, 20.0, 11.5, 5, 12],
  },
  historian: {
    1: [2.5, 28.0, 36.0, 22.0, 11.5, 6, 13],
    2: [3.5, 33.0, 38.0, 17.0, 8.5, 6, 14],
    3: [4.5, 38.0, 40.0, 13.0, 4.5, 7, 15],
  },
};

const BOT_LEVELS: readonly BotLevel[] = [1, 2, 3];

function profileFromRow(
  archetype: BotArchetype,
  level: BotLevel,
  row: MatrixRow,
): BotProfile {
  const [perfect, great, good, bad, wayOff, thinkMin, thinkMax] = row;
  return Object.freeze({
    archetype,
    level,
    weights: Object.freeze({
      perfect: perfect / 100,
      great: great / 100,
      good: good / 100,
      bad: bad / 100,
      wayOff: wayOff / 100,
    }),
    thinkSeconds: Object.freeze([thinkMin, thinkMax] as const),
  });
}

/** Built once: a profile is a constant, and callers may compare them by identity. */
const PROFILES: Readonly<
  Record<BotArchetype, Readonly<Record<BotLevel, BotProfile>>>
> = Object.fromEntries(
  BOT_ARCHETYPES.map((archetype) => [
    archetype,
    Object.fromEntries(
      BOT_LEVELS.map((level) => [
        level,
        profileFromRow(archetype, level, CHARACTER_MATRIX[archetype][level]),
      ]),
    ),
  ]),
) as Record<BotArchetype, Record<BotLevel, BotProfile>>;

export function botProfile(archetype: BotArchetype, level: BotLevel): BotProfile {
  return PROFILES[archetype][level];
}

/** Narrows `match_player.bot_archetype` read back from the database. */
export function isBotArchetype(value: string): value is BotArchetype {
  return (BOT_ARCHETYPES as readonly string[]).includes(value);
}

/** Every character equally likely: the league sets the strength, not the draw. */
export function pickBotArchetype(rng: Rng): BotArchetype {
  return BOT_ARCHETYPES[pickIndex(BOT_ARCHETYPES.length, rng)]!;
}

/**
 * The modernist knows the last two centuries and is lost before the common
 * era. From 1800 on, a third of its bad answers turn into good ones; before 1
 * BCE, a third of its good ones turn bad. Between the two it plays its row.
 *
 * Expressed as a mass shift rather than as two extra matrix rows so that the
 * row stays the character's average and the rule stays one sentence: 35% of
 * the losing tiers' weight moves to the winning ones, split in proportion to
 * what they already hold. `perfect` is untouched in both directions — an exact
 * year is a thing you know, not an era you feel.
 */
const MODERNIST_SHIFT = 0.35;
const MODERNIST_HOME_FROM = 1800;

/** The tier weights this profile plays at for an event in `actual`, summing to 1. */
export function tierWeightsFor(
  profile: BotProfile,
  actual: number,
): Record<Verdict, number> {
  const weights: Record<Verdict, number> = { ...profile.weights };

  if (profile.archetype === "modernist") {
    if (actual >= MODERNIST_HOME_FROM) {
      shiftMass(weights, ["bad", "wayOff"], ["great", "good"], MODERNIST_SHIFT);
    } else if (actual < 0) {
      shiftMass(weights, ["great", "good"], ["bad", "wayOff"], MODERNIST_SHIFT);
    }
  }

  // Normalised anyway: the matrix sums to 100 by inspection, and the check
  // script asserts it, but a weight vector that sums to 0.999 would quietly
  // give its last tier the remainder of every draw.
  const total = VERDICTS.reduce((sum, verdict) => sum + weights[verdict], 0);
  for (const verdict of VERDICTS) weights[verdict] /= total;
  return weights;
}

function shiftMass(
  weights: Record<Verdict, number>,
  from: readonly Verdict[],
  to: readonly Verdict[],
  share: number,
): void {
  const receiving = to.reduce((sum, verdict) => sum + weights[verdict], 0);
  let moved = 0;
  for (const verdict of from) {
    moved += weights[verdict] * share;
    weights[verdict] *= 1 - share;
  }
  for (const verdict of to) {
    weights[verdict] +=
      receiving > 0 ? moved * (weights[verdict] / receiving) : moved / to.length;
  }
}

/* -------------------------------------------------------------------------
   The rail
   ------------------------------------------------------------------------- */

/**
 * The whole general timeline, oldest to newest: 10 billion BCE to the present.
 * Read off the panes rather than written down, so it moves if they do.
 */
const RAIL = {
  min: paneBounds(TIMELINE_PANES[0]!).min,
  max: paneBounds(TIMELINE_PANES[TIMELINE_PANES.length - 1]!).max,
} as const;

/** The rail's left edge as a display BCE year — the cosmos pane's far end. */
const RAIL_MAX_DISPLAY = yearToBceDisplay(RAIL.min);

/**
 * The year the slider would produce if a player let go of it at `year`.
 *
 * Literally the drag's own maths — `yearAtFraction(fractionAtYear(...))` on
 * the pane the year lives on, exactly what `lockIn` in
 * components/versus-game.tsx reads off the marker — so it cannot disagree with
 * the grid by construction: whole years on the common-era and civilisation
 * panes, display multiples of 10 through evolution and of 100 through the
 * cosmos, and nothing past the present. A year off the rail is clamped onto it
 * first, as `fractionAtYear` would.
 */
export function snapToRail(year: number): number {
  const at = Math.min(RAIL.max, Math.max(RAIL.min, year));
  const pane = paneForYear(at, TIMELINE_PANES);
  return yearAtFraction(pane, fractionAtYear(pane, at));
}

/** Whether `year` is one the slider can produce: whole, on the rails, on the grid. */
export function isOnRail(year: number): boolean {
  return (
    Number.isInteger(year) &&
    year >= RAIL.min &&
    year <= RAIL.max &&
    snapToRail(year) === year
  );
}

/* -------------------------------------------------------------------------
   Era perception
   ------------------------------------------------------------------------- */

/**
 * The recent anchor. For anything from 1850 on, every answer — however bad —
 * stays inside [1600, present]. A person who sees a photograph of the moon
 * landing can be badly wrong about it, but they are wrong by a century or two,
 * not by an era: "sometime in the 1700s" is the worst anyone says, and 3000 BCE
 * is a guess only a program would make. Without this the wayOff tier, whose
 * band is open-ended, would put a modern event's misses anywhere in deep time.
 */
const RECENT_ANCHOR_FROM = 1850;
const RECENT_WINDOW = { min: 1600, max: RAIL.max } as const;

interface Span {
  min: number;
  max: number;
}

/** Where a guess at this event may land at all. */
function windowFor(actual: number): Span {
  return actual >= RECENT_ANCHOR_FROM ? RECENT_WINDOW : RAIL;
}

/** The constraint every final guess is checked against, rounding included. */
function acceptable(guess: number, verdict: Verdict, actual: number): boolean {
  if (!isOnRail(guess)) return false;
  const window = windowFor(actual);
  if (guess < window.min || guess > window.max) return false;
  return gradeGuess(guess, actual).verdict === verdict;
}

/* -------------------------------------------------------------------------
   Step 1 — a gap inside the drawn tier
   ------------------------------------------------------------------------- */

/**
 * How strongly a near miss leans toward the tier's inner edge. `u^1.3` puts the
 * median a little inside the band's middle: people who are "good" are more
 * often just-good than nearly-bad, but not by much.
 */
const BAND_INNER_BIAS = 1.3;

/**
 * The open-ended tier, drawn as decades past its threshold: usually within
 * 0.6 of a decade (up to ~4x the threshold), and one time in four within 1.3
 * (up to ~20x) — the occasional answer that is not just wrong but in another
 * part of history entirely. Written as the mixture it is, two uniform laws in
 * log space, because a mixture of uniforms is the one law whose truncation is
 * exact and loop-free (see `wayOffMass`).
 */
const WAY_OFF_LAW = [
  { share: 0.75, decades: 0.6 },
  { share: 0.25, decades: 1.3 },
] as const;

interface Side {
  sign: -1 | 1;
  /** The furthest this side allows, already capped at the tier's own edge. */
  reach: number;
}

/** Older and newer, each kept only if it has room for at least the tier's inner edge. */
function sidesFor(actual: number, range: Span, window: Span): Side[] {
  const sides: Side[] = [];
  const older = actual - window.min;
  if (older >= range.min) sides.push({ sign: -1, reach: Math.min(range.max, older) });
  const newer = window.max - actual;
  if (newer >= range.min) sides.push({ sign: 1, reach: Math.min(range.max, newer) });
  return sides;
}

/**
 * The plain draw: a miss as likely early as late, cut off where the rail or
 * the era window ends.
 *
 * **A side is chosen by how much of the tier's own gap law fits on it**, never
 * evenly. The two sides are rarely the same size: an event from 2016 has ten
 * years of rail after it and all of history before it, so its `good` band
 * (9–35 years) fits whole on the older side and only as 9–10 on the newer.
 * Split evenly, with the newer half squeezed into the room it has, half of
 * every good answer would land on 2025 or 2026 and half of a 1789 event's
 * wayOff answers in 1991–2026 — a pile on the present that no person makes and
 * anyone could see. Weighted by the law's mass, the newer side gets what a
 * symmetric miss would give it: 2016's good answers reach 2025–26 about one
 * time in ten, and a pre-modern event's wayOff answers turn modern about 9% of
 * the time — as often as the older side misses by the same factor of the
 * event's age (6.7x, from the wide tail), so in log-age, the scale people
 * misjudge age on, the misses stay even. Within the chosen side the gap is the
 * same law truncated at its reach, so a side's share and the shape of what
 * lands on it cannot disagree.
 */
function sampleBand(
  verdict: Verdict,
  range: Span,
  actual: number,
  window: Span,
  rng: Rng,
): number | null {
  const sides = sidesFor(actual, range, window);
  if (sides.length === 0) return null;

  const wayOff = verdict === "wayOff";
  const mass = sides.map((side) =>
    wayOff
      ? wayOffMass(range.min, side.reach).reduce((sum, m) => sum + m, 0)
      : bandMass(range, side.reach),
  );
  const side = sides[pickWeighted(mass, rng)]!;

  const gap = wayOff
    ? wayOffGap(range.min, side.reach, rng)
    : bandGap(range, side.reach, rng());
  return actual + side.sign * gap;
}

/**
 * The share of a bounded tier's law, `min + span·u^1.3`, that rounds to
 * `reach` or less.
 *
 * Every truncation here counts the half-year past `reach`: a gap is rounded to
 * a whole year, so a draw just under `reach + 0.5` still lands on `reach`.
 * Without it a side with room for only the tier's inner edge — a 2017 event's
 * good band, which on the newer side can only say 2026 — would weigh nothing
 * instead of the one year's worth it really holds.
 */
function bandMass(range: Span, reach: number): number {
  const span = range.max - range.min;
  if (span <= 0) return 1;
  return Math.min(1, ((reach - range.min + 0.5) / span) ** (1 / BAND_INNER_BIAS));
}

/**
 * The bounded law conditioned on not passing `reach`. A power of a uniform cut
 * at a fraction of its range is the same power over the shorter range, so the
 * truncated draw is the plain one with a smaller span: the inner-edge lean is
 * kept, and nothing is folded back onto the far end.
 */
function bandGap(range: Span, reach: number, u: number): number {
  const span = Math.min(range.max - range.min, reach - range.min + 0.5);
  return clamp(Math.round(range.min + span * u ** BAND_INNER_BIAS), range.min, reach);
}

/** Decades past `threshold` that still round to `reach` or less. */
function wayOffRoom(threshold: number, reach: number): number {
  return Math.log10((reach + 0.5) / threshold);
}

/** Each `WAY_OFF_LAW` component's mass within `reach`; summed, the law's CDF there. */
function wayOffMass(threshold: number, reach: number): number[] {
  const room = wayOffRoom(threshold, reach);
  return WAY_OFF_LAW.map(({ share, decades }) => share * Math.min(1, room / decades));
}

/**
 * The open-ended law conditioned on not passing `reach`: a component drawn by
 * its mass inside the reach, then uniform in log space over the part of it
 * that fits. Nothing is pinned to the rail's end or drawn again inside what is
 * left — past the reach there is simply no mass to draw.
 */
function wayOffGap(threshold: number, reach: number, rng: Rng): number {
  const room = wayOffRoom(threshold, reach);
  const { decades } = WAY_OFF_LAW[pickWeighted(wayOffMass(threshold, reach), rng)]!;
  const gap = threshold * 10 ** (rng() * Math.min(decades, room));
  return clamp(Math.round(gap), threshold, reach);
}

/* -------------------------------------------------------------------------
   Step 2 — era perception
   ------------------------------------------------------------------------- */

/**
 * A modern event's bad and wayOff answers, drawn straight from the years that
 * grade so *and* sit in the recent window: the tier's band on each side, cut
 * to [1600, present]. A side is chosen by how many years it holds, and the gap
 * leans harder toward the event than a plain draw (`u^1.6`), so 1969's bad
 * answers bunch toward the 1930s and its wayOff ones thin out toward 1600.
 */
const RECENT_NEAR_BIAS = 1.6;

function sampleRecent(range: Span, actual: number, rng: Rng): number | null {
  const sides = sidesFor(actual, range, RECENT_WINDOW);
  if (sides.length === 0) return null;
  const side =
    sides[pickWeighted(sides.map((s) => s.reach - range.min + 1), rng)]!;
  return actual + side.sign * innerBiased(range.min, side.reach, rng(), RECENT_NEAR_BIAS);
}

/**
 * BCE scale blindness. Before the common era people stop judging distances and
 * start judging *magnitudes* — 3,000 years and 30,000 years are both "very
 * long ago", and the dinosaurs and the first cities are a click apart in the
 * mind's eye. So for a BCE event's bad and wayOff answers the gap is drawn in
 * display-BCE log space, where a miss is a ratio rather than a number of years.
 *
 * `bad`: log-uniform across the tier's band on a side chosen evenly, so a
 * fair share of the misses land on the next pane over. Where the younger side
 * of the band runs past 1 BCE into the common era (any event newer than about
 * 11,500 BCE — the band is 85% of the event's age) display years stop meaning
 * anything at the hinge, so that side is drawn log-uniform in the event's
 * *age* instead, which is continuous across it and, for anything deep, the
 * same thing to within the 2,025 years between them.
 *
 * `wayOff`: two times in three an order-of-magnitude swing (`magnitudeSwing`),
 * otherwise the plain draw. The plain draw may cross into the common era; it
 * is kept only if it still grades wayOff, which `acceptable` enforces.
 */
const BCE_SWING_CHANCE = 0.65;

function sampleBce(
  verdict: "bad" | "wayOff",
  range: Span,
  actual: number,
  rng: Rng,
): number | null {
  if (verdict === "wayOff") {
    if (rng() < BCE_SWING_CHANCE) {
      const swung = magnitudeSwing(yearToBceDisplay(actual), range.min, rng);
      if (swung !== null) return swung;
    }
    return sampleBand("wayOff", range, actual, RAIL, rng);
  }

  const display = yearToBceDisplay(actual);
  const draws: (() => number)[] = [];

  const olderLow = display + range.min;
  const olderHigh = Math.min(display + range.max, RAIL_MAX_DISPLAY);
  if (olderLow <= olderHigh) {
    draws.push(() =>
      bceDisplayToYear(Math.round(logUniform(olderLow, olderHigh, rng()))),
    );
  }

  const room = RAIL.max - actual;
  if (range.min <= room) {
    const reach = Math.min(range.max, room);
    if (display - reach >= 1) {
      const low = display - reach;
      const high = display - range.min;
      draws.push(() => bceDisplayToYear(Math.round(logUniform(low, high, rng()))));
    } else {
      const age = PRESENT_YEAR - actual;
      const low = Math.max(1, age - reach);
      const high = age - range.min;
      if (low <= high) {
        draws.push(() => PRESENT_YEAR - Math.round(logUniform(low, high, rng())));
      }
    }
  }

  if (draws.length === 0) return null;
  return draws[pickIndex(draws.length, rng)]!();
}

/**
 * Losing a power of ten. Older (seven times in ten, fewer when the cosmos
 * edge leaves less than a decade of room): the display year times
 * 10^f for f from log10(1.85) — just past where the band ends for anything
 * deep — up to three decades, stopped at the cosmos edge. Younger: divided by
 * 10^f, from log10(1/0.15) up to 4.5 decades or down to 1 BCE. That is how 65
 * million BCE becomes 10,000 BCE — the dinosaurs filed beside the first
 * farmers, which is the mistake people actually make.
 *
 * Each window's inner end is also pushed out to wherever the wayOff tier
 * actually starts, so a swing never lands in `bad` by construction (for a
 * shallow BCE event the tier starts further out than 1.85x). Null when
 * neither side has a window left — then the caller draws plainly.
 */
const SWING_OLDER_CHANCE = 0.7;
const SWING_OLDER_MIN_RATIO = 1.85;
const SWING_OLDER_MAX_DECADES = 3;
const SWING_YOUNGER_MAX_RATIO = 0.15;
const SWING_YOUNGER_MAX_DECADES = 4.5;
/** Room on the older side, in decades, at which the full older lean applies. */
const SWING_FULL_ROOM_DECADES = 1;

function magnitudeSwing(display: number, threshold: number, rng: Rng): number | null {
  const older: Span = {
    min: Math.max(
      Math.log10(SWING_OLDER_MIN_RATIO),
      Math.log10((display + threshold) / display),
    ),
    max: Math.min(SWING_OLDER_MAX_DECADES, Math.log10(RAIL_MAX_DISPLAY / display)),
  };
  const younger: Span | null =
    display - threshold >= 1
      ? {
          min: Math.max(
            Math.log10(1 / SWING_YOUNGER_MAX_RATIO),
            Math.log10(display / (display - threshold)),
          ),
          max: Math.min(SWING_YOUNGER_MAX_DECADES, Math.log10(display)),
        }
      : null;

  const olderOpen = older.min <= older.max;
  const youngerOpen = younger !== null && younger.min <= younger.max;
  if (!olderOpen && !youngerOpen) return null;

  // The lean towards "older" is scaled by how much older there is to be. For
  // the formation of the Earth the cosmos edge is a third of a decade away, and
  // a flat seven-in-ten sent most of its wild answers into that sliver — 8 to
  // 10 billion BCE, over and over — which is a pile-up, not a mistake anyone
  // makes. With a full decade of room or more the lean is the whole 0.7.
  const olderRoom = olderOpen ? older.max - older.min : 0;
  const olderChance =
    SWING_OLDER_CHANCE * Math.min(1, olderRoom / SWING_FULL_ROOM_DECADES);
  const goOlder = olderOpen && (!youngerOpen || rng() < olderChance);
  const window = goOlder ? older : younger!;
  const decades = window.min + (window.max - window.min) * rng();
  const shown = goOlder ? display * 10 ** decades : display / 10 ** decades;
  return bceDisplayToYear(Math.max(1, Math.round(shown)));
}

/** Steps 1 and 2 together: a raw year for a drawn tier, or null if it has no room. */
function sampleRaw(
  verdict: Exclude<Verdict, "perfect">,
  range: Span,
  actual: number,
  rng: Rng,
): number | null {
  if (verdict === "bad" || verdict === "wayOff") {
    if (actual >= RECENT_ANCHOR_FROM) return sampleRecent(range, actual, rng);
    if (actual < 0) return sampleBce(verdict, range, actual, rng);
  }
  return sampleBand(verdict, range, actual, windowFor(actual), rng);
}

/* -------------------------------------------------------------------------
   Step 4 — human rounding
   ------------------------------------------------------------------------- */

/**
 * Three answers in ten are rounded, the way people say "about 1900" or "ten
 * million years ago". A bot that only ever answered 1912 and 1,000,090 BCE
 * would be precise in a way nobody is.
 *
 * The units depend on where the guess is and how far back: years to decades
 * to centuries in the common era, decades to millennia before it, and in deep
 * time the leading digit of the display year itself. Each list is cut to units
 * small against the guess's own age (a quarter in the common era, a fifth in
 * civilisation, three tenths in deep time), so 2019 is never "2000" and 1,500
 * BCE is never "2,000 BCE". Larger units are preferred — that is what rounding
 * *is* — and the result has to be on the grid, inside the era window and in
 * the drawn tier, so the profile's distribution survives it. If no unit
 * qualifies the snapped guess stands.
 */
const HUMAN_ROUNDING_CHANCE = 0.3;
const CE_UNITS = [5, 10, 25, 50, 100, 250] as const;
const CE_UNIT_SHARE = 0.25;
const CIVILIZATION_UNITS = [10, 25, 50, 100, 250, 500, 1000, 2000] as const;
const CIVILIZATION_UNIT_SHARE = 0.2;
const DEEP_UNIT_SHARE = 0.3;

/** Eligible units for a guess on this pane, smallest first. */
function naturalUnits(pane: TimelinePane, year: number): number[] {
  switch (pane) {
    case "ce": {
      const age = PRESENT_YEAR - year;
      return CE_UNITS.filter((unit) => unit <= CE_UNIT_SHARE * age);
    }
    case "civilization": {
      const display = yearToBceDisplay(year);
      return CIVILIZATION_UNITS.filter(
        (unit) => unit <= CIVILIZATION_UNIT_SHARE * display,
      );
    }
    case "evolution":
    case "cosmos": {
      const display = yearToBceDisplay(year);
      const magnitude = Math.floor(Math.log10(display));
      const base = 10 ** (magnitude - 1);
      return [base, 2 * base, 5 * base, 10 * base].filter(
        (unit) => unit <= DEEP_UNIT_SHARE * display,
      );
    }
    default:
      return [];
  }
}

/**
 * The two multiples of `unit` either side of `value`, nearest first. BCE
 * guesses are rounded as display years — 1,000,090 BCE to 1,000,000 BCE, not
 * astronomical -1,000,089 to -1,000,000, which would print as 1,000,001 BCE.
 */
function roundingCandidates(pane: TimelinePane, year: number, unit: number): number[] {
  const bce = pane !== "ce";
  const value = bce ? yearToBceDisplay(year) : year;
  const down = Math.floor(value / unit) * unit;
  const up = down + unit;
  const ordered = down === value ? [value] : value - down < up - value ? [down, up] : [up, down];
  return bce ? ordered.map(bceDisplayToYear) : ordered;
}

type Rounding = "none" | "kept" | "rounded";

function humanRound(
  guess: number,
  verdict: Verdict,
  actual: number,
  rng: Rng,
): { guess: number; rounding: Rounding } {
  if (verdict === "perfect" || rng() >= HUMAN_ROUNDING_CHANCE) {
    return { guess, rounding: "none" };
  }

  const pane = paneForYear(guess, TIMELINE_PANES);
  const units = naturalUnits(pane, guess);
  if (units.length === 0) return { guess, rounding: "none" };

  // Weighted 1, 2, 3, … by size: the largest eligible unit is the likeliest.
  const chosen = pickWeighted(units.map((_, i) => i + 1), rng);
  for (let i = chosen; i >= 0; i -= 1) {
    for (const candidate of roundingCandidates(pane, guess, units[i]!)) {
      if (acceptable(candidate, verdict, actual)) {
        return { guess: candidate, rounding: "rounded" };
      }
    }
  }
  return { guess, rounding: "kept" };
}

/* -------------------------------------------------------------------------
   Planning
   ------------------------------------------------------------------------- */

export interface BotMove {
  guess: number;
  verdict: Verdict;
  points: number;
  thinkMs: number;
}

/** A move and how it was arrived at — for scripts/check-versus-bot.ts. */
export interface BotMoveTrace {
  move: BotMove;
  /** The tier drawn from the profile, before any downgrade or fallback. */
  drawn: Verdict;
  /** The snapped guess before step 4. */
  unrounded: number;
  /** `rounded`: step 4 replaced the guess; `kept`: it tried and nothing qualified. */
  rounding: Rounding;
  /** True when the final tier is not the drawn one (perfect off the grid, or no room). */
  fellBack: boolean;
}

/**
 * How many draws a tier gets before it is given up on. Validation fails only
 * when the grid snap or a rounding of the raw draw lands across a band edge,
 * which on the general ladder is rare — forty is generous, and the fallback
 * tiers get fewer because they are already the unusual path.
 */
const DRAWN_ATTEMPTS = 40;
const FALLBACK_ATTEMPTS = 12;

function placeGuess(
  verdict: Verdict,
  actual: number,
  rng: Rng,
  attempts: number,
): { guess: number; unrounded: number; rounding: Rounding } | null {
  // An exact answer is the event's own year, and only if the slider can say
  // it; it is never rounded.
  if (verdict === "perfect") {
    return acceptable(actual, "perfect", actual)
      ? { guess: actual, unrounded: actual, rounding: "none" }
      : null;
  }

  const range = verdictDistanceRange(verdict, actual);
  if (range === null) return null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const raw = sampleRaw(verdict, range, actual, rng);
    if (raw === null) return null;

    const snapped = snapToRail(raw);
    if (!acceptable(snapped, verdict, actual)) continue;

    return { unrounded: snapped, ...humanRound(snapped, verdict, actual, rng) };
  }
  return null;
}

/**
 * The tiers to try when the drawn one has no room, nearest first and the worse
 * neighbour before the better: a bot that cannot give the answer it meant to
 * should miss, never get lucky.
 */
function fallbackOrder(drawn: Verdict): Verdict[] {
  const at = VERDICTS.indexOf(drawn);
  const order: Verdict[] = [];
  for (let step = 1; step < VERDICTS.length; step += 1) {
    const worse = VERDICTS[at + step];
    if (worse) order.push(worse);
    const better = VERDICTS[at - step];
    if (better) order.push(better);
  }
  return order;
}

function sampleVerdict(weights: Record<Verdict, number>, rng: Rng): Verdict {
  return VERDICTS[pickWeighted(VERDICTS.map((verdict) => weights[verdict]), rng)]!;
}

function sampleThinkMs(profile: BotProfile, rng: Rng): number {
  const [low, high] = profile.thinkSeconds;
  return low * 1000 + Math.floor((high - low) * 1000 * rng());
}

/** `planBotMove`, with the working shown. */
export function traceBotMove(
  actual: number,
  profile: BotProfile,
  rng: Rng,
): BotMoveTrace {
  const thinkMs = sampleThinkMs(profile, rng);
  const drawn = sampleVerdict(tierWeightsFor(profile, actual), rng);

  // A perfect the grid cannot say is the nearest thing it can.
  const intended = drawn === "perfect" && !isOnRail(actual) ? "great" : drawn;

  let placed = placeGuess(intended, actual, rng, DRAWN_ATTEMPTS);
  if (placed === null) {
    for (const verdict of fallbackOrder(intended)) {
      placed = placeGuess(verdict, actual, rng, FALLBACK_ATTEMPTS);
      if (placed !== null) break;
    }
  }

  // Last resort, reachable only for a year the rail cannot hold at all (a
  // future event): the nearest year it can, graded honestly below.
  const guess = placed?.guess ?? snapToRail(actual);
  const accuracy = gradeGuess(guess, actual);

  return {
    move: {
      guess,
      verdict: accuracy.verdict,
      points: roundPoints(accuracy),
      thinkMs,
    },
    drawn,
    unrounded: placed?.unrounded ?? guess,
    rounding: placed?.rounding ?? "none",
    fellBack: accuracy.verdict !== drawn,
  };
}

/** One round's answer: a year the slider can produce, graded by the one grader. */
export function planBotMove(actual: number, profile: BotProfile, rng: Rng): BotMove {
  return traceBotMove(actual, profile, rng).move;
}

/** A whole match, in round order — what `versus_seat_bot()` stores. */
export function planBotMatch(
  actualYears: readonly number[],
  profile: BotProfile,
  rng: Rng,
): BotMove[] {
  return actualYears.map((actual) => planBotMove(actual, profile, rng));
}

/* -------------------------------------------------------------------------
   Small maths
   ------------------------------------------------------------------------- */

function innerBiased(min: number, max: number, u: number, power: number): number {
  return clamp(Math.round(min + (max - min) * u ** power), min, max);
}

/** Uniform in log space between two positive numbers. */
function logUniform(low: number, high: number, u: number): number {
  return low * (high / low) ** u;
}

/** An index in [0, length), safe against an rng that returns exactly 1. */
function pickIndex(length: number, rng: Rng): number {
  return Math.min(length - 1, Math.floor(rng() * length));
}

/** An index drawn in proportion to `weights`; the last positive one absorbs rounding. */
function pickWeighted(weights: readonly number[], rng: Rng): number {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let left = rng() * total;
  let last = 0;
  for (let i = 0; i < weights.length; i += 1) {
    if (weights[i]! <= 0) continue;
    last = i;
    left -= weights[i]!;
    if (left < 0) return i;
  }
  return last;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
