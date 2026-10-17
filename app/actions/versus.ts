"use server";

import type { User } from "@supabase/supabase-js";

import { getCurrentUser } from "@/lib/auth/server";
import { readChronoRating, readUsername } from "@/lib/db/accounts";
import { createAdminDbClient } from "@/lib/db/admin";
import {
  abandonMatch,
  acceptRematch,
  buildMatchView,
  cancelSearch,
  createMatch,
  declineRematch,
  finishedPublicMatch,
  forfeitOpenPublicMatches,
  isSeatTokenShape,
  joinMatch,
  liveSeatForToken,
  matchmake,
  moveSeatToken,
  readMoveTarget,
  readSearchState,
  requestRematch,
  seatBot,
  seatForToken,
  setReady,
  submitGuess,
  touchSeat,
  type Searcher,
  type SubmitOutcome,
} from "@/lib/db/matches";
import { paneBounds, TIMELINE_PANES } from "@/lib/game/timeline";
import {
  DEFAULT_VERSUS_MODE,
  isInviteCode,
  isVersusMode,
  normalizeInviteCode,
  PUBLIC_VERSUS_MODE,
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
 * server's. A client that lies gets an error, not an advantage. The three that
 * hand out a seat rather than use one — creating, joining and finding — read
 * who the caller is from the session, never from an argument.
 *
 * They are Server Actions rather than route handlers for the same reason the
 * solo game's round dealer is: they are called from a Client Component, and
 * this is the call that needs no endpoint, no fetch wrapper and no second copy
 * of the argument types.
 *
 * **These are not the real-time channel.** Supabase pushes the `match` row to
 * both clients when it changes (see lib/realtime/match-channel.ts); these
 * actions are what *causes* those changes, plus one read for a client that is
 * arriving or has just reconnected. One is called on a timer, only in online
 * matches: the searching screen's poll (`pollVersusSearch`), which is where two
 * searchers are paired and where the wait ends. The live round's heartbeat —
 * what gives a seat with no browser behind it the chance to answer — is *not*
 * here but a Route Handler (app/api/versus/tick), because a page's Server
 * Actions run one at a time and a beat in flight would hold a lock-in back
 * behind it (see `PUBLIC_TICK_MS`). A private match is never polled.
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

/* -------------------------------------------------------------------------
   Online matchmaking
   ------------------------------------------------------------------------- */

export type FindResult =
  | { ok: true; matchId: string; code: string; seat: Seat; token: string }
  | ActionFailure;

/** What a "Find opponent" press may say about itself. Both are optional. */
export interface FindRequest {
  /**
   * The attempt key: 32 random bytes, base64url, made by the client and kept
   * until an answer arrives. It becomes the token of whatever seat this press
   * takes, so a press retried after a lost answer finds that seat rather than
   * taking a second one (`liveSeatForToken`). Anything not shaped like a token
   * is ignored and a token is minted instead.
   */
  attempt?: string;
  /**
   * The seat in the public match this press was made from, i.e. the end
   * screen's "Find new opponent". Checked, then stamped on the new lobby so
   * the two players just finished are not paired again — the only way that
   * rule can reach a guest, who has no ledger row to be recognised by.
   */
  after?: { matchId: string; token: string } | null;
}

/**
 * Press "Find opponent": sit down opposite someone already waiting, or open a
 * lobby and wait.
 *
 * Returns seat credentials exactly like `createVersusMatch`, and the client
 * treats them the same way — it stores the seat and goes to the match page,
 * which renders the searching screen while the match is still a lobby. So the
 * online game is not a second game screen, only a second way in.
 *
 * **A retry first.** A press whose answer was lost has already seated its
 * player — possibly opposite somebody now waiting at question one — so the
 * attempt key is looked up before anything else and that seat handed back
 * (`liveSeatForToken`). Before the forfeits, too: the seat it finds is exactly
 * the unfinished online match they would otherwise close as a loss.
 *
 * **An account plays under its username.** One with none yet (a Google
 * sign-up whose name was taken) is sent to choose one first, `needs-username`:
 * seated, it would appear as "Guest" beside a rating — a shape no other seat
 * has, since a real guest has no rating and a bot posing as one shows none
 * either — and its opponent would know at a glance that it was a person.
 *
 * **Forfeits first, rating second.** An account's other unfinished online
 * matches are closed before anything else, as losses where they had started
 * (`forfeitOpenPublicMatches`) — which can move this player's rating, so the
 * rating that seats them is read *after* that, not before. Otherwise a player
 * could abandon a losing match, re-queue on the rating they had before the
 * loss landed, and be matched a league above where they now stand. The
 * previous match (`after`) is checked after them too, so the one just
 * forfeited counts as finished.
 *
 * A guest has nothing to forfeit and nothing to read: no name, no rating, the
 * bottom league.
 */
export async function findVersusOpponent(
  request: FindRequest = {},
): Promise<FindResult> {
  const admin = createAdminDbClient();

  try {
    const attempt = isSeatTokenShape(request?.attempt) ? request.attempt : undefined;
    if (attempt) {
      const held = await liveSeatForToken(admin, attempt);
      if (held) return { ok: true, ...held };
    }

    const user = await getCurrentUser();

    const after = request?.after;
    const previousMatch = (): Promise<string | null> =>
      after &&
      typeof after.matchId === "string" &&
      UUID.test(after.matchId) &&
      typeof after.token === "string" &&
      after.token.length > 0
        ? finishedPublicMatch(admin, after.matchId, after.token)
        : Promise.resolve(null);

    let searcher: Searcher = { userId: null, rating: null, name: null };
    let previousMatchId: string | null;
    if (user) {
      // Side by side, to save a round trip: closing an account's open online
      // matches is right whether or not it may search now — a match it has
      // walked away from to search again is lost either way.
      const [name] = await Promise.all([
        readUsername(admin, user.id),
        forfeitOpenPublicMatches(admin, user.id),
      ]);
      if (name === null) return { ok: false, reason: "needs-username" };

      const [rating, previous] = await Promise.all([
        readChronoRating(admin, user.id),
        previousMatch(),
      ]);
      searcher = { userId: user.id, name, rating };
      previousMatchId = previous;
    } else {
      previousMatchId = await previousMatch();
    }

    const found = await matchmake(admin, {
      ownMatchId: null,
      avoidMatchId: previousMatchId,
      seatToken: attempt,
      ...searcher,
    });
    if (found.status === "joined") return { ok: true, ...found.credentials };

    // With no lobby of its own `matchmake` can only join or find nobody; any
    // other word means the same as nobody — open a lobby.
    const credentials = await createMatch(
      admin,
      PUBLIC_VERSUS_MODE,
      searcher.userId,
      { name: searcher.name, rating: searcher.rating, previousMatchId },
      attempt,
    );
    return { ok: true, ...credentials };
  } catch (error) {
    console.error("findVersusOpponent failed", error);
    return { ok: false, reason: "server" };
  }
}

export type SearchPollResult =
  | { ok: true; status: "searching" }
  | { ok: true; status: "matched"; view: MatchView }
  | { ok: true; status: "moved"; matchId: string; code: string; seat: Seat; token: string }
  | ActionFailure;

/**
 * One tick of the searching screen.
 *
 * Each tick tries matchmaking again *from* this host's lobby, so a host can be
 * moved into an older lobby that a second searcher opened at the same moment
 * (`moved`: new credentials, a new match page; the old lobby is closed,
 * unrated). Only older, never newer, so two hosts polling at once can never
 * both move — one of them is the older lobby.
 *
 * `fallback` is the client saying its wait is over. It is a request, not a
 * permission: `versus_seat_bot` refuses until `SEARCH_FALLBACK_MIN_MS` after
 * the lobby opened (`early`, keep searching), so a client that sends it on its
 * first tick only waits the same as everyone else. When the bot does sit down,
 * the answer is `matched` with the started match's view — the same answer a
 * person sitting down produces, because to this client it is the same event.
 *
 * Identity is the session's, read on every tick rather than trusted from the
 * lobby or the client, for the same reason `findVersusOpponent` reads it: a
 * move seats this caller in somebody else's match as the account it really is.
 * (An account whose username has gone since it searched is not moved, for
 * the reason `findVersusOpponent` refuses one; it can still be given a
 * stand-in, opposite whom nobody sees its name.)
 *
 * **A move can be told twice.** It commits before its answer leaves, and that
 * answer is the only place the new seat is written down — so the seat it
 * takes has a token derived from this one (`moveSeatToken`), and a poll that
 * finds its lobby closed with nobody in it first asks whether a move closed it
 * (`readMoveTarget`). A lost answer is then repeated on the next tick instead
 * of becoming "gone", with the player sent home and an opponent waiting for
 * them at question one.
 */
export async function pollVersusSearch(
  matchId: string,
  token: string,
  fallback: boolean,
): Promise<SearchPollResult> {
  return withSeat(matchId, token, async (admin, seat): Promise<SearchPollResult> => {
    // The identity is read alongside the lobby rather than after it: this runs
    // every `SEARCH_POLL_MS` against a database a continent away, and the two
    // reads do not depend on each other.
    const [state, searcher, locale] = await Promise.all([
      readSearchState(admin, matchId),
      getCurrentUser().then((user) => searcherFor(admin, user)),
      readLocale(),
    ]);

    const matched = async (): Promise<SearchPollResult> => ({
      ok: true,
      status: "matched",
      view: await buildMatchView(admin, { matchId, seat, locale }),
    });

    if (!state) return GONE;
    // Nothing to search for — an invitation, or the seat that was found. Both
    // are answered with the match as it stands, which the client adopts.
    if (!state.isPublic || seat !== 1) return matched();
    // Closed with nobody in it: merged away (then the seat it was moved to),
    // or cancelled in another tab, or closed by a search started elsewhere —
    // not a match to show; back to the start.
    if (state.phase === "abandoned" && !state.seat2Joined) {
      const target = await readMoveTarget(admin, matchId, token);
      return target ? { ok: true, status: "moved", ...target } : GONE;
    }
    if (state.phase !== "lobby" || state.seat2Joined) return matched();

    if (searcher.userId === null || searcher.name !== null) {
      const found = await matchmake(admin, {
        ownMatchId: matchId,
        seatToken: moveSeatToken(matchId, token),
        ...searcher,
      });
      if (found.status === "joined") {
        return { ok: true, status: "moved", ...found.credentials };
      }
      if (found.status === "matched") return matched();
      if (found.status === "gone") return GONE;
    }

    if (fallback !== true) return SEARCHING;

    const seated = await seatBot(admin, matchId);
    if (seated === "seated" || seated === "matched") return matched();
    if (seated === "early") return SEARCHING;
    return GONE;
  });
}

/**
 * Stop searching.
 *
 * Closes the lobby only if nobody has sat down in it yet (`cancelSearch` —
 * unrated by construction). If somebody had, the answer is `matched`, not a
 * forfeit: Cancel and the fallback race at exactly the moment a player gives
 * up, and pressing Cancel must never be what costs them a loss. The client
 * should fetch the view and play.
 */
export async function cancelVersusSearch(
  matchId: string,
  token: string,
): Promise<{ ok: true } | ActionFailure> {
  return withSeat(
    matchId,
    token,
    async (admin, seat): Promise<{ ok: true } | ActionFailure> => {
      const outcome = await cancelSearch(admin, matchId, seat);
      return outcome === "cancelled"
        ? { ok: true }
        : { ok: false, reason: "matched" };
    },
  );
}

/* -------------------------------------------------------------------------
   Playing
   ------------------------------------------------------------------------- */

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
 * Returns the outcome as well as the new state, because the five outcomes mean
 * different things on screen: `accepted` starts the wait for the opponent,
 * `duplicate` means this seat had already answered and the UI was behind,
 * `closed` means the clock beat them, `stale` means they answered a question
 * that is no longer the one being asked, and `early` means the question has
 * not been asked yet — an online match's intro was still on screen.
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

/**
 * Offer a rematch. A no-op in an online match — `versus_request_rematch`
 * returns a public row unchanged — so a stale client that still shows the
 * button gets the same view back rather than an error.
 */
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
 *
 * The seat goes with it because in a started online match leaving is a
 * forfeit, and the database has to know whose (`versus_abandon`).
 */
export async function leaveVersusMatch(
  matchId: string,
  token: string,
): Promise<{ ok: true } | ActionFailure> {
  return withSeat(matchId, token, async (admin, seat) => {
    await abandonMatch(admin, matchId, seat);
    return { ok: true };
  });
}

/* -------------------------------------------------------------------------
   Shared plumbing
   ------------------------------------------------------------------------- */

/** The guessable span, read off the timeline's own outermost panes. */
const GUESS_MIN = paneBounds(TIMELINE_PANES[0]!).min;
const GUESS_MAX = paneBounds(TIMELINE_PANES[TIMELINE_PANES.length - 1]!).max;

const SEARCHING = { ok: true, status: "searching" } as const;
const GONE = { ok: false, reason: "gone" } as const;

/**
 * Who is searching, from the session and the profile — the one place a
 * searcher's name and rating come from.
 *
 * Read with the service role for the same reason every other read in this
 * module is: the action already holds that client, and a profile read under
 * the caller's own RLS would add a cookie-bound client for a row the action is
 * about to hand to `versus_matchmake` anyway. The name is the username or
 * nothing: an account with no username yet appears as a guest would, rather
 * than as the local part of its email address, which is not the opponent's to
 * see.
 */
async function searcherFor(
  admin: ReturnType<typeof createAdminDbClient>,
  user: User | null,
): Promise<Searcher> {
  if (!user) return { userId: null, rating: null, name: null };

  const [name, rating] = await Promise.all([
    readUsername(admin, user.id),
    readChronoRating(admin, user.id),
  ]);

  return { userId: user.id, name, rating };
}

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
