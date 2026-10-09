/**
 * Daily mode: ten date-guessing questions a day, the same ten for everybody,
 * playable once.
 *
 * Pure, like lib/game/set.ts and lib/game/versus.ts, and for the same reason —
 * the server decides everything that counts and the client has to be able to
 * describe the same state without forming a second opinion about it. What is
 * *not* here is any decision: the day's questions are drawn by lib/db/daily.ts,
 * a guess is graded by `gradeGuess`, and an answer is banked by
 * `daily_record_answer` in Postgres. This file is the vocabulary all three
 * share.
 *
 * Three rules are worth stating in one place, because every part of the mode
 * follows from them.
 *
 * **1. There are two challenges a day, and they hold disjoint events.** A
 * signed-out player can finish the day, read every answer off the reveals and
 * then create an account. If both audiences were asked the same ten questions
 * that would be a free perfect score, so the day's draw is split in half: the
 * questions a guest has seen are not the questions their new account is asked.
 * See the migration for the half of this that is enforced.
 *
 * **2. Only an account has a score.** The multiplier below, the points on the
 * result screen and the row in the database are all for members. A guest plays
 * the same ten questions and is told exactly how they did — that is the mode,
 * and withholding it would be withholding the game rather than the scoring —
 * but nothing is banked, because there is nothing durable to bank it against.
 *
 * **3. One attempt, and a refresh is not a second one.** For a member that is
 * a primary key: (user_id, puzzle_date), with the answers so far on the row,
 * so reopening the page resumes at the next unanswered question and a complete
 * row shows its own result screen. For a guest it is `localStorage`, holding
 * the same answers under the same rules — weaker, by the nature of a browser
 * with no identity in it, and the weakness is named in components/daily-game.tsx
 * rather than papered over.
 */

import { QUESTIONS_PER_SET, type SetResult } from "./set.ts";
import {
  gradeGuess,
  isVerdict,
  MAX_ROUND_POINTS,
  roundPoints,
  type GuessAccuracy,
  type Verdict,
} from "./scoring.ts";

/* -------------------------------------------------------------------------
   Who is playing
   ------------------------------------------------------------------------- */

/**
 * The two audiences, which are two separate challenges rather than two views
 * of one. `member` is anyone with an account; `guest` is everybody else.
 */
export const DAILY_AUDIENCES = ["member", "guest"] as const;
export type DailyAudience = (typeof DAILY_AUDIENCES)[number];

export function isDailyAudience(value: string): value is DailyAudience {
  return (DAILY_AUDIENCES as readonly string[]).includes(value);
}

/** Questions in a day. The same ten a solo set is — deliberately the same constant. */
export const QUESTIONS_PER_DAILY = QUESTIONS_PER_SET;

/* -------------------------------------------------------------------------
   Which day it is
   ------------------------------------------------------------------------- */

/**
 * The day a challenge belongs to, as `YYYY-MM-DD` in **UTC**.
 *
 * UTC rather than the player's own midnight, and that is the decision that
 * makes "the same ten questions for everybody" true: a local day boundary
 * would mean a player in Auckland and a player in Los Angeles were on
 * different puzzles for twenty-one hours out of every twenty-four, and two
 * friends comparing results would be comparing different games. The price is
 * that the reset lands at an awkward hour for some of the world, which is the
 * trade every daily puzzle makes.
 *
 * **Only the server ever calls this.** The date is handed to the client as a
 * prop, so a device whose clock is wrong — or set forward on purpose — cannot
 * talk itself into a second attempt or a different day's questions.
 */
