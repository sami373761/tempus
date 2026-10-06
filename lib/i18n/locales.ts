/**
 * The language list the UI offers. Mirrors the rows seeded into
 * `public.locale` by 20261002120200_reference_data.sql — names are the native
 * spellings from that migration, so the selector and the database agree.
 *
 * A 6th language stays a data change: insert the locale row, add a dictionary
 * in ./dictionary.ts, add an entry here.
 */

import type { SupportedLocale } from "../db/types.ts";

export interface UiLocale {
  code: SupportedLocale;
  /** Native name, as shown in the open selector. */
  native: string;
  /** Two-letter badge for the collapsed selector. */
  short: string;
}

/** Keyed by locale code so a missing language is a type error, not a silent gap. */
export const UI_LOCALE: Record<SupportedLocale, UiLocale> = {
  en: { code: "en", native: "English", short: "EN" },
  tr: { code: "tr", native: "Türkçe", short: "TR" },
  de: { code: "de", native: "Deutsch", short: "DE" },
  fr: { code: "fr", native: "Français", short: "FR" },
  es: { code: "es", native: "Español", short: "ES" },
};

/** Selector order follows `locale.sort_order` from the reference data. */
export const UI_LOCALES: readonly UiLocale[] = [
  UI_LOCALE.en,
  UI_LOCALE.tr,
  UI_LOCALE.de,
  UI_LOCALE.fr,
  UI_LOCALE.es,
];
