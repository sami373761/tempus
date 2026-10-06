"use client";

import { useEffect, useRef, useState } from "react";

import { dealComparisonRounds } from "@/app/actions/rounds";
import { EventVisual } from "@/components/event-visual";
import { SetProgress, SetSummary } from "@/components/set-summary";
import type { LocalizedEvent, SupportedLocale } from "@/lib/db/types";
import {
  isComparisonCorrect,
  ROUND_PHOTO_FADE_MS,
  ROUND_QUEUE_DEPTH,
  ROUND_QUEUE_TARGET,
  type ComparisonRound,
  type ComparisonSide,
} from "@/lib/game/rounds";
import {
  comparisonResult,
  QUESTIONS_PER_SET,
  type SetResult,
} from "@/lib/game/set";
import { formatHistoricalDate } from "@/lib/historical-date";
import type { Dict } from "@/lib/i18n/dictionary";

/**
 * Comparison game.
 *
 * One timeline, oldest on the left and newest on the right. The two anchors are
 * pinned below the rail at the ends they define; the event being guessed hangs
 * above it and slides. Reading a position off a shared scale is the same
 * gesture as the date-guessing game, so the two rounds teach each other.
 *
 * The rule has not changed — the answer is still which anchor the event is
 * nearer to — so the midpoint of the rail is the boundary between the two.
 *
 * **No blue anywhere.** The date-guessing game paints the player's own marker
 * in `--color-accent`, but this round now stands on a photograph (see
 * `ComparisonBackdrop`) and the one saturated hue on the screen read as a UI
 * chrome left on top of it. Everything the player drives — the rail, the
 * travelled portion, the lit end, the live caption — is white at varying alpha
 * instead, which is the same language the glass surfaces already speak. Green
 * and red stay: they are the verdict, not the controls, and they are the one
 * thing on the page that must not be mistaken for decoration.
 *
 * The surfaces are the timeline game's glass for the same reason — an opaque
 * `bg-card` panel over a photograph reads as a leftover from another page.
 *
 * **The screen is one viewport and must not scroll**, like the date-guessing
 * screen — but the budget runs the other way round here. There the card takes
 * whatever height is left; here a card's height *follows its width* through a
 * 16/9 picture, so the width is what has to be solved for. `--bubble` below
 * does that: subtract everything that is not a photograph, split the rest
 * between the two lanes, convert back to a width. The consequence is that the
 * fixed parts are genuinely fixed — every row the page gains is a row the
 * pictures lose — which is why the header, the caption blocks and the verdict
 * are all sized as tightly as they are, and why `--compare-chrome` has to be
 * edited whenever one of them changes.
 *
 * **Rounds are a queue, not a route.** The page deals two and this component
 * plays through them, topping the queue back up from the server while the
 * current round is still being answered and preloading the next round's three
 * photographs. "Next round" is therefore a state change: no reload, no refetch
 * in the way, nothing to wait for. The three bubbles dissolve into their
 * replacements while the floating event glides back to the middle of the rail —
 * the same two motions the date-guessing game uses, for the same reason.
 */

/** Travelled per arrow-key press. ~50 steps end to end. */
const KEY_STEP = 0.02;

/** How long to wait before trying again when topping the queue up fails. */
const REFILL_RETRY_MS = 1500;

