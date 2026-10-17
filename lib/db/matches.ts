/**
 * Data access for head-to-head matches.
 *
 * Takes an explicit client like lib/db/queries.ts does, but unlike that module
 * every function here needs the **service-role** client: `anon` can read the
 * granted columns of the `match` row and nothing else (not even its invite
 * code — see `MATCH_CLIENT_COLUMNS`), and no role but `service_role` may execute the
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
 *
 * **Online matches add one more party nobody can see.** A public lobby that no
 * person fills in time is filled by a bot (`seatBot`), and the bot is planned
 * here, once, at the moment it sits down: every answer it will give, graded by
 * the one grader, with the moment it will give it. Postgres then plays those
 * answers out of `match_round` as the clock reaches them (`versus_reconcile`),
 * so there is no worker, no queue and nothing that can fall behind. What the
 * bot *is* — `bot_level`, `bot_archetype`, the planned guesses — lives in
 * tables no client role can read; the only trace on the `match` row is a name
 * and a rating, which a person's seat has too.
 */

import "server-only";

import { createHash, randomBytes, randomInt } from "node:crypto";

import type { Database, Json } from "./database.types.ts";
import type { DbClient } from "./queries.ts";
import { eventCategorySlugs, eventsByIds, randomEvents } from "./queries.ts";
import { DEFAULT_LOCALE } from "./types.ts";
import { BOT_GUEST_CHANCE, botShownRating, pickBotNames } from "../game/bot-names.ts";
import { chronoTier } from "../game/chrono-rating.ts";
import { screenFormatOf } from "../game/screen.ts";
import { gradeGuess, roundPoints } from "../game/scoring.ts";
import {
  botProfile,
  pickBotArchetype,
  planBotMatch,
  type BotLevel,
  type Rng,
} from "../game/versus-bot.ts";
import {
  asVersusMode,
  maskEvent,
  makeInviteCode,
  NEAR_RATING_WINDOW,
  parseMatchHistory,
  PUBLIC_LOBBY_FRESH_SECONDS,
  PUBLIC_MATCH_INTRO_SECONDS,
  PUBLIC_VERSUS_MODE,
  publicSeatFields,
  REVEAL_SECONDS,
  ROUND_SECONDS,
  ROUNDS_PER_MATCH,
  SEARCH_FALLBACK_MIN_MS,
  SEARCH_HOST_SEEN_MS,
  TICK_PUSH_GRACE_MS,
  versusModeSpec,
  type MaskedEvent,
  type MatchPhase,
  type MatchView,
  type Seat,
  type TickResponse,
  type VersusMode,
} from "../game/versus.ts";
import { maskedImageUrl } from "../storage/masked-image.ts";

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
 * The seat token a searching host is given when a poll moves them into an
 * older lobby: derived from the token of the lobby they are leaving, not drawn.
 *
 * Derived so the move can be told twice. It commits before its answer leaves
 * the server, and that answer is the only place the new seat's token exists —
 * so if it is lost, the host's next poll from the old lobby must be able to
 * hand the same seat back (`moved_to`), and only a token that can be computed
 * again can be. Only the holder of the old token can compute it, so it is as
 * much a bearer secret as one from the CSPRNG; it is a different string from
 * the old one so the two seats are not one credential.
 */
export function moveSeatToken(fromMatchId: string, token: string): string {
  return createHash("sha256")
    .update(`tempus/versus/move:${fromMatchId}:${token}`)
    .digest("base64url");
}

/**
 * Whether a string is shaped like a seat token: 32 bytes, base64url. What
 * "Find opponent" accepts as an attempt key (see `liveSeatForToken`) — a
 * client may name its own seat's secret, but not a short or guessable one.
 */
export function isSeatTokenShape(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
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
  mode: VersusMode,
): Promise<void> {
  const { topicSlug } = versusModeSpec(mode);
  const events = await randomEvents(client, {
    count: totalRounds,
    // Null for the general library, which is also the pool every topic is
    // excluded from — so one argument is both halves of "a football match
    // deals football events and nothing else deals them". See `randomEvents`.
    ...(topicSlug === null ? {} : { topicSlug }),
  });

  if (events.length < totalRounds) {
    throw new Error(
      `Not enough playable events to deal a ${mode} match: wanted ` +
        `${totalRounds}, the pool has ${events.length}.`,
    );
  }

  // `randomEvents` returns timeline order. Inserted as-is, every question would
  // be later than the one before it — a free hint that halves the game.
  const { error } = await client.from("match_round").insert(
    shuffle(events).map((event, idx) => ({
      match_id: matchId,
      generation,
      idx,
      event_id: event.id,
    })),
  );

  if (error) throw error;
}

/**
 * How the host of an online lobby appears to whoever sits down opposite.
 *
 * Read from the session and the profile by the caller and stamped on the row
 * here, once. A snapshot rather than a join on purpose: the opponent's screen
 * is built from the pushed `match` row, and a rating that moved mid-match (a
 * settlement elsewhere) would otherwise change the number beside a name while
 * the two are playing.
 */
export interface PublicSeat {
  /** The account's username; null for a guest. */
  name: string | null;
  /** Chrono Rating at the moment of searching; null for a guest. */
  rating: number | null;
  /**
   * The public match this host has just finished, if they searched from its
   * end screen — checked by the caller against the host's own seat in it.
   * Stamped on the host's seat (`prev_match_id`) so matchmaking does not pair
   * them with the same opponent again straight away, guests included.
   */
  previousMatchId?: string | null;
}

/**
 * Open a match and take seat 1.
 *
 * The rounds are dealt now rather than at the start, so the time the draw
 * takes is spent while the host is still looking at the invitation screen
 * instead of between "both ready" and the first question.
 *
 * With `publicSeat` this opens an **online lobby** instead of an invitation.
 * It is inserted undiscoverable (`public_tier` null) and only published to
 * matchmaking once its rounds exist (`versus_publish_lobby`), because
 * `versus_matchmake` starts the match the moment it seats someone: a lobby
 * that could be found before it was dealt could be started with no questions.
 */
