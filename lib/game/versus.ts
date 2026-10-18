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
   Online matchmaking
   ------------------------------------------------------------------------- */

/**
 * The one mode online matchmaking plays. A public match is always the general
 * library: a rating has to mean one thing, and a league that mixed football
 * specialists with film buffs would rank neither. The database enforces it too
 * (`match_public_is_history`).
 */
export const PUBLIC_VERSUS_MODE: VersusMode = "history";

/**
 * How long "Opponent found" stays on screen before question one.
 *
 * Not a phase: the first round's `round_started_at` is simply stamped this far
 * in the future, and its deadline from there. So the twenty seconds a player
 * gets are twenty seconds of question, the server refuses a guess that arrives
 * early (`versus_submit` answers `early`), and a bot's thinking time is counted
 * from the same instant a person's is.
 */
export const PUBLIC_MATCH_INTRO_SECONDS = 3;

/**
 * How long the searching screen waits for a person before a bot takes the
 * other seat. The client picks a moment uniformly in this window; the server
 * refuses to seat a bot before `SEARCH_FALLBACK_MIN_MS` has passed since the
 * lobby opened, so a client cannot skip the wait to farm bots.
 */
export const SEARCH_FALLBACK_MIN_MS = 6000;
export const SEARCH_FALLBACK_MAX_MS = 9000;

/**
 * How often a searching client asks again. Each ask also tries to merge into an
 * older open lobby, which is what pairs two people who pressed the button in
 * the same second and so both opened lobbies of their own.
 */
export const SEARCH_POLL_MS = 1500;

/**
 * A lobby older than this is presumed dead and is never matched into: its host
 * would have been given a bot by `SEARCH_FALLBACK_MAX_MS`, so one still open
 * this long is a tab that was closed mid-search.
 */
export const PUBLIC_LOBBY_FRESH_SECONDS = 12;

/**
 * How recently a lobby's host must have asked for anybody to be seated
 * opposite them.
 *
 * Every searching poll stamps the host's seat (inside `versus_matchmake`, under
 * the lobby's lock), so a host who has stopped asking — the tab closed, the
 * page left without Cancel — stops being matchable this long after their last
 * ask, instead of for the rest of `PUBLIC_LOBBY_FRESH_SECONDS`. Whoever would
 * have been seated there otherwise plays ten rounds against nobody, and an
 * absent account is rated the loss. Four polls' worth rather than two: a poll
 * is scheduled only once the previous one has answered, and the answer comes
 * from a database a continent away, so the gap between two stamps is a poll
 * interval *plus* a slow round trip. Too tight and a host who is plainly there
 * flickers out of matchmaking between asks.
 */
export const SEARCH_HOST_SEEN_MS = SEARCH_POLL_MS * 4;

/**
 * How far apart in KP two players may be and still meet across a league
 * boundary. Inside one league anyone may meet anyone; this only lets a 290 meet
 * a 320 rather than both waiting for their own league to fill.
 */
export const NEAR_RATING_WINDOW = 150;

/**
 * The heartbeat of a live public round.
 *
 * A bot has no browser to push its answer from, so its answer is applied by
 * `versus_reconcile` the first time anyone touches the match after the bot's
 * moment has passed. In a public round each client therefore prompts the
 * server on this cadence (jittered) until the opponent has answered — which is
 * also exactly what it does against a person, and the only way it learns that
 * a person has answered too: a public match never pushes a first answer (see
 * the migration's header), so "your opponent locked in" always arrives in the
 * answer to a beat, whoever the opponent is.
 *
 * Sent to a Route Handler (`VERSUS_TICK_PATH`) with `fetch`, not as a Server
 * Action. A page's Server Actions run one at a time — Next queues them on the
 * router — so a beat in flight would hold back a lock-in pressed in the last
 * second until the beat had answered, and `versus_submit` judges the deadline
 * when the guess arrives, not when it was pressed.
 */
export const PUBLIC_TICK_MS = 1500;
export const PUBLIC_TICK_JITTER_MS = 400;

/** Where a beat is sent: app/api/versus/tick/route.ts. */
export const VERSUS_TICK_PATH = "/api/versus/tick";

