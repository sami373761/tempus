/**
 * The panes of the date-guessing timeline, and the maths that maps a drag
 * position to a year.
 *
 * The timeline is one continuous line split across panes that the view pans
 * between. Older is always to the left:
 *
 *   [ cosmos 10bn–10m BCE ][ evolution 10m–10k BCE ][ civilisation 10k BCE–1 BCE ]
 *   [ common era 1 BCE–2026 ][ future 2026–3000 ]
 *
 * A round opens on the common era. Reaching a pane's edge reveals the door to
 * whichever pane it borders.
 *
 * The two deep panes cover three orders of magnitude each, so they are scaled
 * LOGARITHMICALLY — a linear 10m–10bn rail would bury the whole of the
 * Mesozoic in its last few pixels. Each deep pane is exactly three decades
 * wide, which also makes their rulers evenly spaced.
 *
 * Years are astronomical throughout (see lib/historical-date.ts): 1 BCE is 0,
 * 100 BCE is -99. The BCE panes therefore work in *display* BCE years and
 * convert at the edges, which is what keeps their tick labels round numbers —
 * 100 BCE, 1 million BCE — instead of -99, -999999.
 *
 * Each pane snaps to its own grid of whole years, one step per tier of depth:
 * one year across 1–10,000 BCE, ten through the evolution pane, a hundred
 * through the cosmos. The grids are a property of the pane, not of the scale —
 * a log pane rounds to a multiple of its step exactly as a linear one does. The
 * grid is deliberately finer than the ruler: the ticks are unchanged, so the
 * rail still reads the same, but a year like 359 BCE now has a position on it.
 *
 * NOTE: a `TimelinePane` is not an `EraFolder` (lib/historical-date.ts). Those
 * three slugs partition R2 and the category table; these five partition a
 * ruler. They are deliberately separate concepts.
 */

import { PRESENT_YEAR } from "../historical-date.ts";

/**
 * Every pane that exists, in one union.
 *
 * Written out rather than derived from an array, because the panes no longer
 * form one list: they form *sets*, and a set is what a game pans between (see
 * `PaneSet`). Deriving the union from the general set would make a football
 * pane unrepresentable; deriving it from a concatenation would make every
 * `indexOf` on a set reject the union it is a subset of.
 */
export type TimelinePane =
  | "cosmos"
  | "evolution"
  | "civilization"
  | "ce"
  | "future"
  | "football";

/**
 * A pane set: the panes one game pans between, oldest first.
 *
 * Passed to every helper below that reads the *order* of the panes rather than
 * the shape of one — which pane a year lives on, which panes a given pane
 * borders, how far the camera travels. The helpers that only read one pane's
 * own scale (`yearAtFraction`, `paneTicks`, `keyStepFraction`, …) need no such
 * argument: a pane's rail is a property of the pane.
 *
 * It defaults to `TIMELINE_PANES` at every call site, so the four games that
 * play over the whole of history read exactly as they did.
 */
export type PaneSet = readonly TimelinePane[];

/**
 * Oldest to newest — the order the general timeline's panes sit in, left to
 * right. This is the *general* pane set: the five panes the date-guessing
 * game, the daily, survival and head-to-head all pan between.
 *
 * Annotated `PaneSet` rather than left as a `const` tuple so that
 * `TIMELINE_PANES.indexOf(pane)` accepts any pane. Without it the array's
 * element type is the narrow five and every `indexOf` of a value that *might*
 * be football's is a type error, in code where -1 is already the answer.
 */
export const TIMELINE_PANES: PaneSet = [
  "cosmos",
  "evolution",
  "civilization",
  "ce",
  "future",
];

/** Where a round opens on the general timeline, and the way into the deep eras. */
export const DEFAULT_PANE: TimelinePane = "ce";

/**
 * The football game's pane set: one rail, football's own span.
 *
 * A subject game is played over a slice of history rather than the whole of
 * it, and the general timeline cannot show that slice. Every football event
 * falls between 1872 and 2024, which on the common-era pane is the rightmost
 * 7% of the rail — and the tolerance that earns a `great` there is 8 years, or
 * about four pixels. The rail *is* the game, so a game whose answers are all
 * within four pixels of each other is not the same game with a different pool,
 * it is a different and worse one.
 *
 * So football gets a rail of its own, and because a pane set is a parameter
 * rather than a module-level constant, that is this array plus a `PANE_SPEC`
 * entry. Nothing in the general timeline changes, and the next subject pool
 * (basketball, film) is the same two additions.
 *
 * One pane means there is nowhere to pan to: `paneEntrances` returns no doors,
 * `entryFraction` is never reached and `panDuration` is always zero. The
 * camera machinery is still the same code, it simply has one frame to hold.
 */
