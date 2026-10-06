-- ============================================================================
-- Defense in depth on table privileges.
--
-- Supabase grants anon and authenticated ALL privileges on every new table in
-- `public` by default (ALTER DEFAULT PRIVILEGES). RLS is what actually stops
-- writes on the content tables — there are no INSERT/UPDATE/DELETE policies —
-- but leaving the grants in place means any future permissive policy silently
-- opens a write path. Remove the grants so both layers have to be opened
-- deliberately.
--
-- service_role is unaffected: it bypasses RLS and keeps its own privileges.
-- ============================================================================

revoke insert, update, delete, truncate, references, trigger
  on public.locale,
     public.license,
     public.category,
     public.category_translation,
     public.event,
     public.event_translation,
     public.event_category,
     public.image
  from anon, authenticated;

-- The read model is a view; SELECT is all it should ever offer.
revoke insert, update, delete, truncate, references, trigger
  on public.event_localized
  from anon, authenticated;
