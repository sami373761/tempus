import "server-only";

import { unstable_cache } from "next/cache";

import { createAdminDbClient } from "./admin.ts";
import type { DailyChallenge } from "./daily.ts";
import { readGameCategories, type GameCategory } from "./game-categories.ts";
import { registerEventImagePrefixes } from "../storage/masked-image.ts";
import { readDailyQuestions } from "./daily.ts";
import {
  readChronoLeaderboard,
  readLeaderboard,
  type LeaderboardPeriod,
} from "./scoring.ts";

/**
 * Reads that are the same for every visitor, kept in Next's data cache.
 *
 * Every route is `force-dynamic` — the locale is a cookie and every draw is
 * random — which turns off the *page* cache, not this one. With the database
 * a ~400 ms round trip away, a read that would answer the same for the next
 * hundred visitors should be paid by the first of them.
 *
 * Only shared answers belong here. Anything keyed on a player (their rank,
 * their attempt) stays a live read beside these, so the player's own numbers
 * are never a cache window behind. The service-role client is used because it
 * needs no cookies — a cached function must not read the request — and every
 * function here reads only what `anon` may read anyway.
 *
 * Kept out of lib/db/scoring.ts and lib/db/daily.ts because `next/cache` is
 * app-only and `scripts/` imports those modules under plain node.
 */

/**
 * How long a public board may lag a banked round. Short, because the board is
 * where a player goes to see the round they just played land — and their own
 * line is live regardless.
 */
const LEADERBOARD_REVALIDATE_S = 60;

export const readLeaderboardCached = unstable_cache(
  (period: LeaderboardPeriod) => readLeaderboard(createAdminDbClient(), period),
  ["leaderboard"],
  { revalidate: LEADERBOARD_REVALIDATE_S, tags: ["leaderboard"] },
);

export const readChronoLeaderboardCached = unstable_cache(
  () => readChronoLeaderboard(createAdminDbClient()),
  ["chrono-leaderboard"],
  { revalidate: LEADERBOARD_REVALIDATE_S, tags: ["leaderboard", "chrono-leaderboard"] },
);

/**
 * A day's questions in one language. The challenge fixes the ids for the whole
 * day, so the only thing that can move under the cache is an event's text —
 * an hour is a long enough window to matter and short enough for a re-seed to
 * show the same day. Keyed on the ids themselves rather than the date, so a
 * re-dealt day can never be served the old questions.
 */
export const readDailyQuestionsCached = unstable_cache(
  (challenge: DailyChallenge, locale: string) =>
    readDailyQuestions(createAdminDbClient(), challenge, locale),
  ["daily-questions"],
  // `events` too: an event corrected in the admin panel must not wait out
  // the hour on today's daily.
  { revalidate: 60 * 60, tags: ["daily", "events"] },
);

/**
 * The published game categories (lib/db/game-categories.ts). Shared by every
 * visitor and changed only from the admin panel, which clears the
 * `categories` tag on every category write — so the window below is only
 * the fallback for a write made outside the panel.
 */
const readGameCategoriesData = unstable_cache(
  () => readGameCategories(createAdminDbClient()),
  ["game-categories"],
  { revalidate: 300, tags: ["categories"] },
);

export async function readGameCategoriesCached(): Promise<GameCategory[]> {
  const categories = await readGameCategoriesData();
  // Their image folders are event folders too (lib/storage/masked-image.ts).
  registerEventImagePrefixes(categories.map((c) => c.imagePrefix));
  return categories;
}

/** One published category by slug, or null. */
export async function publishedCategory(slug: string): Promise<GameCategory | null> {
  const all = await readGameCategoriesCached();
  return all.find((c) => c.slug === slug) ?? null;
}
