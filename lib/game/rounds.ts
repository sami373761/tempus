/**
 * Round construction, shared by the server pages that deal a round and the
 * client components that play it.
 *
 * Pure functions over `LocalizedEvent`, so the same rules hold on both sides of
 * the network boundary.
 */

import type { LocalizedEvent } from "../db/types.ts";
import type { Verdict } from "./scoring.ts";

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
 * How many already-dealt events a game remembers, and the most a draw will be
 * asked to avoid.
 *
 * A set of ten never reaches it — the date-guessing games play ten events and
 * the comparison game thirty (three per round) — so for them this is slack.
 * It exists for a run with no end to it: survival would otherwise grow its
 * "already played" list, and the request carrying it, without bound. The
 * **tail** is what is kept, so what a long run avoids is the events it dealt
 * most recently.
 *
 * Shared by the deal actions and the two game components for the usual reason
 * (a `"use server"` module may export nothing but async functions), and the
 * limit has to be one number: a client that remembered less than the server
 * accepted would be asking for repeats it could have avoided.
 */
export const EXCLUDED_EVENT_LIMIT = 64;

/**
 * Seconds a solo round gives the player to lock in — every game but the
 * head-to-head, which keeps its own (`ROUND_SECONDS` in lib/game/versus.ts)
 * because it is stamped by the server per match.
 *
 * The limit exists to make looking the date up in another tab cost more than
 * guessing, so the clock keeps running while the tab is hidden, and when it
 * runs out the round is locked in from whatever is on the board — see
 * `useSoloRoundClock` in components/round-timer.tsx.
 */
export const SOLO_ROUND_SECONDS = 30;

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

/**
 * The round's three events, target last.
 *
 * What a game hands to `exclude` when it tops its queue up: all three and not
 * just the target, because a round built from anchors the player has just been
 * shown reads as a repeat even when the event being guessed is new. Target
 * last so the ids a trimmed list keeps are the ones that were actually
 * questions.
 */
export function roundEventIds(round: ComparisonRound): string[] {
  return [round.left.id, round.right.id, round.target.id];
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

/**
 * How many equal sections the comparison rail is divided into.
 *
 * Six, with five dividers drawn between them, which is what turns "nearer to
 * which anchor?" into a question with a resolution. The rail spans the two
 * anchors' years, so a section is always a sixth of the distance between
 * them — 600 years apart makes each section a century — and the scale is
 * therefore stated by the round rather than chosen by the game.
 *
 * It has to stay even: the answer is still which half the target is in, and
 * `sectionSide` splits the row down the middle.
 */
export const COMPARISON_SECTIONS = 6;

/**
 * Where a year sits on the rail, 0 at the older anchor and 1 at the newer.
 *
 * Linear between the two, which is exact: astronomical year numbering makes
 * this plain subtraction (lib/historical-date.ts). It lived in
 * components/comparison-game.tsx until the sections needed it too — the
 * section the truth falls in and the section the player picked have to be
 * read off one scale or the distance between them is not a distance.
 */
export function comparisonFractionAtYear(
  round: ComparisonRound,
  year: number,
): number {
  const span = round.right.year - round.left.year;
  if (span === 0) return 0.5; // The draw asks for distinct years; be safe anyway.
  return Math.min(1, Math.max(0, (year - round.left.year) / span));
}

/** Which section a position on the rail falls in, 0 (oldest) to 5 (newest). */
export function comparisonSection(fraction: number): number {
  return Math.min(
    COMPARISON_SECTIONS - 1,
    Math.max(0, Math.floor(fraction * COMPARISON_SECTIONS)),
  );
}

/** Which section the truth is in. */
export function comparisonSectionAtYear(
  round: ComparisonRound,
  year: number,
): number {
  return comparisonSection(comparisonFractionAtYear(round, year));
}

/**
 * Which anchor a section commits to. The three older sections are the left
 * answer and the three newer ones the right, which is the same boundary the
 * midpoint of the rail always was — picking a section is a finer way of
 * saying the thing the round already asked.
 */
export function sectionSide(section: number): ComparisonSide {
  return section < COMPARISON_SECTIONS / 2 ? "left" : "right";
}

/**
 * The round's grade, on the same five-rung ladder the date-guessing game
 * uses — so one result card can serve both screens.
 *
 * The side is still the question and the section is the margin: being right
 * can earn the top three rungs and being wrong can only earn the bottom two,
 * so no amount of precision rescues the wrong half and no near miss is
 * reported as a win. The distances are what each rung is worth:
 *
 *   perfect  right half, the exact section
 *   great    right half, one section out
 *   good     right half, two sections out (the widest a correct answer can be)
 *   bad      wrong half, one section out — the pair either side of the middle
 *   wayOff   wrong half, further than that
 *
 * A correct answer can never be more than two sections out and a wrong one
 * never fewer than one, because both sections lie in their own half of six;
 * the ladder is therefore total without either end needing a clamp.
 */
export function comparisonVerdict(
  round: ComparisonRound,
  picked: number,
): Verdict {
  const distance = comparisonSectionDistance(round, picked);

  if (!isComparisonCorrect(round, sectionSide(picked))) {
    return distance <= 1 ? "bad" : "wayOff";
  }
  return distance === 0 ? "perfect" : distance === 1 ? "great" : "good";
}

/** How many sections lie between the player's pick and the truth. */
export function comparisonSectionDistance(
  round: ComparisonRound,
  picked: number,
): number {
  return Math.abs(picked - comparisonSectionAtYear(round, round.target.year));
}
