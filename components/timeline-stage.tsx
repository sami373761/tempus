"use client";

import { useEffect, useRef, useState } from "react";

import { EventVisual } from "@/components/event-visual";
import type { LocalizedEvent, SupportedLocale } from "@/lib/db/types";
import { ROUND_PHOTO_FADE_MS } from "@/lib/game/rounds";
import {
  ALL_PANES,
  coarseStepFraction,
  DEFAULT_PANE,
  entryFraction,
  fractionAtYear,
  keyStepFraction,
  paneBounds,
  paneEntrances,
  paneTicks,
  TIMELINE_PANES,
  type PaneSet,
  type TimelinePane,
  yearAtFraction,
} from "@/lib/game/timeline";
import { formatYear, formatYearMagnitude } from "@/lib/historical-date";
import { dateLabels, type Dict } from "@/lib/i18n/dictionary";

/**
 * The date-guessing *stage*: the five-pane camera, the rail, the picture and
 * the chrome that dresses them — everything both the solo game and the
 * head-to-head game put on screen, and none of the rules either of them plays
 * by.
 *
 * It was all one file until the two-player mode arrived. The split is along
 * the line the two modes genuinely differ on, which is not what the screen
 * looks like: a round is a photograph, a caption and a ruler in both, and a
 * marker is dragged and locked in the same way in both. What differs is where
 * the round comes from, who decides when it ends, and what is shown when it
 * does. So the pieces that *draw* live here and the pieces that *decide* stay
 * with each mode.
 *
 * Keeping them identical is the point rather than a side effect. The
 * head-to-head mode is supposed to feel like the same game with someone else
 * in it, and the surest way to get that is for it to be the same components.
 *
 * Nothing here holds game state. Every one of these takes what it should show
 * and reports what the player did; the caller owns the rest.
 */

/** What the stage needs of an event: enough to show it, never its date. */
export interface StageEvent {
  id: string;
  name: string;
  image: LocalizedEvent["image"];
  /** Whether the photograph goes behind a reveal control — see EventVisual. */
  isSensitive: boolean;
}

/**
 * The poster card needs nothing of an event that the stage does not.
 *
 * It carried a `format` field until the "Born When?" game was built, which is
 * when it became clear the field was in the wrong place. The pill over the
 * picture is part of the round on both screens that use this card, but it is a
 * *different fact* on each: for a film it says whether the stored year is a
 * release or a premiere (lib/game/screen.ts), and for a person it says what
 * they are known for, which is most of what narrows a portrait to a century
 * (lib/game/when-born.ts). One card cannot derive both, and a card that knew
 * about both would be a shared component with two games' data models in it.
 *
 * So the label is a `pill` prop — already resolved to a string by whichever
 * game owns the fact — and this type is an alias again. Kept as a name rather
 * than inlined, because the card's requirements are worth stating separately
 * from the stage's even while the two agree.
 */
export type PosterEvent = StageEvent;

/**
 * How long the camera holds on the player's own marker after they lock in,
 * before it leaves for the era the answer actually lives in. Without the pause
 * the marker they just placed is already sliding off-screen as they read the
 * result, and the two eras blur into one movement.
 */
export const REVEAL_HOLD_MS = 700;

/** One pane of travel, matching the stage transition in the markup below. */
export const PAN_MS = 750;

/**
 * Geometry shared by the round's two buttons, which stand in the same place and
 * must therefore be the same size. The border is on both — the second button is
 * glass and needs a visible edge, and a 1px difference in box height would be a
 * 1px jump in the one element that exists not to move. Only colour is left to
 * the call sites.
 */
export const ROUND_BUTTON =
  "rounded-full border px-7 py-3 text-sm font-semibold transition";

/**
 * The same pill, one size up.
 *
 * Written out rather than composed from the line above it, because the two
 * differ only in utilities that set the *same* properties: a caller appending
 * `px-8` to `px-7` would be betting on Tailwind's output order to decide which
 * padding won. Keep the two in step — everything but the three sizes is the
 * same pill.
 *
 * It exists for the film & television screen, whose controls stand in a row of
 * their own in a two-column layout rather than in a one-column game's height
 * budget. The default is what the one-column games want; this is what a screen
 * with the room wants.
 */
export const ROUND_BUTTON_LG =
  "rounded-full border px-8 py-3.5 text-[15px] font-semibold transition";

/**
 * How long the rail takes to fold away when the player chooses to type the
 * date instead (`.rail-fold` in app/globals.css, `DateEntry` in
 * components/date-entry.tsx).
 *
 * It is here rather than beside that control because three things are timed
 * against it and only one of them is the control: the rail's own collapse, the
 * card's growth into the room it gives up, and the reveal of a guess that was
 * typed — which cannot begin until the rail it is marked on is back on screen.
 * **Change this and change `.rail-fold` and `.card-caps` with it**; the card
 * only tracks the rail frame for frame while both are eased identically.
 */
export const RAIL_FOLD_MS = 460;

/**
 * The event card's box, and the wider one it takes while the rail is folded
 * away.
 *
 * One pair of constants rather than four class lists, because the card and the
 * wrapper the result panels hang off have to be *exactly* the same size: those
 * panels are `inset-y-0` against the wrapper, so a wrapper taller than the
 * card hangs them past its corners. They were two copies of the same caps
 * until the entry arrived and made it two copies of two.
 *
 * The wide pair is a hand-maintained sum, in the same sense `--compare-chrome`
 * is: `38.125rem` is `26rem` plus the rail band's own measured height (194px),
 * so the picture takes exactly what the rail gives up and the one thing on
 * this screen which must not move — the advance button — stays where it is
 * when the rail goes. **Re-measure it if the rail's padding, its heading or
 * the ruler's type changes.** A few pixels out shows as the button stepping
 * during the fold, not as a scrollbar; on a screen too short for either cap to
 * bind, nothing moves either way.
 */
