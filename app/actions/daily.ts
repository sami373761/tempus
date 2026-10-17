"use server";

import { getCurrentUser } from "@/lib/auth/server";
import { createAdminDbClient } from "@/lib/db/admin";
import {
  ensureDailyChallenges,
  readDailyAttempt,
  recordDailyAnswer,
  type DailyChallenge,
} from "@/lib/db/daily";
import { eventsByIds } from "@/lib/db/queries";
import { createServerDbClient } from "@/lib/db/server";
import {
  dailyPuzzleDate,
  dailyRoundPoints,
  QUESTIONS_PER_DAILY,
  type DailyAnswer,
  type DailyAudience,
} from "@/lib/game/daily";
import { gradeGuess } from "@/lib/game/scoring";
import { paneBounds, TIMELINE_PANES } from "@/lib/game/timeline";
import { readLocale } from "@/lib/i18n/server";

/**
 * Locking in one daily guess — the mode's entire write surface.
 *
 * **The client is never told an answer before it has guessed.** The page hands
 * down masked events (`MaskedEvent`, the same type the head-to-head mode uses)
 * and nothing else; the year arrives here, in the reply to a guess that has
 * already been made. That is why grading lives in this action rather than in
 * the component: a client that knew the year could score a perfect day, and
 * for a member that score is durable.
 *
 * **Nothing about who is playing comes from the caller.** The audience is
 * derived from the session on this request, which is what makes "a guest
 * cannot bank a score" a property of the server rather than a flag the browser
 * sends. A signed-out caller is graded and told how they did — that is the
 * mode — and nothing is written.
 *
 * **The day is the server's day.** `dailyPuzzleDate()` is read here, never
 * taken as an argument, so a device with its clock wound forward cannot ask
 * for a different day's questions or a second attempt at this one.
 *
 * The question index *is* supplied by the caller, and is the one argument that
 * is. It is safe because it is not trusted: `daily_record_answer` accepts only
 * the next index in sequence (see the migration), so an index that is a
 * duplicate, a skip-ahead or an answer to a finished day changes nothing and
 * reads back as the state the player already had.
 *
 * **The event's note comes back here too, beside its year.** The page masks
 * the description of every question still to be answered (`maskEvent` in
 * lib/game/versus.ts), because it is prose about the event that names its date
 * as often as not — the answer, in a sentence. So it travels the way the year
 * does: in the reply to a guess that has already been graded, when neither can
 * change the grade.
 */

export type DailyGuessResult =
  | {
      ok: true;
      answer: DailyAnswer;
      /**
       * The event's description in the caller's language, or null where it has
       * none — which `NoteFlank` turns into the placeholder, exactly as an
       * unmasked event's null does.
       */
      note: string | null;
      /** The attempt as the database now holds it; null for a guest. */
      banked: { points: number; hits: number; completed: boolean } | null;
    }
  | { ok: false; reason: DailyGuessFailure };

/**
 * Why a guess was refused. Coarse on purpose — each is a different bug or a
 * different retry, and none of them is a sentence the player needs.
 */
export type DailyGuessFailure =
  /** The index or the year was not something the game can produce. */
  | "bad-input"
  /** No challenge for today, which means the dataset could not fill one. */
  | "no-challenge"
  /** Already answered, or answered out of order. The client should re-read. */
  | "stale"
  /** The database said no. */
  | "failed";

