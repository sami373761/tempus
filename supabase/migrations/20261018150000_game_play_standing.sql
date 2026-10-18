-- ============================================================================
-- TEMPUS — the subject modes' daily limit, read off the set ledger
--
-- This replaces `public.game_play` from 20261018140000, which never held a row
-- outside its own test. That table counted games by a **client-chosen set id**,
-- and the hole in it is the one a dedicated table cannot close: a client that
-- reuses one id plays an unlimited number of games, because every claim after
-- the first is indistinguishable from a retry. Bounding that would have meant
-- counting rounds, keyed on the signed round id, in a second table — which is
-- `public.solo_answer` and `public.solo_set`, both of which already exist.
--
-- So an account's games are not recorded twice. `solo_set` **is** the record:
-- one row per set, created by its first banked round, with `answered` and
-- `closed_at` policed by `bank_solo_round` under `select ... for update`. That
-- gives the limit three things for nothing:
--
--   * games begun today is `count(*)` over the rows created since midnight UTC;
--   * a set already underway is a row that exists, so continuing a game the
--     day has paid for needs no second allowance;
--   * a set id is worth exactly `p_set_size` rounds and no more, because the
--     set closes — so reusing one buys one game, not an afternoon.
--
-- Nothing here writes. The function is a read the reveal makes before it
-- grades (`revealDateRound` in app/actions/scoring.ts), and the write that
-- moves the number is the banking that was going to happen anyway.
--
-- **A guest is not in here**, for the reason they were not in the dropped
-- table: there is no account to key a row to. Their one game a day lives in a
-- cookie (lib/game/play-ledger.ts), which is a soft limit by construction —
-- the answer to that is the sign-up notice, not a stricter store.
--
-- Service role only, like everything that reads `solo_set`.
-- ============================================================================

drop function if exists public.game_claim_play(uuid, text, uuid, date, integer);
drop function if exists public.game_plays_used(uuid, text, date);
drop table if exists public.game_play;

-- ---------------------------------------------------------------------------
-- Where one player stands in one subject mode today.
--
-- Returns the three facts the caller needs and no decision, because the limit
-- itself is TypeScript's (`playsPerDay` in lib/game/play-limit.ts) and must
-- not be a number in two places:
--
--   used        sets of this game begun since p_since
--   continuing  p_set_id is a set of this game that this player has begun
--   set_open    ...and it still has rounds left, so it may be played on
--
-- `p_set_id` may be null, which is the page's question — how many games are
-- left — rather than a round's.
--
-- **The race is a single extra game and is left open on purpose.** Two tabs
-- whose first guesses land in the same instant both read the same `used` and
-- both start a set. Closing it would mean taking a lock on a read that every
-- graded round makes, to prevent something that needs two simultaneous first
-- guesses and costs one game of ten questions.
-- ---------------------------------------------------------------------------
create function public.game_play_standing(
  p_user_id uuid,
  p_game text,
  p_set_id uuid,
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

  return jsonb_build_object(
    'used', v_used,
    'continuing', v_set.id is not null,
    'set_open',
      v_set.id is not null
        and v_set.closed_at is null
        and v_set.answered < p_set_size
  );
end;
$$;

comment on function public.game_play_standing(uuid, text, uuid, timestamptz, integer) is
  'Subject-mode games this account has begun since p_since, and whether '
  'p_set_id is one of them that can still be played on. Read-only; the limit '
  'is the caller''s (lib/game/play-limit.ts). Service role only.';

revoke all on function
  public.game_play_standing(uuid, text, uuid, timestamptz, integer)
  from public, anon, authenticated;
