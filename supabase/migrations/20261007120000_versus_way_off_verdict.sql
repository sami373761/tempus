-- ---------------------------------------------------------------------------
-- The timed-out answer names the bottom verdict, and the bottom verdict was
-- renamed.
--
-- `gradeGuess` graded in four tiers until 2026-10-07 — perfect, great, good,
-- bad — where "bad" was labelled "Way off" and caught everything outside the
-- widest band, which was about half of all guesses. It grades in five now, and
-- the new rung took the name `bad`: the ladder on screen reads Way off / Bad /
-- Good / Great / Perfect, and an id that printed as "Way off" while a
-- different id printed as "Bad" is the kind of thing that gets mis-read later.
-- So the bottom tier is `wayOff` (lib/game/scoring.ts).
--
-- This is the one place in the database that *names* a verdict rather than
-- storing whatever the application handed it. `match_answer.verdict` is plain
-- text with no constraint, precisely so that retuning the tiers needs no
-- migration — but a seat with no answer row has no application-supplied
-- verdict to store, so `versus_seat_result` synthesises one, and it has to be
-- the bottom tier or a player who never answered would out-score one who
-- answered badly.
--
-- Nothing else changes: same signature, same shape, same coalesce. Rows
-- already holding the old 'bad' are not migrated because there are none worth
-- migrating — `versus_sweep()` deletes a match's rounds and answers when it
-- finishes, and `isVerdict()` in lib/game/versus.ts drops an unparseable
-- verdict rather than trusting it.
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
      -- The bottom tier of lib/game/scoring.ts. Change it there and change it
      -- here; `isVerdict` is what will reject a mismatch, by showing the
      -- round with no result at all.
      'verdict', 'wayOff',
      'points', 0,
      'elapsedMs', null,
      'timedOut', true
    )
  );
$$;

comment on function public.versus_seat_result is
  'One seat''s result for one round. A seat with no answer row timed out and '
  'records as the bottom verdict (wayOff) worth no points, so the timeout path '
  'and the wrong-answer path stay one path all the way to the summary.';
