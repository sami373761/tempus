/**
 * Game categories as the game reads them: one row of `public.game_category`
 * plus its titles, typed.
 *
 * The four built-in subject games and every category made in the admin panel
 * come through here; the general date game (`history`) is not a category.
 * The cached, tagged read the pages use is `readGameCategoriesCached` in
 * ./cached.ts (tag `categories`, cleared by the panel) — this module stays
 * free of `next/cache` so scripts/ can import it.
 */

import type { CategoryLayout, CategoryPane } from "../game/builtin-categories.ts";
import type { BandSet } from "../game/scoring.ts";
import type { SupportedLocale } from "./types.ts";
import type { DbClient } from "./queries.ts";

export interface GameCategory {
  slug: string;
  layout: CategoryLayout;
  panes: CategoryPane[];
  defaultPane: string;
  bands: BandSet;
  imagePrefix: string;
  cardImageKey: string | null;
  backdropKey: string | null;
  tagKind: string | null;
  showOnHome: boolean;
  homeOrder: number;
  status: "draft" | "published";
  isBuiltin: boolean;
  titles: Partial<Record<SupportedLocale, { title: string; blurb: string | null }>>;
}

/** Published categories, home order first. Readable with the anon key (RLS). */
export async function readGameCategories(client: DbClient): Promise<GameCategory[]> {
  const [rows, titles] = await Promise.all([
    client
      .from("game_category")
      .select(
        "slug, layout, panes, default_pane, bands, image_prefix, card_image_key, backdrop_key, tag_kind, show_on_home, home_order, status, is_builtin",
      )
      .eq("status", "published")
      .order("home_order"),
    client.from("game_category_translation").select("slug, locale_code, title, blurb"),
  ]);
  if (rows.error) throw new Error(`readGameCategories: ${rows.error.message}`);
  if (titles.error) throw new Error(`readGameCategories: ${titles.error.message}`);

  return (rows.data ?? []).map((row) => ({
    slug: row.slug,
    layout: row.layout,
    panes: row.panes as unknown as CategoryPane[],
    defaultPane: row.default_pane,
    bands: row.bands as unknown as BandSet,
    imagePrefix: row.image_prefix,
    cardImageKey: row.card_image_key,
    backdropKey: row.backdrop_key,
    tagKind: row.tag_kind,
    showOnHome: row.show_on_home,
    homeOrder: row.home_order,
    status: row.status,
    isBuiltin: row.is_builtin,
    titles: Object.fromEntries(
      (titles.data ?? [])
        .filter((t) => t.slug === row.slug)
        .map((t) => [t.locale_code, { title: t.title, blurb: t.blurb }]),
    ),
  }));
}

export function categoryTitle(category: GameCategory, locale: SupportedLocale): string {
  return category.titles[locale]?.title ?? category.titles.en?.title ?? category.slug;
}

export function categoryBlurb(category: GameCategory, locale: SupportedLocale): string {
  return category.titles[locale]?.blurb ?? category.titles.en?.blurb ?? "";
}
