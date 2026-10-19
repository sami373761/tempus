-- ============================================================================
-- TEMPUS — admin panel: content functions (events, date challenges, images,
-- dashboard)
--
-- The rule for every function in the admin_* family (this file and the two
-- after it):
--
--   * A write is ONE plpgsql function: it takes p_actor (the admin's auth id)
--     and p_note, makes the change and writes its admin_audit row in the same
--     transaction. There is no write path that skips the log.
--   * security definer, search_path '', execute revoked from public / anon /
--     authenticated and granted to service_role only. The Server Actions that
--     call these run `await requireAdmin()` first (TOTP-verified session);
--     the database is the second wall, not the first.
--   * Refusals raise with errcode 'P0001' and a message starting with a
--     stable code ("not-found", "out-of-bounds", ...) that the TS side maps to
--     a fixed Turkish message. The text after the code is for the log.
--   * Reads return jsonb in one round trip: the database is in Sydney and a
--     panel page should cost at most three or four of them.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

-- Astronomical year range a pane list covers. Mirrors yearAtFraction(…, 0/1)
-- in lib/game/timeline.ts: a `year` pane is [minYear, maxYear]; a BCE pane
-- reads in display years, where display d is astronomical 1 - d (and 0 is 0).
create or replace function public.panes_year_bounds(p_panes jsonb)
returns table (min_year bigint, max_year bigint)
language sql
immutable
set search_path = ''
as $$
  with b as (
    select
      case when p ->> 'scale' = 'year' then (p ->> 'minYear')::bigint
           else case when (p ->> 'maxDisplay')::bigint = 0 then 0 else 1 - (p ->> 'maxDisplay')::bigint end
      end as lo,
      case when p ->> 'scale' = 'year' then (p ->> 'maxYear')::bigint
           else case when (p ->> 'minDisplay')::bigint = 0 then 0 else 1 - (p ->> 'minDisplay')::bigint end
      end as hi
    from jsonb_array_elements(p_panes) as p
  )
  select min(lo), max(hi) from b;
$$;

-- The subject category an event belongs to, or null for the general (history)
-- pool.
create or replace function public.event_topic_slug(p_event_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select g.slug
  from public.event_category ec
  join public.game_category g on g.category_id = ec.category_id
  where ec.event_id = p_event_id
  limit 1;
$$;

-- The tag (kind = 'other') an event carries, if any.
create or replace function public.event_tag_slug(p_event_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.slug
  from public.event_category ec
  join public.category c on c.id = ec.category_id and c.kind = 'other'
  where ec.event_id = p_event_id
  order by c.slug
  limit 1;
$$;

-- Whether p_year fits the rails of the topic (null topic = general pool,
-- which the event table's own range check already bounds).
create or replace function public.year_fits_topic(p_topic text, p_year bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_topic is null then true
    else coalesce((
      select p_year between b.min_year and b.max_year
      from public.game_category g
      cross join lateral public.panes_year_bounds(g.panes) b
      where g.slug = p_topic
    ), false)
  end;
$$;

-- Everything one event owns, for audit `before` and the delete preview.
create or replace function public.admin_event_snapshot(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'event', to_jsonb(e),
    'translations', coalesce((select jsonb_agg(to_jsonb(t) order by t.locale_code)
      from public.event_translation t where t.event_id = e.id), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('slug', c.slug, 'kind', c.kind) order by c.slug)
      from public.event_category ec join public.category c on c.id = ec.category_id
      where ec.event_id = e.id), '[]'::jsonb),
    'images', coalesce((select jsonb_agg(to_jsonb(i) order by i.is_primary desc, i.r2_object_key)
      from public.image i where i.event_id = e.id), '[]'::jsonb)
  )
  from public.event e
  where e.id = p_event_id;
$$;

create or replace function public.admin_event_name(p_event_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select name from public.event_translation where event_id = p_event_id and locale_code = 'tr'),
    (select name from public.event_translation where event_id = p_event_id and locale_code = 'en'),
    (select slug from public.event where id = p_event_id)
  );
$$;

create or replace function public.admin_utc_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'utc')::date;
$$;

-- Open votes of one event: cast for its current year, after its last review
-- at that year. The same rule as the event_challenge_stats view.
create or replace function public.admin_open_votes(p_event_id uuid)
returns setof public.event_date_challenge
language sql
stable
security definer
set search_path = ''
as $$
  select c.*
  from public.event_date_challenge c
  join public.event e on e.id = c.event_id
  where c.event_id = p_event_id
    and c.year_at_vote = e.year
    and c.created_at > coalesce((
      select max(r.reviewed_at) from public.event_challenge_review r
      where r.event_id = e.id and r.year = e.year
    ), '-infinity'::timestamptz);
$$;

-- ---------------------------------------------------------------------------
-- §6.2 Date challenges  (the §6.1 dashboard is in 20261018170900_admin_people.sql:
-- it reads admin_health_checks, which is defined there)
-- ---------------------------------------------------------------------------

-- p_filters: { topic, era, locale, from, to, openOnly (default true), sort:
-- 'volume' | 'later' | 'earlier' | 'newest' }. Only votes for the event's
-- current year after its last review are counted.
create or replace function public.admin_challenge_list(p_filters jsonb, p_page integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with f as (
    select
      nullif(p_filters ->> 'topic', '') as topic,
      nullif(p_filters ->> 'era', '') as era,
      nullif(p_filters ->> 'locale', '') as locale,
      nullif(p_filters ->> 'from', '')::timestamptz as since,
      nullif(p_filters ->> 'to', '')::timestamptz as until,
      coalesce((p_filters ->> 'openOnly')::boolean, true) as open_only,
      coalesce(nullif(p_filters ->> 'sort', ''), 'volume') as sort,
      greatest(coalesce(p_page, 1), 1) as page
  ),
  votes as (
    select c.event_id,
      count(*) filter (where c.direction = 1) as later,
      count(*) filter (where c.direction = -1) as earlier,
      count(*) as total,
      max(c.created_at) as last_vote
    from public.event_date_challenge c
    join public.event e on e.id = c.event_id
    cross join f
    where c.year_at_vote = e.year
      and c.created_at > coalesce((select max(r.reviewed_at) from public.event_challenge_review r
        where r.event_id = e.id and r.year = e.year), '-infinity'::timestamptz)
      and (f.locale is null or c.locale_code = f.locale)
      and (f.since is null or c.created_at >= f.since)
      and (f.until is null or c.created_at < f.until)
    group by c.event_id
  ),
  rows as (
    select e.id, e.slug, e.year, public.historical_year_label(e.year) as year_label,
      public.event_topic_slug(e.id) as topic,
      public.era_slug_for_year(e.year) as era,
      public.admin_event_name(e.id) as name,
      coalesce(v.later, 0) as later, coalesce(v.earlier, 0) as earlier,
      coalesce(v.total, 0) as total, coalesce(v.later, 0) - coalesce(v.earlier, 0) as net,
      v.last_vote
    from public.event e
    left join votes v on v.event_id = e.id
    cross join f
    where (not f.open_only or coalesce(v.total, 0) > 0)
      and (f.era is null or public.era_slug_for_year(e.year) = f.era)
  ),
  filtered as (
    select r.* from rows r cross join f
    where f.topic is null
       or (f.topic = 'history' and r.topic is null)
       or r.topic = f.topic
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'page', (select page from f),
    'pageSize', 50,
    'rows', coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select r.id as "eventId", r.slug, r.year, r.year_label as "yearLabel", r.topic, r.era, r.name,
          r.later, r.earlier, r.total, r.net, r.last_vote as "lastVote"
        from filtered r cross join f
        order by
          case when f.sort = 'volume' then r.total end desc nulls last,
          case when f.sort = 'later' then r.later end desc nulls last,
          case when f.sort = 'earlier' then r.earlier end desc nulls last,
          r.last_vote desc nulls last,
          r.slug
        limit 50 offset (select (page - 1) * 50 from f)
      ) x), '[]'::jsonb)
  );