export async function submitDailyGuess(
  idx: number,
  year: number,
): Promise<DailyGuessResult> {
  if (!Number.isInteger(idx) || idx < 0 || idx >= QUESTIONS_PER_DAILY) {
    return { ok: false, reason: "bad-input" };
  }
  // The rail cannot be dragged outside this, but an action can be called
  // without the rail. The bounds are the timeline's own outermost panes, so
  // they cannot drift from what is reachable on screen.
  if (!Number.isFinite(year) || year < GUESS_MIN || year > GUESS_MAX) {
    return { ok: false, reason: "bad-input" };
  }

  try {
    const admin = createAdminDbClient();
    const user = await getCurrentUser();
    const audience: DailyAudience = user ? "member" : "guest";
    const puzzleDate = dailyPuzzleDate();

    const challenges = await ensureDailyChallenges(admin, puzzleDate);
    if (!challenges) return { ok: false, reason: "no-challenge" };

    const challenge: DailyChallenge = challenges[audience];
    const eventId = challenge.eventIds[idx];
    if (!eventId) return { ok: false, reason: "bad-input" };

    // The answer, read on the server and nowhere else. Only the year is taken
    // from it: the rest of the event is already on the client, masked. The
    // note is read alongside rather than after, so the reveal still waits on
    // one round trip to a database in ap-southeast-2 rather than two — and it
    // leaves this function only in a reply that also carries the year, which
    // is the whole of the rule.
    const [{ data, error }, note] = await Promise.all([
      admin.from("event").select("year").eq("id", eventId).single(),
      readNote(admin, eventId),
    ]);

    if (error || !data) return { ok: false, reason: "failed" };

    const accuracy = gradeGuess(year, data.year);
    // Points are a member's, and the multiplier is applied here rather than on
    // the way out so the number that is shown is the number that was banked.
    const points = user ? dailyRoundPoints(accuracy) : 0;
    const answer: DailyAnswer = {
      idx,
      guess: year,
      year: data.year,
      verdict: accuracy.verdict,
      points,
    };

    if (!user) {
      // A guest's attempt lives in their browser (see components/daily-game.tsx).
      // Grading it here rather than in the client is not about their score —
      // there is none — but about not handing a signed-out visitor the answer
      // sheet to a challenge they could then replay signed in. The two
      // challenges are disjoint for the same reason.
      return { ok: true, answer, note, banked: null };
    }

    const attempt = await recordDailyAnswer(admin, {
      userId: user.id,
      puzzleDate,
      idx,
      guess: year,
      year: data.year,
      verdict: accuracy.verdict,
      points,
      hit: accuracy.verdict !== "wayOff",
    });

    // The function refuses anything but the next index in sequence, and says
    // so by returning the row untouched. Distinguished here so the client
    // re-reads rather than showing a result that was never recorded.
    if (attempt.answers.length !== idx + 1) {
      return { ok: false, reason: "stale" };
    }

    return {
      ok: true,
      answer,
      note,
      banked: {
        points: attempt.points,
        hits: attempt.hits,
        completed: attempt.completedAt !== null,
      },
    };
  } catch {
    // A thrown database error must not reach the browser as a stack trace —
    // the same rule every other action on the site follows.
    return { ok: false, reason: "failed" };
  }
}

/**
 * What the signed-in player has already done today.
 *
 * The page resolves this on the server for its first render; this is the same
 * read for a client that has to recover — a submission that came back `stale`
 * means the row moved under it (two tabs on the same account), and the only
 * right answer is to adopt what the database actually holds.
 */
export async function fetchDailyAttempt(): Promise<{
  answers: DailyAnswer[];
  points: number;
  hits: number;
  completed: boolean;
} | null> {
  try {
    const user = await getCurrentUser();
    if (!user) return null;

    const attempt = await readDailyAttempt(
      await createServerDbClient(),
      user.id,
      dailyPuzzleDate(),
    );

    return {
      answers: attempt.answers,
      points: attempt.points,
      hits: attempt.hits,
      completed: attempt.completedAt !== null,
    };
  } catch {
    return null;
  }
}

/**
 * One event's description, in the language the caller is reading.
 *
 * Through `eventsByIds` rather than a query of its own, so the locale fallback
 * is the one every page on the site uses (the caller's language, else
 * English): the note a player reads after answering is then the very text the
 * page would have sent had it not masked it, rather than a second opinion
 * about which translation wins. The locale is the cookie, read here — like the
 * audience, it is the request's and not an argument.
 *
 * **Best effort, by design.** A note that cannot be read comes back null, and
 * the panel shows its placeholder; a guess that has been graded must not be
 * reported as failed — nor, for a member, sent back to be retried against a
 * row that has already banked it — over a paragraph of prose.
 */
async function readNote(
  admin: ReturnType<typeof createAdminDbClient>,
  eventId: string,
): Promise<string | null> {
  try {
    const [event] = await eventsByIds(admin, [eventId], await readLocale());
    return event?.description ?? null;
  } catch {
    return null;
  }
}

/** The guessable span, read off the timeline's own outermost panes. */
const GUESS_MIN = paneBounds(TIMELINE_PANES[0]!).min;
const GUESS_MAX = paneBounds(TIMELINE_PANES[TIMELINE_PANES.length - 1]!).max;