/**
 * How long a change has to have been on the row before a beat hands it over
 * itself rather than leaving it to the push.
 *
 * A beat is a fallback for a socket that dropped a row, not a second way to
 * deliver one. Answering every beat that lands after a change with the new view
 * would deliver *some* reveals in a beat's answer — and in a bot match the
 * reveal of a bot's second answer happens inside the beat that writes it, so
 * that share would be every one of them rather than the few a person's submit
 * happens to race a beat with. With the grace, a change a beat finds is left to
 * the push unless it is old enough that the push has plainly been lost.
 */
export const TICK_PUSH_GRACE_MS = 2500;

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

/**
 * What a caller must decide before an event may cross the wire masked.
 *
 * Every field that can carry the answer *other than* the date columns, and
 * each one is required rather than defaulted, so a new caller has to think
 * about it instead of inheriting a leak:
 *
 *   * `imageUrl` — the picture's URL with nothing in it but an opaque token
 *     (`maskedImageUrl` in lib/storage/masked-image.ts). An event photo's key
 *     is `<era>/<slug>.<ext>` (CLAUDE.md), so the plain CDN URL names the era
 *     folder — `bce/` or `ce/` — which halves the rail before the player has
 *     looked at the picture. Null for an event with no photograph.
 *   * `description` — null while the round is live. Descriptions are written
 *     prose about the event and routinely name its date; pass the real one
 *     only for a round that has already been answered.
 *   * `id` / `slug` — the head-to-head passes an opaque per-round id, because
 *     `public.event` is world-readable and an event id is one REST call from
 *     its year. The daily keeps the real id (its "wrong date" report needs
 *     it). Neither closes the name lookup — the name has to be shown — which
 *     is why grading never trusts the client either way.
 */
export interface MaskOptions {
  imageUrl: string | null;
  description: string | null;
  id: string;
  slug: string;
  format?: ScreenFormat | null;
}

