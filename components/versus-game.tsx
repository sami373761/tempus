"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import {
  answerVersusRematch,
  fetchMatchView,
  joinVersusMatch,
  requestVersusRematch,
  setMatchReady,
  submitVersusGuess,
} from "@/app/actions/versus";
import {
  DateEntry,
  InputModeToggle,
  useKeyboardEntry,
} from "@/components/date-entry";
import { RoundTimer } from "@/components/round-timer";
import { SetProgress, SUMMARY_BUTTON } from "@/components/set-summary";
import { TimelineBackdrop } from "@/components/timeline-backdrop";
import {
  openingFractions,
  panDuration,
  PAN_MS,
  PosterCard,
  RAIL_FOLD_MS,
  REVEAL_HOLD_MS,
  RoundCard,
  ROUND_BUTTON,
  ROUND_BUTTON_LG,
  railGap,
  TimelinePaneView,
} from "@/components/timeline-stage";
import { VersusLobby, Waiting } from "@/components/versus-lobby";
import type { SupportedLocale } from "@/lib/db/types";
import {
  directYear,
  EMPTY_DATE_ENTRY,
  type DateEntryValue,
} from "@/lib/game/date-entry";
import {
  applyMatchRow,
  matchOutcome,
  otherSeat,
  revealedRound,
  versusModeSpec,
  type MaskedEvent,
  type MatchView,
  type RoundResult,
  type Seat,
  type SeatAnswer,
  type VersusModeSpec,
} from "@/lib/game/versus";
import {
  entryFraction,
  fractionAtYear,
  paneBounds,
  paneForYear,
  type TimelinePane,
  yearAtFraction,
} from "@/lib/game/timeline";
import { VERDICT_COLORS, VERDICT_LABEL_KEYS } from "@/lib/game/verdict-style";
import { formatYear } from "@/lib/historical-date";
import { subscribeToMatch } from "@/lib/realtime/match-channel";
import { dateLabels, format, type Dict } from "@/lib/i18n/dictionary";

/**
 * The two-player date-guessing game.
 *
 * It is a solo game's screen with a second person in it, and that is meant
 * literally: the backdrop, the picture, the ruler, the marker, the typed-date
 * entry and the button are all the same components the solo games draw
 * (components/timeline-stage.tsx, components/date-entry.tsx). What this file
 * adds is only what a second player makes necessary — a countdown, a wait, a
 * shared result, a rematch.
 *
 * **Which solo game depends on the match.** A match names the pool it is
 * played over (`match.mode`), and that one fact brings a rail, a tolerance
 * ladder and a layout with it — see `VERSUS_MODE_SPEC` in lib/game/versus.ts.
 * The general library and football are the one-column stage; film &
 * television is the poster split, because a 2:3 poster in a one-column game is
 * either cropped to a letterbox or leaves no room for a ruler (the argument is
 * written out in full on `ScreenGame`). So there are two round bodies below
 * and they are the two the solo side already has, with the head-to-head
 * chrome dropped into the slots those layouts already reserve for chrome: the
 * countdown in the card's top-right corner, the score beside the progress
 * counter, the result over the picture's foot.
 *
 * **It renders state; it does not own it.** Every decision in a match is made
 * in Postgres (supabase/migrations/20261005120000_versus_matches.sql) and
 * reaches this component as a `MatchView`. There is no local idea of whose
 * turn it is, whether a guess was in time, or when a round ends — which is
 * what keeps two browsers showing the same game. The three ways state arrives:
 *
 *   1. A **push** on the Realtime channel, whenever the row changes. This is
 *      the normal path and it is not a poll.
 *   2. A **fetch**, on mount, on reconnect, and when a new round needs its
 *      (answer-free) question. The pushed row deliberately cannot carry the
 *      question — see lib/realtime/match-channel.ts.
 *   3. A **prompt**, when this client's countdown reaches zero. It does not
 *      decide the round is over; it asks the server to look at its own clock.
 *      Both clients prompt, so one of them leaving does not stall the match,
 *      and the server is idempotent about being asked twice.
 *
 * **The seat lives in `sessionStorage`, which is per tab.** There are no
 * accounts here, so a seat is a bearer token the client keeps. Per tab rather
 * than per browser is deliberate twice over: it survives a reload, which is
 * the reconnect case that actually matters; and it lets two tabs on one
 * machine play each other, which is the only way to try this mode out without
 * two devices. The cost is that closing the tab gives the seat up — that is a
 * real limitation, and it is why the opponent's clock keeps running rather
 * than the match ending.
 *
 * **Where the guess lives.** The match state is here; the *rail* state — which
 * era is on camera, where each marker stands, whether the player is typing the
 * date rather than dragging for it — belongs to whichever round body is on
 * screen. That split is what lets the two layouts differ in everything except
 * the one thing they must agree on: a round is answered by handing a year to
 * `submit`, and nothing downstream of it knows which layout, or which of the
 * two inputs, produced it.
 */

/** How often the countdown repaints. Fine enough that the ring moves smoothly. */
const TICK_MS = 100;

/**
 * How long to wait before prompting the server again about a deadline that is
 * still passed.
 *
 * A prompt used to be latched once per (generation, round, phase) to stop the
 * tick calling ten times a second. But the prompt is the only thing that moves
 * a match whose opponent has gone quiet, and latching it made every way of
 * losing one permanent: a dropped request, a dev server mid-rebuild, or a
 * prompt that simply arrived before the database's own clock agreed the
 * deadline had passed — which `versus_reconcile` correctly treats as nothing
 * to do. One missed prompt and the round sat at "next round in 0" forever,
 * with nothing on screen to say so.
 *
 * A second is slow enough not to be polling and fast enough that the stall is
 * never seen. It only ever fires in a state that should not persist, so there
 * is deliberately no attempt cap: giving up is the failure mode being fixed.
 */
const PROMPT_RETRY_MS = 1000;

