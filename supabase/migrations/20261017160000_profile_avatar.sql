-- ============================================================================
-- TEMPUS — profile pictures
--
-- A player may upload one picture. The bytes live in R2 under
-- `user_profile_pictures/`; Postgres keeps only the object key, like
-- `public.image` does for event photos. Null is "no picture": the site draws
-- `/default-profile-picture.jpg` instead.
--
-- **Service role only.** The column is deliberately left out of the
-- `update (username)` grant on `profile`: the key must be one the upload
-- action wrote after re-encoding the file (app/actions/avatar.ts), and a
-- client able to set it could point their row at any object in the bucket.
-- The check pins the shape the action writes — a random name, never the
-- account id, because the leaderboard is public and never hands out ids.
-- ============================================================================

alter table public.profile
  add column avatar_key text
    check (
      avatar_key is null
      or avatar_key ~ '^user_profile_pictures/[0-9a-f]{32}\.webp$'
    );

comment on column public.profile.avatar_key is
  'R2 key of the player''s profile picture (256px WebP), or null for the '
  'default. Written by the service role only.';

-- ---------------------------------------------------------------------------
-- The leaderboard draws each player's picture, so it returns the key too.
-- A changed result row means drop and recreate — `create or replace` cannot
-- alter a function's OUT columns — so the grants are restated below. The body
-- is otherwise the one from 20261017120000_scoring.sql.
-- ---------------------------------------------------------------------------
drop function public.leaderboard(timestamptz, integer);

create function public.leaderboard(
  p_since timestamptz default null,
  p_limit integer default 50
)
returns table (
  rank bigint,
  username text,
  badge_slug text,
  avatar_key text,
  tp bigint,
  perfects bigint
)
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
      and a.game in ('history', 'football', 'basketball', 'screen', 'when-born')
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
  order by t.tp desc, p.username
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

comment on function public.leaderboard(timestamptz, integer) is
  'Players ranked by TP since p_since (null: all time). Names, pictures and '
  'sums only.';

revoke all on function public.leaderboard(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.leaderboard(timestamptz, integer) to anon, authenticated;
