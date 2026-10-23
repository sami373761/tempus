"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  answerVersusRematch,
  cancelVersusSearch,
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
import { FLANK_BOX, VerdictDeck } from "@/components/round-flank";
import { RoundTimer } from "@/components/round-timer";
import { SetProgress, SUMMARY_BUTTON } from "@/components/set-summary";
import { TimelineBackdrop } from "@/components/timeline-backdrop";
import {
  CARD_BOX,
  CARD_BOX_WIDE,
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
import {
  clearVersusSeat,
  FindOpponentError,
  readVersusSeat,
  useFindOpponent,
  VersusSearch,
  writeLastOnlineMatch,
  writeVersusSeat,
  type SeatCredentials,
  type StoredSeat,
} from "@/components/versus-search";
import { signedDelta } from "@/lib/game/chrono-rating";
import type { SupportedLocale } from "@/lib/db/types";
import {
  directYear,
  EMPTY_DATE_ENTRY,
  type DateEntryValue,
} from "@/lib/game/date-entry";
import {
  applyMatchRow,
  foldView,
  inMatchIntro,
  matchOutcome,
  opponentAnswered,
  otherSeat,
  PUBLIC_MATCH_INTRO_SECONDS,
  PUBLIC_TICK_JITTER_MS,
  PUBLIC_TICK_MS,
  revealedRound,
  VERSUS_TICK_PATH,
  versusModeSpec,
  viewAtRevealEnd,
  type MaskedEvent,
  type MatchView,
  type RoundResult,
  type Seat,
  type SeatAnswer,
  type TickResponse,
  type VersusModeSpec,
} from "@/lib/game/versus";
import {
  DEFAULT_PANE,
  entryFraction,
  fractionAtYear,
  paneBounds,
  paneForYear,
  STILL_PANES,
  type TimelinePane,
  yearAtFraction,
} from "@/lib/game/timeline";
import { VERDICT_COLORS, VERDICT_LABEL_KEYS } from "@/lib/game/verdict-style";
import { formatYear } from "@/lib/historical-date";
import { copyText } from "@/lib/clipboard";
import { SITE_ORIGIN } from "@/lib/site";
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
 * **An online match is this screen with five differences**, every one keyed
 * on `view.isPublic` and none on who the opponent is. The lobby is the search
 * (components/versus-search.tsx) rather than an invitation. Round one opens
 * behind an "opponent found" card for the seconds its `round_started_at` is
 * stamped ahead of the clock. While the opponent has not answered, the client
 * prompts the server on a jittered heartbeat (`PUBLIC_TICK_MS` — the reason is
 * written there), which is also the only way it hears that they have: a public
 * match never pushes a first answer. The opponent is called by name rather
 * than "them", and presence is off. And the end screen offers a fresh search
 * and the rating change instead of a rematch. An invitation is exactly what it
 * was.
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
  const router = useRouter();
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
  // twenty-five seconds as their opponent.
  const clockOffset = useRef(0);

  // The last prompt sent, as (generation, round, phase) and when. A stamp
  // rather than a latch, so a prompt that fails or lands early is retried —
  // see PROMPT_RETRY_MS.
  const prompted = useRef<{ key: string; at: number } | null>(null);
  // One question fetch per round, with the key cleared on failure so a
  // dropped request is retried rather than leaving a blank card.
  const fetchedRound = useRef<string | null>(null);
  // The same for the read an online match needs once it is over (see below).
  const fetchedSettlement = useRef<string | null>(null);

  /**
   * Fold a freshly fetched view in — by version, keeping what only a fetch
   * can carry (the questions, and an online match's names, ratings and rating
   * changes) even from one that lost the race to a push. See `foldView`.
   */
  const adopt = useCallback((next: MatchView) => {
    setView((current) => (current ? foldView(current, next) : next));
  }, []);

  /** Ask the server where the match is, and re-measure the clock while at it. */
  const refresh = useCallback(
    async (seat: StoredSeat) => {
      const sent = Date.now();
      // A request that throws (the network gone, a dev server mid-rebuild) is
      // reported as a reason like any refusal, so every caller's failure path
      // runs: uncaught, it escaped as an unhandled rejection and left the tab
      // on "Joining…" for good.
      let result: Awaited<ReturnType<typeof fetchMatchView>>;
      try {
        result = await fetchMatchView(seat.matchId, seat.token);
      } catch {
        return "network" as const;
      }
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
      let seat = readVersusSeat(code);

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
          clearVersusSeat(code);
          seat = null;
        } else {
          setFatal(t.versusCreateFailed);
          return;
        }
      }

      let joined: Awaited<ReturnType<typeof joinVersusMatch>>;
      try {
        joined = await joinVersusMatch(code);
      } catch {
        if (!cancelled) setFatal(t.versusCreateFailed);
        return;
      }
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
      writeVersusSeat(code, fresh);

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

  // Whether this is an online match, once a view has said so. Stamped at
  // creation and never changed, so the subscription below is made once — and
  // not before it is known, because it decides whether this seat announces
  // itself at all (see lib/realtime/match-channel.ts).
  const isPublic = view ? view.isPublic : null;

  useEffect(() => {
    if (!session || isPublic === null) return;

    return subscribeToMatch(
      session.matchId,
      session.seat,
      {
        onRow: (row) =>
          setView((current) =>
            current ? applyMatchRow(current, row) : current,
          ),
        onOpponentPresence: setOpponentOnline,
        onConnected: setConnected,
      },
      { presence: !isPublic },
    );
  }, [session, isPublic]);

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
    // Read once on the way in as well: the clock does not run in the lobby,
    // so until the first tick a match is drawn against the instant the lobby
    // last rendered — an online search's whole length ago.
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [timed]);

  const serverNow = now + clockOffset.current;
  // What is on screen: the view — or, once the reveal has ended on this clock
  // and before the server has said so, the next round (`viewAtRevealEnd`).
  // Everything that talks to the server keeps reading `view`; only drawing
  // and answering read this.
  const shown = view ? viewAtRevealEnd(view, serverNow) : null;
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

  /* --- the online heartbeat ---------------------------------------------- */

  // Round one of an online match opens on the "opponent found" card. Not a
  // phase: its `round_started_at` is stamped a few seconds ahead of the clock
  // (PUBLIC_MATCH_INTRO_SECONDS), so the intro is exactly "the round has not
  // started yet" — read off the same corrected clock the countdown uses, so
  // both players' cards lift at the same instant.
  //
  // Round one of an online match *only*. Every other round's start is stamped
  // at the server's "now", and a clock offset a few dozen milliseconds out
  // would read that as a future instant too — flashing a full-screen card at
  // the top of every round, and of an invitation's first.
  const intro =
    view !== null &&
    view.isPublic &&
    view.currentIdx === 0 &&
    inMatchIntro(view, serverNow);

  // The version in hand, readable by the heartbeat without restarting it on
  // every push. A beat answers with a view only for the opponent's lock-in or
  // for a change this version shows the push has lost (`tickMatch` in
  // lib/db/matches.ts), so most beats cost a few bytes.
  const knownVersion = useRef(0);
  useEffect(() => {
    knownVersion.current = view?.version ?? 0;
  }, [view?.version]);

  // While the opponent has not answered a live online round, prompt the
  // server on a jittered cadence — the reason is on `PUBLIC_TICK_MS`. It
  // beats against every online opponent alike, right up to the deadline, and
  // stops the moment a beat says theirs is in. An invitation never beats;
  // both of its players have a browser to push from.
  //
  // `fetch` to a Route Handler, never a Server Action: actions run one at a
  // time, and a beat in the queue would hold a last-second lock-in back past
  // the deadline (see app/api/versus/tick/route.ts). Out of the queue, a beat
  // and a lock-in can be in flight together — both go through the row lock,
  // in whichever order they arrive — so there is nothing to step aside for.
  const beating =
    session !== null &&
    view !== null &&
    view.isPublic &&
    view.phase === "playing" &&
    !intro &&
    !opponentAnswered(view);

  useEffect(() => {
    if (!beating || !session) return;

    let disposed = false;
    let timer: number | null = null;
    // Aborted on the way out, so a beat answering after the round (or the
    // page) has moved on is not even read.
    const inFlight = new AbortController();

    function schedule() {
      if (disposed) return;
      const jitter = (Math.random() * 2 - 1) * PUBLIC_TICK_JITTER_MS;
      timer = window.setTimeout(() => void beat(), PUBLIC_TICK_MS + jitter);
    }

    // One beat in flight at a time: the next is scheduled when this one has
    // answered, so a slow server is asked less often rather than queued up.
    async function beat() {
      timer = null;
      try {
        const response = await fetch(VERSUS_TICK_PATH, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            matchId: session!.matchId,
            token: session!.token,
            knownVersion: knownVersion.current,
          }),
          cache: "no-store",
          signal: inFlight.signal,
        });
        const result = (await response.json()) as TickResponse;
        if (disposed) return;
        if (result.ok && result.view) adopt(result.view);
      } catch {
        // A dropped beat (or an aborted one) is the next beat's job.
        if (disposed) return;
      }
      schedule();
    }

    schedule();

    return () => {
      disposed = true;
      inFlight.abort();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [beating, session, adopt]);

  /* --- an online match's identity and result ----------------------------- */

  // The names, ratings and rating changes of an online match are not on the
  // pushed row (MATCH_CLIENT_COLUMNS in lib/game/versus.ts — identity, on a
  // row anyone can list), so the moments they change are moments to read the
  // view. When the match fills, the question fetch below is already that
  // read: the lobby's view has no questions. When it ends, nothing else would
  // ask, so this does — once, with the key cleared on failure like the
  // question fetch's. A lobby closed with nobody in it has no result to read.
  useEffect(() => {
    if (!session || !view || !view.isPublic) return;
    if (view.phase !== "complete" && view.phase !== "abandoned") return;
    if (!view.seats[1].joined || !view.seats[2].joined) return;

    // Kept for the start page's next search, which then avoids this opponent
    // too (see `useFindOpponent`).
    writeLastOnlineMatch(session);

    const key = `${view.matchId}:${view.generation}`;
    if (fetchedSettlement.current === key) return;
    fetchedSettlement.current = key;

    void refresh(session).then((problem) => {
      if (problem) fetchedSettlement.current = null;
    });
  }, [session, view, refresh]);

  // The search this page would leave open if it went away now: a public lobby
  // this tab is still searching from. Leaving any way but Cancel — a link in
  // the site bar, Back — used to leave it matchable, and whoever was seated
  // opposite played ten rounds against nobody while an absent account was
  // rated the loss. So it is closed as the page unmounts. Not once the search
  // has handed the player on (`moved`), when the lobby is already closed and
  // the request would only delay the next page's first read in the action
  // queue; and not once the lobby has filled — `cancelSearch` would refuse
  // anyway, a filled lobby being a match.
  const openSearch = useRef<StoredSeat | null>(null);
  const handedOff = useRef(false);
  useEffect(() => {
    openSearch.current =
      !handedOff.current &&
      session !== null &&
      view !== null &&
      view.isPublic &&
      view.phase === "lobby"
        ? session
        : null;
  });

  // Deferred by a tick and called off by a remount, because development's
  // StrictMode unmounts and remounts every component once on the way in, and
  // a cancel sent then would close the search the player has just opened.
  const pendingLeave = useRef<number | null>(null);
  useEffect(() => {
    if (pendingLeave.current !== null) {
      window.clearTimeout(pendingLeave.current);
      pendingLeave.current = null;
    }
    return () => {
      const seat = openSearch.current;
      if (!seat) return;
      pendingLeave.current = window.setTimeout(() => {
        pendingLeave.current = null;
        void cancelVersusSearch(seat.matchId, seat.token).catch(() => {});
      }, 0);
    };
  }, []);

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
   *
   * `early` is the one soft answer that does bring the marker back: the round
   * had not started (an online match's intro, a few milliseconds of clock
   * disagreement at its edge), so nothing was recorded and the round the
   * player is about to be shown is still theirs to answer.
   */
  const submit = useCallback(
    async (year: number): Promise<boolean> => {
      if (!session || !shown || shown.phase !== "playing") return false;

      const result = await submitVersusGuess(
        session.matchId,
        session.token,
        shown.currentIdx,
        year,
      );

      if (!result.ok) return false;
      adopt(result.view);
      return result.outcome !== "early";
    },
    [session, shown, adopt],
  );

  // A seat in another match, handed back by the search when it merged this
  // lobby into an older one. Replaced rather than pushed: the lobby left
  // behind is closed, and Back landing on it would only bounce to the start.
  // The page keys this component on the code, so the new URL is a clean
  // mount rather than this state carried into another match.
  const moved = useCallback(
    (credentials: SeatCredentials) => {
      // The lobby this leaves is already closed (the move closed it).
      handedOff.current = true;
      openSearch.current = null;
      writeVersusSeat(credentials.code, {
        matchId: credentials.matchId,
        token: credentials.token,
        seat: credentials.seat,
      });
      router.replace(`/versus/${credentials.code}`);
    },
    [router],
  );

  // A request that throws is treated like one refused: the button comes back
  // for another press. Uncaught, it left the button busy — and its loading
  // trace running — for good.
  async function ready() {
    if (!session || busy) return;
    setBusy(true);
    try {
      const result = await setMatchReady(session.matchId, session.token, true);
      if (result.ok) adopt(result.view);
    } catch {}
    setBusy(false);
  }

  async function askRematch() {
    if (!session || busy) return;
    setBusy(true);
    try {
      const result = await requestVersusRematch(session.matchId, session.token);
      if (result.ok) adopt(result.view);
    } catch {}
    setBusy(false);
  }

  async function answerRematch(accept: boolean) {
    if (!session || busy) return;
    setBusy(true);
    try {
      const result = await answerVersusRematch(
        session.matchId,
        session.token,
        accept,
      );
      if (result.ok) adopt(result.view);
    } catch {}
    setBusy(false);
  }

  /* --- render ------------------------------------------------------------ */

  // Both before the container below, which is what draws the backdrop — so
  // each brings its own rather than sitting on a bare black page. The mode
  // (and so its home era) is not known yet; the default pane is the start
  // page's own.
  if (fatal) return <FatalNotice message={fatal} t={t} />;
  if (!view || !shown)
    return (
      <>
        <TimelineBackdrop pane={DEFAULT_PANE} panes={STILL_PANES} />
        <LoadingNotice label={t.versusJoining} />
      </>
    );

  const spec = versusModeSpec(shown.mode);
  const event = shown.events[shown.currentIdx] ?? null;
  const revealed = revealedRound(shown);

  // Clamped to the round's own length. During an online match's intro the
  // deadline is the intro *plus* the round away, and a ring that opened at 28
  // of 25 seconds would be a clock that is wrong for its first three.
  const shownDeadline =
    shown.phase === "playing"
      ? shown.roundDeadlineAt
      : shown.phase === "revealed"
        ? shown.revealUntilAt
        : null;
  const remainingMs =
    shownDeadline === null
      ? 0
      : shown.phase === "playing"
        ? Math.min(shownDeadline - serverNow, shown.roundSeconds * 1000)
        : shownDeadline - serverNow;
  const secondsLeft = Math.max(0, Math.ceil(remainingMs / 1000));

  const searching = isSearchScreen(shown);

  // Whether one of the two round bodies is what is on screen. A match in a
  // playing phase whose question has not arrived yet is *not* — the fetch for
  // it is in flight — and that gap is why this is one flag rather than a test
  // on the phase: the round bodies draw their own backdrop, so a phase-only
  // test left the "starting..." moment with none at all, i.e. a black page.
  const showRound =
    event !== null &&
    shown.phase !== "lobby" &&
    shown.phase !== "complete" &&
    shown.phase !== "abandoned";

  const round = { view: shown, spec, event, revealed, remainingMs, secondsLeft, onSubmit: submit, t, locale };

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

      {searching ? (
        session ? (
          <VersusSearch
            view={shown}
            matchId={session.matchId}
            token={session.token}
            onAdopt={adopt}
            onMoved={moved}
            t={t}
          />
        ) : (
          <LoadingNotice label={t.versusJoining} />
        )
      ) : shown.phase === "lobby" ? (
        <VersusLobby view={shown} onReady={ready} busy={busy} t={t} />
      ) : shown.phase === "complete" || shown.phase === "abandoned" ? (
        <VersusSummary
          view={shown}
          seat={session}
          onRematch={askRematch}
          onAnswerRematch={answerRematch}
          busy={busy}
          t={t}
        />
      ) : event === null ? (
        <LoadingNotice label={t.versusStarting} />
      ) : (
        // `contents`, so the wrapper adds no box to a layout that is a height
        // budget; it is only there to carry `inert` while the intro card is
        // over the round. The question is mounted under the card on purpose
        // — its picture loads behind it, and the round opens on a photograph
        // rather than on a fade-in — but nothing in it can be reached early.
        <div className="contents" inert={intro}>
          {spec.layout === "poster" ? (
            <PosterRound key={shown.mode} {...round} event={event} />
          ) : (
            <StageRound key={shown.mode} {...round} event={event} />
          )}
        </div>
      )}

      {/* Over whatever is under it, the question or the wait for it: the
          host's lobby fills on a push that carries no question, and the card
          should not wait for the fetch that brings one. */}
      {/* `known`: the names come with the first view read after the fill (they
          are not on the push — see the identity effect above), and that is the
          view that brings the first question too. */}
      {intro && (
        <MatchIntro
          view={shown}
          serverNow={serverNow}
          known={event !== null}
          t={t}
        />
      )}

      {/* Advisory only: the match never pauses for a missing opponent, it just
          says so. Hidden in the lobby, where "not here yet" is the screen's
          whole subject and this would be saying it twice — and in every
          online match, which has no presence to report (see
          lib/realtime/match-channel.ts). */}
      {!shown.isPublic && shown.phase !== "lobby" && !opponentOnline && (
        // `bottom-1`: the round's button stands in the container's 24px
        // foot, and at `bottom-3` this line rose into it on a phone. The foot
        // holds one line, so the inset is only `px-2`: the English sentence
        // is ~295px, and `px-4` wrapped it at 320 with its first line back
        // across the button.
        <p className="pointer-events-none fixed inset-x-0 bottom-1 z-30 px-2 text-center text-[11px] text-white/45">
          {connected ? t.versusOpponentOffline : t.versusReconnecting}
        </p>
      )}
    </div>
  );
}

