-- ============================================================================
-- TEMPUS — Tempus Points, the badge ladder and the leaderboard
--
-- The first durable score for every game, not just the daily. Four tables and
-- the functions that are their only way in.
--
--   score_entry   the TP ledger: one row per payout, append-only
--   solo_set      one set of ten (or one survival run) a member has played
--   solo_answer   one graded round inside a set
--   profile.worn_badge  the badge a player has chosen to show
--
-- **Every payout is a ledger row with an idempotency key.** `(user_id,
-- source)` is unique, and `source` names the thing that paid — a round, a
-- finished set, a day of the daily, a match generation — so a retried request,
-- a re-fired trigger or a second tab can never pay twice. The leaderboard is a
-- sum over this table and nothing else, which is what makes "all time" and
-- "this week" the same query with a different lower bound.
--
-- **Rounds are graded in TypeScript, sets are closed here.** `gradeGuess` is
-- the only grader on the site (CLAUDE.md), so the verdict and its TP arrive
-- already decided — from the service role, behind an action that read the
-- year itself. What only the database can decide safely is whether a set is
-- now finished, because two requests for the same set could otherwise both
-- think they were the tenth. `bank_solo_round` takes the set row's lock and
-- decides that, and pays the set's bonuses in the same transaction.
--
-- **The daily and the head-to-head bank themselves**, by triggers on the rows
-- they already write. Neither needed a new write path, and a trigger cannot be
-- forgotten by a future code path that records an answer.
--
-- **The bonus amounts are mirrored in lib/game/points.ts** for display. Change
-- one, change the other.
--
-- Every table here is written only by the service role (CLAUDE.md, "Rule for
-- new client-writable tables": a player who could write a score row could
-- award themselves any score). RLS on, defaults revoked, no grants.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The ledger.
-- ---------------------------------------------------------------------------
create table public.score_entry (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Which game paid. Text with a check rather than an enum, so the list is
  -- one constraint to replace rather than a type to migrate around.
  game text not null check (game in (
    'history', 'football', 'basketball', 'screen', 'when-born',
    'compare', 'survival', 'daily', 'versus'
  )),

  -- What kind of payout. `round` is a graded answer; the rest are bonuses.
  kind text not null check (kind in (
    'round', 'set', 'flawless', 'streak', 'daily-streak', 'versus'
  )),

  -- The idempotency key: what paid, spelled so that paying it twice collides.
  source text not null,

  tp integer not null check (tp > 0),

  -- The other account in a head-to-head payout, so the per-pair daily cap can
  -- be counted. Null for everything else.
  opponent_id uuid references auth.users (id) on delete set null,

  created_at timestamptz not null default now(),

  unique (user_id, source)
);

comment on table public.score_entry is
  'The TP ledger. One row per payout; (user_id, source) makes every payout '
  'idempotent. The leaderboard is a sum over this table. Service role only.';

create index score_entry_created_idx on public.score_entry (created_at);
create index score_entry_user_idx on public.score_entry (user_id, created_at);
create index score_entry_versus_pair_idx
  on public.score_entry (user_id, opponent_id, created_at)
  where kind = 'versus';

