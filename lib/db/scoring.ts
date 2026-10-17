/**
 * TP, badges and the leaderboard: the reads and writes behind
 * supabase/migrations/20261017120000_scoring.sql.
 *
 * Every write here is **service role only** — banking a round, refreshing a
 * badge, choosing the badge to wear — for the reason all score tables are: a
 * player who could write one could award themselves anything. The one read a
 * signed-out visitor can make is the leaderboard.
 */

import type { BadgeSlug } from "../badges.ts";
import { isBadgeSlug } from "../badges.ts";
import {
  BADGE_RULES,
  EMPTY_STATS,
  evaluateBadges,
  type BadgeEvaluation,
  type PlayerStats,
} from "../game/badge-rules.ts";
import type { SoloGame } from "../game/points.ts";
import type { Verdict } from "../game/scoring.ts";
import type { BankedRound } from "../game/solo.ts";
import {
  readBadgeProgress,
  writeBadgeProgress,
  type BadgeProgressWrite,
} from "./accounts.ts";
import type { Json } from "./database.types.ts";
import type { DbClient } from "./queries.ts";

/* -------------------------------------------------------------------------
   Banking
   ------------------------------------------------------------------------- */

export async function bankSoloRound(
  admin: DbClient,
  input: {
    userId: string;
    setId: string;
    game: SoloGame;
    roundId: string;
    eventId: string;
    verdict: Verdict;
    correct: boolean;
    tp: number;
    setSize: number;
  },
): Promise<Omit<BankedRound, "newBadges"> & { setClosed: boolean }> {
  const { data, error } = await admin.rpc("bank_solo_round", {
    p_user_id: input.userId,
    p_set_id: input.setId,
    p_game: input.game,
    p_round_id: input.roundId,
    p_event_id: input.eventId,
    p_verdict: input.verdict,
    p_correct: input.correct,
    p_tp: input.tp,
    p_set_size: input.setSize,
  });

  if (error) throw new Error(`bankSoloRound: ${error.message}`);

  const result = (data ?? {}) as {
    status?: string;
    tp?: number;
    bonus?: number;
    set?: { tp?: number; closed?: boolean };
  };

  if (result.status !== "banked" && result.status !== "duplicate") {
    return { counted: false, tp: 0, bonus: 0, setTp: 0, setClosed: false };
  }

  return {
    counted: true,
    tp: result.tp ?? 0,
    bonus: result.bonus ?? 0,
    setTp: result.set?.tp ?? 0,
    // A duplicate reports the set as it stands, so a retried final round
    // still reads as the one that closed it.
    setClosed: result.set?.closed ?? false,
  };
}

/**
 * Badges unlocked since a set began, bottom rung first — what its summary
 * announces. Read off `unlocked_at` rather than collected round by round,
 * because mid-set refreshes run after their responses and report nothing.
 */
export async function badgesEarnedDuringSet(
  admin: DbClient,
  userId: string,
  setId: string,
): Promise<BadgeSlug[]> {
  const { data: set, error: setError } = await admin
    .from("solo_set")
    .select("created_at")
    .eq("id", setId)
    .eq("user_id", userId)
    .maybeSingle();
  if (setError) throw new Error(`badgesEarnedDuringSet: ${setError.message}`);
  if (!set) return [];

  const { data, error } = await admin
    .from("user_badge_progress")
    .select("badge_slug, unlocked_at")
    .eq("user_id", userId)
    .gte("unlocked_at", set.created_at);
  if (error) throw new Error(`badgesEarnedDuringSet: ${error.message}`);

  const earned = new Set((data ?? []).map((row) => row.badge_slug));
  return BADGE_RULES.map((rung) => rung.slug).filter((slug) => earned.has(slug));
}

/* -------------------------------------------------------------------------
   Badges
   ------------------------------------------------------------------------- */

export async function readPlayerStats(
  admin: DbClient,
  userId: string,
): Promise<PlayerStats> {
  const { data, error } = await admin.rpc("player_stats", { p_user_id: userId });
  if (error) throw new Error(`readPlayerStats: ${error.message}`);

  const raw = (data ?? {}) as Partial<PlayerStats>;
  return {
    ...EMPTY_STATS,
    ...raw,
    perfects: { ...EMPTY_STATS.perfects, ...(raw.perfects ?? {}) },
  };
}

export interface BadgeState {
  stats: PlayerStats;
  badges: (BadgeEvaluation & { unlockedAt: string | null })[];
  /** Badges this refresh unlocked, bottom rung first. */
  newlyEarned: BadgeSlug[];
}