export function maskEvent(
  event: LocalizedEvent,
  options: MaskOptions,
): MaskedEvent {
  // Destructured rather than spread-and-delete, so the discarded fields are
  // named here and a new date-bearing column on LocalizedEvent has to be
  // thought about rather than inherited into the payload.
  const {
    year: _y,
    month: _m,
    day: _d,
    sortKey: _s,
    precision: _p,
    image,
    ...rest
  } = event;

  return {
    ...rest,
    id: options.id,
    slug: options.slug,
    description: options.description,
    format: options.format ?? null,
    // The key is replaced as well as the URL: `EventVisual` keys its crossfade
    // on `objectKey`, and the real key is the same `<era>/` leak by another
    // name. The opaque URL is stable per round, so it is a stable key too.
    // Free-text attribution goes for the same reason — an author line or a
    // caption ("NASA, 1969") is a date as often as not. Nothing on a live
    // round renders it.
    image:
      image && options.imageUrl
        ? {
            objectKey: options.imageUrl,
            url: options.imageUrl,
            mimeType: image.mimeType,
            width: image.width,
            height: image.height,
            attribution: {
              sourceName: image.attribution.sourceName,
              sourcePageUrl: null,
              author: null,
              licenseCode: image.attribution.licenseCode,
              attributionText: null,
            },
          }
        : null,
  };
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
  /**
   * Whether the other seat has answered the live round — only that, never
   * with what.
   *
   * Read from `match_answer` when the view is built rather than derived from
   * `answeredCount`, because in a public match the count is never pushed: a
   * first answer is found by the other seat's own next request, a person's
   * and a bot's alike (see the migration's header). An invitation still pushes
   * its count, and `applyMatchRow` keeps this in step from it.
   */
  theyAnswered: boolean;
  /** Monotonic; a view with a lower version than the one in hand is stale. */
  version: number;
  /**
   * An online (matchmade) match rather than an invitation. No rematch, no
   * presence, names and ratings on screen — and nothing anywhere that says
   * whether the other seat is a person.
   */
  isPublic: boolean;
  /**
   * Display names for a public match; null is a guest (or a private match).
   *
   * Like the two below, only ever from a server-built view: none of the three
   * is granted to clients on the `match` row (see `MATCH_CLIENT_COLUMNS`), so
   * a push carries the view's own values forward and `foldView` takes them
   * from whichever fetched view last knew them.
   */
  names: Record<Seat, string | null>;
  /** Chrono Rating at seating; null for a guest or a private match. */
  ratings: Record<Seat, number | null>;
  /** The settled change, once a public match is over; null otherwise. */
  ratingDeltas: Record<Seat, number | null>;
  /** The seat that left a started public match, if one did. */
  forfeitSeat: Seat | null;
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

/**
 * The view as it stands once the reveal is over, before the server has said
 * so.
 *
 * `versus_reconcile` starts the next round at `reveal_until_at` itself
 * (supabase/migrations/20261017210000_versus_round_starts_on_time.sql), an
 * instant this client already has — as it has the next question, masked, and
 * its picture, preloaded. So at that instant the next round can be drawn
 * exactly as the server will describe it a round trip later, instead of the
 * reveal sitting at zero for that trip. The request that makes it official is
 * still sent (the deadline prompt in `VersusGame`); this only decides what is
 * on screen while it is on its way.
 *
 * `version` is left alone on purpose: the server's own word on the new round
 * (a push or a read) carries a higher one and replaces this wholesale. Not
 * after the last round, whose end is the summary and needs the server's
 * settlement, and not without the next question in hand.
 */
export function viewAtRevealEnd(view: MatchView, serverNow: number): MatchView {
  if (view.phase !== "revealed" || view.revealUntilAt === null) return view;
  if (serverNow < view.revealUntilAt) return view;

  const next = view.currentIdx + 1;
  if (next >= view.totalRounds || view.events[next] === undefined) return view;

  return {
    ...view,
    phase: "playing",
    currentIdx: next,
    roundStartedAt: view.revealUntilAt,
    roundDeadlineAt: view.revealUntilAt + view.roundSeconds * 1000,
    revealUntilAt: null,
    answeredCount: 0,
    youAnswered: false,
    yourGuess: null,
    theyAnswered: false,
  };
}

/**
 * Whether the other seat has locked in the live round. See `theyAnswered` for
 * why that is a field of the view rather than arithmetic on the count.
 */
export function opponentAnswered(view: MatchView): boolean {
  return view.phase === "playing" && view.theyAnswered;
}

/**
 * Whether the first round of a public match is still in its intro — the
 * "opponent found" moment before question one. `serverNow` is the client's
 * corrected clock.
 */
export function inMatchIntro(view: MatchView, serverNow: number): boolean {
  return (
    view.phase === "playing" &&
    view.roundStartedAt !== null &&
    serverNow < view.roundStartedAt
  );
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
 * The whole `match` row — what the service role reads and writes on the
 * server, never what a browser sees.
 *
 * It carries columns no client may read (the invite `code`, `public_tier`, the
 * bookkeeping timestamps, the seats' names and ratings), so nothing
 * client-side should be typed as it. The
 * client's shape is `VersusMatchPush` below, the subset the column grant lets
 * Realtime deliver; this type is only its base. The same push goes to both
 * players rather than a per-seat view, which is safe because every *granted*
 * column is public by construction (see the migration's header). Turning a
 * push back into a `MatchView` is `applyMatchRow` below.
 */
export type VersusMatchRow = Database["public"]["Tables"]["match"]["Row"];

/**
 * The columns of `match` a client may read — the column-level grant in
 * supabase/migrations/20261017180000_versus_online.sql, written out.
 *
 * Realtime filters every pushed row through `has_column_privilege`, so what
 * arrives on the socket is exactly this and not the whole row: no invite
 * `code` (the old `using (true)` policy let anyone list open lobbies' codes),
 * no `created_at`/`updated_at`, no `public_tier` — and nothing that names or
 * rates a seat. The rows stay listable by anyone with the anon key, and a
 * username on a listable row is every account's online record published, and
 * a bot's name followed across matches it could not all be in. The two seats
 * read names, ratings and deltas in their own views (`publicSeatFields`).
 * Typing the push as this rather than as the row is what makes reading one of
 * those a compile error instead of an `undefined` at runtime. Keep it in step
 * with the grant.
 */
export const MATCH_CLIENT_COLUMNS = [
  "id",
  "mode",
  "phase",
  "generation",
  "total_rounds",
  "round_seconds",
  "reveal_seconds",
  "current_idx",
  "round_started_at",
  "round_deadline_at",
  "reveal_until_at",
  "answered_count",
  "seat1_joined",
  "seat2_joined",
  "seat1_ready",
  "seat2_ready",
  "seat1_score",
  "seat2_score",
  "history",
  "rematch_by",
  "rematch_declined_by",
  "version",
  "is_public",
  "forfeit_seat",
] as const satisfies readonly (keyof VersusMatchRow)[];

export type VersusMatchPush = Pick<
  VersusMatchRow,
  (typeof MATCH_CLIENT_COLUMNS)[number]
>;

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
 * The row is the whole truth about the match's state but only part of what
 * the screen needs: it carries no masked events (the client fetches those), no
 * seat (the row is the same for both players), no names, ratings or rating
 * changes (not granted — see `MATCH_CLIENT_COLUMNS`) and no server clock
 * reading that is usable for timing — `updated_at` arrives one network hop
 * late, and adopting it as "now" would quietly shorten every countdown by the
 * latency. So those are carried over from the existing view and everything
 * else is replaced.
 *
 * Three derived rules, all of which are bugs if they are left out:
 *
 *   * **A row older than the one in hand is dropped.** A view fetched over
 *     HTTP can land after a row pushed over the socket; without the version
 *     check the slower answer wins and the screen goes backwards.
 *   * **`youAnswered` resets when the round changes.** It is the one field the
 *     row cannot carry — the match knows two people answered, not which of
 *     them is reading this screen — so a new round has to clear it or the
 *     player opens question four already locked out of it.
 *   * **`theyAnswered` follows the count only in an invitation.** A public
 *     match never pushes a first answer, so its count says nothing and the
 *     view's own value stands until the round changes (see `theyAnswered`).
 */
export function applyMatchRow(
  view: MatchView,
  row: VersusMatchPush,
): MatchView {
  if (row.version <= view.version) return view;

  const newRound =
    row.current_idx !== view.currentIdx || row.generation !== view.generation;
  const isPublic = row.is_public === true;
  const youAnswered = newRound ? false : view.youAnswered;

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
    youAnswered,
    yourGuess: newRound ? null : view.yourGuess,
    theyAnswered: isPublic
      ? newRound
        ? false
        : view.theyAnswered
      : row.answered_count - (youAnswered ? 1 : 0) > 0,
    version: row.version,
    isPublic,
    forfeitSeat: toSeat(row.forfeit_seat),
  };
}

/**
 * The public-match columns of the whole row, as the server reads them into a
 * view. Server-side by type: names, ratings and deltas are not on the push.
 */
export function publicSeatFields(
  row: VersusMatchRow,
): Pick<
  MatchView,
  "isPublic" | "names" | "ratings" | "ratingDeltas" | "forfeitSeat"
> {
  return {
    isPublic: row.is_public === true,
    names: { 1: row.seat1_name ?? null, 2: row.seat2_name ?? null },
    ratings: { 1: row.seat1_rating ?? null, 2: row.seat2_rating ?? null },
    ratingDeltas: {
      1: row.seat1_rating_delta ?? null,
      2: row.seat2_rating_delta ?? null,
    },
    forfeitSeat: toSeat(row.forfeit_seat),
  };
}

/**
 * Fold a freshly fetched view into the one in hand.
 *
 * A fetch can land after a push that is newer — the socket and the HTTP
 * request are two races against each other — so the version decides which
 * one's *state* stands. But a fetched view is also the only source of what a
 * push never carries, and those are taken from it even when it lost the race:
 *
 *   * the questions, merged, since each view carries only the live round's
 *     and the next;
 *   * the names and ratings, once the view saw both seats filled — they are
 *     stamped when the match fills and never change, so any view from after
 *     that is right about them, however old it is otherwise;
 *   * the rating changes, once the view saw the match over — they are written
 *     by the update that ends it, and nothing in a public match changes after.
 */
export function foldView(current: MatchView, next: MatchView): MatchView {
  const events = { ...current.events, ...next.events };
  if (next.version >= current.version) return { ...next, events };

  const filled = next.seats[1].joined && next.seats[2].joined;
  const over = next.phase === "complete" || next.phase === "abandoned";

  return {
    ...current,
    events,
    ...(filled ? { names: next.names, ratings: next.ratings } : {}),
    ...(over ? { ratingDeltas: next.ratingDeltas } : {}),
  };
}

/**
 * What a beat answers (app/api/versus/tick/route.ts): a view when there is
 * news this seat must hear from the beat itself, else null. Typed here rather
 * than in the route because a route module may export only its handlers.
 */
export type TickResponse =
  | { ok: true; view: MatchView | null }
  | { ok: false; reason: string };

function toSeat(value: number | null | undefined): Seat | null {
  return value === 1 || value === 2 ? value : null;
}

function parseTimestamp(value: string | null): number | null {
  if (value === null) return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : at;
}
