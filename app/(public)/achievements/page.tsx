import type { Metadata } from "next";

import { BadgeShowcase } from "@/components/badge-showcase";
import { requireAccount } from "@/lib/auth/server";
import { BADGES } from "@/lib/badges";
import { readBadgeProgress } from "@/lib/db/accounts";
import { createServerDbClient } from "@/lib/db/server";
import type { BadgeProgress } from "@/lib/db/types";
import { readLocaleContext } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await readLocaleContext();
  return { title: `${t.badgesTitle} · Tempus`, description: t.badgesIntro };
}

/**
 * The badges, where you are on them, and the rules each is given out by.
 *
 * **It needs an account**, which is the one route besides `/account` that does.
 * A badge belongs to somebody — a card's percentage has nothing to report
 * without a player, and the page would be six cards reading nothing. The gate
 * is `middleware.ts` first, so a signed-out visitor following the menu's row
 * never renders this at all, and `requireAccount` second, which is the actual
 * boundary: the matcher can be narrowed by mistake and this cannot.
 *
 * **It is one screen and does not scroll**, which is asked of this page and of
 * no other page outside the two games. The arithmetic is not here, though, and
 * deliberately so: the only thing that can give is the height of a card, so the
 * rail is where the viewport is read (`BadgeCard`'s `min-h` in
 * components/badge-showcase.tsx) and this wrapper's job is just to be two of
 * the terms in that subtraction. **Change either padding and change that sum**,
 * or the page gets a scrollbar it was built not to have.
 *
 * **The wrapper is not the site's capped column**, which is the other thing
 * that makes this page unlike its neighbours. The heading keeps that column and
 * the rail is wider than it — it has to reach the right-hand edge of the screen
 * — so the cap cannot sit up here where it would clip the overflow. Each half
 * takes its own width inside the showcase, off the same solved gutter, so the
 * first card still starts under the first letter of the heading.
 *
 * The page is the heading and the rail under it, and nothing else — the intro
 * paragraph, the shared progress bar, the compact grid of six and the tab strip
 * that drove a detail panel were all removed on request. Each of them described
 * *one* badge while six were on screen; a card now carries its own badge's
 * answer. See `components/badge-showcase.tsx`.
 *
 * **Nothing writes badge progress yet.** The rules are not decided (see
 * 20261006130000_accounts_and_badges.sql), so every card reads 0%. The read is
 * real, though: the day the rules land, this page shows their output without
 * being touched.
 */
export default async function AchievementsPage() {
  const { t } = await readLocaleContext();
  const account = await requireAccount("/achievements");

  /* Guarded like the home page's event count, and for the same reason: a
     failed read should cost the player their numbers, not the page. Zeros are
     also what an account with no rows yet reads as, so the fallback is the
     normal case rather than a special one. */
  let progress: BadgeProgress[] = badgeZeros();
  try {
    progress = await readBadgeProgress(await createServerDbClient(), account.id);
  } catch {
    progress = badgeZeros();
  }

  return (
    <div className="pb-8 pt-12">
      <BadgeShowcase t={t} progress={progress} />
    </div>
  );
}

/**
 * What the page falls back to when the read fails.
 *
 * Built from the code-side badge list rather than from the table, because the
 * fallback has to work when the table is exactly what could not be reached. The
 * target of 1 is a denominator, not a rule — `0 / 1` is the honest reading of
 * "nothing is known yet", and the real targets come from `badge.default_target`
 * on every path that works.
 */
function badgeZeros(): BadgeProgress[] {
  return BADGES.map((badge) => ({
    slug: badge.slug,
    progress: 0,
    target: 1,
    unlockedAt: null,
    details: {},
  }));
}
