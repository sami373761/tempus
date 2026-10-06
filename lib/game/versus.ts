/**
 * Head-to-head matches: the rules both sides of the network agree on.
 *
 * Pure, like lib/game/rounds.ts, and for the same reason — the server decides
 * everything that matters and the client has to be able to describe the same
 * state without a second opinion about what it means. What is *not* here is
 * any decision: no timing, no grading, no phase changes. Those happen in
 * Postgres (supabase/migrations/20261005120000_versus_matches.sql) and reach
 * the client already made.
 *
 * **The one rule worth stating twice.** A client is never told the answer to a
 * round it is still playing. `MaskedEvent` is what crosses the wire while a
 * round is live, and it is a type-level guarantee rather than a convention:
 * the year is not omitted from the payload by the code that builds it, it is
 * absent from the type the code must return, so adding it back is a
 * compile error rather than a silent leak. The year arrives in
 * `RoundResult.year` once the round has closed and nobody can act on it.
 *
 * Nothing here is about date-guessing except `SeatAnswer.guess` being a year.
 * The match, seat, round and phase vocabulary is deliberately game-agnostic:
 * a second mode would add its own answer shape and reuse the rest.
 */

import type { Database } from "../db/database.types.ts";
import type { LocalizedEvent } from "../db/types.ts";
import { isVerdict, type Verdict } from "./scoring.ts";
import { QUESTIONS_PER_SET } from "./set.ts";

/** A match is the same ten questions a solo set is. Deliberately the same constant. */
export const ROUNDS_PER_MATCH = QUESTIONS_PER_SET;

/**
 * Seconds a player has to answer. The server stamps the deadline from this at
 * the start of each round and stores it on the match, so a match already in
 * flight keeps the limit it started with even across a deploy that changes
 * this number.
 */
export const ROUND_SECONDS = 20;

/**
 * How long both players look at the round result before the next question.
 *
 * It is a timer rather than a button on purpose: the two clients have to leave
 * the result together, and anything a player presses can go unpressed. Long
 * enough to read two guesses and a verdict, short enough that the player who
 * is ready first is not kept waiting by one who wandered off.
 */
export const REVEAL_SECONDS = 6;

/** The two seats. Seat 1 created the match; seat 2 accepted the invitation. */
export type Seat = 1 | 2;

export const SEATS: readonly Seat[] = [1, 2];

export function otherSeat(seat: Seat): Seat {
  return seat === 1 ? 2 : 1;
}

export type MatchPhase =
  | "lobby"
  | "playing"
  | "revealed"
  | "complete"
  | "abandoned";

/* -------------------------------------------------------------------------
   Invite codes
   ------------------------------------------------------------------------- */

/**
 * No vowels (so a code cannot spell something), and no character that is
 * read back wrong: 0/O, 1/I/L. What is left is unambiguous spoken down a
 * phone and unambiguous scanned off a QR code at an angle.
 */
const CODE_ALPHABET = "23456789BCDFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 6;

/**
 * A fresh invite code. 28^6 is about 480 million, and codes live for hours,
 * so a collision is a retry rather than a design problem — the caller leans on
 * the unique index rather than checking first.
 *
 * Takes its randomness as an argument so the server can hand it a CSPRNG and
 * this module can stay pure.
 */
export function makeInviteCode(randomBytes: Uint8Array): string {
  let code = "";
  for (let at = 0; at < CODE_LENGTH; at += 1) {
    code += CODE_ALPHABET[randomBytes[at]! % CODE_ALPHABET.length];
  }
  return code;
}

/** Codes are shown and typed in upper case; accept any case on the way in. */
export function normalizeInviteCode(value: string): string {
  return value.trim().toUpperCase();
}

export function isInviteCode(value: string): boolean {
  if (value.length !== CODE_LENGTH) return false;
  for (const character of value) {
    if (!CODE_ALPHABET.includes(character)) return false;
  }
  return true;
}

/* -------------------------------------------------------------------------
   What a client may see
   ------------------------------------------------------------------------- */

/**
 * An event with the answer taken out: everything needed to *show* a round and
 * nothing that would decide it.
 *
 * `sortKey` goes too, though it is not obviously a date — it is
 * `year * 10000 + month * 100 + day` (CLAUDE.md), so it is the year with two
 * extra digits on the end. Leaving it in would be handing over the answer in a
 * format that merely looks like a database detail.
 */
export type MaskedEvent = Omit<
  LocalizedEvent,
  "year" | "month" | "day" | "sortKey" | "precision"
>;