/**
 * Whether an online match is still the search screen.
 *
 * The lobby phase, plainly — and one more case that is not plain: a lobby
 * closed *by the search itself*. When a poll merges this player into an older
 * lobby, the same transaction closes theirs, and the push saying so can beat
 * the poll's own answer home. Swapping to a result screen on that push would
 * unmount the search with the answer — the seat in the match they were moved
 * into — still on its way, and strand them there with an opponent waiting.
 * So a closed lobby that never had a second player stays the search, whose
 * next answer is either that seat or "gone", and either one moves the tab on.
 */
function isSearchScreen(view: MatchView): boolean {
  if (!view.isPublic) return false;
  if (view.phase === "lobby") return true;
  return view.phase === "abandoned" && !view.seats[otherSeat(view.seat)].joined;
}

/**
 * The name the opponent goes by on this screen.
 *
 * An invitation is between two people who know each other, and "them" is all
 * the label needs to be. An online opponent is a stranger with a username,
 * and a guest is "Guest" — the same word for every guest, so nothing about
 * how an opponent is labelled says anything but what their seat carries.
 */
function opponentName(view: MatchView, t: Dict): string {
  if (!view.isPublic) return t.versusThemLabel;
  return view.names[otherSeat(view.seat)] ?? t.versusGuestName;
}

