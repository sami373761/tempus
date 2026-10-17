-- ---------------------------------------------------------------------------
-- The Chrono Rating board: players ranked by KP, the online ladder.
--
-- A separate function from `public.leaderboard()` rather than a mode of it.
-- TP is a sum over a ledger, so it has periods; a rating is a level, read off
-- `profile.chrono_rating`, and "this week's rating" means nothing. Sharing one
-- signature would mean a period argument the rating board has to ignore.
--
-- Only accounts that have settled at least one public match are on it. Every
-- profile starts at 0 KP, so ranking all of them would fill the bottom of the
-- board with people who have never played online, tied at zero.
--
-- Bots never appear: they are seats, not accounts (`match_player.user_id` is
-- null for them), so they have no profile and no ledger rows. That is also why
-- nothing here needs to name `bot_level`.
-- ---------------------------------------------------------------------------

create or replace function public.chrono_leaderboard(p_limit integer default 50)
returns table (
  rank bigint,
  username text,
  badge_slug text,
  avatar_key text,
  rating integer,
  wins bigint,
  matches bigint
)
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
  order by p.chrono_rating desc, p.username
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

comment on function public.chrono_leaderboard(integer) is
  'Players with at least one settled public match, ranked by Chrono Rating. '
  'Names, pictures and numbers only.';

-- Where one player stands on that board, for the "you" line under it. Service
-- role only: it takes an account id.
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

revoke all on function public.chrono_leaderboard_position(uuid) from public, anon, authenticated;

revoke all on function public.chrono_leaderboard(integer) from public, anon, authenticated;
grant execute on function public.chrono_leaderboard(integer) to anon, authenticated;