export function ComparisonGame({
  rounds,
  t,
  locale,
}: {
  rounds: ComparisonRound[];
  t: Dict;
  locale: SupportedLocale;
}) {
  const [fraction, setFraction] = useState(0.5);
  const [dragging, setDragging] = useState(false);
  const [choice, setChoice] = useState<ComparisonSide | null>(null);
  // The round being played is the head of the queue; the one behind it is the
  // next round, held only so its pictures can be preloaded and swapped in.
  const [queue, setQueue] = useState<ComparisonRound[]>(rounds);
  const [refillAttempt, setRefillAttempt] = useState(0);
  // The set so far: one entry per question already answered *and* advanced
  // past, so its length is both the score and the position in the set.
  const [results, setResults] = useState<SetResult[]>([]);
  // Latched when the player presses "Next round" before the queue has a round
  // to give them — see the note on `ROUND_QUEUE_TARGET`. The button must never
  // be dead, only late.
  const [pendingNext, setPendingNext] = useState(false);

  const rail = useRef<HTMLDivElement>(null);
  // Distance between the pointer and the bubble's centre when the drag began.
  // Without it, grabbing a wide card by its edge would snap it under the cursor.
  const grab = useRef<{ pointerId: number; offset: number } | null>(null);

  const round = queue[0] ?? null;
  const upcoming = queue[1] ?? null;
  const answered = choice !== null;

  // Top the queue back up in the background. Keyed on the queue's length rather
  // than on its contents, so playing a round triggers exactly one refill;
  // `refillAttempt` is what lets a failed one be tried again, since a failure
  // leaves the length — and therefore the dependencies — unchanged.
  useEffect(() => {
    if (queue.length >= ROUND_QUEUE_TARGET) return;

    let cancelled = false;
    let retry: number | null = null;

    dealComparisonRounds(ROUND_QUEUE_DEPTH)
      .then((fresh) => {
        if (cancelled) return;
        // Rounds are identified by the event being guessed: two rounds built
        // from different anchors are different rounds even if one event repeats,
        // but the same target twice running would read as a repeat.
        setQueue((current) => [
          ...current,
          ...fresh.filter(
            (candidate) =>
              !current.some((held) => held.target.id === candidate.target.id),
          ),
        ]);
      })
      .catch(() => {
        if (cancelled) return;
        retry = window.setTimeout(
          () => setRefillAttempt((n) => n + 1),
          REFILL_RETRY_MS,
        );
      });

    return () => {
      cancelled = true;
      if (retry !== null) window.clearTimeout(retry);
    };
  }, [queue.length, refillAttempt]);

  // Pull the next round's three photographs while this one is still being
  // answered, so the dissolve has something to dissolve *to*.
  useEffect(() => {
    if (!upcoming) return;

    for (const event of [upcoming.left, upcoming.target, upcoming.right]) {
      const url = event.image?.url;
      if (!url) continue;
      const preload = new window.Image();
      preload.src = url;
    }
  }, [upcoming]);

  function fractionFromClientX(clientX: number): number {
    const box = rail.current?.getBoundingClientRect();
    if (!box || box.width === 0) return fraction;
    return clamp((clientX - box.left) / box.width);
  }

  function startDrag(event: React.PointerEvent<HTMLElement>, offset: number) {
    if (answered) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    grab.current = { pointerId: event.pointerId, offset };
    setDragging(true);
  }

  function onBubblePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    startDrag(event, fraction - fractionFromClientX(event.clientX));
  }

  // Tapping the rail itself jumps the bubble there — no offset to preserve.
  function onRailPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (answered) return;
    startDrag(event, 0);
    setFraction(fractionFromClientX(event.clientX));
  }

  function onPointerMove(event: React.PointerEvent<HTMLElement>) {
    const active = grab.current;
    if (!active || active.pointerId !== event.pointerId) return;
    setFraction(clamp(fractionFromClientX(event.clientX) + active.offset));
  }

  function onPointerUp(event: React.PointerEvent<HTMLElement>) {
    const active = grab.current;
    if (!active || active.pointerId !== event.pointerId) return;
    grab.current = null;
    setDragging(false);
  }

  // Keyboard equivalent, so the round is playable without a pointer.
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (answered) return;

    const direction =
      event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (direction !== 0) {
      event.preventDefault();
      setFraction((current) => clamp(current + direction * KEY_STEP));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      submit();
    }
  }

  function submit() {
    if (answered || !round) return;

    const side: ComparisonSide = fraction < 0.5 ? "left" : "right";
    setChoice(side);
    // Settle onto the truth, so the reveal reads as "here is where it actually
    // sat" rather than a verdict printed next to a stale marker.
    setFraction(fractionAtYear(round, round.target.year));
  }

  /**
   * The next round, without a page load.
   *
   * The marker is sent back to the middle rather than cut there: it still
   * carries the 450ms ease the drag release uses, so it glides home under the
   * bubbles while they dissolve, and the two motions read as one.
   */
  /** Advance for real. Callers are responsible for there being a round to take. */
  function advance() {
    // `choice` is what makes this an answered round; without one there is no
    // result to bank and nothing to advance past.
    if (!upcoming || round === null || choice === null) return;

    // Banked here rather than at `submit`, so `results.length` is always the
    // number of questions *left behind* — which makes it the index of the one
    // on screen as well as the score. The set is over when this push fills it,
    // and the round underneath advances anyway: the summary covers a fresh
    // question 1, so "Play again" is a state change with nothing to deal.
    setResults((current) => [
      ...current,
      comparisonResult(isComparisonCorrect(round, choice)),
    ]);

    setChoice(null);
    setFraction(0.5);
    setQueue((current) => current.slice(1));
  }

  /**
   * What the button calls. A press with nothing queued is remembered rather
   * than dropped, and the effect below plays it the moment a round arrives.
   */
  function requestNextRound() {
    if (!answered) return;
    if (!upcoming) {
      setPendingNext(true);
      return;
    }
    advance();
  }

  // `advance` is deliberately not a dependency: it is re-created every render
  // and would restart this effect forever. The effect only runs on the render
  // where `upcoming` has just arrived, so the `advance` it closes over is that
  // render's — which is the current one.
  useEffect(() => {
    if (!pendingNext || !upcoming || !answered) return;
    setPendingNext(false);
    advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNext, upcoming, answered]);

  const correct =
    answered && round !== null && isComparisonCorrect(round, choice);
  // The set is full once ten questions have been banked; until then the last
  // of them turns "Next round" into "See results", because the button is about
  // to do something other than deal another question.
  const setComplete = results.length >= QUESTIONS_PER_SET;
  const lastQuestion = results.length === QUESTIONS_PER_SET - 1;
  // Which half the bubble is in, for the live highlight on the anchor it leans
  // toward. Dead centre commits to neither.
  const leaning: ComparisonSide | null =
    choice ?? (fraction === 0.5 ? null : fraction < 0.5 ? "left" : "right");

  if (!round) return null;

  if (setComplete) {
    // The backdrop is a server component on the page, so unlike the
    // date-guessing game there is nothing here the summary has to keep
    // mounted. The round underneath is already reset to a fresh question, so
    // "Play again" has nothing left to do but clear the set.
    return (
      <SetSummary
        results={results}
        title={t.comparisonTitle}
        otherHref="/guess"
        otherLabel={t.tryTimeline}
        onPlayAgain={() => setResults([])}
        t={t}
      />
    );
  }

  return (
    <>
      {/* The round's masthead. It lives here rather than on the page because
          its blurb is a live instruction, and the summary above replaces it
          outright rather than letting it stand over a finished set.

          `on-photo` rather than a heavier type colour: the backdrop's scrim
          already carries most of the contrast, and a drop shadow that tracks
          the glyphs keeps the thin display face from thickening into a slab.
          Deliberately tighter than the rest of the site's mastheads — every
          pixel it gives up goes to the photographs below it, which are the
          part of the round the player actually reads. It is one of the rows
          `--compare-chrome` accounts for, so its height is not free. */}
      <header className="on-photo mb-5 shrink-0 text-center">
        <p className="font-display text-3xl font-semibold tracking-[-0.025em] text-ink">
          {t.comparisonTitle}
        </p>
        <p className="mt-2 text-sm text-white/70">{t.comparisonBlurb}</p>
      </header>

      <div
        className="mx-auto flex w-full flex-1 flex-col items-center justify-center gap-5"
        style={
          {
            // One knob for the whole scale: every bubble is this wide, and the
            // rail is inset by half of it so a bubble centred on an end still
            // fits on screen.
            //
            // It is solved from the *height*, which is the opposite of how a
            // card is usually sized and is forced by the 16/9 picture inside it:
            // width sets height, so a width picked from the viewport's width
            // decides how tall the screen has to be. The height term subtracts
            // everything that is not a photograph (`--compare-chrome`, broken
            // down in app/globals.css), splits what is left between the two
            // lanes, and converts that back to a width — which is what keeps
            // this screen inside one viewport while still filling it. 38vw caps
            // it on a narrow phone, where two of these sit side by side below
            // the rail, and 360px stops a tall desktop window turning the cards
            // into billboards.
            "--bubble":
              "clamp(132px, min(38vw, calc((100dvh - var(--site-bar-h) - var(--compare-chrome)) / 2 * 16 / 9)), 360px)",
            // How tall a lane is: the picture, plus the caption block's reserved
            // two lines. See the lanes below for why it is fixed rather than
            // grown into.
            "--lane": "calc(var(--bubble) * 9 / 16 + var(--card-text))",
            "--card-text": "5.375rem",
          } as React.CSSProperties
        }
      >
        <div className="w-full px-[calc(var(--bubble)/2)]">
          {/* Upper lane: the event being placed. Percentage margins resolve
            against the rail's width, which is what makes the bubble's centre
            track the marker exactly.

            The lane's height is fixed and the card hangs from its bottom edge,
            which is what pins the rail. A caption that needs a third line
            grows the card *upward*, into the header's margin, instead of
            pushing the rail and everything under it down the screen — and on a
            screen budgeted to the pixel, that distinction is the difference
            between a still rail and a scrollbar. */}
          {/* The lane is taller than the card hanging from its bottom edge, so
            the top of it is empty — which is where the counter goes. Absolute,
            because this screen's height is a hand-maintained sum
            (`--compare-chrome` in app/globals.css) and a counter in the flow
            would be a row the photographs pay for. */}
          <div className="relative flex h-[var(--lane)] items-end">
            <div className="pointer-events-none absolute left-0 top-0 z-10">
              <SetProgress
                played={results.length}
                total={QUESTIONS_PER_SET}
                t={t}
              />
            </div>

            <div
              role="slider"
              tabIndex={answered ? -1 : 0}
              aria-label={t.comparisonHint}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(fraction * 100)}
              onPointerDown={onBubblePointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={onKeyDown}
              style={{
                marginLeft: `calc(${fraction * 100}% - var(--bubble) / 2)`,
                transition: dragging ? "none" : "margin-left 450ms ease-out",
              }}
              // `shrink-0` matters: the margin below grows with the fraction, so
              // near the right end margin + width overflows the row and flex
              // would otherwise squeeze the bubble narrower as it travels.
              className={`no-drag-select w-[var(--bubble)] shrink-0 rounded-[28px] focus-visible:outline-2 focus-visible:outline-offset-[6px] focus-visible:outline-ink ${
                answered
                  ? "cursor-default"
                  : dragging
                    ? "cursor-grabbing"
                    : "cursor-grab"
              }`}
            >
              <EventBubble
                event={round.target}
                tail="down"
                caption={
                  answered ? formatHistoricalDate(round.target, locale) : "???"
                }
                captionClassName={answered ? "text-good" : "text-white/75"}
                raised
              />
            </div>
          </div>

          <div
            onPointerDown={onRailPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className={`no-drag-select relative ${
              answered ? "cursor-default" : "cursor-pointer"
            }`}
            // Padding is the tail's own height, read from the constant the tail
            // is drawn from, so both tails land exactly on the rail however the
            // tail is resized.
            style={{ paddingBlock: TAIL_H }}
          >
            <div ref={rail} className="relative h-2.5 rounded-full bg-white/25">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-white/70"
                style={{
                  width: `${fraction * 100}%`,
                  transition: dragging ? "none" : "width 450ms ease-out",
                }}
              />
              {/* Midpoint: the actual boundary between the two answers. */}
              <div className="absolute left-1/2 top-1/2 h-6 w-px -translate-x-1/2 -translate-y-1/2 bg-white/35" />
              {/* The ends of the scale, which the anchors below sit on. */}
              <RailDot at={0} active={leaning === "left"} />
              <RailDot at={1} active={leaning === "right"} />
            </div>
          </div>

          {/* Lower lane: the two anchors, each centred on the rail end it marks.
            Fixed height and anchored to the top for the same reason the upper
            lane is anchored to the bottom — a long name grows away from the
            rail, never into it. */}
          <div className="relative flex h-[var(--lane)] items-start justify-between -mx-[calc(var(--bubble)/2)]">
            {/* The round's action sits in the gap the anchors leave — the player
              is already looking here, and it holds one spot across both states
              so the layout does not jump on answering.

              Only from `md` up: below that the gap is narrower than the button,
              which would park it on top of both anchors. */}
            <div className="pointer-events-none absolute inset-0 z-10 hidden items-center justify-center px-3 md:flex">
              <ActionButton
                answered={answered}
                pending={pendingNext}
                lastQuestion={lastQuestion}
                onSubmit={submit}
                onNext={requestNextRound}
                t={t}
                floating
              />
            </div>

            <div className="w-[var(--bubble)]">
              <EventBubble
                event={round.left}
                tail="up"
                caption={formatHistoricalDate(round.left, locale)}
                highlighted={leaning === "left"}
              />
            </div>
            <div className="w-[var(--bubble)]">
              <EventBubble
                event={round.right}
                tail="up"
                caption={formatHistoricalDate(round.right, locale)}
                highlighted={leaning === "right"}
              />
            </div>
          </div>
        </div>

        <div className="on-photo flex shrink-0 flex-col items-center gap-3">
          {/* The hint and the verdict share one reserved box. They are different
            heights — one line against two — and on a screen budgeted to the
            pixel the taller one has to be paid for before it arrives, or
            locking in a guess moves the rail it is a verdict on. */}
          <div className="flex min-h-16 flex-col items-center justify-center gap-2">
            {answered ? (
              <>
                <p
                  className="font-display text-xl font-semibold tracking-tight"
                  style={{
                    color: correct ? "var(--color-good)" : "var(--color-bad)",
                  }}
                >
                  {correct ? t.correct : t.incorrect}
                </p>
                <p className="text-sm text-white/70">
                  {t.actualDate}: {formatHistoricalDate(round.target, locale)}
                </p>
              </>
            ) : (
              <p className="text-sm text-white/70">{t.comparisonHint}</p>
            )}
          </div>

          {/* The narrow-screen home for the action — see the md-only copy
            floating between the anchors above. */}
          <div className="md:hidden">
            <ActionButton
              answered={answered}
              pending={pendingNext}
              lastQuestion={lastQuestion}
              onSubmit={submit}
              onNext={requestNextRound}
              t={t}
            />
          </div>
        </div>
      </div>
    </>
  );
}

