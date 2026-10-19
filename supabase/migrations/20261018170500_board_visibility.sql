-- ============================================================================
-- TEMPUS — hiding accounts from the public boards
--
-- Two reasons an account leaves the leaderboards: an admin marked it hidden
-- (test and admin accounts), or it is currently banned in Supabase Auth
-- (auth.users.banned_until in the future). Neither touches the account's
-- points — the ledger stays whole and the account reappears the moment the
-- flag is cleared or the ban runs out.
--
-- The four board functions are recreated unchanged except for the visibility
-- join. board_visible() is the one definition of "shown"; it reads auth.users,
-- which only a security-definer function can.
-- ============================================================================

alter table public.profile add column is_hidden_from_boards boolean not null default false;

comment on column public.profile.is_hidden_from_boards is
  'Admin-set. Hidden accounts keep their TP/KP but are left off every leaderboard.';

create or replace function public.board_visible(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profile p
    join auth.users u on u.id = p.id
    where p.id = p_user_id
      and not p.is_hidden_from_boards
      and (u.banned_until is null or u.banned_until <= now())
  );
$$;

revoke execute on function public.board_visible(uuid) from public, anon, authenticated;
grant execute on function public.board_visible(uuid) to service_role;

create or replace function public.leaderboard(
  p_since timestamptz default null,
  p_limit integer default 50
)
returns table (rank bigint, username text, badge_slug text, avatar_key text, tp bigint, perfects bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with totals as (
    select e.user_id, sum(e.tp)::bigint as tp
    from public.score_entry e
    where p_since is null or e.created_at >= p_since
    group by e.user_id
  ),
  solo_perfects as (
    select a.user_id, count(*)::bigint as n
    from public.solo_answer a
    where a.verdict = 'perfect'
      and a.game not in ('compare', 'survival')
      and (p_since is null or a.answered_at >= p_since)
    group by a.user_id
  ),
  daily_perfects as (
    select d.user_id, count(*)::bigint as n
    from public.daily_attempt d
    cross join lateral jsonb_array_elements(d.answers) as answer
    where answer ->> 'verdict' = 'perfect'
      and (p_since is null or d.puzzle_date >= (p_since at time zone 'UTC')::date)
    group by d.user_id
  )
  select
    rank() over (order by t.tp desc) as rank,
    p.username,
    public.shown_badge(t.user_id) as badge_slug,
    p.avatar_key,
    t.tp,
    coalesce(s.n, 0) + coalesce(d.n, 0) as perfects
  from totals t
  join public.profile p on p.id = t.user_id and p.username is not null
  left join solo_perfects s on s.user_id = t.user_id
  left join daily_perfects d on d.user_id = t.user_id
  where public.board_visible(t.user_id)
  order by t.tp desc, p.username
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

create or replace function public.leaderboard_position(
  p_user_id uuid,
  p_since timestamptz default null
)
returns table (rank bigint, tp bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with totals as (
    select e.user_id, sum(e.tp)::bigint as tp
    from public.score_entry e
    join public.profile p on p.id = e.user_id and p.username is not null
    where (p_since is null or e.created_at >= p_since)
      and public.board_visible(e.user_id)
    group by e.user_id
  ),
  mine as (select tp from totals where user_id = p_user_id)
  select
    (select count(*) from totals where totals.tp > mine.tp) + 1,
    mine.tp
  from mine;
$$;

create or replace function public.chrono_leaderboard(p_limit integer default 50)
returns table (rank bigint, username text, badge_slug text, avatar_key text, rating integer, wins bigint, matches bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with played as (
    select
      e.user_id,
      count(*) filter (where e.outcome = 'win')::bigint as wins,
      count(*)::bigint as matches
    from public.chrono_rating_entry e
    group by e.user_id
  )
  select
    rank() over (order by p.chrono_rating desc) as rank,
    p.username,
    public.shown_badge(p.id) as badge_slug,
    p.avatar_key,
    p.chrono_rating as rating,
    g.wins,
    g.matches
  from played g
  join public.profile p on p.id = g.user_id and p.username is not null
  where public.board_visible(g.user_id)
  order by p.chrono_rating desc, p.username
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

create or replace function public.chrono_leaderboard_position(p_user_id uuid)
returns table (rank bigint, rating integer)
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select p.id, p.chrono_rating
    from public.profile p
    where p.username is not null
      and public.board_visible(p.id)
      and exists (
        select 1 from public.chrono_rating_entry e where e.user_id = p.id
      )
  ),
  mine as (select chrono_rating from ranked where id = p_user_id)
  select
    (select count(*) from ranked where ranked.chrono_rating > mine.chrono_rating) + 1,
    mine.chrono_rating
  from mine;
$$;
