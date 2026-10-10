-- ============================================================================
-- The film & television subject pool, and the one fact about these events the
-- other pools have no equivalent of.
--
-- Two kinds of row here, and the difference between them is load-bearing:
--
--   * `screen` is `kind = 'topic'`, exactly like `football`. That is what
--     decides which game may deal these events: a topic link says which
--     subject pool an event belongs to, and the general games (date guessing,
--     comparison, daily, survival, head-to-head) draw only from events that
--     carry none. So the pool is opt-in on both sides — `randomEvents` /
--     `countPublishedEvents` in lib/db/queries.ts is the single place it is
--     applied, and nothing about any existing draw changes.
--
--   * `film` and `series` are `kind = 'other'`, which is deliberately *not* a
--     pool. `poolRestriction()` reads `kind = 'topic'` and nothing else, so
--     these are invisible to every draw; they exist because the dataset knows
--     whether an entry is a film or a series and the game shows it on the
--     poster. For a series the stored year is the premiere, which is a
--     different question from a film's release year — the player is entitled
--     to know which of the two they are being asked.
--
-- Filing the format as a category rather than a column on `event` is what
-- keeps it a data change: `event` is shared by 500 historical events,
-- 97 football ones and these, and a `format` column would be null for 597 of
-- them. The same reasoning as the eras, which are also categories.
--
-- No new table, so there are no default grants to revoke: `category`,
-- `category_translation` and `event_category` already carry the content
-- policies (anon/authenticated SELECT only).
--
-- The era trigger deletes `kind = 'era'` links only, so all three of these
-- links survive an edit to an event's year.
--
-- `UNCLEARED` is the last row below and has nothing to do with the pool. The
-- ten posters uploaded for the first build of this game are promotional
-- artwork, not public-domain photography, and `public.image.license_code` is
-- a foreign key with no honest value for them among PD / CC. Labelling them
-- `PD` would be a fabricated rights claim in the one column the site would
-- later be audited on, so the licence table gains a row that says what is
-- actually true: rights not cleared, do not publish. `select * from
-- public.image where license_code = 'UNCLEARED'` is then the whole of the
-- "what has to be settled before launch" query.
-- ============================================================================

insert into public.category (slug, kind) values
  ('screen', 'topic'),
  ('film',   'other'),
  ('series', 'other')
on conflict (slug) do update set kind = excluded.kind;

insert into public.category_translation (category_id, locale_code, name)
select c.id, v.locale_code, v.name
from (values
  -- The pool. Named as the home board already names it, in all five
  -- languages — see `screenTitle` in lib/i18n/dictionary.ts.
  ('screen', 'en', 'Film & TV'),
  ('screen', 'tr', 'Film & Dizi'),
  ('screen', 'de', 'Film & TV'),
  ('screen', 'fr', 'Cinéma & TV'),
  ('screen', 'es', 'Cine y TV'),

  ('film', 'en', 'Film'),
  ('film', 'tr', 'Film'),
  ('film', 'de', 'Film'),
  ('film', 'fr', 'Film'),
  ('film', 'es', 'Película'),

  ('series', 'en', 'Series'),
  ('series', 'tr', 'Dizi'),
  ('series', 'de', 'Serie'),
  ('series', 'fr', 'Série'),
  ('series', 'es', 'Serie')
) as v(slug, locale_code, name)
join public.category c on c.slug = v.slug
on conflict (category_id, locale_code) do update set name = excluded.name;

-- Reference data, like every other row in `public.license`. `requires_attribution`
-- is true and `allows_commercial` false so that nothing can read this as a
-- permissive licence by accident.
insert into public.license (code, name, url, requires_attribution, allows_commercial, sort_order) values
  ('UNCLEARED', 'Rights not cleared — not for publication', null, true, false, 900)
on conflict (code) do update
  set name                 = excluded.name,
      url                  = excluded.url,
      requires_attribution = excluded.requires_attribution,
      allows_commercial    = excluded.allows_commercial,
      sort_order           = excluded.sort_order;