/** What a bubble shows: the event, and the round's own label for it. */
interface BubbleContent {
  event: LocalizedEvent;
  caption: string;
  captionClassName: string;
}

/**
 * An event as a speech bubble: rounded card, triangular tail pointing at the
 * rail. `tail="down"` hangs above the line, `tail="up"` stands below it.
 *
 * It also owns the handover to the next round. The photograph cross-dissolves
 * on the backdrop's rule — the outgoing picture held at full opacity underneath,
 * only the incoming layer animating — while the caption and name, which cannot
 * dissolve legibly, leave first and arrive once the picture has settled.
 *
 * Two things are worth knowing before changing this.
 *
 * The crossfade keys on the **event's identity, not on the caption**. The
 * caption changes mid-round too — the floating bubble's "???" becomes the real
 * date the moment the guess is locked in — and that must update in place
 * rather than trigger a dissolve. So the live props are what the active layer
 * renders, and `shown.active` is kept in step with them purely so that it
 * carries the *revealed* caption, not the stale one, when it later becomes the
 * outgoing layer.
 *
 * The text block is a grid cell holding both layers, so during a swap it is as
 * tall as the taller of them and neither is clipped. `min-h` reserves two lines
 * of the name plus its date — and two is enough because the card is wide now:
 * measured against the 66 longest names in the dataset at the full 360px
 * bubble, exactly one still wants a third line, and none has ever wanted a
 * fourth. It reserved three lines when the card was 228px wide, which is where
 * most of the picture's new height came from.
 *
 * The third line is not clipped when it does come. It is the *lane* that is
 * fixed, not the card, and the card is anchored to the rail inside it, so a
 * taller card grows away from the rail — see the lanes in `ComparisonGame`.
 * That is what lets the reservation be the common case rather than the worst
 * one.
 */
