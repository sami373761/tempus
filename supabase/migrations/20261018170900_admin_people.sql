-- ============================================================================
-- TEMPUS — admin panel: people, head-to-head, daily, health, audit log,
-- dashboard. Same contract as 20261018170800_admin_content.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- §6.7 Users
-- ---------------------------------------------------------------------------
create or replace function public.admin_user_list(p_query text, p_page integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with q as (select nullif(btrim(p_query), '') as q, greatest(coalesce(p_page, 1), 1) as page),
  base as (
    select u.id, u.email, u.created_at, u.last_sign_in_at, u.banned_until,
      coalesce(u.raw_app_meta_data ->> 'provider', 'email') as provider,
      (u.raw_app_meta_data ->> 'role') = 'admin' as is_admin,
      p.username, p.chrono_rating, p.is_hidden_from_boards
    from auth.users u
    left join public.profile p on p.id = u.id, q
    where q.q is null
       or p.username ilike '%' || q.q || '%'
       or u.email ilike '%' || q.q || '%'
       or u.id::text = q.q
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'page', (select page from q),
    'pageSize', 50,
    'rows', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select b.id, b.username, b.email, b.provider, b.created_at as "createdAt",
        b.is_admin as "isAdmin", b.is_hidden_from_boards as "hidden",
        coalesce((select sum(tp) from public.score_entry s where s.user_id = b.id), 0) as tp,
        b.chrono_rating as kp,
        greatest(b.last_sign_in_at, (select max(created_at) from public.score_entry s where s.user_id = b.id)) as "lastActive",
        b.banned_until > now() as banned, b.banned_until as "bannedUntil"
      from base b, q
      order by b.created_at desc
      limit 50 offset (select (page - 1) * 50 from q)) x), '[]'::jsonb)
  );
$$;

create or replace function public.admin_user_detail(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when not exists (select 1 from auth.users where id = p_user_id) then null else jsonb_build_object(
    'user', (select jsonb_build_object(
      'id', u.id, 'email', u.email, 'createdAt', u.created_at, 'lastSignInAt', u.last_sign_in_at,
      'bannedUntil', u.banned_until, 'banned', coalesce(u.banned_until > now(), false),
      'provider', coalesce(u.raw_app_meta_data ->> 'provider', 'email'),
      'isAdmin', (u.raw_app_meta_data ->> 'role') = 'admin',
      'username', p.username, 'kp', p.chrono_rating, 'avatarKey', p.avatar_key,
      'wornBadge', p.worn_badge, 'shownBadge', public.shown_badge(u.id),
      'hidden', p.is_hidden_from_boards,
      'tp', coalesce((select sum(tp) from public.score_entry s where s.user_id = u.id), 0))
      from auth.users u left join public.profile p on p.id = u.id where u.id = p_user_id),
    'ledger', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select id, game, kind, source, tp, created_at as "createdAt" from public.score_entry
      where user_id = p_user_id order by created_at desc, id desc limit 100) x), '[]'::jsonb),
    'sets', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select id, game, kind, answered, correct, perfects, tp, created_at as "createdAt", closed_at as "closedAt"
      from public.solo_set where user_id = p_user_id order by created_at desc limit 50) x), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select m.id, m.phase, m.is_public as "isPublic", mp.seat, m.seat1_score as "seat1Score",
        m.seat2_score as "seat2Score", m.created_at as "createdAt"
      from public.match_player mp join public.match m on m.id = mp.match_id
      where mp.user_id = p_user_id order by m.created_at desc limit 50) x), '[]'::jsonb),
    'chrono', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select outcome, delta, rating_after as "ratingAfter", created_at as "createdAt"
      from public.chrono_rating_entry where user_id = p_user_id order by created_at desc limit 50) x), '[]'::jsonb),
    'badges', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select badge_slug as slug, progress, target, unlocked_at as "unlockedAt"
      from public.user_badge_progress where user_id = p_user_id order by badge_slug) x), '[]'::jsonb),
    'challenges', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select c.event_id as "eventId", public.admin_event_name(c.event_id) as name, c.direction,
        c.year_at_vote as "yearAtVote", c.created_at as "createdAt"
      from public.event_date_challenge c where c.user_id = p_user_id order by c.created_at desc limit 100) x), '[]'::jsonb)
  ) end;
