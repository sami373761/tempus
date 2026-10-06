/**
 * Data access for head-to-head matches.
 *
 * Takes an explicit client like lib/db/queries.ts does, but unlike that module
 * every function here needs the **service-role** client: `anon` can read the
 * `match` row and nothing else, and no role but `service_role` may execute the
 * `versus_*` functions. That is the point rather than an inconvenience — it
 * means there is exactly one way to move a match forward, and it runs on the
 * server.
 *
 * The division of labour with the database:
 *
 *   * Postgres owns **when** and **whether**. Deadlines, phase changes,
 *     duplicate answers and both-at-once races are settled there, under a row
 *     lock (see the migration's header).
 *   * This module owns **what**. Which events a match is about, what a guess
 *     is worth, and what each seat is allowed to be told.
 *
 * Nothing here trusts a client for anything it could lie about. The seat comes
 * from a token hash, the round index is checked against the live round, and
 * the elapsed time is measured from the server's own round start — a client
 * that claims it answered in 10ms is simply not asked.
 */

import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type { Database } from "./database.types.ts";
import type { DbClient } from "./queries.ts";
import { eventsByIds, randomEvents } from "./queries.ts";
import { DEFAULT_LOCALE } from "./types.ts";
import { gradeGuess, roundPoints } from "../game/scoring.ts";
import {
  maskEvent,
  makeInviteCode,
  parseMatchHistory,
  REVEAL_SECONDS,
  ROUND_SECONDS,
  ROUNDS_PER_MATCH,
  type MaskedEvent,
  type MatchPhase,
  type MatchView,
  type Seat,
} from "../game/versus.ts";

type MatchRow = Database["public"]["Tables"]["match"]["Row"];

/** How many times to retry a colliding invite code before giving up. */
const CODE_ATTEMPTS = 5;

/* -------------------------------------------------------------------------
   Seat tokens
   ------------------------------------------------------------------------- */

/**
 * A seat is held by a bearer token and nothing else — this site has no player
 * accounts and a head-to-head game should not be the thing that introduces
 * them. 32 bytes from the CSPRNG is not guessable; only the hash is stored, so
 * the table is not a list of credentials.
 */
function newToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Which seat this token holds, or null.
 *
 * Compared in the database by hash rather than fetched and compared here: the
 * stored value is already a digest, so there is no secret to leak by letting
 * Postgres do the equality.
 */
export async function seatForToken(
  client: DbClient,
  matchId: string,
  token: string,
): Promise<Seat | null> {
  if (!token) return null;

  const { data, error } = await client
    .from("match_player")
    .select("seat")
    .eq("match_id", matchId)
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (error) throw error;
  return data ? (data.seat as Seat) : null;
}

/** Keeps `last_seen_at` honest. Best effort — a failure must not fail a move. */
export async function touchSeat(
  client: DbClient,
  matchId: string,
  seat: Seat,
): Promise<void> {
  await client
    .from("match_player")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("match_id", matchId)
    .eq("seat", seat);
}

/* -------------------------------------------------------------------------
   Creating and joining
   ------------------------------------------------------------------------- */

export interface SeatCredentials {
  matchId: string;
  code: string;
  seat: Seat;
  /** Shown to this client once and never stored server-side in the clear. */
  token: string;
}

/**
 * Deal one generation's worth of rounds.
 *
 * Drawn with the same `randomEvents` both solo games use, so a match is made
 * of exactly the events the site considers playable — published, and with a
 * primary image (CLAUDE.md's "an event with no photograph is not on the
 * site"). `distinctYears` is not asked for: two rounds landing on the same
 * year is harmless here, unlike in the comparison game where it would make a
 * question unanswerable.
 */
async function dealRounds(
  client: DbClient,
  matchId: string,
  generation: number,
  totalRounds: number,
): Promise<void> {
  const events = await randomEvents(client, { count: totalRounds });

  if (events.length < totalRounds) {
    throw new Error(
      `Not enough playable events to deal a match: wanted ${totalRounds}, ` +
        `the pool has ${events.length}.`,
    );
  }

  const { error } = await client.from("match_round").insert(
    events.map((event, idx) => ({
      match_id: matchId,
      generation,
      idx,
      event_id: event.id,
    })),
  );

  if (error) throw error;
}

/**
 * Open a match and take seat 1.
 *
 * The rounds are dealt now rather than at the start, so the time the draw
 * takes is spent while the host is still looking at the invitation screen
 * instead of between "both ready" and the first question.
 */
