"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { dealTimelineEvents } from "@/app/actions/rounds";
import {
  DateChallenge,
  NoteFlank,
  VerdictFlank,
} from "@/components/round-flank";
import { SetProgress, SetSummary } from "@/components/set-summary";
import { TimelineBackdrop } from "@/components/timeline-backdrop";
import {
  openingFractions,
  panDuration,
  PAN_MS,
  REVEAL_HOLD_MS,
  RoundCard,
  ROUND_BUTTON,
  TimelinePaneView,
  VERDICT_COLORS,
  VERDICT_LABEL_KEYS,
} from "@/components/timeline-stage";
import type { LocalizedEvent, SupportedLocale } from "@/lib/db/types";
import { ROUND_QUEUE_DEPTH, ROUND_QUEUE_TARGET } from "@/lib/game/rounds";
import { gradeGuess, type GuessAccuracy } from "@/lib/game/scoring";
import {
  QUESTIONS_PER_SET,
  timelineResult,
  type SetResult,
} from "@/lib/game/set";
import {
  DEFAULT_PANE,
  entryFraction,
  paneForYear,
  TIMELINE_PANES,
  type TimelinePane,
  yearAtFraction,
} from "@/lib/game/timeline";
import { formatYear, formatYearCount } from "@/lib/historical-date";
import { format, type Dict } from "@/lib/i18n/dictionary"

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
}: {
  events: LocalizedEvent[];
  t: Dict;
  locale: SupportedLocale;
}) {
  const [pane, setPane] = useState<TimelinePane>(DEFAULT_PANE);
  // One position per pane: panning away and back should not lose the marker.
  // Every pane remembers its own position; the ones the player has not opened
  // yet start on the edge they will walk in through.
  const [fractions, setFractions] =
    useState<Record<TimelinePane, number>>(openingFractions);
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

    dealTimelineEvents(ROUND_QUEUE_DEPTH)
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
  }, [queue.length, refillAttempt]);

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

  const move = useCallback((nextPane: TimelinePane, nextFraction: number) => {
    setFractions((current) => ({ ...current, [nextPane]: nextFraction }));
  }, []);

  function enter(nextPane: TimelinePane) {
    move(nextPane, entryFraction(nextPane, pane));
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

    const from = pane;
    const target = paneForYear(event.year);

    setGuess(year);
    setGuessPane(from);

    if (target === from) return;

    travelTimer.current = window.setTimeout(() => {
      setPanMs(panDuration(from, target));
      setPane(target);
    }, REVEAL_HOLD_MS);
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
    const travel = from === DEFAULT_PANE ? 0 : panDuration(from, DEFAULT_PANE);

    if (travelTimer.current !== null) window.clearTimeout(travelTimer.current);
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);

    setGuess(null);
    setGuessPane(null);
    setQueue((current) => current.slice(1));
    setFractions((current) => ({ ...current, [DEFAULT_PANE]: 0.5 }));

    if (travel > 0) {
      setPanMs(travel);
      setPane(DEFAULT_PANE);
    }

    resetTimer.current = window.setTimeout(
      () => setFractions(openingFractions()),
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
    guess !== null && event ? gradeGuess(guess, event.year) : null;
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
  const answerPane = event ? paneForYear(event.year) : null;
  // The answer appears when the camera gets there: the hold plus the journey.
  const answerDelayMs =
    guessPane === null || answerPane === null || guessPane === answerPane
      ? 0
      : REVEAL_HOLD_MS + panDuration(guessPane, answerPane);

  if (!event) return null;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-4 sm:gap-5">
      {/* Full-bleed and fixed, so it must stay out of any transformed ancestor;
          see the note in the component itself. */}
      <TimelineBackdrop pane={pane} />

      {setComplete ? (
        // The backdrop above stays mounted and the round below is already reset
        // to a fresh question, so the summary floats over the game rather than
        // replacing the screen — and "Play again" has nothing left to do but
        // clear the set.
        <SetSummary
          results={results}
          title={t.timelineTitle}
          otherHref="/compare"
          otherLabel={t.tryComparison}
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

              It repeats the card's own width and height caps so the two boxes
              are the same size — the panels are `inset-y-0`, so a wrapper
              taller than the card would hang them past its corners. */}
          <div className="relative flex min-h-0 w-full max-w-[25rem] flex-1 flex-col items-stretch sm:max-h-[26rem] sm:max-w-[32rem]">
            {accuracy && guess !== null && (
              <>
                <VerdictFlank
                  accuracy={accuracy}
                  guess={guess}
                  eventId={event.id}
                  locale={locale}
                  t={t}
                />
                <NoteFlank note={event.description} t={t} />
              </>
            )}

            <RoundCard
              event={event}
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

          {/* Stage viewport: clips the two panes that are off-camera. */}
          <div className="w-full shrink-0 overflow-hidden">
            <div
              className="flex transition-transform ease-[cubic-bezier(0.65,0,0.35,1)]"
              style={{
                transform: `translateX(-${TIMELINE_PANES.indexOf(pane) * 100}%)`,
                transitionDuration: `${panMs}ms`,
              }}
            >
              {TIMELINE_PANES.map((candidate) => (
                <TimelinePaneView
                  key={candidate}
                  pane={candidate}
                  active={candidate === pane}
                  fraction={fractions[candidate]}
                  onFractionChange={(next) => move(candidate, next)}
                  answered={answered}
                  // The marker belongs to the pane it was placed in. Showing one on
                  // the answer's pane too would read as a second guess.
                  showGuess={!answered || guessPane === candidate}
                  answerYear={answerPane === candidate ? event.year : null}
                  answerDelayMs={answerDelayMs}
                  locale={locale}
                  t={t}
                  onEnter={enter}
                />
              ))}
            </div>
          </div>

          {/* One button, one place, all round. Both are in the same grid cell with
          the same padding, so they share a centre and "Next round" appears
          exactly where "Lock in guess" was — under the pointer that just
          pressed it. Only the colour changes, which is what tells the player
          which of the two they are looking at.

          `inert` on whichever is hidden keeps it off the tab order and out of
          the accessibility tree while it is only holding the slot open. */}
          <div className="grid shrink-0 place-items-center">
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
        </>
      )}
    </div>
  );
}



