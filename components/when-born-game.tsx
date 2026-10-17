"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { revealDateRound } from "@/app/actions/scoring";
import {
  DateEntry,
  InputModeToggle,
  useKeyboardEntry,
} from "@/components/date-entry";
import { NoteDeck, RoundVerdict, VerdictDeck } from "@/components/round-flank";
import { RoundHead } from "@/components/round-head";
import { SoloRoundTimer, useSoloRoundClock } from "@/components/round-timer";
import { SetProgress, SetSummary } from "@/components/set-summary";
import { useSoloSet } from "@/components/solo-points";
import { TimelineBackdrop } from "@/components/timeline-backdrop";
import {
  openingFractions,
  panDuration,
  PAN_MS,
  PosterCard,
  railGap,
  REVEAL_HOLD_MS,
  ROUND_BUTTON_LG,
  TimelinePaneView,
} from "@/components/timeline-stage";
import type { SupportedLocale } from "@/lib/db/types";
import { dealRounds } from "@/lib/game/deal";
import {
  directYear,
  EMPTY_DATE_ENTRY,
  type DateEntryValue,
} from "@/lib/game/date-entry";
import {
  EXCLUDED_EVENT_LIMIT,
  ROUND_QUEUE_DEPTH,
  ROUND_QUEUE_TARGET,
} from "@/lib/game/rounds";
import { gradeGuess, WHEN_BORN_BANDS } from "@/lib/game/scoring";
import type { DealtEvent, RevealedDate } from "@/lib/game/solo";
import {
  QUESTIONS_PER_SET,
  timelineResult,
  type SetResult,
} from "@/lib/game/set";
import {
  entryFraction,
  fractionAtYear,
  paneBounds,
  paneForYear,
  WHEN_BORN_DEFAULT_PANE,
  WHEN_BORN_PANES,
  yearAtFraction,
  type TimelinePane,
} from "@/lib/game/timeline";
import { VERDICT_COLORS } from "@/lib/game/verdict-style";
import {
  PERSON_FIELD_LABEL_KEYS,
  type WhenBornEvent,
} from "@/lib/game/when-born";
import type { Dict } from "@/lib/i18n/dictionary";

/** How long to wait before trying again when topping the queue up fails. */
const REFILL_RETRY_MS = 1500;

/**
 * How long the answer waits before it lands on the rail, when it lands on the
 * rail the guess was made on.
 *
 * The film game's number, and for the film game's reason: nothing travels, so
 * this is only the beat between the press and the answer — long enough that
 * the two read as cause and effect rather than as one frame.
 *
 * When the answer is on *another* rail the wait is `REVEAL_HOLD_MS` plus the
 * journey instead, which is the general game's rule — see `answerDelayMs`.
 */
const REVEAL_DELAY_MS = 240;

/**
 * The "Born When?" game: a portrait down the left, three rails down the right.
 *
 * **It is `ScreenGame`'s layout and `TimelineGame`'s camera**, which is the one
 * thing worth understanding about this file. Neither of those alone would do:
 *
 *   * The *layout* had to be the film game's. These photographs are portraits,
 *     and a portrait in the one-column games' card is either cropped to a
 *     letterbox — which throws away the face, i.e. the entire question — or
 *     left tall, which leaves no room for a rail beneath it. So the picture
 *     goes beside the rail, in the same 2:3 frame, with the same result row
 *     reserved under the same button. Every measurement here is the film
 *     game's, deliberately: the two screens are the same screen with a
 *     different subject, and they stack at the same 1120px.
 *
 *   * The *camera* had to be the general game's. Film and football each fit on
 *     one rail; these 150 people span 1341 BCE to 1997 and cluster hard in the
 *     last two centuries, so the game has three rails and doors between them
 *     (`WHEN_BORN_PANES` has the measurements). That brings back everything a
 *     one-pane game does without: a position per rail, a pane on camera, a
 *     pane the guess was made on, and a pan whose length depends on how far
 *     the answer is.
 *
 * **What is *not* borrowed from `TimelineGame` is the rail fold.** That game
 * collapses the rail to make room for the date entry, because its one column
 * has no spare height. This layout has the entry in a row of its own, so the
 * rail stays — and the marker tracks what is being typed, which on three rails
 * is better than it sounds: typing "356" with the BCE chip lit walks the camera
 * to the antiquity rail and stands the marker on Alexander's year. The rail is
 * `locked` rather than hidden while typing, so the two ways of answering cannot
 * disagree about which one the guess came from.
 *
 * Dropping the fold also simplifies the reveal. `TimelineGame` has to spend its
 * camera move *behind* the fold and hold the whole reveal back by
 * `RAIL_FOLD_MS`; here there is nothing to wait for, so a typed date pans in
 * the open like a dragged one.
 *
 * **It is still exactly one viewport**, like `/guess`, `/compare` and
 * `/screen`: `100dvh` less the bar, everything that cannot shrink saying so,
 * and the result's row reserved before there is a result to put in it — so
 * nothing moves when a round is answered.
 *
 * **Rounds are a queue, not a route**, exactly as in every other game: the page
 * deals the first two and this tops the queue back up from the server while the
 * current portrait is still being guessed.
 */