export async function createMatch(
  client: DbClient,
  mode: VersusMode,
  /** The signed-in account taking the seat, if any — what TP is paid to. */
  userId: string | null = null,
  publicSeat?: PublicSeat,
  /**
   * The host seat's token. Minted here unless the caller has one — "Find
   * opponent" passes its attempt key, so a retried attempt can find this seat
   * again (see `liveSeatForToken`).
   */
  token: string = newToken(),
): Promise<SeatCredentials> {
  // The database refuses this too (`match_public_is_history`), but as a
  // check-constraint error after a code has been minted; saying it here names
  // the actual mistake.
  if (publicSeat && mode !== PUBLIC_VERSUS_MODE) {
    throw new Error(
      `An online match plays ${PUBLIC_VERSUS_MODE}, not ${mode}.`,
    );
  }

  let lastError: unknown = null;

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const code = makeInviteCode(randomBytes(16));

    const { data, error } = await client
      .from("match")
      .insert({
        code,
        mode,
        total_rounds: ROUNDS_PER_MATCH,
        round_seconds: ROUND_SECONDS,
        reveal_seconds: REVEAL_SECONDS,
        seat1_joined: true,
        ...(publicSeat
          ? {
              is_public: true,
              seat1_name: publicSeat.name,
              seat1_rating: publicSeat.rating,
            }
          : {}),
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

    const { error: seatError } = await client.from("match_player").insert({
      match_id: data.id,
      seat: 1,
      token_hash: hashToken(token),
      user_id: userId,
      prev_match_id: publicSeat?.previousMatchId ?? null,
    });
    if (seatError) throw seatError;

    await dealRounds(client, data.id, 1, ROUNDS_PER_MATCH, mode);
    if (publicSeat) await publishLobby(client, data.id);

    return { matchId: data.id, code: data.code, seat: 1, token };
  }

  throw new Error(
    `Could not allocate an invite code after ${CODE_ATTEMPTS} attempts.`,
    { cause: lastError },
  );
}

/**
 * Make a dealt online lobby findable.
 *
 * A refusal is thrown rather than reported: the lobby was opened a moment ago
 * by this request and dealt by it, so the function saying no means the rounds
 * did not land — and a lobby nobody can find would leave its host on the
 * searching screen until the fallback seats a bot against a match with no
 * questions (which `versus_seat_bot` also refuses). Better the search fails
 * with a sentence now.
 */
async function publishLobby(client: DbClient, matchId: string): Promise<void> {
  const { data, error } = await client.rpc("versus_publish_lobby", {
    p_match_id: matchId,
  });
  if (error) throw error;
  if (data !== true) {
    throw new Error(`versus_publish_lobby refused match ${matchId}.`);
  }
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
  /** The signed-in account taking the seat, if any — what TP is paid to. */
  userId: string | null = null,
): Promise<JoinResult> {
  const { data: match, error } = await client
    .from("match")
    .select("id, phase, seat2_joined, is_public")
    .eq("code", code)
    .maybeSingle();

  if (error) throw error;
  if (!match) return { ok: false, reason: "not-found" };
  // An online match is seated by matchmaking and nothing else. Its code is in
  // its host's address bar like any match's, and a pasted link must not be a
  // way to pick an opponent — or to sit down in a searching lobby and skip the
  // league rule. A filled one reads as full, which is true; an open one reads
  // as no such invitation, which is what it is.
  if (match.is_public) {
    return { ok: false, reason: match.seat2_joined ? "full" : "not-found" };
  }
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
    user_id: userId,
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
   Online matchmaking
   ------------------------------------------------------------------------- */

/** Who is searching, as the session and the profile say — never the client. */
export interface Searcher {
  /** Null for a guest. */
  userId: string | null;
  rating: number | null;
  name: string | null;
}

/** What a search carries besides who is searching. */
export interface MatchmakeOptions {
  /** The searcher's own open lobby, when this is its poll. */
  ownMatchId: string | null;
  /**
   * The public match the searcher has just finished, checked by the caller.
   * A poll needs none: its lobby's host seat already names it.
   */
  avoidMatchId?: string | null;
  /**
   * The token for the seat this may take. A poll passes `moveSeatToken` of its
   * own, so a lost move can be repeated; "Find opponent" passes its attempt
   * key. Minted here otherwise.
   */
  seatToken?: string;
}

export type MatchmakeResult =
  /** Seated in seat 2 of an older open lobby; these are the new credentials. */
  | { status: "joined"; credentials: SeatCredentials }
  /**
   * `matched`: the searcher's own lobby has filled since it last asked.
   * `gone`: its own lobby no longer exists or was abandoned.
   * `none`: nobody suitable is waiting.
   */
  | { status: "matched" | "gone" | "none" };

/**
 * Try to sit down opposite somebody already waiting.
 *
 * The whole decision — which lobby, whether the league rule allows it, whether
 * the two met last time, and the seat itself — is one call under one row lock
 * (`versus_matchmake`), so two searchers can never take the same seat and a
 * searcher can never be seated into two. With `ownMatchId` it is the searching
 * host's poll: it may move the host out of its own lobby into an *older* one
 * (and abandon its own, unrated), which is how two people who pressed the
 * button in the same second end up in one match rather than two bot matches.
 *
 * The token is settled before the call because the function inserts the seat
 * row itself — minted, or the caller's (`seatToken`, which is what lets a lost
 * answer be repeated); if it answers anything but `joined`, the token was
 * never stored and is simply dropped.
 *
 * The rest of who-may-meet-whom is the function's, under the same lock: a host
 * who has stopped polling is not matched into (`SEARCH_HOST_SEEN_MS`), and
 * neither is anyone the searcher has just played — by the ledger for
 * accounts, and by the match they both came from (`avoidMatchId`, or the
 * poller's own lobby's) for anyone, guests included.
 */
export async function matchmake(
  client: DbClient,
  {
    ownMatchId,
    avoidMatchId = null,
    seatToken,
    userId,
    rating,
    name,
  }: Searcher & MatchmakeOptions,
): Promise<MatchmakeResult> {
  const token = seatToken ?? newToken();

  const { data, error } = await client.rpc("versus_matchmake", {
    p_own_match: ownMatchId,
    p_user_id: userId,
    p_rating: rating,
    p_name: name,
    p_token_hash: hashToken(token),
    p_intro_seconds: PUBLIC_MATCH_INTRO_SECONDS,
    p_fresh_seconds: PUBLIC_LOBBY_FRESH_SECONDS,
    p_near_rating: NEAR_RATING_WINDOW,
    p_avoid_match: avoidMatchId,
    p_host_seen_ms: SEARCH_HOST_SEEN_MS,
  });

  if (error) throw error;

  const result = jsonObject(data);
  const status = result?.status;

  if (status === "joined") {
    const matchId = result?.match_id;
    const code = result?.code;
    // Thrown rather than read as `none`: the database has already seated this
    // token, and the one thing worse than an error here is a searcher left on
    // the searching screen while an opponent waits for them at question one.
    if (typeof matchId !== "string" || typeof code !== "string") {
      throw new Error("versus_matchmake joined without a match id and code.");
    }
    return {
      status: "joined",
      credentials: { matchId, code, seat: 2, token },
    };
  }

  if (status === "matched" || status === "gone" || status === "none") {
    return { status };
  }

  throw new Error(`versus_matchmake answered an unknown status: ${String(status)}`);
}

/**
 * The live online seat a token already holds, if any — the other half of an
 * idempotent "Find opponent".
 *
 * The press seats the player before it answers (in somebody's lobby, or in a
 * lobby of their own), and the answer is the only place the seat's token
 * exists. A lost answer used to leave a player sitting in a started match
 * they would never reach — an opponent waiting at question one — while the
 * button said the search had failed, and pressing it again forfeited that very
 * match as a loss. So the client names the token itself (an attempt key it
 * keeps until an answer arrives) and a retry starts here: a seat that attempt
 * already took is handed back instead of a second one being taken.
 *
 * Only a seat worth going to is returned: a started match, or a lobby that was
 * published and is still fresh enough to be matched into. A lobby the attempt
 * opened but never finished dealing — the failure the retry is retrying — is
 * closed on the way past, and so is one that has outlived
 * `PUBLIC_LOBBY_FRESH_SECONDS` while nobody polled it: nobody could ever be
 * seated opposite it again, so going back to it would be waiting for a
 * stand-in, and a fresh search is the better answer.
 */
export async function liveSeatForToken(
  client: DbClient,
  token: string,
): Promise<SeatCredentials | null> {
  const { data: seats, error } = await client
    .from("match_player")
    .select("match_id, seat")
    .eq("token_hash", hashToken(token));

  if (error) throw error;
  if (!seats || seats.length === 0) return null;

  const { data: matches, error: matchError } = await client
    .from("match")
    .select("id, code, phase, is_public, public_tier, created_at")
    .in(
      "id",
      seats.map((seat) => seat.match_id),
    )
    .order("created_at", { ascending: false });

  if (matchError) throw matchError;

  for (const match of matches ?? []) {
    if (!match.is_public) continue;
    const seat = seats.find((candidate) => candidate.match_id === match.id);
    if (!seat) continue;

    const started = match.phase === "playing" || match.phase === "revealed";
    const waiting =
      match.phase === "lobby" &&
      match.public_tier !== null &&
      Date.now() - Date.parse(match.created_at) <
        PUBLIC_LOBBY_FRESH_SECONDS * 1000;
    if (started || waiting) {
      return {
        matchId: match.id,
        code: match.code,
        seat: seat.seat as Seat,
        token,
      };
    }

    // Conditional on still being an empty lobby, as `cancelSearch` is. Neither
    // kind can have filled since it was read — an unpublished lobby is
    // invisible to matchmaking, a stale one is past its freshness, and nobody
    // has polled either for a stand-in — but the condition costs nothing.
    if (match.phase === "lobby") {
      const { error: closeError } = await client
        .from("match")
        .update({ phase: "abandoned" as MatchPhase })
        .eq("id", match.id)
        .eq("phase", "lobby")
        .eq("seat2_joined", false);
      if (closeError) throw closeError;
    }
  }

  return null;
}

/**
 * The public match a "Find new opponent" press came from, if the caller really
 * sat in it and it is over — else null, and the search simply carries no
 * link. Checked rather than trusted: the link decides who the caller may not
 * meet, and a client that could name any match could keep any player out of
 * its way. Over, because it is the match the caller has just *finished*; an
 * account's open ones have already been forfeited by the time this is asked.
 */
export async function finishedPublicMatch(
  client: DbClient,
  matchId: string,
  token: string,
): Promise<string | null> {
  const seat = await seatForToken(client, matchId, token);
  if (seat === null) return null;

  const { data, error } = await client
    .from("match")
    .select("is_public, phase")
    .eq("id", matchId)
    .maybeSingle();

  if (error) throw error;
  if (!data || data.is_public !== true) return null;
  return data.phase === "complete" || data.phase === "abandoned" ? matchId : null;
}

/**
 * Where a poll moved this lobby's host, if a poll did — the seat it took, with
 * the token `moveSeatToken` gives the old one, or null.
 *
 * Read only for a lobby that is closed with nobody in it, which is either a
 * cancelled search or a merge whose answer may never have arrived. The seat is
 * checked as well as the pointer: a token that would not open it is not an
 * answer worth repeating.
 */
export async function readMoveTarget(
  client: DbClient,
  matchId: string,
  token: string,
): Promise<SeatCredentials | null> {
  const { data: host, error } = await client
    .from("match_player")
    .select("moved_to")
    .eq("match_id", matchId)
    .eq("seat", 1)
    .maybeSingle();

  if (error) throw error;
  if (!host?.moved_to) return null;

  const { data: target, error: targetError } = await client
    .from("match")
    .select("id, code")
    .eq("id", host.moved_to)
    .maybeSingle();

  if (targetError) throw targetError;
  if (!target) return null;

  const moved = moveSeatToken(matchId, token);
  const seat = await seatForToken(client, target.id, moved);
  if (seat === null) return null;

  return { matchId: target.id, code: target.code, seat, token: moved };
}

export type SeatBotOutcome =
  /** A bot now holds seat 2 and the match has started. */
  | "seated"
  /** Somebody sat down first; the lobby is already a match. */
  | "matched"
  /** Too soon after the lobby opened — `SEARCH_FALLBACK_MIN_MS` has not passed. */
  | "early"
  /** The lobby is not there, not online, or was abandoned. */
  | "gone";

/**
 * Fill a waiting online lobby with a bot, fully planned.
 *
 * **Everything the bot will ever do is decided here**, before it sits down:
 * one archetype, one level (the host's league — a bot is a stand-in for the
 * person the host would have met), and for every round the guess, its verdict
 * and points (from `gradeGuess`/`roundPoints`, the only grader — inside
 * `planBotMatch`) and how long it "thinks". The years are read with the service
 * role, the only role that can see which event a round is (`match_round` is
 * granted to no client — `event_id` *is* the answer). Planning
 * up front is what lets the database play the bot with nothing running: it
 * commits each answer the first time the match is touched after its moment
 * (`versus_reconcile`), and every public client touches it on a heartbeat.
 *
 * **The randomness is the CSPRNG.** Not for secrecy of any one number but
 * because `Math.random` is xorshift128+, whose state can be recovered from a
 * handful of its outputs — and a bot whose archetype, name and guesses could be
 * predicted from earlier bots would be a bot that could be recognised.
 *
 * The refusals are the database's (`versus_seat_bot` locks the row and checks
 * phase, seat and the minimum wait itself); the early returns below only save
 * the planning work when the row already says what the answer would be.
 */
export async function seatBot(
  client: DbClient,
  matchId: string,
): Promise<SeatBotOutcome> {
  const rng = cryptoRng;
  const candidates = pickBotNames(rng, BOT_NAME_CANDIDATES);

  // Two round trips before the seating call, not five. The fallback fires on
  // a player who has already watched a spinner for six to nine seconds, and
  // every sequential trip to the database is felt there. So the lobby, its
  // rounds and their years come back as one embedded read, and the name check
  // — which needs nothing from that read — runs beside it; whether a name is
  // used at all is decided afterwards, from the host's league.
  const [{ data: match, error }, taken] = await Promise.all([
    client
      .from("match")
      .select(
        "id, phase, is_public, generation, total_rounds, seat1_rating, seat2_joined, " +
          "match_round(idx, generation, event_id, event(year))",
      )
      .eq("id", matchId)
      .maybeSingle(),
    takenUsernames(client, candidates),
  ]);

  if (error) throw error;
  if (!match) return "gone";

  const lobby = match as unknown as LobbyWithRounds;
  if (!lobby.is_public || lobby.phase === "abandoned") return "gone";
  if (lobby.phase !== "lobby" || lobby.seat2_joined) return "matched";

  const rounds = (lobby.match_round ?? [])
    .filter((round) => round.generation === lobby.generation)
    .sort((a, b) => a.idx - b.idx);

  if (rounds.length < lobby.total_rounds) {
    throw new Error(
      `Cannot seat a bot in match ${matchId}: it has ` +
        `${rounds.length} of ${lobby.total_rounds} rounds dealt.`,
    );
  }

  const years = rounds.map((round) => {
    // A many-to-one embed arrives as an object, but PostgREST's typing allows
    // an array; either way there is exactly one event behind a round.
    const event = Array.isArray(round.event) ? round.event[0] : round.event;
    if (!event || event.year === null || event.year === undefined) {
      throw new Error(`Round ${round.idx} of match ${matchId} names a missing event.`);
    }
    // `bigint` can arrive as a string; the planner does arithmetic on it.
    return Number(event.year);
  });

  const hostRating = lobby.seat1_rating;
  const level: BotLevel = chronoTier(hostRating);
  const archetype = pickBotArchetype(rng);
  const moves = planBotMatch(years, botProfile(archetype, level), rng);
  const disguise = botDisguise(rng, level, hostRating, candidates, taken);

  const { data, error: seatError } = await client.rpc("versus_seat_bot", {
    p_match_id: matchId,
    // Nobody holds the bot's seat: the token is minted only so the seat row
    // looks like every other seat row, and is dropped here unread.
    p_token_hash: hashToken(newToken()),
    p_archetype: archetype,
    p_level: level,
    p_name: disguise.name,
    p_rating: disguise.rating,
    p_moves: moves.map((move, at) => ({
      idx: rounds[at]!.idx,
      guess: move.guess,
      verdict: move.verdict,
      points: move.points,
      think_ms: move.thinkMs,
    })) satisfies Json,
    p_min_wait_ms: SEARCH_FALLBACK_MIN_MS,
    p_intro_seconds: PUBLIC_MATCH_INTRO_SECONDS,
  });

  if (seatError) throw seatError;

  if (data === "seated" || data === "matched" || data === "early" || data === "gone") {
    return data;
  }
  throw new Error(`versus_seat_bot answered an unknown word: ${String(data)}`);
}

/** How many pool names are drawn per seating, so one taken name costs nothing. */
const BOT_NAME_CANDIDATES = 8;

/** The embedded read `seatBot` makes: a lobby, its rounds, their years. */
interface LobbyWithRounds {
  phase: MatchPhase;
  is_public: boolean;
  generation: number;
  total_rounds: number;
  seat1_rating: number | null;
  seat2_joined: boolean;
  match_round:
    | {
        idx: number;
        generation: number;
        event_id: string;
        event: { year: number | string | null } | { year: number | string | null }[] | null;
      }[]
    | null;
}

/** Which of these names an account already has. */
async function takenUsernames(
  client: DbClient,
  candidates: readonly string[],
): Promise<Set<string>> {
  const { data, error } = await client
    .from("profile")
    .select("username")
    .in("username", [...candidates]);

  if (error) throw error;
  return new Set(
    (data ?? [])
      .map((row) => row.username)
      .filter((name): name is string => name !== null),
  );
}

/**
 * The name and rating a bot sits down under.
 *
 * **A guest only where a guest could really be.** Guests play the bottom league
 * and matchmaking seats them only into bottom-league lobbies, so a person in
 * the middle or upper league never meets one. A "Guest" opposite a host there
 * would therefore be a bot by elimination, which is why the guest disguise is
 * offered only when the host is in the bottom league, whatever
 * `BOT_GUEST_CHANCE` says for the higher levels.
 *
 * **Never a name somebody has.** The candidates were checked against
 * `profile.username` (`takenUsernames`, run beside the lobby read), because a
 * bot wearing a real player's name is a leaderboard search away from being
 * caught — and a real player finding "themselves" in someone else's match
 * would be worse. If every candidate is taken (with hundreds of names and this
 * site's numbers, practically never) the bot sits down as a guest rather than
 * as a duplicate.
 *
 * **And never a name somebody can take afterwards.** The name chosen here is
 * reserved by `versus_seat_bot` as it seats the bot (`reserved_username`), so
 * "can I register my opponent's name?" answers "no" for a bot exactly as it
 * does for a person — without that, the account page's rename field would be a
 * bot detector, since a person's seat name is by construction a taken one.
 */
function botDisguise(
  rng: Rng,
  level: BotLevel,
  hostRating: number | null,
  candidates: readonly string[],
  taken: ReadonlySet<string>,
): { name: string | null; rating: number | null } {
  const guest = { name: null, rating: null };
  const guestPlausible = chronoTier(hostRating) === 1;

  if (guestPlausible && rng() < BOT_GUEST_CHANCE[level]) return guest;

  const name = candidates.find((candidate) => !taken.has(candidate));
  if (!name) return guest;

  return { name, rating: botShownRating(rng, level, hostRating) };
}

/**
 * Settle every other unfinished online match this account is in, as a loss.
 *
 * Called before an account searches. A started match the player walked away
 * from is a forfeit (`versus_abandon` with their seat), so closing a losing
 * tab and pressing "Find opponent" again costs exactly what finishing it would
 * have; a lobby that never filled is just closed, unrated. Returns how many it
 * closed.
 */
export async function forfeitOpenPublicMatches(
  client: DbClient,
  userId: string,
  exceptMatchId: string | null = null,
): Promise<number> {
  const { data, error } = await client.rpc("versus_forfeit_user", {
    p_user_id: userId,
    p_except_match: exceptMatchId,
  });
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}

/** What a searching poll needs to know before it asks matchmaking anything. */
export interface SearchState {
  isPublic: boolean;
  phase: MatchPhase;
  seat2Joined: boolean;
}

/**
 * A plain read, not a reconcile: a lobby has no clock for `versus_reconcile` to
 * advance, and this runs on every searching poll — the cheapest question that
 * tells the poll whether there is still anything to search for.
 */
export async function readSearchState(
  client: DbClient,
  matchId: string,
): Promise<SearchState | null> {
  const { data, error } = await client
    .from("match")
    .select("is_public, phase, seat2_joined")
    .eq("id", matchId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    isPublic: data.is_public === true,
    phase: data.phase,
    seat2Joined: data.seat2_joined,
  };
}

export type CancelSearchOutcome =
  /** The lobby is closed (now, or already was) and nobody had sat down. */
  | "cancelled"
  /** Somebody sat down first. The match is live and the caller is in it. */
  | "matched";

/**
 * Stop searching: close this host's lobby, but **only if it is still a lobby
 * nobody has sat down in**.
 *
 * A conditional update rather than `versus_abandon`, and the difference is the
 * player's rating. Cancel races the searcher's own fallback poll — pressing it
 * at second eight is exactly when a bot sits down — and `versus_abandon` on a
 * match that started a millisecond earlier is, correctly, a forfeit. Putting
 * the lobby condition in the `where` makes it the row lock's decision: if the
 * fill committed first the update matches nothing and the caller hears
 * `matched`; if the cancel committed first, `versus_matchmake` and
 * `versus_seat_bot` find an abandoned row and leave it alone. A lobby closed
 * this way has no `forfeit_seat`, so the settlement trigger rates nothing.
 */
export async function cancelSearch(
  client: DbClient,
  matchId: string,
  seat: Seat,
): Promise<CancelSearchOutcome> {
  // Only a host waits in a lobby. Seat 2 exists only once the match has filled.
  if (seat !== 1) return "matched";

  const { data, error } = await client
    .from("match")
    .update({ phase: "abandoned" as MatchPhase })
    .eq("id", matchId)
    .eq("phase", "lobby")
    .eq("seat2_joined", false)
    .select("id");

  if (error) throw error;
  if (data && data.length > 0) return "cancelled";

  const { data: row, error: readError } = await client
    .from("match")
    .select("phase, seat2_joined")
    .eq("id", matchId)
    .maybeSingle();

  if (readError) throw readError;
  // Already closed with nobody in it — a second press, a merge that moved this
  // host elsewhere, or a search started in another tab. Cancelling twice is
  // still cancelled.
  if (!row || (row.phase === "abandoned" && !row.seat2_joined)) {
    return "cancelled";
  }
  return "matched";
}

/** A uniform draw in [0, 1) from the CSPRNG. `randomInt` needs max < 2^48. */
const RNG_SPAN = 2 ** 48 - 1;

function cryptoRng(): number {
  return randomInt(RNG_SPAN) / RNG_SPAN;
}

function jsonObject(value: Json | null | undefined): Record<string, Json | undefined> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : null;
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
  | "duplicate"
  /**
   * The round has not started yet — an online match's "opponent found" intro
   * is still on screen. Refused so the round's seconds are all seconds of
   * question for both seats, and so nobody answers before a bot's clock starts.
   */
  | "early";

/** What a lock-in comes back with: whether it counted, and the seat's view. */
export interface LockInResult {
  outcome: SubmitOutcome;
  view: MatchView;
}

/**
 * Grade a guess and offer it to the round — in two round trips.
 *
 * The grading happens here because `gradeGuess` is the application's rule and
 * there should be exactly one copy of it; whether the graded answer *counts*
 * is then entirely the database's call. So this can be read as: work out what
 * the guess was worth, hand it over, and accept the verdict on whether it
 * arrived in time.
 *
 * **Two trips, because every trip is a continent.** This used to be eight in a
 * row — seat, reconcile, round, year, submit, then a whole fresh view — and
 * against a database in another hemisphere that was 3-4 seconds between the
 * press and anything happening. Now:
 *
 *   1. side by side: the seat, the reconcile, the round's year under every
 *      generation (the live one is only known once the reconcile answers), and
 *      the database clock. Reconciling for a caller not yet known to hold a
 *      seat is safe — it is what every entry point runs first anyway, and it
 *      only ever applies deadlines that have passed — and nothing read here
 *      leaves this function unless the seat checks out;
 *   2. `versus_submit`, whose own `match_row` is the state the view is built
 *      from.
 *
 * The view after an accepted answer needs no further read. The seat's own
 * answer is the guess just written. Whether the opponent has answered follows
 * from the phase: their answer being in would have made this one second, and a
 * second answer reveals the round — so still `playing` means not yet. And the
 * questions are the ones already on screen (an answer never moves the round
 * on), so `events` is empty and `foldView` keeps the client's. Every other
 * outcome is rare and falls back to a full `buildMatchView`.
 *
 * `elapsedMs` is measured from the round's own `round_started_at`, never from
 * anything the client said. `versus_submit` takes that measurement itself, on
 * the Postgres clock at the insert — the clock a bot's answer is timed on — so
 * `p_elapsed_ms` below is only its fallback for a round with no recorded start.
 *
 * Null when the token holds no seat in this match.
 */
export async function lockInGuess(
  client: DbClient,
  {
    matchId,
    token,
    roundIdx,
    guess,
    locale = DEFAULT_LOCALE,
  }: {
    matchId: string;
    token: string;
    roundIdx: number;
    guess: number;
    locale?: string;
  },
): Promise<LockInResult | null> {
  const [seatRead, matchRead, roundsRead, serverNow] = await Promise.allSettled([
    seatForToken(client, matchId, token),
    reconcile(client, matchId),
    client
      .from("match_round")
      .select("generation, event:event_id(year)")
      .eq("match_id", matchId)
      .eq("idx", roundIdx),
    databaseNow(client),
  ]);

  // The seat first: a match that does not exist fails its reconcile, and the
  // caller should hear "not yours", exactly as before, rather than an error.
  if (seatRead.status === "rejected") throw seatRead.reason;
  const seat = seatRead.value;
  if (seat === null) return null;
  if (matchRead.status === "rejected") throw matchRead.reason;
  if (roundsRead.status === "rejected") throw roundsRead.reason;
  if (roundsRead.value.error) throw roundsRead.value.error;

  const match = matchRead.value;
  const slow = async (outcome: SubmitOutcome): Promise<LockInResult> => ({
    outcome,
    view: await buildMatchView(client, { matchId, seat, locale }),
  });

  if (match.phase !== "playing") return slow("closed");
  if (match.current_idx !== roundIdx) return slow("stale");

  const year = (roundsRead.value.data ?? []).find(
    (round) => round.generation === match.generation,
  )?.event?.year;
  if (year === undefined || year === null) return slow("stale");

  // The mode's own tolerance ladder, not the general one. A football guess
  // nine years out is a bad answer and the same nine years on the formation of
  // the Earth is a perfect one, which is the whole reason `BandSet` is a
  // parameter — see lib/game/scoring.ts. The mode is read off the match rather
  // than taken from the client for the usual reason: it decides what a guess
  // is worth.
  const accuracy = gradeGuess(
    guess,
    year,
    versusModeSpec(asVersusMode(match.mode)).bands,
  );
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

  const submitted = data as unknown as {
    result: SubmitOutcome;
    match_row: MatchRow | null;
  };
  if (submitted.result !== "accepted" || !submitted.match_row) {
    return slow(submitted.result);
  }

  const row = submitted.match_row;
  return {
    outcome: "accepted",
    view: viewOf(row, seat, {
      serverNow:
        serverNow.status === "fulfilled" ? serverNow.value : Date.now(),
      events: {},
      answers: { own: guess, theirs: row.phase !== "playing" },
    }),
  };
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
  seat: Seat,
): Promise<void> {
  const { data: match, error } = await client
    .from("match")
    .select("generation, total_rounds, phase, mode, rematch_by, is_public")
    .eq("id", matchId)
    .single();

  if (error) throw error;
  // An online match has no rematch: its end screen offers a new opponent, and
  // the same two never meet back to back. `versus_start_rematch` refuses too;
  // this stops the next generation being dealt for nothing first.
  // (`versus_request_rematch` needs no twin of this — it returns a public row
  // unchanged, and requesting deals nothing.)
  if (match.is_public) return;
  if (match.phase !== "complete") return;
  // Only an answer to the *other* seat's offer. Without this a seat could
  // accept its own request — or one never made — and drag the opponent into a
  // new game unasked. `versus_start_rematch` does not look at `rematch_by`.
  if (match.rematch_by === null || match.rematch_by === seat) return;

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
    // The match's own mode, never the default: a rematch is another ten
    // questions of the game the invitation was for.
    await dealRounds(
      client,
      matchId,
      next,
      match.total_rounds,
      asVersusMode(match.mode),
    );
  }

  const { error: startError } = await client.rpc("versus_start_rematch", {
    p_match_id: matchId,
  });
  if (startError) throw startError;
}

/**
 * Give up a match that has not finished, so the opponent is not left hanging.
 *
 * Through `versus_abandon` rather than a direct update, because leaving now
 * means something: in a started online match the leaver's seat is stamped as
 * `forfeit_seat`, and the settlement trigger rates it as a loss for them and,
 * once a round has been revealed, a win for the seat that stayed (before that
 * the stayer gets nothing, or a walk-out would be a free win to manufacture).
 * Reconciled first inside the function, so a match the clock has already
 * finished (its last reveal over, nobody having asked since) completes on its
 * scores rather than being recorded as a forfeit by whoever presses "leave"
 * first — and a leave *during* the last reveal completes it too, since every
 * round has been played by then.
 */
export async function abandonMatch(
  client: DbClient,
  matchId: string,
  seat: Seat,
): Promise<MatchRow> {
  const { data, error } = await client.rpc("versus_abandon", {
    p_match_id: matchId,
    p_seat: seat,
  });
  if (error) throw error;
  return data as unknown as MatchRow;
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
 *
 * `row` is a reconcile the caller has already done in this request, so it is
 * not paid for twice, and `now` the clock read beside it. Without `now` the
 * clock is read beside the round reads instead — fine for the heartbeat,
 * whose answer is never used to measure the client's clock offset.
 */
export async function buildMatchView(
  client: DbClient,
  {
    matchId,
    seat,
    locale = DEFAULT_LOCALE,
    row,
    now: knownNow,
  }: {
    matchId: string;
    seat: Seat;
    locale?: string;
    row?: MatchRow;
    now?: number;
  },
): Promise<MatchView> {
  // The clock is read *alongside* the reconcile rather than after it, and the
  // difference is not cosmetic. The browser takes `serverNow` as the server's
  // time at the midpoint of the round trip, so a sample taken late in the
  // request biases its offset high — the countdown then ends before the
  // deadline really has, and the client prompts a server that correctly
  // declines to do anything. Sampling early biases it the other way, and a
  // countdown that ends late meets a server that has already moved on.
  const [match, serverNow] = row
    ? [row, knownNow ?? databaseNow(client)]
    : await Promise.all([reconcile(client, matchId), databaseNow(client)]);

  const mode = asVersusMode(match.mode);

  const [events, answers, now] = await Promise.all([
    visibleEvents(client, match, locale, mode),
    liveAnswers(client, match, seat),
    serverNow,
  ]);

  return viewOf(match, seat, { serverNow: now, events, answers });
}

/**
 * `buildMatchView` for a caller known only by a token: the seat check rides in
 * the same trip as the reconcile and the clock (see `lockInGuess` for why the
 * reconcile may run before the seat is known). Null when the token holds no
 * seat in this match.
 */
export async function viewForToken(
  client: DbClient,
  {
    matchId,
    token,
    locale = DEFAULT_LOCALE,
  }: { matchId: string; token: string; locale?: string },
): Promise<{ seat: Seat; view: MatchView } | null> {
  const [seatRead, matchRead, now] = await Promise.allSettled([
    seatForToken(client, matchId, token),
    reconcile(client, matchId),
    databaseNow(client),
  ]);
  if (seatRead.status === "rejected") throw seatRead.reason;
  const seat = seatRead.value;
  if (seat === null) return null;
  if (matchRead.status === "rejected") throw matchRead.reason;

  return {
    seat,
    view: await buildMatchView(client, {
      matchId,
      seat,
      locale,
      row: matchRead.value,
      now: now.status === "fulfilled" ? now.value : Date.now(),
    }),
  };
}

/** A match row, as one seat may see it. Pure: every read is the caller's. */
function viewOf(
  match: MatchRow,
  seat: Seat,
  {
    serverNow,
    events,
    answers,
  }: {
    serverNow: number;
    events: Record<number, MaskedEvent>;
    answers: { own: number | null; theirs: boolean };
  },
): MatchView {
  return {
    matchId: match.id,
    code: match.code,
    mode: asVersusMode(match.mode),
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
    youAnswered: answers.own !== null,
    yourGuess: answers.own,
    theyAnswered: answers.theirs,
    version: match.version,
    // The same reader the browser folds a pushed row with, so a view fetched
    // here and a row pushed there cannot disagree about a name or a rating.
    ...publicSeatFields(match),
    serverNow,
    events,
  };
}

/**
 * The live round's answers as this seat may know them: its own guess (or null
 * if it has not answered), and whether the other seat has answered at all.
 *
 * Safe to return, and the reason the view is per seat: the guess is the
 * caller's own, never the opponent's — of theirs this says only that it
 * exists, which is what "your opponent locked in" says. The opponent's guess
 * reaches a client only through `match.history`, once the round has closed.
 * One query for both: they are the same three-column key.
 */
async function liveAnswers(
  client: DbClient,
  match: MatchRow,
  seat: Seat,
): Promise<{ own: number | null; theirs: boolean }> {
  const { data, error } = await client
    .from("match_answer")
    .select("seat, guess")
    .eq("match_id", match.id)
    .eq("generation", match.generation)
    .eq("idx", match.current_idx);

  if (error) throw error;

  const rows = data ?? [];
  const own = rows.find((row) => row.seat === seat);
  return {
    own: own ? own.guess : null,
    theirs: rows.some((row) => row.seat !== seat),
  };
}

/**
 * One beat of a live online round (app/api/versus/tick/route.ts).
 *
 * Reconciles — which is the whole point: it is what commits an answer that is
 * due but has no browser to send it — and then answers with a view only for
 * the news a beat exists to carry:
 *
 *   * **the opponent has answered the live round.** In a public match nobody's
 *     first answer is pushed (see the migration's header), so this is how
 *     every online player hears it, about a person and a bot alike. The
 *     client stops beating once it has.
 *   * **a change the push should have brought and has not**, once it has sat
 *     on the row for `TICK_PUSH_GRACE_MS`. A fresher one is left to the push:
 *     a bot's second answer reveals its round inside the very beat that writes
 *     it, and answering with that reveal would make "the result arrived in my
 *     own beat" the rule against bots and the exception against people.
 *
 * Anything else is null and costs a few bytes. A version the client cannot
 * have (NaN, garbage) is treated as stale — the cost of a needless view is one
 * render, the cost of a withheld one is a client that never learns the round
 * moved. A private match answers null: its clients never beat (both seats are
 * browsers that push their own answers).
 *
 * The seat and the reconcile are one trip, side by side (see `lockInGuess` for
 * why that is safe), and a view built here reuses that reconcile. Null when
 * the token holds no seat in this match.
 */
export async function tickMatch(
  client: DbClient,
  {
    matchId,
    token,
    knownVersion,
    locale = DEFAULT_LOCALE,
  }: { matchId: string; token: string; knownVersion: number; locale?: string },
): Promise<TickResponse | null> {
  const [seatRead, rowRead] = await Promise.allSettled([
    seatForToken(client, matchId, token),
    reconcile(client, matchId),
  ]);
  if (seatRead.status === "rejected") throw seatRead.reason;
  const seat = seatRead.value;
  if (seat === null) return null;
  if (rowRead.status === "rejected") throw rowRead.reason;
  const row = rowRead.value;

  void touchSeat(client, matchId, seat).catch(() => {});

  if (!row.is_public) return { ok: true, view: null };

  const view = async (): Promise<TickResponse> => ({
    ok: true,
    view: await buildMatchView(client, { matchId, seat, locale, row }),
  });

  if (row.phase === "playing") {
    const { count, error } = await client
      .from("match_answer")
      .select("seat", { count: "exact", head: true })
      .eq("match_id", matchId)
      .eq("generation", row.generation)
      .eq("idx", row.current_idx)
      .neq("seat", seat);
    if (error) throw error;
    if ((count ?? 0) > 0) return view();
  }

  const behind = !Number.isFinite(knownVersion) || row.version > knownVersion;
  const age = Date.now() - Date.parse(row.updated_at);
  if (behind && !(age < TICK_PUSH_GRACE_MS)) return view();

  return { ok: true, view: null };
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
  mode: VersusMode,
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

  // The film & television mode's one extra fact, resolved here for the same
  // reason the solo game resolves it in its dealer rather than on the client:
  // whether a round is a film or a series decides what the question *means*
  // (a release or a premiere), and `kind = 'other'` categories are not
  // something a client should be able to ask this table for. Skipped
  // altogether for the modes that have no formats, so no other mode pays for
  // a second query.
  const [events, formats] = await Promise.all([
    eventsByIds(client, ids, locale),
    mode === "screen"
      ? eventCategorySlugs(client, ids, { kind: "other" })
      : Promise.resolve(new Map<string, string[]>()),
  ]);

  const byId = new Map(events.map((event) => [event.id, event]));

  const visible: Record<number, MaskedEvent> = {};
  for (const round of rounds) {
    const event = byId.get(round.event_id);
    if (!event) continue;

    // One opaque name per (match, generation, round), used for everything that
    // would otherwise identify the event. The id: `public.event` is
    // world-readable, so a real id is one REST call from its year — and no
    // versus screen needs it (the round card only compares it to notice a new
    // round). The picture: its real key names the era folder, so it goes
    // through the masked route under a token that is stable for this round
    // (cached, no flicker on a refetch) and unlinkable to the same picture in
    // any other match. The description: no versus screen shows it, and prose
    // about an event names its date as often as not.
    const roundName = `r-${match.generation}-${round.idx}`;

    visible[round.idx] = maskEvent(event, {
      imageUrl: event.image
        ? maskedImageUrl(
            event.image.objectKey,
            `versus:${match.id}:${match.generation}:${round.idx}`,
          )
        : null,
      description: null,
      id: roundName,
      slug: roundName,
      format: screenFormatOf(formats.get(event.id)),
    });
  }
  return visible;
}

function toEpoch(value: string | null): number | null {
  return value === null ? null : Date.parse(value);
}

function toSeat(value: number | null): Seat | null {
  return value === 1 || value === 2 ? value : null;
}

/**
 * A uniform shuffle over a copy.
 *
 * The same Fisher-Yates `lib/db/daily.ts` writes out; `app/actions/rounds.ts`
 * has a third, and it cannot be imported from there because that module is
 * `"use server"`.
 */
function shuffle<T>(rows: readonly T[]): T[] {
  const pool = [...rows];

  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }

  return pool;
}