/**
 * The round's result, painted over the foot of the photograph.
 *
 * **This is the narrow-screen fallback now, not the main event.** The result
 * moved out to `VerdictFlank` beside the card on 2026-10-06, because a verdict
 * across the picture covers the one thing the round is about — but the flanks
 * need a screen with sides to it, and below 1120px there are none. So this
 * stays, hidden at exactly the width the panels appear at, and the two are
 * never on screen together.
 *
 * It mounts only once a guess is in, which is what makes the pop-in animation
 * run per round rather than once on load. The scrim is what keeps it legible:
 * the picture underneath it is a different photograph every round and cannot
 * be relied on to be dark.
 *
 * The guessed year is repeated here even though the rail marks it, because the
 * camera may have flown several eras away to the answer by the time this is
 * read, taking the player's own marker off screen with it.
 *
 * The challenge sits in here as well as in the flank, so reporting a wrong
 * date is not something only a wide screen can do. The surrounding block is
 * `pointer-events-none` — it is a scrim over a photograph and must not swallow
 * anything — so the one part of it that is a control says so for itself.
 */
function RoundVerdict({
  accuracy,
  guess,
  eventId,
  locale,
  t,
}: {
  accuracy: GuessAccuracy;
  guess: number;
  eventId: string;
  locale: SupportedLocale;
  t: Dict;
}) {
  return (
    <div
      role="status"
      className="round-verdict-in pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pb-3 pt-14 text-center min-[1120px]:hidden"
    >
      <p
        className="on-photo font-display text-3xl font-semibold leading-none tracking-tight sm:text-4xl"
        style={{ color: VERDICT_COLORS[accuracy.verdict] }}
      >
        {t[VERDICT_LABEL_KEYS[accuracy.verdict]]}
      </p>
      <p className="on-photo text-xs text-white/80 sm:text-sm">
        {accuracy.distance === 0
          ? t.correct
          : format(t.yearsOff, {
              n: formatYearCount(accuracy.distance, locale),
            })}
        <span className="px-1.5 text-white/40">·</span>
        {t.yourGuess}: {formatYear(guess)}
      </p>

      <div className="mt-1 flex justify-center">
        <DateChallenge eventId={eventId} t={t} />
      </div>
    </div>
  );
}