/**
 * Re-measure every badge for one player and write what changed.
 *
 * Called after every banked payout and on the pages that show badges, so a
 * badge earned by a path that has no hook of its own — a head-to-head match,
 * banked by a trigger — still lands the next time the player looks.
 *
 * **An unlock is never undone.** The existing `unlocked_at` is carried through
 * every write, and an earned badge counts as earned for the rung above it
 * whatever today's rule would say (`evaluateBadges`).
 */
export async function refreshBadges(
  admin: DbClient,
  userId: string,
): Promise<BadgeState> {
  const [stats, current] = await Promise.all([
    readPlayerStats(admin, userId),
    readBadgeProgress(admin, userId),
  ]);

  const unlockedAt = new Map(
    current
      .filter((row) => row.unlockedAt !== null)
      .map((row) => [row.slug, row.unlockedAt as string]),
  );
  const earnedBefore = new Set(
    [...unlockedAt.keys()].filter(isBadgeSlug),
  );

  const evaluations = evaluateBadges(stats, earnedBefore);
  const now = new Date().toISOString();
  const newlyEarned: BadgeSlug[] = [];

  // Collected and written in one request rather than six: this runs after
  // every payout, and each request is a round trip to the database's region.
  const writes: BadgeProgressWrite[] = [];
  const badges = evaluations.map((evaluation) => {
    const before = current.find((row) => row.slug === evaluation.slug);
    const wasUnlocked = unlockedAt.get(evaluation.slug) ?? null;
    const nowUnlocked = wasUnlocked ?? (evaluation.earned ? now : null);
    if (!wasUnlocked && nowUnlocked) newlyEarned.push(evaluation.slug);

    const details = {
      quests: evaluation.quests.map((quest) => ({
        key: quest.key,
        progress: quest.progress,
        target: quest.target,
      })),
    } satisfies Record<string, Json>;

    const changed =
      !before ||
      before.progress !== evaluation.tp ||
      before.target !== evaluation.tpTarget ||
      (before.unlockedAt ?? null) !== nowUnlocked ||
      JSON.stringify(before.details ?? {}) !== JSON.stringify(details);

    if (changed) {
      writes.push({
        userId,
        badgeSlug: evaluation.slug,
        progress: evaluation.tp,
        target: evaluation.tpTarget,
        unlockedAt: nowUnlocked,
        details,
      });
    }

    return { ...evaluation, unlockedAt: nowUnlocked };
  });

  await writeBadgeProgress(admin, writes);

  // The mark on the menu's Achievements row. Guarded on purpose: this runs
  // after every banked payout, and a nudge that failed to be written must not
  // cost the player the badge it was about. A count that is a little behind
  // is a missed notification; a throw here would be a lost unlock.
  if (newlyEarned.length > 0) {
    try {
      await noteBadgesEarned(admin, userId, newlyEarned.length);
    } catch (error) {
      console.error("noteBadgesEarned failed", error);
    }
  }

  return { stats, badges, newlyEarned };
}

/**
 * Add newly unlocked badges to the count the menu marks.
 *
 * A delta rather than a total, because that is what a refresh knows: it
 * compares today's ladder against the rows already written and can report
 * only what changed. The ceiling is applied in SQL (`note_badges_earned`), so
 * a runaway caller cannot write a number the pill has no room for.
 */
export async function noteBadgesEarned(
  admin: DbClient,
  userId: string,
  count: number,
): Promise<void> {
  const { error } = await admin.rpc("note_badges_earned", {
    p_user_id: userId,
    p_count: count,
  });
  if (error) throw new Error(`noteBadgesEarned: ${error.message}`);
}

/**
 * Take the mark off: the player is on the badges page.
 *
 * Opening that page is the whole definition of "seen" — there is no second
 * condition worth checking, and a mark that outlived the page it points at
 * would be a mark people learn to ignore.
 */
export async function markBadgesSeen(
  admin: DbClient,
  userId: string,
): Promise<void> {
  const { error } = await admin.rpc("mark_badges_seen", { p_user_id: userId });
  if (error) throw new Error(`markBadgesSeen: ${error.message}`);
}

/**
 * Wear an earned badge, or `null` to take it off and show none. Refused
 * (false) for a badge the player has not earned — checked here, against the
 * database, never taken on the client's word. One column holds the choice, so
 * wearing a badge is also taking the previous one off.
 */
export async function setWornBadge(
  admin: DbClient,
  userId: string,
  slug: BadgeSlug | null,
): Promise<boolean> {
  if (slug !== null) {
    const { data, error } = await admin
      .from("user_badge_progress")
      .select("unlocked_at")
      .eq("user_id", userId)
      .eq("badge_slug", slug)
      .maybeSingle();
    if (error) throw new Error(`setWornBadge: ${error.message}`);
    if (!data?.unlocked_at) return false;
  }

  const { error } = await admin
    .from("profile")
    .update(
      slug === null
        ? { badge_off: true }
        : { worn_badge: slug, badge_off: false },
    )
    .eq("id", userId);
  if (error) throw new Error(`setWornBadge: ${error.message}`);
  return true;
}

