-- ============================================================================
-- TEMPUS — "you have a new badge" on the menu
--
-- A badge is earned somewhere that is not the badges page: at the end of a
-- solo set, or — for a head-to-head win — by a trigger with no screen
-- attached at all. The set summary says so once and is then gone, so a player
-- who looked away at the wrong moment never learns they have one. This column
-- is the nudge that outlives that moment: the menu's Achievements row carries
-- the count until the page it points at has been opened.
--
-- **A count, not a flag.** Two badges can land in one set (a rung and the
-- quest above it), and "1" when there are two would be the kind of small lie
-- that teaches people to ignore the mark. Capped at 99 by the check, which is
-- sixteen times more badges than exist — the cap is there so a runaway caller
-- cannot write a number the pill has no room for, not because the number is
-- expected to be large.
--
-- **Existing players start at zero**, which is what the default gives them:
-- the mark means "earned since this shipped", and waking every account up to
-- a count of their whole history would be a notification about nothing.
--
-- **Service role only**, like every other column on this table that is not
-- `username`: it is left out of the `update (username)` grant, so the two
-- functions below are the only way it moves. A player who could write it
-- could not award themselves anything — but they could clear a nudge they
-- never saw, and the honest reason is simpler: nothing a client sends is
-- needed to work out either number.
--
-- Read, though, is the player's own: `select` on the whole row is already
-- granted to `authenticated` under the "a player reads their own profile"
-- policy (20261006130000_accounts_and_badges.sql), so the menu picks this up
-- in the read it already makes for the username. No new round trip.
-- ============================================================================

alter table public.profile
  add column unseen_badges smallint not null default 0
    check (unseen_badges between 0 and 99);

comment on column public.profile.unseen_badges is
  'Badges earned but not yet looked at, for the mark on the menu''s '
  'Achievements row. Written only by note_badges_earned()/mark_badges_seen().';

-- ---------------------------------------------------------------------------
-- Earned: add to the count.
--
-- An increment rather than a write of the total, because the caller knows
-- only what *this* refresh discovered — `refreshBadges` in lib/db/scoring.ts
-- compares the ladder against what was already unlocked, so it reports a
-- delta. `least` applies the check's ceiling here rather than letting the
-- constraint raise: a badge that cannot be announced must not be a badge that
-- cannot be awarded.
--
-- Returns the new count so a caller that wants to show it does not need a
-- second read. Nothing uses that yet.
-- ---------------------------------------------------------------------------
create function public.note_badges_earned(
  p_user_id uuid,
  p_count integer
)
returns smallint
language sql
volatile
security definer
set search_path = ''
as $$
  update public.profile
     set unseen_badges = least(unseen_badges + greatest(p_count, 0), 99)
   where id = p_user_id
  returning unseen_badges;
$$;

comment on function public.note_badges_earned(uuid, integer) is
  'Add newly earned badges to the unseen count. Service role only.';

-- ---------------------------------------------------------------------------
-- Looked at: back to zero.
--
-- Called by the badges page itself, which is the only definition of "seen"
-- that does not need a second thing to be true. Unconditional rather than
-- "only if non-zero": the page writes it on every visit, and an update that
-- changes nothing is cheaper than a read that decides whether to make one.
-- ---------------------------------------------------------------------------
create function public.mark_badges_seen(p_user_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.profile
     set unseen_badges = 0
   where id = p_user_id and unseen_badges <> 0;
$$;

comment on function public.mark_badges_seen(uuid) is
  'Clear the unseen-badge count, because the player is looking at them. '
  'Service role only.';

revoke all on function public.note_badges_earned(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.mark_badges_seen(uuid)
  from public, anon, authenticated;
