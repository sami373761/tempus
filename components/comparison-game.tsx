"use client";

import { useEffect, useRef, useState } from "react";

import { revealComparisonRound } from "@/app/actions/scoring";
import { EventVisual } from "@/components/event-visual";
import { VerdictDeckRow } from "@/components/round-flank";
import { RoundHead } from "@/components/round-head";
import { SoloRoundTimer, useSoloRoundClock } from "@/components/round-timer";
import { SetSummary } from "@/components/set-summary";
import { useSoloSet } from "@/components/solo-points";
import { SurvivalSummary } from "@/components/survival-summary";
import type { LocalizedEvent, SupportedLocale } from "@/lib/db/types";
import { dealRounds } from "@/lib/game/deal";
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
  sectionSide,
  type ComparisonRound,
  type ComparisonSide,
} from "@/lib/game/rounds";
import {
  comparisonResult,
  QUESTIONS_PER_SET,
  type SetResult,
} from "@/lib/game/set";
import type { Verdict } from "@/lib/game/scoring";
import {
  completeComparisonRound,
  type DealtComparisonRound,
} from "@/lib/game/solo";
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
// How long "move the card first" stays on the button when nobody moves it.
const NUDGE_MS = 1800;

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
  /** All three events masked; the dates arrive with the reply to a pick. */
  rounds: DealtComparisonRound[];
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
  // The round's clock ran out with the card dead centre: locked in with no
  // pick, and graded as a miss (see `revealComparisonRound`).
  const [timedOut, setTimedOut] = useState(false);
  // The round being played is the head of the queue; the one behind it is the
  // next round, held only so its pictures can be preloaded and swapped in.
  const [queue, setQueue] = useState<DealtComparisonRound[]>(rounds);
  // The round on screen with its three dates filled in, once the server has
  // graded the pick. Every part of the reveal reads this, never the dealt
  // round, which has no dates in it (lib/game/solo.ts).
  const [full, setFull] = useState<ComparisonRound | null>(null);
  const [roundTp, setRoundTp] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const solo = useSoloSet();
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
  // Set when "Lock in" is pressed with the card still dead centre. The centre
  // is section 3, which `sectionSide` reads as "right" — so locking in there
  // used to bank an answer the player never gave. Now the press asks them to
  // move the card instead; the button keeps working (it only relabels), it is
  // never disabled.
  const [nudged, setNudged] = useState(false);

  // The relabel is a prompt, not a state: it goes as soon as the card moves,
  // or on its own after a moment so the button reads normally again.
  useEffect(() => {
    if (!nudged) return;
    if (fraction !== 0.5) {
      setNudged(false);
      return;
    }
    const timer = window.setTimeout(() => setNudged(false), NUDGE_MS);
    return () => window.clearTimeout(timer);
  }, [nudged, fraction]);

  const rail = useRef<HTMLDivElement>(null);
  // The card being placed, which is the round's one focusable control — where
  // focus goes back to when "Play again" takes the summary (and the button
  // that was pressed) off the screen.
  const slider = useRef<HTMLDivElement>(null);
  const [refocus, setRefocus] = useState(false);
  // Distance between the pointer and the bubble's centre when the drag began.
  // Without it, grabbing a wide card by its edge would snap it under the cursor.
  const grab = useRef<{ pointerId: number; offset: number } | null>(null);

  const round = queue[0] ?? null;
  const upcoming = queue[1] ?? null;
  const queueHead = useRef<DealtComparisonRound | null>(round);
  queueHead.current = round;
  // The pick made (input stops) and the pick graded (the reveal starts) are a
  // round trip apart; see components/timeline-game.tsx.
  const lockedIn = picked !== null || timedOut;
  const answered = full !== null;
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
    const dealt = [...played, ...queue.flatMap(dealtEventIds)];

    // The deal is the mode's: a survival round is signed for survival, so it
    // cannot be banked as a comparison set or the other way round.
    dealRounds(
      survival ? "survival" : "compare",
      ROUND_QUEUE_DEPTH,
      dealt.slice(-EXCLUDED_EVENT_LIMIT),
    )
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
    if (lockedIn) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    grab.current = { pointerId: event.pointerId, offset };
    setDragging(true);
  }

  function onBubblePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    startDrag(event, fraction - fractionFromClientX(event.clientX));
  }

  // Tapping the rail itself jumps the bubble there — no offset to preserve.
  function onRailPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (lockedIn) return;
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
    if (lockedIn) return;

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

  /** The button's lock-in. */
  function submit() {
    void lockIn(false);
  }

  /**
   * Lock the card in where it stands. `timeUp` is the round's clock running
   * out, which takes whatever is on the board — except dead centre, which is
   * no answer at all, and is sent as one (a null section) rather than nudged.
   */
  async function lockIn(timeUp: boolean) {
    if (lockedIn || sending || !round) return;
    // Dead centre commits to neither side — the same reading `leaning` gives
    // the live highlight below.
    if (fraction === 0.5 && !timeUp) {
      setNudged(true);
      return;
    }

    const section = fraction === 0.5 ? null : comparisonSection(fraction);
    if (section === null) setTimedOut(true);
    else setPicked(section);
    setSending(true);
    setFailed(false);

    const asked = round;
    try {
      const result = await revealComparisonRound(asked.token, section, solo.setId);
      if (!result.ok || !result.comparison) throw new Error("reveal");
      if (queueHead.current?.token !== asked.token) return;

      const known = completeComparisonRound(asked, result.comparison);
      setFull(known);
      setRoundTp(result.tp);
      solo.record(result);
      // Settle onto the truth, so the reveal reads as "here is where it
      // actually sat" rather than a verdict printed next to a stale marker.
      // The section just picked is what keeps the guess on screen after the
      // bubble has left it — see the band drawn on the rail below.
      setFraction(comparisonFractionAtYear(known, known.target.year));
    } catch {
      // Handed back, never kept: an ungraded answer is not an answer.
      setPicked(null);
      setTimedOut(false);
      setFailed(true);
    } finally {
      setSending(false);
    }
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
    if (!upcoming || round === null || full === null || !lockedIn) return;

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
    const correct =
      picked !== null && isComparisonCorrect(full, sectionSide(picked));
    setResults((current) => [
      ...current,
      survival
        ? survivalResult(
            correct,
            picked === null ? "wayOff" : comparisonVerdict(full, picked),
          )
        : comparisonResult(correct),
    ]);

    // Banked alongside the result, so the next refill can ask for events this
    // set has not already shown. Trimmed to the same limit the draw applies,
    // which only ever bites on a run with no end to it.
    setPlayed((current) =>
      [...current, ...dealtEventIds(round)].slice(-EXCLUDED_EVENT_LIMIT),
    );

    setPicked(null);
    setTimedOut(false);
    setFull(null);
    setRoundTp(null);
    setFailed(false);
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
    solo.reset();
    setRefocus(true);
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
  const verdict: Verdict | null =
    full === null
      ? null
      : picked !== null
        ? comparisonVerdict(full, picked)
        : timedOut
          ? "wayOff"
          : null;
  // Whether this round was right, which in survival is also whether there is
  // another one. Read off the pick rather than off `verdict`, so the two can
  // never disagree — both are derived from the same section and the same half.
  const roundCorrect =
    full === null
      ? null
      : picked !== null
        ? isComparisonCorrect(full, sectionSide(picked))
        : timedOut
          ? false
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
  //
  // Once locked in it is the pick and nothing else. Locking in slides the
  // bubble onto the truth, so a round that timed out with no pick would
  // otherwise light whichever anchor the *answer* sits nearer — a choice the
  // player never made, highlighted as if they had.
  const leaning: ComparisonSide | null = lockedIn
    ? choice
    : fraction === 0.5
      ? null
      : fraction < 0.5
        ? "left"
        : "right";

  // Thirty seconds a round, on the picture of the event being placed. Not
  // while a summary is up: the round underneath it has already advanced, and
  // its clock starts when the summary goes.
  const clock = useSoloRoundClock({
    round: round?.token ?? null,
    picture: round?.target.image?.url ?? null,
    live: round !== null && !lockedIn && !over,
    onExpire: () => void lockIn(true),
  });

  // After "Play again", on the first render with the round back on screen:
  // the summary unmounted with focus inside it, which drops a keyboard player
  // on `<body>`. The summaries take focus on the way in for the same reason.
  useEffect(() => {
    if (!refocus || over) return;
    slider.current?.focus({ preventScroll: true });
    setRefocus(false);
  }, [refocus, over]);

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
      <SurvivalSummary
        results={results}
        onPlayAgain={playAgain}
        points={solo.points}
        t={t}
      />
    ) : (
      <SetSummary
        results={results}
        title={t.comparisonTitle}
        otherHref="/guess"
        otherLabel={t.tryTimeline}
        onPlayAgain={playAgain}
        points={solo.points}
        t={t}
      />
    );
  }

  return (
    <>
      {/* The masthead, in the top bar's own row. It is `components/round-head.tsx`
          since this pass rather than a private component here: the film,
          "Born When?", football and basketball screens were all asked for the
          same pill, and the one thing worse than four copies of it is four
          copies that have drifted. What stays here is the only part that is
          this game's — which of its two modes is being played, and whether the
          counter is counting towards ten or up from nothing. */}
      <RoundHead
        title={survival ? t.survivalTitle : t.comparisonTitle}
        // A set counts towards its end and a run counts up from nothing, so
        // the same slot holds "3 of 10" in one mode and "12 correct" in the
        // other. A run's counter is the score it is playing for, which is why
        // it is the number banked rather than the question number: the answer
        // on screen has not been earned yet.
        counter={
          survival
            ? format(t.survivalCleared, { n: results.length })
            : format(t.setProgress, {
                n: Math.min(results.length + 1, QUESTIONS_PER_SET),
                total: QUESTIONS_PER_SET,
              })
        }
        blurb={survival ? t.survivalBlurb : t.comparisonBlurb}
      />

      <div
        // `--bubble-cap` is the width term of the sum below, and it is a class
        // rather than part of the inline style because it changes at `md` and
        // an inline style is the one place a media query cannot reach. Below
        // that breakpoint the two anchors have the lane to themselves and may
        // grow until they nearly meet; from `md` the round's action button
        // floats in the gap between them (see the lower lane), so the gap has
        // to stay wider than that button and the cards go back to the share
        // of the lane they always had.
        //
        // `38vw` alone did not keep that promise below ~1200px: the gap it
        // leaves is `24vw - 48px`, 136px at 768, against a button of 164-220px
        // — so the button sat on both photographs at tablet widths. The second
        // term is the same subtraction the phone cap makes, sized for the
        // button: two cards of `50vw - 144px` in a lane of `100vw - 48px`
        // leave 240px between them at every width, which holds "Schätzung
        // bestätigen" with room either side. From 1200px `38vw` is the smaller
        // of the two again and nothing changes there.
        className="mx-auto flex w-full flex-1 flex-col items-center justify-center gap-5 [--bubble-cap:calc(50vw-30px)] md:[--bubble-cap:min(38vw,calc(50vw-144px))]"
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
            // this screen inside one viewport while still filling it. The
            // first term of the `min()` caps it on a narrow phone, where two
            // of these sit side by side below the rail, and 360px stops a
            // tall desktop window turning the cards into billboards.
            //
            // **`--bubble-cap` is `50vw - 30px` on a phone**: the widest the
            // two anchors can be without meeting, and a subtraction rather
            // than a `vw` fraction because the thing it has to clear is
            // measured in pixels. The
            // lower lane spans the page's own content box — `100vw` less the
            // 24px of page padding on each side — and holds the two anchors
            // at its ends with `justify-between`, so they touch at exactly
            // half of it: `(100vw - 48px) / 2`. Taking a further 12px off each
            // leaves that 24px gap between them, which is the whole of the
            // margin: at 390px the cards go from 148px to 165px and the
            // photographs grow with them. It was `38vw`, which left 69px of
            // dead air down the middle of a phone that had none to spare.
            //
            // **The 104px floor is the card a 320x568 phone can hold.** A
            // floor overrides the height term, so it has to sit at or under
            // what the shortest phone can pay for: there the frame is 510px,
            // and two 104px cards lay out at 507px — 117px of pictures on
            // 390px of chrome as the markup sets it, which is
            // `--compare-chrome` with its 22px of headroom spent.
            // It was 132px, which was 29px of scroll on the same phone. Only
            // phones shorter than ~600px ever reach it.
            "--bubble":
              "clamp(104px, min(var(--bubble-cap), calc((100dvh - var(--site-bar-h) - var(--compare-chrome)) / 2 * 16 / 9)), 360px)",
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
            grows the card *upward*, into the headroom `--compare-chrome` keeps
            for it above the column, instead of pushing the rail and everything
            under it down the screen — and on a screen budgeted to the pixel,
            that distinction is the difference between a still rail and a
            scrollbar. */}
          {/* The lane is taller than the card hanging from its bottom edge, so
            the top of it is empty. The round counter used to be pinned up
            there; it is part of the masthead now (`RoundHead`), which is a
            better place for it and costs this screen's height budget nothing
            either way. */}
          <div className="relative flex h-[var(--lane)] items-end">
            <div
              ref={slider}
              role="slider"
              tabIndex={lockedIn ? -1 : 0}
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
              }}
              // `shrink-0` matters: the margin below grows with the fraction, so
              // near the right end margin + width overflows the row and flex
              // would otherwise squeeze the bubble narrower as it travels.
              //
              // The glide is a class rather than an inline `transition` so
              // `motion-reduce` can reach it: with reduced motion the card
              // steps to the truth and back to the middle instead of sliding.
              // `ease-[ease-out]` is the browser's curve it always had; the
              // bare `ease-out` utility is Tailwind's steeper one.
              className={`no-drag-select w-[var(--bubble)] shrink-0 rounded-[28px] focus-visible:outline-2 focus-visible:outline-offset-[6px] focus-visible:outline-accent ${
                dragging
                  ? ""
                  : "transition-[margin-left] duration-[450ms] ease-[ease-out] motion-reduce:transition-none "
              }${
                nudged ? "compare-nudge " : ""
              }${
                lockedIn
                  ? "cursor-default"
                  : dragging
                    ? "cursor-grabbing"
                    : "cursor-grab"
              }`}
            >
              <EventBubble
                event={round.target}
                corner={
                  lockedIn ? null : <SoloRoundTimer clock={clock} t={t} />
                }
                tail="down"
                caption={
                  full
                    ? formatHistoricalDate(full.target, locale, labels)
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
              lockedIn ? "cursor-default" : "cursor-pointer"
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
              {picked !== null && verdict !== null && (
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
            rail, never into it.

            A grid rather than a flex row so the two cards share one row and
            stretch to whichever is taller: two names that wrap differently
            used to leave the pair ending at different heights. The action
            overlay is absolutely positioned and takes no cell. */}
          <div className="relative grid h-[var(--lane)] grid-cols-[var(--bubble)_var(--bubble)] content-start justify-between -mx-[calc(var(--bubble)/2)]">
            {/* The round's action sits in the gap the anchors leave — the player
              is already looking here, and it holds one spot across both states
              so the layout does not jump on answering.

              Only from `md` up: below that the gap is narrower than the button,
              which would park it on top of both anchors.

              Inset by a card's width on each side, so the button's widest is
              the gap itself (240px at tablet widths, see `--bubble-cap`). The
              labels that fit already are untouched; a longer one — the French
              "Drag the card first", 280px on one line — wraps to two lines
              instead of running onto both photographs. */}
            <div className="pointer-events-none absolute inset-0 z-10 hidden items-center justify-center px-[var(--bubble)] md:flex">
              <ActionButton
                answered={answered}
                sending={sending}
                pending={pendingNext}
                final={finalRound}
                nudged={nudged}
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
                  full
                    ? formatHistoricalDate(full.left, locale, labels)
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
                  full
                    ? formatHistoricalDate(full.right, locale, labels)
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
            {full !== null && timedOut && verdict !== null ? (
              <VerdictDeckRow
                verdict={verdict}
                label={t.versusTimedOut}
                tp={roundTp}
                facts={[
                  {
                    label: t.actualDate,
                    value: formatHistoricalDate(full.target, locale, labels),
                  },
                ]}
                t={t}
              />
            ) : full !== null && picked !== null && verdict !== null ? (
              <VerdictDeckRow
                verdict={verdict}
                tp={roundTp}
                facts={[
                  {
                    label: t.distanceTitle,
                    value: sectionDistanceLabel(
                      comparisonSectionDistance(full, picked),
                      t,
                    ),
                  },
                  {
                    label: t.actualDate,
                    value: formatHistoricalDate(full.target, locale, labels),
                  },
                ]}
                t={t}
              />
            ) : failed ? (
              <p role="status" className="text-center text-xs font-semibold text-white/85">
                {t.revealFailed}
              </p>
            ) : null}
          </div>

          {/* The narrow-screen home for the action — see the md-only copy
            floating between the anchors above. */}
          <div className="md:hidden">
            <ActionButton
              answered={answered}
              sending={sending}
              pending={pendingNext}
              final={finalRound}
              nudged={nudged}
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
  event: BubbleEvent;
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
  corner = null,
  t,
}: {
  event: BubbleEvent;
  /**
   * Over the photograph's top-right corner: the round's clock, on the card
   * being placed. An overlay rather than a row, because this screen's height
   * is a hand-maintained sum (`--compare-chrome`) with nothing spare.
   */
  corner?: React.ReactNode;
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
  // The outgoing caption is done long before the outgoing photograph: it has
  // faded by 200ms, the picture is held until `ROUND_PHOTO_FADE_MS`. Both
  // captions share one grid cell, so a leaving caption kept mounted until the
  // picture goes holds the card at the *old* text's height until 520ms — after
  // the new title has already faded in at 260ms, which reads as the card
  // snapping under a caption that is already there. Dropping the old caption
  // the moment its fade ends moves that resize into the 200-260ms window,
  // while neither caption is visible.
  const [textGone, setTextGone] = useState(false);

  if (shown.active.event.id !== event.id) {
    setShown({ active: live, leaving: shown.active });
    setTextGone(false);
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

  // The anchors stand below the rail as a pair, and their text starts at the
  // top of the caption block so the two date rows share a line however the
  // names wrap. The card being placed has no partner and stays centred.
  const top = tail === "up";

  // `h-full` reaches the lower lane's row, which is as tall as the taller
  // anchor; the caption block's `flex-1` takes up the difference, so the pair
  // ends level. The card being placed hangs in a row of auto height, where
  // `h-full` resolves to nothing and changes nothing.
  return (
    <div className="relative h-full">
      <div
        className={`flex h-full flex-col overflow-hidden rounded-[28px] border bg-black/35 shadow-2xl shadow-black/70 backdrop-blur-2xl transition-colors duration-300 ${
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
          {corner && (
            // A size down below `sm`, where the card is as narrow as 104px.
            <div className="absolute right-2 top-2 z-10 origin-top-right scale-75 sm:scale-100">
              {corner}
            </div>
          )}
        </div>

        {/* `var(--card-text)` less the 2px of border the lane's height also
            accounts for, so a two-line card is exactly one lane tall. 10px a
            side below `sm` rather than 16: on a phone card that is a fifth of
            the measure back for the name. */}
        <div className="grid min-h-[calc(var(--card-text)-2px)] flex-1 px-2.5 py-3 text-center sm:px-4">
          {shown.leaving && !textGone && (
            <BubbleText
              key={`${shown.leaving.event.id}-leaving`}
              content={shown.leaving}
              top={top}
              leaving
              onLeft={() => setTextGone(true)}
            />
          )}
          <BubbleText
            key={shown.active.event.id}
            content={shown.active}
            top={top}
          />
        </div>
      </div>
      <Tail direction={tail} highlighted={highlighted} />
    </div>
  );
}

function BubbleText({
  content,
  top = false,
  leaving = false,
  onLeft,
}: {
  content: BubbleContent;
  /** Text from the top of the block rather than its middle (the anchors). */
  top?: boolean;
  leaving?: boolean;
  /** The leaving fade has finished; see `textGone` in `EventBubble`. */
  onLeft?: () => void;
}) {
  return (
    <div
      className={`col-start-1 row-start-1 flex flex-col ${
        top ? "justify-start" : "justify-center"
      } ${leaving ? "round-title-out" : "round-title-in"}`}
      onAnimationEnd={
        onLeft
          ? (event) => {
              if (event.target === event.currentTarget) onLeft();
            }
          : undefined
      }
    >
      {/* The date stays small — it is a label on the card, and on the two
          anchors it is the one thing the player has already been told. Half
          the tracking below `sm`, where a date like "1350 AP. J.-C." is most
          of a phone card's measure and 0.16em was what tipped it onto a
          second line; `text-balance` evens the two lines when one still has
          to wrap, rather than stranding "J.-C." on its own. */}
      <p
        className={`text-balance text-[11px] font-medium uppercase leading-4 tracking-[0.08em] sm:tracking-[0.16em] ${content.captionClassName}`}
      >
        {content.caption}
      </p>
      {/* The name is what the round is actually about, so it grows with the
          card. 13px below `sm`, where the bubble can be down to 104px and a
          larger face would only wrap further, and capped at three lines there
          — a fourth would leave the room the budget gave it. It hyphenates,
          and breaks inside a word only when one is too long for the card at
          all, so a long compound cannot push past the card's edge. */}
      <p className="mt-1 line-clamp-3 text-[13px] font-semibold leading-tight text-ink hyphens-auto wrap-anywhere sm:line-clamp-none sm:text-base">
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
  sending,
  pending,
  final,
  nudged,
  onSubmit,
  onNext,
  t,
  floating = false,
}: {
  answered: boolean;
  /** The pick is locked in and being graded. Never disables the button. */
  sending: boolean;
  /** The press is latched and waiting on a draw. Never disables the button. */
  pending: boolean;
  /**
   * This round ends the game rather than dealing another — the tenth question
   * of a set, or the answer that has just lost a run. Stated as the thing the
   * button is about to do, so both modes can set it from their own rule.
   */
  final: boolean;
  /** "Lock in" was pressed with the card unmoved; the label asks for a move. */
  nudged: boolean;
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
  const base = `rounded-full bg-ink px-[1.925rem] py-[0.825rem] text-[0.9625rem]/[1.375rem] font-semibold text-page transition-opacity hover:opacity-85 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
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
    // `aria-live` so the relabel is announced: for a keyboard or screen-reader
    // player the label is the whole prompt. While the pick is being graded it
    // runs the same trace as a latched "Next round" — the reply takes about a
    // second, and a press that changes nothing for that long reads as missed.
    <button
      type="button"
      onClick={onSubmit}
      aria-live="polite"
      aria-busy={sending}
      className={`${base} relative ${sending ? "cursor-progress opacity-70" : ""}`}
    >
      {nudged ? t.comparisonMoveFirst : t.submitGuess}
      {sending && (
        <span aria-hidden="true" className="round-trace">
          <i />
          <i />
          <i />
        </span>
      )}
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

/**
 * The parts of an event a bubble draws. Narrower than `LocalizedEvent` so a
 * dealt event — which has no date — can be drawn before the reveal.
 */
type BubbleEvent = Pick<LocalizedEvent, "id" | "name" | "image" | "isSensitive">;

/**
 * A dealt round's three events, target last — what the draw is told to avoid.
 * The dealt twin of `roundEventIds` in lib/game/rounds.ts, which needs a
 * round with its dates in it.
 */
function dealtEventIds(round: DealtComparisonRound): string[] {
  return [round.left.id, round.right.id, round.target.id];
}
