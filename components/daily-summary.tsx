"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import {
  Breakdown,
  GRADE_COLOR,
  GRADE_LABEL_KEYS,
  Pips,
  ShareButton,
  SUMMARY_BUTTON,
  SUMMARY_LINK,
} from "@/components/set-summary";
import { signInHref } from "@/lib/auth/paths";
import type { SupportedLocale } from "@/lib/db/types";
import {
  dailyResults,
  dailyShareText,
  MAX_DAILY_POINTS,
  minutesUntilReset,
  QUESTIONS_PER_DAILY,
  type DailyAnswer,
  type DailyAudience,
} from "@/lib/game/daily";
import { gradeSet, setSquares, summarizeSet } from "@/lib/game/set";
import { format, type Dict } from "@/lib/i18n/dictionary";

/**
 * The screen a daily ends on — and the screen a finished daily *is*, for the
 * rest of the day.
 *
 * It is the set summary's composition with its one button taken away and two
 * facts put in its place: what the day was worth, and when the next one
 * arrives. The pips and the per-tier breakdown are imported rather than
 * restated, because a daily is a ten-question set and those are already what a
 * ten-question set looks like; what is different is everything to do with
 * there being exactly one attempt.
 *
 * **There is no Play again, and that is the whole point of the mode.** The
 * absence is deliberate rather than an omission: a daily with a replay button
 * is not a daily. What stands in its place is the countdown to the next one —
 * the only thing a player can actually do about this screen.
 *
 * **A member reads a score and a guest reads a percentage.** Not a dimmed
 * score or a zero: a guest has no score, and showing them one struck through
 * would be a worse lie than not showing one. The percentage is real for both,
 * which is why it is what the guest's headline is, and the notice under it
 * says what signing in would have added. See lib/game/daily.ts for why the
 * guest's next daily is a genuinely different set of questions rather than the
 * same ten with points switched on.
 *
 * **Styled for a photograph**, like every panel on these screens: dark glass
 * rather than an opaque `bg-card`, and sized to a viewport that must never
 * scroll — it caps its own height and scrolls internally on a window too
 * short for it.
 */