$$;

-- Last seven days. Each list is capped; these are leads, not verdicts.
create or replace function public.admin_suspicious_users()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with daily_tp as (
    select user_id, (created_at at time zone 'utc')::date as day, sum(tp) as tp
    from public.score_entry where created_at > now() - interval '7 days' and kind <> 'adjustment'
    group by 1, 2
  ),
  p99 as (select percentile_cont(0.99) within group (order by tp) as v from daily_tp),
  perfect as (
    select user_id, count(*) as n, count(*) filter (where verdict = 'perfect') as perfects
    from public.solo_answer
    where answered_at > now() - interval '7 days' and game not in ('compare', 'survival')
    group by user_id
  ),
  fast as (
    select s.user_id, s.id as set_id, s.game,
      extract(epoch from (max(a.answered_at) - min(a.answered_at))) as seconds
    from public.solo_set s join public.solo_answer a on a.set_id = s.id
    where s.created_at > now() - interval '7 days' and s.kind = 'set' and s.closed_at is not null
    group by s.user_id, s.id, s.game
    having count(*) >= 10
  ),
  named as (select id, username from public.profile)
  select jsonb_build_object(
    'highDailyTp', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select d.user_id as "userId", n.username, d.day, d.tp, round((select v from p99)::numeric, 1) as p99
      from daily_tp d left join named n on n.id = d.user_id
      where d.tp > 3 * (select v from p99) order by d.tp desc limit 50) x), '[]'::jsonb),
    'perfectRate', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select p.user_id as "userId", n.username, p.n as answers, p.perfects,
        round(p.perfects::numeric / p.n, 3) as rate
      from perfect p left join named n on n.id = p.user_id
      where p.n >= 20 and p.perfects::numeric / p.n > 0.6 order by rate desc limit 50) x), '[]'::jsonb),
    'fastSets', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select f.user_id as "userId", n.username, f.set_id as "setId", f.game, round(f.seconds::numeric, 1) as seconds
      from fast f left join named n on n.id = f.user_id
      where f.seconds < 30 order by f.seconds limit 50) x), '[]'::jsonb)
  );
$$;

