-- ============================================================================
-- TEMPUS — manual TP corrections
--
-- An admin correction is a new ledger row, never an edit of an old one:
-- kind = 'adjustment', a signed amount, source 'adjust:<audit id>' so the
-- (user_id, source) idempotency key still holds. Every total is sum(tp), so
-- nothing downstream changes. Paired with lib/game/points.ts (SCORE_KINDS).
-- ============================================================================

alter table public.score_entry drop constraint score_entry_kind_check;
alter table public.score_entry
  add constraint score_entry_kind_check
  check (kind in ('round', 'set', 'flawless', 'streak', 'daily-streak', 'versus', 'adjustment'));

alter table public.score_entry drop constraint score_entry_tp_check;
alter table public.score_entry
  add constraint score_entry_tp_check
  check (case when kind = 'adjustment' then tp <> 0 else tp > 0 end);
