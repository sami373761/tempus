import type { Metadata } from "next";
import Link from "next/link";

import { BadgeFrame } from "@/components/badge-frame";
import { getCurrentUser } from "@/lib/auth/server";
import { avatarSrc } from "@/lib/avatar";
import { BADGE_BY_SLUG, RING_BOX, type BadgeSlug } from "@/lib/badges";
import { createAdminDbClient } from "@/lib/db/admin";
import {
  isLeaderboardPeriod,
  readChronoLeaderboard,
  readChronoLeaderboardPosition,
  readLeaderboard,
  readLeaderboardPosition,
} from "@/lib/db/scoring";
import { createServerDbClient } from "@/lib/db/server";
import { format } from "@/lib/i18n/dictionary";
import { readLocaleContext } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await readLocaleContext();
  return {
    title: `${t.leaderboardTitle} · Tempus`,
    description: t.leaderboardBlurb,
  };
}

/**
 * Where the menu's Leaderboard row lands: players ranked by TP, all time or
 * this month, or by Chrono Rating.
 *
 * It is **public**, unlike the badges and the account. A leaderboard is
 * something you read before you decide to join, so gating it would be the one
 * place on the site where signing in is the price of looking. The board comes
 * from `public.leaderboard()`, the one scoring function granted to `anon`, and
 * it hands back names, pictures, badges and sums — never an account id.
 *
 * **Two boards, one query.** The monthly board is the all-time sum with a
 * lower bound (the 1st, 00:00 UTC, `monthStart` in lib/db/scoring.ts), which is
 * what lets a new player see their name near the top of something.
 *
 * **A third board ranks Chrono Rating (KP)**, the online ladder. It is not a
 * period of the TP board: a rating is a level, not a sum, so it has no "this
 * month", and it is read from its own function (`chrono_leaderboard()`). It is
 * `?board=rating` rather than a period for the same reason.
 *
 * The board is a query parameter rather than a client-side tab, so each board
 * is a link that can be shared and a server render that needs no JavaScript.
 *
 * Plain rows on a hairline, like the FAQ, rather than cards: this is a list
 * of text and a list of text is what it should look like.
 */

/** The picture's diameter in a row, which sizes the ring around it. Small
 *  enough that a row stays close to one line of text, large enough that the
 *  six rungs are tellable apart and the face in the middle is a face. */
const ROW_RING = 32;

type Board = "all" | "month" | "rating";

/** What a row shows, whichever board it is on: the main number and the lesser
 *  one that drops out under `sm`. */
