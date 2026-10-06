-- ============================================================================
-- Make historical_year_label() agree with formatYear() in lib/historical-date.ts.
--
-- The dataset reaches 4.54 billion BCE. Rendering that as "4540000000 BCE" is
-- unreadable, and the TS formatter already switches to natural scale past a
-- million — but `event_localized.year_label` is produced by this function, so
-- the two representations disagreed depending on which side rendered the value.
--
-- Signature is unchanged, so the view that depends on it is unaffected.
-- ============================================================================

create or replace function public.historical_year_label(p_year bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  with parts as (
    -- Astronomical -> historical: 0 is 1 BCE, -999 is 1000 BCE.
    select
      case when p_year <= 0 then 1 - p_year else p_year end as magnitude,
      case when p_year <= 0 then 'BCE' else 'CE' end        as era
  )
  select
    case
      when magnitude >= 1000000000 then
        trim_scale(round(magnitude / 1000000000.0, 2))::text || ' billion ' || era
      when magnitude >= 1000000 then
        trim_scale(round(magnitude / 1000000.0, 2))::text || ' million ' || era
      else
        magnitude::text || ' ' || era
    end
  from parts;
$$;

comment on function public.historical_year_label is
  'Human label for an astronomical year. Mirrors formatYear() in lib/historical-date.ts, including the billion/million scale switch.';