$$;

create or replace function public.admin_challenge_detail(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with e as (select * from public.event where id = p_event_id),
  t as (select public.event_topic_slug(p_event_id) as topic),
  open as (select * from public.admin_open_votes(p_event_id)),
  solo as (
    select count(*) as n, count(*) filter (where verdict in ('wayOff', 'bad')) as poor
    from public.solo_answer where event_id = p_event_id
  ),
  peer as (
    -- The same pool's average poor-answer rate.
    select count(*) as n, count(*) filter (where a.verdict in ('wayOff', 'bad')) as poor
    from public.solo_answer a, t
    where a.game = coalesce(t.topic, 'history')
  ),
  versus as (
    select percentile_cont(0.5) within group (order by a.guess) as median, count(*) as n
    from public.match_round r
    join public.match_answer a on a.match_id = r.match_id and a.generation = r.generation and a.idx = r.idx
    where r.event_id = p_event_id
  )
  select case when not exists (select 1 from e) then null else jsonb_build_object(
    'event', (select jsonb_build_object(
      'id', e.id, 'slug', e.slug, 'year', e.year, 'yearLabel', public.historical_year_label(e.year),
      'precision', e.precision, 'status', e.status, 'isSensitive', e.is_sensitive,
      'topic', (select topic from t), 'era', public.era_slug_for_year(e.year)) from e),
    'translations', coalesce((select jsonb_agg(jsonb_build_object(
      'locale', tr.locale_code, 'name', tr.name, 'description', tr.description) order by tr.locale_code)
      from public.event_translation tr where tr.event_id = p_event_id), '[]'::jsonb),
    'image', (select jsonb_build_object('id', i.id, 'key', i.r2_object_key, 'sourcePageUrl', i.source_page_url,
      'license', i.license_code) from public.image i where i.event_id = p_event_id and i.is_primary),
    'tally', jsonb_build_object(
      'later', (select count(*) from open where direction = 1),
      'earlier', (select count(*) from open where direction = -1),
      'total', (select count(*) from open)),
    'daily', coalesce((select jsonb_agg(x order by x.day) from (
      select (c.created_at at time zone 'utc')::date as day,
        count(*) filter (where c.direction = 1) as later,
        count(*) filter (where c.direction = -1) as earlier
      from open c where c.created_at > now() - interval '90 days'
      group by 1) x), '[]'::jsonb),
    'locales', coalesce((select jsonb_agg(x order by x.n desc) from (
      select coalesce(c.locale_code, '?') as locale, count(*) as n from open c group by 1) x), '[]'::jsonb),
    'singleLocaleWarning', coalesce((
      select max(n)::numeric / nullif(sum(n), 0) >= 0.7 and sum(n) >= 5
      from (select count(*) as n from open group by locale_code) x), false),
    'solo', (select jsonb_build_object(
      'answers', solo.n,
      'poorRate', case when solo.n > 0 then round(solo.poor::numeric / solo.n, 3) end,
      'peerPoorRate', case when peer.n > 0 then round(peer.poor::numeric / peer.n, 3) end)
      from solo, peer),
    'versus', (select jsonb_build_object('answers', v.n, 'median', v.median,
      'offset', case when v.median is not null then v.median - (select year from e) end) from versus v),
    'yearHistory', coalesce((select jsonb_agg(jsonb_build_object(
      'auditId', a.id, 'at', a.created_at, 'before', a.before, 'after', a.after, 'note', a.note) order by a.created_at desc)
      from public.admin_audit a
      where a.target_table = 'event' and a.target_id = p_event_id::text and a.action = 'event.update_year'), '[]'::jsonb),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('year', r.year, 'at', r.reviewed_at, 'note', r.note)
      order by r.reviewed_at desc) from public.event_challenge_review r where r.event_id = p_event_id), '[]'::jsonb)
  ) end;