export function maskEvent(event: LocalizedEvent): MaskedEvent {
  // Destructured rather than spread-and-delete, so the discarded fields are
  // named here and a new date-bearing column on LocalizedEvent has to be
  // thought about rather than inherited into the payload.
  const { year: _y, month: _m, day: _d, sortKey: _s, precision: _p, ...rest } =
    event;
  return rest;
}

/** One seat's answer to one finished round. */
export interface SeatAnswer {
  /** The year guessed, or null if the clock ran out first. */
  guess: number | null;
  verdict: Verdict;
  points: number;
  /** Time from the server's round start, or null on a timeout. */
  elapsedMs: number | null;
  timedOut: boolean;
}

/** A finished round, as both players see it. */
export interface RoundResult {
  idx: number;
  eventId: string;
  /** Safe here: the round is over. */
  year: number;
  yearLabel: string;
  seats: Record<Seat, SeatAnswer>;
}

export interface SeatState {
  joined: boolean;
  ready: boolean;
  score: number;
}

/**
 * The whole of what one client knows, as the server last told it.
 *
 * Timestamps are epoch milliseconds rather than ISO strings because every one
 * of them is arithmetic — the countdown is `deadline - (now + offset)` and
 * nothing ever formats them.
 */
export interface MatchView {
  matchId: string;
  code: string;
  /** Which seat is asking. The only field whose value depends on who called. */
  seat: Seat;
  phase: MatchPhase;
  generation: number;
  totalRounds: number;
  roundSeconds: number;
  revealSeconds: number;
  currentIdx: number;
  roundStartedAt: number | null;
  roundDeadlineAt: number | null;
  revealUntilAt: number | null;
  answeredCount: number;
  seats: Record<Seat, SeatState>;
  history: RoundResult[];
  rematchBy: Seat | null;
  rematchDeclinedBy: Seat | null;
  /**
   * Whether the seat that asked has already answered the live round.
   *
   * Server-computed, and the reason the view is built per seat at all. The
   * client also knows this the moment it submits — but only until the tab is
   * reloaded, and "am I waiting for them or are they waiting for me" is
   * exactly the question a reconnecting player needs answered correctly.
   */
  youAnswered: boolean;
  /**
   * This seat's own guess for the live round, or null if it has not answered.
   *
   * Not a leak — it is the caller's own answer, and the view is built per
   * seat. It exists so a reload mid-round can put the player's marker back
   * where they left it: without it, a reconnecting player sees a rail that is
   * locked but empty, and then a result naming a guess that is nowhere on
   * screen.
   */
  yourGuess: number | null;
  /** Monotonic; a view with a lower version than the one in hand is stale. */
  version: number;
  /**
   * The server's clock when this was built. The client measures its own offset
   * against it so a wrong system clock cannot change how long a round lasts.
   */
  serverNow: number;
  /**
   * Masked events for the live round and the one after it, keyed by round
   * index. Two rather than all ten so a player cannot read ahead, and two
   * rather than one so the next photograph is already in the browser cache
   * when the round turns.
   */
  events: Record<number, MaskedEvent>;
}

/* -------------------------------------------------------------------------
   Reading a match
   ------------------------------------------------------------------------- */

/** The round being played or shown, if any. */
export function currentEvent(view: MatchView): MaskedEvent | null {
  return view.events[view.currentIdx] ?? null;
}

/** The round after the live one, for preloading its picture. */
export function upcomingEvent(view: MatchView): MaskedEvent | null {
  return view.events[view.currentIdx + 1] ?? null;
}

/** The result on screen during the reveal, or null while a round is live. */
export function revealedRound(view: MatchView): RoundResult | null {
  if (view.phase !== "revealed") return null;
  return view.history.find((round) => round.idx === view.currentIdx) ?? null;
}

export interface MatchOutcome {
  /** The seat that won, or null for a draw. */
  winner: Seat | null;
  /** Rounds each seat took outright. Ties in a round count for neither. */
  roundsWon: Record<Seat, number>;
}

/**
 * Who won, decided on points.
 *
 * Rounds won is reported too but is not the tiebreak: the whole reason
 * `roundPoints` exists is that it grades *how well* each question went, and
 * falling back to a count of rounds would throw that away at exactly the
 * moment it matters.
 */
export function matchOutcome(view: MatchView): MatchOutcome {
  const roundsWon: Record<Seat, number> = { 1: 0, 2: 0 };

  for (const round of view.history) {
    const one = round.seats[1].points;
    const two = round.seats[2].points;
    if (one > two) roundsWon[1] += 1;
    else if (two > one) roundsWon[2] += 1;
  }

  const scoreOne = view.seats[1].score;
  const scoreTwo = view.seats[2].score;

  return {
    winner: scoreOne === scoreTwo ? null : scoreOne > scoreTwo ? 1 : 2,
    roundsWon,
  };
}

