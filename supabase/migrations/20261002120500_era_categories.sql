-- ============================================================================
-- Era categories: bce / ce / future, derived from event.year.
--
-- Slugs are ASCII-only because they double as R2 folder prefixes
-- (bce/<file>.webp). The displayed names are translated like any other
-- category.
--
-- The mapping is maintained by trigger, not written by hand: era is a pure
-- function of `year`, so storing it any other way invites drift.
--
-- Boundary note: astronomical year 0 is 1 BCE, so the `0 -> ce` threshold
-- below files 1 BCE under `ce`. That matches the requested rule. To make the
-- boundary historically exact, change `p_year < 0` to `p_year <= 0` in
-- era_slug_for_year() and re-run the backfill at the bottom of this file.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The rule, in one place. Mirrored by eraForYear() in lib/historical-date.ts.
-- ---------------------------------------------------------------------------

create or replace function public.era_slug_for_year(p_year bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_year < 0    then 'bce'
    when p_year <= 2026 then 'ce'
    else 'future'
  end;
$$;

comment on function public.era_slug_for_year is
  'Maps an astronomical year to an era category slug: bce (<0), ce (0..2026), future (>2026). Mirrored by eraForYear() in lib/historical-date.ts and used as the R2 folder prefix.';

-- ---------------------------------------------------------------------------
-- The three categories
-- ---------------------------------------------------------------------------

insert into public.category (slug, kind) values
  ('bce',    'era'),
  ('ce',     'era'),
  ('future', 'era')
on conflict (slug) do update set kind = excluded.kind;

insert into public.category_translation (category_id, locale_code, name)
select c.id, v.locale_code, v.name
from (values
  ('bce',    'en', 'Before Common Era'),
  ('bce',    'tr', 'Milattan Önce'),
  ('bce',    'de', 'Vor unserer Zeitrechnung'),
  ('bce',    'fr', 'Avant l''ère commune'),
  ('bce',    'es', 'Antes de la era común'),
  ('ce',     'en', 'Common Era'),
  ('ce',     'tr', 'Milattan Sonra'),
  ('ce',     'de', 'Unsere Zeitrechnung'),
  ('ce',     'fr', 'Ère commune'),
  ('ce',     'es', 'Era común'),
  ('future', 'en', 'Future'),
  ('future', 'tr', 'Gelecek'),
  ('future', 'de', 'Zukunft'),
  ('future', 'fr', 'Futur'),
  ('future', 'es', 'Futuro')
) as v(slug, locale_code, name)
join public.category c on c.slug = v.slug
on conflict (category_id, locale_code) do update set name = excluded.name;

-- ---------------------------------------------------------------------------
-- Keep the mapping in sync with year
-- ---------------------------------------------------------------------------

create or replace function public.sync_event_era_category()
returns trigger
language plpgsql
-- definer so the mapping is maintained no matter which role wrote the event;
-- safe because search_path is pinned and every reference is schema-qualified.
security definer
set search_path = ''
as $$
declare
  v_slug        text := public.era_slug_for_year(new.year);
  v_category_id uuid;
begin
  select id into v_category_id from public.category where slug = v_slug;

  if v_category_id is null then
    raise exception 'era category "%" is missing from public.category', v_slug;
  end if;

  -- Drop a stale era mapping only; topical and regional categories are left
  -- exactly as an editor set them.
  delete from public.event_category ec
  using public.category c
  where ec.event_id = new.id
    and ec.category_id = c.id
    and c.kind = 'era'
    and c.id <> v_category_id;

  insert into public.event_category (event_id, category_id)
  values (new.id, v_category_id)
  on conflict (event_id, category_id) do nothing;

  return null;
end;
$$;

comment on function public.sync_event_era_category is
  'AFTER trigger: maintains the single kind=era category link for an event from its year.';

drop trigger if exists event_sync_era_category on public.event;

create trigger event_sync_era_category
  after insert or update of year on public.event
  for each row execute function public.sync_event_era_category();

-- ---------------------------------------------------------------------------
-- Backfill every existing event
-- ---------------------------------------------------------------------------

insert into public.event_category (event_id, category_id)
select e.id, c.id
from public.event e
join public.category c
  on c.slug = public.era_slug_for_year(e.year)
 and c.kind = 'era'
on conflict (event_id, category_id) do nothing;

-- Remove any era link that contradicts the rule (no-op on a clean database).
delete from public.event_category ec
using public.category c, public.event e
where ec.category_id = c.id
  and ec.event_id = e.id
  and c.kind = 'era'
  and c.slug <> public.era_slug_for_year(e.year);