-- ---------------------------------------------------------------------------
-- Sets and runs.
--
-- The id is chosen by the client (a random UUID per set), and the row is
-- created by the first round banked into it. That is safe because the id
-- buys nothing: a set's owner and game are fixed by that first round and
-- checked on every one after it, and a round can be banked into exactly one
-- set (`solo_answer`'s primary key). A client that invents a new id every
-- round simply never finishes a set and never earns a set bonus.
-- ---------------------------------------------------------------------------
create table public.solo_set (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  game text not null check (game in (
    'history', 'football', 'basketball', 'screen', 'when-born',
    'compare', 'survival'
  )),
  -- A set is a fixed number of questions; a run is however many the player
  -- gets right, plus the one they do not.
  kind text not null check (kind in ('set', 'run')),

  answered integer not null default 0,
  -- Right answers: for a date game anything above "way off", for the
  -- comparison games the right half. For a run this is its length.
  correct integer not null default 0,
  perfects integer not null default 0,
  -- Great or Perfect. A date-game set where this equals the set's size is the
  -- "flawless" bonus and the Amethyst quest.
  top_tier integer not null default 0,
  tp integer not null default 0,

  created_at timestamptz not null default now(),
  closed_at timestamptz
);

comment on table public.solo_set is
  'One set of ten (or one survival run) a member played. Created by its first '
  'banked round, closed by bank_solo_round. Service role only.';

create index solo_set_user_idx on public.solo_set (user_id, game);

create table public.solo_answer (
  -- The id inside the signed round token (lib/game/round-token.ts). Primary
  -- key, so a token can be banked once, into one set, ever.
  round_id uuid primary key,
  set_id uuid not null references public.solo_set (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  game text not null,
  event_id uuid not null references public.event (id) on delete cascade,
  verdict text not null,
  correct boolean not null,
  tp integer not null check (tp >= 0),
  answered_at timestamptz not null default now()
);

comment on table public.solo_answer is
  'One graded round inside a solo set. Service role only.';

create index solo_answer_user_idx on public.solo_answer (user_id, game, verdict);
create index solo_answer_answered_idx on public.solo_answer (answered_at);

-- ---------------------------------------------------------------------------
-- Bank one solo round.
--
-- Returns a jsonb status rather than raising, because every refusal here is a
-- state the client can be told about rather than an error:
--
--   banked     paid, and here is the set as it now stands
--   duplicate  this round was already banked; here is what it paid
--   foreign    the set id belongs to someone else or another game
--   closed     the set is finished (ten answered, or the run has ended)
-- ---------------------------------------------------------------------------
create or replace function public.bank_solo_round(
  p_user_id uuid,
  p_set_id uuid,
  p_game text,
  p_round_id uuid,
  p_event_id uuid,
  p_verdict text,
  p_correct boolean,
  p_tp integer,
  p_set_size integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text := case when p_game = 'survival' then 'run' else 'set' end;
  v_set public.solo_set;
  v_existing public.solo_answer;
  v_bonus integer := 0;
  v_closed boolean := false;
  v_top boolean := p_verdict in ('perfect', 'great');
  v_date_game boolean := p_game in ('history', 'football', 'basketball', 'screen', 'when-born');
begin
  if p_tp < 0 or p_set_size < 1 then
    raise exception 'bank_solo_round: bad arguments';
  end if;

  insert into public.solo_set (id, user_id, game, kind)
  values (p_set_id, p_user_id, p_game, v_kind)
  on conflict (id) do nothing;

  select * into v_set from public.solo_set where id = p_set_id for update;

  if v_set.user_id <> p_user_id or v_set.game <> p_game then
    return jsonb_build_object('status', 'foreign');
  end if;

  select * into v_existing from public.solo_answer where round_id = p_round_id;
  if found then
    return jsonb_build_object(
      'status', 'duplicate',
      'tp', v_existing.tp,
      'bonus', 0,
      'set', jsonb_build_object(
        'answered', v_set.answered, 'tp', v_set.tp,
        'closed', v_set.closed_at is not null)
    );
  end if;

  if v_set.closed_at is not null
     or (v_kind = 'set' and v_set.answered >= p_set_size) then
    return jsonb_build_object('status', 'closed');
  end if;

  insert into public.solo_answer
    (round_id, set_id, user_id, game, event_id, verdict, correct, tp)
  values
    (p_round_id, p_set_id, p_user_id, p_game, p_event_id, p_verdict, p_correct, p_tp);

  if p_tp > 0 then
    insert into public.score_entry (user_id, game, kind, source, tp)
    values (p_user_id, p_game, 'round', 'round:' || p_round_id, p_tp)
    on conflict (user_id, source) do nothing;
  end if;

  update public.solo_set s set
    answered = s.answered + 1,
    correct = s.correct + case when p_correct then 1 else 0 end,
    perfects = s.perfects + case when p_verdict = 'perfect' then 1 else 0 end,
    top_tier = s.top_tier + case when v_top then 1 else 0 end,
    tp = s.tp + p_tp
  where s.id = p_set_id
  returning * into v_set;

  if v_kind = 'set' then
    if v_set.answered >= p_set_size then
      v_closed := true;

      -- Finishing a set. SET_COMPLETE_TP in lib/game/points.ts.
      insert into public.score_entry (user_id, game, kind, source, tp)
      values (p_user_id, p_game, 'set', 'set:' || p_set_id, 5)
      on conflict (user_id, source) do nothing;
      v_bonus := v_bonus + 5;

      -- Every answer Great or Perfect. SET_FLAWLESS_TP.
      if v_date_game and v_set.top_tier >= p_set_size then
        insert into public.score_entry (user_id, game, kind, source, tp)
        values (p_user_id, p_game, 'flawless', 'flawless:' || p_set_id, 20)
        on conflict (user_id, source) do nothing;
        v_bonus := v_bonus + 20;
      end if;
    end if;
  else
    if not p_correct then
      v_closed := true;
    else
      -- Survival milestones. SURVIVAL_MILESTONES.
      if v_set.correct in (10, 25, 50) then
        insert into public.score_entry (user_id, game, kind, source, tp)
        values (
          p_user_id, p_game, 'streak',
          'streak:' || p_set_id || ':' || v_set.correct,
          case v_set.correct when 10 then 10 when 25 then 30 else 75 end
        )
        on conflict (user_id, source) do nothing;
        v_bonus := v_bonus + case v_set.correct when 10 then 10 when 25 then 30 else 75 end;
      end if;
    end if;
  end if;

  if v_closed then
    update public.solo_set set closed_at = now(), tp = tp + v_bonus
    where id = p_set_id
    returning * into v_set;
  elsif v_bonus > 0 then
    update public.solo_set set tp = tp + v_bonus
    where id = p_set_id
    returning * into v_set;
  end if;

  return jsonb_build_object(
    'status', 'banked',
    'tp', p_tp,
    'bonus', v_bonus,
    'set', jsonb_build_object(
      'answered', v_set.answered, 'tp', v_set.tp,
      'closed', v_set.closed_at is not null)
  );
end;
$$;

comment on function public.bank_solo_round is
  'Banks one graded solo round into its set, paying the round and any set or '
  'streak bonus it completes. Idempotent on the round id.';

-- ---------------------------------------------------------------------------
-- The daily banks itself.
--
-- `daily_record_answer` appends one answer at a time, with its points already
-- multiplied (`dailyRoundPoints` in lib/game/daily.ts), so the newest element
-- of `answers` is the payout. A finished day also checks the streak: every
-- seventh consecutive finished day pays DAILY_STREAK_TP.
-- ---------------------------------------------------------------------------
create or replace function public.daily_bank_tp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last jsonb;
  v_points integer;
  v_streak integer := 1;
begin
  if jsonb_array_length(new.answers) > jsonb_array_length(old.answers) then
    v_last := new.answers -> (jsonb_array_length(new.answers) - 1);
    v_points := coalesce((v_last ->> 'points')::integer, 0);

    if v_points > 0 then
      insert into public.score_entry (user_id, game, kind, source, tp)
      values (
        new.user_id, 'daily', 'round',
        'daily:' || new.puzzle_date || ':' || (v_last ->> 'idx'),
        v_points
      )
      on conflict (user_id, source) do nothing;
    end if;
  end if;

  if new.completed_at is not null and old.completed_at is null then
    loop
      exit when not exists (
        select 1 from public.daily_attempt a
        where a.user_id = new.user_id
          and a.puzzle_date = new.puzzle_date - v_streak
          and a.completed_at is not null
      );
      v_streak := v_streak + 1;
    end loop;

    -- DAILY_STREAK_DAYS / DAILY_STREAK_TP.
    if v_streak % 7 = 0 then
      insert into public.score_entry (user_id, game, kind, source, tp)
      values (new.user_id, 'daily', 'daily-streak',
              'daily-streak:' || new.puzzle_date, 50)
      on conflict (user_id, source) do nothing;
    end if;
  end if;

  return new;
end;
$$;

create trigger daily_attempt_bank_tp
  after update on public.daily_attempt
  for each row execute function public.daily_bank_tp();

-- ---------------------------------------------------------------------------
-- The head-to-head banks itself.
--
-- A seat had no owner until now — it is a bearer token, and the game is
-- playable signed out. The column records which account (if any) took the
-- seat, set by the create and join actions from the session. A match pays
-- only when both seats are accounts and they are *different* accounts, so a
-- player cannot farm wins against themselves in a second tab; and a pair pays
-- at most VERSUS_DAILY_PAIR_CAP matches a day, so two friends cannot farm each
-- other either.
-- ---------------------------------------------------------------------------
alter table public.match_player
  add column user_id uuid references auth.users (id) on delete set null;

comment on column public.match_player.user_id is
  'The account that took this seat, if it was signed in. Private, like the '
  'rest of this table. Read only by the TP trigger.';

create or replace function public.versus_bank_tp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u1 uuid;
  v_u2 uuid;
  v_paid integer;
  v_tp1 integer;
  v_tp2 integer;
  v_source text := 'versus:' || new.id || ':' || new.generation;
begin
  select user_id into v_u1 from public.match_player where match_id = new.id and seat = 1;
  select user_id into v_u2 from public.match_player where match_id = new.id and seat = 2;

  if v_u1 is null or v_u2 is null or v_u1 = v_u2 then
    return new;
  end if;

  select count(*) into v_paid
  from public.score_entry
  where user_id = v_u1
    and opponent_id = v_u2
    and kind = 'versus'
    and created_at >= date_trunc('day', now(), 'UTC');

  -- VERSUS_DAILY_PAIR_CAP.
  if v_paid >= 3 then
    return new;
  end if;

  -- VERSUS_TP: win 30, draw 10, loss 5.
  if new.seat1_score > new.seat2_score then
    v_tp1 := 30; v_tp2 := 5;
  elsif new.seat1_score < new.seat2_score then
    v_tp1 := 5; v_tp2 := 30;
  else
    v_tp1 := 10; v_tp2 := 10;
  end if;

  insert into public.score_entry (user_id, game, kind, source, tp, opponent_id)
  values
    (v_u1, 'versus', 'versus', v_source, v_tp1, v_u2),
    (v_u2, 'versus', 'versus', v_source, v_tp2, v_u1)
  on conflict (user_id, source) do nothing;

  return new;
end;
$$;

create trigger match_bank_tp
  after update of phase on public.match
  for each row
  when (new.phase = 'complete' and old.phase is distinct from 'complete')
  execute function public.versus_bank_tp();

-- ---------------------------------------------------------------------------
-- Everything a badge rule reads, in one call. Shaped as `PlayerStats` in
-- lib/game/badge-rules.ts.
-- ---------------------------------------------------------------------------
create or replace function public.player_stats(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with perfect_rounds as (
    select game, count(*)::integer as n
    from public.solo_answer
    where user_id = p_user_id
      and verdict = 'perfect'
      and game in ('history', 'football', 'basketball', 'screen', 'when-born')
    group by game
  ),
  daily_perfects as (
    select count(*)::integer as n
    from public.daily_attempt a
    cross join lateral jsonb_array_elements(a.answers) as answer
    where a.user_id = p_user_id and answer ->> 'verdict' = 'perfect'
  ),
  daily_runs as (
    select count(*)::integer as n
    from (
      select puzzle_date - (row_number() over (order by puzzle_date))::integer as island
      from public.daily_attempt
      where user_id = p_user_id and completed_at is not null
    ) days
    group by island
  )
  select jsonb_build_object(
    'tp', coalesce((select sum(tp) from public.score_entry where user_id = p_user_id), 0),
    'perfects', jsonb_build_object(
      'history',
        coalesce((select n from perfect_rounds where game = 'history'), 0)
        + coalesce((select n from daily_perfects), 0),
      'football', coalesce((select n from perfect_rounds where game = 'football'), 0),
      'basketball', coalesce((select n from perfect_rounds where game = 'basketball'), 0),
      'screen', coalesce((select n from perfect_rounds where game = 'screen'), 0),
      'when-born', coalesce((select n from perfect_rounds where game = 'when-born'), 0)
    ),
    'bestSurvival', coalesce((
      select max(correct) from public.solo_set
      where user_id = p_user_id and kind = 'run'), 0),
    'bestHistorySetPerfects', coalesce((
      select max(perfects) from public.solo_set
      where user_id = p_user_id and game = 'history' and kind = 'set'), 0),
    'compareFlawlessSets', (
      select count(*) from public.solo_set
      where user_id = p_user_id and game = 'compare'
        and closed_at is not null and correct = answered),
    'topTierSets', (
      select count(*) from public.solo_set
      where user_id = p_user_id and kind = 'set' and closed_at is not null
        and game in ('history', 'football', 'basketball', 'screen', 'when-born')
        and top_tier = answered),
    'bestDailyStreak', coalesce((select max(n) from daily_runs), 0)
  );
$$;

comment on function public.player_stats(uuid) is
  'Every number a badge rule reads, as lib/game/badge-rules.ts PlayerStats.';

-- ---------------------------------------------------------------------------
-- The ladder: six rungs, thresholds in TP.
--
-- Ruby and Amethyst join the ladder (they stood outside it as one-off feats),
-- and every `default_target` becomes the rung's TP threshold, which is what a
-- progress row counts towards. The quests are in lib/game/badge-rules.ts and
-- their progress in `details`.
-- ---------------------------------------------------------------------------
update public.badge set is_rank = true where slug in ('ruby', 'amethyst');
update public.badge set default_target = case slug
  when 'bronze' then 10
  when 'silver' then 100
  when 'gold' then 1000
  when 'diamond' then 3000
  when 'ruby' then 10000
  when 'amethyst' then 30000
end;

-- The old rules counted different things (hits in a set, duels won); nothing
-- was ever awarded under them, so any row is stale progress and is cleared
-- rather than migrated.
delete from public.user_badge_progress where unlocked_at is null;

-- ---------------------------------------------------------------------------
-- The badge a player wears.
--
-- Null means "my highest", which is also what an unearned choice falls back
-- to on read. Written only by the service role, after the action has checked
-- the badge is earned; the column grant on profile stays `username` alone.
-- ---------------------------------------------------------------------------
alter table public.profile
  add column worn_badge text references public.badge (slug) on update cascade;

comment on column public.profile.worn_badge is
  'The badge this player shows beside their name. Null: their highest earned. '
  'Set by the service role only, and only to an earned badge.';

-- The badge a player shows: their choice if they have earned it, otherwise
-- their highest earned rung, otherwise none.
create or replace function public.shown_badge(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.worn_badge
     from public.profile p
     join public.user_badge_progress u
       on u.user_id = p.id and u.badge_slug = p.worn_badge and u.unlocked_at is not null
     where p.id = p_user_id),
    (select u.badge_slug
     from public.user_badge_progress u
     join public.badge b on b.slug = u.badge_slug
     where u.user_id = p_user_id and u.unlocked_at is not null
     order by b.sort_order desc
     limit 1)
  );
$$;

-- ---------------------------------------------------------------------------
-- The leaderboard.
--
-- Public on purpose — a leaderboard is read before deciding to join — so it is
-- the one function here granted to `anon`. It hands back names, badges and
-- sums, never an account id. `p_since` null is all time; the weekly board
-- passes the start of the UTC week.
-- ---------------------------------------------------------------------------
create or replace function public.leaderboard(
  p_since timestamptz default null,
  p_limit integer default 50
)
returns table (
  rank bigint,
  username text,
  badge_slug text,
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
  'Players ranked by TP since p_since (null: all time). Names and sums only.';

-- Where one player stands, for the "you" row under the board. Service role
-- only: it takes an account id.
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
    where p_since is null or e.created_at >= p_since
    group by e.user_id
  ),
  mine as (select tp from totals where user_id = p_user_id)
  select
    (select count(*) from totals where totals.tp > mine.tp) + 1,
    mine.tp
  from mine;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security and grants.
-- ---------------------------------------------------------------------------
alter table public.score_entry enable row level security;
alter table public.solo_set enable row level security;
alter table public.solo_answer enable row level security;

revoke all on public.score_entry from anon, authenticated;
revoke all on public.solo_set from anon, authenticated;
revoke all on public.solo_answer from anon, authenticated;

revoke all on function public.bank_solo_round(uuid, uuid, text, uuid, uuid, text, boolean, integer, integer)
  from public, anon, authenticated;
revoke all on function public.player_stats(uuid) from public, anon, authenticated;
revoke all on function public.shown_badge(uuid) from public, anon, authenticated;
revoke all on function public.leaderboard_position(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.daily_bank_tp() from public, anon, authenticated;
revoke all on function public.versus_bank_tp() from public, anon, authenticated;

revoke all on function public.leaderboard(timestamptz, integer) from public;
grant execute on function public.leaderboard(timestamptz, integer) to anon, authenticated;