function EventBubble({
  event,
  tail,
  caption,
  captionClassName = "text-ink-dim",
  highlighted = false,
  raised = false,
}: {
  event: LocalizedEvent;
  tail: "up" | "down";
  caption: string;
  captionClassName?: string;
  highlighted?: boolean;
  raised?: boolean;
}) {
  const live: BubbleContent = { event, caption, captionClassName };

  // Derived during render rather than in an effect, so the incoming layer is
  // never painted once with nothing behind it.
  const [shown, setShown] = useState<{
    active: BubbleContent;
    leaving: BubbleContent | null;
  }>(() => ({ active: live, leaving: null }));

  if (shown.active.event.id !== event.id) {
    setShown({ active: live, leaving: shown.active });
  } else if (
    shown.active.caption !== caption ||
    shown.active.captionClassName !== captionClassName
  ) {
    setShown({ active: live, leaving: shown.leaving });
  }

  useEffect(() => {
    if (!shown.leaving) return;

    const timer = window.setTimeout(
      () => setShown((current) => ({ active: current.active, leaving: null })),
      ROUND_PHOTO_FADE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [shown.leaving, shown.active.event.id]);

  return (
    <div className="relative">
      <div
        className={`overflow-hidden rounded-[28px] border bg-black/35 shadow-2xl shadow-black/70 backdrop-blur-2xl transition-colors duration-300 ${
          highlighted ? "border-white/55" : "border-white/12"
        } ${raised ? "shadow-black/80" : ""}`}
      >
        <div className="relative aspect-[16/9] w-full">
          {shown.leaving && (
            <div className="absolute inset-0">
              <EventVisual event={shown.leaving.event} />
            </div>
          )}
          {/* Keyed on the event, so the dissolve restarts for each round rather
              than running once on mount. */}
          <div
            key={shown.active.event.id}
            className="round-photo-in absolute inset-0"
          >
            <EventVisual event={shown.active.event} />
          </div>
        </div>

        {/* `var(--card-text)` less the 2px of border the lane's height also
            accounts for, so a two-line card is exactly one lane tall. */}
        <div className="grid min-h-[calc(var(--card-text)-2px)] px-4 py-3 text-center">
          {shown.leaving && (
            <BubbleText
              key={`${shown.leaving.event.id}-leaving`}
              content={shown.leaving}
              leaving
            />
          )}
          <BubbleText key={shown.active.event.id} content={shown.active} />
        </div>
      </div>
      <Tail direction={tail} highlighted={highlighted} />
    </div>
  );
}

function BubbleText({
  content,
  leaving = false,
}: {
  content: BubbleContent;
  leaving?: boolean;
}) {
  return (
    <div
      className={`col-start-1 row-start-1 flex flex-col justify-center ${
        leaving ? "round-title-out" : "round-title-in"
      }`}
    >
      {/* The date stays small — it is a label on the card, and on the two
          anchors it is the one thing the player has already been told. */}
      <p
        className={`text-[11px] font-medium uppercase leading-4 tracking-[0.16em] ${content.captionClassName}`}
      >
        {content.caption}
      </p>
      {/* The name is what the round is actually about, so it grows with the
          card. `text-sm` below `sm`, where the bubble is down to 132px and a
          larger face would only wrap further. */}
      <p className="mt-1 text-sm font-semibold leading-tight text-ink sm:text-base">
        {content.event.name}
      </p>
    </div>
  );
}

/**
 * The bubble's tail.
 *
 * An SVG rather than the usual pair of stacked CSS triangles: the filled
 * polygon and the stroked *polyline* are separate, so only the two slanted
 * edges get the card's hairline and the base does not. The whole thing is
 * pulled a pixel back over the card so the fill hides the card's own border
 * where the tail meets it — otherwise a line runs visibly across the join.
 */
const TAIL_W = 44;
const TAIL_H = 20;

function Tail({
  direction,
  highlighted,
}: {
  direction: "up" | "down";
  highlighted: boolean;
}) {
  const down = direction === "down";
  // Apex at the rail, base against the card.
  const points = down
    ? `0,0 ${TAIL_W / 2},${TAIL_H} ${TAIL_W},0`
    : `0,${TAIL_H} ${TAIL_W / 2},0 ${TAIL_W},${TAIL_H}`;

  return (
    <svg
      aria-hidden="true"
      width={TAIL_W}
      height={TAIL_H}
      viewBox={`0 0 ${TAIL_W} ${TAIL_H}`}
      className={`pointer-events-none absolute left-1/2 -translate-x-1/2 ${
        down ? "top-full -mt-px" : "bottom-full -mb-px"
      }`}
    >
      {/* Matches the bubble's own fill. It cannot also carry its backdrop blur
          — that is a property of the element, not of a colour — but at 38x20
          over a vignetted photograph the difference does not read. */}
      <polygon points={points} fill="rgba(0,0,0,0.35)" />
      <polyline
        points={points}
        fill="none"
        stroke={
          highlighted ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.12)"
        }
        strokeWidth="1"
        strokeLinejoin="round"
        className="transition-[stroke] duration-300"
      />
    </svg>
  );
}

/** The round's primary action: lock in before answering, next round after. */
function ActionButton({
  answered,
  pending,
  lastQuestion,
  onSubmit,
  onNext,
  t,
  floating = false,
}: {
  answered: boolean;
  /** The press is latched and waiting on a draw. Never disables the button. */
  pending: boolean;
  /** The tenth question: the button ends the set rather than dealing another. */
  lastQuestion: boolean;
  onSubmit: () => void;
  onNext: () => void;
  t: Dict;
  floating?: boolean;
}) {
  const base = `rounded-full bg-ink px-7 py-3 text-sm font-semibold text-page transition-opacity hover:opacity-85 disabled:opacity-50 ${
    floating ? "pointer-events-auto shadow-xl shadow-black/50" : ""
  }`;

  return answered ? (
    <button
      type="button"
      onClick={onNext}
      // Never disabled: a press with nothing queued is latched and played as
      // soon as the draw lands, which is what keeps it from going dead for the
      // whole of a slow refill.
      aria-busy={pending}
      className={`${base} ${pending ? "cursor-progress opacity-60" : ""}`}
    >
      {lastQuestion ? t.seeResults : t.nextRound}
    </button>
  ) : (
    <button type="button" onClick={onSubmit} className={base}>
      {t.submitGuess}
    </button>
  );
}

/** End-of-scale marker, lit while the bubble leans that way. */
function RailDot({ at, active }: { at: 0 | 1; active: boolean }) {
  return (
    <div
      className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-300 ${
        active ? "bg-ink" : "bg-white/30"
      }`}
      style={{ left: `${at * 100}%` }}
    />
  );
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Where a year sits on the rail. Linear between the anchors, which is exact:
 * astronomical year numbering makes this plain subtraction (lib/historical-date.ts).
 */
function fractionAtYear(round: ComparisonRound, year: number): number {
  const span = round.right.year - round.left.year;
  if (span === 0) return 0.5; // The draw asks for distinct years; be safe anyway.
  return clamp((year - round.left.year) / span);
}
