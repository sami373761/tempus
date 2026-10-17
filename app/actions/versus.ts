"use server";

import { getCurrentUser } from "@/lib/auth/server";
import { createAdminDbClient } from "@/lib/db/admin";
import {
  abandonMatch,
  acceptRematch,
  buildMatchView,
  createMatch,
  declineRematch,
  joinMatch,
  requestRematch,
  seatForToken,
  setReady,
  submitGuess,
  touchSeat,
  type SubmitOutcome,
} from "@/lib/db/matches";
import { paneBounds, TIMELINE_PANES } from "@/lib/game/timeline";
import {
  DEFAULT_VERSUS_MODE,
  isInviteCode,
  isVersusMode,
  normalizeInviteCode,
  type MatchView,
  type Seat,
} from "@/lib/game/versus";
import { readLocale } from "@/lib/i18n/server";

/**
 * The head-to-head mode's entire public surface.
 *
 * Every one of these takes a match id and the caller's seat token, and the
 * first thing each does is turn that pair into a seat — or refuse. There is no
 * "trusted" argument anywhere: the seat is never taken from the client, the
 * round index is checked against the live round, and the clock is the
 * server's. A client that lies gets an error, not an advantage.
 *
 * They are Server Actions rather than route handlers for the same reason the
 * solo game's round dealer is: they are called from a Client Component, and
 * this is the call that needs no endpoint, no fetch wrapper and no second copy
 * of the argument types.
 *
 * **These are not the real-time channel.** Supabase pushes the `match` row to
 * both clients when it changes (see lib/realtime/match-channel.ts); these
 * actions are what *causes* those changes, plus one read for a client that is
 * arriving or has just reconnected. Nothing here is on a poll.
 */

/** Keeps a thrown database error from reaching the browser as a stack trace. */
export type ActionFailure = { ok: false; reason: string };

export type CreateResult =
  | { ok: true; matchId: string; code: string; seat: Seat; token: string }
  | ActionFailure;

/**
 * Open a match on one of the date-guessing pools.
 *
 * The mode is the only argument, and it is the one thing on this surface a
 * client is allowed to choose — which is safe because it chooses between
 * pools the player could already play solo, not between pools and privileges.
 * It is still validated rather than passed through: an unrecognised string
 * would reach `match.mode` and leave a row naming a game that does not exist.
 * Refused rather than defaulted, because a silent fallback here is a match in
 * a mode the player did not pick, and they would only find out at question
 * one.
 */
export async function createVersusMatch(
  mode: string = DEFAULT_VERSUS_MODE,
): Promise<CreateResult> {
  if (typeof mode !== "string" || !isVersusMode(mode)) {
    return { ok: false, reason: "bad-mode" };
  }

  const admin = createAdminDbClient();

  try {
    // The seat is paid TP at the end only if an account took it; the session
    // is read here, never passed in (supabase/migrations/20261017120000_scoring.sql).
    const user = await getCurrentUser();
    const credentials = await createMatch(admin, mode, user?.id ?? null);
    return { ok: true, ...credentials };
  } catch (error) {
    console.error("createVersusMatch failed", error);
    return { ok: false, reason: "server" };
  }
}

export type JoinActionResult =
  | { ok: true; matchId: string; code: string; seat: Seat; token: string }
  | ActionFailure;

/**
 * Take the free seat on an invitation.
 *
 * The code is normalized before it is looked up, because it arrives from a URL
 * someone may have retyped in lower case off a phone screen.
 */
export async function joinVersusMatch(
  rawCode: string,
): Promise<JoinActionResult> {
  const code = normalizeInviteCode(String(rawCode ?? ""));
  if (!isInviteCode(code)) return { ok: false, reason: "not-found" };

  const admin = createAdminDbClient();

  try {
    const user = await getCurrentUser();
    const result = await joinMatch(admin, code, user?.id ?? null);
    if (!result.ok) return { ok: false, reason: result.reason };
    return { ok: true, ...result.credentials };
  } catch (error) {
    console.error("joinVersusMatch failed", error);
    return { ok: false, reason: "server" };
  }
}

export type ViewResult = { ok: true; view: MatchView } | ActionFailure;

/**
 * The current state for one seat.
 *
 * Called on mount, whenever the realtime channel reconnects, and whenever a
 * round changes (the pushed row carries the state but not the next question's
 * picture). It reconciles first, so it doubles as the "my countdown reached
 * zero" call — a client reporting that time is up is only ever *prompting* the
 * server to look at its own clock.
 */
export async function fetchMatchView(
  matchId: string,
  token: string,
): Promise<ViewResult> {
  return withSeat(matchId, token, async (admin, seat) => {
    const locale = await readLocale();
    void touchSeat(admin, matchId, seat).catch(() => {});
    return { ok: true, view: await buildMatchView(admin, { matchId, seat, locale }) };
  });
}