export async function createMatch(
  client: DbClient,
): Promise<SeatCredentials> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const code = makeInviteCode(randomBytes(16));

    const { data, error } = await client
      .from("match")
      .insert({
        code,
        total_rounds: ROUNDS_PER_MATCH,
        round_seconds: ROUND_SECONDS,
        reveal_seconds: REVEAL_SECONDS,
        seat1_joined: true,
      })
      .select("id, code")
      .single();

    if (error) {
      // 23505 is unique_violation: the code collided, so try another one.
      // Anything else is a real failure and should not be retried.
      if (error.code !== "23505") throw error;
      lastError = error;
      continue;
    }

    const token = newToken();
    const { error: seatError } = await client.from("match_player").insert({
      match_id: data.id,
      seat: 1,
      token_hash: hashToken(token),
    });
    if (seatError) throw seatError;

    await dealRounds(client, data.id, 1, ROUNDS_PER_MATCH);

    return { matchId: data.id, code: data.code, seat: 1, token };
  }

  throw new Error(
    `Could not allocate an invite code after ${CODE_ATTEMPTS} attempts.`,
    { cause: lastError },
  );
}

export type JoinResult =
  | { ok: true; credentials: SeatCredentials }
  | { ok: false; reason: "not-found" | "full" | "finished" };

/**
 * Take seat 2 against an invite code.
 *
 * A match whose second seat is already taken is `full` rather than an error:
 * the invite link is a URL people paste into group chats, so a third person
 * opening it is an expected thing that needs a sentence, not a stack trace.
 */
export async function joinMatch(
  client: DbClient,
  code: string,
): Promise<JoinResult> {
  const { data: match, error } = await client
    .from("match")
    .select("id, phase, seat2_joined")
    .eq("code", code)
    .maybeSingle();

  if (error) throw error;
  if (!match) return { ok: false, reason: "not-found" };
  if (match.phase === "complete" || match.phase === "abandoned") {
    return { ok: false, reason: "finished" };
  }
  if (match.seat2_joined) return { ok: false, reason: "full" };

  const token = newToken();

  // The primary key on (match_id, seat) is what makes this safe when two
  // people open the link together: the second insert loses and is told the
  // match is full, rather than overwriting the first player's token.
  const { error: seatError } = await client.from("match_player").insert({
    match_id: match.id,
    seat: 2,
    token_hash: hashToken(token),
  });

  if (seatError) {
    if (seatError.code === "23505") return { ok: false, reason: "full" };
    throw seatError;
  }

  const { error: markError } = await client
    .from("match")
    .update({ seat2_joined: true })
    .eq("id", match.id);
  if (markError) throw markError;

  return {
    ok: true,
    credentials: { matchId: match.id, code, seat: 2, token },
  };
}

/* -------------------------------------------------------------------------
   Moves
   ------------------------------------------------------------------------- */

/**
 * The database clock, in epoch milliseconds.
 *
 * Not `Date.now()`, which is what this used to be. Every deadline in a match
 * is stamped by Postgres `clock_timestamp()`, and the browser subtracts
 * `serverNow` from them to decide how long is left — so reporting the Node
 * process's clock compares two machines' idea of the time. Node ahead of
 * Postgres by any margin means every countdown reaches zero before its
 * deadline has really passed, `versus_reconcile` rightly does nothing, and the
 * round stalls at "next round in 0". Measured at 50-112ms of skew on a dev
 * machine, sign not guaranteed.
 *
 * A failure here must not fail a view: the clock is a correction, and falling
 * back to this process's own time is exactly the behaviour it replaces.
 */
export async function databaseNow(client: DbClient): Promise<number> {
  const { data, error } = await client.rpc("versus_db_now");
  if (error || typeof data !== "string") return Date.now();
  const at = Date.parse(data);
  return Number.isNaN(at) ? Date.now() : at;
}

export async function reconcile(
  client: DbClient,
  matchId: string,
): Promise<MatchRow> {
  const { data, error } = await client.rpc("versus_reconcile", {
    p_match_id: matchId,
  });
  if (error) throw error;
  return data as unknown as MatchRow;
}

export async function setReady(
  client: DbClient,
  matchId: string,
  seat: Seat,
  ready: boolean,
): Promise<MatchRow> {
  const { data, error } = await client.rpc("versus_set_ready", {
    p_match_id: matchId,
    p_seat: seat,
    p_ready: ready,
  });
  if (error) throw error;
  return data as unknown as MatchRow;
}