export function VersusGame({
  code,
  t,
  locale,
}: {
  code: string;
  t: Dict;
  locale: SupportedLocale;
}) {
  const [session, setSession] = useState<StoredSeat | null>(null);
  const [view, setView] = useState<MatchView | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [opponentOnline, setOpponentOnline] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Server clock minus this browser's clock, measured NTP-style on a real
  // request (see `refresh`). Every deadline on screen is rendered through it,
  // so a player whose laptop clock is ten minutes out still sees the same
  // twenty seconds as their opponent.
  const clockOffset = useRef(0);

  // The last prompt sent, as (generation, round, phase) and when. A stamp
  // rather than a latch, so a prompt that fails or lands early is retried —
  // see PROMPT_RETRY_MS.
  const prompted = useRef<{ key: string; at: number } | null>(null);
  // One question fetch per round, with the key cleared on failure so a
  // dropped request is retried rather than leaving a blank card.
  const fetchedRound = useRef<string | null>(null);

  /**
   * Fold a freshly fetched view in.
   *
   * A fetch can land after a push that is newer — the socket and the HTTP
   * request are two races against each other — so the version decides. The
   * questions are merged either way: they are the one thing a push never
   * carries, so a stale fetch is still the only source for them.
   */
  const adopt = useCallback((next: MatchView) => {
    setView((current) => {
      if (!current) return next;
      const events = { ...current.events, ...next.events };
      return next.version < current.version
        ? { ...current, events }
        : { ...next, events };
    });
  }, []);

  /** Ask the server where the match is, and re-measure the clock while at it. */
  const refresh = useCallback(
    async (seat: StoredSeat) => {
      const sent = Date.now();
      const result = await fetchMatchView(seat.matchId, seat.token);
      const received = Date.now();
      if (!result.ok) return result.reason;

      // Halfway through the round trip is the server's best-known instant
      // here, which removes the latency that would otherwise read as the
      // client being behind — and would quietly shorten every countdown.
      clockOffset.current = result.view.serverNow - (sent + received) / 2;
      adopt(result.view);
      return null;
    },
    [adopt],
  );

  /* --- joining ---------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let seat = readSeat(code);

      // A stored seat that the server does not recognise is a seat from a
      // match that has since been swept. Drop it and come in as a new player
      // rather than stranding the tab on an error.
      if (seat) {
        const problem = await refresh(seat);
        if (cancelled) return;
        if (!problem) {
          setSession(seat);
          return;
        }
        if (problem === "forbidden" || problem === "not-found") {
          clearSeat(code);
          seat = null;
        } else {
          setFatal(t.versusCreateFailed);
          return;
        }
      }

      const joined = await joinVersusMatch(code);
      if (cancelled) return;

      if (!joined.ok) {
        setFatal(joinMessage(joined.reason, t));
        return;
      }

      const fresh: StoredSeat = {
        matchId: joined.matchId,
        token: joined.token,
        seat: joined.seat,
      };
      writeSeat(code, fresh);

      const problem = await refresh(fresh);
      if (cancelled) return;
      if (problem) {
        setFatal(t.versusCreateFailed);
        return;
      }
      setSession(fresh);
    })();

    return () => {
      cancelled = true;
    };
  }, [code, refresh, t]);

  /* --- the live channel -------------------------------------------------- */

  useEffect(() => {
    if (!session) return;

    return subscribeToMatch(session.matchId, session.seat, {
      onRow: (row) =>
        setView((current) => (current ? applyMatchRow(current, row) : current)),
      onOpponentPresence: setOpponentOnline,
      onConnected: setConnected,
    });
  }, [session]);

  // Anything that changed while the socket was down was never delivered and
  // is never replayed, so coming back up has to be followed by a read.
  const wasConnected = useRef(false);
  useEffect(() => {
    if (!session) return;
    if (connected && !wasConnected.current) void refresh(session);
    wasConnected.current = connected;
  }, [connected, session, refresh]);

  /* --- the clock --------------------------------------------------------- */

  const timed = view?.phase === "playing" || view?.phase === "revealed";

  useEffect(() => {
    if (!timed) return;
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [timed]);

  const serverNow = now + clockOffset.current;
  const deadline =
    view?.phase === "playing"
      ? view.roundDeadlineAt
      : view?.phase === "revealed"
        ? view.revealUntilAt
        : null;

  useEffect(() => {
    if (!session || !view || deadline === null) return;
    if (serverNow < deadline) return;

    // Throttled on the browser's own clock, not the corrected one: this is
    // about how often to send a request, and an offset that is wrong is one
    // of the things being recovered from.
    const key = `${view.generation}:${view.currentIdx}:${view.phase}`;
    const last = prompted.current;
    if (last && last.key === key && now - last.at < PROMPT_RETRY_MS) return;
    prompted.current = { key, at: now };

    void refresh(session);
  }, [now, serverNow, deadline, session, view, refresh]);

  /* --- questions --------------------------------------------------------- */

  const currentIdx = view?.currentIdx ?? 0;
  const generation = view?.generation ?? 0;

  // The prompt stamp belongs to one round and would otherwise throttle the
  // next one's first prompt by up to a second.
  useEffect(() => {
    prompted.current = null;
  }, [generation, currentIdx]);

  useEffect(() => {
    if (!session || !view) return;
    if (view.phase !== "playing" && view.phase !== "revealed") return;

    const haveCurrent = view.events[view.currentIdx] !== undefined;
    const last = view.currentIdx + 1 >= view.totalRounds;
    const haveNext = last || view.events[view.currentIdx + 1] !== undefined;
    if (haveCurrent && haveNext) return;

    const key = `${view.generation}:${view.currentIdx}`;
    if (fetchedRound.current === key) return;
    fetchedRound.current = key;

    void refresh(session).then((problem) => {
      if (problem) fetchedRound.current = null;
    });
  }, [session, view, refresh]);

  // Next round's picture, pulled while this one is still being played.
  const upcomingUrl = view?.events[currentIdx + 1]?.image?.url;
  useEffect(() => {
    if (!upcomingUrl) return;
    const preload = new window.Image();
    preload.src = upcomingUrl;
  }, [upcomingUrl]);

  /* --- moves ------------------------------------------------------------- */

  /**
   * Lock a year in.
   *
   * Takes the year rather than reading it off a rail, because the two layouts
   * keep their rails differently and both can also be answered by typing. The
   * boolean is what the caller needs to know: `false` means the round is still
   * live and the marker should come back off, and it is deliberately only
   * returned for a *hard* failure — "closed" and "stale" are not failures,
   * they are the server having got there first, and the marker stays where the
   * player put it.
   */
  const submit = useCallback(
    async (year: number): Promise<boolean> => {
      if (!session || !view || view.phase !== "playing") return false;

      const result = await submitVersusGuess(
        session.matchId,
        session.token,
        view.currentIdx,
        year,
      );

      if (!result.ok) return false;
      adopt(result.view);
      return true;
    },
    [session, view, adopt],
  );

  async function ready() {
    if (!session || busy) return;
    setBusy(true);
    const result = await setMatchReady(session.matchId, session.token, true);
    if (result.ok) adopt(result.view);
    setBusy(false);
  }

  async function askRematch() {
    if (!session || busy) return;
    setBusy(true);
    const result = await requestVersusRematch(session.matchId, session.token);
    if (result.ok) adopt(result.view);
    setBusy(false);
  }

  async function answerRematch(accept: boolean) {
    if (!session || busy) return;
    setBusy(true);
    const result = await answerVersusRematch(
      session.matchId,
      session.token,
      accept,
    );
    if (result.ok) adopt(result.view);
    setBusy(false);
  }

  /* --- render ------------------------------------------------------------ */

  if (fatal) return <FatalNotice message={fatal} t={t} />;
  if (!view) return <LoadingNotice label={t.versusJoining} />;

  const spec = versusModeSpec(view.mode);
  const event = view.events[view.currentIdx] ?? null;
  const revealed = revealedRound(view);

  const remainingMs = deadline === null ? 0 : deadline - serverNow;
  const secondsLeft = Math.max(0, Math.ceil(remainingMs / 1000));

  // Whether one of the two round bodies is what is on screen. A match in a
  // playing phase whose question has not arrived yet is *not* — the fetch for
  // it is in flight — and that gap is why this is one flag rather than a test
  // on the phase: the round bodies draw their own backdrop, so a phase-only
  // test left the "starting..." moment with none at all, i.e. a black page.
  const showRound =
    event !== null &&
    view.phase !== "lobby" &&
    view.phase !== "complete" &&
    view.phase !== "abandoned";

  const round = { view, spec, event, revealed, remainingMs, secondsLeft, onSubmit: submit, t, locale };

  return (
    // The game's own container, not the page's: the two layouts want different
    // widths — the poster split reads the site bar's full `max-w-7xl` so the
    // poster's left edge lands under the wordmark, and the one-column stage
    // keeps the `max-w-6xl` `/guess` uses. The page above owns the one-viewport
    // box; this owns how wide the game is inside it.
    <div
      className={`mx-auto flex min-h-0 w-full flex-1 flex-col ${
        spec.layout === "poster"
          ? "max-w-7xl px-6 pb-5 pt-5"
          : "max-w-6xl px-6 pb-6 pt-2"
      }`}
    >
      {/* The backdrop belongs to whatever is on screen. The round bodies draw
          their own, because theirs follows the camera; everything else is the
          mode's home era, held still. */}
      {!showRound && (
        <TimelineBackdrop pane={spec.homePane} panes={spec.panes} />
      )}

      {view.phase === "lobby" ? (
        <VersusLobby view={view} onReady={ready} busy={busy} t={t} />
      ) : view.phase === "complete" || view.phase === "abandoned" ? (
        <VersusSummary
          view={view}
          onRematch={askRematch}
          onAnswerRematch={answerRematch}
          busy={busy}
          t={t}
        />
      ) : event === null ? (
        <LoadingNotice label={t.versusStarting} />
      ) : spec.layout === "poster" ? (
        <PosterRound key={view.mode} {...round} event={event} />
      ) : (
        <StageRound key={view.mode} {...round} event={event} />
      )}

      {/* Advisory only: the match never pauses for a missing opponent, it just
          says so. Hidden in the lobby, where "not here yet" is the screen's
          whole subject and this would be saying it twice. */}
      {view.phase !== "lobby" && !opponentOnline && (
        <p className="pointer-events-none fixed inset-x-0 bottom-3 z-30 text-center text-[11px] text-white/45">
          {connected ? t.versusOpponentOffline : t.versusReconnecting}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
   The round, in each of the two layouts
   ------------------------------------------------------------------------- */

interface RoundProps {
  view: MatchView;
  spec: VersusModeSpec;
  event: MaskedEvent;
  revealed: RoundResult | null;
  remainingMs: number;
  secondsLeft: number;
  onSubmit: (year: number) => Promise<boolean>;
  t: Dict;
  locale: SupportedLocale;
}

/** The player's answer to the live round, as the rail has to draw it. */
interface RailGuess {
  year: number;
  /** Which rail it was made on, which is not always the one on camera later. */
  pane: TimelinePane;
  /**
   * Whether it was typed rather than dragged for. The marker's bubble has to
   * quote the player's own number: the year the rail reads back at that
   * position is snapped to the pane's grid, which on the deep panes is a step
   * of a hundred years.
   */
  typed: boolean;
}

/**
 * The one-column round: picture, rail, button — the general library's game and
 * football's, with a countdown in the corner.
 *
 * Everything about the camera lives here rather than in `VersusGame`, because
 * it is the same thing `TimelineGame` keeps and for the same reasons: a round
 * opens at the mode's home era, a locked-in guess holds for a beat and then
 * flies to the era the answer is in, and every pane remembers where its own
 * marker was left.
 */
function StageRound({
  view,
  spec,
  event,
  revealed,
  remainingMs,
  secondsLeft,
  onSubmit,
  t,
  locale,
}: RoundProps) {
  const { panes, homePane } = spec;

  const [pane, setPane] = useState<TimelinePane>(homePane);
  const [fractions, setFractions] = useState<Record<TimelinePane, number>>(() =>
    openingFractions(panes, homePane),
  );
  const [panMs, setPanMs] = useState(PAN_MS);
  const [guess, setGuess] = useState<RailGuess | null>(null);
  // Typing the date rather than dragging for it. A preference, not a round's
  // state: a player who wanted to type one date almost certainly wants to type
  // the next.
  // Typing the year rather than dragging — a *wish*, granted only where there
  // is room for the control. See `useKeyboardEntry`: below `md` the entry
  // takes a row of its own out of a screen that must not scroll, to hold a
  // field whose keypad covers the match.
  const [directWanted, setDirectWanted] = useState(false);
  const keyboardEntry = useKeyboardEntry();
  const direct = directWanted && keyboardEntry;
  const [entry, setEntry] = useState<DateEntryValue>(EMPTY_DATE_ENTRY);
  const [invalid, setInvalid] = useState(false);

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

  // The pane, readable from an effect without taking it as a dependency.
  //
  // The two effects below need to know where the camera *is* in order to
  // decide how far it has to fly, but neither should re-run when it moves —
  // they are triggered by the round changing and by the round closing. A ref
  // is how that is expressed. (Reading it out of a `setPane` updater instead
  // would be worse than untidy: React invokes updaters twice in development,
  // so the timers scheduled inside one get scheduled twice and only one of
  // them can be cleared.)
  const paneRef = useRef(pane);
  useEffect(() => {
    paneRef.current = pane;
  }, [pane]);

  const generation = view.generation;
  const currentIdx = view.currentIdx;

  // A new round resets the rails and flies the camera home, exactly as
  // `advance` does in the solo game — and for the same reason the solo game
  // splits it in two: the pane being landed on is reset now because it is
  // off-camera, and the rest only once the journey is over, or the flight
  // passes visibly jumping markers.
  useEffect(() => {
    setGuess(null);
    setInvalid(false);
    // **Both halves are cleared, era included.** The era used to be carried
    // over on the grounds that it was an opinion about the round rather than
    // an answer to it. It is not: a player who typed a BCE year last round
    // types "1492" into a pill that still says BCE and locks in 1492 BCE,
    // which is the one way this control can take a guess the player did not
    // make. A fresh round asks a fresh question, so it starts at the entry's
    // own zero (`EMPTY_DATE_ENTRY`) — CE, empty — and a BCE answer costs the
    // one press it costs on the first round of a set.
    setEntry(EMPTY_DATE_ENTRY);

    const from = paneRef.current;
    const travel = from === homePane ? 0 : panDuration(from, homePane, panes);

    if (travelTimer.current !== null) window.clearTimeout(travelTimer.current);
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);

    setFractions((current) => ({ ...current, [homePane]: 0.5 }));
    if (travel > 0) setPanMs(travel);
    setPane(homePane);

    resetTimer.current = window.setTimeout(() => {
      resetTimer.current = null;
      setFractions(openingFractions(panes, homePane));
    }, travel);
    // Keyed on the round, not on the view: this must run once when the
    // question changes and never on an unrelated state push.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation, currentIdx]);

  // Put the player's own marker back after a reload.
  //
  // `guess` is how this component normally knows where the marker goes, and a
  // reload throws it away — so a player who answered and then refreshed met a
  // locked rail with nothing on it, and then a result quoting a guess that was
  // nowhere on screen. The server knows their guess (it is their own, so the
  // view carries it); this puts the rail back where they left it.
  useEffect(() => {
    if (view.yourGuess === null || guess !== null) return;

    const year = view.yourGuess;
    const home = paneForYear(year, panes);

    // The round-change effect above has just scheduled the rails back to
    // their opening positions, which is right for a round that is starting
    // and wrong for one this player has already answered. Cancelling it is
    // what makes the restore stick.
    if (resetTimer.current !== null) {
      window.clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }

    setPanMs(0);
    setPane(home);
    setGuess({ year, pane: home, typed: false });
    setFractions((current) => ({
      ...current,
      [home]: fractionAtYear(home, year),
    }));
  }, [view.yourGuess, guess, panes]);

  // The answer is on a rail that may be four eras away, so the camera travels
  // to it when the round closes — the solo game's reveal, on the server's cue
  // rather than on this player's.
  useEffect(() => {
    if (!revealed) return;

    const from = paneRef.current;
    const target = paneForYear(revealed.year, panes);
    if (target === from) return;

    if (travelTimer.current !== null) window.clearTimeout(travelTimer.current);
    travelTimer.current = window.setTimeout(() => {
      travelTimer.current = null;
      setPanMs(panDuration(from, target, panes));
      setPane(target);
    }, REVEAL_HOLD_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed?.idx, revealed?.year, generation]);

  const answered = guess !== null || view.youAnswered;
  // The rail folds away while a date is being typed and comes back for the
  // reveal, exactly as `/guess` folds it — so it is the *unanswered* half of
  // direct mode that has no rail. The phase is part of the test because this
  // screen has a state the solo game does not: a round that closed on the
  // clock with nothing typed, where an empty folded rail would hide the answer
  // about to be marked on it.
  const folded = direct && !answered && view.phase === "playing";

  // What a typed date may name: the two ends of the rails this mode shows.
  const entryRange = {
    min: paneBounds(panes[0]!).min,
    max: paneBounds(panes[panes.length - 1]!).max,
  };

  function move(nextPane: TimelinePane, nextFraction: number) {
    setFractions((current) => ({ ...current, [nextPane]: nextFraction }));
  }

  function enter(nextPane: TimelinePane) {
    move(nextPane, entryFraction(nextPane, pane, panes));
    setPanMs(PAN_MS);
    setPane(nextPane);
  }

  async function lockIn() {
    if (answered || view.phase !== "playing") return;

    // Where the guess came from. Dragging has already put the camera and the
    // marker where they belong; a typed date has to be *placed*, and it is
    // placed while the rail is still folded, with the pan at zero, so the
    // camera's jump to another era is spent behind the fold instead of being
    // watched.
    let from = pane;
    let year = yearAtFraction(pane, fractions[pane]);

    if (direct) {
      const typed = directYear(entry, entryRange);
      if (typed === null) {
        setInvalid(true);
        return;
      }

      year = typed;
      from = paneForYear(typed, panes);

      setPanMs(0);
      setPane(from);
      move(from, fractionAtYear(from, typed));
    }

    setGuess({ year, pane: from, typed: direct });
    if (!(await onSubmit(year))) setGuess(null);
  }

  const answerPane = revealed ? paneForYear(revealed.year, panes) : null;
  const guessPane = guess?.pane ?? null;
  const answerDelayMs =
    guessPane === null || answerPane === null || guessPane === answerPane
      ? 0
      : REVEAL_HOLD_MS + panDuration(guessPane, answerPane, panes);

  const them = otherSeat(view.seat);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-4 sm:gap-5">
      <TimelineBackdrop pane={pane} panes={panes} />

      <RoundCard
        event={event}
        t={t}
        // The picture grows into the room the rail gives up, so folding it
        // away leaves no hole in the column and the button below does not
        // move.
        wide={folded}
        counter={<MatchCounters view={view} t={t} />}
        aside={
          view.phase === "playing" ? (
            <RoundTimer
              remainingMs={remainingMs}
              totalMs={view.roundSeconds * 1000}
              label={format(t.versusSecondsLeft, { n: secondsLeft })}
            />
          ) : null
        }
        badge={
          revealed ? (
            <RoundOutcome round={revealed} you={view.seat} locale={locale} t={t} />
          ) : answered ? (
            <WaitingBadge label={t.versusWaitingForOpponent} />
          ) : null
        }
      />

      {/* The rail, and the fold that takes it away when the player would
          rather type the date — the same three boxes `/guess` uses, and the
          same `.rail-fold` rule in app/globals.css. `inert` rather than a
          conditional render, so the band has a closing frame to animate and a
          folded rail's slider and era doors are off the tab order. */}
      <div className="rail-fold w-full shrink-0" data-folded={folded} inert={folded}>
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
                  showGuess={!answered || guessPane === candidate}
                  // A typed date is exact, and the year this rail reads back at
                  // that position is snapped to the pane's grid — so the bubble
                  // is told the player's own number.
                  guessYear={
                    guess?.typed && guessPane === candidate ? guess.year : null
                  }
                  answerYear={
                    answerPane === candidate && revealed ? revealed.year : null
                  }
                  answerDelayMs={answerDelayMs}
                  // This pane's share of the distance between your marker and
                  // the truth — several rails' worth when the two are eras
                  // apart. Same helper the solo game uses, so the two modes
                  // report a wrong era the same way.
                  gap={
                    revealed
                      ? railGap({
                          pane: candidate,
                          guessPane,
                          guessFraction:
                            guessPane === null ? 0 : fractions[guessPane],
                          answerPane,
                          answerYear: revealed.year,
                          answerDelayMs,
                          panes,
                        })
                      : null
                  }
                  // Your own verdict, not the round's: the gap is the distance
                  // between your marker and the truth, so it is painted in the
                  // tier that distance earned you.
                  gapColor={
                    revealed
                      ? VERDICT_COLORS[revealed.seats[view.seat].verdict]
                      : null
                  }
                  opponentYear={
                    revealed && paneFor(revealed.seats[them].guess, panes) === candidate
                      ? revealed.seats[them].guess
                      : null
                  }
                  opponentLabel={t.versusThemLabel}
                  locale={locale}
                  t={t}
                  onEnter={enter}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <RoundControls
        phase={view.phase}
        answered={answered}
        secondsLeft={secondsLeft}
        direct={direct}
        onDirect={() => {
          setDirectWanted((current) => !current);
          setInvalid(false);
        }}
        entry={entry}
        onEntry={(next) => {
          setEntry(next);
          setInvalid(false);
        }}
        invalid={invalid}
        onSubmit={lockIn}
        eraHidden={!spec.eraInEntry}
        entryPlaceholder={
          spec.eraInEntry
            ? undefined
            : `${entryRange.min}–${entryRange.max}`
        }
        // The entry opens into the room the rail gives up, so focusing it has
        // to wait for the fold exactly as it does in the solo game.
        focusDelayMs={RAIL_FOLD_MS}
        size="sm"
        t={t}
      />
    </div>
  );
}

/**
 * The poster round: film & television, head to head.
 *
 * The solo screen with a second player in it, down to the geometry — the
 * three custom properties below are `ScreenGame`'s own and are kept in step
 * with it, because the thing they decide is the same thing: the poster's
 * width sets its height, and its height is the height of the row the right-hand
 * column stands in.
 *
 * What the second player adds lands in slots this layout already had. The
 * countdown and the score go in the head beside the progress counter, where
 * the solo game has the counter alone; the round's result goes over the
 * poster's foot, which is where the solo game paints its verdict on a narrow
 * screen. The one thing that goes rather than moves is the result row under
 * the controls: it exists in the solo game to hold the verdict card and the
 * note about the event, and a match has neither — both players' answers are
 * one strip, and it belongs on the picture they are both looking at.
 */
function PosterRound({
  view,
  spec,
  event,
  revealed,
  remainingMs,
  secondsLeft,
  onSubmit,
  t,
  locale,
}: RoundProps) {
  const pane = spec.homePane;
  const panes = spec.panes;
  const bounds = paneBounds(pane);

  // One rail, so one position — the stage round needs a record keyed by pane
  // because panning away and back must not lose the marker, and there is
  // nowhere to pan to here.
  const [fraction, setFraction] = useState(0.5);
  const [guess, setGuess] = useState<number | null>(null);
  // Typing the year rather than dragging — a *wish*, granted only where there
  // is room for the control. See `useKeyboardEntry`: below `md` the entry
  // takes a row of its own out of a screen that must not scroll, to hold a
  // field whose keypad covers the match.
  const [directWanted, setDirectWanted] = useState(false);
  const keyboardEntry = useKeyboardEntry();
  const direct = directWanted && keyboardEntry;
  const [entry, setEntry] = useState<DateEntryValue>(EMPTY_DATE_ENTRY);
  const [invalid, setInvalid] = useState(false);

  const generation = view.generation;
  const currentIdx = view.currentIdx;

  useEffect(() => {
    setGuess(null);
    setFraction(0.5);
    setInvalid(false);
    // Cleared whole, era included — see the note on the other seat's reset.
    setEntry(EMPTY_DATE_ENTRY);
  }, [generation, currentIdx]);

  // Put the player's own marker back after a reload — see the stage round.
  useEffect(() => {
    if (view.yourGuess === null || guess !== null) return;
    setGuess(view.yourGuess);
    setFraction(fractionAtYear(pane, view.yourGuess));
  }, [view.yourGuess, guess, pane]);

  const answered = guess !== null || view.youAnswered;
  const typed = direct ? directYear(entry, bounds) : null;

  // While a year is being typed the marker follows it, which is what makes
  // keeping the rail on screen worth doing. It falls back to wherever the
  // marker was left as soon as the field is empty or holds a year off the
  // rail, rather than jumping to an edge.
  const railFraction =
    direct && !answered && typed !== null
      ? fractionAtYear(pane, typed)
      : fraction;

  async function lockIn() {
    if (answered || view.phase !== "playing") return;

    let year = yearAtFraction(pane, railFraction);

    if (direct) {
      if (typed === null) {
        setInvalid(true);
        return;
      }
      // The marker is already standing on the typed year — it has been
      // tracking the field — so this only makes that position the one the
      // round keeps.
      year = typed;
      setFraction(fractionAtYear(pane, year));
    }

    setGuess(year);
    if (!(await onSubmit(year))) setGuess(null);
  }

  const them = otherSeat(view.seat);
  const overlay = revealed !== null || answered;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      {/* One pane, so there is nothing to crossfade — it holds for the whole
          match. */}
      <TimelineBackdrop pane={pane} panes={panes} />

      <div
        // Kept in step with `ScreenGame`'s copy: the poster's width decides
        // its height, and its height decides where the bottom of the column
        // beside it falls. `--result-h` is not needed here — this layout has
        // no result row, because a match's result is a strip on the picture.
        style={
          {
            "--poster-w": "clamp(15rem, 27vw, 26rem)",
            "--poster-h": "calc(var(--poster-w) * 1.5)",
          } as React.CSSProperties
        }
        className="flex min-h-0 flex-1 flex-col gap-4 min-[1120px]:grid min-[1120px]:h-[var(--poster-h)] min-[1120px]:max-h-full min-[1120px]:flex-none min-[1120px]:grid-cols-[var(--poster-w)_minmax(0,1fr)] min-[1120px]:gap-7"
      >
        <PosterCard
          event={event}
          // At every width, not just the narrow one the solo game hides it at:
          // the match's result and its wait are both painted here, and a title
          // under either of them is two strings on top of each other.
          titleHidden={overlay}
          badge={
            revealed ? (
              <RoundOutcome
                round={revealed}
                you={view.seat}
                locale={locale}
                t={t}
              />
            ) : answered ? (
              <WaitingBadge label={t.versusWaitingForOpponent} />
            ) : null
          }
          t={t}
        />

        <div className="mx-auto flex w-full min-h-0 max-w-5xl flex-col">
          <div className="flex shrink-0 items-start justify-between gap-4 px-8 pt-1 sm:px-12">
            <div className="min-w-0">
              <h2 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
                {t[spec.titleKey]}
              </h2>
              {/* Not a flourish: the stored year is a release for a film and a
                  premiere for a series, and a player shown the poster of a show
                  that ran eight years has to be told which of the two is being
                  asked. See lib/game/screen.ts. */}
              <p className="on-photo mt-1 text-sm leading-snug text-white/60">
                {t.screenYearAsked}
              </p>
            </div>

            {/* The head-to-head chrome, in the corner the solo game keeps for
                the progress counter: the counter, the score, and the clock.
                The timer is last and largest, which is the order it is read
                in once the round is running. */}
            <div className="flex shrink-0 items-center gap-2.5 pt-0.5">
              <div className="flex flex-col items-end gap-1.5">
                <SetProgress
                  played={view.currentIdx}
                  total={view.totalRounds}
                  size="md"
                  t={t}
                />
                <ScorePill view={view} t={t} />
              </div>
              <div
                className={`transition-opacity duration-300 ${
                  view.phase === "playing" ? "opacity-100" : "opacity-0"
                }`}
              >
                <RoundTimer
                  remainingMs={remainingMs}
                  totalMs={view.roundSeconds * 1000}
                  label={format(t.versusSecondsLeft, { n: secondsLeft })}
                />
              </div>
            </div>
          </div>

          {/* The rail, at the foot of whatever the column has left over rather
              than centred in it: the button under it is the answer to the rail,
              and half the slack standing between the two reads as a gap between
              two unrelated rows. See `ScreenGame` for the rest of the note. */}
          <div className="flex min-h-fit flex-1 items-end">
            <TimelinePaneView
              pane={pane}
              panes={panes}
              active
              compact
              heading={false}
              fraction={railFraction}
              onFractionChange={setFraction}
              answered={answered}
              // Shown but not draggable while a year is being typed: the marker
              // is the readout of the field, so it must not also be something
              // the pointer can move.
              locked={direct && !answered}
              showGuess
              guessYear={direct && typed !== null ? typed : null}
              answerYear={revealed ? revealed.year : null}
              answerDelayMs={0}
              // One pane, so the distance between the guess and the truth is
              // always the ordinary same-rail case: one bar between two
              // markers.
              gap={
                revealed
                  ? railGap({
                      pane,
                      guessPane: guess === null ? null : pane,
                      guessFraction: fraction,
                      answerPane: pane,
                      answerYear: revealed.year,
                      answerDelayMs: 0,
                      panes,
                    })
                  : null
              }
              gapColor={
                revealed
                  ? VERDICT_COLORS[revealed.seats[view.seat].verdict]
                  : null
              }
              opponentYear={revealed ? revealed.seats[them].guess : null}
              opponentLabel={t.versusThemLabel}
              locale={locale}
              t={t}
              // A one-pane set has no doors, so `paneEntrances` returns none
              // and nothing can call this.
              onEnter={() => {}}
            />
          </div>

          <RoundControls
            phase={view.phase}
            answered={answered}
            secondsLeft={secondsLeft}
            direct={direct}
            onDirect={() => {
              setDirectWanted((current) => !current);
              setInvalid(false);
            }}
            entry={entry}
            onEntry={(next) => {
              setEntry(next);
              setInvalid(false);
            }}
            invalid={invalid}
            onSubmit={lockIn}
            eraHidden={!spec.eraInEntry}
            entryPlaceholder={`${bounds.min}–${bounds.max}`}
            size="lg"
            t={t}
          />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
   Shared round chrome
   ------------------------------------------------------------------------- */

/**
 * The round's controls: how the date is entered, the one button that answers
 * it, and the switch between the two.
 *
 * **A three-column grid with equal flexible sides, not a flex row.** The
 * middle column is therefore the column's own centre whatever the two sides
 * are holding, so the button stands in exactly the same place with the entry
 * open as with it folded away. That button is the one position on these
 * screens which must not move — it is the same rule, and the same markup, as
 * the solo games'.
 *
 * It has **three** states stacked in that middle cell rather than the solo
 * game's two, and the third is the whole difference a second player makes:
 * lock in, then wait for them, then the count to the next round. All three are
 * the same box with the same padding, so they share a centre and each appears
 * exactly where the last one was.
 */
function RoundControls({
  phase,
  answered,
  secondsLeft,
  direct,
  onDirect,
  entry,
  onEntry,
  invalid,
  onSubmit,
  eraHidden,
  entryPlaceholder,
  focusDelayMs = 0,
  size,
  t,
}: {
  phase: MatchView["phase"];
  answered: boolean;
  secondsLeft: number;
  direct: boolean;
  onDirect: () => void;
  entry: DateEntryValue;
  onEntry: (value: DateEntryValue) => void;
  invalid: boolean;
  onSubmit: () => void;
  eraHidden: boolean;
  entryPlaceholder?: string;
  /** How long the rail's fold takes, where there is one. See `DateEntry`. */
  focusDelayMs?: number;
  /** `lg` is the split layout's, which has a row of its own to stand in. */
  size: "sm" | "lg";
  t: Dict;
}) {
  const button = size === "lg" ? ROUND_BUTTON_LG : ROUND_BUTTON;
  const playing = phase === "playing";

  return (
    <div
      className={`relative grid w-full shrink-0 justify-items-center md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center ${
        size === "lg" ? "pt-2" : ""
      }`}
    >
      {/* Always mounted and folded by `data-shown`, like the rail: it has to
          animate out as well as in, and `inert` is what takes a clipped field
          out of reach. */}
      <div
        className="entry-shell hidden md:block md:justify-self-end"
        data-shown={direct}
        inert={!direct}
      >
        <div>
          <div>
            <DateEntry
              value={entry}
              onChange={onEntry}
              onSubmit={onSubmit}
              // Locked in, or the clock took the round: either way the entry
              // stays on screen reporting the year, but it is no longer a
              // control.
              disabled={answered || !playing}
              invalid={invalid}
              shown={direct}
              focusDelayMs={focusDelayMs}
              eraHidden={eraHidden}
              placeholder={entryPlaceholder}
              t={t}
            />
          </div>
        </div>
      </div>

      {/* **Below `md` this row holds nothing but the button.** The entry and
          its switch are a desktop control now (`useKeyboardEntry`), so the
          grid has one centred cell there and the wrapper's `md:contents` is
          what gives the two of them their own cells once the sides exist. */}
      <div className="flex items-center justify-center gap-3 md:contents">
        <div className="grid place-items-center">
          <div
            className={`col-start-1 row-start-1 transition-opacity duration-300 ${
              !answered && playing ? "opacity-100" : "opacity-0"
            }`}
            inert={answered || !playing}
          >
            <button
              type="button"
              onClick={onSubmit}
              className={`${button} bg-ink text-page hover:opacity-85`}
            >
              {t.submitGuess}
            </button>
          </div>

          <div
            className={`col-start-1 row-start-1 transition-opacity duration-300 ${
              answered && playing ? "opacity-100" : "opacity-0"
            }`}
            inert={!answered || !playing}
          >
            <div
              className={`${button} border-white/30 bg-black/45 text-ink backdrop-blur-md`}
            >
              <Waiting label={t.versusWaitingForOpponent} />
            </div>
          </div>

          <div
            className={`col-start-1 row-start-1 transition-opacity duration-300 ${
              phase === "revealed" ? "opacity-100" : "opacity-0"
            }`}
            inert={phase !== "revealed"}
          >
            <div
              className={`${button} border-white/30 bg-black/45 text-ink backdrop-blur-md`}
            >
              {format(t.versusNextRoundIn, { n: secondsLeft })}
            </div>
          </div>
        </div>

        {/* Faded and inert once the round is answered rather than unmounted, so
            its cell keeps its width and the button beside it stays centred.
            There is nothing to switch to mid-reveal anyway: the rail is back on
            screen carrying the answer. */}
        <div
          className={`hidden transition-opacity duration-300 md:ml-3 md:block md:justify-self-start ${
            size === "lg" ? "md:[--menu-btn:46px]" : ""
          } ${answered || !playing ? "opacity-0" : "opacity-100"}`}
          inert={answered || !playing}
        >
          <InputModeToggle direct={direct} onToggle={onDirect} t={t} />
        </div>
      </div>

      {/* The refusal, under the row and out of the flow: a sentence that
          appears only when a date is refused must not be able to move the
          button it was refused by. */}
      {invalid && (
        <p
          role="alert"
          // No `-translate-x-1/2`: Tailwind v4 compiles that to the `translate`
          // property and the keyframe animates `transform`, so the two would
          // compose and pull it a whole width left. Both keyframes carry the
          // -50% instead.
          className="entry-warning on-photo absolute left-1/2 top-full mt-2 whitespace-nowrap text-[12px] font-medium text-bad"
        >
          {t.invalidDate}
        </p>
      )}
    </div>
  );
}

/** Where the match has got to: the question number, and the score. */
function MatchCounters({ view, t }: { view: MatchView; t: Dict }) {
  return (
    <>
      <SetProgress played={view.currentIdx} total={view.totalRounds} t={t} />
      <ScorePill view={view} t={t} />
    </>
  );
}

/** Both scores on one pill, this player's first — it is always theirs. */
function ScorePill({ view, t }: { view: MatchView; t: Dict }) {
  const them = otherSeat(view.seat);

  return (
    <span className="rounded-full border border-white/20 bg-black/55 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-white/80 backdrop-blur-md">
      {t.versusYouLabel} {view.seats[view.seat].score}
      <span className="px-1 text-white/35">·</span>
      {view.seats[them].score} {t.versusThemLabel}
    </span>
  );
}

/** Which pane a guess belongs on, tolerating the null a timeout leaves. */
function paneFor(
  year: number | null,
  panes: VersusModeSpec["panes"],
): TimelinePane | null {
  return year === null ? null : paneForYear(year, panes);
}

/**
 * The round's result, over the picture.
 *
 * Both answers on one row with the verdict between them, because the question
 * a player has the instant a round closes is not "how did I do" but "did I
 * beat them" — and two numbers side by side answer it without being read.
 * Overlaid rather than laid out for the reason the solo verdict is: these
 * screens are one viewport and a result in the flow pushes the footer off the
 * bottom of them.
 */
function RoundOutcome({
  round,
  you,
  locale,
  t,
}: {
  round: RoundResult;
  you: Seat;
  locale: SupportedLocale;
  t: Dict;
}) {
  const them = otherSeat(you);
  const mine = round.seats[you];
  const theirs = round.seats[them];

  return (
    <div
      role="status"
      className="versus-overlay-in pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-1.5 bg-gradient-to-t from-black/92 via-black/65 to-transparent px-4 pb-3 pt-12 text-center"
    >
      <p className="on-photo text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">
        {/* Formatted here rather than taken from `round.yearLabel`, which is
            SQL's `historical_year_label()` and is English by construction: the
            era beside a year is chrome, and this screen speaks the player's
            language. */}
        {formatYear(round.year, dateLabels(t))}
      </p>

      <div className="flex w-full items-start justify-center gap-5">
        <SeatOutcome label={t.versusYouLabel} answer={mine} locale={locale} t={t} />
        <span className="mt-1 text-sm font-semibold text-white/30">·</span>
        <SeatOutcome label={t.versusThemLabel} answer={theirs} locale={locale} t={t} />
      </div>
    </div>
  );
}

function SeatOutcome({
  label,
  answer,
  t,
}: {
  label: string;
  answer: SeatAnswer;
  locale: SupportedLocale;
  t: Dict;
}) {
  return (
    <div className="flex min-w-[6.5rem] flex-col items-center">
      <p className="on-photo text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">
        {label}
      </p>
      <p
        className="on-photo font-display text-xl font-semibold leading-tight tracking-tight sm:text-2xl"
        style={{ color: VERDICT_COLORS[answer.verdict] }}
      >
        {answer.timedOut
          ? t.versusTimedOut
          : t[VERDICT_LABEL_KEYS[answer.verdict]]}
      </p>
      <p className="on-photo text-[11px] tabular-nums text-white/70">
        {answer.guess === null ? "—" : formatYear(answer.guess, dateLabels(t))}
        <span className="px-1 text-white/30">·</span>
        {format(t.versusRoundPoints, { n: answer.points })}
      </p>
    </div>
  );
}

/** The wait, in the place the result will appear. */
function WaitingBadge({ label }: { label: string }) {
  return (
    <div className="versus-overlay-in pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center bg-gradient-to-t from-black/90 via-black/55 to-transparent px-4 pb-4 pt-12 text-center">
      <div className="on-photo">
        <Waiting label={label} />
      </div>
    </div>
  );
}

/**
 * The end of a match.
 *
 * Built on the solo summary's panel rather than being it: a set summary is one
 * player's percentage, and this is two players' scores and who won, which is a
 * different shape with a different headline. What is shared is the vocabulary
 * — the same glass, the same per-round pips, the same three buttons — so the
 * two screens read as the same game ending two ways.
 */
function VersusSummary({
  view,
  onRematch,
  onAnswerRematch,
  busy,
  t,
}: {
  view: MatchView;
  onRematch: () => void;
  onAnswerRematch: (accept: boolean) => void;
  busy: boolean;
  t: Dict;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const them = otherSeat(view.seat);
  const outcome = matchOutcome(view);
  const modeName = t[versusModeSpec(view.mode).titleKey];

  // The match ending is a change of screen and the button that was pressed is
  // gone, so focus has to be moved or a keyboard user is dropped at the top of
  // the document. The panel takes it rather than a button — landing on "Play
  // again" would make Enter start a rematch before the result had been read.
  useEffect(() => {
    panel.current?.focus();
  }, []);

  const youWon = outcome.winner === view.seat;
  const headline =
    outcome.winner === null
      ? t.versusDraw
      : youWon
        ? t.versusYouWin
        : t.versusYouLose;

  const theyAsked = view.rematchBy === them;
  const youAsked = view.rematchBy === view.seat;

  return (
    <div className="relative flex w-full flex-1 justify-center py-2">
      <div
        ref={panel}
        tabIndex={-1}
        role="group"
        aria-label={`${t.versusTitle} — ${headline}`}
        // It grows rather than scrolling inside itself, centred by `my-auto`:
        // the solo summary's rule (see `SetSummary`), and this panel is the
        // one with a rematch state machine under its buttons, so it is the
        // likeliest of all of them to overrun a phone.
        className="set-summary-in my-auto flex w-full max-w-md flex-col gap-5 rounded-3xl border border-white/12 bg-black/45 px-7 py-7 text-center shadow-2xl shadow-black/70 backdrop-blur-2xl focus:outline-none"
      >
        <div>
          {/* The kicker names the game as well as the mode, because a match
              can now be any of the date-guessing pools and the result screen
              is the one place the whole of it is being read. */}
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
            {t.versusTitle}
            <span className="px-1.5 text-white/30">·</span>
            {modeName}
          </p>
          <h2
            className="mt-1 font-display text-3xl font-semibold leading-none tracking-tight"
            style={{
              color:
                outcome.winner === null
                  ? "var(--color-ink)"
                  : youWon
                    ? "var(--color-good)"
                    : "var(--color-ink-dim)",
            }}
          >
            {view.phase === "abandoned" ? t.versusLeft : headline}
          </h2>
        </div>

        <div>
          <p className="font-display text-5xl font-semibold leading-none tracking-tight tabular-nums text-ink">
            {format(t.versusFinalScore, {
              you: view.seats[view.seat].score,
              them: view.seats[them].score,
            })}
          </p>
          <p className="mt-2 text-sm text-white/70">
            {t.versusYouLabel}
            <span className="px-1.5 text-white/30">·</span>
            {t.versusThemLabel}
          </p>
        </div>

        <RoundPips history={view.history} you={view.seat} />

        <p className="text-xs text-white/55">
          {t.versusRoundsWon}:{" "}
          <span className="font-semibold tabular-nums text-ink">
            {outcome.roundsWon[view.seat]} – {outcome.roundsWon[them]}
          </span>
        </p>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onRematch}
            disabled={busy || youAsked || view.phase === "abandoned"}
            aria-busy={busy}
            className={`w-full rounded-full border border-transparent px-6 py-2.5 text-sm font-semibold transition ${
              youAsked
                ? "cursor-default border-white/20 bg-transparent text-white/50"
                : "bg-ink text-page hover:opacity-85"
            }`}
          >
            {t.versusRematch}
          </button>

          {youAsked && <Waiting label={t.versusRematchAsked} />}
          {view.rematchDeclinedBy === them && (
            <p className="text-xs text-white/55">{t.versusRematchDeclined}</p>
          )}

          <ShareMatchButton view={view} modeName={modeName} t={t} />

          {/* The way home, as a button rather than the quiet link it was: it
              is the control every one of the site's result screens now ends
              on, and the one a phone cannot reach any other way — this page
              does not scroll and the bar above it hides when a page does. */}
          <Link
            href="/"
            className={`${SUMMARY_BUTTON} inline-flex items-center justify-center border-white/25 bg-transparent text-white/80 hover:border-white/45 hover:text-ink`}
          >
            {t.versusBackHome}
          </Link>
        </div>
      </div>

      {/* The opponent's request, over the whole screen rather than over the
          panel: scoped to the panel's box it painted a hard-edged rectangle
          in the middle of the page, which reads as a rendering fault rather
          than as something asking to be answered. */}
      {theyAsked && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-6 backdrop-blur-sm">
          <div
            role="alertdialog"
            aria-label={t.versusRematchOffer}
            className="versus-modal-in w-full max-w-xs rounded-3xl border border-white/15 bg-black/80 px-6 py-6 text-center shadow-2xl shadow-black/70"
          >
            <p className="font-display text-lg font-semibold text-ink">
              {t.versusRematchOffer}
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => onAnswerRematch(true)}
                disabled={busy}
                className="w-full rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-page transition hover:opacity-85"
              >
                {t.versusRematchAccept}
              </button>
              <button
                type="button"
                onClick={() => onAnswerRematch(false)}
                disabled={busy}
                className="w-full rounded-full border border-white/35 bg-transparent px-6 py-2.5 text-sm font-semibold text-ink transition hover:bg-white/10"
              >
                {t.versusRematchDecline}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One pip per round, filled for whoever took it.
 *
 * Green is this player, grey is the opponent, hollow is a round neither won —
 * the same reading as the solo summary's strip, where a hollow pip is a round
 * that earned nothing. It is the only part of the screen that says *where* a
 * match was won rather than by how much.
 */
function RoundPips({
  history,
  you,
}: {
  history: readonly RoundResult[];
  you: Seat;
}) {
  const them = otherSeat(you);

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {history.map((round) => {
        const mine = round.seats[you].points;
        const theirs = round.seats[them].points;
        const color =
          mine > theirs
            ? "var(--color-good)"
            : theirs > mine
              ? "var(--color-ink-dim)"
              : "transparent";

        return (
          <span
            key={round.idx}
            className="h-3.5 w-3.5 rounded-[4px] border"
            style={{
              backgroundColor: color,
              borderColor:
                color === "transparent" ? "rgb(255 255 255 / 0.25)" : color,
            }}
          />
        );
      })}
    </div>
  );
}

const SHARE_FEEDBACK_MS = 2000;

/**
 * The result, in the share shape the solo game already uses: title, score,
 * grid, link. The grid is per round and says who took it, which spoils none of
 * the questions — so it can be pasted to somebody who has not played.
 */
function ShareMatchButton({
  view,
  modeName,
  t,
}: {
  view: MatchView;
  /** The mode's name, so a shared result says which game it was. */
  modeName: string;
  t: Dict;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  function flash(next: "copied" | "failed") {
    setState(next);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () => setState("idle"),
      SHARE_FEEDBACK_MS,
    );
  }

  async function share() {
    const them = otherSeat(view.seat);
    const squares = view.history
      .map((round) => {
        const mine = round.seats[view.seat].points;
        const theirs = round.seats[them].points;
        return mine > theirs ? "🟩" : theirs > mine ? "⬛" : "⬜";
      })
      .join("");

    const text = [
      `TEMPUS · ${t.versusTitle} · ${modeName}`,
      `${view.seats[view.seat].score} – ${view.seats[them].score}`,
      "",
      squares,
      "",
      // Read at click time: the site has no domain yet (CLAUDE.md gap 1), and
      // the match path would be a dead link anyway once the match is swept.
      window.location.origin,
    ].join("\n");

    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (error) {
        // Dismissing the sheet is a choice, not a failure.
        if (error instanceof DOMException && error.name === "AbortError")
          return;
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      flash("copied");
    } catch {
      flash("failed");
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="w-full rounded-full border border-white/45 bg-black/45 px-6 py-2.5 text-sm font-semibold text-ink backdrop-blur-md transition hover:bg-black/65"
    >
      {state === "copied"
        ? t.shareCopied
        : state === "failed"
          ? t.shareFailed
          : t.versusShareMatch}
    </button>
  );
}

function LoadingNotice({ label }: { label: string }) {
  return (
    <div className="flex min-h-0 w-full flex-1 items-center justify-center">
      <Waiting label={label} />
    </div>
  );
}

function FatalNotice({ message, t }: { message: string; t: Dict }) {
  return (
    <div className="flex min-h-0 w-full flex-1 items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-3xl border border-white/12 bg-black/45 px-7 py-7 text-center shadow-2xl shadow-black/70 backdrop-blur-2xl">
        <p className="text-sm text-ink">{message}</p>
        <Link
          href="/versus"
          className="mt-5 inline-block rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-page transition hover:opacity-85"
        >
          {t.versusPlayFriend}
        </Link>
      </div>
    </div>
  );
}

function joinMessage(reason: string, t: Dict): string {
  switch (reason) {
    case "full":
      return t.versusMatchFull;
    case "finished":
      return t.versusMatchFinished;
    case "not-found":
      return t.versusMatchNotFound;
    default:
      return t.versusCreateFailed;
  }
}

/* -------------------------------------------------------------------------
   The seat, kept in the tab
   ------------------------------------------------------------------------- */

interface StoredSeat {
  matchId: string;
  token: string;
  seat: Seat;
}

function seatKey(code: string): string {
  return `tempus:versus:${code}`;
}

function readSeat(code: string): StoredSeat | null {
  try {
    const raw = window.sessionStorage.getItem(seatKey(code));
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const { matchId, token, seat } = parsed as Record<string, unknown>;
    if (typeof matchId !== "string" || typeof token !== "string") return null;
    if (seat !== 1 && seat !== 2) return null;

    return { matchId, token, seat };
  } catch {
    // Private browsing can make sessionStorage throw outright. Treat it as an
    // empty seat: the player joins fresh rather than meeting an error.
    return null;
  }
}

function writeSeat(code: string, seat: StoredSeat): void {
  try {
    window.sessionStorage.setItem(seatKey(code), JSON.stringify(seat));
  } catch {
    // Without storage the seat is lost on reload, which is worse than it
    // sounds but better than refusing to play.
  }
}

function clearSeat(code: string): void {
  try {
    window.sessionStorage.removeItem(seatKey(code));
  } catch {
    // Nothing to do.
  }
}
