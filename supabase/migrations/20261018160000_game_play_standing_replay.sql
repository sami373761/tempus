-- ============================================================================
-- TEMPUS — a retried round is not a new game
--
-- `game_play_standing` (20261018150000) answered "may this set be played on"
-- with "it is open and has rounds left", and that is one case short. A reveal
-- can be *retried by hand*: a lost reply leaves the guess on the board with
-- "that did not reach the server" under it, and pressing lock-in again sends
-- the same round token a second time (see `lockIn` in
-- components/timeline-game.tsx).
--
-- On the last round of a set that is a refusal, because by then the set is
-- closed — so a player whose tenth reply went missing would be shown "today's
-- games are done" instead of their summary, possibly with two games still in
-- hand. The round was graded and banked; the only thing that failed was the
-- reply.
--
-- So the question gains the round: a round already in `solo_answer` is a round
-- this player has already been charged for, and replaying it is always
-- allowed. `solo_answer.round_id` is the primary key of a round the server
-- signed and dealt (lib/game/round-token.ts), so this cannot be used to ask
-- for anything that was not already paid for.
--
-- Same shape otherwise: read-only, service role only, the limit still the
-- caller's. The function is dropped and recreated rather than replaced
-- because the argument list changes.
-- ============================================================================

drop function if exists
  public.game_play_standing(uuid, text, uuid, timestamptz, integer);

create function public.game_play_standing(
  p_user_id uuid,
  p_game text,
  p_set_id uuid,
  p_round_id uuid,
  p_since timestamptz,
  p_set_size integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_used integer;
  v_set public.solo_set;
  v_replay boolean := false;
begin
  select count(*)::integer into v_used
    from public.solo_set
   where user_id = p_user_id
     and game = p_game
     and created_at >= p_since;

  if p_set_id is not null then
    select * into v_set
      from public.solo_set
     where id = p_set_id and user_id = p_user_id and game = p_game;
  end if;

  -- A round that has already been banked. Checked against this player's own
  -- rows, so it is "a round you have already played", never "a round that
  -- exists".
  if p_round_id is not null then
    select exists (
      select 1 from public.solo_answer
       where round_id = p_round_id and user_id = p_user_id
    ) into v_replay;
  end if;

  return jsonb_build_object(
    'used', v_used,
    'continuing', v_set.id is not null,
    'set_open',
      v_replay
      or (
        v_set.id is not null
        and v_set.closed_at is null
        and v_set.answered < p_set_size
      )
  );
end;
$$;

comment on function
  public.game_play_standing(uuid, text, uuid, uuid, timestamptz, integer) is
  'Subject-mode games this account has begun since p_since, and whether '
  'p_set_id/p_round_id is a round it may still play (a set with rounds left, '
  'or a round already banked and so being retried). Read-only; the limit is '
  'the caller''s (lib/game/play-limit.ts). Service role only.';

revoke all on function
  public.game_play_standing(uuid, text, uuid, uuid, timestamptz, integer)
  from public, anon, authenticated;
