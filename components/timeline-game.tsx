"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { dealTimelineEvents } from "@/app/actions/rounds";
import { DateEntry, InputModeToggle } from "@/components/date-entry";
import {
  NoteFlank,
  RoundVerdict,
  VerdictFlank,
} from "@/components/round-flank";
import { SetProgress, SetSummary } from "@/components/set-summary";
import { TimelineBackdrop } from "@/components/timeline-backdrop";
import {
  CARD_BOX,
  CARD_BOX_WIDE,
  openingFractions,
  panDuration,
  PAN_MS,
  railGap,
  RAIL_FOLD_MS,
  REVEAL_HOLD_MS,
  RoundCard,
  ROUND_BUTTON,
  TimelinePaneView,
} from "@/components/timeline-stage";
import type { LocalizedEvent, SupportedLocale } from "@/lib/db/types";
import {
  directYear,
  EMPTY_DATE_ENTRY,
  type DateEntryValue,
} from "@/lib/game/date-entry";
import { ROUND_QUEUE_DEPTH, ROUND_QUEUE_TARGET } from "@/lib/game/rounds";
import { gradeGuess, type BandSet } from "@/lib/game/scoring";
import {
  QUESTIONS_PER_SET,
  timelineResult,
  type SetResult,
} from "@/lib/game/set";
import {
  DEFAULT_PANE,
  entryFraction,
  fractionAtYear,
  paneBounds,
  paneForYear,
  TIMELINE_PANES,
  type PaneSet,
  type TimelinePane,
  yearAtFraction,
} from "@/lib/game/timeline";
import { VERDICT_COLORS } from "@/lib/game/verdict-style";
import type { Dict } from "@/lib/i18n/dictionary";

/** How long to wait before trying again when topping the queue up fails. */
const REFILL_RETRY_MS = 1500;

/**
 * Date-guessing game.
 *
 * One stage, five panes side by side in timeline order (cosmos, evolution, BC,
 * common era, future). The stage is translated by whole pane widths, so
 * "opening the BC timeline" is the camera panning left along one continuous
 * line rather than a route change — which is why the entrances can appear at
 * the rail's own ends.
 *
 * `pane` doubles as the backdrop's input: the photograph behind the whole
 * screen belongs to the era being looked at, so the two cannot drift apart.
 *
 * **Rounds are a queue, not a route.** The page deals the first two events and
 * this component plays through them, topping the queue back up from the server
 * while the current round is still being guessed. So "next round" is a state
 * change: no reload, no refetch in the way, and the next photograph has already
 * been pulled into the browser cache by the time it is needed. What the player
 * sees instead of a blank page is the picture dissolving and the camera
 * travelling back to the common era — the same two motions the game already
 * uses to change era.
 *
 * **The composition is a height budget.** The screen is exactly one viewport
 * and must not scroll at any point in a round, so the parts that cannot shrink
 * say so (`shrink-0`) and the picture is the one part that gives: it takes
 * whatever is left over.
 *
 * **The footer is one button in one position, for the whole round.** "Lock in
 * guess" and "Next round" are stacked in a single grid cell, so they share a
 * centre and the second lands exactly where the first was — the player's
 * pointer is already there. They differ in colour rather than in place: solid
 * white while the guess is still to be made, dark glass once it has been.
 *
 * **There are two ways to answer a round and one reveal.** The rail is the
 * default and the one the game is built around; a player who already knows the
 * year can type it instead (`DateEntry`), and the switch between them is the
 * round control at the right-hand end of the footer. What they produce is the
 * same thing — a year, graded by `gradeGuess` — so nothing downstream of the
 * guess knows which was used. The *reveal* is always the rail, because the
 * rail is where the answer is marked and where the distance between the two is
 * drawn: locking in a typed date unfolds it, having first placed the camera
 * and the marker behind the fold so that what unfurls already carries the
 * guess.
 *
 * **The result is beside the card, not in the column and not on the
 * picture.** A verdict laid out in flow is ~80px of new height between the
 * rail and the button, which pushes the button down the moment it is needed
 * most — and on a short screen, off the bottom of a page built not to scroll.
 * It was painted over the foot of the photograph to avoid that, which cost the
 * budget nothing but put the verdict across the one thing the round is about.
 * It now hangs off the card's own box instead (`VerdictFlank` on the left,
 * `NoteFlank` on the right, both `absolute`), which costs the budget nothing
 * *and* leaves the picture alone. Below 1120px there is no room either side
 * and `RoundVerdict` takes over — see the note on it.
 */
