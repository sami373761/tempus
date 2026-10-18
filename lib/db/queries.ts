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
 *
 * **An event belongs to exactly one pool, and a game only sees its own.**
 * Events carrying a `kind = 'topic'` category are a subject game's — football's
 * today — and the general games (date guessing, comparison, the daily,
 * survival, head-to-head) draw from events that carry none. That rule is
 * applied here, where the pool is chosen, rather than in each of the five
 * places a round is dealt: a game that forgot to ask would otherwise deal
 * football events to a date-guessing player, and adding basketball later would
 * mean editing every existing draw. It is written twice, and the two must
 * agree: `random_events()` in SQL for every draw (see `randomEvents`), and
 * `poolRestriction()` below for the counts and listings.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types.ts";
import {
  DEFAULT_LOCALE,
  type CategoryKind,
  type LocalizedEvent,
  type LocalizedEventRow,
} from "./types.ts";
import { publicImageUrl } from "../storage/images.ts";

export type DbClient = SupabaseClient<Database>;

/**
 * Which pool a read draws from, shared by every function here that *chooses* a
 * set of events rather than being handed one.
 *
 * The default — both fields omitted — is the **general** pool: events carrying
 * no `kind = 'topic'` category. That is deliberately the default rather than
 * something a game opts into, because the cost of forgetting is a football
 * event in a date-guessing round.
 */
export interface PoolOptions {
  /**
   * Draw only from this subject pool: a `kind = 'topic'` category slug, e.g.
   * `FOOTBALL_TOPIC` from lib/game/topics.ts.
   */
  topicSlug?: string;
  /**
   * Default `false`. `true` lifts the pool rule altogether, so the read sees
   * the general pool and every subject pool at once — for statistics about the
   * library as a whole, and for editor tools, which have to be able to see
   * exactly what each game is hiding. The same kind of escape hatch as
   * `requireImage: false`. Ignored when `topicSlug` is set.
   */
  allPools?: boolean;
}

export interface ListEventsOptions extends PoolOptions {
  locale?: string;
  limit?: number;
  offset?: number;
  /** Inclusive astronomical-year bounds; negative = BCE. */
  fromYear?: number;
  toYear?: number;
  /**
   * Any category, era or topic. An explicit ask wins over the pool rule: this
   * is how an editor lists one subject's events, or one era's.
   */
  categorySlug?: string;
  /** Default `true`: only events that have a primary image. */
  requireImage?: boolean;
}

/**
 * Number of events a game can actually draw from — published *and* illustrated
 * *and* in the pool. Counted over the view rather than `event`, because that is
 * where the primary image is joined in and so where the site's own rule
 * applies.
 *
 * The pool default is the same as every other read here, so this answers "how
 * many can the date-guessing game deal?" unless asked otherwise. A count of
 * the library as a whole — which is what the home page states — passes
 * `allPools: true`.
 */
export async function countPublishedEvents(
  client: DbClient,
  options: PoolOptions & { requireImage?: boolean } = {},
): Promise<number> {
  const { requireImage = true, topicSlug, allPools } = options;

  let query = client
    .from("event_localized")
    .select("event_id", { count: "exact", head: true })
    .eq("locale_code", DEFAULT_LOCALE);

  if (requireImage) query = query.not("image_object_key", "is", null);

  const restriction = await poolRestriction(client, { topicSlug, allPools });
  if (restriction?.mode === "only") {
    if (restriction.ids.length === 0) return 0;
    query = query.in("event_id", restriction.ids);
  } else if (restriction && restriction.ids.length > 0) {
    // PostgREST writes a NOT IN as a parenthesised list; an empty one is a
    // syntax error, hence the length guard rather than an unconditional call.
    query = query.not("event_id", "in", `(${restriction.ids.join(",")})`);
  }

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
    topicSlug,
    allPools,
  } = options;

  let eventIds: string[] | undefined;
  if (categorySlug) {
    eventIds = await eventIdsInCategory(client, categorySlug);
    if (eventIds.length === 0) return [];
  }

  // A named category is the stronger statement, so it stands in for the pool
  // rule rather than being intersected with it.
  const restriction = categorySlug
    ? null
    : await poolRestriction(client, { topicSlug, allPools });

  if (restriction?.mode === "only") {
    if (restriction.ids.length === 0) return [];
    eventIds = restriction.ids;
  }

  let query = client
    .from("event_localized")
    .select("*")
    .in("locale_code", localeChain(locale))
    .order("sort_key", { ascending: true });

  if (fromYear !== undefined) query = query.gte("year", fromYear);
  if (toYear !== undefined) query = query.lte("year", toYear);
  if (eventIds) query = query.in("event_id", eventIds);
  if (restriction?.mode === "without" && restriction.ids.length > 0) {
    query = query.not("event_id", "in", `(${restriction.ids.join(",")})`);
  }
  // The view left-joins the primary image, so a null key *is* "has no photo".
  if (requireImage) query = query.not("image_object_key", "is", null);

  // Both locales of an event may come back; fetch a wider window, then dedupe.
  const { data, error } = await query.range(offset, offset + limit * 2 - 1);
  if (error) throw error;

  return pickPreferredLocale(data ?? [], locale).slice(0, limit);
}

