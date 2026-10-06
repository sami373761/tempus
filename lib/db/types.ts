/**
 * Application-level domain types.
 *
 * `database.types.ts` is generated and mirrors the tables; this file is the
 * stable, readable surface the rest of the app imports.
 */

import type { Database } from "./database.types.ts";

type Tables = Database["public"]["Tables"];
type Views = Database["public"]["Views"];

export type DatePrecision = Database["public"]["Enums"]["date_precision"];
export type PublicationStatus =
  Database["public"]["Enums"]["publication_status"];
export type CategoryKind = Database["public"]["Enums"]["category_kind"];

/**
 * The five launch languages. This is a convenience union for UI code — the
 * database accepts any row in `public.locale`, so adding a language stays a
 * data change, not a schema change.
 */
export const SUPPORTED_LOCALES = ["en", "tr", "de", "fr", "es"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "en";

export function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export type Locale = Tables["locale"]["Row"];
export type License = Tables["license"]["Row"];

export type EventRow = Tables["event"]["Row"];
export type EventInsert = Tables["event"]["Insert"];
export type EventUpdate = Tables["event"]["Update"];

export type EventTranslationRow = Tables["event_translation"]["Row"];
export type EventTranslationInsert = Tables["event_translation"]["Insert"];

export type CategoryRow = Tables["category"]["Row"];
export type CategoryTranslationRow = Tables["category_translation"]["Row"];

export type ImageRow = Tables["image"]["Row"];
export type ImageInsert = Tables["image"]["Insert"];

/** One row of the flattened read model: event + one locale + primary image. */
export type LocalizedEventRow = Views["event_localized"]["Row"];

/** Attribution block as the UI needs to render it. */
export interface ImageAttribution {
  sourceName: string | null;
  sourcePageUrl: string | null;
  author: string | null;
  licenseCode: string | null;
  attributionText: string | null;
}

/** An event ready for the UI: localized text plus a resolved image URL. */
export interface LocalizedEvent {
  id: string;
  slug: string;
  /** Astronomical year: negative/zero = BCE. See lib/historical-date.ts. */
  year: number;
  month: number | null;
  day: number | null;
  precision: DatePrecision;
  /** Mirrors event.sort_key — monotonic across the BCE/CE boundary. */
  sortKey: number;
  locale: string;
  name: string;
  description: string | null;
  image: {
    objectKey: string;
    url: string;
    mimeType: string | null;
    width: number | null;
    height: number | null;
    attribution: ImageAttribution;
  } | null;
}
