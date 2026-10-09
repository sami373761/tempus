-- ============================================================================
-- TEMPUS — Daily mode
--
-- Ten date-guessing questions a day, the same ten for everybody, playable
-- once. Two tables and one function.
--
-- **There are two challenges per day, not one, and they hold disjoint sets of
-- events.** A guest can play, read every answer off the reveal, then create an
-- account — so if both audiences were asked the same ten questions, signing up
-- after a guest run would be worth a perfect score. Splitting the day's draw
-- into a `member` half and a `guest` half makes that attack buy nothing: the
-- questions a guest has already seen are not the questions their new account
-- is asked. `public.array_is_distinct` is what guarantees the halves cannot
-- overlap *within* a set either — the same event twice in one day's ten.
--
-- **`daily_challenge.event_ids` is the answer sheet**, exactly as
-- `match_round.event_id` is in the head-to-head mode: `public.event` is world
-- readable, so an event id is a year. The table therefore has RLS on, no
-- policy at all and no grants — it is reachable only through the service role,
-- and the client is handed masked events (`MaskedEvent` in lib/game/versus.ts)
-- plus one reveal per locked-in guess.
--
-- **`daily_attempt` is the one-attempt rule, written as a primary key.**
-- (user_id, puzzle_date) — a player cannot have two attempts at a day because
-- there is nowhere to put the second one. It is also what makes a refresh
-- resume rather than restart: the answers so far are on the row, so reopening
-- the page continues at the next unanswered question and a completed row shows
-- its own result screen. Guests have no identity to key a row on, so their
-- attempt lives in `localStorage` — see components/daily-game.tsx for what
-- that does and does not guarantee.
--
-- Written **only by the service role**, like `user_badge_progress` and for the
-- same reason: a player who could write their own score row could award
-- themselves any score. `daily_record_answer` is the one way in, and its
-- EXECUTE grant is revoked from everyone PostgREST would expose it to.
--
-- This is the first durable *score* on the site. It is deliberately not a
-- general solo-session table (CLAUDE.md, gap 4): it records attempts at a
-- challenge that exists, not game sessions in the abstract.
-- ============================================================================

create type public.daily_audience as enum ('member', 'guest');

comment on type public.daily_audience is
  'Which of the days two challenges: the one for accounts or the one for '
  'signed-out players. The two hold disjoint event sets on purpose.';

-- ---------------------------------------------------------------------------
-- No duplicate questions in a day's set.
--
-- A CHECK constraint may not contain a subquery, so the test is wrapped in an
-- immutable function. It is immutable honestly — it reads nothing but its
-- argument.
-- ---------------------------------------------------------------------------
create or replace function public.array_is_distinct(ids uuid[])
returns boolean
language sql
immutable
as $$
  select ids is null
      or cardinality(ids) = (select count(distinct x) from unnest(ids) as x);
$$;

comment on function public.array_is_distinct(uuid[]) is
  'True when no element repeats. Exists so a CHECK can say "no event appears '
  'twice in one days questions" without a subquery.';

create table public.daily_challenge (
  -- The day, in UTC. One boundary for every player, so "the same ten
  -- questions for everybody" is true across time zones rather than only
  -- within one — see `dailyPuzzleDate` in lib/game/daily.ts, which is the only
  -- place this is computed.
  puzzle_date date not null,
  audience public.daily_audience not null,

  -- The questions, in the order they are asked. An array rather than a child
  -- table because the order *is* the data and a set is read whole or not at
  -- all; there is no query that wants one question of a day.
  --
  -- No foreign key is possible from an array element, so an event deleted
  -- after a challenge was dealt would leave a dangling id. The loader refuses
  -- a challenge it cannot resolve completely rather than quietly dealing a
  -- short set (see `readDailyChallenge` in lib/db/daily.ts).
  event_ids uuid[] not null
    check (cardinality(event_ids) > 0)
    check (public.array_is_distinct(event_ids)),

  created_at timestamptz not null default now(),

  primary key (puzzle_date, audience)
);

comment on table public.daily_challenge is
  'One row per (day, audience): the ordered event ids that days ten questions '
  'are drawn from. THE EVENT IDS ARE THE ANSWERS — no client may read this '
  'table.';

create table public.daily_attempt (
  user_id uuid not null references auth.users (id) on delete cascade,
  puzzle_date date not null,

  -- One entry per answered question, in order:
  --   { idx, guess, year, verdict, points }
  --
  -- `year` is in here rather than derived from the challenge because the
  -- result screen has to be re-renderable from the attempt alone — a player
  -- who reopens a finished day gets their verdicts back without the server
  -- handing out the day's answer sheet a second time. `verdict` is the one
  -- that was *recorded*, which is what a retune of `BANDS` must not
  -- retroactively change.
  answers jsonb not null default '[]'::jsonb,

  -- The score, with the daily multiplier already in it: points are banked as
  -- they are earned rather than summed from `answers` on read, so the column
  -- can be indexed and ranked when there is a leaderboard to rank it on.
  points integer not null default 0 check (points >= 0),
  hits integer not null default 0 check (hits >= 0),

  started_at timestamptz not null default now(),
  -- Set when the last question lands. Null is "in progress", which is the
  -- state a refresh resumes into; non-null is "show them their result".
  completed_at timestamptz,
  updated_at timestamptz not null default now(),

  -- The one-attempt-per-day rule. Not an index for a query — the invariant
  -- itself.
  primary key (user_id, puzzle_date)
);

