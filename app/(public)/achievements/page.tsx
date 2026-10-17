import type { Metadata } from "next";

import { BadgeShowcase, type BadgeView } from "@/components/badge-showcase";
import { requireAccount } from "@/lib/auth/server";
import type { BadgeSlug } from "@/lib/badges";
import { createAdminDbClient } from "@/lib/db/admin";
import { readShownBadge, refreshBadges } from "@/lib/db/scoring";
import { EMPTY_STATS, evaluateBadges } from "@/lib/game/badge-rules";
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
 * **It re-measures on every visit** (`refreshBadges`), which is what makes a
 * badge earned by a path with no hook of its own — a head-to-head win, banked
 * by a trigger — land here the next time the player looks. The writes go
 * through the service role, the only role that may award a badge.
 */
export default async function AchievementsPage() {
  const { t } = await readLocaleContext();
  const account = await requireAccount("/achievements");

  /* Guarded like the home page's event count, and for the same reason: a
     failed read should cost the player their numbers, not the page. The
     fallback is an evaluation of no stats at all — six cards at zero with
     their real thresholds and quests, which is also what a new account
     genuinely reads. */
  let badges: BadgeView[] = toViews(evaluateBadges(EMPTY_STATS));
  let totalTp = 0;
  let shown: BadgeSlug | null = null;
  try {
    const admin = createAdminDbClient();
    const state = await refreshBadges(admin, account.id);
    badges = toViews(state.badges);
    totalTp = state.stats.tp;
    shown = await readShownBadge(admin, account.id);
  } catch (error) {
    console.error("achievements: badge refresh failed", error);
  }

  return (
    <div className="pb-8 pt-12">
      <BadgeShowcase t={t} badges={badges} totalTp={totalTp} shown={shown} />
    </div>
  );
}

function toViews(
  evaluations: ReturnType<typeof evaluateBadges> | Awaited<ReturnType<typeof refreshBadges>>["badges"],
): BadgeView[] {
  return evaluations.map((evaluation) => ({
    slug: evaluation.slug,
    tp: evaluation.tp,
    tpTarget: evaluation.tpTarget,
    quests: evaluation.quests,
    unlocked:
      "unlockedAt" in evaluation
        ? evaluation.unlockedAt !== null
        : evaluation.earned,
  }));
}