/**
 * A name short enough for a pill under a rail marker, which has no room to
 * truncate with CSS — it is one `whitespace-nowrap` string beside a year.
 * Usernames are at most twenty characters, so this only ever trims the long
 * ones, and it trims by code point so a name is never cut mid-character.
 */
function railName(name: string): string {
  const characters = Array.from(name);
  return characters.length <= RAIL_NAME_MAX
    ? name
    : `${characters.slice(0, RAIL_NAME_MAX - 1).join("")}…`;
}

const RAIL_NAME_MAX = 12;

/**
 * "Opponent found": the few seconds between a public match filling and its
 * first question.
 *
 * Over the whole screen, like the rematch request, and opaque enough that the
 * question already mounted underneath is a blur rather than a head start —
 * the first twenty-five seconds are counted from the moment this lifts, for both
 * seats, so reading the picture through it would be time nobody else got.
 * The names are the point of the card: until now the player has only seen a
 * clock, and the first thing they want is who they are playing.
 */
function MatchIntro({
  view,
  serverNow,
  known,
  t,
}: {
  view: MatchView;
  serverNow: number;
  /**
   * Whether the view in hand has been read since the match filled. Until then
   * its names are the lobby's — the opponent's still empty — and reading an
   * empty name as "Guest" would flash it before the real one, so a seat with
   * no name yet waits for this.
   */
  known: boolean;
  t: Dict;
}) {
  const them = otherSeat(view.seat);
  // Clamped at both ends: never "0" while the card is still up, and never
  // more than the intro is long — the first frame after a search can be drawn
  // against a clock that has not ticked since the lobby (see the clock above).
  const startsIn =
    view.roundStartedAt === null
      ? PUBLIC_MATCH_INTRO_SECONDS
      : Math.min(
          PUBLIC_MATCH_INTRO_SECONDS,
          Math.max(1, Math.ceil((view.roundStartedAt - serverNow) / 1000)),
        );

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 px-6 backdrop-blur-2xl">
      <div className="versus-modal-in w-full max-w-md rounded-3xl border border-white/15 bg-black/80 px-7 py-7 text-center shadow-2xl shadow-black/70">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
          {t.versusTitle}
          <span className="px-1.5 text-white/30">·</span>
          {t.versusOnlineTitle}
        </p>
        <h2
          role="status"
          aria-live="polite"
          className="mt-1 font-display text-2xl font-semibold text-ink"
        >
          {t.versusOpponentFound}
        </h2>

        <div className="mt-6 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          {/* Each seat on its own data: a name shows the moment any view
              carries it (this player's own is usually already in the
              lobby's), and only "Guest" — which is the absence of a name —
              waits for the read after the fill, so it is never flashed
              before the real one. */}
          <IntroSeat
            label={t.versusYouLabel}
            name={
              known || view.names[view.seat] !== null
                ? (view.names[view.seat] ?? t.versusGuestName)
                : null
            }
            rating={view.ratings[view.seat]}
            t={t}
          />
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
            {t.versusVs}
          </span>
          <IntroSeat
            label={t.versusOpponent}
            name={
              known || view.names[them] !== null
                ? (view.names[them] ?? t.versusGuestName)
                : null
            }
            rating={view.ratings[them]}
            t={t}
          />
        </div>

        {/* Read on demand rather than announced: a live region counting down
            three seconds says a number over the heading it should be
            reading. */}
        <p
          aria-live="off"
          className="mt-6 text-sm font-semibold tabular-nums text-white/70"
        >
          {format(t.versusMatchStartsIn, { n: startsIn })}
        </p>
      </div>
    </div>
  );
}