comment on table public.daily_attempt is
  'One row per (player, day): the one attempt they get. Written only by the '
  'service role through daily_record_answer.';

create trigger daily_attempt_touch_updated_at
  before update on public.daily_attempt
  for each row execute function public.touch_updated_at();

-- "The best daily scores for this day" — the query a leaderboard will want,
-- and the only read that is not keyed on the whole primary key.
create index daily_attempt_leaderboard_idx
  on public.daily_attempt (puzzle_date, points desc)
  where completed_at is not null;

-- ---------------------------------------------------------------------------
-- Recording one answer.
--
-- In plpgsql under `for update` for the reason the head-to-head state machine
-- is: two tabs, a double-tap or a retried request must not be able to bank the
-- same question twice, and a read-then-write from a Server Action cannot
-- promise that. The application still *grades* the guess (`gradeGuess` stays
-- the one copy of that rule) and the database decides whether the graded
-- answer counts — the same split as `versus_submit`.
--
-- **Answers are strictly sequential.** The only index this will accept is the
-- one after the last one recorded, which makes three things impossible at
-- once: banking a question twice, skipping ahead to a question the player has
-- not been shown, and answering a day that is already complete. Anything else
-- is a no-op that returns the row as it stands, so the caller can simply
-- re-read the state it already had rather than handling an error it cannot
-- recover from.
--
-- Years are `bigint` throughout: the deep panes reach -4539999999, which does
-- not fit in an integer.
-- ---------------------------------------------------------------------------
create or replace function public.daily_record_answer(
  p_user_id uuid,
  p_puzzle_date date,
  p_idx integer,
  p_guess bigint,
  p_year bigint,
  p_verdict text,
  p_points integer,
  p_hit boolean,
  p_total integer
)
returns public.daily_attempt
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt public.daily_attempt;
begin
  -- First answer of the day creates the row. `do nothing` rather than a
  -- preceding select, so two requests racing for a player's first question
  -- cannot both think they are creating it.
  insert into public.daily_attempt (user_id, puzzle_date)
  values (p_user_id, p_puzzle_date)
  on conflict (user_id, puzzle_date) do nothing;

  select * into attempt
  from public.daily_attempt
  where user_id = p_user_id and puzzle_date = p_puzzle_date
  for update;

  if attempt.completed_at is not null
     or p_idx < 0
     or p_idx >= p_total
     or jsonb_array_length(attempt.answers) <> p_idx then
    return attempt;
  end if;

  update public.daily_attempt set
    answers = attempt.answers || jsonb_build_object(
      'idx', p_idx,
      'guess', p_guess,
      'year', p_year,
      'verdict', p_verdict,
      'points', greatest(p_points, 0)
    ),
    points = attempt.points + greatest(p_points, 0),
    hits = attempt.hits + case when p_hit then 1 else 0 end,
    completed_at = case when p_idx + 1 >= p_total then now() end
  where user_id = p_user_id and puzzle_date = p_puzzle_date
  returning * into attempt;

  return attempt;
end;
$$;

comment on function public.daily_record_answer is
  'Appends one graded answer to a players daily attempt, creating the attempt '
  'if needed. Accepts only the next index in sequence, so a duplicate, an '
  'out-of-order or a post-completion submission is a no-op.';

-- ===========================================================================
-- Row Level Security and grants
--
-- Supabase grants anon and authenticated ALL privileges on every new table in
-- public by default (CLAUDE.md), so both layers are closed deliberately here:
-- RLS on, the default grants revoked, then exactly one capability handed back.
-- ===========================================================================

alter table public.daily_challenge enable row level security;
alter table public.daily_attempt enable row level security;

revoke all on public.daily_challenge from anon, authenticated;
revoke all on public.daily_attempt from anon, authenticated;

-- No policy on `daily_challenge` at all, and that is the point: its event ids
-- are the day's answers.

-- A player may read their own attempt and nothing else. There is no write
-- policy — `daily_record_answer` is the only writer, and it runs as the
-- service role.
create policy "a player reads their own daily attempt"
  on public.daily_attempt for select to authenticated
  using (user_id = auth.uid());

grant select on public.daily_attempt to authenticated;

-- Postgres grants EXECUTE on a new function to `public`, and PostgREST exposes
-- public functions as RPC endpoints — so leaving this would let anyone holding
-- the anon key write any score for any user.
revoke all on function
  public.daily_record_answer(uuid, date, integer, bigint, bigint, text, integer, boolean, integer)
  from public, anon, authenticated;

-- `array_is_distinct` is a pure predicate over its argument and is only
-- reachable as a constraint; it is left with its default grant deliberately,
-- since a CHECK must be evaluable by whoever inserts the row.
