import "server-only";

/**
 * The day's challenges, and one player's attempt at one.
 *
 * **Every function here takes the service-role client**, and that is not a
 * convenience — it is the design. `daily_challenge.event_ids` is the day's
 * answer sheet (`public.event` is world readable, so an event id is a year),
 * so that table has RLS on, no policy and no grants: there is no client path
 * to it at all. `daily_attempt` is a score, so it is written the way badge
 * progress is written — only by the service role, through one plpgsql function
 * — because a player who could write their own row could write any score into
 * it. A player *reads* their own attempt through RLS, which is what the select
 * policy is for, but even that read happens here on the server.
 *
 * The one thing this module decides is which events a day asks about. Nothing
 * else: a guess is graded in lib/game/scoring.ts and an answer is banked by
 * `daily_record_answer`, which is the referee for everything about ordering
 * and duplication.
 */

import type { createAdminDbClient } from "./admin.ts";
import { eventsByIds, randomEvents, type DbClient } from "./queries.ts";
import { DEFAULT_LOCALE, type LocalizedEvent } from "./types.ts";
import {
  DAILY_AUDIENCES,
  parseDailyAnswers,
  QUESTIONS_PER_DAILY,
  type DailyAnswer,
  type DailyAudience,
} from "../game/daily.ts";
import type { Verdict } from "../game/scoring.ts";

/** Service-role client. Named so call sites read as "this needs the key". */
type AdminClient = ReturnType<typeof createAdminDbClient>;

/** The day's questions for one audience, in the order they are asked. */
export interface DailyChallenge {
  puzzleDate: string;
  audience: DailyAudience;
  eventIds: string[];
}

/**
 * Both of a day's challenges, drawing them if this is the first request of the
 * day.
 *
 * **Drawn lazily rather than by a scheduled job**, because the site has no
 * scheduler and a cron that failed would mean a day with no game. The first
 * visitor of the day pays for one draw; everybody after them reads the row.
 *
 * **The draw is one pool split in two, which is what makes the halves
 * disjoint.** Twenty distinct events are drawn in one go and cut down the
 * middle: the member challenge takes the first ten and the guest challenge the
 * second. Two independent draws would *probably* differ, and probably is not
 * the guarantee this needs — a guest who has seen the answers must not be able
 * to sign up and meet the same questions.
 *
 * **Races are settled by the primary key, not by checking first.** Two first
 * visitors can arrive together and both draw; both then insert with
 * `ignoreDuplicates`, one set of rows wins, and both re-read whatever the
 * database actually holds. So the losing draw is discarded rather than
 * becoming a second version of the day — which is the only outcome that
 * matters here, since the whole promise of the mode is that everybody gets the
 * same ten.
 */
export async function ensureDailyChallenges(
  admin: AdminClient,
  puzzleDate: string,
): Promise<Record<DailyAudience, DailyChallenge> | null> {
  // A settled day never changes (the primary key above sees to that), so once
  // this process has read it, it is not read again — the page and every
  // banked guess used to pay a round trip to learn the same twenty ids.
  const remembered = settledDays.get(puzzleDate);
  if (remembered) return remembered;

  const existing = await readChallengeRows(admin, puzzleDate);
  if (existing) return rememberDay(puzzleDate, existing);

  // `requireImage` is left at its default: an event with no photograph is not
  // on the site, and the daily is the one mode where a missing picture would
  // be missing for everybody at once.
  const pool = await randomEvents(admin, {
    count: QUESTIONS_PER_DAILY * DAILY_AUDIENCES.length,
    locale: DEFAULT_LOCALE,
    distinctYears: true,
  });

  // Not enough illustrated events to fill both halves without overlap. The
  // caller shows the "no events" notice rather than dealing a short day or a
  // shared one — see the note on disjointness above.
  if (pool.length < QUESTIONS_PER_DAILY * DAILY_AUDIENCES.length) return null;

  // **The shuffle before the cut is load-bearing**, exactly as it is in
  // `dealComparisonRounds`: `randomEvents` draws at random but returns its
  // batch in *timeline order*, so cutting it down the middle would hand one
  // audience the twenty oldest events of the draw and the other the twenty
  // newest — a daily of nothing but antiquity, and a daily of nothing but the
  // last two centuries. It also decides the order the questions are asked in,
  // which otherwise marches forward through history and tells the player
  // roughly where each answer is before they have looked at it.
  const shuffled = shuffle(pool);

  const { data, error } = await admin.rpc("daily_ensure_challenges", {
    p_puzzle_date: puzzleDate,
    p_member: shuffled.slice(0, QUESTIONS_PER_DAILY).map((event) => event.id),
    p_guest: shuffled
      .slice(QUESTIONS_PER_DAILY, QUESTIONS_PER_DAILY * 2)
      .map((event) => event.id),
  });

  if (error) throw new Error(`ensureDailyChallenges: ${error.message}`);

  // What the function returns is what the table holds — this draw's rows if
  // it won the race to deal the day, the other request's if it lost. Either
  // way it is the day everybody else is playing.
  const settled = collectChallenges(data ?? []);
  if (!settled) {
    throw new Error("ensureDailyChallenges: incomplete day after dealing");
  }
  return rememberDay(puzzleDate, settled);
}

/** Settled days, by date. Two entries at most: today, and yesterday's tail. */
const settledDays = new Map<string, Record<DailyAudience, DailyChallenge>>();

function rememberDay(
  puzzleDate: string,
  day: Record<DailyAudience, DailyChallenge>,
): Record<DailyAudience, DailyChallenge> {
  settledDays.set(puzzleDate, day);
  for (const date of settledDays.keys()) {
    if (settledDays.size <= 2) break;
    settledDays.delete(date);
  }
  return day;
}

