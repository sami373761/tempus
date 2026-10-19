-- ============================================================================
-- TEMPUS — the database is the source of truth once an editor has touched an
-- event.
--
-- Set by every admin_* function that edits an event. The seed scripts
-- (scripts/seed-*.ts) leave such events' year, precision, status,
-- is_sensitive and translations alone and report them as skipped, so a
-- re-seed can never undo a correction made in the panel.
-- ============================================================================

alter table public.event add column admin_edited_at timestamptz;

comment on column public.event.admin_edited_at is
  'Last time the admin panel changed this event. Non-null rows are skipped by the seed scripts.';