/* -------------------------------------------------------------------------
   Reading the pushed row
   ------------------------------------------------------------------------- */

/**
 * The match row as Supabase Realtime delivers it.
 *
 * Realtime pushes the table row, not the per-seat view: the same bytes go to
 * both players, which is only safe because every column on this table is
 * public by construction (see the migration's header). Turning that row back
 * into a `MatchView` is `applyMatchRow` below.
 */
export type VersusMatchRow = Database["public"]["Tables"]["match"]["Row"];

/**
 * Read `match.history` back into typed rounds.
 *
 * Validated rather than cast, and shared rather than duplicated: this same
 * jsonb is read on the server when a view is built and in the browser when the
 * row is pushed, and two readers of one column is how they come to disagree.
 *
 * A malformed entry is dropped. It is written only by `versus_reveal` so in
 * practice there are none — but the one thing a result screen must never do is
 * render `undefined` as a player's score, and a missing round is a visible
 * failure where a broken one is not.
 */
export function parseMatchHistory(value: unknown): RoundResult[] {
  if (!Array.isArray(value)) return [];

  const rounds: RoundResult[] = [];

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const { idx, year, eventId, yearLabel } = record;

    if (
      typeof idx !== "number" ||
      typeof year !== "number" ||
      typeof eventId !== "string" ||
      typeof yearLabel !== "string"
    ) {
      continue;
    }

    const one = parseSeatAnswer(record.seat1);
    const two = parseSeatAnswer(record.seat2);
    if (!one || !two) continue;

    rounds.push({ idx, year, eventId, yearLabel, seats: { 1: one, 2: two } });
  }

  return rounds.sort((a, b) => a.idx - b.idx);
}

function parseSeatAnswer(value: unknown): SeatAnswer | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const { verdict, points } = record;

  if (typeof verdict !== "string" || !isVerdict(verdict)) return null;
  if (typeof points !== "number") return null;

  return {
    guess: typeof record.guess === "number" ? record.guess : null,
    verdict,
    points,
    elapsedMs: typeof record.elapsedMs === "number" ? record.elapsedMs : null,
    timedOut: record.timedOut === true,
  };
}

/**
 * Fold a pushed row into the view already in hand.
 *
 * The row is the whole truth about the match but only part of what the screen
 * needs: it carries no masked events (the client fetches those), no seat (the
 * row is the same for both players) and no server clock reading that is usable
 * for timing — `updated_at` arrives one network hop late, and adopting it as
 * "now" would quietly shorten every countdown by the latency. So those three
 * are carried over from the existing view and everything else is replaced.
 *
 * Two derived rules, both of which are bugs if they are left out:
 *
 *   * **A row older than the one in hand is dropped.** A view fetched over
 *     HTTP can land after a row pushed over the socket; without the version
 *     check the slower answer wins and the screen goes backwards.
 *   * **`youAnswered` resets when the round changes.** It is the one field the
 *     row cannot carry — the match knows two people answered, not which of
 *     them is reading this screen — so a new round has to clear it or the
 *     player opens question four already locked out of it.
 */
export function applyMatchRow(
  view: MatchView,
  row: VersusMatchRow,
): MatchView {
  if (row.version <= view.version) return view;

  const newRound =
    row.current_idx !== view.currentIdx || row.generation !== view.generation;

  return {
    ...view,
    phase: row.phase,
    generation: row.generation,
    totalRounds: row.total_rounds,
    roundSeconds: row.round_seconds,
    revealSeconds: row.reveal_seconds,
    currentIdx: row.current_idx,
    roundStartedAt: parseTimestamp(row.round_started_at),
    roundDeadlineAt: parseTimestamp(row.round_deadline_at),
    revealUntilAt: parseTimestamp(row.reveal_until_at),
    answeredCount: row.answered_count,
    seats: {
      1: {
        joined: row.seat1_joined,
        ready: row.seat1_ready,
        score: row.seat1_score,
      },
      2: {
        joined: row.seat2_joined,
        ready: row.seat2_ready,
        score: row.seat2_score,
      },
    },
    history: parseMatchHistory(row.history),
    rematchBy: row.rematch_by === 1 || row.rematch_by === 2 ? row.rematch_by : null,
    rematchDeclinedBy:
      row.rematch_declined_by === 1 || row.rematch_declined_by === 2
        ? row.rematch_declined_by
        : null,
    youAnswered: newRound ? false : view.youAnswered,
    yourGuess: newRound ? null : view.yourGuess,
    version: row.version,
  };
}

function parseTimestamp(value: string | null): number | null {
  if (value === null) return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : at;
}