export const CARD_BOX =
  "w-full max-w-[25rem] sm:max-h-[26rem] sm:max-w-[32rem]";
export const CARD_BOX_WIDE =
  "w-full max-w-[25rem] sm:max-h-[38.125rem] sm:max-w-[36rem]";

/**
 * Crossing several eras at once is a longer journey, so it takes longer — but
 * sub-linearly, or walking cosmos-to-future would stall. Capped so the reveal
 * never feels like waiting.
 */
export function panDuration(
  from: TimelinePane,
  to: TimelinePane,
  panes: PaneSet = TIMELINE_PANES,
): number {
  const crossed = Math.abs(panes.indexOf(to) - panes.indexOf(from));
  return Math.min(1700, PAN_MS + Math.max(0, crossed - 1) * 320);
}

/**
 * Where every rail stands at the start of a round.
 *
 * Keyed over *every* pane rather than over the given set, so a game can hold
 * one total record of marker positions and index it without a fallback. A pane
 * outside the set gets the edge value `entryFraction` gives anything the
 * camera cannot reach from `home` — it is never rendered and never read, and
 * filling it is cheaper than making every `fractions[pane]` optional.
 */
export function openingFractions(
  panes: PaneSet = TIMELINE_PANES,
  home: TimelinePane = DEFAULT_PANE,
): Record<TimelinePane, number> {
  return Object.fromEntries(
    ALL_PANES.map((candidate) => [
      candidate,
      candidate === home ? 0.5 : entryFraction(candidate, home, panes),
    ]),
  ) as Record<TimelinePane, number>;
}

/**
 * The stretch of rail between the guess and the truth, on one pane.
 *
 * A guess and an answer in the same era are one bar between two markers, and
 * that is all this used to be. Across eras they are not: the distance runs
 * off the end of the rail the guess was made on, through however many panes
 * lie between, and onto the rail the answer lives on — so the measurement has
 * to be drawn as one fill per pane, and the panes in the middle are filled end
 * to end. Without it a guess an era out reports its distance only as a camera
 * move, and the one thing the player wants to see — how far wrong they were —
 * is the one thing the screen does not say.
 *
 * The panes are in timeline order, so "which way is the answer" is the sign of
 * the index difference and nothing has to know about eras.
 */
export interface RailGap {
  /** Left edge of the fill, as a fraction of this pane's rail. */
  from: number;
  /** Right edge. */
  to: number;
  /** Which end it grows out of: always the end nearer the guess. */
  origin: "left" | "right";
  /** When it draws itself. */
  delayMs: number;
}

export function railGap({
  pane,
  guessPane,
  guessFraction,
  answerPane,
  answerYear,
  answerDelayMs,
  nearDelayMs = 0,
  panes = TIMELINE_PANES,
}: {
  pane: TimelinePane;
  guessPane: TimelinePane | null;
  /** Where the marker was left on `guessPane`. */
  guessFraction: number;
  answerPane: TimelinePane | null;
  answerYear: number | null;
  /** When the answer's own marker lands, which the far end waits for. */
  answerDelayMs: number;
  /**
   * The earliest the end nearest the guess may draw itself. Zero in the
   * ordinary case — the player is looking straight at their own marker and
   * the bar leaving it is what the camera then follows — and the rail's fold
   * when the date was typed instead, because a bar that grows behind a
   * collapsed rail is one nobody sees grow.
   */
  nearDelayMs?: number;
  /** The panes whose order decides which way the distance runs. */
  panes?: PaneSet;
}): RailGap | null {
  if (guessPane === null || answerPane === null || answerYear === null)
    return null;

  const here = panes.indexOf(pane);
  const from = panes.indexOf(guessPane);
  const to = panes.indexOf(answerPane);

  // Same era: the ordinary case, one bar between the two markers. A `perfect`
  // guess draws nothing for free — the two fractions are equal, so the bar has
  // no width.
  if (from === to) {
    if (here !== from) return null;
    const answerFraction = fractionAtYear(pane, answerYear);
    return {
      from: Math.min(guessFraction, answerFraction),
      to: Math.max(guessFraction, answerFraction),
      origin: guessFraction <= answerFraction ? "left" : "right",
      delayMs: Math.max(nearDelayMs, answerDelayMs),
    };
  }

  if (here < Math.min(from, to) || here > Math.max(from, to)) return null;

  // Later than the guess means rightwards, which is also the direction every
  // fill grows in.
  const forward = to > from;
  const origin = forward ? "left" : "right";

  // The pane the guess is on starts drawing straight away rather than waiting
  // out the camera: the player is still looking at their own marker during the
  // reveal hold, and the bar leaving it is what the camera then follows.
  if (here === from) {
    return forward
      ? { from: guessFraction, to: 1, origin, delayMs: nearDelayMs }
      : { from: 0, to: guessFraction, origin, delayMs: nearDelayMs };
  }

  if (here === to) {
    const answerFraction = fractionAtYear(pane, answerYear);
    return forward
      ? { from: 0, to: answerFraction, origin, delayMs: answerDelayMs }
      : { from: answerFraction, to: 1, origin, delayMs: answerDelayMs };
  }

  // A pane the distance merely crosses: filled end to end.
  return { from: 0, to: 1, origin, delayMs: answerDelayMs };
}

/**
 * The event being placed, and the handover to the next one.
 *
 * The photograph cross-dissolves on the backdrop's rule: the outgoing picture
 * is held at full opacity underneath and only the incoming layer animates, so
 * nothing is composited between them. The title does not dissolve — two strings
 * at half alpha on top of each other read as a fault rather than as a
 * transition — so the old one leaves first and the new one arrives after the
 * picture has settled. The timings live in app/globals.css.
 *
 * The caption's box is a fixed height for a reason beyond the transition: event
 * names run from two words to a dozen, and a box that resized per round would
 * move the ruler under it and could push the screen past the fold.
 */
