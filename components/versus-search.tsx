"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  cancelVersusSearch,
  findVersusOpponent,
  pollVersusSearch,
  type SearchPollResult,
} from "@/app/actions/versus";
import { SUMMARY_BUTTON } from "@/components/set-summary";
import { ACCOUNT_PATH } from "@/lib/auth/paths";
import { CHRONO_TIER_LABEL_KEYS, chronoTier } from "@/lib/game/chrono-rating";
import {
  SEARCH_FALLBACK_MAX_MS,
  SEARCH_FALLBACK_MIN_MS,
  SEARCH_POLL_MS,
  type MatchView,
  type Seat,
} from "@/lib/game/versus";
import { format, type Dict } from "@/lib/i18n/dictionary";

/**
 * The online lobby: the screen a public match shows while it has one player.
 *
 * **It is the match page, not a page of its own.** `findVersusOpponent` hands
 * back a seat exactly as creating an invitation does, and the player lands on
 * `/versus/<code>` like any host. What differs is only what the lobby phase
 * draws: an invitation shows a QR code and waits for a friend, and this shows
 * a clock and waits for the server. So reloading mid-search, the realtime
 * channel, the clock offset and the hand-off into round one are all the
 * invitation's own machinery — the moment someone takes seat two the row is
 * pushed, the phase turns to `playing`, and `VersusGame` swaps this screen for
 * the round without anyone here having to notice.
 *
 * **It polls, because nothing else would move it.** A lobby with one player
 * in it changes only when somebody asks — there is no worker to pair two
 * waiting players — so the search asks every `SEARCH_POLL_MS`, and each ask is
 * also the merge (`versus_matchmake` with this lobby as `p_own_match`): two
 * people who pressed the button in the same second each opened a lobby, and
 * the newer of the two moves into the older one on its next ask. A move
 * arrives here as `moved` with a seat in a *different* match, which is why
 * `onMoved` exists — the caller stores that seat and replaces the URL.
 *
 * **When to stop waiting is the client's pick and the server's call.** A
 * moment is drawn once per mount, uniformly in the fallback window, and the
 * first ask at or after it says so (`fallback = true`). The server refuses
 * one that is too early for the lobby's own age, so a patched client cannot
 * shorten the wait; it answers `searching` and the next ask simply says so
 * again. The ask is scheduled *at* the drawn moment rather than at the next
 * poll after it, so the wait really is uniform in the window instead of being
 * rounded up to the poll grid.
 *
 * **Every timer belongs to the mount.** The poll is a chain of timeouts rather
 * than an interval — one ask in flight at a time, the next scheduled only once
 * the last has answered — and an unmount stops the chain and drops whatever
 * answer is still on the way. The one answer that must not be dropped is a
 * move, and the caller keeps this screen mounted for exactly that reason (see
 * `isSearchScreen` in components/versus-game.tsx); if it is lost anyway, the
 * server repeats it on the next ask (`readMoveTarget`).
 *
 * **Asking is also being there.** Each ask stamps the host's seat, and nobody
 * is seated opposite a host who has stopped asking (`SEARCH_HOST_SEEN_MS`), so
 * a tab closed mid-search stops being matchable within seconds. Leaving the
 * page any other way — a link in the site bar, Back — closes the lobby
 * outright: the match page sends the cancel as it unmounts (`VersusGame`).
 */
