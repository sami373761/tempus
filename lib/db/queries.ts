/**
 * Read queries against the `event_localized` view.
 *
 * Every function takes an explicit client so the same query can run with the
 * anon client (RLS: published only) or the admin client (drafts included).
 *
 * **An event with no photograph is not shown on the site.** Roughly a third of
 * the dataset is still waiting for one, and an event that appears as a grey
 * placeholder is worse than an event that waits its turn — so every read here
 * requires a primary image by default. It is a default rather than a hard rule
 * because editing tools have to be able to see exactly the rows the site is
 * hiding: pass `requireImage: false` for those. Attaching an image is all it
 * takes to put an event back in play; nothing has to be re-seeded or
 * re-published.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types.ts";
import {
  DEFAULT_LOCALE,
  type LocalizedEvent,
  type LocalizedEventRow,
} from "./types.ts";
import { publicImageUrl } from "../storage/images.ts";

export type DbClient = SupabaseClient<Database>;

export interface ListEventsOptions {
  locale?: string;
  limit?: number;
  offset?: number;
  /** Inclusive astronomical-year bounds; negative = BCE. */
  fromYear?: number;
  toYear?: number;
  categorySlug?: string;
  /** Default `true`: only events that have a primary image. */
  requireImage?: boolean;
}

/**
 * Number of events the game can actually draw from — published *and*
 * illustrated. Counted over the view rather than `event`, because that is where
 * the primary image is joined in and so where the site's own rule applies.
 */
export async function countPublishedEvents(
  client: DbClient,
  options: { requireImage?: boolean } = {},
): Promise<number> {
  const { requireImage = true } = options;

  let query = client
    .from("event_localized")
    .select("event_id", { count: "exact", head: true })
    .eq("locale_code", DEFAULT_LOCALE);

  if (requireImage) query = query.not("image_object_key", "is", null);

  const { count, error } = await query;

  if (error) throw error;
  return count ?? 0;
}

/** Events in timeline order, localized with fallback to the default locale. */
export async function listEvents(
  client: DbClient,
  options: ListEventsOptions = {},
): Promise<LocalizedEvent[]> {
  const {
    locale = DEFAULT_LOCALE,
    limit = 50,
    offset = 0,
    fromYear,
    toYear,
    categorySlug,
    requireImage = true,
  } = options;

  let eventIds: string[] | undefined;
  if (categorySlug) {
    eventIds = await eventIdsInCategory(client, categorySlug);
    if (eventIds.length === 0) return [];
  }

  let query = client
    .from("event_localized")
    .select("*")
    .in("locale_code", localeChain(locale))
    .order("sort_key", { ascending: true });

  if (fromYear !== undefined) query = query.gte("year", fromYear);
  if (toYear !== undefined) query = query.lte("year", toYear);
  if (eventIds) query = query.in("event_id", eventIds);
  // The view left-joins the primary image, so a null key *is* "has no photo".
  if (requireImage) query = query.not("image_object_key", "is", null);

  // Both locales of an event may come back; fetch a wider window, then dedupe.
  const { data, error } = await query.range(offset, offset + limit * 2 - 1);
  if (error) throw error;

  return pickPreferredLocale(data ?? [], locale).slice(0, limit);
}

export interface RandomEventsOptions {
  /** How many distinct events to return. */
  count: number;
  locale?: string;
  /** Inclusive astronomical-year bounds; negative = BCE. */
  fromYear?: number;
  toYear?: number;
  /** Reject a draw where two events share a year, so comparisons never tie. */
  distinctYears?: boolean;
  /** Default `true`: only events that have a primary image. */
  requireImage?: boolean;
}

/**
 * A random handful of published events for a game round.
 *
 * PostgREST cannot `order by random()`, so this draws ids first (one cheap
 * column over a few hundred rows) and then fetches only the chosen rows
 * localized. Shuffling client-side keeps the round uniform without a database
 * function, and the id list is small enough that the extra trip is free.
 */
export async function randomEvents(
  client: DbClient,
  options: RandomEventsOptions,
): Promise<LocalizedEvent[]> {
  const {
    count,
    locale = DEFAULT_LOCALE,
    fromYear,
    toYear,
    distinctYears = false,
    requireImage = true,
  } = options;

  let idQuery = client.from("event").select("id, year").eq("status", "published");
  if (fromYear !== undefined) idQuery = idQuery.gte("year", fromYear);
  if (toYear !== undefined) idQuery = idQuery.lte("year", toYear);

  const { data: candidates, error: idError } = await idQuery;
  if (idError) throw idError;

  // Narrowed here rather than in the draw below, so the shuffle stays uniform
  // over the events that can actually be dealt instead of discarding picks.
  const pool = requireImage
    ? await onlyWithPrimaryImage(client, candidates ?? [])
    : (candidates ?? []);

  const picked = pickRandom(pool, count, distinctYears);
  if (picked.length === 0) return [];

  const { data, error } = await client
    .from("event_localized")
    .select("*")
    .in(
      "event_id",
      picked.map((row) => row.id),
    )
    .in("locale_code", localeChain(locale));

  if (error) throw error;

  return pickPreferredLocale(data ?? [], locale);
}

/**
 * Specific events, localized, in the order the caller asked for them.
 *
 * `randomEvents` draws and returns in timeline order; this takes ids that have
 * already been chosen and gives them back in the *given* order, which is what
 * a head-to-head match needs — its round order was fixed when the match was
 * dealt and the two clients have to see the same question at the same index.
 *
 * No `requireImage` option: the ids come from somewhere that already applied
 * that rule when it picked them, and silently dropping a round here would
 * desynchronise the two players rather than hide a missing picture.
 */