export function RoundCard({
  event,
  badge,
  counter,
  aside = null,
  wide = false,
  t,
}: {
  event: StageEvent;
  /** The round's result, painted over the picture rather than laid out under it. */
  badge: React.ReactNode;
  /** Position in the set, painted over the picture for the same reason. */
  counter: React.ReactNode;
  /**
   * Top-right corner, opposite `counter`. The head-to-head mode's countdown
   * lives here; the solo game leaves it empty. Another overlay rather than
   * another row, for the reason every addition to this screen is one — the
   * page is a height budget with nothing spare.
   */
  aside?: React.ReactNode;
  /**
   * Whether the rail below has folded away, in which case the picture takes
   * the room it left. Off in the head-to-head mode, which has no other way to
   * answer a round.
   */
  wide?: boolean;
  /**
   * Only so the photograph's sensitive-content gate can be labelled. The card
   * itself prints nothing from the dictionary — every string on it arrives
   * already rendered, as `badge`, `counter` and `aside`.
   */
  t: Dict;
}) {
  // Derived during render rather than in an effect, so the incoming layer is
  // never painted once with nothing behind it.
  const [shown, setShown] = useState<{
    active: StageEvent;
    leaving: StageEvent | null;
  }>({ active: event, leaving: null });

  if (shown.active.id !== event.id) {
    setShown({ active: event, leaving: shown.active });
  }

  useEffect(() => {
    if (!shown.leaving) return;

    const timer = window.setTimeout(
      () => setShown((current) => ({ active: current.active, leaving: null })),
      ROUND_PHOTO_FADE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [shown.leaving, shown.active.id]);

  return (
    // The one part of the column that gives: it takes whatever height the rail
    // and the footer leave, capped so the picture cannot become a billboard on
    // a tall screen and floored so it is still a picture on a short one.
    //
    // `.card-caps` is the transition between the two caps, and it exists as a
    // class rather than as utilities so `prefers-reduced-motion` can reach it:
    // the growth has to stay in step with the rail's own fold, which is timed
    // in CSS as well.
    <div
      className={`card-caps flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-white/12 bg-black/35 shadow-2xl shadow-black/70 backdrop-blur-2xl ${
        wide ? CARD_BOX_WIDE : CARD_BOX
      }`}
    >
      <div className="relative min-h-[5rem] w-full flex-1">
        {shown.leaving && (
          <div className="absolute inset-0">
            <EventVisual event={shown.leaving} t={t} />
          </div>
        )}
        {/* Keyed on the event, so the dissolve restarts for each round rather
            than running once on mount. */}
        <div key={shown.active.id} className="round-photo-in absolute inset-0">
          <EventVisual event={shown.active} t={t} />
        </div>

        {/* Top-left, clear of the verdict that lands in the middle of the same
            picture. Outside the keyed layer above, so changing round does not
            restart its animation or blink the count. */}
        <div className="absolute left-3 top-3 z-10 flex flex-col items-start gap-1.5">
          {counter}
        </div>

        {aside && <div className="absolute right-3 top-3 z-10">{aside}</div>}

        {/* Last, so it sits over both photo layers and survives the dissolve
            underneath it. */}
        {badge}
      </div>

      {/* Title only: the answer's date is marked on the rail, and printing it
          here as well reads as two different reveals. */}
      <div className="relative h-[4.5rem] shrink-0">
        {shown.leaving && (
          <RoundTitle key={`${shown.leaving.id}-leaving`} leaving>
            {shown.leaving.name}
          </RoundTitle>
        )}
        <RoundTitle key={shown.active.id}>{shown.active.name}</RoundTitle>
      </div>
    </div>
  );
}

export function RoundTitle({
  leaving = false,
  children,
}: {
  leaving?: boolean;
  children: React.ReactNode;
}) {
  return (
    <h2
      className={`absolute inset-0 flex items-center justify-center px-6 text-center font-display text-xl font-semibold leading-tight tracking-tight text-ink sm:text-2xl ${
        leaving ? "round-title-out" : "round-title-in"
      }`}
    >
      <span className="line-clamp-2">{children}</span>
    </h2>
  );
}

export function TimelinePaneView({
  pane,
  active,
  fraction,
  onFractionChange,
  answered,
  locked = false,
  compact = false,
  heading = true,
  showGuess,
  guessYear = null,
  answerYear,
  answerDelayMs,
  gap = null,
  gapColor = null,
  opponentYear = null,
  opponentLabel,
  panes = TIMELINE_PANES,
  locale,
  t,
  onEnter,
}: {
  pane: TimelinePane;
  /** The set this pane belongs to, which is what decides its doors. */
  panes?: PaneSet;
  active: boolean;
  fraction: number;
  onFractionChange: (fraction: number) => void;
  answered: boolean;
  /**
   * The rail is shown but may not be moved, while the round is still open.
   *
   * Not the same thing as `answered`, which also reveals the answer, draws the
   * distance and closes the era doors. This is for a game where the player has
   * chosen to *type* the date: the marker still tracks what they type, so the
   * rail is the live readout of their guess and has to stay on screen — it
   * simply must not also be draggable, or the two inputs would fight over
   * which one the guess came from.
   *
   * The solo timeline game folds the rail away instead and so never passes
   * this; see the split-layout game, which has the width to keep both.
   */
  locked?: boolean;
  /**
   * Drop the band of air above the rail that the era doors need.
   *
   * The default band is `pt-24` — 96px — and almost all of it is there so a
   * door pill and the marker's own year bubble can stack without colliding. A
   * one-pane set has no doors (`paneEntrances` returns none), so on a layout
   * where vertical room is the scarce thing that padding is holding open a
   * space nothing can occupy.
   */
  compact?: boolean;
  /**
   * Whether to print the pane's own name above the rail.
   *
   * On the five-pane timeline this is how a player knows which era they have
   * panned into, so it defaults to on. A one-pane game has nowhere to pan and
   * names itself in its own chrome, where the name can sit beside the round's
   * other furniture instead of costing the rail a line of its own.
   */
  heading?: boolean;
  showGuess: boolean;
  /**
   * What the marker's own bubble should read, when that is not simply the year
   * under it. A date *typed* into the entry is exact; the year the rail reads
   * back at that position is snapped to the pane's grid, which on the deep
   * panes is a step of ten or a hundred years. So a guess of 123,456 BCE would
   * be graded as typed and captioned as 123,460 — the player's own number,
   * misquoted. Null means read the rail, which is every other case.
   */
  guessYear?: number | null;
  answerYear: number | null;
  answerDelayMs: number;
  /**
   * This pane's share of the distance between the guess and the truth, from
   * `railGap` — null on the panes that distance does not reach, and on every
   * pane while the round is still open. The caller computes it because only
   * the caller knows both ends: a pane in the middle of a cross-era guess has
   * neither marker on it and would otherwise have nothing to measure.
   */
  gap?: RailGap | null;
  /**
   * What colour to draw that gap in — the verdict's own hue, so the bar on the
   * rail and the result card beside the photograph are the same red or the
   * same green. Null draws no gap at all.
   */
  gapColor?: string | null;
  /**
   * The other player's guess, in the head-to-head mode, once the round has
   * closed. Null in the solo game, which has no other player.
   */
  opponentYear?: number | null;
  /** What to call them on the rail. Short — it sits in a pill under a marker. */
  opponentLabel?: string;
  locale: SupportedLocale;
  t: Dict;
  onEnter: (pane: TimelinePane) => void;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  /**
   * The rail's width in pixels, which is what decides how many of its ticks
   * can carry a number. 0 until it has been measured — see `tickLabelsShown`
   * for what that first render prints.
   */
  const [railWidth, setRailWidth] = useState(0);
  // How this language writes a year — the era's abbreviation and its place
  // beside the number. Every date drawn on the rail goes through it.
  const labels = dateLabels(t);
  const year = guessYear ?? yearAtFraction(pane, fraction);
  // Everything that *moves* the marker is off in both states; everything that
  // reveals an answer still keys on `answered` alone.
  const frozen = answered || locked;

  /* Measured rather than read off a breakpoint, because the rail's width is
     not the window's: the same five-pane ruler is the full width of `/guess`
     and half of the split layouts, and a viewport-keyed rule would thin the
     labels on a phone and leave them colliding in a 300px column on a desktop.
     `ResizeObserver` also covers the width changing without a resize at all —
     the entry folding open, a flank appearing beside the card. */
  useEffect(() => {
    const node = rail.current;
    if (!node) return;

    const observer = new ResizeObserver(([entry]) => {
      if (entry) setRailWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const ticks = paneTicks(pane);
  const tickLabels = ticks.map((tickYear) => formatYearMagnitude(tickYear, labels));
  const labelled = tickLabelsShown(pane, ticks, tickLabels, railWidth);

  function fractionFromClientX(clientX: number): number {
    const box = rail.current?.getBoundingClientRect();
    if (!box || box.width === 0) return fraction;
    return Math.min(1, Math.max(0, (clientX - box.left) / box.width));
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (frozen) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    onFractionChange(fractionFromClientX(event.clientX));
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    onFractionChange(fractionFromClientX(event.clientX));
  }

  function onPointerUp() {
    setDragging(false);
  }

  /**
   * Two step sizes, which the one-year grid makes necessary rather than nice:
   * an arrow key moves a single year on the dated panes, and crossing 10,000 of
   * them one at a time is not navigation. Page Up/Down and shift+arrow cover
   * the ground (100 years on the civilisation rail — exactly the step the arrow
   * key used to take), and the arrow key lands on the year.
   */
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (frozen) return;

    const direction =
      event.key === "ArrowLeft" || event.key === "PageDown"
        ? -1
        : event.key === "ArrowRight" || event.key === "PageUp"
          ? 1
          : 0;
    if (direction === 0) return;

    const coarse = event.shiftKey || event.key.startsWith("Page");
    const step = coarse ? coarseStepFraction(pane) : keyStepFraction(pane);

    event.preventDefault();
    onFractionChange(fraction + direction * step);
  }

  const bounds = paneBounds(pane);

  return (
    <div
      className={`w-full shrink-0 px-8 transition-opacity duration-300 sm:px-12 ${
        active ? "opacity-100" : "opacity-0"
      }`}
      aria-hidden={!active}
      // Off-camera panes must not swallow pointers or receive tab focus.
      // `inert` covers both; the pointer-events fallback handles browsers that
      // do not implement it yet.
      inert={!active}
      style={{ pointerEvents: active ? undefined : "none" }}
    >
      <div className="mx-auto flex max-w-5xl flex-col">
        {/* The era's name and nothing else. Three of the five panes carried a
            line of description under the heading until 2026-10-06; the common
            era and the future never did, so the row of panes read as a
            heading on two of them and a small essay on the other three.
            Removed on request — the rail under it is what says what the era
            holds. */}
        {heading && (
          <div className="on-photo text-center">
            <h3 className="font-display text-2xl font-semibold tracking-[-0.02em] text-ink sm:text-3xl">
              {paneLabel(pane, t)}
            </h3>
          </div>
        )}

        {/* The generous top padding is not decoration: the door pill and the
            marker's year bubble are both pinned to the end of the rail, so they
            collide unless the band above the track is tall enough to stack
            them. It doubles as the gap under the pane's heading, which is why
            the column above has no gap of its own. */}
        <div className={`relative pb-14 ${compact ? "pt-12" : "pt-24"}`}>
          {/* Doors to the neighbouring panes, at the ends of the rail they
              open from. Leaving BC works exactly like entering it. */}
          {paneEntrances(pane, panes).map((door) => (
            <EdgeButton
              key={door.target}
              side={door.side}
              // A door opens onto a shared boundary, so it appears exactly
              // when the marker reaches that end of the rail — and it closes
              // the moment the guess is locked in. From then until the next
              // round the camera is the only thing that moves between eras:
              // it is travelling to the answer, and a player who walked off to
              // another era mid-reveal would be looking at a rail with neither
              // their marker nor the answer on it. It also keeps the answer's
              // own pane from offering a door merely because the marker it
              // remembers happens to be parked at one end.
              visible={
                !answered &&
                (door.side === "left" ? fraction <= 0 : fraction >= 1)
              }
              onClick={() => onEnter(door.target)}
            >
              {doorLabel(door.target, t)}
            </EdgeButton>
          ))}

          <div
            ref={rail}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className={`no-drag-select relative h-1.5 w-full rounded-full bg-white/25 ${
              frozen
                ? "cursor-default"
                : dragging
                  ? "cursor-grabbing"
                  : "cursor-pointer"
            }`}
          >
            {/* Travelled portion, so the marker reads as a position on a
                scale.

                It was `bg-accent` — the palette's blue, which is the player's
                own mark everywhere else — until 2026-10-08. Over a photograph
                it was the one saturated hue on the screen and read as chrome
                left on top of the picture, exactly as it did on the comparison
                rail (which went white for the same reason). A *muted* white:
                the track under it is `white/25` and the marker itself is solid
                `ink`, so a brilliant fill would leave the travelled portion
                competing with the marker it exists to lead the eye to. */}
            {showGuess && !answered && (
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-white/55"
                style={{ width: `${fraction * 100}%` }}
              />
            )}

            {/* How far off the guess was, drawn along the rail between the two
                markers in the verdict's own colour — so the distance the
                result card names as a number is also a length on the scale the
                guess was read off.

                `railGap` decides which panes get one and how much of each:
                the two markers' own pane when they share one, and otherwise
                the tail of the guess's rail, the whole of every pane in
                between, and the head of the answer's. A guess an era away from
                the truth is a distance like any other and now reads as one,
                rather than being reported only by how far the camera had to
                travel.

                No z-index on purpose. It has to stay under the guess marker
                and the answer's pointer — a coloured line across the white
                dot it starts from would read as a fault — and the rail's own
                tick marks already cross the travelled fill above it. It is a
                hair taller than the track so it reads as a measurement laid
                across the rail rather than as a repaint of it. */}
            {answered && gap && gapColor && (
              <div
                className="answer-gap pointer-events-none absolute -inset-y-px rounded-full"
                style={{
                  left: `${gap.from * 100}%`,
                  width: `${(gap.to - gap.from) * 100}%`,
                  background: gapColor,
                  // It grows from the guess towards the answer, so the origin
                  // is whichever end of this pane is nearer the guess.
                  transformOrigin: `${gap.origin} center`,
                  animationDelay: `${gap.delayMs}ms`,
                }}
              />
            )}

            {ticks.map((tickYear, index) => {
              const at = fractionAtYear(pane, tickYear);
              return (
                <div
                  key={tickYear}
                  className="absolute top-1/2 -translate-x-1/2"
                  style={{ left: `${at * 100}%` }}
                >
                  <div className="h-3 w-px -translate-y-1/2 bg-white/35" />
                  {/* Centred on its own tick, every tick. The label used to be
                      pulled back by its own width in proportion to how far
                      along the rail it sat (`translateX(-at * 100%)`), which
                      kept the first and last labels inside the rail's ends but
                      left every one in between sitting to the right of the
                      line it belongs to — by a quarter of its own width at the
                      quarter mark, and by nothing at all only in the middle.
                      A numeral that does not sit on its mark is not a ruler,
                      so the ends now hang into the pane's own padding instead.
                      That is what the `px-8` below `sm` is for, and it is
                      measured: the widest tick label on any pane is 59.8px
                      ("10 million"), so an end label centred on its mark needs
                      29.9px of room beyond the rail and the old `px-6` left it
                      24. The stage viewport clips, so the shortfall showed as
                      a numeral with its first digit shaved off. */}
                  {/* Every tick keeps its mark; only the numbers thin out.
                      A ruler with a minor division between each labelled one
                      is still a ruler, and it is the only thing a 326px rail
                      can be when the pane's step gives it nine of them: the
                      common-era ticks ran 1000/1250/1500 into one another at
                      390px. See `tickLabelsShown`. */}
                  {labelled[index] ? (
                    <span className="on-photo absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap text-[13px] tabular-nums text-white/80">
                      {tickLabels[index]}
                    </span>
                  ) : null}
                </div>
              );
            })}

            {/* The opponent's guess, in the head-to-head mode.

                A hollow grey ring rather than a third colour. The two that
                are already on this rail carry meaning the palette is built
                around — the player's own marker, and green for the truth —
                and inventing a hue for the opponent would make the rail the
                most colourful thing on a page whose whole surface palette is
                neutral (see the note in app/globals.css). Hollow against
                solid reads as "someone else's" without competing. */}
            {opponentYear !== null && answered && (
              <div
                className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `${fractionAtYear(pane, opponentYear) * 100}%`,
                  // Held back exactly as long as the answer is, so the two
                  // land together rather than one of them spoiling the pan.
                  animationDelay: `${answerDelayMs}ms`,
                }}
              >
                <div className="answer-label h-5 w-5 rounded-full border-2 border-ink-dim bg-page/70" />
                {opponentLabel && (
                  <span
                    className="answer-label on-photo absolute bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/20 bg-black/70 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-ink-dim"
                    style={{ animationDelay: `${answerDelayMs + 180}ms` }}
                  >
                    {opponentLabel} {formatYear(opponentYear, labels)}
                  </span>
                )}
              </div>
            )}

            {/* The answer: a pointer with the true date in the block under
                it.

                It was a green stick and a green caption until 2026-10-07, in
                the same green the verdict used. Both are gone — it is white
                now, like everything else the rail is drawn in, and the date
                moved *inside* the block instead of hanging under it as a
                second label. The one thing to keep is the symmetry: the
                pointer is centred over the block by the flex column and the
                whole marker is centred on its year by the keyframe's
                `translateX(-50%)` (the transform has to live there, or the
                animation would override a Tailwind translate class and the
                marker would land half its own width to the right).

                `top-7` is measured, not chosen. The band below the rail is
                `pb-14` — 56px — and the ruler's own numerals occupy the first
                27px of it, so the marker starts where they end and its 49px
                still fit inside the pane. Grow either piece and re-check that
                sum: the stage viewport clips, so the overflow would simply
                take the bottom off the block. */}
            {answerYear !== null && answered && (
              <div
                // Held back until the camera has finished travelling, so the
                // answer lands in front of the player rather than having been
                // sitting there through a pan they were not watching.
                className="answer-marker absolute top-7 z-20 flex flex-col items-center"
                style={{
                  left: `${fractionAtYear(pane, answerYear) * 100}%`,
                  animationDelay: `${answerDelayMs}ms`,
                }}
              >
                <span className="answer-pointer h-2.5 w-4 bg-ink" />
                <span className="whitespace-nowrap rounded-md bg-ink px-2 py-[3px] text-[11px] font-semibold leading-none tabular-nums text-page shadow-lg shadow-black/60">
                  {formatYear(answerYear, labels)}
                </span>
              </div>
            )}

            {showGuess && (
              <div
                role="slider"
                tabIndex={active && !frozen ? 0 : -1}
                aria-label={t.timelineHint}
                aria-valuemin={bounds.min}
                aria-valuemax={bounds.max}
                aria-valuenow={year}
                aria-valuetext={formatYear(year, labels)}
                onKeyDown={onKeyDown}
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                style={{
                  left: `${fraction * 100}%`,
                  transition: dragging ? "none" : "left 220ms ease-out",
                }}
              >
                <div className="h-6 w-6 rounded-full bg-ink" />
                {/* Centred on the marker at every position: the bubble reads as
                  the marker's own label, so it must not drift sideways as the
                  rail ends are approached. */}
                <span className="absolute bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-3 py-1 text-xs font-semibold tabular-nums text-page">
                  {formatYear(year, labels)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The BC / Future entrances: parked just past the end of the rail and only
 * rendered interactive once revealed, so a hidden button cannot be tabbed into.
 */
export function EdgeButton({
  side,
  visible,
  onClick,
  children,
}: {
  side: "left" | "right";
  visible: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      className={`absolute top-0 z-10 flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-5 py-2.5 text-sm font-semibold text-ink backdrop-blur-xl transition-all duration-500 ease-out hover:bg-white/20 ${
        side === "left" ? "left-0" : "right-0"
      } ${
        visible
          ? "pointer-events-auto translate-x-0 opacity-100"
          : `pointer-events-none opacity-0 ${side === "left" ? "translate-x-6" : "-translate-x-6"}`
      }`}
    >
      {side === "left" && <Arrow direction="left" />}
      {children}
      {side === "right" && <Arrow direction="right" />}
    </button>
  );
}

function Arrow({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={direction === "left" ? "M14 6l-6 6 6 6" : "M10 6l6 6-6 6"} />
    </svg>
  );
}

/** Short word on the door pill at the end of a rail. */
export function doorLabel(pane: TimelinePane, t: Dict): string {
  switch (pane) {
    case "cosmos":
      return t.cosmos;
    case "evolution":
      return t.evolution;
    case "civilization":
      return t.bc;
    case "future":
      return t.future;
    // A one-pane set has no doors, so this is unreachable for football today;
    // it is here because the switch is exhaustive over `TimelinePane` and a
    // silent fall-through to "CE" is exactly the sort of wrong label that
    // survives a review.
    case "football":
      return t.footballTitle;
    case "screen":
      return t.screenTitle;
    // The "Born When?" game's three rails, and the only doors on the site that
    // are *not* labelled with the name of an age.
    //
    // They cannot be. The general timeline's panes are eras and have names a
    // player already holds ("BCE", "the future"); these are cuts through one
    // continuous span, chosen where this pool's density changes
    // (`WHEN_BORN_PANES`). AD 1-1500 is not the Middle Ages — it starts five
    // centuries early — and calling it that would be teaching something false
    // on a site whose whole subject is when things happened. So the two
    // common-era rails are labelled with the years they actually cover, which
    // is both exact and the thing the player wants to know before walking
    // through: not "where am I going" but "which years are over there".
    //
    // Derived from `paneBounds` rather than written out, so moving a seam
    // moves its label with it and the two cannot drift apart.
    //
    // The BCE rail is the exception and takes the existing word, exactly as
    // the civilisation pane does: it is the only rail in the set that is
    // before the hinge, so "BCE" names it without ambiguity and is shorter
    // than the span would be.
    case "born-antiquity":
      return t.bc;
    case "born-premodern":
    case "born-modern":
      return paneSpanLabel(pane);
    case "ce":
    default:
      return t.commonEra;
  }
}

/**
 * Roughly how wide a tick label prints, in pixels.
 *
 * An estimate rather than a measurement, deliberately: measuring would mean
 * laying out every label of every pane to decide which of them to draw, which
 * is a layout pass per round to save a few numerals. Inter at 13px runs about
 * 7px to the character with `tabular-nums` holding the digits to one advance,
 * and the estimate is rounded *up* — the cost of guessing wide is one label
 * dropped a few pixels early, and of guessing narrow is the collision this
 * exists to prevent.
 */
function tickLabelWidth(text: string): number {
  return text.length * 7.2;
}

/** The clear air a ruler needs between two numbers before they read as two. */
const TICK_LABEL_GAP = 10;

/**
 * Which of a pane's ticks may print their year, given the width the rail
 * actually has.
 *
 * The panes' tick steps are chosen for the ruler to read in round numbers
 * (`PANE_SPEC`), not for how many labels fit — the common era's 250-year step
 * is nine of them, which is comfortable across a 940px rail and unreadable
 * across the ~260px one a 390px phone leaves: 1000, 1250 and 1500 ran into one
 * another. Changing the step by breakpoint would change the *ruler* with the
 * window, so the ticks are left alone and only the numbers under them thin
 * out. A minor division between each labelled one is still a ruler.
 *
 * **The thinning is a stride, not a greedy fit.** Taking whatever happens to
 * clear its neighbour is denser, and it was the first thing tried — it gave
 * the common era 1 / 250 / 500 / 750 / 1250 / 2026, which is a ruler with a
 * hole in it rather than a ruler. Every nth label is a scale a player can read
 * a position against, so this finds the smallest n whose labels all clear and
 * stops there.
 *
 * **Both ends always keep their label**, because they are the rail's own
 * limits and a ruler that does not say where it starts and stops is not
 * telling the player what the drag is measured against. The tick before the
 * far end gives way when the pane's last step is a short one — the common era
 * ends 1750, 2026 — which is the same trade `paneTicks` already makes one
 * level down, there with the tick itself.
 *
 * Width 0 is the render before the `ResizeObserver` has reported, and the
 * server's: it prints every label, which is what this component did at every
 * width until now, so the markup React hydrates against is unchanged.
 */
function tickLabelsShown(
  pane: TimelinePane,
  ticks: number[],
  texts: string[],
  width: number,
): boolean[] {
  const last = ticks.length - 1;
  const shown = ticks.map(() => width <= 0);
  if (width <= 0 || last < 0) return shown;
  if (last === 0) {
    shown[0] = true;
    return shown;
  }

  const xs = ticks.map((year) => fractionAtYear(pane, year) * width);
  const widths = texts.map(tickLabelWidth);

  /** Whether two labels, each centred on its own tick, stand apart. */
  const clears = (a: number, b: number) =>
    xs[b]! - xs[a]! >= (widths[a]! + widths[b]!) / 2 + TICK_LABEL_GAP;

  for (let stride = 1; stride <= last; stride += 1) {
    const kept: number[] = [];
    for (let i = 0; i < last; i += stride) kept.push(i);
    while (kept.length > 1 && !clears(kept[kept.length - 1]!, last)) kept.pop();
    kept.push(last);

    if (kept.every((index, i) => i === 0 || clears(kept[i - 1]!, index))) {
      for (const index of kept) shown[index] = true;
      return shown;
    }
  }

  // Narrower than its own two ends can be written across. They are printed
  // anyway: a rail with no scale on it is worse than two numerals that touch.
  shown[0] = true;
  shown[last] = true;
  return shown;
}

/**
 * A rail's own span, as the years at its two ends: `"1-1500"`, `"1500-2026"`.
 *
 * Era-less on purpose — `formatYearMagnitude` is the same formatter the ticks
 * under the rail use, so the door reads in the same units as the ruler it
 * stands at the end of. Only ever called for rails that lie wholly within the
 * common era, where that is unambiguous.
 */
function paneSpanLabel(pane: TimelinePane): string {
  const { min, max } = paneBounds(pane);
  return `${formatYearMagnitude(min)}\u2013${formatYearMagnitude(max)}`;
}

/** The era a pane covers, as its header. */
export function paneLabel(pane: TimelinePane, t: Dict): string {
  switch (pane) {
    case "cosmos":
      return t.cosmosEra;
    case "evolution":
      return t.evolutionEra;
    case "civilization":
      return t.civilizationEra;
    case "future":
      return t.future;
    // The two subject rails cover no era — they cover a subject — so their
    // heading is the subject's name.
    case "football":
      return t.footballTitle;
    case "screen":
      return t.screenTitle;
    // As on the doors: these three are spans rather than ages, so they say so.
    // The "Born When?" game passes `heading={false}` and never shows these —
    // it names itself in the column beside the rail — but a pane that fell
    // through to "Common Era" here would be mislabelled the moment anything
    // did.
    case "born-antiquity":
      return t.bc;
    case "born-premodern":
    case "born-modern":
      return paneSpanLabel(pane);
    case "ce":
    default:
      // Spelled out as a heading; the door pill keeps the abbreviation.
      return t.commonEraTitle;
  }
}

/**
 * The poster, and the handover to the next one.
 *
 * **The frame is fixed at 2:3 and the picture fills it.** A frame cut to each
 * picture would change height from round to round — it is the bottom edge the
 * result decks line up with — and the dataset is 200 posters scraped at
 * whatever size each was available in, so the frame takes the shape posters
 * are and the picture covers it. The crop that costs is real but small: every
 * poster in the pool measures between 0.64 and 0.75, so the worst of them
 * gives up 6% at two edges, and a poster carries more margin than that around
 * its own artwork. A band of empty card is the more expensive mistake — it
 * reads as a loading state, and it is on screen for the whole round.
 *
 * The dissolve follows the backdrop's rule, like `RoundCard`'s: the outgoing
 * poster is held at full opacity underneath and only the incoming layer
 * animates, so nothing is composited between them. The title does not dissolve
 * — two strings at half alpha on top of each other read as a fault — so the
 * old one leaves first and the new one arrives after the picture has settled.
 * Both timings live in app/globals.css.
 *
 * The title is **on** the poster rather than under it, which is the one place
 * this card departs from `RoundCard`. A caption block below would be another
 * fixed row in a column whose only flexible part is the picture; over the
 * poster's foot it costs the layout nothing, and the lower third of a poster
 * is where a title belongs anyway.
 */
export function PosterCard({
  event,
  badge,
  pill = null,
  titleHidden = false,
  t,
}: {
  event: PosterEvent;
  /** An overlay painted over the poster's foot — a verdict, or a wait. */
  badge: React.ReactNode;
  /**
   * The small fact about the round printed top-left — a film's format, a
   * person's field. Already localised by the caller, which is the game that
   * owns the fact; see `PosterEvent`.
   *
   * `null` is no pill, which every head-to-head round is and which any round
   * whose event has no such link in the database is. A picture with no pill is
   * still a playable round, so this is never a reason to refuse to deal one.
   */
  pill?: string | null;
  /**
   * Who owns the poster's lower third.
   *
   * `false` is the title, which is the whole of a round that has not been
   * answered. `"narrow"` gives it up below 1120px and keeps it above —
   * the solo game's rule, where the verdict is painted on the picture only on
   * the stacked layout and the result decks take over in the split one.
   * `true` gives it up at every width, which is the head-to-head mode's: its
   * result is a strip rather than a card and it is painted here on any
   * screen.
   */
  titleHidden?: false | "narrow" | true;
  t: Dict;
}) {
  // Derived during render rather than in an effect, so the incoming layer is
  // never painted once with nothing behind it.
  const [shown, setShown] = useState<{
    active: PosterEvent;
    leaving: PosterEvent | null;
  }>({ active: event, leaving: null });

  if (shown.active.id !== event.id) {
    setShown({ active: event, leaving: shown.active });
  }

  useEffect(() => {
    if (!shown.leaving) return;

    const timer = window.setTimeout(
      () => setShown((current) => ({ active: current.active, leaving: null })),
      ROUND_PHOTO_FADE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [shown.leaving, shown.active.id]);

  return (
    // The part of the column that gives: in the stacked layout it takes
    // whatever height the rail and the controls leave, and in the split one it
    // is the height of the row — which above 1120px *is* the card's 2:3, set
    // from the column's width by the split itself. See the note there.
    <div className="flex min-h-0 flex-1 justify-center min-[1120px]:block">
      {/* One frame for every round, filled edge to edge by whatever the poster
          is. A card cut to each picture's own ratio would be a card that
          changes height between rounds, which moves the bottom edge the result
          decks are aligned to and makes the left column breathe on every
          dissolve. The shape is 2:3 because posters are, and the picture
          *covers* it (`EventVisual`, `fit="cover"`): the handful in the pool
          that are 3:4 or 1.48:1 give up a few percent at two edges, which is
          the cost of a frame that is never part empty. 2:3 is what keeps that
          cost small — the widest of them loses 6% a side, well inside the
          margin a poster carries around its own artwork.
          `min-h-[12rem]` is the floor that keeps it a poster rather than a
          strip on a window too short for the full height. */}
      <div className="relative flex h-full min-h-[12rem] w-full max-w-[22rem] overflow-hidden rounded-3xl min-[1120px]:max-w-none border border-white/12 bg-black/35 shadow-2xl shadow-black/70 backdrop-blur-2xl">
        {shown.leaving && (
          <PosterLayer event={shown.leaving} t={t} />
        )}
        {/* Keyed on the event, so the dissolve restarts for each round rather
            than running once on mount. */}
        <div key={shown.active.id} className="round-photo-in absolute inset-0">
          <PosterLayer event={shown.active} t={t} />
        </div>

        {/* The round's own small fact, top-left, in the pill the progress
            counter wears — the two are the same kind of thing and on this
            screen they sit in the same read.
            It is *not* keyed off `shown.active`, unlike the picture and the
            title underneath: it arrives already resolved from the same `event`
            prop that drives the crossfade, so the two change on the same
            render. During a dissolve it therefore labels the incoming
            picture, which is the one being asked about. */}
        {pill && (
          <span className="absolute left-3 top-3 z-10 rounded-full border border-white/20 bg-black/55 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/80 backdrop-blur-md">
            {pill}
          </span>
        )}

        {/* The title, over the poster's own lower third. The scrim is what
            keeps it legible: the poster underneath is a different image every
            round and cannot be relied on to be dark there.

            **Below 1120px it gives the foot up to the verdict.** That is the
            one width where both want it: `RoundVerdict` is painted on the
            picture there (it has nowhere else to go on a stacked layout) and
            it lands in exactly this block. Printing the two on top of each
            other was unreadable, so the title fades — it has been on screen
            for the whole of the guess, and what the player is reading now
            takes its place. Above 1120px no verdict is painted here at all
            and both stay.

            **The scrim does not fade with it**, which is the point of
            splitting the two: a poster is far likelier to be bright than a
            photograph (half this pool is saturated artwork, and `12 Angry
            Men` is a wall of yellow), and the verdict arriving on top needs
            something dark under it. `RoundVerdict` brings a gradient of its
            own, but it is built for a photograph's foot and is only ~60%
            black where the tier's word lands. Leaving this one in place is
            what carries that word on any poster. */}
        <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-3 pb-3 pt-14">
          <div
            className={`relative h-16 transition-opacity duration-300 ${
              titleHidden === "narrow"
                ? "opacity-0 min-[1120px]:opacity-100"
                : titleHidden
                  ? "opacity-0"
                  : "opacity-100"
            }`}
          >
            {shown.leaving && (
              <RoundTitle key={`${shown.leaving.id}-leaving`} leaving>
                {shown.leaving.name}
              </RoundTitle>
            )}
            <RoundTitle key={shown.active.id}>{shown.active.name}</RoundTitle>
          </div>
        </div>

        {/* Last and highest, so it sits over both poster layers *and* the
            title block it is replacing. `pointer-events-none` on the wrapper
            rather than on the verdict: the verdict is already transparent to
            the pointer and its one control (the challenge) opts back in, so
            this layer cannot swallow the sensitive-content gate underneath
            it. */}
        {badge && (
          <div className="pointer-events-none absolute inset-0 z-20">
            {badge}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One poster, as a layer of the dissolve.
 *
 * Nothing but the picture, which covers the card — so there is no letterbox
 * left for the blurred, scaled copy of the poster that used to sit behind it
 * to fill, and it is gone.
 */
function PosterLayer({ event, t }: { event: PosterEvent; t: Dict }) {
  return (
    <div className="absolute inset-0">
      <EventVisual event={event} fit="cover" t={t} />
    </div>
  );
}