export function WhenBornGame({
  events,
  t,
  locale,
}: {
  /** Masked and signed: the year arrives with the reply to a guess. */
  events: DealtEvent<WhenBornEvent>[];
  t: Dict;
  locale: SupportedLocale;
}) {
  // Three rails, so the general game's state rather than the film game's: a
  // pane on camera, and one marker position per pane so that panning away and
  // back does not lose it. The rails the player has not opened start on the
  // edge they will walk in through.
  const [pane, setPane] = useState<TimelinePane>(WHEN_BORN_DEFAULT_PANE);
  const [fractions, setFractions] = useState<Record<TimelinePane, number>>(() =>
    openingFractions(WHEN_BORN_PANES, WHEN_BORN_DEFAULT_PANE),
  );
  const [guess, setGuess] = useState<number | null>(null);
  // The rail the guess was made on, which is not necessarily the one on camera
  // once the answer has been revealed — so the marker stays with the guess.
  const [guessPane, setGuessPane] = useState<TimelinePane | null>(null);
  // Whether the guess on screen was typed rather than dragged for. The marker's
  // caption has to quote the year the player typed rather than the one the rail
  // reads back at that position, which is snapped to the pane's grid.
  const [guessTyped, setGuessTyped] = useState(false);
  const [panMs, setPanMs] = useState(PAN_MS);
  // The round being played is the head of the queue; the one behind it is held
  // only so its photograph can be pulled and swapped in instantly.
  const [queue, setQueue] = useState<DealtEvent<WhenBornEvent>[]>(events);
  // The answer and its TP, once the server has graded the guess — see
  // components/timeline-game.tsx, which this follows.
  const [reveal, setReveal] = useState<{
    date: RevealedDate;
    tp: number;
  } | null>(null);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const solo = useSoloSet();
  const [refillAttempt, setRefillAttempt] = useState(0);
  // Latched when the player presses "Next round" before the queue has a round
  // to give them. The button is never dead, only late.
  const [pendingNext, setPendingNext] = useState(false);
  // The set so far: one entry per question already answered *and* advanced
  // past, so its length is both the score and the position in the set.
  const [results, setResults] = useState<SetResult[]>([]);
  // Which events this set has already used, so the draw can be told what not to
  // deal again — see the refill effect.
  const [played, setPlayed] = useState<string[]>([]);
  // Typing the year rather than dragging for it. A preference, not a round's
  // state: a player who wanted to type one year almost certainly wants to type
  // the next.
  // Typing the year rather than dragging for it — a *wish*, granted only on a
  // window wide enough to hold the control. See `useKeyboardEntry`: a phone's
  // keypad covers this screen whole, and the switch was costing the controls
  // row a cell it could not spare at 360px.
  const [directWanted, setDirectWanted] = useState(false);
  const keyboardEntry = useKeyboardEntry();
  const direct = directWanted && keyboardEntry;
  const [entry, setEntry] = useState<DateEntryValue>(EMPTY_DATE_ENTRY);
  // Set by a refused lock-in and cleared by the next edit, so the warning
  // answers the press rather than nagging at a half-typed year.
  const [invalid, setInvalid] = useState(false);
  const travelTimer = useRef<number | null>(null);
  const resetTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (travelTimer.current !== null) window.clearTimeout(travelTimer.current);
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  const event = queue[0] ?? null;
  const upcoming = queue[1] ?? null;

  // Top the queue back up in the background, and tell the draw what this set
  // has already used. Keyed on the queue's length rather than on its contents,
  // so playing a round triggers exactly one refill; `refillAttempt` is what
  // lets a failed one be tried again, since a failure leaves the length — and
  // therefore the dependencies — unchanged.
  //
  // The exclusion list matters more here than on the film game: 138 of the 150
  // people have a photograph, and an event with no primary image is hidden, so
  // the pool this draws from is smaller than the file suggests. See `exclude`
  // in lib/db/queries.ts — it is a preference on the server's side, not a
  // filter, so a pool with nothing unseen left still returns a full draw.
  useEffect(() => {
    if (queue.length >= ROUND_QUEUE_TARGET) return;

    let cancelled = false;
    let retry: number | null = null;

    // Everything this set has in play: answered and left behind, plus the
    // rounds still queued ahead of the one on screen. Most recent last, since
    // that is the end `EXCLUDED_EVENT_LIMIT` keeps.
    const dealt = [...played, ...queue.map((held) => held.id)];

    dealRounds("when-born", ROUND_QUEUE_DEPTH, dealt.slice(-EXCLUDED_EVENT_LIMIT))
      .then((fresh) => {
        if (cancelled) return;
        setQueue((current) => {
          // Belt and braces for the one case the server cannot honour, and
          // **never the whole batch**: this effect is keyed on the queue's
          // length, so a draw that added nothing would never be retried and
          // the queue would stop growing.
          const added = fresh.filter(
            (candidate) => !current.some((held) => held.id === candidate.id),
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
    // `queue` and `played` are read for the exclusion list but deliberately not
    // depended on: a draw already in flight has no reason to be restarted
    // because the player answered a question, and the length is what says a
    // refill is owed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.length, refillAttempt]);

  // Pull the next round's photograph while this one is still being guessed, so
  // the dissolve has something to dissolve *to*.
  useEffect(() => {
    const url = upcoming?.image?.url;
    if (!url) return;

    const preload = new window.Image();
    preload.src = url;
  }, [upcoming?.image?.url]);

  const fraction = fractions[pane];
  const railYear = yearAtFraction(pane, fraction);
  // The guess made (input stops) and the guess graded (the reveal starts)
  // are a round trip apart; see components/timeline-game.tsx.
  const lockedIn = guess !== null;
  const answered = reveal !== null;

  // Focus follows the button swap, so a keyboard player is not dropped to
  // <body> when the pressed button turns `inert` — see the solo game's copy
  // in components/timeline-game.tsx for the rule.
  const lockButton = useRef<HTMLButtonElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const wasAnswered = useRef(answered);
  useEffect(() => {
    if (wasAnswered.current === answered) return;
    wasAnswered.current = answered;
    const from = answered ? lockButton.current : nextButton.current;
    const to = answered ? nextButton.current : lockButton.current;
    const active = document.activeElement;
    if (!active || active === document.body || active === from) {
      to?.focus({ preventScroll: true });
    }
  }, [answered]);
  const queueHead = useRef<DealtEvent<WhenBornEvent> | null>(null);
  queueHead.current = queue[0] ?? null;

  // The camera leaves for the answer's rail when the answer does: after a beat
  // on the player's own marker, or they would watch it slide away as they read
  // the result.
  useEffect(() => {
    if (!reveal || guessPane === null) return;
    const target = paneForYear(reveal.date.year, WHEN_BORN_PANES);
    if (target === guessPane) return;

    const from = guessPane;
    travelTimer.current = window.setTimeout(() => {
      setPanMs(panDuration(from, target, WHEN_BORN_PANES));
      setPane(target);
    }, REVEAL_HOLD_MS);

    return () => {
      if (travelTimer.current !== null) {
        window.clearTimeout(travelTimer.current);
        travelTimer.current = null;
      }
    };
  }, [reveal, guessPane]);

  // What a typed date may name: the two ends of the rails this game shows,
  // which here really is three rails and not one — 1500 BCE to the present. A
  // year outside it is refused rather than clamped onto an edge it does not
  // stand for.
  const entryRange = {
    min: paneBounds(WHEN_BORN_PANES[0]!).min,
    max: paneBounds(WHEN_BORN_PANES[WHEN_BORN_PANES.length - 1]!).max,
  };

  // Graded on time depth, not on plain years — the one subject pool that goes
  // back to the general rule, because its people are between 29 and 3,367 years
  // old and knowing a birth year is not equally hard across that span. See
  // `WHEN_BORN_BANDS`.
  const accuracy =
    guess !== null && reveal
      ? gradeGuess(guess, reveal.date.year, WHEN_BORN_BANDS)
      : null;
  const setComplete = results.length >= QUESTIONS_PER_SET;
  const lastQuestion = results.length === QUESTIONS_PER_SET - 1;

  // "Play again" unmounts with its own press, so the new set's first control
  // takes the focus it was holding.
  const refocusLock = useRef(false);
  useEffect(() => {
    if (setComplete || !refocusLock.current) return;
    refocusLock.current = false;
    const active = document.activeElement;
    if (!active || active === document.body) {
      lockButton.current?.focus({ preventScroll: true });
    }
  }, [setComplete]);

  const move = useCallback((nextPane: TimelinePane, next: number) => {
    setFractions((current) => ({ ...current, [nextPane]: next }));
  }, []);

  /** Walk through a door. The marker lands on the far edge in the direction of travel. */
  function enter(nextPane: TimelinePane) {
    move(nextPane, entryFraction(nextPane, pane, WHEN_BORN_PANES));
    setPanMs(PAN_MS);
    setPane(nextPane);
  }

  /**
   * An edit to the typed year, which on this layout moves the rail.
   *
   * The rail is the live readout of the field here — it is never folded away —
   * so a year that names another age walks the camera to the rail that can mark
   * it. Done in the handler rather than derived during render because the camera
   * is state: the pan's own duration has to be set alongside the pane it
   * describes, and a pane computed during render would have no duration to
   * travel for.
   *
   * It overwrites whatever the player had dragged that rail to, which is the
   * right trade: they are typing a year, and that year is the guess. A field
   * cleared back to empty leaves the marker where the last valid year put it
   * rather than jumping to an edge — there is no year to show, so showing none
   * would be the change.
   */
  function editEntry(next: DateEntryValue) {
    setEntry(next);
    setInvalid(false);

    const typed = directYear(next, entryRange);
    if (typed === null) return;

    const target = paneForYear(typed, WHEN_BORN_PANES);
    if (target !== pane) {
      setPanMs(panDuration(pane, target, WHEN_BORN_PANES));
      setPane(target);
    }
    move(target, fractionAtYear(target, typed));
  }

  /** The button's lock-in. */
  function submit() {
    void lockIn(false);
  }

  /**
   * Lock the guess in. The answer then lands on whichever rail it belongs to.
   *
   * `timeUp` is the round's clock running out: whatever is on the board is
   * locked in — the typed year if there is a valid one, otherwise the marker.
   */
  async function lockIn(timeUp: boolean) {
    if (lockedIn || sending || !event) return;

    // Where the guess came from. Both ways of answering have already put the
    // camera and the marker where they belong — dragging by dragging, typing
    // through `editEntry` — so unlike `TimelineGame` there is nothing to place
    // here and no fold to hide it behind.
    let from = pane;
    let guessed = railYear;

    const typed = direct ? directYear(entry, entryRange) : null;
    if (direct && typed === null && !timeUp) {
      setInvalid(true);
      return;
    }
    // Any lock-in that goes through answers the refusal, the clock's included.
    setInvalid(false);
    if (typed !== null) {
      guessed = typed;
      from = paneForYear(typed, WHEN_BORN_PANES);
    }

    setGuess(guessed);
    setGuessPane(from);
    setGuessTyped(direct);
    setSending(true);
    setFailed(false);

    // The camera's trip to the answer's rail waits for the answer (the effect
    // above), since until the reply the client does not know which rail.
    const round = event;
    try {
      const result = await revealDateRound(round.token, guessed, solo.setId);
      if (!result.ok) throw new Error(result.reason);
      if (queueHead.current?.token !== round.token) return;
      setReveal({ date: result.date, tp: result.tp });
      solo.record(result);
    } catch {
      // Handed back, never kept: an ungraded answer is not an answer.
      setGuess(null);
      setGuessPane(null);
      setGuessTyped(false);
      setFailed(true);
    } finally {
      setSending(false);
    }
  }

  /**
   * Advance for real. Callers are responsible for there being a round to take.
   *
   * The camera flies back to the modern rail rather than cutting to it, which is
   * what carries the backdrop through its own crossfade and makes the change of
   * round read as one movement with the picture's dissolve.
   *
   * The rails are reset in two parts, and the split is the whole reason this
   * looks clean: the rail being landed on is reset immediately — it is
   * off-camera at that moment, or it is already the one on screen and the
   * marker simply glides back to centre — while every other rail keeps the
   * marker the player left on it until the journey is over. Resetting them now
   * would be a visible jump on a rail the camera is about to fly past.
   */
  function advance() {
    if (!upcoming || !accuracy || !event) return;

    // Banked here rather than at `submit`, so `results.length` is always the
    // number of questions *left behind* — which makes it the index of the one
    // on screen as well as the score.
    setResults((current) => [...current, timelineResult(accuracy.verdict)]);
    // Banked alongside the verdict, so the next refill can ask for something
    // this set has not already shown.
    setPlayed((current) => [...current, event.id].slice(-EXCLUDED_EVENT_LIMIT));

    const from = pane;
    const travel =
      from === WHEN_BORN_DEFAULT_PANE
        ? 0
        : panDuration(from, WHEN_BORN_DEFAULT_PANE, WHEN_BORN_PANES);

    if (travelTimer.current !== null) window.clearTimeout(travelTimer.current);
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);

    setGuess(null);
    setGuessPane(null);
    setGuessTyped(false);
    setReveal(null);
    setFailed(false);
    // **Both halves are cleared, era included.** The era used to be carried
    // over on the grounds that it was an opinion about the round rather than
    // an answer to it. It is not: a player who typed a BCE year last round
    // types "1492" into a pill that still says BCE and locks in 1492 BCE,
    // which is the one way this control can take a guess the player did not
    // make. A fresh round asks a fresh question, so it starts at the entry's
    // own zero (`EMPTY_DATE_ENTRY`) — CE, empty — and a BCE answer costs the
    // one press it costs on the first round of a set.
    setEntry(EMPTY_DATE_ENTRY);
    setInvalid(false);
    setQueue((current) => current.slice(1));
    setFractions((current) => ({ ...current, [WHEN_BORN_DEFAULT_PANE]: 0.5 }));

    if (travel > 0) {
      setPanMs(travel);
      setPane(WHEN_BORN_DEFAULT_PANE);
    }

    resetTimer.current = window.setTimeout(
      () =>
        setFractions(
          openingFractions(WHEN_BORN_PANES, WHEN_BORN_DEFAULT_PANE),
        ),
      travel,
    );
  }

  /**
   * What the button calls. If the queue has not caught up the press is
   * remembered rather than dropped, and the effect below plays it the moment a
   * round arrives — so the button is never dead, only late.
   */
  function requestNextRound() {
    if (!accuracy) return;
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
    if (!pendingNext || !upcoming || !accuracy) return;
    setPendingNext(false);
    advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNext, upcoming, accuracy]);

  // Thirty seconds a round. Not while the summary is up: the round under it
  // has already advanced, and its clock starts when the summary goes.
  const clock = useSoloRoundClock({
    round: event?.token ?? null,
    picture: event?.image?.url ?? null,
    live: event !== null && !lockedIn && !setComplete,
    onExpire: () => void lockIn(true),
  });

  if (!event) return null;

  const answerPane = reveal ? paneForYear(reveal.date.year, WHEN_BORN_PANES) : null;
  // When the answer appears: a short beat if it is on the rail the guess was
  // made on, and the general game's hold plus the journey when the camera has
  // to fetch it from another age.
  const answerDelayMs =
    guessPane === null || answerPane === null || guessPane === answerPane
      ? REVEAL_DELAY_MS
      : REVEAL_HOLD_MS + panDuration(guessPane, answerPane, WHEN_BORN_PANES);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      {/* Full-bleed and fixed, so it must stay out of any transformed
          ancestor; see the note in the component itself. Three panes, so this
          really does crossfade here — the hinge at 1 BCE is the one seam where
          the photograph changes. */}
      <TimelineBackdrop pane={pane} panes={WHEN_BORN_PANES} />

      {/* The masthead, in the top bar's own row: the game's name, and the
          one line that says which date is being asked for when it is pressed.
          It is a pill rather than a row of this column for the reason every
          addition to these screens is one — the page is exactly one viewport
          and the picture is the only part of it that gives. The column above
          the poster still prints both from 1120px, where there is a column to
          print them in; below that this is where they live. See
          `components/round-head.tsx`.

          No counter in it: a portrait leaves a corner free and the count is
          in the picture's own top-right (`PosterCard`).

          It goes with the round, not with the page: a masthead asking which
          year to guess would be a question with nothing on screen to answer
          it once the set is over. */}
      {!setComplete && <RoundHead title={t.whenBornTitle} blurb={t.whenBornYearAsked} />}

      {setComplete ? (
        // The round underneath is already reset to a fresh question, so the
        // summary floats over the game rather than replacing the screen.
        <SetSummary
          results={results}
          title={t.whenBornTitle}
          otherHref="/guess"
          otherLabel={t.timelineTitle}
          // A new set starts over on which events count as repeats too, or a
          // long session would end up asking the draw to avoid the whole pool.
          points={solo.points}
          onPlayAgain={() => {
            refocusLock.current = true;
            solo.reset();
            setResults([]);
            setPlayed([]);
          }}
          t={t}
        />
      ) : (
        /* The split, measurement for measurement the film game's — see the
           long note there for why each number is what it is. The two screens
           are the same screen with a different subject, so they are kept in
           one spelling rather than tuned apart: a portrait and a poster are
           both 2:3, both want the rail beside them rather than beneath, and
           both stack into one column at 1120px. */
        <div
          style={
            {
              "--poster-w": "clamp(15rem, 27vw, 26rem)",
              "--poster-h": "calc(var(--poster-w) * 1.5)",
              "--result-h": "clamp(14rem, calc(var(--poster-h) * 0.44), 17rem)",
            } as React.CSSProperties
          }
          className="flex min-h-0 flex-1 flex-col gap-4 min-[1120px]:grid min-[1120px]:h-[var(--poster-h)] min-[1120px]:max-h-full min-[1120px]:flex-none min-[1120px]:grid-cols-[var(--poster-w)_minmax(0,1fr)] min-[1120px]:gap-7"
        >
          <PosterCard
            event={event}
            // What the person is known for, which is most of what narrows a
            // portrait to a century: "Philosopher" over a marble bust says
            // antiquity, "Scientist" over the same bust says the
            // Enlightenment at the earliest. See lib/game/when-born.ts for why
            // this is part of the round rather than decoration.
            pill={event.field ? t[PERSON_FIELD_LABEL_KEYS[event.field]] : null}
            // The set counter, in the corner opposite the pill and only
            // below the split: above 1120px the column beside the picture
            // carries it, and two copies of "3 of 10" on one screen read as
            // two different counts.
            counter={
              <span className="flex items-center gap-2 min-[1120px]:hidden">
                <SetProgress
                  played={results.length}
                  total={QUESTIONS_PER_SET}
                  t={t}
                />
                {/* Hidden in place rather than unmounted once the guess is
                    in, so the counter beside it does not jump sideways. */}
                <span className={lockedIn ? "invisible" : undefined}>
                  <SoloRoundTimer clock={clock} t={t} />
                </span>
              </span>
            }
            // On the picture below 1120px for the reason every overlay on
            // these screens is: the stacked layout is a height budget with
            // nothing spare. Above that width it hides itself and the decks in
            // the right-hand column take over.
            titleHidden={answered ? "narrow" : false}
            badge={
              accuracy && guess !== null ? (
                <RoundVerdict
                  accuracy={accuracy}
                  guess={guess}
                  eventId={event.id}
                  locale={locale}
                  tp={reveal?.tp ?? null}
                  t={t}
                />
              ) : failed ? (
                <p
                  role="status"
                  className="round-verdict-in absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pb-3 pt-10 text-center text-xs font-semibold text-white/85"
                >
                  {t.revealFailed}
                </p>
              ) : null
            }
            t={t}
          />

          {/* The right-hand column: what the game is, the rails, the one
              button that answers the round, and the row the result lands in.
              The head and the result row carry the same horizontal padding the
              rail's own pane does (`px-8 sm:px-12`, which exists so an end
              tick label has room to centre on its mark), which is what makes
              the three of them line up on the same two edges. */}
          <div className="mx-auto flex w-full min-h-0 max-w-5xl flex-col">
            {/* `on-photo` on the whole head rather than on the subtitle
                alone. Unlike the film game's, this column stands on the
                general timeline's backdrop — a photograph of a night sky with
                a treeline through the lower half — and there is no card under
                it to hold the text off the picture. White on starfield is
                legible only where the sky happens to be dark, which is not a
                property this screen can rely on: the drop shadow is what makes
                it one. The subtitle also comes up from `white/60`, which was
                the dimmest thing on the screen and sat over the brightest part
                of the backdrop. */}
            {/* **A desktop row**, for the film game's reason and in its
                spelling: below 1120px this screen is one column around a 2:3
                portrait, and a heading, a line of prose and a counter above it
                were three rows of chrome taken out of the picture the round is
                about. The title and the prose move into the masthead pill in
                the bar's own row (`RoundHead` above), the counter into the
                portrait's top-right corner, and the card takes what they
                leave. */}
            <div className="on-photo hidden shrink-0 items-start justify-between gap-4 px-8 pt-1 sm:px-12 min-[1120px]:flex [@media(max-height:640px)]:pt-0">
              <div className="min-w-0">
                <h2 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
                  {t.whenBornTitle}
                </h2>
                {/* Not a flourish. The same photograph of Churchill could
                    reasonably be asked about his birth, his premiership or his
                    death, so the one thing the player has to be told is which
                    date is wanted. The film game's line does the mirror-image
                    job — see `whenBornYearAsked` in the dictionary. */}
                <p className="mt-1 text-sm leading-snug text-white/80 [@media(max-height:640px)]:mt-0">
                  {t.whenBornYearAsked}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3 pt-0.5">
                <SetProgress
                  played={results.length}
                  total={QUESTIONS_PER_SET}
                  size="md"
                  t={t}
                />
                {/* Hidden in place, not unmounted: see the portrait corner. */}
                <span className={lockedIn ? "invisible" : undefined}>
                  <SoloRoundTimer clock={clock} t={t} />
                </span>
              </div>
            </div>

            {/* The rails, at the **foot** of whatever the column has left over
                rather than centred in it — the film game's rule, and for its
                reason: the button under the rail is the answer to the rail, and
                half the slack standing between the two reads as a gap between
                two unrelated rows.

                `min-h-fit` so the rail keeps its own height when the column is
                too short for everything: the deficit then falls on the result
                row (which can give back the difference between `--result-h` and
                its floor) instead of on the rail, which would overflow and
                print itself over the head.

                **This is where the camera lives.** The strip holds all three
                panes side by side and is translated by whole pane widths, so
                "walking into antiquity" is the camera panning left along one
                continuous line rather than a rail being swapped out. The
                overflow is clipped by the box around it.

                Not `compact`, unlike the film game's single rail: three panes
                *do* have doors, so the band above the rail is holding open the
                space a door pill needs to stack over the marker's year bubble.
                `heading={false}` all the same — this game names itself in the
                row above rather than over its own ruler, and the doors say
                which rail you are on by naming the one you are not. */}
            <div className="flex min-h-fit flex-1 items-end">
              <div className="w-full overflow-hidden">
                <div
                  className="flex transition-transform ease-[cubic-bezier(0.65,0,0.35,1)]"
                  style={{
                    transform: `translateX(-${WHEN_BORN_PANES.indexOf(pane) * 100}%)`,
                    transitionDuration: `${panMs}ms`,
                  }}
                >
                  {WHEN_BORN_PANES.map((candidate) => (
                    <TimelinePaneView
                      key={candidate}
                      pane={candidate}
                      panes={WHEN_BORN_PANES}
                      active={candidate === pane}
                      heading={false}
                      fraction={fractions[candidate]}
                      onFractionChange={(next) => move(candidate, next)}
                      answered={lockedIn}
                      // Shown but not draggable while a year is being typed:
                      // the marker is the readout of the field, so it must not
                      // also be something the pointer can move.
                      locked={direct && !lockedIn}
                      // The marker belongs to the rail it was placed on.
                      // Showing one on the answer's rail too would read as a
                      // second guess.
                      showGuess={!lockedIn || guessPane === candidate}
                      // A typed year is exact; the year a rail reads back at
                      // that position is snapped to its grid. The bubble is
                      // told the player's own number in both states — while
                      // they type it, and after it has been locked in.
                      guessYear={
                        (guessTyped || (direct && !lockedIn)) &&
                        candidate === pane
                          ? (directYear(entry, entryRange) ?? guess)
                          : null
                      }
                      answerYear={
                        candidate === answerPane && reveal
                          ? reveal.date.year
                          : null
                      }
                      answerDelayMs={answerDelayMs}
                      // This rail's share of the distance between the guess and
                      // the truth. A guess in the wrong age spans several
                      // rails, so the measurement is computed here — where both
                      // ends are known — rather than by a rail that may hold
                      // neither.
                      gap={railGap({
                        pane: candidate,
                        guessPane,
                        guessFraction:
                          guessPane === null ? 0 : fractions[guessPane],
                        answerPane: answered ? answerPane : null,
                        answerYear: reveal?.date.year ?? null,
                        answerDelayMs,
                        panes: WHEN_BORN_PANES,
                      })}
                      gapColor={
                        accuracy ? VERDICT_COLORS[accuracy.verdict] : null
                      }
                      locale={locale}
                      t={t}
                      onEnter={enter}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* The round's controls. A three-column grid with equal flexible
                sides rather than a flex row: the middle column is the column's
                own centre whatever the sides are holding, so the advance button
                stands in exactly the same place with the entry open as with it
                closed. That button is the one thing on this screen which must
                not move.

                `relative` is for the warning, which hangs underneath the row
                rather than taking a row of its own. */}
            {/* **Below `md` the row holds nothing but the button**, and the
                grid collapses to one centred cell: the entry and its switch
                are a desktop control now (`useKeyboardEntry`), because a
                phone's numeric keypad covers this whole screen the moment the
                field takes focus. The three equal-sided columns are declared
                from that breakpoint up, where the sides have something to
                hold. */}
            <div className="relative grid w-full shrink-0 items-center justify-items-center pt-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
              {/* Always mounted and collapsed by `data-shown`: it has to
                  animate out as well as in, and `inert` is what takes a
                  clipped field out of reach. */}
              <div
                className="entry-shell hidden md:block md:justify-self-end"
                data-shown={direct}
                inert={!direct}
              >
                <div>
                  <div>
                    <DateEntry
                      value={entry}
                      onChange={editEntry}
                      onSubmit={submit}
                      // Locked in: it stays on screen reporting the year that
                      // was guessed, but it is no longer a control.
                      disabled={lockedIn}
                      invalid={invalid}
                      shown={direct}
                      // **The era chip stays**, unlike the film and football
                      // games which hide it: fifteen of these people were born
                      // BCE, so BCE is a real answer here and not a date the
                      // rail would only ever refuse. That is also why the
                      // placeholder is left at its default word rather than
                      // stating the span — "1500 BCE–2026" is the one range on
                      // the site that cannot be written as two numbers.
                      t={t}
                    />
                  </div>
                </div>
              </div>

              {/* One button, one place, all round. Both are in the same grid
                  cell with the same padding, so they share a centre and "Next
                  round" appears exactly where "Lock in guess" was — under the
                  pointer that just pressed it. Only the colour changes. */}
              {/* Staggered, not crossfaded, so the two labels are never on
                  screen on top of each other — see the solo game's. */}
              <div className="grid place-items-center">
                <div
                  className={`col-start-1 row-start-1 transition-opacity ${
                    answered
                      ? "opacity-0 duration-150"
                      : "opacity-100 duration-200 delay-150"
                  }`}
                  inert={answered}
                >
                  <button
                    ref={lockButton}
                    type="button"
                    onClick={submit}
                    aria-busy={sending}
                    className={`${ROUND_BUTTON_LG} relative bg-ink text-page hover:opacity-85 ${
                      sending ? "cursor-progress opacity-70" : ""
                    }`}
                  >
                    {t.submitGuess}
                    {/* The "Next round" trace, while the guess is graded. */}
                    {sending && (
                      <span aria-hidden="true" className="round-trace">
                        <i />
                        <i />
                        <i />
                      </span>
                    )}
                  </button>
                </div>

                <div
                  className={`col-start-1 row-start-1 transition-opacity ${
                    answered
                      ? "opacity-100 duration-200 delay-150"
                      : "opacity-0 duration-150"
                  }`}
                  inert={!answered}
                >
                  <button
                    ref={nextButton}
                    type="button"
                    onClick={requestNextRound}
                    // Never disabled. A press with nothing queued is latched
                    // and played as soon as the draw lands.
                    aria-busy={pendingNext}
                    className={`${ROUND_BUTTON_LG} relative border border-white/45 bg-black/45 text-ink backdrop-blur-md hover:bg-black/65 ${
                      pendingNext ? "cursor-progress opacity-60" : ""
                    }`}
                  >
                    {lastQuestion ? t.seeResults : t.nextRound}
                    {/* The home board's loading trace, run around the button
                        rather than a card. Mounted only while latched, so the
                        comet starts from the top. */}
                    {pendingNext && (
                      <span aria-hidden="true" className="round-trace">
                        <i />
                        <i />
                        <i />
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Faded and inert once the round is answered rather than
                  unmounted, so its cell keeps its width and the button beside
                  it stays centred.

                  `ml-3` because the two controls are not a pair: one answers
                  the round and the other changes how it is answered, and set
                  flush they read as a split button. `--menu-btn` is the one
                  number the toggle's box is built from, so a value set on this
                  cell resizes it without touching the site menu's button the
                  default is shared with. */}
              <div
                className={`hidden transition-opacity duration-300 md:ml-3 md:block md:justify-self-start md:[--menu-btn:46px] ${
                  lockedIn ? "opacity-0" : "opacity-100"
                }`}
                inert={lockedIn || !keyboardEntry}
              >
                <InputModeToggle
                  direct={direct}
                  onToggle={() => {
                    setDirectWanted((current) => !current);
                    setInvalid(false);
                  }}
                  t={t}
                />
              </div>

              {invalid && (
                <p
                  role="alert"
                  // No `-translate-x-1/2`: Tailwind v4 compiles that to the
                  // `translate` property and the keyframe animates
                  // `transform`, so the two would compose and pull it a whole
                  // width left. Both keyframes carry the -50% instead.
                  //
                  // A 16px line under `mt-1` is 20px, inside the frame's
                  // `pb-5`; the inherited 18px line box would hang past it
                  // and give a page built not to scroll a scrollbar.
                  className="entry-warning on-photo absolute left-1/2 top-full mt-1 whitespace-nowrap text-[12px] leading-4 font-medium text-bad"
                >
                  {t.invalidDate}
                </p>
              )}
            </div>

            {/* The result's row, reserved before there is a result to put in
                it — which is what stops the button above from moving when a
                round is answered, on a screen built not to scroll. Before the
                guess it holds the instruction, which is the one moment it has
                something better to say than nothing.

                Hidden below 1120px, where the verdict is painted on the picture
                instead (`RoundVerdict`, which hides itself at the same width,
                so the two are never on screen together). */}
            {/* On a window 640px tall or less the row gives back 8px of its
                top padding (and its floor the same 8px), and the head and its
                line of prose their own few: the portrait is shorter there
                than the head, rail, button and a 14rem row add up to, and the
                cards hung ~16px below its foot. The card itself stays 208px,
                which is what the 42% head share is measured on. */}
            <div className="hidden h-[var(--result-h)] min-h-56 gap-4 px-8 pt-4 sm:px-12 min-[1120px]:flex [@media(max-height:640px)]:min-h-[13.5rem] [@media(max-height:640px)]:pt-2">
              {accuracy && guess !== null ? (
                <>
                  <VerdictDeck
                    accuracy={accuracy}
                    guess={guess}
                    locale={locale}
                    tp={reveal?.tp ?? null}
                    t={t}
                    // The film game's measured share, and its TP in the
                    // kicker — see the note there.
                    headShare="42%"
                    tpInKicker
                    className="round-flank-left flex w-60 shrink-0 flex-col overflow-hidden rounded-3xl border text-center shadow-2xl shadow-black/60 backdrop-blur-2xl"
                  />
                  {/* The challenge rides with the description, not with the
                      result — it is the event's date being disputed. */}
                  <NoteDeck
                    note={event.description}
                    eventId={event.id}
                    t={t}
                    className="round-flank-right flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border text-center shadow-2xl shadow-black/60 backdrop-blur-2xl"
                  />
                </>
              ) : (
                // Centred in the reserved row rather than sitting at the top of
                // it: the row is a card's height of nothing until a guess is
                // locked in, and a single line pinned to its upper edge reads
                // as the page having run out rather than as the instruction it
                // is.
                <p className="on-photo flex w-full items-center justify-center pb-6 text-center text-sm text-white/80">
                  {t.whenBornHint}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