/**
 * A uniform shuffle over a copy.
 *
 * The same Fisher-Yates `app/actions/rounds.ts` uses, written out again rather
 * than imported: that module is `"use server"` and may export nothing but
 * async functions.
 */
function shuffle<T>(rows: readonly T[]): T[] {
  const pool = [...rows];

  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }

  return pool;
}

async function readChallengeRows(
  admin: AdminClient,
  puzzleDate: string,
): Promise<Record<DailyAudience, DailyChallenge> | null> {
  const { data, error } = await admin
    .from("daily_challenge")
    .select("puzzle_date, audience, event_ids")
    .eq("puzzle_date", puzzleDate);

  if (error) throw new Error(`readDailyChallenges: ${error.message}`);
  return collectChallenges(data ?? []);
}

/**
 * Both of a day's challenges, or null if either is missing.
 *
 * Both or neither: a day with one challenge is a day where one audience has no
 * game, and re-dealing is the right answer to it rather than rendering half a
 * day.
 */
function collectChallenges(
  rows: readonly {
    puzzle_date: string;
    audience: DailyAudience;
    event_ids: string[];
  }[],
): Record<DailyAudience, DailyChallenge> | null {
  const byAudience = new Map(
    rows.map((row) => [
      row.audience,
      {
        puzzleDate: row.puzzle_date,
        audience: row.audience,
        eventIds: row.event_ids,
      } satisfies DailyChallenge,
    ]),
  );

  if (DAILY_AUDIENCES.some((audience) => !byAudience.get(audience))) return null;

  return Object.fromEntries(
    DAILY_AUDIENCES.map((audience) => [audience, byAudience.get(audience)!]),
  ) as Record<DailyAudience, DailyChallenge>;
}

/**
 * The day's events, localized, in the order the challenge fixed.
 *
 * `eventsByIds` preserves the given order, which is what makes "question 4" the
 * same event for every player — and it is read with the service-role client
 * because the page needs the years to mask them, never to send them.
 *
 * **A challenge that cannot be resolved completely is refused.** An array
 * element cannot carry a foreign key, so an event deleted after the day was
 * dealt would come back short; dealing nine questions when the attempt expects
 * ten would strand a player one answer from the end. Null here surfaces as the
 * "no events" notice, which is recoverable by a reload the next day.
 */
export async function readDailyQuestions(
  admin: AdminClient,
  challenge: DailyChallenge,
  locale: string = DEFAULT_LOCALE,
): Promise<LocalizedEvent[] | null> {
  const events = await eventsByIds(admin, challenge.eventIds, locale);
  return events.length === challenge.eventIds.length ? events : null;
}

/* -------------------------------------------------------------------------
   One player's attempt
   ------------------------------------------------------------------------- */

/** A member's attempt at one day, as the page needs it. */
export interface DailyAttempt {
  answers: DailyAnswer[];
  points: number;
  hits: number;
  /** Null while the day is still in progress. */
  completedAt: string | null;
}

/** An attempt that has not been started, so the page has one shape to render. */
export const NO_DAILY_ATTEMPT: DailyAttempt = {
  answers: [],
  points: 0,
  hits: 0,
  completedAt: null,
};

/**
 * The signed-in player's attempt at a day, or the empty one.
 *
 * Read with the **caller's own** client rather than the service role: the row
 * belongs to them, `auth.uid()` names the owner in the select policy, and a
 * policy is stronger than a `where` clause this function could forget. The
 * same reasoning as `readUsername`.
 */
export async function readDailyAttempt(
  client: DbClient,
  userId: string,
  puzzleDate: string,
): Promise<DailyAttempt> {
  const { data, error } = await client
    .from("daily_attempt")
    .select("answers, points, hits, completed_at")
    .eq("user_id", userId)
    .eq("puzzle_date", puzzleDate)
    .maybeSingle();

  if (error) throw new Error(`readDailyAttempt: ${error.message}`);
  if (!data) return NO_DAILY_ATTEMPT;

  return {
    answers: parseDailyAnswers(data.answers),
    points: data.points,
    hits: data.hits,
    completedAt: data.completed_at,
  };
}

/**
 * Banks one graded answer and returns the attempt as the database now holds
 * it. **Service role only.**
 *
 * It is a single RPC rather than a read, a check and a write because three
 * things have to be impossible under concurrency: banking the same question
 * twice (two tabs, a double-tap, a retried request), answering ahead of the
 * questions the player has actually been shown, and adding to a day that is
 * already complete. `daily_record_answer` does all three under
 * `select ... for update` — see the migration. A submission it refuses is a
 * no-op that returns the row unchanged, which is exactly what the caller
 * wants: the state it already had.
 */
export async function recordDailyAnswer(
  admin: AdminClient,
  input: {
    userId: string;
    puzzleDate: string;
    idx: number;
    guess: number;
    year: number;
    verdict: Verdict;
    points: number;
    hit: boolean;
  },
): Promise<DailyAttempt> {
  const { data, error } = await admin.rpc("daily_record_answer", {
    p_user_id: input.userId,
    p_puzzle_date: input.puzzleDate,
    p_idx: input.idx,
    p_guess: input.guess,
    p_year: input.year,
    p_verdict: input.verdict,
    p_points: input.points,
    p_hit: input.hit,
    p_total: QUESTIONS_PER_DAILY,
  });

  if (error) throw new Error(`recordDailyAnswer: ${error.message}`);

  const row = data as unknown as {
    answers: unknown;
    points: number;
    hits: number;
    completed_at: string | null;
  };

  return {
    answers: parseDailyAnswers(row.answers),
    points: row.points,
    hits: row.hits,
    completedAt: row.completed_at,
  };
}
