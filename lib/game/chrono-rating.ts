/**
 * Chrono Rating (KP, "Kronos Puanı") — the online head-to-head's own ladder.
 *
 * **Separate from TP on purpose.** TP (lib/game/points.ts) is earned by
 * playing anything and only ever goes up; it measures how much someone has
 * played. A rating has to be able to go *down*, or it cannot say who is better
 * than whom — which is the one question matchmaking asks. So it is a second
 * number with its own column (`profile.chrono_rating`), its own ledger
 * (`chrono_rating_entry`) and exactly one writer: the database, when a public
 * match settles (`versus_settle_rating()` in
 * supabase/migrations/20261017180000_versus_online.sql). Nothing in the
 * application ever writes a rating; it only reads one to show it and to seat a
 * player.
 *
 * **Paired with SQL — change both together.** `chronoTier()` is
 * `public.chrono_tier()` and `CHRONO_RATING_RULES` is `public.chrono_delta()`.
 * The database settles; this module only predicts and displays, so a drift
 * between the two would show a player one number and bank another.
 *
 * **Guests have no rating at all.** Not zero — absent. A guest's seat carries a
 * null rating, plays in the bottom league, and nothing is written when their
 * match ends. A zero would read as "a new account", and a new account is
 * something a guest is not.
 */

import type { Dict } from "../i18n/dictionary.ts";

/** The three leagues, bottom to top. */
export type ChronoTier = 1 | 2 | 3;

export const CHRONO_TIERS: readonly ChronoTier[] = [1, 2, 3];

/**
 * Where each league starts, in KP. Below `middle` is the bottom league, which
 * is also where every guest plays.
 */
export const CHRONO_TIER_FLOORS = { middle: 300, upper: 700 } as const;

/** Mirrors `public.chrono_tier()`. Null — a guest — is the bottom league. */
export function chronoTier(rating: number | null): ChronoTier {
  if (rating === null || rating < CHRONO_TIER_FLOORS.middle) return 1;
  if (rating < CHRONO_TIER_FLOORS.upper) return 2;
  return 3;
}

export type ChronoOutcome = "win" | "loss" | "draw";

/**
 * What a result is worth in each league. Mirrors `public.chrono_delta()`.
 *
 * The shape is the point: a win is worth less and a loss costs more the higher
 * a player stands, so the bottom league is easy to climb out of and the top one
 * has to be held. A draw is a small, flat reward everywhere — ten questions
 * that end level were still ten questions played well enough to tie.
 */
export const CHRONO_RATING_RULES: Readonly<
  Record<ChronoTier, Readonly<Record<ChronoOutcome, number>>>
> = {
  1: { win: 30, loss: -10, draw: 5 },
  2: { win: 25, loss: -18, draw: 5 },
  3: { win: 20, loss: -22, draw: 5 },
};

/**
 * The change a result would actually make to `rating`, floor included.
 *
 * A rating never goes below zero, so a 4-KP player who loses in the bottom
 * league moves by -4, not -10 — and -4 is what the result screen shows, because
 * it is what the ledger records.
 */
export function chronoDelta(rating: number, outcome: ChronoOutcome): number {
  const raw = CHRONO_RATING_RULES[chronoTier(rating)][outcome];
  return Math.max(0, rating + raw) - rating;
}

/** Dict key naming each league, so a league is named once on this site. */
export const CHRONO_TIER_LABEL_KEYS: Readonly<Record<ChronoTier, keyof Dict>> = {
  1: "versusTierLower",
  2: "versusTierMiddle",
  3: "versusTierUpper",
};

/** What the start page knows about a signed-in player's standing. */
export interface ChronoStanding {
  rating: number;
  tier: ChronoTier;
}

export function chronoStanding(rating: number): ChronoStanding {
  return { rating, tier: chronoTier(rating) };
}

/**
 * A change as it is printed: always signed, so "+5" and "−5" read as changes
 * rather than as amounts. The minus is the typographic one (U+2212), the
 * width of the plus, rather than the hyphen `${delta}` would print. Display
 * only — nothing parses this back.
 */
export function signedDelta(delta: number): string {
  return delta > 0
    ? `+${delta}`
    : delta < 0
      ? `−${Math.abs(delta)}`
      : `${delta}`;
}
