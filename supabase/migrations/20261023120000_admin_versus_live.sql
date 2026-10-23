-- ============================================================================
-- TEMPUS — admin panel: "live matches" means matches being played.
--
-- admin_versus_overview() listed every match not yet ended as live, so a
-- friend room nobody joined sat in the table with an "end match" button for
-- up to 12 hours, until versus_sweep() removed it. Nothing ends a lobby on its
-- own — versus_reconcile() only runs when a client calls — so the stored phase
-- cannot tell a room being waited in from one that was closed an hour ago.
-- `updated_at` can: the bookkeeping trigger stamps it on every write, and a
-- match being played writes at least once a round.
--
--   live    — playing/revealed, written in the last 10 minutes. A round plus
--             its reveal is well under a minute, so 10 is generous.
--   waiting — lobby, opened in the last 30 minutes. A friend room is not
--             written while it waits, so this is its age, not a heartbeat.
--   stale   — everything else not ended. These are what the button is for;
--             `stuck` counts them.
-- ============================================================================

create or replace function public.admin_versus_overview()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with open_match as (
    select m.*, (select max(last_seen_at) from public.match_player mp where mp.match_id = m.id) as last_seen,
      exists (select 1 from public.match_player mp where mp.match_id = m.id and mp.bot_level is not null) as has_bot,
      case
        when m.phase in ('playing', 'revealed') and m.updated_at > now() - interval '10 minutes' then 'live'
        when m.phase = 'lobby' and m.updated_at > now() - interval '30 minutes' then 'waiting'
        else 'stale'
      end as state
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
  ),
  listed as (
    select state, id, phase, current_idx as "currentIdx", total_rounds as "totalRounds", is_public as "isPublic",
      has_bot as "hasBot", seat2_joined as "opponentJoined", last_seen as "lastSeen",
      created_at as "createdAt", updated_at as "updatedAt"
    from open_match
  )
  select jsonb_build_object(
    'live', coalesce((select jsonb_agg(to_jsonb(x) - 'state' order by x."updatedAt" desc)
      from (select * from listed where state = 'live' limit 200) x), '[]'::jsonb),
    'waiting', coalesce((select jsonb_agg(to_jsonb(x) - 'state' order by x."createdAt" desc)
      from (select * from listed where state = 'waiting' limit 200) x), '[]'::jsonb),
    'stale', coalesce((select jsonb_agg(to_jsonb(x) - 'state' order by x."updatedAt")
      from (select * from listed where state = 'stale' limit 200) x), '[]'::jsonb),
    'stuck', (select count(*) from open_match where state = 'stale'),
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

revoke execute on function public.admin_versus_overview() from public, anon, authenticated;
grant execute on function public.admin_versus_overview() to service_role;
