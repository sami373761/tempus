-- ============================================================================
-- TEMPUS — head-to-head matches (two-player date guessing)
--
-- The server is the authoritative clock and the authoritative referee. That is
-- the whole shape of this file, and it drives three decisions worth stating
-- before the tables:
--
-- 1. **One public row is the state.** `public.match` holds everything both
--    players are allowed to see, and nothing they are not. Clients subscribe to
--    it through Supabase Realtime (it is added to `supabase_realtime` at the
--    bottom), so a state change is pushed rather than polled for, and the thing
--    that is pushed is the authoritative row itself — there is no second copy
--    of the state to drift from it.
--
-- 2. **Secrets live in tables anon cannot read at all.** Which event a round is
--    about (`match_round.event_id`) is the answer: `public.event` is world
--    readable, so an event id handed to a client before the reveal is the year
--    handed to them. Likewise a guess before the round closes. Both live in
--    private tables, and move onto the public row only once the round is over
--    and nothing about them is secret any more.
--
-- 3. **Transitions are plpgsql under a row lock, not application code.** Two
--    players submitting in the same millisecond, a submission landing exactly
--    as the deadline passes, the same submission arriving twice from a retried
--    request — these are decided by `select ... for update` plus a primary key,
--    not by read-then-write from a server action. The application grades a
--    guess (that rule lives in lib/game/scoring.ts and stays there); the
--    database decides whether the guess counts.
--
-- Nothing here is specific to the date-guessing game except the column holding
-- a guessed *year*. The match, seat, round and answer structure is the part
-- meant to carry other modes later.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Phase — the match state machine, as one column.
--
-- Split across two booleans and a status it would be possible to be in two
-- states at once; as one enum it is not. The transitions are exactly:
--
--   lobby    -> playing    both seats joined and both pressed ready
--   playing  -> revealed   both answered, or the round deadline passed
--   revealed -> playing    the reveal window elapsed and rounds remain
--   revealed -> complete   the reveal window elapsed on the last round
--   *        -> abandoned  a player left before the match finished
--   complete -> playing    a rematch was accepted (generation + 1)
-- ---------------------------------------------------------------------------
create type public.match_phase as enum (
  'lobby',
  'playing',
  'revealed',
  'complete',
  'abandoned'
);

-- ---------------------------------------------------------------------------
-- match — the one row both clients watch.
--
-- Every column here is public by construction. Before adding one, ask whether
-- showing it to the opponent mid-round would change how they play: if so it
-- belongs in match_round or match_answer instead.
-- ---------------------------------------------------------------------------
create table public.match (
  id uuid primary key default gen_random_uuid(),

  -- What goes in the invite link and the QR code. Short and unambiguous
  -- (lib/game/versus.ts picks the alphabet) because it is read off a phone
  -- screen as often as it is clicked.
  code text not null unique,

  phase public.match_phase not null default 'lobby',

  -- Bumped by a rematch. The same two seats keep playing on the same row — the
  -- spec is explicit that a rematch must not need a new invite — so rounds and
  -- answers are keyed by generation to keep the new game's rows from colliding
  -- with the finished one's.
  generation integer not null default 1,

  -- Copied from the application's constants at creation rather than read from
  -- them at play time, so a deploy that retunes the game cannot change the
  -- rules of a match that is already running.
  total_rounds integer not null,
  round_seconds integer not null,
  reveal_seconds integer not null,

  -- Which round is live, zero-based.
  current_idx integer not null default 0,

  -- The authoritative clock. Clients render a countdown against
  -- `round_deadline_at` corrected by the server/client offset they measured on
  -- their last request; they never decide when time is up.
  round_started_at timestamptz,
  round_deadline_at timestamptz,
  reveal_until_at timestamptz,

  -- 0, 1 or 2. Enough for the opponent to be told "they have answered" without
  -- being told what they answered.
  answered_count integer not null default 0,

  seat1_joined boolean not null default false,
  seat2_joined boolean not null default false,
  seat1_ready boolean not null default false,
  seat2_ready boolean not null default false,

  seat1_score integer not null default 0,
  seat2_score integer not null default 0,

  -- One entry per finished round, appended at the reveal. Public because a
  -- revealed round has no secrets left; it is what the result screen, the
  -- end-of-match pips and the share text are all drawn from, and it is what
  -- lets a reconnecting client rebuild the match without replaying anything.
  history jsonb not null default '[]'::jsonb,

  -- Seat that asked for a rematch, and the seat that turned one down. Both
  -- cleared when a new generation starts.
  rematch_by integer,
  rematch_declined_by integer,

  -- Monotonic, stamped by the trigger below. Realtime delivery is ordered per
  -- channel, but a client also fetches state over HTTP on mount and on
  -- reconnect; comparing versions is what stops a slow fetch from overwriting
  -- a newer pushed row.
  version bigint not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint match_seats_valid check (
    rematch_by is null or rematch_by in (1, 2)
  ),
  constraint match_declined_valid check (
    rematch_declined_by is null or rematch_declined_by in (1, 2)
  ),
  constraint match_rounds_positive check (total_rounds > 0),
  constraint match_idx_in_range check (current_idx >= 0 and current_idx < total_rounds),
  constraint match_answered_count_range check (answered_count between 0 and 2)
);