function IntroSeat({
  label,
  name,
  rating,
  t,
}: {
  label: string;
  /** Null while the view is still the lobby's: drawn as the wait. */
  name: string | null;
  rating: number | null;
  t: Dict;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
        {label}
      </p>
      {/* One line tall either way, so the card does not jump when the names
          land. */}
      <p className="flex h-7 w-full min-w-0 items-center justify-center font-display text-lg font-semibold text-ink">
        {name === null ? (
          <span aria-hidden="true" className="flex items-center gap-1">
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                className="versus-dot h-1 w-1 rounded-full bg-current"
                style={{ animationDelay: `${dot * 160}ms` }}
              />
            ))}
          </span>
        ) : (
          // Its own box, so a long name still ellipsises inside the flex row.
          <span className="min-w-0 truncate">{name}</span>
        )}
      </p>
      {/* A rating only where there is one: a guest has none, and an empty
          line keeps the two columns level rather than printing a zero. */}
      <p className="h-4 text-xs tabular-nums text-white/60">
        {rating === null ? "" : format(t.versusRatingValue, { n: rating })}
      </p>
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
  // The rail's own idea of "answered" is "the round is over for this
  // player": that is what marks the answer and the opponent's guess on it and
  // freezes it. A round the clock took has no guess, so `answered` alone left
  // the reveal on a live rail with neither marker on it.
  const closed = answered || revealed !== null;

  // Locking in takes the button it was pressed with out of reach (its cell
  // turns `inert`), so a keyboard player's focus falls to the document and
  // nothing hands it back when the next round opens. So when the round is
  // live again and focus is nowhere, it goes to the rail's handle — the
  // control a round starts on. An effect on the live render rather than a
  // timer in the round-change effect, because the handle only becomes
  // tabbable once the reset there has rendered. A typed round's entry keeps
  // its own delayed focus: a folded rail is `inert` and cannot take it.
  const railBox = useRef<HTMLDivElement>(null);
  const live = !answered && view.phase === "playing";
  useEffect(() => {
    if (!live) return;
    const current = document.activeElement;
    if (current && current !== document.body) return;
    railBox.current
      ?.querySelector<HTMLElement>('[role="slider"][tabindex="0"]')
      ?.focus({ preventScroll: true });
  }, [live, generation, currentIdx]);

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
    let year = yearAtFraction(pane, (fractions[pane] ?? 0.5));

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
  // Once both are in, the wait is for the server to close the round, not for
  // the opponent — saying "waiting for your opponent" then is untrue.
  const waitLabel = opponentAnswered(view)
    ? t.versusOpponentLocked
    : t.versusWaitingForOpponent;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-4 sm:gap-5">
      <TimelineBackdrop pane={pane} panes={panes} />

      {/* The card and the two result panels that flank it.

          The wrapper is the solo game's (components/timeline-game.tsx): the
          panels are `absolute` against it at `right-full` and `left-full`, so
          a round being answered does not move the photograph by a pixel, and
          it carries the card's own caps because the panels are `inset-y-0` —
          a wrapper taller than the card would hang them past its corners. */}
      <div
        className={`card-caps relative flex min-h-[9.625rem] flex-1 flex-col items-stretch ${
          folded ? CARD_BOX_WIDE : CARD_BOX
        }`}
      >
        {/* Both players' results, as the pair of cards `/guess` ends a round
            on — this seat's on the left where the solo verdict goes, the
            opponent's on the right where the solo game puts the note about
            the event. A match has no note to put there (its description
            never leaves the server; the client is handed a `MaskedEvent`),
            and the question a player has the instant a round closes is "did I
            beat them" — so the opposite flank answers it in the same object,
            at the same size, with the tier's own colour on both.

            Only where there are sides to hang them off: below 1120px
            `FLANK_BOX` keeps them hidden and `RoundOutcome` paints the same
            two answers across the foot of the picture instead, exactly as the
            solo game falls back to `RoundVerdict`. The two are never on
            screen together.

            The answer's year is on neither card, which is the solo rule: it
            is marked on the rail the camera has just flown to, and printing
            it here as well would be two reveals of one answer. The narrow
            overlay still carries it, because there the rail is the only other
            place it appears and a phone's rail is small. */}
        {revealed && (
          <>
            <SeatFlank
              side="left"
              answer={revealed.seats[view.seat]}
              year={revealed.year}
              kicker={t.resultTitle}
              locale={locale}
              t={t}
            />
            <SeatFlank
              side="right"
              answer={revealed.seats[them]}
              year={revealed.year}
              kicker={opponentName(view, t)}
              guessLabel={t.guessTitle}
              locale={locale}
              t={t}
            />
          </>
        )}

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
              <RoundOutcome
                round={revealed}
                you={view.seat}
                theirName={opponentName(view, t)}
                locale={locale}
                // The flanks take over from 1120px — see the note above them.
                wideHidden
                t={t}
              />
            ) : answered ? (
              <WaitingBadge label={waitLabel} />
            ) : opponentAnswered(view) ? (
              <OpponentLockedBadge
                label={t.versusOpponentLocked}
                placement="bottom"
              />
            ) : null
          }
        />
      </div>

      {/* The rail, and the fold that takes it away when the player would
          rather type the date — the same three boxes `/guess` uses, and the
          same `.rail-fold` rule in app/globals.css. `inert` rather than a
          conditional render, so the band has a closing frame to animate and a
          folded rail's slider and era doors are off the tab order. */}
      <div
        ref={railBox}
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
                  fraction={(fractions[candidate] ?? 0.5)}
                  onFractionChange={(next) => move(candidate, next)}
                  answered={closed}
                  showGuess={!closed || guessPane === candidate}
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
                            guessPane === null ? 0 : (fractions[guessPane] ?? 0.5),
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
                  opponentLabel={railName(opponentName(view, t))}
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
        waitLabel={waitLabel}
        last={view.currentIdx + 1 >= view.totalRounds}
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

  // Focus back onto the rail's handle when the round is live again and the
  // lock-in press left it nowhere — see the stage round. A locked rail (a
  // year being typed) has no tabbable handle, so the entry keeps its own.
  const railBox = useRef<HTMLDivElement>(null);
  const live = !answered && view.phase === "playing";
  useEffect(() => {
    if (!live) return;
    const current = document.activeElement;
    if (current && current !== document.body) return;
    railBox.current
      ?.querySelector<HTMLElement>('[role="slider"][tabindex="0"]')
      ?.focus({ preventScroll: true });
  }, [live, generation, currentIdx]);

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
  // See the stage round.
  const waitLabel = opponentAnswered(view)
    ? t.versusOpponentLocked
    : t.versusWaitingForOpponent;

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
                theirName={opponentName(view, t)}
                locale={locale}
                t={t}
              />
            ) : answered ? (
              <WaitingBadge label={waitLabel} />
            ) : opponentAnswered(view) ? (
              // At the top on a poster: its foot is the title, which this
              // must not cover while the round is still being answered.
              <OpponentLockedBadge
                label={t.versusOpponentLocked}
                placement="top"
              />
            ) : null
          }
          t={t}
        />

        <div className="mx-auto flex w-full min-h-0 max-w-5xl flex-col">
          {/* Stacked below `sm`, the counters over the title: beside it, the
              ~155px of counters and clock left the title and the sentence
              under it a 37px column on a 320px phone. Reversed rather than
              reordered so `sm` and up — where the title comes first and
              the counters stand to its right — is unchanged. */}
          <div className="flex shrink-0 flex-col-reverse gap-2 px-8 pt-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-12">
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
            <div className="flex shrink-0 items-center gap-2.5 self-end pt-0.5 sm:self-auto">
              <div className="flex flex-col items-end gap-1.5">
                <SetProgress
                  played={view.currentIdx}
                  total={view.totalRounds}
                  size="md"
                  t={t}
                />
                <ScorePill view={view} size="md" t={t} />
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
          <div ref={railBox} className="flex min-h-fit flex-1 items-end">
            <TimelinePaneView
              pane={pane}
              panes={panes}
              active
              compact
              heading={false}
              fraction={railFraction}
              onFractionChange={setFraction}
              // Closed by the reveal as well as by a lock-in — see `closed` in
              // the stage round.
              answered={answered || revealed !== null}
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
              opponentLabel={railName(opponentName(view, t))}
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
            waitLabel={waitLabel}
            last={view.currentIdx + 1 >= view.totalRounds}
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
  waitLabel,
  last,
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
  /** What the wait says — the round's badge says the same, and is the one announced. */
  waitLabel: string;
  /** The match's final round, whose reveal leads to the result, not a round. */
  last: boolean;
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
              <Waiting label={waitLabel} live={false} />
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
              {format(last ? t.versusResultsIn : t.versusNextRoundIn, {
                n: secondsLeft,
              })}
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
          //
          // `mt-1` and a 16px line are 20px under the row, inside the frame's
          // bottom padding (`pb-6`, or `pb-5` in a subject match); the
          // inherited 18px line box under `mt-2` would hang past the frame's
          // foot and give the page a scrollbar.
          className="entry-warning on-photo absolute left-1/2 top-full mt-1 whitespace-nowrap text-[12px] leading-4 font-medium text-bad"
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