export type SubmitOutcome =
  /** Recorded. */
  | "accepted"
  /** The round had already closed — the deadline passed, or both had answered. */
  | "closed"
  /** For a round that is not the live one; a client that fell behind. */
  | "stale"
  /** This seat had already answered. Not an error: a retry or a double press. */
  | "duplicate";

/**
 * Grade a guess and offer it to the round.
 *
 * The grading happens here because `gradeGuess` is the application's rule and
 * there should be exactly one copy of it; whether the graded answer *counts*
 * is then entirely the database's call. So this can be read as: work out what
 * the guess was worth, hand it over, and accept the verdict on whether it
 * arrived in time.
 *
 * `elapsedMs` is measured from the round's own `round_started_at`, never from
 * anything the client said. A client cannot report a faster answer than it
 * gave, and a client with a wrong clock does not record a nonsense time.
 */
export async function submitGuess(
  client: DbClient,
  {
    matchId,
    seat,
    roundIdx,
    guess,
  }: { matchId: string; seat: Seat; roundIdx: number; guess: number },
): Promise<SubmitOutcome> {
  const match = await reconcile(client, matchId);

  if (match.phase !== "playing") return "closed";
  if (match.current_idx !== roundIdx) return "stale";

  const { data: round, error: roundError } = await client
    .from("match_round")
    .select("event_id")
    .eq("match_id", matchId)
    .eq("generation", match.generation)
    .eq("idx", roundIdx)
    .maybeSingle();

  if (roundError) throw roundError;
  if (!round) return "stale";

  const { data: event, error: eventError } = await client
    .from("event")
    .select("year")
    .eq("id", round.event_id)
    .single();

  if (eventError) throw eventError;

  const accuracy = gradeGuess(guess, event.year);
  const startedAt = match.round_started_at
    ? Date.parse(match.round_started_at)
    : Date.now();

  const { data, error } = await client.rpc("versus_submit", {
    p_match_id: matchId,
    p_seat: seat,
    p_idx: roundIdx,
    p_guess: guess,
    p_verdict: accuracy.verdict,
    p_points: roundPoints(accuracy),
    p_elapsed_ms: Math.max(0, Math.round(Date.now() - startedAt)),
  });

  if (error) throw error;

  const result = (data as unknown as { result: SubmitOutcome }).result;
  return result;
}

export async function requestRematch(
  client: DbClient,
  matchId: string,
  seat: Seat,
): Promise<void> {
  const { error } = await client.rpc("versus_request_rematch", {
    p_match_id: matchId,
    p_seat: seat,
  });
  if (error) throw error;
}

export async function declineRematch(
  client: DbClient,
  matchId: string,
  seat: Seat,
): Promise<void> {
  const { error } = await client.rpc("versus_decline_rematch", {
    p_match_id: matchId,
    p_seat: seat,
  });
  if (error) throw error;
}

/**
 * Accept a rematch: deal the next generation, then flip the match onto it.
 *
 * Dealt before the flip because `versus_start_rematch` refuses to start a
 * generation it has no rounds for — so a failure here leaves the match sitting
 * on its completed result rather than live on rounds that do not exist.
 */
export async function acceptRematch(
  client: DbClient,
  matchId: string,
): Promise<void> {
  const { data: match, error } = await client
    .from("match")
    .select("generation, total_rounds, phase")
    .eq("id", matchId)
    .single();

  if (error) throw error;
  if (match.phase !== "complete") return;

  const next = match.generation + 1;

  // Re-entrant: two accepts in flight, or a retry after a half-finished one,
  // must not deal the generation twice.
  const { count, error: countError } = await client
    .from("match_round")
    .select("idx", { count: "exact", head: true })
    .eq("match_id", matchId)
    .eq("generation", next);

  if (countError) throw countError;

  if ((count ?? 0) < match.total_rounds) {
    await dealRounds(client, matchId, next, match.total_rounds);
  }

  const { error: startError } = await client.rpc("versus_start_rematch", {
    p_match_id: matchId,
  });
  if (startError) throw startError;
}

/** Give up a match that has not finished, so the opponent is not left hanging. */
export async function abandonMatch(
  client: DbClient,
  matchId: string,
): Promise<void> {
  const { error } = await client
    .from("match")
    .update({ phase: "abandoned" as MatchPhase })
    .eq("id", matchId)
    .in("phase", ["lobby", "playing", "revealed"]);
  if (error) throw error;
}