export const FOOTBALL_PANES: PaneSet = ["football"];

/** The only pane football has, so it is also where every round opens. */
export const FOOTBALL_DEFAULT_PANE: TimelinePane = "football";

/** Astronomical 0 is 1 BCE: the hinge the civilisation and common-era panes share. */
export const CE_MIN_YEAR = 0;
export const CE_MAX_YEAR = PRESENT_YEAR;
/** `event.year`'s own upper bound — the timeline stops where the data can. */
export const FUTURE_MAX_YEAR = 3000;

/**
 * The left edge of the football rail. Organised football starts in the 1860s
 * and the dataset's oldest event is 1872, so this is the round number just
 * before it — see the `football` entry in `PANE_SPEC`.
 */
export const FOOTBALL_MIN_YEAR = 1850;

/**
 * How a pane turns a position into a year.
 *
 * `year` panes read in astronomical years directly. The `bce-*` panes read in
 * display BCE years, where `max` is the pane's LEFT (oldest) edge and `min` its
 * right — the axis runs backwards, like the era it describes.
 */
type PaneSpec =
  | { scale: "year"; minYear: number; maxYear: number; tickStep: number }
  | {
      scale: "bce-linear";
      minDisplay: number;
      maxDisplay: number;
      /** Drag granularity, in display BCE years. */
      stepYears: number;
      tickStep: number;
    }
  | {
      scale: "bce-log";
      minDisplay: number;
      maxDisplay: number;
      /** Drag granularity, in display BCE years — as on a linear pane. */
      stepYears: number;
    };

const PANE_SPEC: Record<TimelinePane, PaneSpec> = {
  // 10 billion -> 10 million BCE. Earth, the continents, the dinosaurs.
  cosmos: {
    scale: "bce-log",
    minDisplay: 10_000_000,
    maxDisplay: 10_000_000_000,
    stepYears: 100,
  },
  // 10 million -> 10 thousand BCE. Tools, hominins, their spread.
  evolution: {
    scale: "bce-log",
    minDisplay: 10_000,
    maxDisplay: 10_000_000,
    stepYears: 10,
  },
  // 10 thousand BCE -> 1 BCE, one year at a time. Farming, writing, cities.
  civilization: {
    scale: "bce-linear",
    minDisplay: 0,
    maxDisplay: 10_000,
    stepYears: 1,
    tickStep: 2000,
  },
  ce: {
    scale: "year",
    minYear: CE_MIN_YEAR,
    maxYear: CE_MAX_YEAR,
    tickStep: 250,
  },
  future: {
    scale: "year",
    minYear: PRESENT_YEAR,
    maxYear: FUTURE_MAX_YEAR,
    tickStep: 250,
  },
  // The football game's whole timeline, on one rail. 1850 rather than 1872
  // (the oldest event, Rangers) so the first club foundations are not pinned
  // against the left edge, where a drag has nowhere to be wrong in one
  // direction and the answer marker would sit under the rail's own end.
  football: {
    scale: "year",
    minYear: FOOTBALL_MIN_YEAR,
    maxYear: CE_MAX_YEAR,
    tickStep: 25,
  },
};

/**
 * Every pane id, in no particular order — the keys of `PANE_SPEC`.
 *
 * Exists so a caller can build a record over *all* panes rather than over one
 * set: `openingFractions` does exactly that, which is what lets a game hold a
 * total `Record<TimelinePane, number>` of marker positions while only ever
 * reading the panes its own set shows.
 */
export const ALL_PANES: PaneSet = Object.keys(PANE_SPEC) as TimelinePane[];

/**
 * Display BCE year -> astronomical year. 100 BCE -> -99; 0 stays the hinge.
 *
 * Displays 0 and 1 are the same year — 1 BCE is astronomical 0, and the
 * civilisation pane's right edge is the hinge it shares with the common era.
 * On a one-year grid that costs one of its 10,001 positions, visible only as
 * the first arrow press at the extreme right appearing to do nothing. Closing
 * it would mean starting the pane at display 1, which drops the "1 BCE" label
 * off the end of the ruler — a worse trade.
 */
