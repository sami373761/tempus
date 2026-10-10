/**
 * Subject pools.
 *
 * A subject game draws from its own set of events and from nothing else, and
 * the general games (date guessing, comparison, the daily, survival,
 * head-to-head) never deal one of them. Both halves of that are enforced in
 * one place — `randomEvents` in lib/db/queries.ts — off a `kind = 'topic'`
 * category link, so a new subject is a category row plus a slug here rather
 * than an edit to every existing draw.
 *
 * The slug is the category's own slug in `public.category`; see
 * supabase/migrations/20261008140000_football_topic_category.sql and
 * supabase/migrations/20261009120000_screen_topic_category.sql.
 */

/** The football game's events (data/football.json, `npm run db:seed:football`). */
export const FOOTBALL_TOPIC = "football";

/** The basketball game's events (data/basketball.json, `npm run db:seed:basketball`). */
export const BASKETBALL_TOPIC = "basketball";

/** The film & television game's events (data/screen.json, `npm run db:seed:screen`). */
export const SCREEN_TOPIC = "screen";

/** The "Born When?" game's events (data/when-born.json, `npm run db:seed:when-born`). */
export const WHEN_BORN_TOPIC = "when-born";
