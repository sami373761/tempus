import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { dealCategoryEvents } from "@/app/actions/rounds";
import { RegisterCategory } from "@/components/category-runtime";
import { registerCategory } from "@/lib/game/register-category";
import { PlayLimitPanel } from "@/components/play-limit";
import { TimelineBackdrop } from "@/components/timeline-backdrop";
import { TimelineGame } from "@/components/timeline-game";
import { publishedCategory } from "@/lib/db/cached";
import { categoryBlurb, categoryTitle } from "@/lib/db/game-categories";
import { builtinCategory } from "@/lib/game/builtin-categories";
import { readAllowance } from "@/lib/game/play-ledger";
import { canPlay, limitedGamePath } from "@/lib/game/play-limit";
import { ROUND_QUEUE_DEPTH } from "@/lib/game/rounds";
import { readLocaleContext } from "@/lib/i18n/server";

/** page.tsx's frame, which loading.tsx repeats verbatim (CLAUDE.md). */
const FRAME =
  "mx-auto flex h-[calc(100dvh-var(--site-bar-h))] max-w-6xl flex-col overflow-y-auto px-6 pb-6 pt-2";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const [{ slug }, { locale }] = await Promise.all([params, readLocaleContext()]);
  const category = await publishedCategory(slug);
  return { title: category ? `${categoryTitle(category, locale)} · Tempus` : "Tempus" };
}

/**
 * The generic subject game (§7.7): a published `game_category` row and
 * nothing else. The built-in four keep their own addresses (/football, …)
 * and are redirected there; a draft or unknown slug is a 404.
 *
 * Landscape categories play on `TimelineGame` with the category's own rails
 * and its computed bands, exactly as football does with its constants. A
 * poster layout for a panel-made category is not playable yet (the
 * PosterGame merge is listed as not done in docs/admin/LOKAL_KURULUM.md), so
 * such a category 404s here rather than rendering the wrong game.
 */
export default async function CategoryGamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (builtinCategory(slug)) redirect(limitedGamePath(slug));

  const [{ locale, t }, category] = await Promise.all([readLocaleContext(), publishedCategory(slug)]);
  if (!category || category.layout !== "landscape") notFound();

  registerCategory(category.panes, category.backdropKey);
  const panes = category.panes.map((p) => p.key);
  const title = categoryTitle(category, locale);

  const [allowance, events] = await Promise.all([
    readAllowance(category.slug),
    dealCategoryEvents(category.slug, ROUND_QUEUE_DEPTH),
  ]);

  if (!canPlay(allowance)) {
    return (
      <div className={FRAME}>
        <RegisterCategory panes={category.panes} backdropKey={category.backdropKey} />
        <TimelineBackdrop pane={category.defaultPane} panes={panes} />
        <h1 className="sr-only">{title}</h1>
        <PlayLimitPanel allowance={allowance} title={title} t={t} />
      </div>
    );
  }

  return (
    <div className={FRAME}>
      <RegisterCategory panes={category.panes} backdropKey={category.backdropKey} />
      <h1 className="sr-only">{title}</h1>
      {events.length > 0 ? (
        <TimelineGame
          events={events}
          t={t}
          locale={locale}
          panes={panes}
          homePane={category.defaultPane}
          bands={category.bands}
          game={category.slug}
          title={title}
          otherHref="/guess"
          otherLabel={t.timelineTitle}
          railHeading={panes.length > 1}
          headBlurb={categoryBlurb(category, locale)}
          allowance={allowance}
        />
      ) : (
        <p className="text-center text-ink-dim">{t.noEvents}</p>
      )}
    </div>
  );
}
