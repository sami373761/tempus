"use client";

import { useEffect, useRef, useState } from "react";

import { dealComparisonRounds } from "@/app/actions/rounds";
import { EventVisual } from "@/components/event-visual";
import { VerdictDeckRow } from "@/components/round-flank";
import { SetSummary } from "@/components/set-summary";
import { SurvivalSummary } from "@/components/survival-summary";
import type { LocalizedEvent, SupportedLocale } from "@/lib/db/types";
import {
  comparisonFractionAtYear,
  comparisonSection,
  comparisonSectionDistance,
  comparisonVerdict,
  COMPARISON_SECTIONS,
  EXCLUDED_EVENT_LIMIT,
  isComparisonCorrect,
  ROUND_PHOTO_FADE_MS,
  ROUND_QUEUE_DEPTH,
  ROUND_QUEUE_TARGET,
  roundEventIds,
  sectionSide,
  type ComparisonRound,
  type ComparisonSide,
} from "@/lib/game/rounds";
import {
  comparisonResult,
  QUESTIONS_PER_SET,
  type SetResult,
} from "@/lib/game/set";
import { survivalResult } from "@/lib/game/survival";
import { VERDICT_COLORS } from "@/lib/game/verdict-style";
import { formatHistoricalDate } from "@/lib/historical-date";
import { dateLabels, format, type Dict } from "@/lib/i18n/dictionary";

/**
 * Comparison game.
 *
 * One timeline, oldest on the left and newest on the right. The two anchors are
 * pinned below the rail at the ends they define; the event being guessed hangs
 * above it and slides. Reading a position off a shared scale is the same
 * gesture as the date-guessing game, so the two rounds teach each other.
 *
 * The question has not changed — the answer is still which anchor the event is
 * nearer to — but the rail now says it at a resolution. Five dividers cut it
 * into six equal sections, so a section is a sixth of the distance between the
 * two anchors whatever that distance is, and the round states its own scale.
 * The three older sections are still the left answer and the three newer ones
 * the right, so the middle divider is the boundary it always was; what the
 * other four buy is a *margin*, which is what lets this round be graded on the
 * date-guessing game's five-rung ladder instead of being right or wrong.
 * lib/game/rounds.ts owns that rule.
 *
 * **Nothing the player drives is painted at all.** The rail used to fill in
 * behind the bubble and light a dot at whichever end it leaned toward; both
 * are gone, and what is left is the track, its dividers and the bubble itself.
 * The fill was a second readout of a position the bubble already states, and
 * at a glance it read as progress rather than as a choice. The one coloured
 * thing that ever appears on this rail is the band over the section the guess
 * was locked into, in that guess's own tier colour — which is the same hue the
 * result card is headed in, and the same arrangement the date-guessing rail
 * uses for the gap between a guess and the truth.
 *
 * **No blue anywhere.** The date-guessing game painted its travelled portion
 * in `--color-accent`, but this round stands on a photograph (see
 * `ComparisonBackdrop`) and the one saturated hue on the screen read as a UI
 * chrome left on top of it. Everything that is not a verdict is white at
 * varying alpha, which is the same language the glass surfaces already speak.
 * The other rail came round to this on 2026-10-08 and is white now too;
 * `--color-accent` is the site's focus ring and `--color-tier-perfect`, and no
 * longer anything a player drives.
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
 * pictures lose — which is why the caption blocks and the verdict are sized as
 * tightly as they are, why the masthead was moved out of the flow altogether
 * (`RoundHead`), and why `--compare-chrome` has to be edited whenever one of
 * them changes.
 *
 * **Two modes play on this one screen.** `set` is the ten-question bracket
 * this game has always been; `survival` is the same round with no bracket at
 * all, over at the first answer on the wrong side of the rail. The mechanics
 * are deliberately identical — the rail, the six sections, the drag, the grade,
 * the queue, the result card — because the mode is a rule about *when the game
 * stops*, not a second game, and a player who has learned one has learned both.
 * So this is one component with a `mode` prop rather than a fork of 900 lines:
 * everything below branches in exactly three places (what a result records,
 * what ends the game, and which summary it ends on), and anything that is not
 * one of those three cannot drift between the two modes.
 *
 * **Rounds are a queue, not a route.** The page deals two and this component
 * plays through them, topping the queue back up from the server while the
 * current round is still being answered and preloading the next round's three
 * photographs. "Next round" is therefore a state change: no reload, no refetch
 * in the way, nothing to wait for. The three bubbles dissolve into their
 * replacements while the floating event glides back to the middle of the rail —
 * the same two motions the date-guessing game uses, for the same reason.
 */