export function DailySummary({
  answers,
  puzzleDate,
  audience,
  points,
  revisit,
  locale,
  t,
}: {
  answers: readonly DailyAnswer[];
  puzzleDate: string;
  audience: DailyAudience;
  /** The banked total. Meaningful for a member; zero for a guest. */
  points: number;
  /** True when the page was opened into a finished day rather than just finishing one. */
  revisit: boolean;
  /** For grouping the score the way the in-game tally beside it already
   *  does — the two must not print one number two ways. */
  locale: SupportedLocale;
  t: Dict;
}) {
  const member = audience === "member";
  const results = dailyResults(answers);
  const summary = summarizeSet(results);
  const grade = gradeSet(summary);
  const panel = useRef<HTMLDivElement>(null);

  // Read after mount, not during render: a server render and the first client
  // render would disagree about the clock and React would report it as a
  // hydration error. Null until then, which is also why the countdown line is
  // conditional rather than showing a placeholder. Re-read every half minute
  // after that, so a result left open still counts down; the line shows whole
  // minutes, and a 30s tick is never more than half of one behind.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // The day ending is a change of screen and the button that was pressed is
  // gone, so focus has to move or a keyboard user is dropped back to the top
  // of the document with nothing announced. The panel takes it rather than a
  // control — the same reasoning as the set and the run, `preventScroll`
  // included (focus lands mid-entrance; see `SetSummary`).
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
  }, []);

  const minutes = now === null ? null : minutesUntilReset(puzzleDate, now);

  return (
    <div className="flex w-full flex-1 justify-center py-2">
      <div
        ref={panel}
        tabIndex={-1}
        role="group"
        aria-label={`${t.dailyDone} — ${t.dailyTitle}`}
        /* A notch tighter than the set's panel below `sm`, and the same as it
           above. This screen carries two things a set's does not — the guest
           notice and the countdown — so it is the tallest of the summaries and
           the one the tighter padding was written for.
           It grows rather than scrolling inside itself, and `my-auto` centres
           it; see the note on `SetSummary` for why that trade went the way it
           did. It takes the set's short-window step too (gaps 12px, padding
           20px, a 48px headline): a member's panel measured 679px against the
           646px a 1280x720 frame leaves it. */
        className="set-summary-in my-auto flex w-full max-w-md flex-col gap-4 rounded-3xl border border-white/12 bg-black/45 px-6 py-6 text-center shadow-2xl shadow-black/70 backdrop-blur-2xl focus:outline-none sm:gap-5 sm:px-7 sm:py-7 [@media(max-height:820px)]:gap-3 [@media(max-height:820px)]:py-5"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
            {t.dailyDone}
          </p>
          <h2 className="mt-1 font-display text-base font-semibold text-ink">
            {t.dailyTitle}
            <span className="px-1.5 font-normal text-white/35">·</span>
            <span className="font-normal tabular-nums text-white/55">
              {puzzleDate}
            </span>
          </h2>
        </div>

        {/* The headline. A member's is the score, because the score is the
            thing the mode is for and triple points are what makes it worth
            coming back to; a guest's is the percentage, which is the only
            number that is true for them. `tabular-nums` so four digits cannot
            shift the block against three. */}
        <div>
          <p
            className="font-display text-6xl font-semibold leading-none tracking-tight tabular-nums [@media(max-height:820px)]:text-5xl"
            style={{ color: GRADE_COLOR[grade] }}
          >
            {member ? points.toLocaleString(locale) : `${summary.percent}%`}
          </p>
          <p className="mt-2 text-sm text-white/75">
            {member
              ? `${t.dailyPointsLabel} · ${format(t.dailyPointsOf, {
                  n: points.toLocaleString(locale),
                  max: MAX_DAILY_POINTS.toLocaleString(locale),
                })}`
              : format(t.setScore, {
                  hits: summary.hits,
                  total: summary.total,
                })}
          </p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {t[GRADE_LABEL_KEYS[grade]]}
          </p>
          {/* A member's hit count is the line the headline displaced; a guest's
              is already the headline. */}
          {member && (
            <p className="mt-1 text-xs text-white/55">
              {format(t.setScore, {
                hits: summary.hits,
                total: summary.total,
              })}
              <span className="px-1.5 text-white/30">·</span>
              {t.dailyTriple}
            </p>
          )}
        </div>

        <Pips results={results} />

        {summary.byVerdict && <Breakdown byVerdict={summary.byVerdict} t={t} />}

        {/* What an account would have added. A link rather than a form: the
            sign-in page is one route and it comes back here, so a guest who
            signs up from this screen lands on the day they can still play —
            which is a different set of questions from the ten they have just
            seen. */}
        {!member && (
          <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-4">
            <p className="text-xs leading-relaxed text-white/70">
              {t.dailyGuestNotice}
            </p>
            <Link
              href={signInHref("/daily")}
              className="mt-3 inline-flex items-center justify-center rounded-full bg-ink px-5 py-2 text-xs font-semibold text-page transition hover:opacity-85"
            >
              {t.authTabSignIn}
            </Link>
          </div>
        )}

        {/* One button, not two. A daily has no replay, so sharing is the only
            thing this screen can offer to press — and the way on to the
            unlimited game is the quiet link the set summary uses for the same
            job, not a second full-width control competing with it.
            Stacked in their own column at the set summary's 10px, not the
            panel's gap, so the two read as one group like the other screens'. */}
        <div className="flex flex-col gap-2.5">
          <ShareButton
            buildText={() =>
              dailyShareText({
                title: t.dailyTitle,
                puzzleDate,
                squares: setSquares(results),
                hits: summary.hits,
                total: QUESTIONS_PER_DAILY,
                // A guest quotes no score, because there is none to quote —
                // the grid and the hit count are what their result is. The
                // unit is the dictionary's ("Pkt.", "puan"), not a fixed "pts".
                points: member
                  ? format(t.versusRoundPoints, {
                      n: points.toLocaleString(locale),
                    })
                  : null,
                url: window.location.href,
              })
            }
            t={t}
          />

          {/* The way home, under the one button this screen has. A daily has
              no replay, so the stack is share-then-leave rather than the set
              summary's three — but the leaving half is the same control in
              the same place, because a phone has no other way off a page
              that does not scroll. */}
          <Link
            href="/"
            className={`${SUMMARY_BUTTON} inline-flex items-center justify-center border-white/25 bg-transparent text-white/80 hover:border-white/45 hover:text-ink`}
          >
            {t.backHome}
          </Link>
        </div>

        <Link href="/guess" className={SUMMARY_LINK}>
          {t.tryTimeline}
        </Link>

        {/* The two lines about there being one attempt: that it has been used,
            and when the next one is dealt. The first only appears on a
            revisit — on the screen you have just played into, "you have
            already played today" would be telling you what you just did. */}
        <div className="flex flex-col gap-1 text-xs text-white/50">
          {revisit && <p>{t.dailyAlreadyToday}</p>}
          {minutes !== null && (
            <p className="tabular-nums">
              {minutes >= 60
                ? format(t.dailyNextIn, {
                    h: Math.floor(minutes / 60),
                    m: minutes % 60,
                  })
                : format(t.dailyNextInSoon, { m: minutes })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