export function dailyPuzzleDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Midnight UTC after the given puzzle date — when the next ten are dealt. */
export function dailyResetAt(puzzleDate: string): number {
  return Date.parse(`${puzzleDate}T00:00:00.000Z`) + DAY_MS;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long until the next puzzle, in whole minutes, floored at zero.
 *
 * Minutes rather than seconds because the result screen says "new questions in
 * 7h 12m" and nothing on it is worth a ticking second — and because a clock
 * running past midnight UTC while the screen is open would otherwise count
 * down into negatives on the way to a page the player has to reload anyway.
 */
export function minutesUntilReset(puzzleDate: string, now: number): number {
  return Math.max(0, Math.floor((dailyResetAt(puzzleDate) - now) / 60000));
}

/* -------------------------------------------------------------------------
   Points
   ------------------------------------------------------------------------- */

/**
 * What a daily round is worth, against the same question asked anywhere else.
 *
 * Three, by product decision: the daily is one shot a day at a fixed set, so
 * it has to be worth coming back for, and a multiplier says that without
 * needing a scoring system of its own. It multiplies `roundPoints` rather than
 * replacing it, which is the whole point — difficulty is still tuned in one
 * place (`BANDS` in ./scoring.ts) and a daily score can never disagree with
 * the verdict on screen.
 */
export const DAILY_POINT_MULTIPLIER = 3;

/** One round's daily points. Members only — see rule 2 at the top of this file. */
export function dailyRoundPoints(accuracy: GuessAccuracy): number {
  return roundPoints(accuracy) * DAILY_POINT_MULTIPLIER;
}

/** The most a day can be worth, for the "1,840 of 3,000" on the result screen. */
export const MAX_DAILY_POINTS =
  MAX_ROUND_POINTS * DAILY_POINT_MULTIPLIER * QUESTIONS_PER_DAILY;

/* -------------------------------------------------------------------------
   An answer
   ------------------------------------------------------------------------- */

/**
 * One answered question, as it is stored and as it comes back.
 *
 * Four facts and no derived ones. `distance`, `depth` and the relative error
 * are all arithmetic over `guess` and `year` (see `accuracyOf`), so storing
 * them would be storing the same thing twice and inviting the two copies to
 * disagree. `verdict` is the exception and is stored on purpose: it is the
 * tier that was *recorded*, and retuning `BANDS` later must not retroactively
 * change what a player earned.
 */
export interface DailyAnswer {
  /** Position in the day's ten. Answers are strictly sequential. */
  idx: number;
  /** The year the player locked in. */
  guess: number;
  /** The event's real year. Safe to hold: the question is over. */
  year: number;
  verdict: Verdict;
  /** Already multiplied. Zero for a guest, who banks nothing. */
  points: number;
}

/**
 * The guess read back as an accuracy, for the components that draw one.
 *
 * The numbers are recomputed and the tier is not: `gradeGuess` is a pure
 * function of (guess, year) and both are on the record, so the distance and
 * the depth can only come out the same — but the *verdict* is the one that was
 * banked, which is what keeps a finished day's result screen honest across a
 * change to the bands.
 */
export function accuracyOf(answer: DailyAnswer): GuessAccuracy {
  return { ...gradeGuess(answer.guess, answer.year), verdict: answer.verdict };
}

/** The day's answers as the shared set summary wants them. */
export function dailyResults(
  answers: readonly DailyAnswer[],
): SetResult[] {
  // A hit is what it is in every other mode: everything above the bottom
  // tier. `timelineResult` is not reused only because it would re-derive the
  // verdict it is being handed.
  return answers.map((answer) => ({
    hit: answer.verdict !== "wayOff",
    verdict: answer.verdict,
  }));
}

export function dailyPointsTotal(answers: readonly DailyAnswer[]): number {
  return answers.reduce((total, answer) => total + answer.points, 0);
}

/**
 * Read answers back out of untrusted JSON — the attempt's `answers` column, or
 * a guest's `localStorage`.
 *
 * Validated rather than cast, like `parseMatchHistory`, and for a sharper
 * reason here: a guest's copy lives somewhere the player can edit. A malformed
 * entry is dropped and the run is **truncated at the first gap**, so a
 * hand-edited store cannot produce a ten-answer day with holes in it — the
 * worst it can do is end the resume early, which hands back questions rather
 * than a score.
 */
export function parseDailyAnswers(value: unknown): DailyAnswer[] {
  if (!Array.isArray(value)) return [];

  const answers: DailyAnswer[] = [];

  for (const entry of value) {
    const answer = parseDailyAnswer(entry);
    // Strictly sequential, which is the same rule the database enforces. The
    // first entry that is not the next index ends the read.
    if (!answer || answer.idx !== answers.length) break;
    answers.push(answer);
    if (answers.length >= QUESTIONS_PER_DAILY) break;
  }

  return answers;
}

function parseDailyAnswer(value: unknown): DailyAnswer | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const { idx, guess, year, verdict, points } = record;

  if (!Number.isInteger(idx) || (idx as number) < 0) return null;
  if (!Number.isFinite(guess) || !Number.isFinite(year)) return null;
  if (typeof verdict !== "string" || !isVerdict(verdict)) return null;

  return {
    idx: idx as number,
    guess: guess as number,
    year: year as number,
    verdict,
    // A guest's store has no points in it and a tampered one may have
    // anything; neither is allowed to invent a score.
    points: Number.isFinite(points) ? Math.max(0, points as number) : 0,
  };
}