comment on table public.match is
  'Head-to-head match state. Every column is safe to show both players; '
  'anything that would leak an answer belongs in match_round or match_answer.';

create index match_updated_at_idx on public.match (updated_at);

-- ---------------------------------------------------------------------------
-- match_player — the two seats, and the capability token that proves one.
--
-- There is no login on this site, so a seat is held by a random token the
-- client keeps and presents with every action. Only its SHA-256 is stored:
-- a leaked database dump then does not let anyone play as either seat.
-- ---------------------------------------------------------------------------
create table public.match_player (
  match_id uuid not null references public.match (id) on delete cascade,
  seat integer not null check (seat in (1, 2)),
  token_hash text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  primary key (match_id, seat)
);

create index match_player_token_idx on public.match_player (match_id, token_hash);

-- ---------------------------------------------------------------------------
-- match_round — which event each round asks about.
--
-- Private in full. `event_id` is the answer (public.event is world readable),
-- so this table has no anon grants and no RLS policy; the year reaches a client
-- only through `match.history`, after the round has closed.
-- ---------------------------------------------------------------------------
create table public.match_round (
  match_id uuid not null references public.match (id) on delete cascade,
  generation integer not null,
  idx integer not null,
  event_id uuid not null references public.event (id) on delete cascade,

  primary key (match_id, generation, idx)
);

-- ---------------------------------------------------------------------------
-- match_answer — what each seat actually guessed.
--
-- The primary key is the duplicate-submission guard: a second submission for
-- the same seat and round cannot be written, whatever the client does, and the
-- "did this insert happen" answer is what the submit function reports back.
-- ---------------------------------------------------------------------------
create table public.match_answer (
  match_id uuid not null references public.match (id) on delete cascade,
  generation integer not null,
  idx integer not null,
  seat integer not null check (seat in (1, 2)),

  -- Astronomical year, same convention as event.year (lib/historical-date.ts).
  guess bigint not null,
  -- The tier from lib/game/scoring.ts. Text rather than an enum because the
  -- tiers are an application tuning decision and must not need a migration.
  verdict text not null,
  points integer not null,
  -- How long the player took, in milliseconds from the server's round start.
  -- Shown on the result; deliberately not part of the score.
  elapsed_ms integer not null,
  answered_at timestamptz not null default now(),

  primary key (match_id, generation, idx, seat)
);

-- ---------------------------------------------------------------------------
-- Bookkeeping trigger: version and updated_at on every write.
-- ---------------------------------------------------------------------------
create or replace function public.match_stamp_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version = old.version + 1;
  new.updated_at = now();
  return new;
