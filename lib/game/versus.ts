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
import type { Dict } from "../i18n/dictionary.ts";
import type { ScreenFormat } from "./screen.ts";
import { FOOTBALL_BANDS, isVerdict, SCREEN_BANDS, type BandSet, type Verdict } from "./scoring.ts";
import { QUESTIONS_PER_SET } from "./set.ts";
import {
  DEFAULT_PANE,
  FOOTBALL_DEFAULT_PANE,
  FOOTBALL_PANES,
  SCREEN_DEFAULT_PANE,
  SCREEN_PANES,
  TIMELINE_PANES,
  type PaneSet,
  type TimelinePane,
} from "./timeline.ts";
import { FOOTBALL_TOPIC, SCREEN_TOPIC } from "./topics.ts";

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

/* -------------------------------------------------------------------------
   Modes
   ------------------------------------------------------------------------- */

/**
 * Which date-guessing game a match is a match *of*.
 *
 * One match is ten questions drawn from one pool, and the pool is stamped on
 * the match row when it is created (`match.mode`, see
 * supabase/migrations/20261010120000_versus_modes.sql) rather than chosen per
 * round. So a mode here is exactly the same kind of thing the solo subject
 * games are: a pool, a rail, a tolerance ladder and a layout — nothing about
 * timing, seats or who won.
 *
 * `history` is the general library, i.e. the game `/guess` plays. It is named
 * rather than left null so that every match says what it is, including the
 * ones created before modes existed — which is also why it is the column's
 * default.
 *
 * Adding a fourth is a category row, a slug in lib/game/topics.ts, a dealer in
 * app/actions/rounds.ts and an entry below. It is deliberately **not** a
 * migration: see the one that added the column.
 */
export const VERSUS_MODES = ["history", "football", "screen"] as const;

export type VersusMode = (typeof VERSUS_MODES)[number];

export const DEFAULT_VERSUS_MODE: VersusMode = "history";

export function isVersusMode(value: string): value is VersusMode {
  return (VERSUS_MODES as readonly string[]).includes(value);
}

/**
 * Read a mode off a database row or a client request.
 *
 * Tolerant on purpose, and in both directions. A client naming a mode this
 * deploy does not have gets the general game rather than an error, and a row
 * written by a newer deploy than the one reading it renders as a general match
 * rather than as a blank screen. The strict check above is what the *creating*
 * path uses, where a silent fallback would be a mode the player did not pick.
 */
export function asVersusMode(value: unknown): VersusMode {
  return typeof value === "string" && isVersusMode(value)
    ? value
    : DEFAULT_VERSUS_MODE;
}

/**
 * How a round is drawn on screen.
 *
 * `stage` is the one-column screen every other date-guessing game uses: a
 * landscape photograph over a rail. `poster` is the film & television split —
 * a 2:3 poster beside the rail, because a poster in that column is either
 * cropped to a letterbox or leaves no room for a ruler. See `ScreenGame` for
 * the full argument; the head-to-head mode reuses the same two shapes rather
 * than inventing a third.
 */
export type VersusLayout = "stage" | "poster";

export interface VersusModeSpec {
  /**
   * The pool, as its `kind = 'topic'` category slug — null for the general
   * library, which is the pool every topic is excluded *from*. Server-side
   * only: it is what `randomEvents` is given when the rounds are dealt.
   */
  topicSlug: string | null;
  /** The rail, or rails, the round is played over. */
  panes: PaneSet;
  /** Where a round opens, and where the camera returns between rounds. */
  homePane: TimelinePane;
  /**
   * The tolerance ladder. Undefined means the general one (`gradeGuess`'s own
   * default), which grades against the event's age; a pool whose events are
   * all roughly contemporary brings its own.
   */
  bands?: BandSet;
  layout: VersusLayout;
  /** Dict key naming the mode, so a mode is named once on this site. */
  titleKey: keyof Dict;
  /** Dict key for the one line under that name on the mode picker. */
  blurbKey: keyof Dict;
  /**
   * Whether the typed-date control draws its era half.
   *
   * A pool that begins after year 1 can only ever refuse a BCE date, so the
   * chip is not drawn at all — the same rule the solo games apply, and the
   * reason `DateEntry` has an `eraHidden` prop.
   */
  eraInEntry: boolean;
}

/**
 * Every mode, and the four or five facts that make it one.
 *
 * Deliberately the same values the solo pages pass by hand
 * (app/(public)/football/page.tsx, components/screen-game.tsx): a head-to-head
 * football match has to be the football game with someone else in it, and
 * sharing the constants is what makes that true rather than nearly true.
 */
export const VERSUS_MODE_SPEC: Record<VersusMode, VersusModeSpec> = {
  history: {
    topicSlug: null,
    panes: TIMELINE_PANES,
    homePane: DEFAULT_PANE,
    layout: "stage",
    titleKey: "timelineTitle",
    blurbKey: "versusModeHistoryBlurb",
    eraInEntry: true,
  },
  football: {
    topicSlug: FOOTBALL_TOPIC,
    panes: FOOTBALL_PANES,
    homePane: FOOTBALL_DEFAULT_PANE,
    bands: FOOTBALL_BANDS,
    layout: "stage",
    titleKey: "footballTitle",
    blurbKey: "cardFootballBlurb",
    eraInEntry: false,
  },
  screen: {
    topicSlug: SCREEN_TOPIC,
    panes: SCREEN_PANES,
    homePane: SCREEN_DEFAULT_PANE,
    bands: SCREEN_BANDS,
    layout: "poster",
    titleKey: "screenTitle",
    blurbKey: "cardScreenBlurb",
    eraInEntry: false,
  },
};

export function versusModeSpec(mode: VersusMode): VersusModeSpec {
  return VERSUS_MODE_SPEC[mode];
}

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
> & {
  /**
   * Film or series, in the `screen` mode only — null or absent everywhere
   * else.
   *
   * Not a leak and not decoration: the stored year is a release for a film and
   * a *premiere* for a series, so a player shown a poster with no label can be
   * marked wrong for a reasonable answer. See lib/game/screen.ts, where the
   * same field is part of the solo game's round for the same reason.
   */
  format?: ScreenFormat | null;
};

export function maskEvent(
  event: LocalizedEvent,
  format: ScreenFormat | null = null,
): MaskedEvent {
  // Destructured rather than spread-and-delete, so the discarded fields are
  // named here and a new date-bearing column on LocalizedEvent has to be
  // thought about rather than inherited into the payload.
  const { year: _y, month: _m, day: _d, sortKey: _s, precision: _p, ...rest } =
    event;
  return { ...rest, format };
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
  /**
   * Which date-guessing pool this match is played over. Stamped when the
   * match was created and never changed, rematches included — the invitation
   * was to a game, not to a draw.
   */
  mode: VersusMode;
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
    // Stamped at creation and immutable, so this only ever re-reads what the
    // view already had. Read off the row anyway rather than carried over:
    // every other column here comes from the row, and a field that silently
    // did not would be the one to go stale if the rule ever changed.
    mode: asVersusMode(row.mode),
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