/**
 * The badge a player shows: none if they took it off, their choice if earned,
 * else their highest (`shown_badge` in SQL).
 */
export async function readShownBadge(
  admin: DbClient,
  userId: string,
): Promise<BadgeSlug | null> {
  const { data, error } = await admin.rpc("shown_badge", { p_user_id: userId });
  if (error) throw new Error(`readShownBadge: ${error.message}`);
  return typeof data === "string" && isBadgeSlug(data) ? data : null;
}

/* -------------------------------------------------------------------------
   Leaderboard
   ------------------------------------------------------------------------- */

export const LEADERBOARD_PERIODS = ["all", "month"] as const;
export type LeaderboardPeriod = (typeof LEADERBOARD_PERIODS)[number];

export function isLeaderboardPeriod(value: string): value is LeaderboardPeriod {
  return (LEADERBOARD_PERIODS as readonly string[]).includes(value);
}

/**
 * Where the monthly board starts: the 1st of the month, 00:00 UTC. UTC for the
 * daily's reason — one boundary for everybody, so "this month" is the same
 * month in every time zone.
 *
 * Nothing is reset or deleted when a month ends. The board is the all-time
 * ledger read from this lower bound, so on the 1st the bound moves and the
 * board starts empty by itself — no cron, and last month's points still count
 * towards the all-time board.
 */
export function monthStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function sinceOf(period: LeaderboardPeriod): string | null {
  return period === "month" ? monthStart().toISOString() : null;
}

export interface LeaderboardRow {
  rank: number;
  username: string;
  badge: BadgeSlug | null;
  /** R2 key of the player's picture; null draws the default. */
  avatarKey: string | null;
  tp: number;
  perfects: number;
}

export async function readLeaderboard(
  client: DbClient,
  period: LeaderboardPeriod,
  limit = 50,
): Promise<LeaderboardRow[]> {
  const { data, error } = await client.rpc("leaderboard", {
    p_since: sinceOf(period),
    p_limit: limit,
  });
  if (error) throw new Error(`readLeaderboard: ${error.message}`);

  return (data ?? []).map((row) => ({
    rank: Number(row.rank),
    username: row.username,
    badge: row.badge_slug && isBadgeSlug(row.badge_slug) ? row.badge_slug : null,
    avatarKey: row.avatar_key ?? null,
    tp: Number(row.tp),
    perfects: Number(row.perfects),
  }));
}

export async function readLeaderboardPosition(
  admin: DbClient,
  userId: string,
  period: LeaderboardPeriod,
): Promise<{ rank: number; tp: number } | null> {
  const { data, error } = await admin.rpc("leaderboard_position", {
    p_user_id: userId,
    p_since: sinceOf(period),
  });
  if (error) throw new Error(`readLeaderboardPosition: ${error.message}`);
  const row = data?.[0];
  return row ? { rank: Number(row.rank), tp: Number(row.tp) } : null;
}

/* -------------------------------------------------------------------------
   Chrono Rating board
   ------------------------------------------------------------------------- */

export interface ChronoLeaderboardRow {
  rank: number;
  username: string;
  badge: BadgeSlug | null;
  avatarKey: string | null;
  rating: number;
  wins: number;
  matches: number;
}

/**
 * Players ranked by KP. Only accounts that have finished an online match are
 * on it — see supabase/migrations/20261017200000_chrono_leaderboard.sql.
 */
export async function readChronoLeaderboard(
  client: DbClient,
  limit = 50,
): Promise<ChronoLeaderboardRow[]> {
  const { data, error } = await client.rpc("chrono_leaderboard", {
    p_limit: limit,
  });
  if (error) throw new Error(`readChronoLeaderboard: ${error.message}`);

  return (data ?? []).map((row) => ({
    rank: Number(row.rank),
    username: row.username,
    badge: row.badge_slug && isBadgeSlug(row.badge_slug) ? row.badge_slug : null,
    avatarKey: row.avatar_key ?? null,
    rating: Number(row.rating),
    wins: Number(row.wins),
    matches: Number(row.matches),
  }));
}

export async function readChronoLeaderboardPosition(
  admin: DbClient,
  userId: string,
): Promise<{ rank: number; rating: number } | null> {
  const { data, error } = await admin.rpc("chrono_leaderboard_position", {
    p_user_id: userId,
  });
  if (error) throw new Error(`readChronoLeaderboardPosition: ${error.message}`);
  const row = data?.[0];
  return row ? { rank: Number(row.rank), rating: Number(row.rating) } : null;
}
