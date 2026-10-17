/**
 * What earns each badge: a TP threshold, and from Gold up, quests beside it.
 *
 * **One ladder, six rungs.** Ruby and Amethyst used to stand outside the
 * ladder as one-off feats; they are now its top two rungs, so a badge is
 * earned only once the one below it has been (`evaluateBadges`). Points alone
 * would make the ladder a measure of hours played, which is why every rung
 * from Gold carries quests — and why the quests spread across the games: the
 * top of the ladder cannot be reached by grinding one mode.
 *
 * **Pure.** The numbers a rule reads are gathered in one SQL call
 * (`player_stats` in supabase/migrations/20261017120000_scoring.sql) and this
 * module turns them into progress; it never touches the database, which is
 * what lets the achievements page explain a badge with the same function that
 * awards it.
 *
 * **Earned is permanent.** A rule that is retuned harder later cannot take a
 * badge back: `refreshBadges` in lib/db/scoring.ts never clears an
 * `unlocked_at`.
 *
 * Retuning a rung is this file (and the copy in lib/i18n/dictionary.ts that
 * explains it) and nothing else.
 */

import type { BadgeSlug } from "../badges.ts";
import type { Dict } from "../i18n/dictionary.ts";
import { DATE_GAMES, type DateGame } from "./points.ts";

/** Everything a rule may read, as `player_stats` returns it. */
export interface PlayerStats {
  /** Career TP, every game. */
  tp: number;
  /** Exact-year answers per date game. The daily counts as `history`. */
  perfects: Record<DateGame, number>;
  /** Longest survival run, in correct answers. */
  bestSurvival: number;
  /** Most Perfects in a single set of the general date game. */
  bestHistorySetPerfects: number;
  /** Comparison sets answered ten out of ten. */
  compareFlawlessSets: number;
  /** Date-game sets whose every answer was Great or Perfect. */
  topTierSets: number;
  /** Longest run of consecutive days with a finished daily. */
  bestDailyStreak: number;
}

export const EMPTY_STATS: PlayerStats = {
  tp: 0,
  perfects: { history: 0, football: 0, basketball: 0, screen: 0, "when-born": 0 },
  bestSurvival: 0,
  bestHistorySetPerfects: 0,
  compareFlawlessSets: 0,
  topTierSets: 0,
  bestDailyStreak: 0,
};

export type QuestKey =
  | "perfects"
  | "perfectGames"
  | "survival"
  | "historySetPerfects"
  | "compareFlawless"
  | "dailyStreak"
  | "everyGamePerfects"
  | "topTierSet";

interface Quest {
  key: QuestKey;
  /** The count to reach. */
  target: number;
  /** How far along a player is, before clamping to `target`. */
  measure: (stats: PlayerStats) => number;
  /** The sentence, with `{n}` for the target. */
  labelKey: keyof Dict;
}

interface Rung {
  slug: BadgeSlug;
  tp: number;
  quests: readonly Quest[];
}

const totalPerfects = (s: PlayerStats) =>
  DATE_GAMES.reduce((sum, game) => sum + s.perfects[game], 0);

/**
 * The ladder, bottom to top. Order matters: each rung needs the one before.
 */
export const BADGE_RULES: readonly Rung[] = [
  { slug: "bronze", tp: 10, quests: [] },
  { slug: "silver", tp: 100, quests: [] },
  {
    slug: "gold",
    tp: 1_000,
    quests: [
      {
        key: "perfects",
        target: 5,
        measure: totalPerfects,
        labelKey: "questPerfects",
      },
    ],
  },
  {
    slug: "diamond",
    tp: 3_000,
    quests: [
      {
        key: "perfectGames",
        target: 3,
        measure: (s) => DATE_GAMES.filter((game) => s.perfects[game] > 0).length,
        labelKey: "questPerfectGames",
      },
      {
        key: "survival",
        target: 15,
        measure: (s) => s.bestSurvival,
        labelKey: "questSurvival",
      },
    ],
  },
  {
    slug: "ruby",
    tp: 10_000,
    quests: [
      {
        key: "historySetPerfects",
        target: 3,
        measure: (s) => s.bestHistorySetPerfects,
        labelKey: "questHistorySetPerfects",
      },
      {
        key: "compareFlawless",
        target: 1,
        measure: (s) => s.compareFlawlessSets,
        labelKey: "questCompareFlawless",
      },
      {
        key: "dailyStreak",
        target: 7,
        measure: (s) => s.bestDailyStreak,
        labelKey: "questDailyStreak",
      },
    ],
  },
  {
    slug: "amethyst",
    tp: 30_000,
    quests: [
      {
        // Counted as Perfects *towards* the 5-per-game target, so a player
        // with 40 in one game and none elsewhere reads 5 of 25, not 25 of 25.
        key: "everyGamePerfects",
        target: 5 * DATE_GAMES.length,
        measure: (s) =>
          DATE_GAMES.reduce((sum, game) => sum + Math.min(5, s.perfects[game]), 0),
        labelKey: "questEveryGamePerfects",
      },
      {
        key: "survival",
        target: 50,
        measure: (s) => s.bestSurvival,
        labelKey: "questSurvival",
      },
      {
        key: "topTierSet",
        target: 1,
        measure: (s) => s.topTierSets,
        labelKey: "questTopTierSet",
      },
    ],
  },
];

export const RULE_BY_SLUG: Record<BadgeSlug, Rung> = Object.fromEntries(
  BADGE_RULES.map((rung) => [rung.slug, rung]),
) as Record<BadgeSlug, Rung>;

export interface QuestProgress {
  key: QuestKey;
  labelKey: keyof Dict;
  progress: number;
  target: number;
  done: boolean;
}

export interface BadgeEvaluation {
  slug: BadgeSlug;
  /** TP towards the threshold, clamped to it. */
  tp: number;
  tpTarget: number;
  quests: QuestProgress[];
  /** Every requirement of this rung met, ignoring the rung below. */
  met: boolean;
  /** Earned: this rung met and every rung below it earned. */
  earned: boolean;
}

/**
 * Every rung's state for one player's stats.
 *
 * `alreadyEarned` is the set of badges the database says are unlocked: a
 * badge once earned stays earned, and it counts as the rung below for the
 * next one even if a retune means its rule would no longer be met today.
 */
export function evaluateBadges(
  stats: PlayerStats,
  alreadyEarned: ReadonlySet<BadgeSlug> = new Set(),
): BadgeEvaluation[] {
  let belowEarned = true;

  return BADGE_RULES.map((rung) => {
    const quests = rung.quests.map((quest) => {
      const progress = Math.min(quest.target, Math.max(0, quest.measure(stats)));
      return {
        key: quest.key,
        labelKey: quest.labelKey,
        progress,
        target: quest.target,
        done: progress >= quest.target,
      };
    });

    const met = stats.tp >= rung.tp && quests.every((quest) => quest.done);
    const earned = alreadyEarned.has(rung.slug) || (belowEarned && met);
    belowEarned = earned;

    return {
      slug: rung.slug,
      tp: Math.min(stats.tp, rung.tp),
      tpTarget: rung.tp,
      quests,
      met,
      earned,
    };
  });
}

/** The highest earned rung, which is what a player wears unless they choose. */
export function topEarned(
  earned: ReadonlySet<BadgeSlug>,
): BadgeSlug | null {
  let top: BadgeSlug | null = null;
  for (const rung of BADGE_RULES) if (earned.has(rung.slug)) top = rung.slug;
  return top;
}
