-- ============================================================================
-- The basketball subject pool.
--
-- The smallest of the four subject migrations, and deliberately so: this is
-- one row and five translations, because the dataset carries nothing the other
-- pools have no equivalent of. Film & television needed `film` / `series`
-- (the stored year means a release for one and a premiere for the other) and
-- "Born When?" needed its fourteen fields (a portrait with no label is close
-- to unanswerable). A basketball event is an event — the photograph and the
-- name say what is being asked, exactly as football's do — so there is no
-- `kind = 'other'` half to this file.
--
-- `basketball` is `kind = 'topic'`, like `football`, `screen` and `when-born`.
-- That is what decides which game may deal these events: a topic link says
-- which subject pool an event belongs to, and the general games (date
-- guessing, comparison, daily, survival, head-to-head) draw only from events
-- that carry none. So the pool is opt-in on both sides —
-- `randomEvents` / `countPublishedEvents` in lib/db/queries.ts is the single
-- place it is applied, and nothing about any existing draw changes. This was
-- the row the football migration said would be next
-- (20261008140000_football_topic_category.sql).
--
-- No new table, so there are no default grants to revoke: `category`,
-- `category_translation` and `event_category` already carry the content
-- policies (anon/authenticated SELECT only).
--
-- The era trigger deletes `kind = 'era'` links only, so the topic link
-- survives an edit to an event's year. Every event in this pool is between
-- 1891 and 2024, so each one's era link is `ce` and stays that way.
-- ============================================================================

insert into public.category (slug, kind) values
  ('basketball', 'topic')
on conflict (slug) do update set kind = excluded.kind;

insert into public.category_translation (category_id, locale_code, name)
select c.id, v.locale_code, v.name
from (values
  -- Named as the home board already names it, in all five languages — see
  -- `basketballTitle` in lib/i18n/dictionary.ts. A mode is named once on this
  -- site, and this is the same string in a second place only because the
  -- database needs its own copy for a category list to be readable.
  ('basketball', 'en', 'Basketball'),
  ('basketball', 'tr', 'Basketbol'),
  ('basketball', 'de', 'Basketball'),
  ('basketball', 'fr', 'Basket-ball'),
  ('basketball', 'es', 'Baloncesto')
) as v(slug, locale_code, name)
join public.category c on c.slug = v.slug
on conflict (category_id, locale_code) do update set name = excluded.name;
