"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { dealTimelineEvents } from "@/app/actions/rounds";
import { revealDateRound } from "@/app/actions/scoring";
import {
  DateEntry,
  InputModeToggle,
  useKeyboardEntry,
} from "@/components/date-entry";
import {
  DateChallenge,
  NoteFlank,
  RoundVerdict,
  VerdictDeckRow,
  VerdictFlank,
} from "@/components/round-flank";
import { RoundHead } from "@/components/round-head";
import { SetProgress, SetSummary } from "@/components/set-summary";
import { useSoloSet } from "@/components/solo-points";
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
import type { SupportedLocale } from "@/lib/db/types";
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
import { gradeGuess, type BandSet } from "@/lib/game/scoring";
import {
  QUESTIONS_PER_SET,
  timelineResult,
  type SetResult,
} from "@/lib/game/set";
import type { DealtEvent, RevealedDate } from "@/lib/game/solo";
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
import { formatYear, formatYearCount } from "@/lib/historical-date";
import { dateLabels, format, type Dict } from "@/lib/i18n/dictionary";

/** How long to wait before trying again when topping the queue up fails. */
const REFILL_RETRY_MS = 1500;

/**
 * Date-guessing game.
 *
 * One stage, four panes side by side in timeline order (cosmos, evolution,
 * BC, common era). The stage is translated by whole pane widths, so
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
  railHeading = true,
  headBlurb = null,
}: {
  /** Masked and signed: the year arrives with the reply to a guess. */
  events: DealtEvent[];
  t: Dict;
  locale: SupportedLocale;
  /**
   * The rail, or rails, this game is played over. Defaults to the general
   * timeline's four panes; the football game passes its own single pane.
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
   *
   * The second argument is the events this game has already dealt — see the
   * refill effect for why the draw has to be told.
   */
  deal?: (
    count: number,
    exclude: readonly string[],
  ) => Promise<DealtEvent[]>;
  /** The set summary's heading. Defaults to the date-guessing game's. */
  title?: string;
  /** Where the summary's "try the other game" link goes. */
  otherHref?: string;
  otherLabel?: string;
  /**
   * Whether the rail prints the name of the pane it is showing.
   *
   * True on the general timeline, where it is how a player knows which era
   * they have panned into. False on a **subject** game, where the pane is the
   * whole rail and the heading was naming the game rather than an era — which
   * is also how the basketball screen came to be headed "Common Era": that
   * pane has no label of its own and `paneLabel` falls through. A subject game
   * names itself in the bar's own row instead (`headBlurb`), and the row the
   * heading gave up carries the round's result.
   */
  railHeading?: boolean;
  /**
   * What this game is, in one sentence, for the masthead pill in the top bar's
   * row. Null is no pill at all, which is the general timeline: the picture
   * and the five-era rail say what that game is, and the pill would be a
   * second heading over a screen that already deleted its first.
   */
  headBlurb?: string | null;
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
  const [queue, setQueue] = useState<DealtEvent[]>(events);
  // The round's answer and what it paid, once the server has graded the
  // guess. Null while the guess is still to be made *and* while it is on its
  // way: the year is not on the client until this is set (lib/game/solo.ts).
  const [reveal, setReveal] = useState<{
    date: RevealedDate;
    tp: number;
  } | null>(null);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const solo = useSoloSet();
  const [refillAttempt, setRefillAttempt] = useState(0);
  // Latched when the player presses "Next round" before the queue has a round
  // to give them. With the queue kept a round ahead (`ROUND_QUEUE_TARGET`)
  // that should not happen, but a slow or failed draw must not leave them
  // pressing a button that does nothing.
  const [pendingNext, setPendingNext] = useState(false);
  // The set so far: one entry per question already answered *and* advanced
  // past, so its length is both the score and the position in the set.
  const [results, setResults] = useState<SetResult[]>([]);
  // Which events this set has already used. Kept beside `results` rather than
  // derived from it, because a result records a verdict and not the question
  // that earned it — and it is the question a draw has to avoid repeating.
  const [played, setPlayed] = useState<string[]>([]);
  // Typing the date rather than dragging for it. A preference, not a round's
  // state: it survives the reveal and the next round, because a player who
  // wanted to type one date almost certainly wants to type the next.
  // Typing the date rather than dragging for it — a *wish*, which only comes
  // true on a window wide enough to hold the control (`useKeyboardEntry`).
  // Kept as the wish rather than as the fact so that narrowing a window puts
  // the rail back and widening it again returns the player to the entry they
  // chose, instead of either silently discarding the preference or leaving a
  // phone with a folded-away field as its only way to answer.
  const [directWanted, setDirectWanted] = useState(false);
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
  const keyboardEntry = useKeyboardEntry();
  const direct = directWanted && keyboardEntry;
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
  // The round on screen, for a reply that arrives after the player has moved
  // on to check itself against.
  const queueHead = useRef<DealtEvent | null>(event);
  queueHead.current = event;

  // Fly to the answer's era once the server has said which one that is — the
  // daily's arrangement (components/daily-game.tsx), now that this game too
  // learns the year a round trip after the guess. The hold is measured from
  // the answer's arrival, after the fold if a typed date had to unfold it.
  useEffect(() => {
    if (!reveal || guessPane === null) return;
    const target = paneForYear(reveal.date.year, panes);
    if (target === guessPane) return;

    const from = guessPane;
    travelTimer.current = window.setTimeout(
      () => {
        setPanMs(panDuration(from, target, panes));
        setPane(target);
      },
      (guessTyped ? RAIL_FOLD_MS : 0) + REVEAL_HOLD_MS,
    );

    return () => {
      if (travelTimer.current !== null) {
        window.clearTimeout(travelTimer.current);
        travelTimer.current = null;
      }
    };
    // `guessTyped` is set in the same batch as `guessPane`, and `panes` is a
    // module constant at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal, guessPane]);

  // Top the queue back up in the background. Keyed on the queue's length rather
  // than on its contents, so playing a round triggers exactly one refill;
  // `refillAttempt` is what lets a failed one be tried again, since a failure
  // leaves the length — and therefore the dependencies — unchanged.
  //
  // **The draw is told what this set has already used.** A refill tops up two
  // rounds at a time, so left to itself each draw knows only what the game is
  // holding — which stops an event repeating *in a row* and does nothing about
  // it coming back on question nine. The pools are a few hundred events and
  // football's is 66, where that put a duplicate in about half of all sets.
  // The exclusion is a preference on the server's side rather than a filter
  // (see `exclude` in lib/db/queries.ts), so a pool too small to honour it
  // still returns a full draw.
  useEffect(() => {
    if (queue.length >= ROUND_QUEUE_TARGET) return;

    let cancelled = false;
    let retry: number | null = null;

    // Everything this set has in play: answered and left behind, plus the
    // rounds still queued ahead of the one on screen. Most recent last, since
    // that is the end `EXCLUDED_EVENT_LIMIT` keeps.
    const dealt = [...played, ...queue.map((held) => held.id)];

    deal(ROUND_QUEUE_DEPTH, dealt.slice(-EXCLUDED_EVENT_LIMIT))
      .then((fresh) => {
        if (cancelled) return;
        setQueue((current) => {
          // Belt and braces for the one case the server cannot honour: a pool
          // with nothing unseen left in it degrades to repeating something, so
          // drop anything already in hand to keep a duplicate out of adjacent
          // rounds. **Never the whole batch**, though — this effect is keyed on
          // the queue's length, so a draw that added nothing would never be
          // retried and the queue would stop growing.
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
    // `deal` is a module-level Server Action reference at every call site, so
    // it is stable; naming it keeps the dependency array honest. `queue` and
    // `played` are read for the exclusion list but deliberately not depended
    // on: a draw already in flight has no reason to be restarted because the
    // player answered a question, and the length is what says a refill is
    // owed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // Two states where there used to be one, because the answer now arrives a
  // round trip after the guess. `locked` is the guess having been made — the
  // rail and the entry stop taking input — and `answered` is the server
  // having graded it, which is what every part of the reveal waits on.
  const locked = guess !== null;
  const answered = reveal !== null;

  // What a typed date may name: the two ends of the rails this game actually
  // shows. On the general timeline that is the whole ruler, which is what the
  // entry already allowed; on a one-pane subject game it is that pane, so a
  // year with nowhere to be marked is refused rather than clamped onto an edge
  // it does not stand for.
  const entryRange = {
    min: paneBounds(panes[0]!).min,
    max: paneBounds(panes[panes.length - 1]!).max,
  };

  /**
   * Whether the era is part of the question at all.
   *
   * Read off the rails rather than passed in: a game whose oldest pane starts
   * after year 1 — football's 1850, and any subject rail added after it — has
   * no BCE year to guess, so the chip's every outcome is `directYear`
   * returning null and the warning underneath. A switch that can only ever be
   * wrong is worse than one that is not there: it invites the press, costs the
   * player a round, and takes half the pill's width to do it. The entry drops
   * it and states the span it does accept instead, which is the film game's
   * own arrangement (`/screen`) generalised to whichever rails it is handed.
   *
   * `> 0` and not `>= 0`: astronomical 0 is 1 BCE, so a rail reaching it does
   * still hold a BCE year.
   */
  const eraHidden = entryRange.min > 0;

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
  async function submit() {
    if (locked || sending || !event) return;

    // Where the guess came from. Dragging has already put the camera and the
    // marker where they belong; a typed date has to be *placed* — and it is
    // placed while the rail is still folded, with the pan at zero, so the
    // camera's jump to another era is spent behind the fold instead of being
    // watched. What unfolds a moment later is a rail that already carries the
    // guess, which is why the fold is also what the reveal below waits on.
    let from = pane;
    let guessed = year;

    if (direct) {
      const typed = directYear(entry, entryRange);
      if (typed === null) {
        setInvalid(true);
        return;
      }

      guessed = typed;
      from = paneForYear(typed, panes);

      setPanMs(0);
      setPane(from);
      move(from, fractionAtYear(from, typed));
    }

    setGuess(guessed);
    setGuessPane(from);
    setGuessTyped(direct);
    setSending(true);
    setFailed(false);

    const round = event;
    try {
      const result = await revealDateRound(round.token, guessed, solo.setId);
      if (!result.ok) throw new Error(result.reason);
      // Only if the round on screen is still the one that was asked about: a
      // reply cannot land on a question the player has moved past.
      if (queueHead.current?.token !== round.token) return;
      setReveal({ date: result.date, tp: result.tp });
      solo.record(result);
    } catch {
      // The guess is handed back rather than kept — an answer that was not
      // graded is not an answer, and the player must never be locked out of
      // a round nothing was recorded for. The same rule as the daily's.
      setGuess(null);
      setGuessPane(null);
      setGuessTyped(false);
      setFailed(true);
    } finally {
      setSending(false);
    }
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
    if (!upcoming || !accuracy || !event) return;

    // Banked here rather than at `submit`, so `results.length` is always the
    // number of questions *left behind* — which makes it the index of the one
    // on screen as well as the score. The set is over when this push fills it,
    // and the round underneath advances anyway: the summary covers a fresh
    // question 1, so "Play again" is a state change with nothing to deal.
    setResults((current) => [...current, timelineResult(accuracy.verdict)]);
    // Banked alongside the verdict, so the next refill can ask for something
    // this set has not already shown. Trimmed to the same limit the draw
    // applies, which only ever bites on a run with no end to it.
    setPlayed((current) => [...current, event.id].slice(-EXCLUDED_EVENT_LIMIT));

    const from = pane;
    const travel =
      from === homePane ? 0 : panDuration(from, homePane, panes);

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
    guess !== null && reveal ? gradeGuess(guess, reveal.date.year, bands) : null;
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
  const answerPane = reveal ? paneForYear(reveal.date.year, panes) : null;
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
  const folded = direct && !locked;
  // A subject game: one rail, no era to name above it, and a masthead of its
  // own in the bar. The two facts travel together — a game that names itself
  // in the bar is exactly the game whose rail has no era heading — so this is
  // the one name the markup below branches on.
  const subject = !railHeading;

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
          // The round underneath has already advanced to a fresh question, so
          // a new set has nothing to deal — but it does start over on which
          // events count as repeats, or a long session would eventually be
          // asking the draw to avoid the whole pool.
          onPlayAgain={() => {
            setResults([]);
            setPlayed([]);
            solo.reset();
          }}
          points={solo.points}
          t={t}
        />
      ) : (
        <>
          {/* The subject games' masthead, in the top bar's own row and out of
              this screen's height budget — the comparison game's pill, which
              is why it is `components/round-head.tsx` rather than a second
              copy of it. It stands in for two things this screen used to
              print in the flow: the rail's pane heading, which on a one-pane
              game was naming the game rather than an era, and the blurb,
              which no date-guessing screen has ever had room for. Only
              rendered where a game asked for one; `/guess` has none, because
              the five-era rail says what that game is. */}
          {headBlurb && (
            <RoundHead
              title={title ?? t.timelineTitle}
              counter={format(t.setProgress, {
                n: Math.min(results.length + 1, QUESTIONS_PER_SET),
                total: QUESTIONS_PER_SET,
              })}
              blurb={headBlurb}
            />
          )}

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
                  tp={reveal?.tp ?? null}
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
              //
              // Null where the masthead above already carries it: two copies
              // of "3 of 10" an inch apart read as two different counts.
              counter={
                headBlurb ? null : (
                  <SetProgress
                    played={results.length}
                    total={QUESTIONS_PER_SET}
                    t={t}
                  />
                )
              }
              // The challenge, for the subject games only, and only on the
              // widths where the result is not painted over the picture. It
              // rides with `RoundVerdict` everywhere else; those games do not
              // show one (see `badge`), and disputing an event's date must
              // not be something only a desktop can do.
              aside={
                subject && answered ? (
                  <div className="min-[1120px]:hidden">
                    <DateChallenge eventId={event.id} t={t} />
                  </div>
                ) : null
              }
              badge={
                accuracy && guess !== null && !subject ? (
                  <RoundVerdict
                    accuracy={accuracy}
                    guess={guess}
                    eventId={event.id}
                    locale={locale}
                    tp={reveal?.tp ?? null}
                    t={t}
                  />
                ) : failed ? (
                  // The slot the verdict will occupy, which is empty until
                  // there is one — so saying so costs the height budget
                  // nothing. The daily's arrangement.
                  <p
                    role="status"
                    className="round-verdict-in absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pb-3 pt-10 text-center text-xs font-semibold text-white/85"
                  >
                    {t.revealFailed}
                  </p>
                ) : null
              }
            />
          </div>

          {/* The row the pane heading gave up, on a subject game.

              It holds the round's result as the lying-down card the
              comparison game ends its rounds on — the same `VerdictDeckRow`,
              so the two screens report a result in the same object rather
              than in two things that merely rhyme. The tier's own colour as a
              block, the word on it in near-black, and two labelled facts: how
              far off, and what was guessed. **No description**: the event's
              note is the other panel's job and there is no room for prose
              between a picture and a rail.

              **Reserved, not conditional.** The box is `h-16` whether or not
              there is a verdict in it, because this screen is a height budget
              and a card that appeared on answering would push the rail it is
              a verdict on down the page. That is the comparison game's rule
              for the same box.

              Hidden from 1120px, where `VerdictFlank` hangs the tall version
              of the same card beside the photograph — the two are never on
              screen together, exactly as `RoundVerdict` and the flanks never
              are. */}
          {subject && (
            <div className="flex h-16 w-full shrink-0 items-center justify-center min-[1120px]:hidden">
              {accuracy && guess !== null && (
                <VerdictDeckRow
                  verdict={accuracy.verdict}
                  tp={reveal?.tp ?? null}
                  facts={[
                    {
                      label: t.distanceTitle,
                      value:
                        accuracy.distance === 0
                          ? t.correct
                          : format(t.yearsOff, {
                              n: formatYearCount(
                                accuracy.distance,
                                locale,
                                dateLabels(t),
                              ),
                            }),
                    },
                    {
                      label: t.yourGuess,
                      value: formatYear(guess, dateLabels(t)),
                    },
                  ]}
                  t={t}
                />
              )}
            </div>
          )}

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
            {/* `-mx-6 px-6` on both boxes: the *clip* reaches 24px further out
                on each side while the content keeps exactly the width it had.

                The two things pinned to the ends of the rail hang past them —
                the end tick label is centred on its own mark and the marker's
                year bubble on the marker — and the pane's own `px-8` was all
                the room they had. 32px covers "10 million" at 13px and not
                "10 millones", so the Spanish cosmos rail lost the first digit
                of its left label to this edge. The page's own `px-6` is the
                24px that fixes it: these two boxes now end on the page
                container's padding box rather than on its content box, which
                is the outermost edge a child can reach without overflowing
                anything. The bubble has a clamp of its own as well
                (`bubbleEdgeShift`), because no amount of margin holds a
                21-character label centred on the end of a 278px rail. */}
            <div className="-mx-6 px-6">
              <div className="rail-fold-inner -mx-6 overflow-hidden px-6">
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
                      // A subject game names itself in the bar's row, so the
                      // rail prints no heading — and with one pane it has no
                      // doors either, so the 96px band that exists to stack a
                      // door pill over the marker's bubble is holding open a
                      // space nothing can occupy.
                      heading={railHeading}
                      compact={subject}
                      fraction={fractions[candidate]}
                      onFractionChange={(next) => move(candidate, next)}
                      answered={locked}
                      // The marker belongs to the pane it was placed in. Showing one on
                      // the answer's pane too would read as a second guess.
                      showGuess={!locked || guessPane === candidate}
                      // A typed date is exact, and the year this rail reads back
                      // at that position is snapped to the pane's grid — so the
                      // bubble is told the player's own number rather than
                      // deriving one that may be a hundred years off it.
                      guessYear={
                        guessTyped && guessPane === candidate ? guess : null
                      }
                      answerYear={
                        answerPane === candidate && reveal ? reveal.date.year : null
                      }
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
                        answerYear: reveal?.date.year ?? null,
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

              **Below `md` there is nothing in the row but the button.** The
              entry and its switch are a desktop control now
              (`useKeyboardEntry`): the entry took a row of its own on a
              phone, out of a screen that is one viewport and must not
              scroll, to hold a field whose keypad covers the game the moment
              it is focused. With both gone the grid collapses to one centred
              cell and the advance button is the column's own centre — which
              is what `md:grid-cols-…` is for, and why the sides are declared
              at that breakpoint rather than at every width.

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
              className="entry-shell hidden md:block md:justify-self-end"
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
                    disabled={locked}
                    invalid={invalid}
                    shown={direct}
                    focusDelayMs={RAIL_FOLD_MS}
                    // On a rail that starts after year 1 the era is not a
                    // question, so the pill is a field for a number and the
                    // empty field names the span it will take — rather than
                    // waiting to refuse a year outside it.
                    eraHidden={eraHidden}
                    placeholder={
                      eraHidden
                        ? `${entryRange.min}\u2013${entryRange.max}`
                        : undefined
                    }
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
            <div className="flex items-center justify-center gap-3 md:contents">
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
                    // Never disabled, like the advance button: a press while a
                    // guess is in flight is simply ignored by `submit`.
                    aria-busy={sending}
                    className={`${ROUND_BUTTON} bg-ink text-page hover:opacity-85 ${
                      sending ? "cursor-progress opacity-70" : ""
                    }`}
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
                    className={`${ROUND_BUTTON} relative border border-white/45 bg-black/45 text-ink backdrop-blur-md hover:bg-black/65 ${
                      pendingNext ? "cursor-progress opacity-60" : ""
                    }`}
                  >
                    {lastQuestion ? t.seeResults : t.nextRound}
                    {/* The home board's loading trace, run around the button
                        instead of around a card (`.round-trace` in
                        app/globals.css). Mounted only while the press is
                        latched, so the comet starts from the top every time
                        rather than rejoining a lap that has been running
                        invisibly. */}
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
                  it stays centred. There is nothing to switch to mid-reveal
                  anyway: the rail is back on screen carrying the answer. */}
              <div
                className={`hidden transition-opacity duration-300 md:block md:ml-3 md:justify-self-start ${
                  locked ? "opacity-0" : "opacity-100"
                }`}
                inert={locked || !keyboardEntry}
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