/**
 * Which rule brackets the endless queue of rounds.
 *
 * `set` stops at `QUESTIONS_PER_SET` whatever the player scores; `survival`
 * runs until they are wrong. Nothing else about the round differs.
 */
export type ComparisonMode = "set" | "survival";

/** Travelled per arrow-key press. ~50 steps end to end. */
const KEY_STEP = 0.02;

/**
 * What a bubble's caption reads before the guess is locked in — all three of
 * them, the two anchors included.
 *
 * The anchors carried their dates all round until 2026-10-08, which made the
 * question arithmetic: both ends were numbers, so the round could be answered
 * without recognising a single one of the three events. Hiding them puts the
 * history back — you place the middle event against two you have to *know* —
 * and the dates all arrive together on the reveal, where they are the answer
 * rather than the input.
 *
 * One constant rather than three literals so the three captions cannot drift
 * apart: before a guess they are the same kind of unknown and have to read as
 * one.
 */
const HIDDEN_DATE = "???";

/** How long to wait before trying again when topping the queue up fails. */
const REFILL_RETRY_MS = 1500;

export function ComparisonGame({
  rounds,
  t,
  locale,
  mode = "set",
}: {
  rounds: ComparisonRound[];
  t: Dict;
  locale: SupportedLocale;
  mode?: ComparisonMode;
}) {
  const survival = mode === "survival";
  // How a date is written in this language: the era's abbreviation and where
  // it sits relative to the number. See `dateLabels`.
  const labels = dateLabels(t);
  const [fraction, setFraction] = useState(0.5);
  const [dragging, setDragging] = useState(false);
  // Which of the six sections the player locked in, which is a finer record of
  // the same answer the side always was — `sectionSide` is the half it commits
  // to, and the margin is what grades the round. It has to be kept rather than
  // re-read off `fraction`, because locking in slides the bubble onto the
  // truth: a moment later the rail no longer remembers where the guess was.
  const [picked, setPicked] = useState<number | null>(null);
  // The round being played is the head of the queue; the one behind it is the
  // next round, held only so its pictures can be preloaded and swapped in.
  const [queue, setQueue] = useState<ComparisonRound[]>(rounds);
  const [refillAttempt, setRefillAttempt] = useState(0);
  // The set so far: one entry per question already answered *and* advanced
  // past, so its length is both the score and the position in the set.
  const [results, setResults] = useState<SetResult[]>([]);
  // Which events this set has already used — all three per round, anchors
  // included, because a round built from anchors the player has just been
  // shown reads as a repeat even when the event being guessed is new. Kept
  // beside `results` rather than derived from one, which records a verdict and
  // not the round that earned it.
  const [played, setPlayed] = useState<string[]>([]);
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
  const answered = picked !== null;
  const choice: ComparisonSide | null =
    picked === null ? null : sectionSide(picked);

  // Top the queue back up in the background. Keyed on the queue's length rather
  // than on its contents, so playing a round triggers exactly one refill;
  // `refillAttempt` is what lets a failed one be tried again, since a failure
  // leaves the length — and therefore the dependencies — unchanged.
  //
  // **The draw is told which events this set has already used.** A refill tops
  // up two rounds at a time, so left to itself each draw knows only what the
  // game is holding — which keeps a round from repeating the one before it and
  // does nothing about question nine repeating question two. The pool is a few
  // hundred events and a set of ten spends thirty of them, which is well
  // inside the range where chance alone produces duplicates. The exclusion is
  // a preference on the server's side rather than a filter (see `exclude` in
  // lib/db/queries.ts), so a pool too small to honour it still returns a full
  // draw.
  useEffect(() => {
    if (queue.length >= ROUND_QUEUE_TARGET) return;

    let cancelled = false;
    let retry: number | null = null;

    // Everything this set has in play: the rounds left behind, plus the three
    // events of every round still queued. Most recent last, since that is the
    // end `EXCLUDED_EVENT_LIMIT` keeps.
    const dealt = [...played, ...queue.flatMap(roundEventIds)];

    dealComparisonRounds(ROUND_QUEUE_DEPTH, dealt.slice(-EXCLUDED_EVENT_LIMIT))
      .then((fresh) => {
        if (cancelled) return;
        setQueue((current) => {
          // Belt and braces for the one case the server cannot honour: a pool
          // with nothing unseen left in it degrades to repeating something, so
          // drop a round whose target is already in hand. Rounds are
          // identified by the event being guessed — two rounds built from
          // different anchors are different rounds even if one event repeats.
          // **Never the whole batch**, though: this effect is keyed on the
          // queue's length, so a draw that added nothing would never be
          // retried and the queue would stop growing.
          const added = fresh.filter(
            (candidate) =>
              !current.some((held) => held.target.id === candidate.target.id),
          );
          return [...current, ...(added.length > 0 ? added : fresh)];
        });
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
    // `queue` and `played` are read for the exclusion list but deliberately
    // not depended on: a draw already in flight has no reason to be restarted
    // because the player answered a round, and the length is what says a
    // refill is owed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    setPicked(comparisonSection(fraction));
    // Settle onto the truth, so the reveal reads as "here is where it actually
    // sat" rather than a verdict printed next to a stale marker. The section
    // just banked is what keeps the guess on screen after the bubble has left
    // it — see the band drawn on the rail below.
    setFraction(comparisonFractionAtYear(round, round.target.year));
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
    if (!upcoming || round === null || picked === null) return;

    // Banked here rather than at `submit`, so `results.length` is always the
    // number of questions *left behind* — which makes it the index of the one
    // on screen as well as the score. The set is over when this push fills it,
    // and the round underneath advances anyway: the summary covers a fresh
    // question 1, so "Play again" is a state change with nothing to deal.
    // The first of the two places the mode reaches: what a result records. A
    // set is scored right-or-wrong, so it records exactly that. A run records
    // the tier as well — the same margin the result card has just shown the
    // player — because a run is the one screen with enough answers on it for
    // the distribution of those tiers to say something, and its results screen
    // is built out of them.
    const correct = isComparisonCorrect(round, sectionSide(picked));
    setResults((current) => [
      ...current,
      survival
        ? survivalResult(correct, comparisonVerdict(round, picked))
        : comparisonResult(correct),
    ]);

    // Banked alongside the result, so the next refill can ask for events this
    // set has not already shown. Trimmed to the same limit the draw applies,
    // which only ever bites on a run with no end to it.
    setPlayed((current) =>
      [...current, ...roundEventIds(round)].slice(-EXCLUDED_EVENT_LIMIT),
    );

    setPicked(null);
    setFraction(0.5);
    setQueue((current) => current.slice(1));
  }

  /**
   * Start over. The round underneath has already advanced to a fresh question,
   * so there is nothing to deal — but a new set does start over on which
   * events count as repeats, or a long session would end up asking the draw to
   * avoid the whole pool.
   */
  function playAgain() {
    setResults([]);
    setPlayed([]);
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

  // The round's grade on the date-guessing game's own five-rung ladder: the
  // half decides whether it is a win and the margin in sections decides which
  // rung. lib/game/rounds.ts owns that rule; this screen only draws it.
  const verdict =
    answered && round !== null ? comparisonVerdict(round, picked) : null;
  // Whether this round was right, which in survival is also whether there is
  // another one. Read off the pick rather than off `verdict`, so the two can
  // never disagree — both are derived from the same section and the same half.
  const roundCorrect =
    answered && round !== null
      ? isComparisonCorrect(round, sectionSide(picked))
      : null;
  // The second place the mode reaches: what ends the game.
  //
  // A set is full at ten. A run ends at the first miss, so it is over exactly
  // when the *last banked* result is one — and since the run stops there, no
  // earlier result can be. Both read `results`, which is only written in
  // `advance`, which is what keeps the verdict for the losing round on screen
  // rather than replacing it with the summary the moment it is graded: the
  // player sees where the event actually sat, then presses on.
  const over = survival
    ? results.length > 0 && !results[results.length - 1]!.hit
    : results.length >= QUESTIONS_PER_SET;
  // The round whose button ends the game instead of dealing another: the tenth
  // question of a set, or the answer that has just lost a run.
  const finalRound = survival
    ? roundCorrect === false
    : results.length === QUESTIONS_PER_SET - 1;
  // Which half the bubble is in, for the live highlight on the anchor it leans
  // toward. Dead centre commits to neither.
  const leaning: ComparisonSide | null =
    choice ?? (fraction === 0.5 ? null : fraction < 0.5 ? "left" : "right");

  if (!round) return null;

  if (over) {
    // The backdrop is a server component on the page, so unlike the
    // date-guessing game there is nothing here either summary has to keep
    // mounted. The round underneath is already reset to a fresh question, so
    // "Play again" has nothing left to do but clear the results.
    //
    // The third and last place the mode reaches. Two screens rather than one
    // with a flag: a set's headline is a percentage of a fixed ten and a run's
    // is a count with no ceiling, so almost nothing one of them says is true
    // of the other (see lib/game/survival.ts).
    return survival ? (
      <SurvivalSummary results={results} onPlayAgain={playAgain} t={t} />
    ) : (
      <SetSummary
        results={results}
        title={t.comparisonTitle}
        otherHref="/guess"
        otherLabel={t.tryTimeline}
        onPlayAgain={playAgain}
        t={t}
      />
    );
  }

  return (
    <>
      <RoundHead played={results.length} survival={survival} t={t} />

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
            the top of it is empty. The round counter used to be pinned up
            there; it is part of the masthead now (`RoundHead`), which is a
            better place for it and costs this screen's height budget nothing
            either way. */}
          <div className="relative flex h-[var(--lane)] items-end">
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
                  answered
                    ? formatHistoricalDate(round.target, locale, labels)
                    : HIDDEN_DATE
                }
                captionClassName={answered ? "text-good" : "text-white/75"}
                raised
                t={t}
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
              {/* The section the guess was locked into, in the colour that
                  guess earned. It is the only thing left on the rail that says
                  where the player put the bubble — the bubble itself has slid
                  onto the truth by the time this appears — so the distance the
                  card names as a number is also the gap the eye measures
                  between this band and the card hanging over the answer.

                  It grows out of its own centre (`.answer-gap` with no origin
                  set, unlike the date-guessing rail's, where the bar has a
                  guess end to start from). */}
              {answered && verdict !== null && (
                <div
                  className="answer-gap pointer-events-none absolute -inset-y-px rounded-full"
                  style={{
                    left: `${(picked / COMPARISON_SECTIONS) * 100}%`,
                    width: `${100 / COMPARISON_SECTIONS}%`,
                    background: VERDICT_COLORS[verdict],
                  }}
                />
              )}

              {/* Five dividers, cutting the rail into six equal sections.

                  A section is therefore a sixth of the gap between the two
                  anchors, whatever that gap happens to be — 600 years apart
                  makes each one a century — so the round states its own scale
                  rather than the game imposing one, and "how close were you"
                  has an answer finer than which half.

                  The middle divider is the one that was always here: it is
                  still the boundary between the two answers, so it is drawn
                  taller and brighter than its four neighbours. */}
              {Array.from({ length: COMPARISON_SECTIONS - 1 }, (_, index) => {
                const at = (index + 1) / COMPARISON_SECTIONS;
                const boundary = index + 1 === COMPARISON_SECTIONS / 2;
                return (
                  <div
                    key={at}
                    className={`absolute top-1/2 w-px -translate-x-1/2 -translate-y-1/2 ${
                      boundary ? "h-6 bg-white/80" : "h-4 bg-white/50"
                    }`}
                    style={{ left: `${at * 100}%` }}
                  />
                );
              })}
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
                final={finalRound}
                onSubmit={submit}
                onNext={requestNextRound}
                t={t}
                floating
              />
            </div>

            <div className="w-[var(--bubble)]">
              <EventBubble
                event={round.left}
                t={t}
                tail="up"
                caption={
                  answered
                    ? formatHistoricalDate(round.left, locale, labels)
                    : HIDDEN_DATE
                }
                // Dim once it is a fact; the same white as the floating
                // bubble's "???" while it is still a question. The target's
                // revealed date is the only one that goes green — green is the
                // answer on this screen, and an anchor is not the answer.
                captionClassName={answered ? "text-ink-dim" : "text-white/75"}
                highlighted={leaning === "left"}
              />
            </div>
            <div className="w-[var(--bubble)]">
              <EventBubble
                event={round.right}
                t={t}
                tail="up"
                caption={
                  answered
                    ? formatHistoricalDate(round.right, locale, labels)
                    : HIDDEN_DATE
                }
                // Dim once it is a fact; the same white as the floating
                // bubble's "???" while it is still a question. The target's
                // revealed date is the only one that goes green — green is the
                // answer on this screen, and an anchor is not the answer.
                captionClassName={answered ? "text-ink-dim" : "text-white/75"}
                highlighted={leaning === "right"}
              />
            </div>
          </div>
        </div>

        <div className="on-photo flex w-full shrink-0 flex-col items-center gap-3">
          {/* The verdict's reserved box. It is held open all round rather than
            appearing with the verdict: on a screen budgeted to the pixel, a
            card arriving under the rail would move the rail it is a verdict
            on. Its `min-h-16` is exactly the result card's own height, which
            is what keeps the card free — `--compare-chrome` already counts
            these 64px, so nothing here comes out of the two photographs.

            It has carried two things and now carries neither. The round's
            instruction went on 2026-10-08 — a permanent line of help text
            under a game is a line the player reads once; the string stays in
            the dictionary, where it is still the rail's accessible name — and
            the round's own scale ("each section ~ n years") went with it,
            because a section's width in years is most of the way to the
            answer: with the anchors' dates hidden it was the one number left
            on screen, and it told you how far apart the two ends are. The box
            is now empty until the verdict fills it, and it still has to be
            reserved for exactly the same reason. */}
          <div className="flex min-h-16 w-full max-w-[24rem] flex-col items-center justify-center">
            {answered && verdict !== null && (
              <VerdictDeckRow
                verdict={verdict}
                facts={[
                  {
                    label: t.distanceTitle,
                    value: sectionDistanceLabel(
                      comparisonSectionDistance(round, picked),
                      t,
                    ),
                  },
                  {
                    label: t.actualDate,
                    value: formatHistoricalDate(round.target, locale, labels),
                  },
                ]}
                t={t}
              />
            )}
          </div>

          {/* The narrow-screen home for the action — see the md-only copy
            floating between the anchors above. */}
          <div className="md:hidden">
            <ActionButton
              answered={answered}
              pending={pendingNext}
              final={finalRound}
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

/**
 * The round's masthead: the game's name and where you are in the set, in one
 * pill, in the top bar's own row.
 *
 * It is rendered by the game rather than by the page because it has to go when
 * the set does — the summary replaces the round outright, and a masthead asking
 * "which of the two dates…" over a finished set is the page asking a question
 * that is no longer on screen. Only the game knows the set is over.
 *
 * **It is `fixed`, in the bar's row, and that is what makes it free.** It was
 * an 84px block of flow at the top of the column until 2026-10-08 — a title,
 * its blurb and a margin — and this screen's height is a hand-maintained sum
 * (`--compare-chrome` in app/globals.css), so those 84px were 84px the two
 * photographs did not get. In the bar's row it costs the budget nothing, and
 * the cards went to their 360px cap as a result. Its `top` is solved the way
 * the menu button's is, from the bar's height and its own, so the three things
 * on that row share a centre line rather than three independent numbers —
 * measured at 1680x844: wordmark, pill and menu button all centred at 37.0px.
 *
 * **It is in that row on a phone too, as of this pass.** It stood at the top
 * of the column below `sm` until then, on the grounds that three things do not
 * fit across a phone's bar — which was true at the sizes that row used to
 * carry. It was asked for between the wordmark and the menu button, so the two
 * bookends came down a notch instead (`--menu-btn` 34px, the wordmark
 * `text-base`, the bar itself 58px; all three in app/globals.css), and the
 * ~215px that leaves at 375px is enough for the pill at `text-[13px]`. The
 * flow row it gave up is the "shift everything up" half of the same request:
 * 46px of pill and its 16px margin left the column, and the lanes below centre
 * into what that freed.
 *
 * It is therefore `fixed` at every width, and the two bookends' own sizes are
 * what the horizontal padding is written against — `pl` clears the wordmark,
 * `pr` the button, and the pill fills what is between them rather than being
 * centred on a viewport whose middle is not the middle of that gap.
 *
 * **One type size for both halves**, and it is the `Tempus` wordmark's: the
 * pill reads as the one masthead the row already has, not as a heading with a
 * counter stuck to it. Both come down together below `sm`, so that still
 * holds.
 *
 * **The instruction unrolls on hover** rather than standing under the title.
 * It is a live instruction and it is read once, so it is available rather than
 * permanent. The mechanism is the home board's card descriptions' —
 * `grid-template-rows: 0fr -> 1fr` with the child owning the overflow, which
 * is the only way to animate a height out of nothing without measuring one in
 * JavaScript — and it comes with the same two properties: it never opens on a
 * touch screen, because Tailwind compiles `group-hover:` inside
 * `@media (hover: hover)`, and the text is always in the document, so a screen
 * reader gets the instruction whether or not anything was hovered.
 *
 * Two things hold the shape up.
 *
 * **The radius is half the closed height, written as exactly that.** A pill
 * that opens is the explorer's problem, not the button's: `rounded-full`
 * resolves against the box, so the corners would tighten and slacken through
 * the whole 420ms and the thing would read as a rubber sheet rather than as a
 * panel. One constant gives the stadium closed and holds it open.
 *
 * **Only the pill is a pointer target.** The wrapper and the unrolled row are
 * `pointer-events-none`, so the open panel — which hangs over the top of the
 * floating bubble — cannot swallow the drag that starts the round. Hover still
 * reaches the card, because an element is `:hover` whenever the hit target is
 * one of its descendants.
 */
function RoundHead({
  played,
  survival,
  t,
}: {
  /**
   * Questions banked. In a set that is the position in it; in a run it is the
   * score, since every banked answer in a live run is a correct one.
   */
  played: number;
  survival: boolean;
  t: Dict;
}) {
  return (
    <div
      // In the bar's own row at every width. Below `sm` it is held off the two
      // things already in that row rather than centred in it: 24px of page
      // padding plus the `text-base` wordmark's ~62px plus 8px of air on the
      // left, and 24px plus the 34px button plus 8px on the right — which
      // leaves the pill 215px at 375px and lands it in the gap instead of
      // across the wordmark. From `sm` the row is wide enough to centre in.
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center pl-[5.875rem] pr-[4.125rem] sm:px-6"
      style={
        {
          // `--compare-head` is the closed pill's height and lives in
          // app/globals.css, because it changes with the breakpoint and an
          // inline style is the one place a media query cannot reach. The
          // row's centre line and the corner radius are both read off it, so
          // neither can drift from the box.
          top: "calc((var(--site-bar-h) - var(--compare-head)) / 2)",
        } as React.CSSProperties
      }
    >
      <div className="group w-full max-w-[21rem] overflow-hidden rounded-[calc(var(--compare-head)/2)] border border-white/15 bg-black/45 shadow-xl shadow-black/60 backdrop-blur-xl sm:w-[21rem]">
        <div className="pointer-events-auto flex items-center justify-center px-3 py-1.5 sm:px-5 sm:py-2">
          {/* `min-w-0` is what lets the title give way rather than push the
              counter out of the pill: Turkish's "10 sorudan 1." is the longest
              pair and the gap on a 320px screen is narrower than it. */}
          <span className="min-w-0 truncate font-display text-[13px]/[1.25rem] font-semibold tracking-[-0.01em] text-ink sm:text-lg">
            {survival ? t.survivalTitle : t.comparisonTitle}
          </span>
          {/* The dot carries the row's type size too, or its own 16px line box
              sets the pill's height and `--compare-head` no longer describes
              the box the centre line is solved from. */}
          <span className="px-1.5 text-[13px]/[1.25rem] text-white/30 sm:px-2 sm:text-lg">
            ·
          </span>
          {/* A set counts towards its end and a run counts up from nothing, so
              the same slot holds "3 of 10" in one mode and "12 correct" in the
              other. A run's counter is the score it is playing for, which is
              why it is the number banked rather than the question number: the
              answer on screen has not been earned yet. */}
          <span className="shrink-0 font-display text-[13px]/[1.25rem] font-semibold tracking-[-0.01em] tabular-nums text-white/70 sm:text-lg">
            {survival
              ? format(t.survivalCleared, { n: played })
              : format(t.setProgress, {
                  n: Math.min(played + 1, QUESTIONS_PER_SET),
                  total: QUESTIONS_PER_SET,
                })}
          </span>
        </div>

        <div className="compare-head-blurb pointer-events-none grid grid-rows-[0fr] transition-[grid-template-rows] duration-[420ms] ease-out group-hover:grid-rows-[1fr]">
          <div className="overflow-hidden">
            <p className="px-5 pb-3 text-center text-xs leading-snug text-white/70 opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100">
              {survival ? t.survivalBlurb : t.comparisonBlurb}
            </p>
          </div>
        </div>
      </div>
    </div>
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
  t,
}: {
  event: LocalizedEvent;
  tail: "up" | "down";
  caption: string;
  captionClassName?: string;
  highlighted?: boolean;
  raised?: boolean;
  /** Only so the photograph's sensitive-content gate can be labelled. */
  t: Dict;
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
              <EventVisual event={shown.leaving.event} t={t} />
            </div>
          )}
          {/* Keyed on the event, so the dissolve restarts for each round rather
              than running once on mount. */}
          <div
            key={shown.active.event.id}
            className="round-photo-in absolute inset-0"
          >
            <EventVisual event={shown.active.event} t={t} />
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
  final,
  onSubmit,
  onNext,
  t,
  floating = false,
}: {
  answered: boolean;
  /** The press is latched and waiting on a draw. Never disables the button. */
  pending: boolean;
  /**
   * This round ends the game rather than dealing another — the tenth question
   * of a set, or the answer that has just lost a run. Stated as the thing the
   * button is about to do, so both modes can set it from their own rule.
   */
  final: boolean;
  onSubmit: () => void;
  onNext: () => void;
  t: Dict;
  floating?: boolean;
}) {
  // A tenth larger than the site's other round buttons, asked for on
  // 2026-10-08: this one is the only control on the screen and it sits in the
  // gap between the two anchors rather than on a row of its own, so it was
  // reading as small for what it does. All three numbers are scaled, not just
  // the padding — 28/12/14px becomes 30.8/13.2/15.4 — because a button that
  // grows only its box around the same type reads as padded, not as bigger.
  // The line height is spelled out with the size: `text-sm` carried a 20px
  // line box of its own and a bare `text-[…]` falls back to `normal`, which
  // would have taken the box up 12% rather than 10%.
  const base = `rounded-full bg-ink px-[1.925rem] py-[0.825rem] text-[0.9625rem]/[1.375rem] font-semibold text-page transition-opacity hover:opacity-85 disabled:opacity-50 ${
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
      className={`${base} relative ${pending ? "cursor-progress opacity-60" : ""}`}
    >
      {final ? t.seeResults : t.nextRound}
      {/* The home board's loading trace, run around the button rather than a
          card (`.round-trace` in app/globals.css). It draws in `currentColor`,
          which on this button is `text-page` — the dark ink of a solid white
          pill, where the board's near-white arc would not show at all.
          Mounted only while the press is latched, so the comet starts from the
          top each time instead of rejoining a lap that has been running
          invisibly. */}
      {pending && (
        <span aria-hidden="true" className="round-trace">
          <i />
          <i />
          <i />
        </span>
      )}
    </button>
  ) : (
    <button type="button" onClick={onSubmit} className={base}>
      {t.submitGuess}
    </button>
  );
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * How far the pick landed from the truth, in sections.
 *
 * Three strings rather than one with a count in it: "1 section" is not
 * "{n} sections" in most of the five languages, and the exact hit is not a
 * distance at all.
 */
function sectionDistanceLabel(distance: number, t: Dict): string {
  if (distance === 0) return t.sectionExact;
  if (distance === 1) return t.sectionOff;
  return format(t.sectionsOff, { n: distance });
}
