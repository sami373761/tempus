/**
 * Round construction, shared by the server pages that deal a round and the
 * client components that play it.
 *
 * Pure functions over `LocalizedEvent`, so the same rules hold on both sides of
 * the network boundary.
 */

import type { LocalizedEvent } from "../db/types.ts";

/**
 * Shown until `public.image` has rows. Every event falls back to the same
 * local SVG; once an R2 object is attached, `LocalizedEvent.image.url` wins
 * and nothing else has to change.
 */
export const EVENT_PLACEHOLDER_IMAGE = "/event-placeholder.svg";

/**
 * Oldest year the COMPARISON game may draw.
 *
 * Deep time makes that round trivial — anything at all is "closer to" 1969
 * than to the formation of the Earth — so its anchors stay inside recorded
 * history. 466 of the 497 events sit at or after 9999 BCE.
 *
 * The date-guessing game has no such floor: its evolution and cosmos panes are
 * scaled logarithmically, so every event in the dataset is reachable there.
 */
export const COMPARISON_MIN_YEAR = -9999;

/**
 * The opening deal: the round being played and the one after it. One spare is
 * what lets "next round" swap the content instantly instead of refetching, and
 * it gives the browser the whole of the current round to pull the next round's
 * pictures.
 *
 * Here rather than beside the server actions that read it, because a
 * `"use server"` module may export nothing but async functions.
 */
export const ROUND_QUEUE_DEPTH = 2;

/**
 * What the client tops the queue back up to — one more than the opening deal,
 * and the difference is load-bearing.
 *
 * Topping up to `ROUND_QUEUE_DEPTH` means the refill condition is
 * `length < 2`, which the opening queue of exactly 2 never trips: **nothing is
 * prefetched while the player is on question 1**, and the first draw of the
 * game only starts when they advance to question 2 — at which point the queue
 * holds one round, `upcoming` is null, and the "Next round" button is dead
 * until the draw lands. Measured at 1.6s locally and worse over a real
 * network, on question 2 of every game.
 *
 * One deeper fixes it at the root: `length < 3` is true the moment the game
 * mounts, so the first draw happens while question 1 is still being read, and
 * the queue then oscillates 4 -> 3 -> 2 -> 4 and never reaches 1. The opening
 * deal stays at 2 because that one blocks the page's render.
 */
export const ROUND_QUEUE_TARGET = ROUND_QUEUE_DEPTH + 1;

/**
 * How long a round's photograph takes to dissolve into the next one's. Must
 * match the `.round-photo-in` rule in app/globals.css: the components use it to
 * decide when the outgoing layer can be unmounted, and unmounting it early
 * would cut the dissolve off part-way.
 */
export const ROUND_PHOTO_FADE_MS = 520;

/** Anchors plus target — what `buildComparisonRound` needs to build one round. */
export const EVENTS_PER_COMPARISON_ROUND = 3;

export type ComparisonSide = "left" | "right";

/** Two dated anchors and one event whose date the player has to place between them. */
export interface ComparisonRound {
  /** Oldest of the three. */
  left: LocalizedEvent;
  /** Newest of the three. */
  right: LocalizedEvent;
  /** The middle event — the one being guessed. */
  target: LocalizedEvent;
}

/**
 * Oldest left, newest right, the remaining one in the centre.
 *
 * Taking the extremes as anchors guarantees the target's year falls between
 * them, which is what makes "closer to which?" a real question.
 */
export function buildComparisonRound(
  events: readonly LocalizedEvent[],
): ComparisonRound | null {
  if (events.length < 3) return null;

  const [left, target, right] = [...events].sort((a, b) => a.year - b.year);
  if (!left || !target || !right) return null;

  return { left, right, target };
}

/** Which anchor the target is nearer to. Plain subtraction — see lib/historical-date.ts. */
export function closerSide(round: ComparisonRound): ComparisonSide {
  const toLeft = Math.abs(round.target.year - round.left.year);
  const toRight = Math.abs(round.target.year - round.right.year);
  return toLeft <= toRight ? "left" : "right";
}

/**
 * A dead-centre target is genuinely ambiguous, so both answers count. The
 * draw asks for distinct years, which makes this rare rather than impossible.
 */
export function isComparisonCorrect(
  round: ComparisonRound,
  choice: ComparisonSide,
): boolean {
  const toLeft = Math.abs(round.target.year - round.left.year);
  const toRight = Math.abs(round.target.year - round.right.year);
  return toLeft === toRight || choice === closerSide(round);
}