export function bceDisplayToYear(display: number): number {
  return display === 0 ? 0 : 1 - display;
}

/** Inverse of `bceDisplayToYear`, for years at or before the hinge. */
export function yearToBceDisplay(year: number): number {
  return year === 0 ? 0 : 1 - year;
}

/**
 * Drag fraction (0 = left edge, 1 = right edge) -> year, snapped to the pane's
 * own granularity.
 */
export function yearAtFraction(pane: TimelinePane, fraction: number): number {
  const spec = PANE_SPEC[pane];
  const t = clamp01(fraction);

  switch (spec.scale) {
    case "year":
      return spec.minYear + Math.round(t * (spec.maxYear - spec.minYear));

    case "bce-linear": {
      const steps = (spec.maxDisplay - spec.minDisplay) / spec.stepYears;
      const display =
        spec.minDisplay + Math.round((1 - t) * steps) * spec.stepYears;
      return bceDisplayToYear(display);
    }

    case "bce-log": {
      const high = Math.log10(spec.maxDisplay);
      const low = Math.log10(spec.minDisplay);
      const display = 10 ** (high - t * (high - low));
      return bceDisplayToYear(roundToStep(display, spec.stepYears));
    }
  }
}

/** Inverse of `yearAtFraction`; clamped, so an out-of-pane year pins to an edge. */
export function fractionAtYear(pane: TimelinePane, year: number): number {
  const spec = PANE_SPEC[pane];

  switch (spec.scale) {
    case "year":
      return clamp01((year - spec.minYear) / (spec.maxYear - spec.minYear));

    case "bce-linear": {
      const display = clamp(
        yearToBceDisplay(year),
        spec.minDisplay,
        spec.maxDisplay,
      );
      return 1 - (display - spec.minDisplay) / (spec.maxDisplay - spec.minDisplay);
    }

    case "bce-log": {
      // Clamping before the log keeps display 0 (and any CE year, which maps
      // to a negative display) out of log10's undefined region.
      const display = clamp(
        yearToBceDisplay(year),
        spec.minDisplay,
        spec.maxDisplay,
      );
      const high = Math.log10(spec.maxDisplay);
      const low = Math.log10(spec.minDisplay);
      return clamp01((high - Math.log10(display)) / (high - low));
    }
  }
}

/**
 * The pane a year lives on within `panes`, newest first so a shared boundary
 * lands on the newer pane.
 *
 * Searched rather than looked up because the answer depends on the set: 1954
 * is on the common-era pane of the general timeline and on the football pane
 * of football's. The fallback is the oldest pane in the set, which is what an
 * out-of-range year pins to — `fractionAtYear` then clamps it to that pane's
 * edge, so a year the set does not cover is still marked somewhere real.
 */
export function paneForYear(
  year: number,
  panes: PaneSet = TIMELINE_PANES,
): TimelinePane {
  for (let i = panes.length - 1; i >= 0; i -= 1) {
    const pane = panes[i]!;
    const { min, max } = paneBounds(pane);
    if (year >= min && year <= max) return pane;
  }
  return panes[0]!;
}

/** The years at a pane's two edges, oldest first. */
export function paneBounds(pane: TimelinePane): { min: number; max: number } {
  return { min: yearAtFraction(pane, 0), max: yearAtFraction(pane, 1) };
}

/**
 * How far one arrow-key press moves the marker, as a fraction of the pane.
 *
 * Expressed as a fraction rather than a year count because a year is a
 * meaningless step on a log pane — one year out of 10 billion would not move
 * the marker at all. Deep panes step by a hundredth of a decade instead, which
 * is the one place the key step and the snap grid part company: the grid there
 * is 10 or 100 years, but a key step of 10 years would need a million presses
 * to cross the pane.
 *
 * On the two linear scales the arrow key is exactly one year, which is what
 * makes a date like 359 BCE reachable at all: the civilisation rail is 10,000
 * years over ~940px, so a drag can only ever land on about one year in eleven.
 * Drag to the neighbourhood, then step onto the year.
 */
