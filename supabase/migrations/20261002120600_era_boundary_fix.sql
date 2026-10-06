-- ============================================================================
-- Correct the BCE/CE era boundary.
--
-- Supersedes the threshold in 20261002120500_era_categories.sql, which used
-- `p_year < 0` and therefore filed astronomical year 0 under `ce`.
--
-- Astronomical year 0 IS 1 BCE — the numbering has a year zero precisely so
-- that arithmetic crosses the era boundary without a gap, but the historical
-- era of that year is still BCE. So the boundary is `<= 0`, not `< 0`:
--
--     year  -1  ->  2 BCE   -> bce
--     year   0  ->  1 BCE   -> bce   <-- changed by this migration
--     year   1  ->  1 CE    -> ce
--
-- No event currently sits at year 0, so this is a no-op for existing rows; it
-- matters for correctness of anything added later.
--
-- Mirrored by eraForYear() in lib/historical-date.ts.
-- ============================================================================

create or replace function public.era_slug_for_year(p_year bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_year <= 0    then 'bce'
    when p_year <= 2026 then 'ce'
    else 'future'
  end;
$$;

comment on function public.era_slug_for_year is
  'Maps an astronomical year to an era category slug: bce (<= 0, since year 0 is 1 BCE), ce (1..2026), future (> 2026). Mirrored by eraForYear() in lib/historical-date.ts and used as the R2 folder prefix.';

-- Re-converge the mapping under the corrected rule: drop links that now
-- contradict it, then add the ones that are missing.
delete from public.event_category ec
using public.category c, public.event e
where ec.category_id = c.id
  and ec.event_id = e.id
  and c.kind = 'era'
  and c.slug <> public.era_slug_for_year(e.year);

insert into public.event_category (event_id, category_id)
select e.id, c.id
from public.event e
join public.category c
  on c.slug = public.era_slug_for_year(e.year)
 and c.kind = 'era'
on conflict (event_id, category_id) do nothing;
