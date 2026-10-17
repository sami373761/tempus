/**
 * Application-level domain types.
 *
 * `database.types.ts` is generated and mirrors the tables; this file is the
 * stable, readable surface the rest of the app imports.
 */

import type { Database, Json } from "./database.types.ts";

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
  /**
   * Whether the photograph should be shown blurred behind a reveal control.
   *
   * An editorial judgement about the subject rather than a property of the
   * image, which is why it travels with the event: a few of the events this
   * game teaches are atrocities, and their pictures are the kind a player
   * should choose to look at instead of having one dealt to them face up.
   * `EventVisual` is the one place it is acted on, so every screen that shows
   * a photograph honours it.
   */
  isSensitive: boolean;
  image: {
    objectKey: string;
    url: string;
    mimeType: string | null;
    width: number | null;
    height: number | null;
    attribution: ImageAttribution;
  } | null;
}

/* --- accounts ------------------------------------------------------------- */

export type ProfileRow = Tables["profile"]["Row"];
export type BadgeRow = Tables["badge"]["Row"];
export type UserBadgeProgressRow = Tables["user_badge_progress"]["Row"];

/**
 * What the chrome needs to know about whoever is signed in: enough to greet
 * them and to decide which menu rows are live, and nothing more.
 *
 * `username` is nullable all the way through — a Google sign-in can arrive
 * with a name that is already taken (see `handle_new_user()`), and the account
 * page is where one gets picked. `displayName` is the resolved thing to print,
 * which is why both are here rather than only the second: the account page has
 * to be able to tell "no username yet" from "a username that happens to look
 * like an email".
 */
export interface Account {
  id: string;
  email: string | null;
  username: string | null;
  /** Username if there is one, else the email's local part, else "Player". */
  displayName: string;
  /**
   * Badges earned but not looked at yet — the number on the menu's
   * Achievements row, and 0 for "nothing to announce". Here rather than in a
   * read of its own because the chrome is the only thing that shows it and
   * the chrome already reads this profile (`readProfileChrome`).
   */
  unseenBadges: number;
}

/**
 * One badge's state for one player.
 *
 * `progress`/`target` are counts rather than a percentage because every
 * criterion written down so far is a count of something, and because a
 * percentage cannot be incremented. Nothing fills these in yet — the rules are
 * not decided (see the migration) — so they read as zeros, which is the honest
 * answer rather than a placeholder.
 */
export interface BadgeProgress {
  slug: string;
  progress: number;
  target: number;
  unlockedAt: string | null;
  /** Whatever the eventual rule remembers between rounds. */
  details: Record<string, Json>;
}