export interface RandomEventsOptions extends PoolOptions {
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
  /**
   * Events the caller has already been dealt and would rather not see again:
   * the set of ten in progress, plus whatever is still sitting in its round
   * queue.
   *
   * A **preference, not a filter**. The draw takes everything it can from the
   * events not named here and only then tops up from the ones that are, so a
   * pool smaller than the caller's set stays playable: it degrades to
   * repeating an event rather than returning a short draw, which upstream is
   * a round queue that stops growing (see `ROUND_QUEUE_TARGET`).
   */
  exclude?: readonly string[];
}

/**
 * A random handful of published events for a game round.
 *
 * **One round trip**: the whole draw — published, illustrated, in the pool,
 * unseen first, one per year if asked, localized with fallback — is the SQL
 * function `random_events()` (supabase/migrations/20261017220000_random_events.sql).
 * It used to be four reads with the shuffle done here between them, and from a
 * player in Turkey against a database in Sydney every read is ~400ms; the
 * opening deal is awaited before a solo page sends any HTML, so the trips were
 * the page load. The options above are still the description of the rules;
 * the function is their only implementation for a draw.
 *
 * **This is where a game's pool is decided**, and every mode that deals a round
 * comes through here — the date-guessing game, the comparison game, survival,
 * the daily and a head-to-head match. None of them names a pool, so all of
 * them get the general one; a subject game passes its `topicSlug`.
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
    topicSlug,
    allPools = false,
    exclude,
  } = options;

  const { data, error } = await client.rpc("random_events", {
    p_count: count,
    p_locales: localeChain(locale),
    p_from_year: fromYear ?? null,
    p_to_year: toYear ?? null,
    p_distinct_years: distinctYears,
    p_require_image: requireImage,
    p_topic_slug: topicSlug ?? null,
    p_all_pools: allPools,
    p_exclude: exclude && exclude.length > 0 ? [...exclude] : null,
  });

  if (error) throw error;

  // Already one row per event; this is the shared mapper, and it returns the
  // batch in timeline order, which callers rely on and shuffle away.
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

/**
 * Which categories of one `kind` each of the given events carries.
 *
 * A second trip rather than an embed on `event_localized`: the view carries
 * event text and one image and nothing about categories, and widening it would
 * mean a migration plus a hand-edit of the generated types for a fact only one
 * game reads.
 *
 * The caller passes the ids it has already drawn, so this is a lookup over a
 * handful of rows rather than a scan: `dealScreenEvents` calls it with the two
 * or three events of one refill. Events with no category of that kind are
 * simply absent from the map, which is the honest answer for the 597 events
 * that have no format.
 *
 * `kind` is required and deliberately not defaulted. `'topic'` decides which
 * game may deal an event and is read through `poolRestriction` alone; asking
 * for it here would be a second, unenforced way to reason about pools.
 */
export async function eventCategorySlugs(
  client: DbClient,
  ids: readonly string[],
  options: { kind: CategoryKind },
): Promise<Map<string, string[]>> {
  const byEvent = new Map<string, string[]>();
  if (ids.length === 0) return byEvent;

  const { data, error } = await client
    .from("event_category")
    .select("event_id, category!inner(slug, kind)")
    .in("event_id", ids)
    .eq("category.kind", options.kind);

  if (error) throw error;

  for (const link of data ?? []) {
    const slugs = byEvent.get(link.event_id);
    if (slugs) slugs.push(link.category.slug);
    else byEvent.set(link.event_id, [link.category.slug]);
  }

  return byEvent;
}

