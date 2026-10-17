-- ============================================================================
-- TEMPUS — taking a badge off
--
-- `profile.worn_badge` null meant "show my highest", so there was no way to
-- show nothing at all. The badges page now has one control per card that puts
-- that badge on or takes it off (components/badge-showcase.tsx), and "off"
-- has to be a state of its own: with only the null, taking a badge off would
-- just put the highest one back on.
--
-- A flag rather than a sentinel slug, because `worn_badge` is a foreign key to
-- `badge` and a fake row there would be a seventh badge to every reader.
-- Default false, so every existing player keeps showing their highest.
-- ============================================================================

alter table public.profile
  add column badge_off boolean not null default false;

comment on column public.profile.badge_off is
  'True: the player took their badge off and shows none. Cleared by wearing '
  'one. Set by the service role only.';

create or replace function public.shown_badge(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select p.badge_off from public.profile p where p.id = p_user_id) then null
    else coalesce(
      (select p.worn_badge
       from public.profile p
       join public.user_badge_progress u
         on u.user_id = p.id and u.badge_slug = p.worn_badge and u.unlocked_at is not null
       where p.id = p_user_id),
      (select u.badge_slug
       from public.user_badge_progress u
       join public.badge b on b.slug = u.badge_slug
       where u.user_id = p_user_id and u.unlocked_at is not null
       order by b.sort_order desc
       limit 1)
    )
  end;
$$;

revoke all on function public.shown_badge(uuid) from public, anon, authenticated;
