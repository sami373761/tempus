import type { Metadata } from "next";

import {
  LeaderboardBoards,
  type Board,
  type BoardData,
} from "@/components/leaderboard-boards";
import { getCurrentUser } from "@/lib/auth/server";
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
 * **All three are read here, in one parallel pass**, and the pills that switch
 * between them are a state change rather than a navigation
 * (`LeaderboardBoards`). Each board was its own server render until then, and
 * with the database in ap-southeast-2 that made every press a second or two of
 * a page that looked unpressed. Three reads cost one round trip between them
 * because they are issued together, and the query parameter still decides
 * which one opens — so a shared link lands where it says it does.
 *
 * Plain rows on a hairline, like the FAQ, rather than cards: this is a list
 * of text and a list of text is what it should look like.
 */

/** An empty board, for the one read that failed — so the other two still show. */
const BOARD_FAILED: BoardData = { rows: [], mine: null, failed: true };

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; board?: string }>;
}) {
  const { locale, t } = await readLocaleContext();
  const params = await searchParams;
  const requested = params.period ?? "all";
  const initial: Board =
    params.board === "rating"
      ? "rating"
      : isLeaderboardPeriod(requested)
        ? requested
        : "all";

  const client = await createServerDbClient();

  // The signed-in player's own standing on each board, for when they are not
  // on the one shown. Guarded: it is a nicety, and must not cost anyone the
  // board — so a failed `getCurrentUser` leaves all three lines off rather
  // than taking the page down.
  const user = await getCurrentUser().catch(() => null);
  const admin = user ? createAdminDbClient() : null;

  // Every read in flight at once. The six are independent, and issued
  // together they cost the one trip to the database's region that a single
  // board used to.
  const [all, month, rating, allMine, monthMine, ratingMine] =
    await Promise.allSettled([
      readLeaderboard(client, "all"),
      readLeaderboard(client, "month"),
      readChronoLeaderboard(client),
      admin && user ? readLeaderboardPosition(admin, user.id, "all") : null,
      admin && user ? readLeaderboardPosition(admin, user.id, "month") : null,
      admin && user ? readChronoLeaderboardPosition(admin, user.id) : null,
    ]);

  function tpBoard(
    read: PromiseSettledResult<Awaited<ReturnType<typeof readLeaderboard>>>,
    position: PromiseSettledResult<{ rank: number; tp: number } | null>,
  ): BoardData {
    if (read.status === "rejected") {
      console.error("leaderboard read failed", read.reason);
      return BOARD_FAILED;
    }
    const standing =
      position.status === "fulfilled" && position.value
        ? format(t.leaderboardYou, {
            rank: position.value.rank,
            tp: position.value.tp.toLocaleString(locale),
          })
        : null;
    return {
      rows: read.value.map((row) => ({
        ...row,
        score: row.tp,
        secondary: row.perfects,
      })),
      mine: standing,
      failed: false,
    };
  }

  function ratingBoard(): BoardData {
    if (rating.status === "rejected") {
      console.error("leaderboard read failed", rating.reason);
      return BOARD_FAILED;
    }
    const standing =
      ratingMine.status === "fulfilled" && ratingMine.value
        ? format(t.leaderboardRatingYou, {
            rank: ratingMine.value.rank,
            n: ratingMine.value.rating.toLocaleString(locale),
          })
        : null;
    return {
      rows: rating.value.map((row) => ({
        ...row,
        score: row.rating,
        secondary: row.wins,
      })),
      mine: standing,
      failed: false,
    };
  }

  const boards: Record<Board, BoardData> = {
    all: tpBoard(all, allMine),
    month: tpBoard(month, monthMine),
    rating: ratingBoard(),
  };

  return (
    <div className="mx-auto max-w-[calc(var(--board-w)+3rem)] px-6 pb-32 pt-12 sm:pt-16">
      <header>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
          {t.leaderboardTitle}
        </h1>

        <LeaderboardBoards
          boards={boards}
          initial={initial}
          locale={locale}
          t={t}
        />
      </header>
    </div>
  );
}