create or replace function public.admin_rename_user(
  p_actor uuid, p_user_id uuid, p_new_name text, p_reserve_old boolean, p_note text,
  p_release_reserved boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
  v_new text := public.normalize_username(p_new_name);
begin
  select username into v_old from public.profile where id = p_user_id for update;
  if not found then raise exception 'not-found: profile %', p_user_id; end if;
  if v_new is null or v_new <> btrim(p_new_name) then
    raise exception 'bad-username: %', p_new_name;
  end if;

  -- Undo of a rename that reserved the old name: the name being restored is
  -- the one that was reserved, so the reservation goes first.
  if p_release_reserved then
    delete from public.reserved_username where username = v_new;
  end if;

  begin
    update public.profile set username = v_new where id = p_user_id;
  exception when unique_violation then
    raise exception 'username-taken: %', v_new;
  end;

  if p_reserve_old and v_old is not null and v_old <> v_new then
    insert into public.reserved_username (username) values (v_old) on conflict do nothing;
  end if;

  perform public.admin_log(p_actor, 'user.rename', 'profile', p_user_id::text,
    jsonb_build_object('username', v_old),
    jsonb_build_object('username', v_new, 'reservedOld', coalesce(p_reserve_old, false)), p_note);
  return v_new;
end;
$$;

create or replace function public.admin_clear_avatar(p_actor uuid, p_user_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  select avatar_key into v_old from public.profile where id = p_user_id for update;
  if not found then raise exception 'not-found: profile %', p_user_id; end if;
  update public.profile set avatar_key = null where id = p_user_id;
  perform public.admin_log(p_actor, 'user.clear_avatar', 'profile', p_user_id::text,
    jsonb_build_object('avatarKey', v_old), jsonb_build_object('avatarKey', null), p_note);
end;
$$;

create or replace function public.admin_set_hidden_from_boards(
  p_actor uuid, p_user_id uuid, p_value boolean, p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old boolean;
begin
  select is_hidden_from_boards into v_old from public.profile where id = p_user_id for update;
  if not found then raise exception 'not-found: profile %', p_user_id; end if;
  update public.profile set is_hidden_from_boards = p_value where id = p_user_id;
  perform public.admin_log(p_actor, 'user.hide_from_boards', 'profile', p_user_id::text,
    jsonb_build_object('hidden', v_old), jsonb_build_object('hidden', p_value), p_note);
end;
$$;

-- A correction is a new signed ledger row, never an edit. The ledger needs a
-- game: corrections are filed under 'history', the general game, which no
-- per-game screen reads in isolation (boards and badges sum every game).
create or replace function public.admin_adjust_score(p_actor uuid, p_user_id uuid, p_tp integer, p_note text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_audit bigint;
begin
  if nullif(btrim(p_note), '') is null then raise exception 'note-required: a correction needs a note'; end if;
  if p_tp is null or p_tp = 0 then raise exception 'bad-amount: %', p_tp; end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'not-found: user %', p_user_id;
  end if;
  v_audit := public.admin_log(p_actor, 'score.adjust', 'score_entry', p_user_id::text, null,
    jsonb_build_object('tp', p_tp), p_note);
  insert into public.score_entry (user_id, game, kind, source, tp)
  values (p_user_id, 'history', 'adjustment', 'adjust:' || v_audit, p_tp);
  return v_audit;
end;
$$;

create or replace function public.admin_user_delete_preview(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when not exists (select 1 from auth.users where id = p_user_id) then null else jsonb_build_object(
    'username', (select username from public.profile where id = p_user_id),
    'email', (select email from auth.users where id = p_user_id),
    'scoreEntries', (select count(*) from public.score_entry where user_id = p_user_id),
    'soloSets', (select count(*) from public.solo_set where user_id = p_user_id),
    'soloAnswers', (select count(*) from public.solo_answer where user_id = p_user_id),
    'dailyAttempts', (select count(*) from public.daily_attempt where user_id = p_user_id),
    'chronoEntries', (select count(*) from public.chrono_rating_entry where user_id = p_user_id),
    'badges', (select count(*) from public.user_badge_progress where user_id = p_user_id),
    'challenges', (select count(*) from public.event_date_challenge where user_id = p_user_id),
    -- Seats are kept with user_id cleared (on delete set null).
    'matchSeats', (select count(*) from public.match_player where user_id = p_user_id)
  ) end;
$$;

-- ---------------------------------------------------------------------------
-- §6.8 Head-to-head
-- ---------------------------------------------------------------------------
create or replace function public.admin_versus_overview()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with live as (
    select m.*, (select max(last_seen_at) from public.match_player mp where mp.match_id = m.id) as last_seen,
      exists (select 1 from public.match_player mp where mp.match_id = m.id and mp.bot_level is not null) as has_bot
    from public.match m where m.phase in ('lobby', 'playing', 'revealed')
  ),
  recent as (select * from public.match where created_at > now() - interval '7 days'),
  bots as (
    select bp.bot_level as level,
      count(*) filter (where m.phase = 'complete') as finished,
      count(*) filter (where m.phase = 'complete' and
        case when bp.seat = 1 then m.seat1_score > m.seat2_score else m.seat2_score > m.seat1_score end) as wins,
      (select avg(abs(r.bot_guess - e.year)) from public.match_round r join public.event e on e.id = r.event_id
        join public.match_player b2 on b2.match_id = r.match_id and b2.bot_level = bp.bot_level
        join recent m2 on m2.id = r.match_id where r.bot_guess is not null) as avg_error
    from recent m join public.match_player bp on bp.match_id = m.id and bp.bot_level is not null
    group by bp.bot_level
  )
  select jsonb_build_object(
    'live', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select id, phase, current_idx as "currentIdx", total_rounds as "totalRounds", is_public as "isPublic",
        has_bot as "hasBot", last_seen as "lastSeen", updated_at as "updatedAt",
        updated_at < now() - interval '30 minutes' as stuck
      from live order by updated_at limit 200) x), '[]'::jsonb),
    'stuck', (select count(*) from live where updated_at < now() - interval '30 minutes'),
    'ended', (select count(*) from public.match where phase in ('complete', 'abandoned')),
    'sweepable', (select count(*) from public.match where updated_at < now() - interval '12 hours'),
    'bots', coalesce((select jsonb_agg(to_jsonb(x) order by x.level) from (
      select level, finished, wins,
        case when finished > 0 then round(wins::numeric / finished, 3) end as "winRate",
        round(avg_error::numeric, 1) as "avgError"
      from bots) x), '[]'::jsonb),
    'kpHistogram', coalesce((select jsonb_agg(to_jsonb(x) order by x.bucket) from (
      select (p.chrono_rating / 100) * 100 as bucket, count(*) as n
      from public.profile p where exists (select 1 from public.chrono_rating_entry e where e.user_id = p.id)
      group by 1) x), '[]'::jsonb),
    'abandonRate', (select case when count(*) filter (where phase in ('complete', 'abandoned')) > 0 then
      round(count(*) filter (where phase = 'abandoned')::numeric / count(*) filter (where phase in ('complete', 'abandoned')), 3) end
      from recent),
    -- From the public lobby opening to the second seat being taken.
    'avgMatchWaitSeconds', (select round(avg(extract(epoch from (mp.created_at - m.created_at)))::numeric, 1)
      from recent m join public.match_player mp on mp.match_id = m.id and mp.seat = 2 where m.is_public)
  );
$$;

-- An admin ending a match is not a forfeit by either seat: no KP moves
-- (versus_settle_rating skips an abandonment with no forfeit_seat).
create or replace function public.admin_abandon_match(p_actor uuid, p_match_id uuid, p_note text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.match;
begin
  v_match := public.versus_reconcile(p_match_id);
  if v_match.id is null then raise exception 'not-found: match %', p_match_id; end if;
  if v_match.phase in ('lobby', 'playing', 'revealed') then
    update public.match set phase = 'abandoned', forfeit_seat = null where id = p_match_id
    returning * into v_match;
  end if;
  perform public.admin_log(p_actor, 'versus.abandon', 'match', p_match_id::text, null,
    jsonb_build_object('phase', v_match.phase), p_note);
  return v_match.phase::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- §6.9 Daily
-- ---------------------------------------------------------------------------
create or replace function public.admin_daily_overview(p_from date, p_days integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with days as (
    select d::date as day
    from generate_series(p_from, p_from + (least(greatest(coalesce(p_days, 15), 1), 60) - 1), interval '1 day') d
  ),
  audiences as (select unnest(array['member', 'guest']::public.daily_audience[]) as audience)
  select coalesce(jsonb_agg(jsonb_build_object(
    'day', d.day,
    'audience', a.audience,
    'drawn', c.puzzle_date is not null,
    'plays', (select count(*) from public.daily_attempt t where t.puzzle_date = d.day),
    'locked', d.day <= public.admin_utc_today()
      or exists (select 1 from public.daily_attempt t where t.puzzle_date = d.day),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'slug', e.slug, 'name', public.admin_event_name(e.id), 'year', e.year,
        'yearLabel', public.historical_year_label(e.year), 'status', e.status,
        'openVotes', (select count(*) from public.admin_open_votes(e.id))) order by x.ord)
      from unnest(c.event_ids) with ordinality x(id, ord)
      join public.event e on e.id = x.id), '[]'::jsonb),
    'missing', coalesce(cardinality(c.event_ids), 0) - (select count(*) from public.event e where e.id = any (c.event_ids)),
    'warning', exists (select 1 from public.event e where e.id = any (c.event_ids)
        and (e.status <> 'published' or exists (select 1 from public.admin_open_votes(e.id))))
      or coalesce(cardinality(c.event_ids), 0) > (select count(*) from public.event e where e.id = any (c.event_ids))
  ) order by d.day, a.audience), '[]'::jsonb)
  from days d cross join audiences a
  left join public.daily_challenge c on c.puzzle_date = d.day and c.audience = a.audience;
