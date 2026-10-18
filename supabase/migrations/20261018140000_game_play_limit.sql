-- ============================================================================
-- TEMPUS — three games a day in the subject modes
--
-- Football, basketball, Born When? and Film & TV draw from a few hundred
-- events each, and a player who runs through one of those pools in a single
-- sitting has seen the whole mode. So each of them is three games a day for an
-- account and one for a guest. The general games (Date Guessing, Comparison,
-- the survival run) are unlimited and are not counted here at all — the list
-- of limited games is the check on `game` below and `LIMITED_GAMES` in
-- lib/game/play-limit.ts.
--
-- **One row per game begun, not a counter.** A counter would need a reset,
-- which means either a scheduled job (the site has none — see the note on
-- lazily drawn dailies) or a read-modify-write that two tabs can race. Rows
-- carrying their own day need neither: "today" is a `where play_day = $1`, and
-- yesterday's rows simply stop matching at midnight UTC.
--
-- **The set id is what makes a claim idempotent.** A game is spent by its
-- first locked-in guess, and that request can be retried, double-fired by a
-- remounted effect, or sent twice by a double-tap. `(user_id, set_id)` is the
-- primary key, so all of those land on the row that already exists instead of
-- costing a second game. The id is the client's own (the same per-set UUID
-- `solo_set` takes, chosen in components/solo-points.tsx), and it buys nothing:
-- a client that invents a fresh id every round spends its three games on three
-- rounds.
--
-- **The limit is a parameter, not a constant in here.** `game_claim_play`
-- takes it, so the two numbers live in one place — lib/game/play-limit.ts —
-- rather than being a paired SQL/TS rule to keep in step. Nothing a client
-- sends reaches it: the only caller is a Server Action holding the service-role
-- key, which also decides the player's identity from their session.
--
-- **A guest is not in here.** There is no account to key a row to, so their
-- one game a day lives in a cookie (lib/game/play-ledger.ts). A guest who
-- clears it gets another game, which is the trade a guest mode makes
-- everywhere; the sign-up notice is the answer to it, not a stricter table.
--
-- Service role only, like every other table that holds a thing a player would
-- like to be different (CLAUDE.md, "Rule for new client-writable tables"): a
-- player who could write this could hand themselves unlimited games, and a
-- player who could *delete* from it could do the same. RLS on, defaults
-- revoked, no grants.
-- ============================================================================

create table public.game_play (
  user_id uuid not null references auth.users (id) on delete cascade,

  -- The limited games. Text with a check rather than an enum, for the reason
  -- `score_entry.game` is: one constraint to replace when a mode is added.
  game text not null check (game in (
    'football', 'basketball', 'screen', 'when-born'
  )),

  -- The UTC day, as the daily counts days (`dailyPuzzleDate`). A date rather
  -- than a timestamp because that *is* the unit the limit is in, and it makes
  -- the reset a comparison instead of a window.
  play_day date not null,

  -- The set this play is: the client's per-set UUID. See the note above.
  set_id uuid not null,

  started_at timestamptz not null default now(),

  primary key (user_id, set_id)
);

comment on table public.game_play is
  'One subject-mode game begun by an account, for the three-a-day limit. '
  'Created by game_claim_play() at the first locked-in guess of a set. '
  'Service role only.';

-- The one query the limit asks: how many of this game has this player begun
-- today. `play_day` last so the index also serves "this player, this game".
create index game_play_day_idx
  on public.game_play (user_id, game, play_day);

-- ---------------------------------------------------------------------------
-- How many games of one mode this player has begun on one day.
--
-- The entry gate on every limited page, and it has to be its own function
-- rather than a select from the table because the table has no grants at all
-- — the service role reads it through here, and nothing else can read it by
-- any route.
-- ---------------------------------------------------------------------------
create function public.game_plays_used(
  p_user_id uuid,
  p_game text,
  p_day date
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.game_play
   where user_id = p_user_id
     and game = p_game
     and play_day = p_day;
$$;

comment on function public.game_plays_used(uuid, text, date) is
  'Subject-mode games this account has begun on the given UTC day. '
  'Service role only.';

-- ---------------------------------------------------------------------------
-- Spend a game.
--
-- Returns a jsonb status rather than raising, on `bank_solo_round`'s pattern:
-- every refusal here is a state the screen can be told about rather than an
-- error.
--
--   claimed    this game is now one of the day's; here is the new count
--   repeat     this set was already claimed — a retry, not a second game
--   exhausted  the day's games are spent; the caller shows the notice
--
-- **The advisory lock is what makes the count a limit.** Two tabs locking in
-- their first guess together would otherwise both read "two used", both
-- insert, and leave the player with four games for the day: each transaction
-- sees its own insert but not the other's uncommitted one. The lock is taken
-- on (player, game, day) rather than on the table, so it serialises exactly
-- the claims that share a counter and nothing else — and being transactional,
-- it is released by the commit whatever happens next.
-- ---------------------------------------------------------------------------
create function public.game_claim_play(
  p_user_id uuid,
  p_game text,
  p_set_id uuid,
  p_day date,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used integer;
begin
  -- Already counted: a retried request, a remounted effect, a double-tap.
  -- Checked before the lock, because this is the common repeat and it needs
  -- no counter of its own.
  if exists (
    select 1 from public.game_play
     where user_id = p_user_id and set_id = p_set_id
  ) then
    return jsonb_build_object(
      'status', 'repeat',
      'used', public.game_plays_used(p_user_id, p_game, p_day),
      'limit', p_limit
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_user_id::text || ':' || p_game || ':' || p_day::text, 0
    )
  );

  v_used := public.game_plays_used(p_user_id, p_game, p_day);

  if v_used >= p_limit then
    return jsonb_build_object(
      'status', 'exhausted', 'used', v_used, 'limit', p_limit
    );
  end if;

  insert into public.game_play (user_id, game, play_day, set_id)
  values (p_user_id, p_game, p_day, p_set_id)
  -- The lock makes this unreachable; it is here because a primary-key
  -- violation must never be what a player gets for pressing a button twice.
  on conflict (user_id, set_id) do nothing;

  return jsonb_build_object(
    'status', 'claimed', 'used', v_used + 1, 'limit', p_limit
  );
end;
$$;

comment on function public.game_claim_play(uuid, text, uuid, date, integer) is
  'Spend one of the day''s subject-mode games, or report that they are gone. '
  'Idempotent per set id. The limit is the caller''s (lib/game/play-limit.ts). '
  'Service role only.';

-- ---------------------------------------------------------------------------
-- Row Level Security and grants.
-- ---------------------------------------------------------------------------
alter table public.game_play enable row level security;

revoke all on public.game_play from anon, authenticated;

revoke all on function public.game_plays_used(uuid, text, date)
  from public, anon, authenticated;
revoke all on function public.game_claim_play(uuid, text, uuid, date, integer)
  from public, anon, authenticated;