export function VersusSearch({
  view,
  matchId,
  token,
  onAdopt,
  onMoved,
  t,
}: {
  view: MatchView;
  matchId: string;
  token: string;
  /** The match filled: here is the view to play it from. */
  onAdopt: (view: MatchView) => void;
  /** This player was moved into an older lobby: here is the new seat. */
  onMoved: (credentials: SeatCredentials) => void;
  t: Dict;
}) {
  const router = useRouter();
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  const [cancelling, setCancelling] = useState(false);

  // How the search ended, first writer wins. A poll and a cancel can both be
  // in flight, and whichever lands first decides where the player goes — a
  // second navigation racing the first is how a tab ends up in a match it
  // left, or on the start page of a match it is seated in.
  const outcome = useRef<"cancelled" | "found" | "gone" | null>(null);
  // A cancel on its way holds the chain without ending it. Asking while it
  // is out could fill the lobby the player is trying to leave; ending the
  // chain would strand them if the cancel comes back "too late, matched".
  const holding = useRef(false);

  // The callbacks, readable from the poll chain without restarting it. The
  // chain is keyed on the seat; a parent re-rendering every 100ms for its own
  // clock must not reset the fallback moment each time it does.
  const callbacks = useRef({ onAdopt, onMoved });
  useEffect(() => {
    callbacks.current = { onAdopt, onMoved };
  });

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let disposed = false;
    let timer: number | null = null;

    const fallbackAt =
      Date.now() +
      SEARCH_FALLBACK_MIN_MS +
      Math.random() * (SEARCH_FALLBACK_MAX_MS - SEARCH_FALLBACK_MIN_MS);

    function schedule() {
      if (disposed || outcome.current !== null) return;
      const untilFallback = fallbackAt - Date.now();
      const delay =
        untilFallback > 0
          ? Math.min(SEARCH_POLL_MS, untilFallback)
          : SEARCH_POLL_MS;
      timer = window.setTimeout(() => void ask(), delay);
    }

    async function ask() {
      timer = null;
      if (disposed || outcome.current !== null) return;
      if (holding.current) {
        schedule();
        return;
      }

      let result: SearchPollResult | null;
      try {
        result = await pollVersusSearch(
          matchId,
          token,
          Date.now() >= fallbackAt,
        );
      } catch {
        // A dropped request (a dev rebuild, a train tunnel). The lobby is
        // still open on the server; the next ask is the retry.
        result = null;
      }

      // Unmounted while the ask was out: the caller has already moved on —
      // into the match, normally, which a push delivered first.
      if (disposed) return;

      if (result?.ok) {
        if (result.status === "matched") {
          if (outcome.current === null) {
            outcome.current = "found";
            callbacks.current.onAdopt(result.view);
          }
          return;
        }
        if (result.status === "moved") {
          if (outcome.current === null) {
            outcome.current = "found";
            callbacks.current.onMoved({
              matchId: result.matchId,
              code: result.code,
              seat: result.seat,
              token: result.token,
            });
          }
          return;
        }
      } else if (result && isTerminal(result.reason)) {
        // The lobby is closed, or this tab's seat no longer names it. There
        // is nothing to wait for here; the start page is one press from a
        // fresh search. Replaced rather than pushed, so Back does not land
        // on a dead lobby that would only send the player forward again.
        if (outcome.current === null) {
          outcome.current = "gone";
          router.replace("/versus");
        }
        return;
      }

      schedule();
    }

    schedule();

    return () => {
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [matchId, token, router]);

  async function cancel() {
    if (cancelling || outcome.current !== null) return;
    setCancelling(true);
    holding.current = true;

    let result: Awaited<ReturnType<typeof cancelVersusSearch>> | null;
    try {
      result = await cancelVersusSearch(matchId, token);
    } catch {
      result = null;
    }

    // Filled while the cancel was on its way: someone is in seat two and the
    // first question is a few seconds out. Leaving now would be leaving a
    // match, not a queue, so the press is dropped and the poll — or the
    // push, whichever is first — carries the player into the round.
    if (result && !result.ok && result.reason === "matched") {
      holding.current = false;
      setCancelling(false);
      return;
    }

    if (outcome.current !== null) return;
    outcome.current = "cancelled";
    // Out on any other answer too. A cancel that failed leaves a lobby that
    // nobody polls, and an unpolled lobby is never given a stand-in and stops
    // being matched into a few seconds after its last ask (its host is no
    // longer seen) — and the match page tries the cancel once more as it
    // unmounts. So the player who asked to leave is let go rather than kept on
    // a screen they wanted off.
    router.replace("/versus");
  }

  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  const rating = view.ratings[view.seat];
  const league = t[CHRONO_TIER_LABEL_KEYS[chronoTier(rating)]];

  return (
    <div className="flex min-h-0 w-full flex-1 items-center justify-center py-2">
      <div className="set-summary-in flex w-full max-w-md flex-col items-center overflow-hidden rounded-3xl border border-white/12 bg-black/45 px-7 py-7 text-center shadow-2xl shadow-black/70 backdrop-blur-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
          {t.versusTitle}
          <span className="px-1.5 text-white/30">·</span>
          {t.versusOnlineTitle}
        </p>

        {/* The headline is the status line: it is the one sentence on the
            screen, and a screen reader is told it once rather than being
            read a clock every second. */}
        {/* A block rather than a flex row, with the dots inline after the
            last word: as a flex item they stood beside the whole wrapped
            heading, a column's width away from where the sentence ends. */}
        <h2
          role="status"
          aria-live="polite"
          className="mt-1 text-balance font-display text-xl font-semibold text-ink"
        >
          {t.versusSearching}
          <span
            aria-hidden="true"
            className="ml-2 inline-flex items-center gap-1 align-middle"
          >
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                className="versus-dot h-1 w-1 rounded-full bg-current"
                style={{ animationDelay: `${dot * 160}ms` }}
              />
            ))}
          </span>
        </h2>

        {/* The clock in a ring that keeps widening — "still looking", which a
            clock alone does not say once it has sat on one number for a
            second. `motion-safe` because the ripple is infinite motion: with
            reduced motion it stops outright and the ring is just a ring. */}
        <div className="relative my-7 flex h-28 w-28 items-center justify-center">
          <span
            aria-hidden="true"
            className="absolute inset-3 rounded-full border border-white/25 motion-safe:animate-ping"
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full border border-white/12 bg-black/35"
          />
          <span
            role="timer"
            aria-live="off"
            className="relative font-display text-2xl font-semibold tabular-nums text-ink"
          >
            {clock(elapsed)}
          </span>
        </div>

        <p className="text-sm text-white/70">
          {format(t.versusYourLeague, { league })}
          {rating !== null && (
            <>
              <span className="px-1.5 text-white/30">·</span>
              <span className="whitespace-nowrap font-semibold tabular-nums text-ink">
                {format(t.versusRatingValue, { n: rating })}
              </span>
            </>
          )}
        </p>

        <button
          type="button"
          onClick={() => void cancel()}
          // Not `disabled` while the cancel is out: `cancel` already refuses a
          // second press, and a disabled button drops keyboard focus to the
          // document just as the screen may be about to change under it.
          aria-busy={cancelling}
          className={`${SUMMARY_BUTTON} relative mt-6 border-white/25 bg-transparent text-white/80 hover:border-white/45 hover:text-ink ${
            cancelling ? "cursor-progress opacity-60" : ""
          }`}
        >
          {t.versusSearchCancel}
          {/* The same trace as the start page's buttons: a cancel is a round
              trip too, and dimming alone read as a button that had died. */}
          {cancelling && (
            <span aria-hidden="true" className="round-trace">
              <i />
              <i />
              <i />
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

/** Answers after which a poll can never succeed for this seat. */
function isTerminal(reason: string): boolean {
  return reason === "gone" || reason === "forbidden" || reason === "not-found";
}

/** `m:ss`. A search never runs to an hour, so there is no third field. */
function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/* -------------------------------------------------------------------------
   Starting a search
   ------------------------------------------------------------------------- */

/** A seat in a match, as every way into one hands it back. */
export interface SeatCredentials {
  matchId: string;
  code: string;
  seat: Seat;
  token: string;
}

/** Why a press did not open a search: the two the player can act on. */
export type FindError = "failed" | "needs-username";

/**
 * The "find opponent" press, shared by the start page and the end of an
 * online match — the two places it is offered, which must do the same thing.
 *
 * The seat is written before navigating, for the reason `VersusStart` gives
 * for invitations: the match page arriving with no seat would try to *join*
 * the lobby this player had just opened. `busy` stays on once the search is
 * open, because the page is about to change and a button that came back in
 * between would invite a second lobby.
 *
 * **One attempt key per search, kept until an answer arrives.** The press
 * seats the player on the server before it answers, so an answer lost on the
 * way back used to mean a seat — perhaps opposite somebody already waiting —
 * that the player would never reach, and a second press that forfeited it.
 * The key is the token of whatever seat the press takes, made here so it
 * survives the lost answer: pressing again sends the same one, and the server
 * hands that seat back instead of taking another (`liveSeatForToken`).
 *
 * **The match it was pressed from goes with it.** The end screen passes its
 * own seat; the start page passes the last online match this tab finished
 * (`readLastOnlineMatch`), if any. The server checks it and keeps the two
 * players of that match apart — the only way "not the same opponent twice in a
 * row" can reach a guest.
 */
export function useFindOpponent(after?: StoredSeat | null): {
  find: () => void;
  busy: boolean;
  error: FindError | null;
} {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<FindError | null>(null);
  const inFlight = useRef(false);
  const attempt = useRef<string | null>(null);

  const find = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);

    attempt.current ??= newAttemptKey();
    const previous = after === undefined ? readLastOnlineMatch() : after;

    void (async () => {
      let result: Awaited<ReturnType<typeof findVersusOpponent>> | null;
      try {
        result = await findVersusOpponent({
          attempt: attempt.current ?? undefined,
          after: previous
            ? { matchId: previous.matchId, token: previous.token }
            : null,
        });
      } catch {
        result = null;
      }

      if (!result || !result.ok) {
        setError(
          result && result.reason === "needs-username"
            ? "needs-username"
            : "failed",
        );
        setBusy(false);
        inFlight.current = false;
        return;
      }

      attempt.current = null;
      writeVersusSeat(result.code, {
        matchId: result.matchId,
        token: result.token,
        seat: result.seat,
      });
      router.push(`/versus/${result.code}`);
    })();
  }, [router, after]);

  return { find, busy, error };
}