/* Every `kind` link in one read, kept per process: the category links change
   only when the dataset is re-seeded, and the dealers that read them used to
   wait for the draw before asking — a second round trip on every refill. The
   index is fetched beside the draw instead, and after the first refill it is
   already in memory. Capped at one page: a kind that outgrows it is read per
   draw again rather than silently truncated. */
const CATEGORY_INDEX_TTL_MS = 10 * 60 * 1000;
const CATEGORY_INDEX_MAX_ROWS = 1000;
const categoryIndexes = new Map<
  CategoryKind,
  { at: number; index: Promise<Map<string, string[]> | null> }
>();

function readCategoryIndex(
  client: DbClient,
  kind: CategoryKind,
): Promise<Map<string, string[]> | null> {
  const cached = categoryIndexes.get(kind);
  if (cached && Date.now() - cached.at < CATEGORY_INDEX_TTL_MS) {
    return cached.index;
  }

  const index = Promise.resolve(
    client
      .from("event_category")
      .select("event_id, category!inner(slug, kind)")
      .eq("category.kind", kind)
      .range(0, CATEGORY_INDEX_MAX_ROWS - 1),
  ).then(({ data, error }) => {
    if (error) throw error;
    if ((data ?? []).length >= CATEGORY_INDEX_MAX_ROWS) return null;
    const byEvent = new Map<string, string[]>();
    for (const link of data ?? []) {
      const slugs = byEvent.get(link.event_id);
      if (slugs) slugs.push(link.category.slug);
      else byEvent.set(link.event_id, [link.category.slug]);
    }
    return byEvent;
  });

  const entry = { at: Date.now(), index };
  categoryIndexes.set(kind, entry);
  // A failed read is not kept: the next refill asks again.
  index.catch(() => {
    if (categoryIndexes.get(kind) === entry) categoryIndexes.delete(kind);
  });
  return index;
}

/**
 * `eventCategorySlugs` in two halves, so the read can start before the ids
 * are known: call this beside the draw, then pass it the drawn ids. Falls
 * back to the per-id query when the index is unavailable or too large.
 */
export async function categorySlugLookup(
  client: DbClient,
  options: { kind: CategoryKind },
): Promise<(ids: readonly string[]) => Promise<Map<string, string[]>>> {
  const index = await readCategoryIndex(client, options.kind).catch(() => null);
  if (!index) return (ids) => eventCategorySlugs(client, ids, options);
  return async (ids) => {
    const byEvent = new Map<string, string[]>();
    for (const id of ids) {
      const slugs = index.get(id);
      if (slugs) byEvent.set(id, slugs);
    }
    return byEvent;
  };
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
 * The pool rule, resolved to a list of event ids.
 *
 * `mode` says what to do with them: `only` keeps them (a subject pool), and
 * `without` drops them (the general pool, i.e. everything that is in no
 * subject). Null means the read is not restricted at all.
 *
 * One query either way, because `event_category` holds *every* topic link on
 * the site in a hundred-odd rows: the same read answers "which events are
 * football's?" and "which events are somebody's?". The draw does not come
 * through here — `random_events()` applies the same rule inside its one
 * statement — so a change to the pool rule is a change to both.
 */
async function poolRestriction(
  client: DbClient,
  options: PoolOptions,
): Promise<PoolRestriction | null> {
  const { topicSlug, allPools = false } = options;
  if (!topicSlug && allPools) return null;

  const { data, error } = await client
    .from("event_category")
    .select("event_id, category!inner(slug, kind)")
    .eq("category.kind", "topic");

  if (error) throw error;
  const links = data ?? [];

  if (topicSlug) {
    return {
      mode: "only",
      ids: links
        .filter((link) => link.category.slug === topicSlug)
        .map((link) => link.event_id),
    };
  }

  return { mode: "without", ids: links.map((link) => link.event_id) };
}

interface PoolRestriction {
  mode: "only" | "without";
  ids: string[];
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
    isSensitive: row.is_sensitive,
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