export function TimelineGame({
  events,
  t,
  locale,
  panes = TIMELINE_PANES,
  homePane = DEFAULT_PANE,
  bands = undefined,
  deal = dealTimelineEvents,
  title,
  otherHref = "/compare",
  otherLabel,
}: {
  events: LocalizedEvent[];
  t: Dict;
  locale: SupportedLocale;
  /**
   * The rail, or rails, this game is played over. Defaults to the general
   * timeline's five panes; the football game passes its own single pane.
   *
   * Everything that reads the *order* of the panes — which rail an answer is
   * marked on, which doors a rail offers, how long the camera takes — is given
   * this, so a one-pane game is the same code with nowhere to pan to rather
   * than a second implementation of the screen.
   */
  panes?: PaneSet;
  /** Where a round opens, and where the camera returns between rounds. */
  homePane?: TimelinePane;
  /**
   * The tolerance ladder. Undefined means the general one (`gradeGuess`'s own
   * default), which is scored on the event's age; a subject pool whose events
   * are all roughly contemporary brings its own — see `FOOTBALL_BANDS`.
   */
  bands?: BandSet;
  /**
   * How the queue is topped up. A Server Action, passed in rather than chosen
   * here, because the pool is the one thing that must not be decidable on the
   * client: the football game and the date-guessing game differ in which
   * action they call and in nothing else.
   */
  deal?: (count: number) => Promise<LocalizedEvent[]>;
  /** The set summary's heading. Defaults to the date-guessing game's. */
  title?: string;
  /** Where the summary's "try the other game" link goes. */
  otherHref?: string;
  otherLabel?: string;
}) {
  const [pane, setPane] = useState<TimelinePane>(homePane);
  // One position per pane: panning away and back should not lose the marker.
  // Every pane remembers its own position; the ones the player has not opened
  // yet start on the edge they will walk in through.
  const [fractions, setFractions] = useState<Record<TimelinePane, number>>(
    () => openingFractions(panes, homePane),
  );
  const [guess, setGuess] = useState<number | null>(null);
  // The pane the guess was made in, which is not necessarily the one on camera
  // once the answer has been revealed — so the marker stays with the guess.
  const [guessPane, setGuessPane] = useState<TimelinePane | null>(null);
  const [panMs, setPanMs] = useState(PAN_MS);
  // The round being played is the head of the queue; the one behind it is the
  // next round, held only so it can be preloaded and swapped in instantly.
  const [queue, setQueue] = useState<LocalizedEvent[]>(events);
  const [refillAttempt, setRefillAttempt] = useState(0);
  // Latched when the player presses "Next round" before the queue has a round
  // to give them. With the queue kept a round ahead (`ROUND_QUEUE_TARGET`)
  // that should not happen, but a slow or failed draw must not leave them
  // pressing a button that does nothing.
  const [pendingNext, setPendingNext] = useState(false);
  // The set so far: one entry per question already answered *and* advanced
  // past, so its length is both the score and the position in the set.
  const [results, setResults] = useState<SetResult[]>([]);
  // Typing the date rather than dragging for it. A preference, not a round's
  // state: it survives the reveal and the next round, because a player who
  // wanted to type one date almost certainly wants to type the next.
  const [direct, setDirect] = useState(false);
  const [entry, setEntry] = useState<DateEntryValue>(EMPTY_DATE_ENTRY);
  // Set by a refused lock-in and cleared by the next edit, so the warning
  // answers the press rather than nagging at a half-typed year.
  const [invalid, setInvalid] = useState(false);
  // Whether the guess on screen was typed rather than dragged for. Two things
  // read it: the rail has to unfold before anything can be marked on it, so
  // the whole reveal is held back by the fold; and the marker's own caption
  // has to quote the year the player typed rather than the one the rail reads
  // back at that position, which is snapped to the pane's grid.
  const [guessTyped, setGuessTyped] = useState(false);
  const travelTimer = useRef<number | null>(null);
  const resetTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (travelTimer.current !== null)
        window.clearTimeout(travelTimer.current);
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  const event = queue[0] ?? null;
  const upcoming = queue[1] ?? null;

  // Top the queue back up in the background. Keyed on the queue's length rather
  // than on its contents, so playing a round triggers exactly one refill;
  // `refillAttempt` is what lets a failed one be tried again, since a failure
  // leaves the length — and therefore the dependencies — unchanged.
  useEffect(() => {
    if (queue.length >= ROUND_QUEUE_TARGET) return;

    let cancelled = false;
    let retry: number | null = null;

    deal(ROUND_QUEUE_DEPTH)
      .then((fresh) => {
        if (cancelled) return;
        // A draw is distinct within itself but can repeat what is already in
        // hand; dropping those is what stops the same event appearing twice in
        // a row. A batch can never be filtered away entirely, so the queue
        // always grows and this effect always settles.
        setQueue((current) => [
          ...current,
          ...fresh.filter(
            (candidate) => !current.some((held) => held.id === candidate.id),
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
    // `deal` is a module-level Server Action reference at every call site, so
    // it is stable; naming it keeps the dependency array honest.
  }, [queue.length, refillAttempt, deal]);

  // Pull the next round's photograph while the current one is being guessed, so
  // the dissolve has something to dissolve *to*. Decoding is the browser's; all
  // this does is make sure the bytes are already in its cache.
  useEffect(() => {
    const url = upcoming?.image?.url;
    if (!url) return;

    const preload = new window.Image();
    preload.src = url;
  }, [upcoming?.image?.url]);

  const fraction = fractions[pane];
  const year = yearAtFraction(pane, fraction);
  const answered = guess !== null;

  // What a typed date may name: the two ends of the rails this game actually
  // shows. On the general timeline that is the whole ruler, which is what the
  // entry already allowed; on a one-pane subject game it is that pane, so a
  // year with nowhere to be marked is refused rather than clamped onto an edge
  // it does not stand for.
  const entryRange = {
    min: paneBounds(panes[0]!).min,
    max: paneBounds(panes[panes.length - 1]!).max,
  };

  const move = useCallback((nextPane: TimelinePane, nextFraction: number) => {
    setFractions((current) => ({ ...current, [nextPane]: nextFraction }));
  }, []);

  function enter(nextPane: TimelinePane) {
    move(nextPane, entryFraction(nextPane, pane, panes));
    setPanMs(PAN_MS);
    setPane(nextPane);
  }

  /**
   * Locking in always ends with the answer on screen. A guess in the common era
   * for something that happened four billion years ago is not wrong by a number
   * the player can picture — so the camera travels there, through every era in
   * between, and the answer is marked on the rail it belongs to.
   */
  function submit() {
    if (answered || !event) return;

    // Where the guess came from. Dragging has already put the camera and the
    // marker where they belong; a typed date has to be *placed* — and it is
    // placed while the rail is still folded, with the pan at zero, so the
    // camera's jump to another era is spent behind the fold instead of being
    // watched. What unfolds a moment later is a rail that already carries the
    // guess, which is why the fold is also what the reveal below waits on.
    let from = pane;
    let guessed = year;
    let offset = 0;

    if (direct) {
      const typed = directYear(entry, entryRange);
      if (typed === null) {
        setInvalid(true);
        return;
      }

      guessed = typed;
      from = paneForYear(typed, panes);
      offset = RAIL_FOLD_MS;

      setPanMs(0);
      setPane(from);
      move(from, fractionAtYear(from, typed));
    }

    setGuess(guessed);
    setGuessPane(from);
    setGuessTyped(direct);

    const target = paneForYear(event.year, panes);
    if (target === from) return;

    travelTimer.current = window.setTimeout(() => {
      setPanMs(panDuration(from, target, panes));
      setPane(target);
    }, offset + REVEAL_HOLD_MS);
  }

  /**
   * The next round, without a page load.
   *
   * The camera flies back to the common era rather than cutting to it, which is
   * what carries the backdrop through its own crossfade and makes the change of
   * round read as one movement with the picture's dissolve.
   *
   * The rails are reset in two parts, and the split is the whole reason this
   * looks clean. The pane being landed on is reset immediately — it is
   * off-camera at that moment (or it is already the one on screen, where the
   * marker simply glides back to centre). Every other pane keeps the marker the
   * player left on it until the journey is over, because resetting them now
   * would be a visible jump on the rails the camera is about to fly past.
   */
  /** Advance for real. Callers are responsible for there being a round to take. */
  function advance() {
    if (!upcoming || !accuracy) return;

    // Banked here rather than at `submit`, so `results.length` is always the
    // number of questions *left behind* — which makes it the index of the one
    // on screen as well as the score. The set is over when this push fills it,
    // and the round underneath advances anyway: the summary covers a fresh
    // question 1, so "Play again" is a state change with nothing to deal.
    setResults((current) => [...current, timelineResult(accuracy.verdict)]);

    const from = pane;
    const travel =
      from === homePane ? 0 : panDuration(from, homePane, panes);

    if (travelTimer.current !== null) window.clearTimeout(travelTimer.current);
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);

    setGuess(null);
    setGuessPane(null);
    setGuessTyped(false);
    // The era is kept and only the digits are cleared: the next round is a
    // fresh year, not a fresh opinion about which half of history it is in.
    setEntry((current) => ({ era: current.era, digits: "" }));
    setInvalid(false);
    setQueue((current) => current.slice(1));
    setFractions((current) => ({ ...current, [homePane]: 0.5 }));

    if (travel > 0) {
      setPanMs(travel);
      setPane(homePane);
    }

    resetTimer.current = window.setTimeout(
      () => setFractions(openingFractions(panes, homePane)),
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

  // Graded on relative error, not on the raw year gap: see lib/game/scoring.ts
  // for why 900 years out on 1900 is a worse answer than 10,000 out on
  // 110,000 BCE.
  const accuracy =
    guess !== null && event ? gradeGuess(guess, event.year, bands) : null;
  // The set is full once ten questions have been banked; until then the last
  // of them turns "Next round" into "See results", because the button is about
  // to do something other than deal another question.
  const setComplete = results.length >= QUESTIONS_PER_SET;
  const lastQuestion = results.length === QUESTIONS_PER_SET - 1;

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
  const answerPane = event ? paneForYear(event.year, panes) : null;
  // The answer appears when the camera gets there: the hold plus the journey,
  // after the rail has finished unfolding if it had to. A guess made in the
  // answer's own era needs no journey, so the offset is all that holds it.
  const revealOffsetMs = guessTyped ? RAIL_FOLD_MS : 0;
  const answerDelayMs =
    revealOffsetMs +
    (guessPane === null || answerPane === null || guessPane === answerPane
      ? 0
      : REVEAL_HOLD_MS + panDuration(guessPane, answerPane, panes));
  // The rail folds away while a date is being typed, and comes back for the
  // reveal — so it is the *unanswered* half of direct mode that has no rail.
  const folded = direct && !answered;

  if (!event) return null;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-4 sm:gap-5">
      {/* Full-bleed and fixed, so it must stay out of any transformed ancestor;
          see the note in the component itself. */}
      <TimelineBackdrop pane={pane} panes={panes} />

      {setComplete ? (
        // The backdrop above stays mounted and the round below is already reset
        // to a fresh question, so the summary floats over the game rather than
        // replacing the screen — and "Play again" has nothing left to do but
        // clear the set.
        <SetSummary
          results={results}
          title={title ?? t.timelineTitle}
          otherHref={otherHref}
          otherLabel={otherLabel ?? t.tryComparison}
          onPlayAgain={() => setResults([])}
          t={t}
        />
      ) : (
        <>
          {/* The card and its two side panels.

              The wrapper exists so the panels have a box to hang off: they are
              `absolute` against it at `right-full` and `left-full`, which is
              what keeps the photograph in exactly the same place before and
              after a guess. A panel laid out in flow beside the card would
              shove the card sideways the moment a round was answered.

              It reads the card's own width and height caps so the two boxes
              are the same size — the panels are `inset-y-0`, so a wrapper
              taller than the card would hang them past its corners. Both read
              the same constants rather than repeating a class list, which is
              what keeps them identical now that there are two sizes of card. */}
          <div
            className={`card-caps relative flex min-h-0 flex-1 flex-col items-stretch ${
              folded ? CARD_BOX_WIDE : CARD_BOX
            }`}
          >
            {accuracy && guess !== null && (
              <>
                <VerdictFlank
                  accuracy={accuracy}
                  guess={guess}
                  locale={locale}
                  t={t}
                />
                {/* The challenge rides with the description now, not with the
                    result — it is the event's date being disputed. */}
                <NoteFlank note={event.description} eventId={event.id} t={t} />
              </>
            )}

            <RoundCard
              event={event}
              t={t}
              // The picture grows into the room the rail gives up, so folding
              // it away leaves no hole in the column and the button below does
              // not move.
              wide={folded}
              // On the photograph for the same reason the verdict was: this
              // screen is a height budget with nothing spare, and a counter in
              // the flow would be another row between the rail and the button.
              counter={
                <SetProgress
                  played={results.length}
                  total={QUESTIONS_PER_SET}
                  t={t}
                />
              }
              badge={
                accuracy && guess !== null ? (
                  <RoundVerdict
                    accuracy={accuracy}
                    guess={guess}
                    eventId={event.id}
                    locale={locale}
                    t={t}
                  />
                ) : null
              }
            />
          </div>

          {/* The rail, and the fold that takes it away when the player would
              rather type the date.

              Three boxes, one per job, because they cannot be the same box.
              The outer one reclaims the band's *height* (`1fr` -> `0fr`), the
              middle one owns the overflow that trick needs, and the inner one
              carries the collapse inward from both ends as a `clip-path` —
              which clips without laying anything out, so none of the five
              panes reflows on the way and the ruler is not re-measured
              mid-animation. `.rail-fold` in app/globals.css is all of it.

              `inert` rather than a conditional render: the rail has to animate
              in both directions, and an element that unmounts has no closing
              frame to show. It is also what keeps a folded rail's slider and
              its era doors off the tab order. */}
          <div
            className="rail-fold w-full shrink-0"
            data-folded={folded}
            inert={folded}
          >
            <div>
              <div className="rail-fold-inner w-full overflow-hidden">
                <div
                  className="flex transition-transform ease-[cubic-bezier(0.65,0,0.35,1)]"
                  style={{
                    transform: `translateX(-${panes.indexOf(pane) * 100}%)`,
                    transitionDuration: `${panMs}ms`,
                  }}
                >
                  {panes.map((candidate) => (
                    <TimelinePaneView
                      key={candidate}
                      pane={candidate}
                      panes={panes}
                      active={candidate === pane}
                      fraction={fractions[candidate]}
                      onFractionChange={(next) => move(candidate, next)}
                      answered={answered}
                      // The marker belongs to the pane it was placed in. Showing one on
                      // the answer's pane too would read as a second guess.
                      showGuess={!answered || guessPane === candidate}
                      // A typed date is exact, and the year this rail reads back
                      // at that position is snapped to the pane's grid — so the
                      // bubble is told the player's own number rather than
                      // deriving one that may be a hundred years off it.
                      guessYear={
                        guessTyped && guessPane === candidate ? guess : null
                      }
                      answerYear={answerPane === candidate ? event.year : null}
                      answerDelayMs={answerDelayMs}
                      // This pane's share of the distance between the guess and
                      // the truth. A guess in the wrong era spans several rails,
                      // so the measurement is computed here — where both ends are
                      // known — rather than by a pane that may hold neither.
                      gap={railGap({
                        pane: candidate,
                        guessPane,
                        guessFraction:
                          guessPane === null ? 0 : fractions[guessPane],
                        answerPane,
                        answerYear: event.year,
                        answerDelayMs,
                        // The end nearest the guess normally draws itself at
                        // once; a typed one waits for the rail it is drawn on.
                        nearDelayMs: revealOffsetMs,
                        panes,
                      })}
                      // The hue it is drawn in, which is the same one the result
                      // card beside the photograph is headed in. Null until there
                      // is a verdict, and nothing is drawn on a `perfect` guess —
                      // the two years are the same, so the bar has no length.
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
          </div>

          {/* The round's controls: how the date is entered, the one button
              that answers the round, and the switch between the two.

              **A three-column grid with equal flexible sides, not a flex
              row.** The middle column is therefore the column's own centre
              whatever the two sides are holding, so the advance button stands
              in exactly the same place with the entry open as with it folded
              away — and the entry can appear immediately to its left and the
              switch immediately to its right without either of them moving
              it. A flex row would have re-centred the lot every time one of
              them came or went, and that button is the one position on this
              screen which must not move.

              Below `md` the three do not fit across a phone, so the entry
              takes a row of its own above them. It keeps its place in the
              document either way — `.entry-shell` gives its space back in
              both axes for exactly that reason — and the button and the
              switch stay side by side, which is what the inner flex and its
              `md:contents` are for: above the breakpoint that wrapper stops
              being a box and its two children become the grid's own middle
              and right cells.

              `relative` is for the warning, which hangs underneath the row
              rather than taking a row of its own: a sentence that appears
              only when a date is refused must not be able to move the button
              it was refused by. */}
          <div className="relative grid w-full shrink-0 justify-items-center md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
            {/* Always mounted and folded by `data-shown`, like the rail: it
                has to animate out as well as in. `inert` is what takes a
                folded field out of reach — a clipped input is still a
                focusable one. */}
            <div
              className="entry-shell md:justify-self-end"
              data-shown={direct}
              inert={!direct}
            >
              <div>
                <div>
                  <DateEntry
                    value={entry}
                    onChange={(next) => {
                      setEntry(next);
                      setInvalid(false);
                    }}
                    onSubmit={submit}
                    // Locked in: it stays on screen reporting the year that
                    // was guessed, but it is no longer a control.
                    disabled={answered}
                    invalid={invalid}
                    shown={direct}
                    focusDelayMs={RAIL_FOLD_MS}
                    t={t}
                  />
                </div>
              </div>
            </div>

            {/* One button, one place, all round. Both are in the same grid cell
                with the same padding, so they share a centre and "Next round"
                appears exactly where "Lock in guess" was — under the pointer
                that just pressed it. Only the colour changes, which is what
                tells the player which of the two they are looking at.

                `inert` on whichever is hidden keeps it off the tab order and
                out of the accessibility tree while it is only holding the slot
                open. */}
            <div className="flex items-center gap-3 md:contents">
              <div className="grid place-items-center">
                <div
                  className={`col-start-1 row-start-1 transition-opacity duration-300 ${
                    answered ? "opacity-0" : "opacity-100"
                  }`}
                  inert={answered}
                >
                  <button
                    type="button"
                    onClick={submit}
                    className={`${ROUND_BUTTON} bg-ink text-page hover:opacity-85`}
                  >
                    {t.submitGuess}
                  </button>
                </div>

                <div
                  className={`col-start-1 row-start-1 transition-opacity duration-300 ${
                    answered ? "opacity-100" : "opacity-0"
                  }`}
                  inert={!answered}
                >
                  <button
                    type="button"
                    onClick={requestNextRound}
                    // Never disabled. A press with nothing queued is latched and
                    // played as soon as the draw lands (`requestNextRound`);
                    // disabling it here is what left it dead for the whole of the
                    // first draw, on question 2 of every game.
                    aria-busy={pendingNext}
                    className={`${ROUND_BUTTON} border border-white/45 bg-black/45 text-ink backdrop-blur-md hover:bg-black/65 ${
                      pendingNext ? "cursor-progress opacity-60" : ""
                    }`}
                  >
                    {lastQuestion ? t.seeResults : t.nextRound}
                  </button>
                </div>
              </div>

              {/* Faded and inert once the round is answered rather than
                  unmounted, so its cell keeps its width and the button beside
                  it stays centred. There is nothing to switch to mid-reveal
                  anyway: the rail is back on screen carrying the answer. */}
              <div
                className={`transition-opacity duration-300 md:ml-3 md:justify-self-start ${
                  answered ? "opacity-0" : "opacity-100"
                }`}
                inert={answered}
              >
                <InputModeToggle
                  direct={direct}
                  onToggle={() => {
                    setDirect((current) => !current);
                    setInvalid(false);
                  }}
                  t={t}
                />
              </div>
            </div>

            {/* The refusal, under the row and out of the flow. Keyed on
                nothing: it is mounted by the press and animates once. */}
            {invalid && (
              <p
                role="alert"
                // No `-translate-x-1/2`: Tailwind v4 compiles that to the
                // `translate` property and the keyframe below animates
                // `transform`, so the two would compose and pull it a whole
                // width left. Both of its keyframes carry the -50% instead,
                // the way the answer marker's do.
                className="entry-warning on-photo absolute left-1/2 top-full mt-2 whitespace-nowrap text-[12px] font-medium text-bad"
              >
                {t.invalidDate}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
