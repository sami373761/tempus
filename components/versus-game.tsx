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
import { RoundTimer } from "@/components/round-timer";
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
import { VersusLobby, Waiting } from "@/components/versus-lobby";
import type { SupportedLocale } from "@/lib/db/types";
import {
  applyMatchRow,
  matchOutcome,
  otherSeat,
  revealedRound,
  type MatchView,
  type RoundResult,
  type Seat,
  type SeatAnswer,
} from "@/lib/game/versus";
import {
  DEFAULT_PANE,
  entryFraction,
  fractionAtYear,
  paneForYear,
  TIMELINE_PANES,
  type TimelinePane,
  yearAtFraction,
} from "@/lib/game/timeline";
import { formatYear } from "@/lib/historical-date";
import { subscribeToMatch } from "@/lib/realtime/match-channel";
import { format, type Dict } from "@/lib/i18n/dictionary";

/**
 * The two-player date-guessing game.
 *
 * It is the solo game's screen with a second person in it, and that is meant
 * literally: the backdrop, the photograph, the ruler, the marker and the
 * button are all the same components the solo game draws
 * (components/timeline-stage.tsx). What this file adds is only what a second
 * player makes necessary — a countdown, a wait, a shared result, a rematch.
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
  // request (see `adoptMeasured`). Every deadline on screen is rendered
  // through it, so a player whose laptop clock is ten minutes out still sees
  // the same twenty seconds as their opponent.
  const clockOffset = useRef(0);

  // The rail, exactly as the solo game keeps it.
  const [pane, setPane] = useState<TimelinePane>(DEFAULT_PANE);
  const [fractions, setFractions] =
    useState<Record<TimelinePane, number>>(openingFractions);
  const [localGuess, setLocalGuess] = useState<number | null>(null);
  const [guessPane, setGuessPane] = useState<TimelinePane | null>(null);
  const [panMs, setPanMs] = useState(PAN_MS);

  const travelTimer = useRef<number | null>(null);
  const resetTimer = useRef<number | null>(null);
  // The last prompt sent, as (generation, round, phase) and when. A stamp
  // rather than a latch, so a prompt that fails or lands early is retried —
  // see PROMPT_RETRY_MS.
  const prompted = useRef<{ key: string; at: number } | null>(null);
  // One question fetch per round, with the key cleared on failure so a
  // dropped request is retried rather than leaving a blank card.
  const fetchedRound = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (travelTimer.current !== null) window.clearTimeout(travelTimer.current);
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    },
    [],
  );

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

  // Next round's photograph, pulled while this one is still being played.
  const upcomingUrl = view?.events[currentIdx + 1]?.image?.url;
  useEffect(() => {
    if (!upcomingUrl) return;
    const preload = new window.Image();
    preload.src = upcomingUrl;
  }, [upcomingUrl]);

  /* --- the rail, round by round ------------------------------------------ */

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

  // A new round resets the rails and flies the camera home, exactly as
  // `advance` does in the solo game — and for the same reason the solo game
  // splits it in two: the pane being landed on is reset now because it is
  // off-camera, and the rest only once the journey is over, or the flight
  // passes visibly jumping markers.
  useEffect(() => {
    setLocalGuess(null);
    setGuessPane(null);
    prompted.current = null;

    const from = paneRef.current;
    const travel = from === DEFAULT_PANE ? 0 : panDuration(from, DEFAULT_PANE);

    if (travelTimer.current !== null) window.clearTimeout(travelTimer.current);
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);

    setFractions((current) => ({ ...current, [DEFAULT_PANE]: 0.5 }));
    if (travel > 0) setPanMs(travel);
    setPane(DEFAULT_PANE);

    resetTimer.current = window.setTimeout(() => {
      resetTimer.current = null;
      setFractions(openingFractions());
    }, travel);
    // Keyed on the round, not on the view: this must run once when the
    // question changes and never on an unrelated state push.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation, currentIdx]);

  // Put the player's own marker back after a reload.
  //
  // `localGuess` is how this component normally knows where the marker goes,
  // and a reload throws it away — so a player who answered and then refreshed
  // met a locked rail with nothing on it, and then a result quoting a guess
  // that was nowhere on screen. The server knows their guess (it is their
  // own, so the view carries it); this puts the rail back where they left it.
  useEffect(() => {
    if (!view || view.yourGuess === null || localGuess !== null) return;

    const year = view.yourGuess;
    const home = paneForYear(year);

    // The round-change effect above has just scheduled the rails back to
    // their opening positions, which is right for a round that is starting
    // and wrong for one this player has already answered. Cancelling it is
    // what makes the restore stick.
    if (resetTimer.current !== null) {
      window.clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }

    setLocalGuess(year);
    setGuessPane(home);
    setFractions((current) => ({
      ...current,
      [home]: fractionAtYear(home, year),
    }));
  }, [view, localGuess]);

  const revealed = view ? revealedRound(view) : null;

  // The answer is on a rail that may be four eras away, so the camera travels
  // to it when the round closes — the solo game's reveal, on the server's cue
  // rather than on this player's.
  useEffect(() => {
    if (!revealed) return;

    const from = paneRef.current;
    const target = paneForYear(revealed.year);
    if (target === from) return;

    if (travelTimer.current !== null) window.clearTimeout(travelTimer.current);
    travelTimer.current = window.setTimeout(() => {
      travelTimer.current = null;
      setPanMs(panDuration(from, target));
      setPane(target);
    }, REVEAL_HOLD_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed?.idx, revealed?.year, generation]);

  /* --- moves ------------------------------------------------------------- */

  const answered = localGuess !== null || view?.youAnswered === true;

  async function submit() {
    if (!session || !view || answered || view.phase !== "playing") return;

    const year = yearAtFraction(pane, fractions[pane]);
    setLocalGuess(year);
    setGuessPane(pane);

    const result = await submitVersusGuess(
      session.matchId,
      session.token,
      view.currentIdx,
      year,
    );

    // A hard failure is the only case worth undoing: the round is still live
    // and they should be able to try again. "closed" and "stale" are not
    // failures — the server simply got there first, and the marker stays
    // where they put it.
    if (!result.ok) {
      setLocalGuess(null);
      setGuessPane(null);
      return;
    }
    adopt(result.view);
  }

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

  function move(nextPane: TimelinePane, nextFraction: number) {
    setFractions((current) => ({ ...current, [nextPane]: nextFraction }));
  }

  function enter(nextPane: TimelinePane) {
    move(nextPane, entryFraction(nextPane, pane));
    setPanMs(PAN_MS);
    setPane(nextPane);
  }

  /* --- render ------------------------------------------------------------ */

  if (fatal) return <FatalNotice message={fatal} t={t} />;
  if (!view) return <LoadingNotice label={t.versusJoining} />;

  const them = otherSeat(view.seat);
  const event = view.events[view.currentIdx] ?? null;
  const answerPane = revealed ? paneForYear(revealed.year) : null;
  const answerDelayMs =
    guessPane === null || answerPane === null || guessPane === answerPane
      ? 0
      : REVEAL_HOLD_MS + panDuration(guessPane, answerPane);

  const remainingMs = deadline === null ? 0 : deadline - serverNow;
  const revealSecondsLeft = Math.max(0, Math.ceil(remainingMs / 1000));

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-4 sm:gap-5">
      <TimelineBackdrop pane={pane} />

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
      ) : event ? (
        <>
          <RoundCard
            event={event}
            counter={
              <>
                <span className="rounded-full border border-white/20 bg-black/55 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-white/80 backdrop-blur-md">
                  {format(t.setProgress, {
                    n: view.currentIdx + 1,
                    total: view.totalRounds,
                  })}
                </span>
                <span className="rounded-full border border-white/20 bg-black/55 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-white/80 backdrop-blur-md">
                  {t.versusYouLabel} {view.seats[view.seat].score}
                  <span className="px-1 text-white/35">·</span>
                  {view.seats[them].score} {t.versusThemLabel}
                </span>
              </>
            }
            aside={
              view.phase === "playing" ? (
                <RoundTimer
                  remainingMs={remainingMs}
                  totalMs={view.roundSeconds * 1000}
                  label={t.versusSecondsLeft.replace("{n}", String(revealSecondsLeft))}
                />
              ) : null
            }
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
          />

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
                  showGuess={!answered || guessPane === candidate}
                  answerYear={
                    answerPane === candidate && revealed ? revealed.year : null
                  }
                  answerDelayMs={answerDelayMs}
                  opponentYear={
                    revealed && paneFor(revealed.seats[them].guess) === candidate
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

          {/* Three states, one grid cell — so the thing under the player's
              pointer never moves between guessing, waiting and the result.
              Same rule as the solo game's two. */}
          <div className="grid shrink-0 place-items-center">
            <div
              className={`col-start-1 row-start-1 transition-opacity duration-300 ${
                !answered && view.phase === "playing"
                  ? "opacity-100"
                  : "opacity-0"
              }`}
              inert={answered || view.phase !== "playing"}
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
                answered && view.phase === "playing" ? "opacity-100" : "opacity-0"
              }`}
              inert={!answered || view.phase !== "playing"}
            >
              <div
                className={`${ROUND_BUTTON} border-white/30 bg-black/45 text-ink backdrop-blur-md`}
              >
                <Waiting label={t.versusWaitingForOpponent} />
              </div>
            </div>

            <div
              className={`col-start-1 row-start-1 transition-opacity duration-300 ${
                view.phase === "revealed" ? "opacity-100" : "opacity-0"
              }`}
              inert={view.phase !== "revealed"}
            >
              <div
                className={`${ROUND_BUTTON} border-white/30 bg-black/45 text-ink backdrop-blur-md`}
              >
                {format(t.versusNextRoundIn, { n: revealSecondsLeft })}
              </div>
            </div>
          </div>
        </>
      ) : (
        <LoadingNotice label={t.versusStarting} />
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

/** Which pane a guess belongs on, tolerating the null a timeout leaves. */
function paneFor(year: number | null): TimelinePane | null {
  return year === null ? null : paneForYear(year);
}

/**
 * The round's result, over the photograph.
 *
 * Both answers on one row with the verdict between them, because the question
 * a player has the instant a round closes is not "how did I do" but "did I
 * beat them" — and two numbers side by side answer it without being read.
 * Overlaid rather than laid out for the reason the solo verdict is: this
 * screen is one viewport and a result in the flow pushes the footer off the
 * bottom of it.
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
      className="versus-overlay-in pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-1.5 bg-gradient-to-t from-black/92 via-black/65 to-transparent px-4 pb-3 pt-12 text-center"
    >
      <p className="on-photo text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">
        {round.yearLabel}
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
        {answer.timedOut ? t.versusTimedOut : t[VERDICT_LABEL_KEYS[answer.verdict]]}
      </p>
      <p className="on-photo text-[11px] tabular-nums text-white/70">
        {answer.guess === null ? "—" : formatYear(answer.guess)}
        <span className="px-1 text-white/30">·</span>
        {format(t.versusRoundPoints, { n: answer.points })}
      </p>
    </div>
  );
}

/** The wait, in the place the result will appear. */
function WaitingBadge({ label }: { label: string }) {
  return (
    <div className="versus-overlay-in pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center bg-gradient-to-t from-black/90 via-black/55 to-transparent px-4 pb-4 pt-12 text-center">
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
    <div className="relative flex min-h-0 w-full flex-1 items-center justify-center py-2">
      <div
        ref={panel}
        tabIndex={-1}
        role="group"
        aria-label={`${t.versusTitle} — ${headline}`}
        className="set-summary-in flex max-h-full w-full max-w-md flex-col gap-5 overflow-y-auto rounded-3xl border border-white/12 bg-black/45 px-7 py-7 text-center shadow-2xl shadow-black/70 backdrop-blur-2xl focus:outline-none"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
            {t.versusTitle}
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

          <ShareMatchButton view={view} t={t} />
        </div>

        <Link
          href="/"
          className="text-xs text-white/55 underline-offset-4 transition hover:text-ink hover:underline"
        >
          {t.versusBackHome}
        </Link>
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
function ShareMatchButton({ view, t }: { view: MatchView; t: Dict }) {
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
    timer.current = window.setTimeout(() => setState("idle"), SHARE_FEEDBACK_MS);
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
      `TEMPUS · ${t.versusTitle}`,
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
        if (error instanceof DOMException && error.name === "AbortError") return;
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