$$;

-- Replace one future day's questions for one audience. p_event_ids is drawn
-- by the caller (lib/db/admin/daily.ts, the same draw the site uses); when
-- the day has not been drawn at all yet, p_other_ids is the other audience's
-- set, because the two must be disjoint and must be written together.
create or replace function public.admin_reroll_daily(
  p_actor uuid, p_date date, p_audience text, p_event_ids uuid[], p_other_ids uuid[], p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_other public.daily_audience;
  v_other_ids uuid[];
begin
  if p_audience not in ('member', 'guest') then raise exception 'bad-audience: %', p_audience; end if;
  if p_date <= public.admin_utc_today() then
    raise exception 'locked: today and past days cannot be rerolled';
  end if;
  if exists (select 1 from public.daily_attempt where puzzle_date = p_date) then
    raise exception 'locked: the day already has attempts';
  end if;
  if coalesce(cardinality(p_event_ids), 0) = 0 or not public.array_is_distinct(p_event_ids) then
    raise exception 'bad-input: event list';
  end if;

  v_other := case when p_audience = 'member' then 'guest' else 'member' end;
  perform 1 from public.daily_challenge where puzzle_date = p_date for update;
  select event_ids into v_other_ids from public.daily_challenge where puzzle_date = p_date and audience = v_other;

  if v_other_ids is null then
    if coalesce(cardinality(p_other_ids), 0) = 0 then
      raise exception 'bad-input: the day is not drawn yet; both audiences are needed';
    end if;
    v_other_ids := p_other_ids;
    insert into public.daily_challenge (puzzle_date, audience, event_ids) values (p_date, v_other, v_other_ids);
  end if;
  if p_event_ids && v_other_ids then
    raise exception 'overlap: the two audiences must not share events';
  end if;

  select to_jsonb(c) into v_before from public.daily_challenge c where puzzle_date = p_date and audience = p_audience::public.daily_audience;

  insert into public.daily_challenge (puzzle_date, audience, event_ids)
  values (p_date, p_audience::public.daily_audience, p_event_ids)
  on conflict (puzzle_date, audience) do update set event_ids = excluded.event_ids;

  perform public.admin_log(p_actor, 'daily.reroll', 'daily_challenge', p_date::text || '/' || p_audience,
    v_before, jsonb_build_object('eventIds', to_jsonb(p_event_ids)), p_note);
end;
$$;

-- ---------------------------------------------------------------------------
-- §6.10 Health
-- ---------------------------------------------------------------------------
create or replace function public.admin_health_checks()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_sample jsonb;
  v_count bigint;
  v_last text;
begin
  -- 1. Era link differs from era_slug_for_year (or missing / several).
  select count(*), coalesce(jsonb_agg(to_jsonb(x) - 'rn') filter (where x.rn <= 10), '[]'::jsonb) into v_count, v_sample from (
    select e.slug, e.year, public.era_slug_for_year(e.year) as expected,
      (select string_agg(c.slug, ',') from public.event_category ec join public.category c on c.id = ec.category_id
        where ec.event_id = e.id and c.kind = 'era') as actual,
      row_number() over (order by e.slug) as rn
    from public.event e
    where coalesce((select string_agg(c.slug, ',') from public.event_category ec join public.category c on c.id = ec.category_id
        where ec.event_id = e.id and c.kind = 'era'), '') <> public.era_slug_for_year(e.year)) x;
  v_out := v_out || jsonb_build_object('key', 'era_link', 'warning', true, 'count', v_count, 'sample', v_sample);

  -- 2. General-pool image filed in the wrong era folder.
  select count(*), coalesce(jsonb_agg(to_jsonb(x) - 'rn') filter (where x.rn <= 10), '[]'::jsonb) into v_count, v_sample from (
    select e.slug, i.r2_object_key as key, public.era_slug_for_year(e.year) as era, row_number() over (order by e.slug) as rn
    from public.event e join public.image i on i.event_id = e.id and i.is_primary
    where public.event_topic_slug(e.id) is null and split_part(i.r2_object_key, '/', 1) <> public.era_slug_for_year(e.year)) x;
  v_out := v_out || jsonb_build_object('key', 'image_folder', 'warning', true, 'count', v_count, 'sample', v_sample);

  -- 3. Published but missing a translation.
  select count(*), coalesce(jsonb_agg(to_jsonb(x) - 'rn') filter (where x.rn <= 10), '[]'::jsonb) into v_count, v_sample from (
    select e.slug, (select string_agg(l.code, ',') from public.locale l where not exists (
      select 1 from public.event_translation t where t.event_id = e.id and t.locale_code = l.code)) as missing,
      row_number() over (order by e.slug) as rn
    from public.event e
    where e.status = 'published' and exists (select 1 from public.locale l where not exists (
      select 1 from public.event_translation t where t.event_id = e.id and t.locale_code = l.code))) x;
  v_out := v_out || jsonb_build_object('key', 'missing_translation', 'warning', true, 'count', v_count, 'sample', v_sample);

  -- 4. More than one primary image (the unique index forbids it; checked anyway).
  select count(*), coalesce(jsonb_agg(to_jsonb(x) - 'rn') filter (where x.rn <= 10), '[]'::jsonb) into v_count, v_sample from (
    select e.slug, count(*) as primaries, row_number() over (order by e.slug) as rn
    from public.event e join public.image i on i.event_id = e.id and i.is_primary
    group by e.id, e.slug having count(*) > 1) x;
  v_out := v_out || jsonb_build_object('key', 'multiple_primary', 'warning', true, 'count', v_count, 'sample', v_sample);

  -- 5. Year outside the category's timeline.
  select count(*), coalesce(jsonb_agg(to_jsonb(x) - 'rn') filter (where x.rn <= 10), '[]'::jsonb) into v_count, v_sample from (
    select e.slug, e.year, g.slug as topic, row_number() over (order by e.slug) as rn
    from public.event e
    join public.event_category ec on ec.event_id = e.id
    join public.game_category g on g.category_id = ec.category_id
    cross join lateral public.panes_year_bounds(g.panes) b
    where e.year not between b.min_year and b.max_year) x;
  v_out := v_out || jsonb_build_object('key', 'out_of_timeline', 'warning', true, 'count', v_count, 'sample', v_sample);

  -- 6. Re-seed duplicates (CLAUDE.md: the *-2 slugs).
  select count(*), coalesce(jsonb_agg(to_jsonb(x) - 'rn') filter (where x.rn <= 10), '[]'::jsonb) into v_count, v_sample from (
    select e.slug, row_number() over (order by e.slug) as rn from public.event e
    where e.slug ~ '-2$' and exists (select 1 from public.event o where o.slug = regexp_replace(e.slug, '-2$', ''))) x;
  v_out := v_out || jsonb_build_object('key', 'duplicate_slug', 'warning', true, 'count', v_count, 'sample', v_sample);

  -- 7. Ended matches the sweep has not removed (versus_sweep's own 12h rule).
  select count(*) into v_count from public.match
  where phase in ('complete', 'abandoned') and updated_at < now() - interval '12 hours';
  v_out := v_out || jsonb_build_object('key', 'unswept_matches', 'warning', v_count > 0, 'count', v_count, 'sample', '[]'::jsonb);

  -- 8. Migration ledger: the newest applied file (compared with the repo by hand).
  begin
    execute 'select max(version) from internal.schema_migrations' into v_last;
  exception when others then
    v_last := null;
  end;
  v_out := v_out || jsonb_build_object('key', 'migration_ledger', 'warning', false, 'count', 0,
    'sample', jsonb_build_array(jsonb_build_object('lastVersion', v_last)));

  -- 9. Throttle table size (informational; pruned at 30 days).
  select count(*) into v_count from public.admin_login_attempt;
  v_out := v_out || jsonb_build_object('key', 'login_attempts', 'warning', false, 'count', v_count, 'sample', '[]'::jsonb);

  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- §6.11 Audit log
-- ---------------------------------------------------------------------------
create or replace function public.admin_audit_list(p_filters jsonb, p_page integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with f as (
    select nullif(p_filters ->> 'action', '') as action,
      nullif(p_filters ->> 'table', '') as tbl,
      nullif(p_filters ->> 'target', '') as target,
      nullif(p_filters ->> 'from', '')::timestamptz as since,
      nullif(p_filters ->> 'to', '')::timestamptz as until,
      greatest(coalesce(p_page, 1), 1) as page
  ),
  rows as (
    select a.* from public.admin_audit a, f
    where (f.action is null or a.action = f.action)
      and (f.tbl is null or a.target_table = f.tbl)
      and (f.target is null or a.target_id = f.target)
      and (f.since is null or a.created_at >= f.since)
      and (f.until is null or a.created_at < f.until)
  )
  select jsonb_build_object(
    'total', (select count(*) from rows),
    'page', (select page from f),
    'pageSize', 50,
    'actions', coalesce((select jsonb_agg(distinct action) from public.admin_audit), '[]'::jsonb),
    'rows', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select r.id, r.actor_id as "actorId", r.action, r.target_table as "targetTable", r.target_id as "targetId",
        r.note, r.created_at as "createdAt"
      from rows r order by r.created_at desc, r.id desc
      limit 50 offset (select (page - 1) * 50 from f)) x), '[]'::jsonb)
  );