/* -------------------------------------------------------------------------
   A guest's attempt
   ------------------------------------------------------------------------- */

/**
 * Where a signed-out player's attempt lives.
 *
 * One key holding one day, not one key per day: a new day's store replaces the
 * old one, so nothing accumulates and there is nothing to prune. The version
 * in the name is what lets the shape change later without having to read a
 * store written by an older build.
 */
export const DAILY_GUEST_STORE_KEY = "tempus.daily.guest.v1";

export interface DailyGuestStore {
  /** The day these answers belong to. Compared against the server's date. */
  puzzleDate: string;
  answers: DailyAnswer[];
}

/**
 * Read a guest's store, keeping it only if it is for the day the server says
 * it is.
 *
 * The date comparison is the whole of "a new day resets the attempt", and it
 * is made against the *server's* puzzle date rather than the browser's own
 * clock — a device set forward would otherwise be a fresh attempt on demand.
 */
export function parseGuestStore(
  raw: string | null,
  puzzleDate: string,
): DailyAnswer[] {
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return [];
    const record = parsed as Record<string, unknown>;
    if (record.puzzleDate !== puzzleDate) return [];
    return parseDailyAnswers(record.answers);
  } catch {
    // Unparseable is the same as absent: the player gets the day they are
    // owed rather than an error about storage.
    return [];
  }
}

export function serializeGuestStore(store: DailyGuestStore): string {
  return JSON.stringify(store);
}

/* -------------------------------------------------------------------------
   Sharing
   ------------------------------------------------------------------------- */

/**
 * The day's result as a paste-able block.
 *
 * Shaped like the set's (lib/game/set.ts) with the day in the title and the
 * score on the second line, because a daily result is the one thing on this
 * site people would compare: the date is what makes two pasted grids
 * comparable, and leaving it out would make yesterday's and today's look
 * identical.
 *
 * The grid spoils nothing — the squares say how well it went, never which
 * events came up — which matters more here than anywhere else, since everyone
 * is playing the same ten.
 */
export function dailyShareText({
  title,
  puzzleDate,
  squares,
  hits,
  total,
  points,
  url,
}: {
  title: string;
  puzzleDate: string;
  squares: string;
  hits: number;
  total: number;
  /** Null for a guest, who has no score to quote. */
  points: number | null;
  url: string;
}): string {
  const score =
    points === null
      ? `${hits}/${total}`
      : `${hits}/${total} · ${points.toLocaleString("en-US")} pts`;

  return [`TEMPUS · ${title} · ${puzzleDate}`, score, "", squares, "", url].join(
    "\n",
  );
}