export async function setMatchReady(
  matchId: string,
  token: string,
  ready: boolean,
): Promise<ViewResult> {
  return withSeat(matchId, token, async (admin, seat) => {
    await setReady(admin, matchId, seat, Boolean(ready));
    const locale = await readLocale();
    return { ok: true, view: await buildMatchView(admin, { matchId, seat, locale }) };
  });
}

export type SubmitResult =
  | { ok: true; outcome: SubmitOutcome; view: MatchView }
  | ActionFailure;

/**
 * Lock in a guess.
 *
 * Returns the outcome as well as the new state, because the four outcomes mean
 * different things on screen: `accepted` starts the wait for the opponent,
 * `duplicate` means this seat had already answered and the UI was behind,
 * `closed` means the clock beat them, and `stale` means they answered a
 * question that is no longer the one being asked.
 */
export async function submitVersusGuess(
  matchId: string,
  token: string,
  roundIdx: number,
  guess: number,
): Promise<SubmitResult> {
  const idx = Math.trunc(Number(roundIdx));
  const year = Math.trunc(Number(guess));

  if (!Number.isFinite(idx) || idx < 0) {
    return { ok: false, reason: "bad-round" };
  }
  // The rail cannot be dragged outside this, but the action can be called
  // without the rail. Bounds come from the timeline itself so they cannot
  // drift from what is reachable on screen.
  if (!Number.isFinite(year) || year < GUESS_MIN || year > GUESS_MAX) {
    return { ok: false, reason: "bad-guess" };
  }

  return withSeat(matchId, token, async (admin, seat) => {
    const outcome = await submitGuess(admin, {
      matchId,
      seat,
      roundIdx: idx,
      guess: year,
    });
    const locale = await readLocale();
    return {
      ok: true,
      outcome,
      view: await buildMatchView(admin, { matchId, seat, locale }),
    };
  });
}

export async function requestVersusRematch(
  matchId: string,
  token: string,
): Promise<ViewResult> {
  return withSeat(matchId, token, async (admin, seat) => {
    await requestRematch(admin, matchId, seat);
    const locale = await readLocale();
    return { ok: true, view: await buildMatchView(admin, { matchId, seat, locale }) };
  });
}

export async function answerVersusRematch(
  matchId: string,
  token: string,
  accept: boolean,
): Promise<ViewResult> {
  return withSeat(matchId, token, async (admin, seat) => {
    if (accept) await acceptRematch(admin, matchId, seat);
    else await declineRematch(admin, matchId, seat);

    const locale = await readLocale();
    return { ok: true, view: await buildMatchView(admin, { matchId, seat, locale }) };
  });
}

/**
 * Leave a match that has not finished.
 *
 * Sent on a deliberate exit, not on a tab close — a closed tab is a
 * disconnect, and a disconnect is temporary until the clock says otherwise.
 * Treating the two the same would end a match every time somebody's phone
 * locked.
 */
export async function leaveVersusMatch(
  matchId: string,
  token: string,
): Promise<{ ok: true } | ActionFailure> {
  return withSeat(matchId, token, async (admin) => {
    await abandonMatch(admin, matchId);
    return { ok: true };
  });
}

/* -------------------------------------------------------------------------
   Shared plumbing
   ------------------------------------------------------------------------- */

/** The guessable span, read off the timeline's own outermost panes. */
const GUESS_MIN = paneBounds(TIMELINE_PANES[0]!).min;
const GUESS_MAX = paneBounds(TIMELINE_PANES[TIMELINE_PANES.length - 1]!).max;

/**
 * Turn (match, token) into a seat, or refuse — and keep database errors from
 * crossing back to the browser verbatim.
 *
 * Every action goes through this, which is what makes "the client never
 * chooses its own seat" a property of the module rather than a rule each
 * action has to remember.
 */
async function withSeat<T extends { ok: true } | ActionFailure>(
  matchId: string,
  token: string,
  run: (
    admin: ReturnType<typeof createAdminDbClient>,
    seat: Seat,
  ) => Promise<T>,
): Promise<T | ActionFailure> {
  if (typeof matchId !== "string" || !UUID.test(matchId)) {
    return { ok: false, reason: "not-found" };
  }
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, reason: "forbidden" };
  }

  const admin = createAdminDbClient();

  try {
    const seat = await seatForToken(admin, matchId, token);
    if (seat === null) return { ok: false, reason: "forbidden" };
    return await run(admin, seat);
  } catch (error) {
    console.error("versus action failed", { matchId, error });
    return { ok: false, reason: "server" };
  }
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