$$;

create or replace function public.admin_audit_entry(p_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', a.id, 'actorId', a.actor_id, 'action', a.action, 'targetTable', a.target_table,
    'targetId', a.target_id, 'before', a.before, 'after', a.after, 'note', a.note, 'createdAt', a.created_at,
    'undoneBy', (select u.id from public.admin_audit u where u.note = 'geri alındı: #' || a.id limit 1))
  from public.admin_audit a where a.id = p_id;
$$;

-- ---------------------------------------------------------------------------
-- §6.1 Dashboard
-- ---------------------------------------------------------------------------
create or replace function public.admin_dashboard()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with topic as (
    select e.id, e.status, public.event_topic_slug(e.id) as topic,
      exists (select 1 from public.image i where i.event_id = e.id and i.is_primary) as has_image
    from public.event e
  ),
  stats as (select * from public.event_challenge_stats)
  select jsonb_build_object(
    'openChallenges', (select count(*) from stats where total_votes > 0),
    'challengesLast24h', (select count(*) from public.event_date_challenge where created_at > now() - interval '24 hours'),
    'topChallenged', coalesce((
      select jsonb_agg(x) from (
        select s.event_id as "eventId", public.admin_event_name(s.event_id) as name,
          s.total_votes as total, s.later_votes as later, s.earlier_votes as earlier
        from stats s where s.total_votes > 0
        order by s.total_votes desc, s.last_challenged_at desc limit 5) x), '[]'::jsonb),
    'eventsByTopicStatus', coalesce((
      select jsonb_agg(x) from (
        select coalesce(topic, 'history') as topic, status::text as status, count(*) as n
        from topic group by 1, 2 order by 1, 2) x), '[]'::jsonb),
    'hiddenByTopic', coalesce((
      select jsonb_agg(x) from (
        select coalesce(topic, 'history') as topic, count(*) as n
        from topic where not has_image group by 1 order by 1) x), '[]'::jsonb),
    'missingDescriptions', coalesce((
      select jsonb_agg(x) from (
        select l.code as locale, (
          select count(*) from public.event e
          where not exists (select 1 from public.event_translation t
            where t.event_id = e.id and t.locale_code = l.code and nullif(btrim(t.description), '') is not null)
        ) as n
        from public.locale l order by l.code) x), '[]'::jsonb),
    'today', jsonb_build_object(
      'signups', (select count(*) from auth.users where created_at >= public.admin_utc_today()),
      'setsStarted', (select count(*) from public.solo_set where created_at >= public.admin_utc_today()),
      'matches', (select count(*) from public.match where created_at >= public.admin_utc_today()),
      'stuckMatches', (select count(*) from public.match
        where phase in ('lobby', 'playing', 'revealed') and updated_at < now() - interval '30 minutes')
    ),
    'healthWarnings', (select coalesce(sum((c ->> 'count')::int), 0)
      from jsonb_array_elements(public.admin_health_checks()) c
      where (c ->> 'warning')::boolean)
  );
$$;

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        'admin_user_list', 'admin_user_detail', 'admin_suspicious_users', 'admin_rename_user',
        'admin_clear_avatar', 'admin_set_hidden_from_boards', 'admin_adjust_score', 'admin_user_delete_preview',
        'admin_versus_overview', 'admin_abandon_match', 'admin_daily_overview', 'admin_reroll_daily',
        'admin_health_checks', 'admin_audit_list', 'admin_audit_entry', 'admin_dashboard')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