interface BoardRow {
  rank: number;
  username: string;
  badge: BadgeSlug | null;
  avatarKey: string | null;
  score: number;
  secondary: number;
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; board?: string }>;
}) {
  const { t } = await readLocaleContext();
  const params = await searchParams;
  const requested = params.period ?? "all";
  const board: Board =
    params.board === "rating"
      ? "rating"
      : isLeaderboardPeriod(requested)
        ? requested
        : "all";
  const rating = board === "rating";

  let rows: BoardRow[] = [];
  let failed = false;
  try {
    const client = await createServerDbClient();
    rows = rating
      ? (await readChronoLeaderboard(client)).map((row) => ({
          ...row,
          score: row.rating,
          secondary: row.wins,
        }))
      : (await readLeaderboard(client, board)).map((row) => ({
          ...row,
          score: row.tp,
          secondary: row.perfects,
        }));
  } catch (error) {
    console.error("leaderboard read failed", error);
    failed = true;
  }

  // The signed-in player's own standing, for when they are not on the board
  // shown. Guarded: it is a nicety, and must not cost anyone the board.
  let mine: string | null = null;
  try {
    const user = await getCurrentUser();
    if (user) {
      const admin = createAdminDbClient();
      if (rating) {
        const position = await readChronoLeaderboardPosition(admin, user.id);
        mine = position
          ? format(t.leaderboardRatingYou, {
              rank: position.rank,
              n: position.rating.toLocaleString("en-US"),
            })
          : null;
      } else {
        const position = await readLeaderboardPosition(admin, user.id, board);
        mine = position
          ? format(t.leaderboardYou, {
              rank: position.rank,
              tp: position.tp.toLocaleString("en-US"),
            })
          : null;
      }
    }
  } catch {
    mine = null;
  }

  const tabs: { board: Board; label: string; href: string }[] = [
    { board: "all", label: t.leaderboardAllTime, href: "/leaderboard" },
    { board: "month", label: t.leaderboardMonth, href: "/leaderboard?period=month" },
    { board: "rating", label: t.versusRatingName, href: "/leaderboard?board=rating" },
  ];

  return (
    <div className="mx-auto max-w-[calc(var(--board-w)+3rem)] px-6 pb-32 pt-12 sm:pt-16">
      <header>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
          {t.leaderboardTitle}
        </h1>
        <p className="mt-3 max-w-[52ch] text-[17px] leading-relaxed text-ink-dim">
          {rating ? t.leaderboardRatingBlurb : t.leaderboardBlurb}
        </p>

        <nav aria-label={t.leaderboardTitle} className="mt-7 flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <Link
              key={tab.board}
              href={tab.href}
              aria-current={tab.board === board ? "page" : undefined}
              className={`rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                tab.board === board
                  ? "border-ink bg-ink text-page"
                  : "border-hairline text-ink hover:bg-card"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </header>

      {/* One grid for the head and every row, so the columns cannot drift: the
          template is written once here and inherited by both. The second number
          (perfects, or wins on the rating board) is the column that goes under
          `sm` — it is the lesser of the two and a phone has room for rank, name
          and score.

          `pr-12` under `sm` is clearance, not decoration. The menu button is
          `fixed` on every route but home and the bar under it hides on a
          downward scroll, so on a phone — where the button's track and this
          column are both `100vw - 3rem` and therefore end at the same pixel —
          the button scrolls over whichever row's score is 28px down the
          viewport. 48px is the button's 42 plus a margin; above `sm` the column
          is narrower than the track and there is nothing to clear. */}
      <div className="mt-10 pr-12 sm:pr-0">
        <div
          aria-hidden="true"
          className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 border-b border-hairline pb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-dim sm:grid-cols-[2.5rem_1fr_6rem_5rem]"
        >
          <span>{t.leaderboardRank}</span>
          <span>{t.leaderboardPlayer}</span>
          <span className="text-right">
            {rating ? t.leaderboardRatingUnit : t.leaderboardTp}
          </span>
          <span className="hidden text-right sm:block">
            {rating ? t.leaderboardWins : t.leaderboardPerfects}
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="border-b border-hairline py-6 text-[15px] text-ink-dim">
            {failed
              ? t.leaderboardFailed
              : rating
                ? t.leaderboardRatingEmpty
                : t.leaderboardEmpty}
          </p>
        ) : (
          <ol>
            {rows.map((row) => {
              const badge = row.badge ? BADGE_BY_SLUG[row.badge] : null;
              const picture = avatarSrc(row.avatarKey);
              return (
                <li
                  key={row.username}
                  className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 border-b border-hairline py-3 sm:grid-cols-[2.5rem_1fr_6rem_5rem]"
                >
                  <span className="text-[15px] font-semibold tabular-nums text-ink-dim">
                    {row.rank}
                  </span>

                  <span className="flex min-w-0 items-center gap-3">
                    {/* The badge is decoration beside the name rather than a
                        column of its own: it is the name's own, and a column
                        would imply it can be sorted on. Its name is on the
                        element so the picture is not a silent cell.

                        `align="ring"` is what makes a column of these look
                        aligned: each file has its ring in a different place,
                        so centred on the ring every badge occupies the same
                        box and the names all start at the same x. A player
                        with no badge yet gets that same box with their
                        picture at its centre, for the same reason. */}
                    {badge ? (
                      <span title={t[badge.nameKey]} className="shrink-0">
                        <BadgeFrame
                          badge={badge}
                          avatar={ROW_RING}
                          align="ring"
                          avatarSrc={picture}
                        />
                      </span>
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex shrink-0 items-center justify-center"
                        style={{
                          width: Math.round(RING_BOX.w * ROW_RING),
                          height: Math.round(RING_BOX.h * ROW_RING),
                        }}
                      >
                        <img
                          src={picture}
                          alt=""
                          loading="lazy"
                          className="rounded-full border border-hairline object-cover"
                          style={{ width: ROW_RING, height: ROW_RING }}
                        />
                      </span>
                    )}
                    <span className="truncate text-[15px] font-semibold text-ink">
                      {row.username}
                    </span>
                  </span>

                  <span className="text-right text-[15px] font-semibold tabular-nums text-ink">
                    {row.score.toLocaleString("en-US")}
                  </span>

                  <span className="hidden text-right text-[15px] tabular-nums text-ink-dim sm:block">
                    {row.secondary}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {mine && (
          <p className="mt-6 text-[13px] font-semibold tabular-nums text-ink-dim">
            {mine}
          </p>
        )}
      </div>
    </div>
  );
}
