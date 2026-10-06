"use client";

import { useEffect, useRef, useState } from "react";

import { EventVisual } from "@/components/event-visual";
import type { LocalizedEvent, SupportedLocale } from "@/lib/db/types";
import { ROUND_PHOTO_FADE_MS } from "@/lib/game/rounds";
import type { Verdict } from "@/lib/game/scoring";
import {
  coarseStepFraction,
  DEFAULT_PANE,
  entryFraction,
  fractionAtYear,
  keyStepFraction,
  paneBounds,
  paneEntrances,
  paneTicks,
  TIMELINE_PANES,
  type TimelinePane,
  yearAtFraction,
} from "@/lib/game/timeline";
import { formatYear, formatYearMagnitude } from "@/lib/historical-date";
import type { Dict } from "@/lib/i18n/dictionary";

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
}

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

/** Which dictionary entry each tier of `gradeGuess` prints. */
export const VERDICT_LABEL_KEYS: Record<Verdict, keyof Dict> = {
  perfect: "verdictPerfect",
  great: "verdictGreat",
  good: "verdictGood",
  bad: "verdictBad",
};

/**
 * Three colours for four tiers, on purpose. Green is already the true answer's
 * colour in both games, so it is the right one to reward with; the two top
 * tiers share it and the words tell them apart. "Good" stays ink — a third hue
 * would be the page's only decorative chroma. */
export const VERDICT_COLORS: Record<Verdict, string> = {
  perfect: "var(--color-good)",
  great: "var(--color-good)",
  good: "var(--color-ink)",
  bad: "var(--color-bad)",
};

/**
 * Crossing several eras at once is a longer journey, so it takes longer — but
 * sub-linearly, or walking cosmos-to-future would stall. Capped so the reveal
 * never feels like waiting.
 */
export function panDuration(from: TimelinePane, to: TimelinePane): number {
  const panes = Math.abs(
    TIMELINE_PANES.indexOf(to) - TIMELINE_PANES.indexOf(from),
  );
  return Math.min(1700, PAN_MS + Math.max(0, panes - 1) * 320);
}

/** Where every rail stands at the start of a round. */
export function openingFractions(): Record<TimelinePane, number> {
  return Object.fromEntries(
    TIMELINE_PANES.map((candidate) => [
      candidate,
      candidate === DEFAULT_PANE ? 0.5 : entryFraction(candidate, DEFAULT_PANE),
    ]),
  ) as Record<TimelinePane, number>;
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
    <div className="flex min-h-0 w-full max-w-[25rem] flex-1 flex-col overflow-hidden rounded-3xl border border-white/12 bg-black/35 shadow-2xl shadow-black/70 backdrop-blur-2xl sm:max-w-[32rem] sm:max-h-[26rem]">
      <div className="relative min-h-[5rem] w-full flex-1">
        {shown.leaving && (
          <div className="absolute inset-0">
            <EventVisual event={shown.leaving} />
          </div>
        )}
        {/* Keyed on the event, so the dissolve restarts for each round rather
            than running once on mount. */}
        <div key={shown.active.id} className="round-photo-in absolute inset-0">
          <EventVisual event={shown.active} />
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
  showGuess,
  answerYear,
  answerDelayMs,
  opponentYear = null,
  opponentLabel,
  locale,
  t,
  onEnter,
}: {
  pane: TimelinePane;
  active: boolean;
  fraction: number;
  onFractionChange: (fraction: number) => void;
  answered: boolean;
  showGuess: boolean;
  answerYear: number | null;
  answerDelayMs: number;
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
  const year = yearAtFraction(pane, fraction);

  function fractionFromClientX(clientX: number): number {
    const box = rail.current?.getBoundingClientRect();
    if (!box || box.width === 0) return fraction;
    return Math.min(1, Math.max(0, (clientX - box.left) / box.width));
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (answered) return;
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
    if (answered) return;

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
      className={`w-full shrink-0 px-6 transition-opacity duration-300 sm:px-12 ${
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
        <div className="on-photo text-center">
          <h3 className="font-display text-2xl font-semibold tracking-[-0.02em] text-ink sm:text-3xl">
            {paneLabel(pane, t)}
          </h3>
        </div>

        {/* The generous top padding is not decoration: the door pill and the
            marker's year bubble are both pinned to the end of the rail, so they
            collide unless the band above the track is tall enough to stack
            them. It doubles as the gap under the pane's heading, which is why
            the column above has no gap of its own. */}
        <div className="relative pb-14 pt-24">
          {/* Doors to the neighbouring panes, at the ends of the rail they
              open from. Leaving BC works exactly like entering it. */}
          {paneEntrances(pane).map((door) => (
            <EdgeButton
              key={door.target}
              side={door.side}
              // A door opens onto a shared boundary, so it appears exactly
              // when the marker reaches that end of the rail.
              visible={door.side === "left" ? fraction <= 0 : fraction >= 1}
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
              answered
                ? "cursor-default"
                : dragging
                  ? "cursor-grabbing"
                  : "cursor-pointer"
            }`}
          >
            {/* Travelled portion, so the marker reads as a position on a scale. */}
            {showGuess && (
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-accent"
                style={{ width: `${fraction * 100}%` }}
              />
            )}

            {paneTicks(pane).map((tickYear) => {
              const at = fractionAtYear(pane, tickYear);
              return (
                <div
                  key={tickYear}
                  className="absolute top-1/2 -translate-x-1/2"
                  style={{ left: `${at * 100}%` }}
                >
                  <div className="h-3 w-px -translate-y-1/2 bg-white/35" />
                  <span
                    className="on-photo absolute left-1/2 top-3 whitespace-nowrap text-[13px] tabular-nums text-white/65"
                    style={{ transform: `translateX(${-at * 100}%)` }}
                  >
                    {formatYearMagnitude(tickYear)}
                  </span>
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
                    {opponentLabel} {formatYear(opponentYear)}
                  </span>
                )}
              </div>
            )}

            {answerYear !== null && answered && (
              <div
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${fractionAtYear(pane, answerYear) * 100}%` }}
              >
                {/* Held back until the camera has finished travelling, so the
                    answer lands in front of the player rather than having been
                    sitting there through a pan they were not watching. */}
                <div
                  className="answer-stick on-photo h-8 w-0.5 origin-top rounded-full bg-good"
                  style={{ animationDelay: `${answerDelayMs}ms` }}
                />
                <span
                  // Below the ruler's own numerals, not level with them: the
                  // answer can land on a tick, and two labels in one line is
                  // unreadable exactly where it matters most.
                  className="answer-label on-photo absolute left-1/2 top-12 whitespace-nowrap text-[11px] font-semibold text-good"
                  style={{
                    transform: `translateX(${-fractionAtYear(pane, answerYear) * 100}%)`,
                    // Just behind the stick, so the year reads as its caption.
                    animationDelay: `${answerDelayMs + 180}ms`,
                  }}
                >
                  {formatYear(answerYear)}
                </span>
              </div>
            )}

            {showGuess && (
              <div
                role="slider"
                tabIndex={active && !answered ? 0 : -1}
                aria-label={t.timelineHint}
                aria-valuemin={bounds.min}
                aria-valuemax={bounds.max}
                aria-valuenow={year}
                aria-valuetext={formatYear(year)}
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
                  {formatYear(year)}
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
    case "ce":
    default:
      return t.commonEra;
  }
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
    case "ce":
    default:
      // Spelled out as a heading; the door pill keeps the abbreviation.
      return t.commonEraTitle;
  }
}