/* -------------------------------------------------------------------------
   Reading
   ------------------------------------------------------------------------- */

/**
 * Everything one seat is allowed to know, as of now.
 *
 * Reconciles first, so what comes back is the match as the clock leaves it
 * rather than as the last player to touch it left it. That is what makes a
 * reload or a reconnect self-healing: the client throws its state away, asks
 * again, and gets the truth.
 */
export async function buildMatchView(
  client: DbClient,
  {
    matchId,
    seat,
    locale = DEFAULT_LOCALE,
  }: { matchId: string; seat: Seat; locale?: string },
): Promise<MatchView> {
  // The clock is read *alongside* the reconcile rather than after it, and the
  // difference is not cosmetic. The browser takes `serverNow` as the server's
  // time at the midpoint of the round trip, so a sample taken late in the
  // request biases its offset high — the countdown then ends before the
  // deadline really has, and the client prompts a server that correctly
  // declines to do anything. Sampling early biases it the other way, and a
  // countdown that ends late meets a server that has already moved on.
  const [match, serverNow] = await Promise.all([
    reconcile(client, matchId),
    databaseNow(client),
  ]);

  const [events, own] = await Promise.all([
    visibleEvents(client, match, locale),
    seatAnswer(client, match, seat),
  ]);

  return {
    matchId: match.id,
    code: match.code,
    seat,
    phase: match.phase,
    generation: match.generation,
    totalRounds: match.total_rounds,
    roundSeconds: match.round_seconds,
    revealSeconds: match.reveal_seconds,
    currentIdx: match.current_idx,
    roundStartedAt: toEpoch(match.round_started_at),
    roundDeadlineAt: toEpoch(match.round_deadline_at),
    revealUntilAt: toEpoch(match.reveal_until_at),
    answeredCount: match.answered_count,
    seats: {
      1: {
        joined: match.seat1_joined,
        ready: match.seat1_ready,
        score: match.seat1_score,
      },
      2: {
        joined: match.seat2_joined,
        ready: match.seat2_ready,
        score: match.seat2_score,
      },
    },
    history: parseMatchHistory(match.history),
    rematchBy: toSeat(match.rematch_by),
    rematchDeclinedBy: toSeat(match.rematch_declined_by),
    youAnswered: own !== null,
    yourGuess: own,
    version: match.version,
    serverNow,
    events,
  };
}

/**
 * This seat's own guess for the live round, or null if it has not answered.
 *
 * Safe to return, and the reason the view is per seat: it is the caller's own
 * answer, never the opponent's. The opponent's reaches a client only through
 * `match.history`, once the round has closed.
 */
async function seatAnswer(
  client: DbClient,
  match: MatchRow,
  seat: Seat,
): Promise<number | null> {
  const { data, error } = await client
    .from("match_answer")
    .select("guess")
    .eq("match_id", match.id)
    .eq("generation", match.generation)
    .eq("idx", match.current_idx)
    .eq("seat", seat)
    .maybeSingle();

  if (error) throw error;
  return data ? data.guess : null;
}

/**
 * The live round's event and the next one's, masked.
 *
 * Two is the whole look-ahead a client gets. One would mean the next
 * photograph starts downloading at the moment it is needed; all ten would let
 * a player read the questions before they are asked, which is the same leak as
 * sending the years — slower to exploit, but the same thing.
 */
async function visibleEvents(
  client: DbClient,
  match: MatchRow,
  locale: string,
): Promise<Record<number, MaskedEvent>> {
  if (match.phase === "lobby" || match.phase === "abandoned") return {};

  const wanted = [match.current_idx, match.current_idx + 1].filter(
    (idx) => idx < match.total_rounds,
  );

  const { data: rounds, error } = await client
    .from("match_round")
    .select("idx, event_id")
    .eq("match_id", match.id)
    .eq("generation", match.generation)
    .in("idx", wanted);

  if (error) throw error;
  if (!rounds || rounds.length === 0) return {};

  const ids = rounds.map((round) => round.event_id);
  const events = await eventsByIds(client, ids, locale);
  const byId = new Map(events.map((event) => [event.id, event]));

  const visible: Record<number, MaskedEvent> = {};
  for (const round of rounds) {
    const event = byId.get(round.event_id);
    if (event) visible[round.idx] = maskEvent(event);
  }
  return visible;
}

function toEpoch(value: string | null): number | null {
  return value === null ? null : Date.parse(value);
}

function toSeat(value: number | null): Seat | null {
  return value === 1 || value === 2 ? value : null;
}
