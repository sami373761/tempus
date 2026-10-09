-- ============================================================================
-- TEMPUS — dealing a day's challenges in one round trip
--
-- `ensureDailyChallenges` originally read, drew if the read came back empty,
-- inserted, and then **read again** to find out which draw had won the race.
-- That second read is the problem: it is the same GET as the first, and a
-- Server Component render memoizes GET fetches — so the re-read can be served
-- the first read's "no rows" answer and the day looks undealt immediately
-- after being dealt. It fails exactly once per day, on the first visitor, and
-- it fails with the rows sitting in the table.
--
-- Doing the insert and the read-back as one function removes the second GET
-- rather than trying to outwit the cache: PostgREST calls an RPC with POST,
-- which is never memoized, and whatever comes back is what the table holds —
-- the caller's own rows if it won the race, the other request's if it lost.
-- `on conflict do nothing` is what makes losing free.
--
-- Same reasoning as the head-to-head state machine: a decision that depends on
-- what is already in the table is made in the table.
-- ============================================================================

create or replace function public.daily_ensure_challenges(
  p_puzzle_date date,
  p_member uuid[],
  p_guest uuid[]
)
returns setof public.daily_challenge
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.daily_challenge (puzzle_date, audience, event_ids)
  values
    (p_puzzle_date, 'member', p_member),
    (p_puzzle_date, 'guest', p_guest)
  on conflict (puzzle_date, audience) do nothing;

  -- Both rows, whoever wrote them. The caller compares nothing and adopts
  -- what it is given, which is what makes "everybody gets the same ten" hold
  -- even when two first visitors arrive together.
  return query
    select * from public.daily_challenge where puzzle_date = p_puzzle_date;
end;
$$;

comment on function public.daily_ensure_challenges(date, uuid[], uuid[]) is
  'Deals a days two challenges if they are not already dealt, and returns the '
  'pair that is actually stored. One round trip, so no read can be served a '
  'cached answer from before the insert.';

-- Postgres grants EXECUTE on a new function to `public`, and PostgREST exposes
-- public functions as RPC endpoints — so leaving this would let anyone holding
-- the anon key choose the questions.
revoke all on function public.daily_ensure_challenges(date, uuid[], uuid[])
  from public, anon, authenticated;