export async function eventsByIds(
  client: DbClient,
  ids: readonly string[],
  locale: string = DEFAULT_LOCALE,
): Promise<LocalizedEvent[]> {
  if (ids.length === 0) return [];

  const { data, error } = await client
    .from("event_localized")
    .select("*")
    .in("event_id", ids)
    .in("locale_code", localeChain(locale));

  if (error) throw error;

  const byId = new Map(
    pickPreferredLocale(data ?? [], locale).map((event) => [event.id, event]),
  );

  return ids
    .map((id) => byId.get(id))
    .filter((event): event is LocalizedEvent => event !== undefined);
}

export async function getEventBySlug(
  client: DbClient,
  slug: string,
  locale: string = DEFAULT_LOCALE,
  options: { requireImage?: boolean } = {},
): Promise<LocalizedEvent | null> {
  const { requireImage = true } = options;

  let query = client
    .from("event_localized")
    .select("*")
    .eq("slug", slug)
    .in("locale_code", localeChain(locale));

  if (requireImage) query = query.not("image_object_key", "is", null);

  const { data, error } = await query;

  if (error) throw error;

  const [event] = pickPreferredLocale(data ?? [], locale);
  return event ?? null;
}

export async function listCategories(
  client: DbClient,
  locale: string = DEFAULT_LOCALE,
): Promise<{ id: string; slug: string; kind: string; name: string }[]> {
  const { data, error } = await client
    .from("category")
    .select("id, slug, kind, category_translation(locale_code, name)")
    .order("slug", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const translations = row.category_translation ?? [];
    const preferred =
      translations.find((t) => t.locale_code === locale) ??
      translations.find((t) => t.locale_code === DEFAULT_LOCALE);
    return {
      id: row.id,
      slug: row.slug,
      kind: row.kind,
      name: preferred?.name ?? row.slug,
    };
  });
}

// --- internals -------------------------------------------------------------

/**
 * Keeps only the rows whose event has a primary image.
 *
 * A second round trip rather than an embedded join: `image` carries its own RLS
 * policy (images of published events are readable), the id list is a few
 * hundred rows at most, and reading it plainly keeps the rule visible instead of
 * buried in PostgREST embedding syntax.
 */
async function onlyWithPrimaryImage<T extends { id: string }>(
  client: DbClient,
  rows: readonly T[],
): Promise<T[]> {
  if (rows.length === 0) return [];

  const { data, error } = await client
    .from("image")
    .select("event_id")
    .eq("is_primary", true);

  if (error) throw error;

  const illustrated = new Set((data ?? []).map((row) => row.event_id));
  return rows.filter((row) => illustrated.has(row.id));
}

/** Requested locale first, default locale as the fallback. */
function localeChain(locale: string): string[] {
  return locale === DEFAULT_LOCALE ? [locale] : [locale, DEFAULT_LOCALE];
}

async function eventIdsInCategory(
  client: DbClient,
  categorySlug: string,
): Promise<string[]> {
  const { data, error } = await client
    .from("event_category")
    .select("event_id, category!inner(slug)")
    .eq("category.slug", categorySlug);

  if (error) throw error;
  return (data ?? []).map((row) => row.event_id);
}

/** Collapses multi-locale rows to one row per event, preferring `locale`. */
function pickPreferredLocale(
  rows: LocalizedEventRow[],
  locale: string,
): LocalizedEvent[] {
  const byEvent = new Map<string, LocalizedEventRow>();

  for (const row of rows) {
    const existing = byEvent.get(row.event_id);
    if (!existing || row.locale_code === locale) byEvent.set(row.event_id, row);
  }

  return [...byEvent.values()]
    .sort((a, b) => a.sort_key - b.sort_key)
    .map(toLocalizedEvent);
}

/**
 * Fisher-Yates over a copy, stopping once `count` rows are taken. With
 * `distinctYears`, a candidate whose year is already taken is skipped rather
 * than retried, which is unbiased because the shuffle is already uniform.
 */
function pickRandom<T extends { year: number }>(
  rows: readonly T[],
  count: number,
  distinctYears: boolean,
): T[] {
  const pool = [...rows];
  const taken: T[] = [];
  const years = new Set<number>();

  for (let i = pool.length - 1; i >= 0 && taken.length < count; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const row = pool[j]!;
    pool[j] = pool[i]!;

    if (distinctYears && years.has(row.year)) continue;
    years.add(row.year);
    taken.push(row);
  }

  return taken;
}

function toLocalizedEvent(row: LocalizedEventRow): LocalizedEvent {
  return {
    id: row.event_id,
    slug: row.slug,
    year: row.year,
    month: row.month,
    day: row.day,
    precision: row.precision,
    sortKey: row.sort_key,
    locale: row.locale_code,
    name: row.name,
    description: row.description,
    image: row.image_object_key
      ? {
          objectKey: row.image_object_key,
          url: publicImageUrl(row.image_object_key),
          mimeType: row.image_mime_type,
          width: row.image_width,
          height: row.image_height,
          attribution: {
            sourceName: row.image_source_name,
            sourcePageUrl: row.image_source_page_url,
            author: row.image_author,
            licenseCode: row.image_license_code,
            attributionText: row.image_attribution_text,
          },
        }
      : null,
  };
}