export function keyStepFraction(pane: TimelinePane): number {
  const spec = PANE_SPEC[pane];

  switch (spec.scale) {
    case "year":
      return 1 / (spec.maxYear - spec.minYear);
    case "bce-linear":
      return spec.stepYears / (spec.maxDisplay - spec.minDisplay);
    case "bce-log": {
      const decades = Math.log10(spec.maxDisplay / spec.minDisplay);
      return 1 / (decades * 100);
    }
  }
}

/** How many fine steps a coarse one (Page Up/Down, shift+arrow) is worth. */
const COARSE_KEY_MULTIPLE = 100;

/**
 * The coarse key step: the companion a one-year fine step needs.
 *
 * A 10,000-year pane stepped one year at a time is 10,000 presses from end to
 * end, so the fine step is only usable if something covers the distance. This
 * is that something — and on the civilisation pane it is exactly the 100 years
 * the arrow key used to move.
 *
 * Capped at a tenth of the rail, which only binds on the log panes: a hundred
 * hundredths of a decade is a full decade, a third of a deep pane in one press.
 */
export function coarseStepFraction(pane: TimelinePane): number {
  return Math.min(0.1, keyStepFraction(pane) * COARSE_KEY_MULTIPLE);
}

/**
 * Label years for a pane's ruler, left to right.
 *
 * Round numbers rather than an even split: a ruler reading 0 / 253 / 507 is
 * harder to judge a drag against than 0 / 250 / 500. Log panes tick once per
 * decade, which is evenly spaced on their own scale.
 */
export function paneTicks(pane: TimelinePane): number[] {
  const spec = PANE_SPEC[pane];
  const years: number[] = [];

  switch (spec.scale) {
    case "year": {
      for (let y = spec.minYear; y < spec.maxYear; y += spec.tickStep) {
        years.push(y);
      }
      // The pane's upper bound always gets a label — it is the end of the
      // scale, and on the CE pane it is the present year. Drop the preceding
      // stepped tick when it would sit too close to read: 2026 is 25 years
      // from 2001, which overprints into one unreadable number.
      const last = years[years.length - 1];
      if (last !== undefined && spec.maxYear - last < spec.tickStep / 2) {
        years.pop();
      }
      years.push(spec.maxYear);
      return years;
    }

    case "bce-linear": {
      // Deepest past on the left, the 1 BCE hinge on the right.
      for (let d = spec.maxDisplay; d >= spec.minDisplay; d -= spec.tickStep) {
        years.push(bceDisplayToYear(d));
      }
      return years;
    }

    case "bce-log": {
      for (let d = spec.maxDisplay; d >= spec.minDisplay; d /= 10) {
        years.push(bceDisplayToYear(Math.round(d)));
      }
      return years;
    }
  }
}

/**
 * The doors out of a pane: simply the panes it borders.
 *
 * A door sits at the shared boundary, so it is revealed exactly when the
 * marker reaches that edge of the rail.
 */
export function paneEntrances(
  pane: TimelinePane,
  panes: PaneSet = TIMELINE_PANES,
): { side: "left" | "right"; target: TimelinePane }[] {
  const index = panes.indexOf(pane);
  const doors: { side: "left" | "right"; target: TimelinePane }[] = [];

  const older = panes[index - 1];
  if (older) doors.push({ side: "left", target: older });

  const newer = panes[index + 1];
  if (newer) doors.push({ side: "right", target: newer });

  return doors;
}

/**
 * Where the marker lands when the player pans from one pane to another: the
 * far edge in the direction of travel. Panning left (into an older pane) opens
 * at that pane's left edge, panning right at its right edge.
 *
 * A door is only revealed when the marker reaches the end of the rail it sits
 * at, so landing on the far edge means the *next* door in the same direction
 * is already there. Four billion years BCE is three presses from the common
 * era instead of three presses with a full drag between each.
 *
 * The alternative is the hinge the two panes share, which was what this
 * returned until 2026-10-06: symmetric, in that walking back out put the
 * marker where it walked in, but it made every pane cost a full drag in
 * whichever direction the player was going. Momentum is the better trade
 * because the deep panes are somewhere to pass *through*; the price is that
 * reversing now costs the drag instead, and that a pane at either end of the
 * timeline is entered with no door in sight.
 */
export function entryFraction(
  target: TimelinePane,
  from: TimelinePane,
  panes: PaneSet = TIMELINE_PANES,
): number {
  return panes.indexOf(from) < panes.indexOf(target) ? 1 : 0;
}

/** `4_537_219_043` on a 100-year step -> `4_537_219_000`. */
function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