$$;

create or replace function public.admin_year_change_preview(p_event_id uuid, p_new_year bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with e as (select * from public.event where id = p_event_id),
  t as (select public.event_topic_slug(p_event_id) as topic),
  img as (select r2_object_key as key from public.image where event_id = p_event_id and is_primary)
  select case when not exists (select 1 from e) then null else jsonb_build_object(
    'oldYear', (select year from e),
    'newYear', p_new_year,
    'oldLabel', public.historical_year_label((select year from e)),
    'newLabel', public.historical_year_label(p_new_year),
    'oldEra', public.era_slug_for_year((select year from e)),
    'newEra', public.era_slug_for_year(p_new_year),
    'topic', (select topic from t),
    'imageKey', (select key from img),
    -- Only the general pool files images by era; a subject pool's folder is
    -- the category's.
    'folderMismatch', (select topic from t) is null and exists (
      select 1 from img where split_part(img.key, '/', 1) <> public.era_slug_for_year(p_new_year)),
    'inBounds', public.year_fits_topic((select topic from t), p_new_year),
    'bounds', (select jsonb_build_object('min', b.min_year, 'max', b.max_year)
      from public.game_category g cross join lateral public.panes_year_bounds(g.panes) b
      where g.slug = (select topic from t)),
    'pastDailies', (select count(*) from public.daily_challenge d
      where p_event_id = any (d.event_ids) and d.puzzle_date < public.admin_utc_today()),
    'upcomingDailies', (select count(*) from public.daily_challenge d
      where p_event_id = any (d.event_ids) and d.puzzle_date >= public.admin_utc_today()),
    'closingVotes', (select count(*) from public.admin_open_votes(p_event_id))
  ) end;
$$;

create or replace function public.admin_update_event_year(
  p_actor uuid, p_event_id uuid, p_year bigint, p_precision text, p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.event;
  v_closed int;
  v_topic text;
begin
  if nullif(btrim(p_note), '') is null then
    raise exception 'note-required: a year change needs a note';
  end if;
  if p_precision not in ('year', 'decade', 'century', 'millennium') then
    raise exception 'bad-precision: %', p_precision;
  end if;

  select * into v_event from public.event where id = p_event_id for update;
  if not found then raise exception 'not-found: event %', p_event_id; end if;

  v_topic := public.event_topic_slug(p_event_id);
  if not public.year_fits_topic(v_topic, p_year) then
    raise exception 'out-of-bounds: % is outside the % timeline', p_year, v_topic;
  end if;

  select count(*) into v_closed from public.admin_open_votes(p_event_id);
  if p_year = v_event.year then v_closed := 0; end if;

  update public.event
  set year = p_year, precision = p_precision::public.date_precision, admin_edited_at = now()
  where id = p_event_id;

  perform public.admin_log(p_actor, 'event.update_year', 'event', p_event_id::text,
    jsonb_build_object('year', v_event.year, 'precision', v_event.precision),
    jsonb_build_object('year', p_year, 'precision', p_precision, 'closedVotes', v_closed),
    p_note);

  return jsonb_build_object('closedVotes', v_closed);
end;
$$;

create or replace function public.admin_dismiss_challenges(p_actor uuid, p_event_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.event;
  v_later int;
  v_earlier int;
begin
  select * into v_event from public.event where id = p_event_id for update;
  if not found then raise exception 'not-found: event %', p_event_id; end if;

  select count(*) filter (where direction = 1), count(*) filter (where direction = -1)
  into v_later, v_earlier
  from public.admin_open_votes(p_event_id);

  insert into public.event_challenge_review (event_id, year, actor_id, note)
  values (p_event_id, v_event.year, p_actor, nullif(btrim(p_note), ''));

  perform public.admin_log(p_actor, 'challenge.dismiss', 'event', p_event_id::text,
    jsonb_build_object('year', v_event.year, 'later', v_later, 'earlier', v_earlier), null, p_note);

  return jsonb_build_object('dismissed', v_later + v_earlier);
end;
$$;

-- ---------------------------------------------------------------------------
-- §6.3 Events
-- ---------------------------------------------------------------------------

-- p_filters: { q, topic ('history' = general pool), status, era, noImage,
-- missingDescription (locale), missingTranslation (locale), sensitive }.
create or replace function public.admin_event_list(p_filters jsonb, p_page integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with f as (
    select
      nullif(btrim(p_filters ->> 'q'), '') as q,
      nullif(p_filters ->> 'topic', '') as topic,
      nullif(p_filters ->> 'status', '') as status,
      nullif(p_filters ->> 'era', '') as era,
      coalesce((p_filters ->> 'noImage')::boolean, false) as no_image,
      nullif(p_filters ->> 'missingDescription', '') as missing_desc,
      nullif(p_filters ->> 'missingTranslation', '') as missing_tr,
      (p_filters ->> 'sensitive')::boolean as sensitive,
      greatest(coalesce(p_page, 1), 1) as page
  ),
  base as (
    select e.*, public.event_topic_slug(e.id) as topic,
      exists (select 1 from public.image i where i.event_id = e.id and i.is_primary) as has_image
    from public.event e, f
    where (f.status is null or e.status::text = f.status)
      and (f.era is null or public.era_slug_for_year(e.year) = f.era)
      and (f.sensitive is null or e.is_sensitive = f.sensitive)
      and (f.q is null or e.slug ilike '%' || f.q || '%' or exists (
        select 1 from public.event_translation t where t.event_id = e.id and t.name ilike '%' || f.q || '%'))
      and (f.missing_tr is null or not exists (
        select 1 from public.event_translation t where t.event_id = e.id and t.locale_code = f.missing_tr))
      and (f.missing_desc is null or not exists (
        select 1 from public.event_translation t where t.event_id = e.id and t.locale_code = f.missing_desc
          and nullif(btrim(t.description), '') is not null))
  ),
  filtered as (
    select b.* from base b, f
    where (f.topic is null or (f.topic = 'history' and b.topic is null) or b.topic = f.topic)
      and (not f.no_image or not b.has_image)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'page', (select page from f),
    'pageSize', 50,
    'rows', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select r.id, r.slug, r.year, public.historical_year_label(r.year) as "yearLabel",
        r.status, r.topic, r.is_sensitive as "isSensitive", r.has_image as "hasImage",
        r.admin_edited_at as "adminEditedAt",
        (select name from public.event_translation where event_id = r.id and locale_code = 'tr') as "nameTr",
        (select name from public.event_translation where event_id = r.id and locale_code = 'en') as "nameEn",
        (select coalesce(jsonb_agg(l.code order by l.code), '[]'::jsonb) from public.locale l
          where not exists (select 1 from public.event_translation t where t.event_id = r.id and t.locale_code = l.code)
        ) as "missingLocales"
      from filtered r, f
      order by r.sort_key, r.slug
      limit 50 offset (select (page - 1) * 50 from f)) x), '[]'::jsonb)
  );
$$;

create or replace function public.admin_event_detail(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with e as (select * from public.event where id = p_event_id)
  select case when not exists (select 1 from e) then null else jsonb_build_object(
    'event', (select jsonb_build_object(
      'id', e.id, 'slug', e.slug, 'year', e.year, 'yearLabel', public.historical_year_label(e.year),
      'precision', e.precision, 'status', e.status, 'isSensitive', e.is_sensitive,
      'era', public.era_slug_for_year(e.year), 'adminEditedAt', e.admin_edited_at,
      'topic', public.event_topic_slug(e.id), 'tag', public.event_tag_slug(e.id)) from e),
    'translations', coalesce((select jsonb_agg(jsonb_build_object(
      'locale', t.locale_code, 'name', t.name, 'description', t.description) order by t.locale_code)
      from public.event_translation t where t.event_id = p_event_id), '[]'::jsonb),
    'images', coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id, 'key', i.r2_object_key, 'isPrimary', i.is_primary, 'mime', i.mime_type,
      'width', i.width, 'height', i.height, 'bytes', i.byte_size, 'license', i.license_code,
      'sourcePageUrl', i.source_page_url, 'author', i.author, 'attribution', i.attribution_text)
      order by i.is_primary desc, i.r2_object_key) from public.image i where i.event_id = p_event_id), '[]'::jsonb),
    'stats', jsonb_build_object(
      -- Deals are not recorded; what is recorded is every round that was
      -- answered (solo) or played (versus), which is what "dealt" can mean.
      'soloAnswers', (select count(*) from public.solo_answer where event_id = p_event_id),
      'versusRounds', (select count(*) from public.match_round where event_id = p_event_id),
      'verdicts', coalesce((select jsonb_object_agg(verdict, n) from (
        select verdict, count(*) as n from public.solo_answer where event_id = p_event_id group by verdict) v), '{}'::jsonb),
      'versusMedian', (select percentile_cont(0.5) within group (order by a.guess)
        from public.match_round r
        join public.match_answer a on a.match_id = r.match_id and a.generation = r.generation and a.idx = r.idx
        where r.event_id = p_event_id),
      'openVotes', (select count(*) from public.admin_open_votes(p_event_id)))
  ) end;