/**
 * Both scores on one pill, this player's first — it is always theirs.
 *
 * The opponent's label is a username in an online match, so it is the one
 * part of the pill that can be long; it truncates on its own rather than
 * pushing the pill into the timer opposite.
 */
function ScorePill({
  view,
  size = "sm",
  t,
}: {
  view: MatchView;
  /** Matched to the `SetProgress` it is stacked under — see that prop. */
  size?: "sm" | "md";
  t: Dict;
}) {
  const them = otherSeat(view.seat);

  // `min(15rem, 100%)`: on a card under ~300px wide the counter column has
  // less than 15rem left of the timer, and a pill allowed 15rem ran under it.
  return (
    <span
      className={`flex max-w-[min(15rem,100%)] items-center whitespace-nowrap rounded-full border border-white/20 bg-black/55 font-semibold tabular-nums text-white/80 backdrop-blur-md ${
        size === "md" ? "px-3 py-1.5 text-[13px]" : "px-2.5 py-1 text-[11px]"
      }`}
    >
      {t.versusYouLabel} {view.seats[view.seat].score}
      <span className="px-1 text-white/35">·</span>
      {view.seats[them].score}
      <span className="ml-1 min-w-0 truncate">{opponentName(view, t)}</span>
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
  theirName,
  locale,
  wideHidden = false,
  t,
}: {
  round: RoundResult;
  you: Seat;
  /** "Them", or an online opponent's name — see `opponentName`. */
  theirName: string;
  locale: SupportedLocale;
  /**
   * Step aside from 1120px, where the stage round hangs both results off the
   * card as flanks instead (`SeatFlank`) — the width `RoundVerdict` hides
   * itself at, so the overlay and the panels are never on screen together.
   *
   * Off by default, and the poster round leaves it off: that layout is
   * already a two-column grid at exactly this width, with the picture down
   * one side and the rail down the other, so there is no flank to hang
   * anything on and the strip on the poster is the only result it has.
   */
  wideHidden?: boolean;
  t: Dict;
}) {
  const them = otherSeat(you);
  const mine = round.seats[you];
  const theirs = round.seats[them];

  return (
    // Packs itself into a photograph under 10rem, where it was taller than
    // the picture and lost its top to the clip; `RoundCard` fades the corner
    // chips while it is up (see `RoundVerdict`, which does the same). Packed,
    // it is ~77px, so it fits the photo's 5rem floor — a landscape phone's —
    // with the year still on it.
    <div
      role="status"
      data-photo-overlay
      className={`versus-overlay-in pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-1.5 bg-gradient-to-t from-black/92 via-black/65 to-transparent px-4 pb-3 pt-12 text-center [@container(max-height:10rem)]:gap-0.5 [@container(max-height:10rem)]:to-black/40 [@container(max-height:10rem)]:pb-1 [@container(max-height:10rem)]:pt-0 ${
        wideHidden ? "min-[1120px]:hidden" : ""
      }`}
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
        <SeatOutcome label={theirName} answer={theirs} locale={locale} t={t} />
      </div>
    </div>
  );
}