end;
$$;

create trigger match_stamp_version
  before update on public.match
  for each row execute function public.match_stamp_version();

-- ===========================================================================
-- State machine
--
-- All of these take the match row's lock first and do their own reading. They
-- are the only things that may move a match between phases.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- One seat's result for one round, as the shape the result screen reads.
--
-- A seat with no answer row timed out, and records as the same miss the solo
-- game already calls "bad" (MISSED_VERDICT in lib/game/set.ts) worth no
-- points — so the timeout path and the wrong-answer path stay one path all the
-- way to the summary.
-- ---------------------------------------------------------------------------
create or replace function public.versus_seat_result(
  p_match_id uuid,
  p_generation integer,
  p_idx integer,
  p_seat integer
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'guess', a.guess,
        'verdict', a.verdict,
        'points', a.points,
        'elapsedMs', a.elapsed_ms,
        'timedOut', false
      )
      from public.match_answer a
      where a.match_id = p_match_id
        and a.generation = p_generation
        and a.idx = p_idx
        and a.seat = p_seat
    ),
    jsonb_build_object(
      'guess', null,
      'verdict', 'bad',
      'points', 0,
      'elapsedMs', null,
      'timedOut', true
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Close the live round and publish its result.
--
-- Assumes the caller holds the row lock and has checked the phase.
-- ---------------------------------------------------------------------------
create or replace function public.versus_reveal(p_match public.match)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_year bigint;
  v_entry jsonb;
  v_seat1 jsonb;
  v_seat2 jsonb;
  v_points1 integer;
  v_points2 integer;
begin
  select r.event_id into v_event_id
  from public.match_round r
  where r.match_id = p_match.id
    and r.generation = p_match.generation
    and r.idx = p_match.current_idx;

  select e.year into v_year
  from public.event e
  where e.id = v_event_id;

  -- One object per seat, present either way: a round where nobody answered
  -- still has to render as two timeouts rather than as missing data.
  --
  -- A `case` on whether the row exists, not a `coalesce` over the built
  -- object. `jsonb_build_object` of all-NULL columns returns
  -- `{"guess": null, ...}` — a perfectly non-null object — so a coalesce here
  -- would never reach its second branch and a timeout would render as an
  -- answer of "null" worth whatever the column defaults to.
  v_seat1 = public.versus_seat_result(
    p_match.id, p_match.generation, p_match.current_idx, 1
  );
  v_seat2 = public.versus_seat_result(
    p_match.id, p_match.generation, p_match.current_idx, 2
  );

  v_points1 = coalesce((v_seat1 ->> 'points')::integer, 0);
  v_points2 = coalesce((v_seat2 ->> 'points')::integer, 0);

  v_entry = jsonb_build_object(
    'idx', p_match.current_idx,
    'eventId', v_event_id,
    'year', v_year,
    'yearLabel', public.historical_year_label(v_year),
    'seat1', v_seat1,
    'seat2', v_seat2
  );

  update public.match m
  set phase = 'revealed',
      history = m.history || jsonb_build_array(v_entry),
      seat1_score = m.seat1_score + v_points1,
      seat2_score = m.seat2_score + v_points2,
      reveal_until_at = clock_timestamp()
        + make_interval(secs => m.reveal_seconds),
      round_deadline_at = null
  where m.id = p_match.id;
end;
$$;

comment on function public.versus_reveal is
  'Closes the live round: writes its public result into match.history, banks '
  'both seats scores and opens the reveal window. Caller must hold the lock.';

-- ---------------------------------------------------------------------------
-- Bring a match up to date with the wall clock.
--
-- This is what makes the server the authority on time. Clients call it when
-- their own countdown reaches zero, but nothing depends on them doing so: it
-- also runs at the head of every other entry point, so a match is reconciled
-- whenever anybody touches it, and a player who was away while several
-- deadlines passed finds the match where it should be rather than where they
-- left it.
--
-- `clock_timestamp()` rather than `now()`, which is frozen at the start of the
-- transaction: the loop below both reads the clock and stamps new windows from
-- it, and those two have to be the same clock or a single call could apply a
-- deadline it had itself just created.
--
-- What this does *not* do is race an abandoned match to the end. Each
-- transition stamps its next window from the current clock, so a reveal that
-- opens here closes `reveal_seconds` from now, not from when it was due — one
-- call applies the deadlines that have already passed and then stops. A player
-- whose opponent has vanished therefore plays the match out at its normal
-- pace, winning every round by timeout, instead of watching it flash past; a
-- match both players left simply stops where it is until the sweep collects
-- it.
-- ---------------------------------------------------------------------------
create or replace function public.versus_reconcile(p_match_id uuid)
returns public.match
language plpgsql
set search_path = ''
as $$
declare
  v_match public.match;
  v_guard integer := 0;
begin
  select * into v_match from public.match where id = p_match_id for update;
  if not found then
    raise exception 'match % not found', p_match_id using errcode = 'no_data_found';
  end if;

  loop
    v_guard = v_guard + 1;
    -- Two transitions per round at the very most, plus slack. A cap rather
    -- than trust: a bug below must not become an unkillable statement.
    exit when v_guard > (v_match.total_rounds * 2) + 4;

    if v_match.phase = 'playing'
       and v_match.round_deadline_at is not null
       and clock_timestamp() >= v_match.round_deadline_at then
      perform public.versus_reveal(v_match);

    elsif v_match.phase = 'revealed'
          and v_match.reveal_until_at is not null
          and clock_timestamp() >= v_match.reveal_until_at then

      if v_match.current_idx + 1 >= v_match.total_rounds then
        update public.match
        set phase = 'complete',
            reveal_until_at = null,
            round_started_at = null,
            round_deadline_at = null
        where id = v_match.id;
      else
        update public.match m
        set phase = 'playing',
            current_idx = m.current_idx + 1,
            answered_count = 0,
            round_started_at = clock_timestamp(),
            round_deadline_at = clock_timestamp()
              + make_interval(secs => m.round_seconds),
            reveal_until_at = null
        where m.id = v_match.id;
      end if;

    else
      exit;
    end if;

    select * into v_match from public.match where id = p_match_id;
  end loop;

  return v_match;
end;
$$;

comment on function public.versus_reconcile is
  'Applies every deadline that has passed. Run at the head of every entry '
  'point, so the match state never depends on a client having called in.';

-- ---------------------------------------------------------------------------
-- Mark a seat ready, and start the match once both are.
-- ---------------------------------------------------------------------------
create or replace function public.versus_set_ready(
  p_match_id uuid,
  p_seat integer,
  p_ready boolean
)
returns public.match
language plpgsql
set search_path = ''
as $$
declare
  v_match public.match;
  v_rounds integer;
begin
  v_match = public.versus_reconcile(p_match_id);

  if v_match.phase <> 'lobby' then
    return v_match;
  end if;

  update public.match
  set seat1_ready = case when p_seat = 1 then p_ready else seat1_ready end,
      seat2_ready = case when p_seat = 2 then p_ready else seat2_ready end
  where id = p_match_id
  returning * into v_match;

  -- Starting needs rounds to have been dealt; the application does that when
  -- the match is created, but refusing to start without them is cheaper than
  -- discovering it one round in.
  select count(*) into v_rounds
  from public.match_round r
  where r.match_id = p_match_id and r.generation = v_match.generation;

  if v_match.seat1_joined and v_match.seat2_joined
     and v_match.seat1_ready and v_match.seat2_ready
     and v_rounds >= v_match.total_rounds then
    update public.match m
    set phase = 'playing',
        current_idx = 0,
        answered_count = 0,
        round_started_at = clock_timestamp(),
        round_deadline_at = clock_timestamp()
          + make_interval(secs => m.round_seconds),
        reveal_until_at = null
    where m.id = p_match_id
    returning * into v_match;
  end if;

  return v_match;
end;
$$;

-- ---------------------------------------------------------------------------
-- Record one guess.
--
-- The guess arrives already graded — the tiers are an application rule
-- (lib/game/scoring.ts) and belong in one place — but whether it counts is
-- decided here, under the lock, after reconciling:
--
--   * reconcile first, so a guess that arrives after the deadline meets a
--     round that is already revealed and is refused. "Exactly as the timer
--     expires" therefore has one answer, not a race.
--   * the primary key refuses a second guess from the same seat, so a
--     double-clicked button or a retried request cannot overwrite the first.
--   * two guesses landing together are serialized by the lock; the second one
--     sees answered_count reach two and closes the round.
--
-- Returns the match row plus an outcome word the caller can act on.
-- ---------------------------------------------------------------------------
create or replace function public.versus_submit(
  p_match_id uuid,
  p_seat integer,
  p_idx integer,
  p_guess bigint,
  p_verdict text,
  p_points integer,
  p_elapsed_ms integer,
  out result text,
  out match_row public.match
)
language plpgsql
set search_path = ''
as $$
declare
  v_inserted integer;
  v_count integer;
begin
  match_row = public.versus_reconcile(p_match_id);

  if match_row.phase <> 'playing' then
    result = 'closed';
    return;
  end if;

  if match_row.current_idx <> p_idx then
    result = 'stale';
    return;
  end if;

  insert into public.match_answer (
    match_id, generation, idx, seat, guess, verdict, points, elapsed_ms
  )
  values (
    p_match_id, match_row.generation, p_idx, p_seat,
    p_guess, p_verdict, p_points, greatest(0, p_elapsed_ms)
  )
  on conflict (match_id, generation, idx, seat) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    result = 'duplicate';
    return;
  end if;

  select count(*) into v_count
  from public.match_answer a
  where a.match_id = p_match_id
    and a.generation = match_row.generation
    and a.idx = p_idx;

  update public.match
  set answered_count = v_count
  where id = p_match_id
  returning * into match_row;

  -- The round ends the moment the second answer lands, however much time is
  -- left. That is the point of the mode.
  if v_count >= 2 then
    perform public.versus_reveal(match_row);
    select * into match_row from public.match where id = p_match_id;
  end if;

  result = 'accepted';
end;
$$;

-- ---------------------------------------------------------------------------
-- Rematch: same row, same seats, same tokens, next generation.
--
-- Reusing the match rather than creating one is what keeps the promise that
-- neither player has to send a new link. The application deals the new
-- generation's rounds before accepting.
-- ---------------------------------------------------------------------------
create or replace function public.versus_request_rematch(
  p_match_id uuid,
  p_seat integer
)
returns public.match
language plpgsql
set search_path = ''
as $$
declare
  v_match public.match;
begin
  v_match = public.versus_reconcile(p_match_id);

  if v_match.phase <> 'complete' then
    return v_match;
  end if;

  update public.match
  set rematch_by = p_seat,
      rematch_declined_by = null
  where id = p_match_id
  returning * into v_match;

  return v_match;
end;
$$;

create or replace function public.versus_start_rematch(p_match_id uuid)
returns public.match
language plpgsql
set search_path = ''
as $$
declare
  v_match public.match;
  v_rounds integer;
begin
  select * into v_match from public.match where id = p_match_id for update;
  if not found then
    raise exception 'match % not found', p_match_id using errcode = 'no_data_found';
  end if;

  if v_match.phase <> 'complete' then
    return v_match;
  end if;

  -- The caller deals generation + 1 before calling; without those rows the
  -- match would start on a round that does not exist.
  select count(*) into v_rounds
  from public.match_round r
  where r.match_id = p_match_id and r.generation = v_match.generation + 1;

  if v_rounds < v_match.total_rounds then
    return v_match;
  end if;

  update public.match m
  set generation = m.generation + 1,
      phase = 'playing',
      current_idx = 0,
      answered_count = 0,
      seat1_score = 0,
      seat2_score = 0,
      seat1_ready = true,
      seat2_ready = true,
      history = '[]'::jsonb,
      rematch_by = null,
      rematch_declined_by = null,
      round_started_at = clock_timestamp(),
      round_deadline_at = clock_timestamp()
        + make_interval(secs => m.round_seconds),
      reveal_until_at = null
  where m.id = p_match_id
  returning * into v_match;

  return v_match;
end;
$$;

create or replace function public.versus_decline_rematch(
  p_match_id uuid,
  p_seat integer
)
returns public.match
language plpgsql
set search_path = ''
as $$
declare
  v_match public.match;
begin
  update public.match
  set rematch_by = null,
      rematch_declined_by = p_seat
  where id = p_match_id
  returning * into v_match;

  return v_match;
end;
$$;

-- ---------------------------------------------------------------------------
-- Housekeeping. Matches are ephemeral by design — there are no game tables in
-- this project and these are not the beginning of one (CLAUDE.md, gap 5). They
-- exist to run a match and then to be swept.
-- ---------------------------------------------------------------------------
create or replace function public.versus_sweep(p_older_than interval default '12 hours')
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.match
  where updated_at < now() - p_older_than;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function public.versus_sweep is
  'Deletes stale matches. Matches are ephemeral; nothing here is a score '
  'history and nothing should start treating it as one.';

-- ===========================================================================
-- Row Level Security and grants
--
-- Supabase grants anon ALL privileges on every new table in public by default
-- (CLAUDE.md). Every table below therefore has both layers closed deliberately:
-- RLS on with at most a select policy, and the write grants revoked.
-- ===========================================================================

alter table public.match        enable row level security;
alter table public.match_player enable row level security;
alter table public.match_round  enable row level security;
alter table public.match_answer enable row level security;

-- The public row is readable by anyone holding its id — which is exactly the
-- capability the invite link hands out, and is also what Realtime checks
-- before pushing a change to a subscriber. It carries no secrets by
-- construction; see the note at the top of this file.
create policy "match rows are readable by everyone"
  on public.match for select to anon, authenticated
  using (true);

-- No policies at all on the other three: token hashes, the event behind the
-- live round and the raw guesses are reachable only through the service role.

grant select on public.match to anon, authenticated;

revoke insert, update, delete, truncate, references, trigger
  on public.match
  from anon, authenticated;

revoke all
  on public.match_player, public.match_round, public.match_answer
  from anon, authenticated;

-- The state machine is driven by the service role through the server actions
-- in app/actions/versus.ts. Postgres grants EXECUTE to public by default, and
-- PostgREST exposes public functions as RPC endpoints — so leaving these would
-- let anyone with the anon key submit an answer for either seat.
revoke all on function
  public.versus_seat_result(uuid, integer, integer, integer),
  public.versus_reveal(public.match),
  public.versus_reconcile(uuid),
  public.versus_set_ready(uuid, integer, boolean),
  public.versus_submit(uuid, integer, integer, bigint, text, integer, integer),
  public.versus_request_rematch(uuid, integer),
  public.versus_start_rematch(uuid),
  public.versus_decline_rematch(uuid, integer),
  public.versus_sweep(interval)
  from public, anon, authenticated;

-- ===========================================================================
-- Realtime
--
-- Adding the table to this publication is what makes Supabase push its changes
-- to subscribed clients. Only `match` is published: it is the only table whose
-- every column a player may see, which is the same reason it is the only one
-- with a select policy.
-- ===========================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.match;
  end if;
end $$;
