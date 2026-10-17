import type { Metadata } from "next";

import { DailyGame } from "@/components/daily-game";
import { getCurrentUser } from "@/lib/auth/server";
import { createAdminDbClient } from "@/lib/db/admin";
import {
  ensureDailyChallenges,
  readDailyAttempt,
  readDailyQuestions,
  NO_DAILY_ATTEMPT,
} from "@/lib/db/daily";
import { createServerDbClient } from "@/lib/db/server";
import { dailyPuzzleDate, type DailyAudience } from "@/lib/game/daily";
import { maskEvent } from "@/lib/game/versus";
import { readLocaleContext } from "@/lib/i18n/server";
import { maskedImageUrl } from "@/lib/storage/masked-image";

// The day's state is per-request and per-player: which audience is asking,
// whether they have already played, and whether today's challenges have been
// drawn yet. None of that can be cached.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await readLocaleContext();
  return { title: `${t.dailyTitle} — TEMPUS`, description: t.cardDailyBlurb };
}

/**
 * Daily mode: ten date-guessing questions, the same ten for everybody,
 * playable once.
 *
 * **It is not gated**, and that is deliberate: a daily puzzle is the one thing
 * on the site somebody arrives at from a shared result, and a sign-in wall
 * there would be the price of looking. A guest plays the same shape of game
 * and is told exactly how they did; what an account adds is the triple points
 * and a score that is kept (see lib/game/daily.ts).
 *
 * **Two challenges a day, and which one you get follows from the session.**
 * The two hold disjoint events, because a guest can finish the day, read every
 * answer off the reveals and then create an account — and signing up must not
 * be worth a perfect score. Nothing about the audience is taken from the
 * client, here or in the action that banks a guess.
 *
 * **The client never receives a year it has not already guessed.** The
 * questions cross the boundary as `MaskedEvent`s — `LocalizedEvent` with the
 * date fields absent *from the type*, so putting one back is a compile error
 * rather than a silent leak — and each year arrives in the reply to its own
 * locked-in guess. That is the head-to-head mode's rule, applied here for the
 * same reason: this is the first solo mode whose score is durable.
 *
 * **The date columns are not the only place a date lives**, which is why
 * `maskEvent` makes the caller decide the rest. The photograph's key is
 * `<era>/<slug>.<ext>`, so its plain URL says BCE or CE before the player has
 * looked at the picture; it goes out as an opaque token instead. And a
 * description is prose about the event that routinely names its year, so it is
 * sent only for questions this member has already answered — every other note
 * arrives with its year, in the reply to its guess. The real id and slug stay:
 * the note panel's date challenge is filed against the event, and the name an
 * id would look up is on screen anyway (see `MaskOptions`).
 */
export default async function DailyPage() {
  const { locale, t } = await readLocaleContext();

  const admin = createAdminDbClient();
  const user = await getCurrentUser();
  const audience: DailyAudience = user ? "member" : "guest";
  const puzzleDate = dailyPuzzleDate();

  const challenges = await ensureDailyChallenges(admin, puzzleDate);
  const questions = challenges
    ? await readDailyQuestions(admin, challenges[audience], locale)
    : null;

  // A member's attempt is the one-attempt rule and the resume point in one
  // row. A guest's lives in their browser, so the server has nothing to say
  // about it and the component reads it on mount.
  const attempt =
    user && questions
      ? await readDailyAttempt(await createServerDbClient(), user.id, puzzleDate)
      : NO_DAILY_ATTEMPT;

  // The questions whose prose may cross the wire: the ones that are already
  // over. Always empty for a guest — their attempt is in their browser, and so
  // are the notes their own reveals brought back (components/daily-game.tsx).
  const answered = new Set(attempt.answers.map((answer) => answer.idx));

  return (
    // One screen, exactly, on the date-guessing page's pattern: `100dvh` less
    // the bar above, both sides of that sum reading the same token. The game
    // is the same height budget, so nothing here needs one of its own.
    <div className="mx-auto flex h-[calc(100dvh-var(--site-bar-h))] max-w-6xl flex-col overflow-y-auto px-6 pb-6 pt-2">
      {/* The visible masthead is the round's own counter; the outline still
          wants a heading, and on the result screen this is the only one left. */}
      <h1 className="sr-only">{t.dailyTitle}</h1>

      {questions ? (
        <DailyGame
          puzzleDate={puzzleDate}
          audience={audience}
          questions={questions.map((event, idx) =>
            maskEvent(event, {
              // One context per question of the day, per audience: the URL
              // is the same on every reload and every device — so the browser
              // caches it and the photograph never flickers on a resume — and
              // tells nobody which folder the object sits in.
              imageUrl: event.image
                ? maskedImageUrl(
                    event.image.objectKey,
                    `daily:${puzzleDate}:${audience}:${idx}`,
                  )
                : null,
              description: answered.has(idx) ? event.description : null,
              id: event.id,
              slug: event.slug,
            }),
          )}
          answers={attempt.answers}
          bankedPoints={attempt.points}
          completed={attempt.completedAt !== null}
          t={t}
          locale={locale}
        />
      ) : (
        <p className="on-photo text-center text-white/70">{t.noEvents}</p>
      )}
    </div>
  );
}
