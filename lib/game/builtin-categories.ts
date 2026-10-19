/**
 * The four subject games as they were before categories became data — the
 * values the category migration (20261018170700_game_category.sql) wrote into
 * `public.game_category`, rebuilt from the constants the games were tuned
 * with.
 *
 * Kept for two checks only, never for gameplay: `admin:check` compares the
 * live rows against this, and scripts/admin-test-db/category-parity.ts proves
 * the migrated rows grade, rail and deal exactly as the constants did. The
 * games themselves read the rows (lib/db/game-categories.ts).
 *
 * The values are not copied by hand: panes come from `PANE_SPEC`, bands from
 * the `*_BANDS` arrays and titles from the dictionary, so a drift between the
 * migration and the code is a failed check rather than a silent difference.
 */

import { DICTIONARIES, type Dict } from "../i18n/dictionary.ts";
import { SUPPORTED_LOCALES, type SupportedLocale } from "../db/types.ts";
import {
  BASKETBALL_BANDS,
  FOOTBALL_BANDS,
  SCREEN_BANDS,
  WHEN_BORN_BANDS,
  type BandSet,
} from "./scoring.ts";
import {
  BASKETBALL_DEFAULT_PANE,
  BASKETBALL_PANES,
  FOOTBALL_DEFAULT_PANE,
  FOOTBALL_PANES,
  PANE_SPEC,
  SCREEN_DEFAULT_PANE,
  SCREEN_PANES,
  WHEN_BORN_DEFAULT_PANE,
  WHEN_BORN_PANES,
  type BuiltinPane,
  type PaneSpec,
} from "./timeline.ts";

export type CategoryLayout = "landscape" | "poster";

/** One rail of a category, as stored in `game_category.panes`. */
export type CategoryPane = { key: string; label: Record<SupportedLocale, string> } & PaneSpec;

export interface BuiltinCategory {
  slug: string;
  layout: CategoryLayout;
  panes: CategoryPane[];
  defaultPane: string;
  bands: BandSet;
  imagePrefix: string;
  tagKind: string | null;
  homeOrder: number;
  titles: Record<SupportedLocale, { title: string; blurb: string }>;
}

function perLocale(read: (t: Dict) => string): Record<SupportedLocale, string> {
  return Object.fromEntries(
    SUPPORTED_LOCALES.map((l) => [l, read(DICTIONARIES[l])]),
  ) as Record<SupportedLocale, string>;
}

function pane(key: BuiltinPane, label: (t: Dict) => string): CategoryPane {
  return { key, label: perLocale(label), ...PANE_SPEC[key] };
}

function titles(title: keyof Dict, blurb: keyof Dict) {
  return Object.fromEntries(
    SUPPORTED_LOCALES.map((l) => [
      l,
      { title: DICTIONARIES[l][title], blurb: DICTIONARIES[l][blurb] },
    ]),
  ) as Record<SupportedLocale, { title: string; blurb: string }>;
}

const single = (key: BuiltinPane, title: keyof Dict) => [pane(key, (t) => t[title])];

export const BUILTIN_CATEGORIES: readonly BuiltinCategory[] = [
  {
    slug: "football",
    layout: "landscape",
    panes: single(FOOTBALL_PANES[0] as BuiltinPane, "footballTitle"),
    defaultPane: FOOTBALL_DEFAULT_PANE,
    bands: FOOTBALL_BANDS,
    imagePrefix: "football",
    tagKind: null,
    homeOrder: 10,
    titles: titles("footballTitle", "cardFootballBlurb"),
  },
  {
    slug: "basketball",
    layout: "landscape",
    panes: single(BASKETBALL_PANES[0] as BuiltinPane, "basketballTitle"),
    defaultPane: BASKETBALL_DEFAULT_PANE,
    bands: BASKETBALL_BANDS,
    imagePrefix: "basketball",
    tagKind: null,
    homeOrder: 20,
    titles: titles("basketballTitle", "cardBasketballBlurb"),
  },
  {
    slug: "screen",
    layout: "poster",
    panes: single(SCREEN_PANES[0] as BuiltinPane, "screenTitle"),
    defaultPane: SCREEN_DEFAULT_PANE,
    bands: SCREEN_BANDS,
    imagePrefix: "film-dizi",
    tagKind: "screen-format",
    homeOrder: 30,
    titles: titles("screenTitle", "cardScreenBlurb"),
  },
  {
    slug: "when-born",
    layout: "poster",
    // The labels are what `paneLabel` would print; the game hides them
    // (`heading={false}`), but a stored pane must still have a name.
    panes: (WHEN_BORN_PANES as readonly BuiltinPane[]).map((key) =>
      pane(key, (t) =>
        key === "born-antiquity" ? t.bc : key === "born-premodern" ? "1–1500" : "1500–2026",
      ),
    ),
    defaultPane: WHEN_BORN_DEFAULT_PANE,
    bands: WHEN_BORN_BANDS,
    imagePrefix: "when-born",
    tagKind: "person-field",
    homeOrder: 40,
    titles: titles("whenBornTitle", "cardWhenBornBlurb"),
  },
];

export function builtinCategory(slug: string): BuiltinCategory | undefined {
  return BUILTIN_CATEGORIES.find((c) => c.slug === slug);
}