$$;

-- p_rows: [{ locale, name, description }]. Locales not in the list are left
-- alone; a blank description clears it; a blank name is refused.
create or replace function public.admin_upsert_event_translations(
  p_actor uuid, p_event_id uuid, p_rows jsonb, p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_row jsonb;
begin
  perform 1 from public.event where id = p_event_id for update;
  if not found then raise exception 'not-found: event %', p_event_id; end if;

  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'bad-input: no rows';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    if nullif(btrim(v_row ->> 'name'), '') is null then
      raise exception 'name-required: % has no name', v_row ->> 'locale';
    end if;
    if not exists (select 1 from public.locale where code = v_row ->> 'locale') then
      raise exception 'bad-locale: %', v_row ->> 'locale';
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('locale', locale_code, 'name', name, 'description', description)
    order by locale_code), '[]'::jsonb)
  into v_before from public.event_translation where event_id = p_event_id;

  insert into public.event_translation (event_id, locale_code, name, description)
  select p_event_id, r ->> 'locale', btrim(r ->> 'name'), nullif(btrim(r ->> 'description'), '')
  from jsonb_array_elements(p_rows) r
  on conflict (event_id, locale_code) do update
    set name = excluded.name, description = excluded.description;

  update public.event set admin_edited_at = now() where id = p_event_id;

  perform public.admin_log(p_actor, 'event.update_translations', 'event', p_event_id::text,
    v_before, p_rows, p_note);