/**
 * One player's round, as the card `/guess` ends a round on.
 *
 * The same `VerdictDeck` the solo game hangs beside its photograph, told who
 * it is about: this seat's card is kicked "Your result" like the solo one,
 * and the opponent's wears their name and labels its second row "Guess"
 * rather than "Your guess". Nothing else differs — the tier's own colour as a
 * block, the word in near-black on it, the notches, and two labelled facts on
 * a near-black foot — because the two results have to be comparable at a
 * glance, and two cards that merely resembled each other would be a second
 * place every one of those decisions has to be kept.
 *
 * A round the clock took has no guess and so no distance: both facts read as
 * an em dash, and the head says "Out of time" in the colour of the miss it is
 * graded as (`label`), which is the same substitution `VerdictDeckRow` makes.
 *
 * The points are the round's own payout, not TP: an online match pays KP at
 * the end and nothing per round, so what a round is worth here is the number
 * that decides who wins it.
 */
function SeatFlank({
  side,
  answer,
  year,
  kicker,
  guessLabel,
  locale,
  t,
}: {
  /** Which flank: this seat's on the left, the opponent's on the right. */
  side: "left" | "right";
  answer: SeatAnswer;
  /** The round's answer, which is what the guess is measured against. */
  year: number;
  /** The head's small line — "Your result", or the opponent's name. */
  kicker: string;
  guessLabel?: string;
  locale: SupportedLocale;
  t: Dict;
}) {
  return (
    <VerdictDeck
      accuracy={{
        verdict: answer.verdict,
        // Subtracted here rather than taken from the server: the plain gap is
        // what the card prints, and astronomical year numbering makes it a
        // subtraction with no era to branch on.
        distance: answer.guess === null ? null : Math.abs(answer.guess - year),
      }}
      guess={answer.guess}
      kicker={kicker}
      label={answer.timedOut ? t.versusTimedOut : null}
      scoreLabel={format(t.versusRoundPoints, { n: answer.points })}
      guessLabel={guessLabel}
      locale={locale}
      t={t}
      className={
        side === "left"
          ? `round-flank-left right-full mr-4 ${FLANK_BOX}`
          : `round-flank-right left-full ml-4 ${FLANK_BOX}`
      }
    />
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
      <p className="on-photo max-w-[9rem] truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">
        {label}
      </p>
      <p
        className="on-photo font-display text-xl font-semibold leading-tight tracking-tight sm:text-2xl [@container(max-height:10rem)]:text-lg"
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
 * "Your opponent locked in", while this player still has the round to answer.
 *
 * A pill rather than the scrim the wait and the result wear: the player is
 * still looking at the picture to answer it, so this may cost it a corner and
 * no more. It is the same fact the server already pushes (`answered_count`)
 * made visible, and it is the pressure that makes a race a race — without it
 * a player has no way to know the other has already moved.
 */
function OpponentLockedBadge({
  label,
  placement,
}: {
  label: string;
  /**
   * Where the picture has room: the foot of a stage photograph, whose title is
   * under the picture rather than on it, and the head of a poster, whose
   * title is painted on its foot.
   */
  placement: "top" | "bottom";
}) {
  // On a stage photograph under 10rem the centred pill stood across the
  // counters' column, so there it is the padlock alone, in the bottom-right
  // corner clear of both the counters and the clock. The words stay for
  // screen readers. Under 5.5rem it drops to `bottom-1` and a 22px chip: the
  // clock's ring ends ~50px down the picture, and at `bottom-3` the 26px
  // chip on the photo's 80px floor started at 42px, across it; now it starts
  // at 54px.
  return (
    <div
      className={`versus-overlay-in pointer-events-none absolute inset-x-0 z-20 flex justify-center px-4 ${
        placement === "top"
          ? "top-3"
          : "bottom-3 [@container(max-height:10rem)]:justify-end [@container(max-height:5.5rem)]:bottom-1"
      }`}
    >
      <p
        role="status"
        aria-live="polite"
        className="on-photo flex max-w-full items-center gap-2 rounded-full border border-white/20 bg-black/65 px-3 py-1.5 text-[11px] font-semibold text-ink backdrop-blur-md [@container(max-height:10rem)]:px-2 [@container(max-height:5.5rem)]:py-1"
      >
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          className="h-3 w-3 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="7" width="10" height="7" rx="1.5" />
          <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
        </svg>
        <span className="truncate [@container(max-height:10rem)]:sr-only">
          {label}
        </span>
      </p>
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
 *
 * **An online match ends differently in three places.** There is no rematch
 * — the same two players are not paired twice running, and "again" there
 * means somebody new — so the first button opens a fresh search instead and
 * the rematch request never appears. The rating change is shown, because it
 * is what an online match was *for*. And a match someone walked out of says who, because online the
 * one who left loses it, and "your opponent left" would be wrong half the
 * time. An invitation's summary is exactly what it was.
 */
function VersusSummary({
  view,
  seat,
  onRematch,
  onAnswerRematch,
  busy,
  t,
}: {
  view: MatchView;
  /**
   * This tab's seat in the match, which "Find new opponent" hands in so the
   * server keeps these two players apart next time (see `useFindOpponent`).
   */
  seat: StoredSeat | null;
  onRematch: () => void;
  onAnswerRematch: (accept: boolean) => void;
  busy: boolean;
  t: Dict;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const them = otherSeat(view.seat);
  const outcome = matchOutcome(view);
  const modeName = t[versusModeSpec(view.mode).titleKey];
  const findNew = useFindOpponent(seat);

  // The match ending is a change of screen and the button that was pressed is
  // gone, so focus has to be moved or a keyboard user is dropped at the top of
  // the document. The panel takes it rather than a button — landing on "Play
  // again" would make Enter start a rematch before the result had been read.
  // `preventScroll` because focus lands mid-entrance: scrolling to the
  // still-moving panel would open the result with its top under the bar.
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
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
  const rematchClosed = busy || youAsked || view.phase === "abandoned";

  // The opponent's rematch offer, which is modal while it is up.
  const offer = !view.isPublic && theyAsked;
  const accept = useRef<HTMLButtonElement>(null);
  // Which answer is in flight, so only the pressed button shows the wait.
  // Cleared once the request is back.
  const [answering, setAnswering] = useState<boolean | null>(null);
  useEffect(() => {
    if (!busy) setAnswering(null);
  }, [busy]);

  function answer(yes: boolean) {
    if (busy) return;
    setAnswering(yes);
    onAnswerRematch(yes);
  }

  // A dialog that opens over the screen takes focus, or a keyboard user is
  // left on a panel they can no longer reach (it is `inert` under the
  // dialog). Accept rather than the panel, because answering is all there
  // is to do. When it closes and its button goes with it, focus comes back
  // to the panel rather than being dropped on the document.
  const offerWas = useRef(offer);
  useEffect(() => {
    if (offer) {
      accept.current?.focus({ preventScroll: true });
    } else if (
      offerWas.current &&
      (!document.activeElement || document.activeElement === document.body)
    ) {
      panel.current?.focus({ preventScroll: true });
    }
    offerWas.current = offer;
  }, [offer]);

  // What the heading says, and in which colour. An invitation keeps its one
  // word for a match that ended early; online, a walk-out is a result — the
  // database settles it as a loss for whoever left — so the heading names
  // who left and is coloured as the result it is.
  const forfeit = view.isPublic && view.phase === "abandoned";
  const title = !forfeit
    ? view.phase === "abandoned"
      ? t.versusLeft
      : headline
    : view.forfeitSeat === view.seat
      ? t.versusYouLeft
      : view.forfeitSeat === them
        ? t.versusLeft
        : t.versusMatchFinished;
  const titleColor = forfeit
    ? view.forfeitSeat === them
      ? "var(--color-good)"
      : view.forfeitSeat === view.seat
        ? "var(--color-ink-dim)"
        : "var(--color-ink)"
    : outcome.winner === null
      ? "var(--color-ink)"
      : youWon
        ? "var(--color-good)"
        : "var(--color-ink-dim)";

  return (
    <div className="relative flex w-full flex-1 justify-center py-2">
      <div
        ref={panel}
        tabIndex={-1}
        role="group"
        // Out of reach while the rematch offer is up over it: the dialog is
        // modal, and Tab must not walk out of it into buttons behind a blur.
        inert={offer}
        aria-label={`${t.versusTitle} — ${view.isPublic ? title : headline}`}
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
            {/* One unbreakable run, so the line breaks before the dot rather
                than inside the game's name — at the `wbr`, without which the
                title's last word was glued to the run. */}
            <wbr />
            <span className="whitespace-nowrap">
              <span className="px-1.5 text-white/30">·</span>
              {view.isPublic ? t.versusOnlineTitle : modeName}
            </span>
          </p>
          <h2
            className="mt-1 font-display text-3xl font-semibold leading-none tracking-tight"
            style={{ color: titleColor }}
          >
            {title}
          </h2>
        </div>

        <div>
          {/* Never wrapped — a score broken over two lines is two numbers —
              and a step smaller below 400px, where four digits at `text-5xl`
              are wider than the panel's 214px column. */}
          <p className="font-display whitespace-nowrap text-4xl font-semibold leading-none tracking-tight tabular-nums text-ink min-[400px]:text-5xl">
            {format(t.versusFinalScore, {
              you: view.seats[view.seat].score,
              them: view.seats[them].score,
            })}
          </p>
          <p className="mt-2 flex items-center justify-center text-sm text-white/70">
            {t.versusYouLabel}
            <span className="px-1.5 text-white/30">·</span>
            <span className="min-w-0 truncate">{opponentName(view, t)}</span>
          </p>
        </div>

        <RoundPips history={view.history} you={view.seat} />

        <p className="text-xs text-white/55">
          {t.versusRoundsWon}:{" "}
          <span className="font-semibold tabular-nums text-ink">
            {outcome.roundsWon[view.seat]} – {outcome.roundsWon[them]}
          </span>
        </p>

        {view.isPublic && <RatingChange view={view} t={t} />}

        <div className="flex flex-col gap-2.5">
          {view.isPublic ? (
            <>
              <button
                type="button"
                onClick={findNew.find}
                aria-busy={findNew.busy}
                className={`${SUMMARY_BUTTON} relative border-transparent bg-ink text-page hover:opacity-85 ${
                  findNew.busy ? "cursor-progress" : ""
                }`}
              >
                {t.versusFindNew}
                {findNew.busy && (
                  <span aria-hidden="true" className="round-trace">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </button>
              <FindOpponentError error={findNew.error} t={t} />
            </>
          ) : (
            <>
              <button
                type="button"
                // `aria-disabled` and a guarded handler rather than `disabled`:
                // a button disabled by its own press drops keyboard focus to
                // the document.
                onClick={() => {
                  if (!rematchClosed) onRematch();
                }}
                aria-disabled={rematchClosed || undefined}
                aria-busy={busy && answering === null}
                className={`relative w-full rounded-full border border-transparent px-6 py-2.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  youAsked
                    ? "cursor-default border-white/20 bg-transparent text-white/50"
                    : "bg-ink text-page hover:opacity-85"
                } ${busy && answering === null ? "cursor-progress" : ""}`}
              >
                {t.versusRematch}
                {/* The board's loading trace: asking is a round trip. Not
                    while the rematch dialog is the one waiting — that
                    press's trace is on the button in the dialog. */}
                {busy && answering === null && (
                  <span aria-hidden="true" className="round-trace">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </button>

              {youAsked && <Waiting label={t.versusRematchAsked} />}
              {view.rematchDeclinedBy === them && (
                <p className="text-xs text-white/55">{t.versusRematchDeclined}</p>
              )}
            </>
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
      {offer && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-6 backdrop-blur-sm">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={t.versusRematchOffer}
            className="versus-modal-in w-full max-w-xs rounded-3xl border border-white/15 bg-black/80 px-6 py-6 text-center shadow-2xl shadow-black/70"
          >
            <p className="font-display text-lg font-semibold text-ink">
              {t.versusRematchOffer}
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              {/* A transparent border on Accept, so the two buttons are the
                  same height — Decline's border is its whole outline. */}
              <button
                ref={accept}
                type="button"
                onClick={() => answer(true)}
                // `aria-disabled`, not `disabled`, for the rematch button's
                // reason: a disabled button drops focus to the document, and
                // here that strands it outside a modal whose panel is inert.
                // `answer` already ignores a press while one is in flight.
                aria-disabled={busy || undefined}
                aria-busy={busy && answering === true}
                className={`relative w-full rounded-full border border-transparent bg-ink px-6 py-2.5 text-sm font-semibold text-page transition hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  busy && answering === true ? "cursor-progress" : ""
                }`}
              >
                {t.versusRematchAccept}
                {busy && answering === true && (
                  <span aria-hidden="true" className="round-trace">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => answer(false)}
                aria-disabled={busy || undefined}
                aria-busy={busy && answering === false}
                className={`relative w-full rounded-full border border-white/35 bg-transparent px-6 py-2.5 text-sm font-semibold text-ink transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  busy && answering === false ? "cursor-progress" : ""
                }`}
              >
                {t.versusRematchDecline}
                {busy && answering === false && (
                  <span aria-hidden="true" className="round-trace">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * What an online match did to this player's Chrono Rating.
 *
 * The change, signed and large, then the total it leaves — the change is the
 * news and the total is the context. Both come from the match: the database
 * writes the applied change onto it as it settles it (the same update that
 * ends the match), so what is printed here is what the ledger holds, not a
 * prediction from lib/game/chrono-rating.ts that could disagree with it.
 *
 * Online play needs an account, so every seat here has a rating; a match
 * with none (one played as a guest before that rule) shows nothing. An
 * account whose change has not arrived shows a wait rather than
 * a guess; it is one read away (the change is not on the pushed row, so the
 * game reads the view once more as the match ends).
 */
function RatingChange({ view, t }: { view: MatchView; t: Dict }) {
  const rating = view.ratings[view.seat];
  const delta = view.ratingDeltas[view.seat];

  if (rating === null) return null;

  // Not arrived yet: the block's own frame, the same height as the one it
  // becomes, with the wait where the number will be — so the buttons under
  // it do not jump down when the change lands a moment after the panel.
  if (delta === null) {
    return (
      <div className="border-t border-white/10 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
          {t.versusRatingName}
        </p>
        <p
          aria-hidden="true"
          className="mt-1 flex h-8 items-center justify-center gap-1 text-white/60"
        >
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="versus-dot h-1 w-1 rounded-full bg-current"
              style={{ animationDelay: `${dot * 160}ms` }}
            />
          ))}
        </p>
        <p className="mt-0.5 h-4" />
      </div>
    );
  }

  return (
    <div className="border-t border-white/10 pt-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
        {t.versusRatingName}
      </p>
      <p
        className="mt-1 font-display text-2xl font-semibold tabular-nums"
        style={{
          color:
            delta > 0
              ? "var(--color-good)"
              : delta < 0
                ? "var(--color-ink-dim)"
                : "var(--color-ink)",
        }}
      >
        {format(t.versusRatingChange, { delta: signedDelta(delta) })}
      </p>
      <p className="mt-0.5 text-xs tabular-nums text-white/60">
        {format(t.versusRatingNow, { n: Math.max(0, rating + delta) })}
      </p>
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
      // The site's front door rather than the match path, which is a dead
      // link once the match is swept; the live origin rather than the page's,
      // which on the dev server is an address the reader cannot open.
      SITE_ORIGIN,
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

    flash((await copyText(text)) ? "copied" : "failed");
  }

  return (
    <button
      type="button"
      onClick={share}
      // Announced, so the "Copied" relabel reaches a screen reader too.
      aria-live="polite"
      className="w-full rounded-full border border-white/45 bg-black/45 px-6 py-2.5 text-sm font-semibold text-ink backdrop-blur-md transition hover:bg-black/65 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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

/**
 * A match that cannot be shown, with the way back to the start page.
 *
 * Only ever drawn outside the game's container (here, and by the page for a
 * malformed code), so it brings the backdrop that container would have drawn.
 */
export function FatalNotice({ message, t }: { message: string; t: Dict }) {
  return (
    <div className="flex min-h-0 w-full flex-1 items-center justify-center px-6">
      <TimelineBackdrop pane={DEFAULT_PANE} panes={STILL_PANES} />
      <div className="w-full max-w-sm rounded-3xl border border-white/12 bg-black/45 px-7 py-7 text-center shadow-2xl shadow-black/70 backdrop-blur-2xl">
        <p className="text-sm text-ink">{message}</p>
        <Link
          href="/versus"
          className="mt-5 inline-block rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-page transition hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
