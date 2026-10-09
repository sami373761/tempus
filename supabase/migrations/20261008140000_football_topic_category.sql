-- ============================================================================
-- The football subject pool.
--
-- `kind = 'topic'` is what keeps these events out of the other games. Era
-- links say *when* an event happened and every event has exactly one; a topic
-- link says which subject pool an event belongs to, and the general games
-- (date guessing, comparison, daily, survival, head-to-head) draw only from
-- events that carry none. So a subject pool is opt-in on both sides: adding
-- basketball later is one more row here plus its own game, and no change to
-- any existing draw. The rule itself lives in `randomEvents` /
-- `countPublishedEvents` in lib/db/queries.ts, which is the single place an
-- event pool is chosen.
--
-- No new table, so there are no grants to revoke: `category`,
-- `category_translation` and `event_category` already carry the content
-- policies (anon/authenticated SELECT only).
--
-- The era trigger deletes `kind = 'era'` links only, so this link survives an
-- edit to the event's year.
-- ============================================================================

insert into public.category (slug, kind) values
  ('football', 'topic')
on conflict (slug) do update set kind = excluded.kind;

insert into public.category_translation (category_id, locale_code, name)
select c.id, v.locale_code, v.name
from (values
  ('football', 'en', 'Football'),
  ('football', 'tr', 'Futbol'),
  ('football', 'de', 'Fußball'),
  ('football', 'fr', 'Football'),
  ('football', 'es', 'Fútbol')
) as v(slug, locale_code, name)
join public.category c on c.slug = v.slug
on conflict (category_id, locale_code) do update set name = excluded.name;