end;
$$;

create or replace function public.admin_set_event_status(
  p_actor uuid, p_ids uuid[], p_status text, p_note text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.event;
  v_n int := 0;
begin
  if p_status not in ('draft', 'review', 'published', 'archived') then
    raise exception 'bad-status: %', p_status;
  end if;
  for v_event in select * from public.event where id = any (p_ids) order by id for update loop
    if v_event.status::text <> p_status then
      update public.event set status = p_status::public.publication_status, admin_edited_at = now()
      where id = v_event.id;
      perform public.admin_log(p_actor, 'event.set_status', 'event', v_event.id::text,
        jsonb_build_object('status', v_event.status), jsonb_build_object('status', p_status), p_note);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

create or replace function public.admin_set_event_sensitive(
  p_actor uuid, p_event_id uuid, p_value boolean, p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old boolean;
begin
  select is_sensitive into v_old from public.event where id = p_event_id for update;
  if not found then raise exception 'not-found: event %', p_event_id; end if;
  update public.event set is_sensitive = p_value, admin_edited_at = now() where id = p_event_id;
  perform public.admin_log(p_actor, 'event.set_sensitive', 'event', p_event_id::text,
    jsonb_build_object('isSensitive', v_old), jsonb_build_object('isSensitive', p_value), p_note);
end;
$$;

-- Internal: replace an event's topic and tag links. Era links belong to the
-- trigger and are never touched here.
create or replace function public.admin_link_event_category(p_event_id uuid, p_topic text, p_tag text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tag_kind text;
begin
  if p_topic is not null then
    select tag_kind into v_tag_kind from public.game_category where slug = p_topic;
    if not found then raise exception 'not-found: category %', p_topic; end if;
  end if;
  if p_tag is not null then
    if v_tag_kind is null or not exists (
      select 1 from public.category where slug = p_tag and kind = 'other' and tag_kind = v_tag_kind
    ) then
      raise exception 'bad-tag: % is not a tag of %', p_tag, coalesce(p_topic, 'history');
    end if;
  end if;

  delete from public.event_category ec
  using public.category c
  where ec.category_id = c.id and ec.event_id = p_event_id and c.kind in ('topic', 'other');

  if p_topic is not null then
    insert into public.event_category (event_id, category_id)
    select p_event_id, g.category_id from public.game_category g where g.slug = p_topic;
  end if;
  if p_tag is not null then
    insert into public.event_category (event_id, category_id)
    select p_event_id, c.id from public.category c where c.slug = p_tag;
  end if;
end;
$$;

create or replace function public.admin_set_event_category(
  p_actor uuid, p_event_id uuid, p_topic text, p_tag text, p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.event;
  v_before jsonb;
begin
  select * into v_event from public.event where id = p_event_id for update;
  if not found then raise exception 'not-found: event %', p_event_id; end if;

  p_topic := nullif(p_topic, '');
  p_tag := nullif(p_tag, '');
  if p_topic = 'history' then p_topic := null; end if;

  if not public.year_fits_topic(p_topic, v_event.year) then
    raise exception 'out-of-bounds: % is outside the % timeline', v_event.year, p_topic;
  end if;

  v_before := jsonb_build_object('topic', public.event_topic_slug(p_event_id), 'tag', public.event_tag_slug(p_event_id));
  perform public.admin_link_event_category(p_event_id, p_topic, p_tag);
  update public.event set admin_edited_at = now() where id = p_event_id;

  perform public.admin_log(p_actor, 'event.set_category', 'event', p_event_id::text,
    v_before, jsonb_build_object('topic', p_topic, 'tag', p_tag), p_note);
end;
$$;

create or replace function public.admin_delete_event_preview(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when not exists (select 1 from public.event where id = p_event_id) then null else jsonb_build_object(
    'name', public.admin_event_name(p_event_id),
    'translations', (select count(*) from public.event_translation where event_id = p_event_id),
    'images', (select count(*) from public.image where event_id = p_event_id),
    'imageKeys', coalesce((select jsonb_agg(r2_object_key order by r2_object_key) from public.image where event_id = p_event_id), '[]'::jsonb),
    'soloAnswers', (select count(*) from public.solo_answer where event_id = p_event_id),
    'matchRounds', (select count(*) from public.match_round where event_id = p_event_id),
    'challenges', (select count(*) from public.event_date_challenge where event_id = p_event_id),
    'pastDailies', coalesce((select jsonb_agg(puzzle_date::text || '/' || audience::text order by puzzle_date)
      from public.daily_challenge where p_event_id = any (event_ids) and puzzle_date < public.admin_utc_today()), '[]'::jsonb),
    'upcomingDailies', coalesce((select jsonb_agg(puzzle_date::text || '/' || audience::text order by puzzle_date)
      from public.daily_challenge where p_event_id = any (event_ids) and puzzle_date >= public.admin_utc_today()), '[]'::jsonb)
  ) end;
$$;

create or replace function public.admin_delete_event(
  p_actor uuid, p_event_id uuid, p_typed_name text, p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot jsonb;
  v_name text;
begin
  perform 1 from public.event where id = p_event_id for update;
  if not found then raise exception 'not-found: event %', p_event_id; end if;

  select name into v_name from public.event_translation where event_id = p_event_id and locale_code = 'tr';
  if v_name is null or btrim(coalesce(p_typed_name, '')) <> btrim(v_name) then
    raise exception 'confirm-mismatch: typed name does not match';
  end if;

  -- Today counts as upcoming: it is being played.
  if exists (select 1 from public.daily_challenge
             where p_event_id = any (event_ids) and puzzle_date >= public.admin_utc_today()) then
    raise exception 'in-daily: event is in an upcoming daily puzzle; reroll that day first';
  end if;

  v_snapshot := public.admin_event_snapshot(p_event_id);
  delete from public.event where id = p_event_id;

  -- R2 objects are not deleted; their keys are kept in the log.
  perform public.admin_log(p_actor, 'event.delete', 'event', p_event_id::text, v_snapshot,
    jsonb_build_object('r2Keys', coalesce((select jsonb_agg(i -> 'r2_object_key') from jsonb_array_elements(v_snapshot -> 'images') i), '[]'::jsonb)),
    p_note);
  return jsonb_build_object('deleted', true);
end;
$$;

-- Likely duplicates: same pool, years within 5, TR or EN names alike. Uses
-- pg_trgm's similarity() where the extension is installed (looked up at run
-- time so the function compiles either way), normalised equality otherwise.
create or replace function public.admin_duplicate_candidates()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_schema text;
  v_result jsonb;
  v_sim text;
begin
  select n.nspname into v_schema
  from pg_extension x join pg_namespace n on n.oid = x.extnamespace
  where x.extname = 'pg_trgm';

  v_sim := case when v_schema is null
    then 'case when lower(regexp_replace(a.name, ''[^[:alnum:]]+'', '''', ''g'')) = lower(regexp_replace(b.name, ''[^[:alnum:]]+'', '''', ''g'')) then 1.0 else 0.0 end'
    else format('%I.similarity(a.name, b.name)', v_schema) end;

  execute format($q$
    with n as (
      select e.id, e.slug, e.year, public.event_topic_slug(e.id) as topic, t.locale_code, t.name
      from public.event e join public.event_translation t on t.event_id = e.id and t.locale_code in ('tr', 'en')
    ),
    pairs as (
      select a.id as a_id, b.id as b_id, max(%s) as score
      from n a join n b
        on a.id < b.id and a.locale_code = b.locale_code
       and coalesce(a.topic, '') = coalesce(b.topic, '')
       and abs(a.year - b.year) <= 5
      group by a.id, b.id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'a', jsonb_build_object('id', ea.id, 'slug', ea.slug, 'year', ea.year, 'name', public.admin_event_name(ea.id)),
      'b', jsonb_build_object('id', eb.id, 'slug', eb.slug, 'year', eb.year, 'name', public.admin_event_name(eb.id)),
      'topic', public.event_topic_slug(ea.id),
      'score', round(p.score::numeric, 2)) order by p.score desc), '[]'::jsonb)
    from pairs p
    join public.event ea on ea.id = p.a_id
    join public.event eb on eb.id = p.b_id
    where p.score > 0.6
  $q$, v_sim) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- §6.4 Creating events
-- ---------------------------------------------------------------------------

-- Internal: insert one event from p_input = { slug, year, precision,
-- isSensitive, topic, tag, translations: [{locale, name, description}] }.
-- All five names are required; a slug that exists is refused.
create or replace function public.admin_insert_event(p_input jsonb, p_status text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_slug text := p_input ->> 'slug';
  v_year bigint := (p_input ->> 'year')::bigint;
  v_topic text := nullif(nullif(p_input ->> 'topic', ''), 'history');
  v_precision text := coalesce(nullif(p_input ->> 'precision', ''), 'year');
  v_missing text;
begin
  if v_slug is null or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'bad-slug: %', v_slug;
  end if;
  if exists (select 1 from public.event where slug = v_slug) then
    raise exception 'slug-taken: %', v_slug;
  end if;
  if v_year is null then raise exception 'bad-year: missing'; end if;
  if v_precision not in ('year', 'decade', 'century', 'millennium') then
    raise exception 'bad-precision: %', v_precision;
  end if;
  if p_status not in ('draft', 'review', 'published', 'archived') then
    raise exception 'bad-status: %', p_status;
  end if;
  if not public.year_fits_topic(v_topic, v_year) then
    raise exception 'out-of-bounds: % is outside the % timeline', v_year, v_topic;
  end if;

  select string_agg(l.code, ',' order by l.code) into v_missing
  from public.locale l
  where not exists (
    select 1 from jsonb_array_elements(coalesce(p_input -> 'translations', '[]'::jsonb)) t
    where t ->> 'locale' = l.code and nullif(btrim(t ->> 'name'), '') is not null);
  if v_missing is not null then
    raise exception 'name-required: %', v_missing;
  end if;

  insert into public.event (slug, year, precision, status, is_sensitive, admin_edited_at)
  values (v_slug, v_year, v_precision::public.date_precision, p_status::public.publication_status,
    coalesce((p_input ->> 'isSensitive')::boolean, false), now())
  returning id into v_id;

  insert into public.event_translation (event_id, locale_code, name, description)
  select v_id, t ->> 'locale', btrim(t ->> 'name'), nullif(btrim(t ->> 'description'), '')
  from jsonb_array_elements(p_input -> 'translations') t
  where exists (select 1 from public.locale l where l.code = t ->> 'locale');

  perform public.admin_link_event_category(v_id, v_topic, nullif(p_input ->> 'tag', ''));
  return v_id;
end;
$$;

create or replace function public.admin_create_event(p_actor uuid, p_input jsonb, p_status text, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  v_id := public.admin_insert_event(p_input, p_status);
  perform public.admin_log(p_actor, 'event.create', 'event', v_id::text, null,
    public.admin_event_snapshot(v_id), p_note);
  return v_id;
end;
$$;

-- All or nothing: one bad row (taken slug, out of bounds, missing name)
-- rolls the whole import back, and the error names the row.
create or replace function public.admin_import_events(
  p_actor uuid, p_topic text, p_rows jsonb, p_status text, p_note text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_i int := 0;
  v_slugs jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'bad-input: no rows';
  end if;
  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_i := v_i + 1;
    begin
      perform public.admin_insert_event(v_row || jsonb_build_object('topic', p_topic), p_status);
    exception when others then
      raise exception 'row-%: %', v_i, sqlerrm;
    end;
    v_slugs := v_slugs || to_jsonb(v_row ->> 'slug');
  end loop;
  perform public.admin_log(p_actor, 'event.import', 'game_category', coalesce(nullif(p_topic, ''), 'history'),
    null, jsonb_build_object('status', p_status, 'slugs', v_slugs), p_note);
  return v_i;
end;
$$;

-- ---------------------------------------------------------------------------
-- §6.5 Images
-- ---------------------------------------------------------------------------

-- p_master / p_webp: { bucket, key, mime, bytes, width, height, sha256 }.
-- p_meta: { license, sourcePageUrl, sourceName, author, attribution }.
-- The master goes in as a non-primary row, the WebP derivative as the
-- primary; the previous primary is demoted. Re-uploading the same keys
-- updates those rows in place (the R2 objects were overwritten).
create or replace function public.admin_attach_image(
  p_actor uuid, p_event_id uuid, p_master jsonb, p_webp jsonb, p_meta jsonb, p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev jsonb;
  v_img jsonb;
  v_primary uuid;
  v_id uuid;
begin
  perform 1 from public.event where id = p_event_id for update;
  if not found then raise exception 'not-found: event %', p_event_id; end if;

  if exists (
    select 1 from public.image
    where r2_object_key in (p_master ->> 'key', p_webp ->> 'key') and event_id <> p_event_id
  ) then
    raise exception 'key-taken: an image key belongs to another event';
  end if;

  select to_jsonb(i) into v_prev from public.image i where i.event_id = p_event_id and i.is_primary;
  update public.image set is_primary = false where event_id = p_event_id and is_primary;

  foreach v_img in array array[p_master, p_webp] loop
    insert into public.image (event_id, is_primary, r2_bucket, r2_object_key, mime_type, byte_size,
      width, height, checksum_sha256, source_name, source_page_url, author, license_code, attribution_text)
    values (p_event_id, v_img = p_webp, v_img ->> 'bucket', v_img ->> 'key', v_img ->> 'mime',
      (v_img ->> 'bytes')::bigint, (v_img ->> 'width')::int, (v_img ->> 'height')::int, v_img ->> 'sha256',
      nullif(btrim(p_meta ->> 'sourceName'), ''), nullif(btrim(p_meta ->> 'sourcePageUrl'), ''),
      nullif(btrim(p_meta ->> 'author'), ''), coalesce(nullif(p_meta ->> 'license', ''), 'PD'),
      nullif(btrim(p_meta ->> 'attribution'), ''))
    on conflict (r2_bucket, r2_object_key) do update set
      is_primary = excluded.is_primary, mime_type = excluded.mime_type, byte_size = excluded.byte_size,
      width = excluded.width, height = excluded.height, checksum_sha256 = excluded.checksum_sha256,
      source_name = excluded.source_name, source_page_url = excluded.source_page_url,
      author = excluded.author, license_code = excluded.license_code, attribution_text = excluded.attribution_text
    returning id into v_id;
    if v_img = p_webp then v_primary := v_id; end if;
  end loop;

  perform public.admin_log(p_actor, 'image.attach', 'event', p_event_id::text,
    jsonb_build_object('primary', v_prev),
    jsonb_build_object('master', p_master, 'webp', p_webp, 'meta', p_meta), p_note);
  return v_primary;
end;
$$;

create or replace function public.admin_update_image_attribution(
  p_actor uuid, p_image_id uuid, p_input jsonb, p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
begin
  select jsonb_build_object('license', license_code, 'sourcePageUrl', source_page_url, 'sourceName', source_name,
    'author', author, 'attribution', attribution_text)
  into v_before from public.image where id = p_image_id for update;
  if not found then raise exception 'not-found: image %', p_image_id; end if;

  update public.image set
    license_code = coalesce(nullif(p_input ->> 'license', ''), license_code),
    source_page_url = nullif(btrim(p_input ->> 'sourcePageUrl'), ''),
    source_name = nullif(btrim(p_input ->> 'sourceName'), ''),
    author = nullif(btrim(p_input ->> 'author'), ''),
    attribution_text = nullif(btrim(p_input ->> 'attribution'), '')
  where id = p_image_id;

  perform public.admin_log(p_actor, 'image.update_attribution', 'image', p_image_id::text, v_before, p_input, p_note);
end;
$$;

-- p_moves: [{ imageId, key }]. The R2 copies are made first by the caller;
-- this only re-points the rows, and only into the event's era folder.
create or replace function public.admin_repoint_image(
  p_actor uuid, p_event_id uuid, p_moves jsonb, p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_era text;
  v_move jsonb;
  v_before jsonb := '[]'::jsonb;
  v_old text;
begin
  select public.era_slug_for_year(year) into v_era from public.event where id = p_event_id for update;
  if not found then raise exception 'not-found: event %', p_event_id; end if;
  if public.event_topic_slug(p_event_id) is not null then
    raise exception 'not-history: only general-pool images are filed by era';
  end if;

  for v_move in select * from jsonb_array_elements(p_moves) loop
    if split_part(v_move ->> 'key', '/', 1) <> v_era then
      raise exception 'bad-folder: % is not in %/', v_move ->> 'key', v_era;
    end if;
    select r2_object_key into v_old from public.image
    where id = (v_move ->> 'imageId')::uuid and event_id = p_event_id for update;
    if not found then raise exception 'not-found: image %', v_move ->> 'imageId'; end if;
    update public.image set r2_object_key = v_move ->> 'key' where id = (v_move ->> 'imageId')::uuid;
    v_before := v_before || jsonb_build_object('imageId', v_move ->> 'imageId', 'key', v_old);
  end loop;

  perform public.admin_log(p_actor, 'image.move', 'event', p_event_id::text, v_before, p_moves, p_note);
end;
$$;

-- Only non-primary rows: the primary is what the site shows, and removing it
-- is "replace the image", not "clean up".
create or replace function public.admin_delete_image_rows(p_actor uuid, p_ids uuid[], p_note text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
  v_n int;
begin
  if exists (select 1 from public.image where id = any (p_ids) and is_primary) then
    raise exception 'is-primary: a selected row is a primary image';
  end if;
  select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) into v_rows from public.image i where i.id = any (p_ids);
  delete from public.image where id = any (p_ids);
  get diagnostics v_n = row_count;
  perform public.admin_log(p_actor, 'image.delete_rows', 'image', array_to_string(p_ids, ','), v_rows, null, p_note);
  return v_n;
end;
$$;

-- The image tabs. p_tab: missing | license | folder | unshrunk | orphans.
create or replace function public.admin_image_report(p_tab text, p_topic text, p_page integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with ev as (
    select e.id, e.slug, e.year, e.status, public.event_topic_slug(e.id) as topic,
      public.era_slug_for_year(e.year) as era
    from public.event e
  ),
  scoped as (
    select * from ev
    where nullif(p_topic, '') is null
       or (p_topic = 'history' and topic is null)
       or topic = p_topic
  ),
  rows as (
    select s.id as "eventId", s.slug, s.topic, s.era, public.admin_event_name(s.id) as name,
      null::uuid as "imageId", null::text as key, null::text as license, null::int as width, null::int as height,
      s.status::text as status
    from scoped s
    where p_tab = 'missing' and not exists (select 1 from public.image i where i.event_id = s.id and i.is_primary)
    union all
    select s.id, s.slug, s.topic, s.era, public.admin_event_name(s.id), i.id, i.r2_object_key, i.license_code,
      i.width, i.height, case when i.license_code = 'CC-BY-NC-4.0' then 'non-commercial' else 'attribution-missing' end
    from scoped s join public.image i on i.event_id = s.id
    where p_tab = 'license' and i.is_primary and (
      i.license_code = 'CC-BY-NC-4.0'
      or (i.license_code like 'CC-BY%' and (nullif(btrim(i.author), '') is null or nullif(btrim(i.attribution_text), '') is null)))
    union all
    select s.id, s.slug, s.topic, s.era, public.admin_event_name(s.id), i.id, i.r2_object_key, i.license_code,
      i.width, i.height, null
    from scoped s join public.image i on i.event_id = s.id and i.is_primary
    where p_tab = 'folder' and s.topic is null and split_part(i.r2_object_key, '/', 1) <> s.era
    union all
    select s.id, s.slug, s.topic, s.era, public.admin_event_name(s.id), i.id, i.r2_object_key, i.license_code,
      i.width, i.height, null
    from scoped s join public.image i on i.event_id = s.id and i.is_primary
    where p_tab = 'unshrunk' and (i.r2_object_key !~ '-[0-9]+\.webp$' or greatest(i.width, i.height) > 1600)
    union all
    select s.id, s.slug, s.topic, s.era, public.admin_event_name(s.id), i.id, i.r2_object_key, i.license_code,
      i.width, i.height, null
    from scoped s join public.image i on i.event_id = s.id and not i.is_primary
    where p_tab = 'orphans' and i.r2_object_key ~ '-[0-9]+\.[a-z0-9]+$'
  )
  select jsonb_build_object(
    'total', (select count(*) from rows),
    'page', greatest(coalesce(p_page, 1), 1),
    'pageSize', 50,
    'rows', coalesce((select jsonb_agg(to_jsonb(r)) from (
      select * from rows order by slug, key limit 50 offset (greatest(coalesce(p_page, 1), 1) - 1) * 50) r), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- Grants for this file
-- ---------------------------------------------------------------------------
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        'panes_year_bounds', 'event_topic_slug', 'event_tag_slug', 'year_fits_topic', 'admin_event_snapshot',
        'admin_event_name', 'admin_utc_today', 'admin_open_votes', 'admin_dashboard', 'admin_challenge_list',
        'admin_challenge_detail', 'admin_year_change_preview', 'admin_update_event_year',
        'admin_dismiss_challenges', 'admin_event_list', 'admin_event_detail', 'admin_upsert_event_translations',
        'admin_set_event_status', 'admin_set_event_sensitive',
        'admin_set_event_category', 'admin_delete_event_preview', 'admin_delete_event',
        'admin_duplicate_candidates', 'admin_create_event', 'admin_import_events',
        'admin_attach_image', 'admin_update_image_attribution', 'admin_repoint_image',
        'admin_delete_image_rows', 'admin_image_report')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;

  -- Internal steps that write without an audit row: callable only from the
  -- audited functions above (which run as the owner), never by a client.
  for f in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('admin_insert_event', 'admin_link_event_category')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', f);
  end loop;
end $$;