/**
 * What a failed press says, wherever the button is. An account with no
 * username is told where to choose one — it plays online under it, and a
 * nameless rated seat would be a shape no other seat has (`findVersusOpponent`).
 */
export function FindOpponentError({
  error,
  t,
}: {
  error: FindError | null;
  t: Dict;
}) {
  if (error === null) return null;

  if (error === "needs-username") {
    return (
      <p role="alert" className="text-xs text-bad">
        {t.versusNeedsUsername}{" "}
        <Link
          href={ACCOUNT_PATH}
          className="font-semibold text-ink underline underline-offset-4 transition hover:opacity-80"
        >
          {t.versusChooseUsername}
        </Link>
      </p>
    );
  }

  return (
    <p role="alert" className="text-xs text-bad">
      {t.versusSearchFailed}
    </p>
  );
}

/** 32 bytes from the browser's CSPRNG, base64url — a seat token's shape. */
function newAttemptKey(): string {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window
    .btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/* -------------------------------------------------------------------------
   The seat, kept in the tab
   ------------------------------------------------------------------------- */

/*
 * Here rather than in the game, because three screens write a seat now — the
 * start page (an invitation or a search), the search when it is moved, and the
 * end of an online match — and one key format read by one parser is the only
 * way a seat written by one of them is found by the page that reads it.
 */

export interface StoredSeat {
  matchId: string;
  token: string;
  seat: Seat;
}

function seatKey(code: string): string {
  return `tempus:versus:${code}`;
}

export function readVersusSeat(code: string): StoredSeat | null {
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

export function writeVersusSeat(code: string, seat: StoredSeat): void {
  try {
    window.sessionStorage.setItem(seatKey(code), JSON.stringify(seat));
  } catch {
    // Storage can be unavailable in private browsing. The match still exists
    // and the navigation that follows still works; the cost is that a reload
    // comes back as a new player rather than in this seat.
  }
}

export function clearVersusSeat(code: string): void {
  try {
    window.sessionStorage.removeItem(seatKey(code));
  } catch {
    // Nothing to do.
  }
}

/*
 * The last online match this tab played to the end, for the start page's
 * "Find opponent" (see `useFindOpponent`). Per tab like the seats, and for the
 * same reason: it is a seat, and a seat is a bearer token.
 */

const LAST_ONLINE_KEY = "tempus:versus:last-online";

export function readLastOnlineMatch(): StoredSeat | null {
  try {
    const raw = window.sessionStorage.getItem(LAST_ONLINE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const { matchId, token, seat } = parsed as Record<string, unknown>;
    if (typeof matchId !== "string" || typeof token !== "string") return null;
    if (seat !== 1 && seat !== 2) return null;

    return { matchId, token, seat };
  } catch {
    return null;
  }
}

export function writeLastOnlineMatch(seat: StoredSeat): void {
  try {
    window.sessionStorage.setItem(LAST_ONLINE_KEY, JSON.stringify(seat));
  } catch {
    // Without it the start page's search simply carries no previous match.
  }
}
