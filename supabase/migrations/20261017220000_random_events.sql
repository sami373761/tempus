-- ============================================================================
-- One round trip per deal: `random_events()`.
--
-- `randomEvents` in lib/db/queries.ts used to draw in four reads — published
-- ids and years, then the primary-image filter and the topic links, then the
-- chosen rows from `event_localized` — and shuffle on the Node side between
-- them. Against a database in ap-southeast-2 and players in Turkey every one
-- of those is ~400ms, so a deal cost about two seconds, and the opening deal
-- of every solo page is awaited before any HTML is sent. Here the whole draw
-- is one statement, so a deal costs one trip.
--
-- It keeps every rule the TypeScript draw had, and the comments on
-- `RandomEventsOptions` remain the description of them:
--
--   * published only, and — unless `p_require_image` is false — only events
--     with a primary image (CLAUDE.md: an event with no photograph is hidden);
--   * the pool rule: `p_topic_slug` keeps one `kind = 'topic'` pool,
--     otherwise events in *any* topic pool are dropped, unless `p_all_pools`;
--   * `p_exclude` is a preference, not a filter: unseen events are drawn
--     first, the excluded ones only top a short draw up;
--   * `p_distinct_years` keeps the first event of each year in draw order,
--     which is exactly what the old skip-on-taken-year Fisher-Yates kept —
--     the k-th event taken was always the k-th first-of-its-year;
--   * the locale chain is the caller's (requested locale, then the default),
--     so the default locale stays a TypeScript constant; the first locale in
--     the chain that has a translation wins.
--
-- `p_exclude` is `text[]` rather than `uuid[]` on purpose: it arrives from a
-- request body, and an id that is not a uuid has to be "never matched", as it
-- was before, rather than a cast error that fails the deal.
--
-- `security invoker`, so RLS still decides what the caller can see — the anon
-- client gets published rows, the service role (daily, versus) gets what it
-- always did, and the explicit `status = 'published'` keeps drafts out for
-- the service role as the old id query did. Granted to `anon` and
-- `authenticated` because the solo dealers run as the visitor's own session;
-- nothing it returns is not already readable from `event_localized`.
-- ============================================================================

create or replace function public.random_events(
  p_count          integer,
  p_locales        text[],
  p_from_year      bigint  default null,
  p_to_year        bigint  default null,
  p_distinct_years boolean default false,
  p_require_image  boolean default true,
  p_topic_slug     text    default null,
  p_all_pools      boolean default false,
  p_exclude        text[]  default null
)
returns setof public.event_localized
language sql
volatile
security invoker
set search_path = ''
as $$
  with candidate as (
    select
      e.id,
      e.year,
      -- false sorts first: what the caller has not been dealt, then the rest.
      coalesce(e.id::text = any (p_exclude), false) as dealt,
      random() as draw
    from public.event e
    where e.status = 'published'
      and (p_from_year is null or e.year >= p_from_year)
      and (p_to_year is null or e.year <= p_to_year)
      and (
        not p_require_image
        or exists (
          select 1 from public.image i
          where i.event_id = e.id and i.is_primary
        )
      )
      and case
        when p_topic_slug is not null then exists (
          select 1
          from public.event_category ec
          join public.category c on c.id = ec.category_id
          where ec.event_id = e.id
            and c.kind = 'topic'
            and c.slug = p_topic_slug
        )
        when p_all_pools then true
        else not exists (
          select 1
          from public.event_category ec
          join public.category c on c.id = ec.category_id
          where ec.event_id = e.id
            and c.kind = 'topic'
        )
      end
  ),
  ranked as (
    select
      id,
      dealt,
      draw,
      row_number() over (partition by year order by dealt, draw) as nth_of_year
    from candidate
  ),
  picked as (
    select id
    from ranked
    where not p_distinct_years or nth_of_year = 1
    order by dealt, draw
    limit greatest(p_count, 0)
  )
  select distinct on (v.event_id) v.*
  from public.event_localized v
  join picked p on p.id = v.event_id
  where v.locale_code = any (p_locales)
  order by v.event_id, array_position(p_locales, v.locale_code)
$$;

comment on function public.random_events is
  'A random draw of playable events, localized, in one statement. The rules '
  'are documented on randomEvents in lib/db/queries.ts.';

-- A new function in `public` is executable by `public` by default; hand back
-- exactly the two roles the dealers run as. The service role keeps its own
-- default grant.
revoke all on function public.random_events(
  integer, text[], bigint, bigint, boolean, boolean, text, boolean, text[]
) from public, anon, authenticated;

grant execute on function public.random_events(
  integer, text[], bigint, bigint, boolean, boolean, text, boolean, text[]
) to anon, authenticated;
