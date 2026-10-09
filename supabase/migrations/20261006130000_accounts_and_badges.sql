-- ============================================================================
-- TEMPUS — accounts and badge progress
--
-- The site had no accounts at all until now: Supabase Auth was wired up for an
-- admin claim and nothing else, and every game lived in component state. This
-- adds the two tables a player needs to exist.
--
-- `public.profile` is the one row per account, keyed on `auth.users.id`. Only a
-- username lives in it, because that is the only thing about a player the site
-- displays — the email, the password and the provider all stay in `auth`, where
-- they are Supabase's to keep.
--
-- `public.user_badge_progress` is **deliberately not an achievement system.**
-- The rules by which a badge is earned are not decided yet (the criteria on
-- /achievements are prose, not code), so this stores the *shape* of progress
-- and nothing about how it is computed: a count, the count it is heading for,
-- when it was unlocked, and a jsonb column for whatever the eventual rule needs
-- to remember. When the rules arrive they fill these rows; nothing here has to
-- be rebuilt to let them.
--
-- **This is the first table on the site whose rows belong to a caller, and so
-- the first one that is written through RLS rather than through the service
-- role.** That is a deliberate departure from "writes go through the service
-- role" (CLAUDE.md), not an oversight. That rule exists because content has no
-- owner a policy could name and `event_date_challenge` had no identity to key
-- on — so ownership had to be re-checked in TypeScript. Here `auth.uid()` *is*
-- the owner, and a policy that says `id = auth.uid()` is strictly stronger than
-- an application check: it holds even if a future Server Action forgets to make
-- one. Badge progress stays service-role-only, because a player must not be
-- able to award themselves a badge.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Usernames.
--
-- Folded to lower case and stripped of anything that is not a letter, a digit
-- or an underscore, so "one username per spelling" is a plain unique index
-- rather than a case-insensitive one. Returns null rather than raising when
-- there is nothing usable left — the caller then gets a profile with no
-- username and is asked for one on the account page, which is better than a
-- sign-up that fails because someone's Google display name was two emoji.
-- ---------------------------------------------------------------------------
create or replace function public.normalize_username(raw text)
returns text
language sql
immutable
as $$
  select case
    when length(cleaned) between 3 and 20 then cleaned
    else null
  end
  from (
    select substring(
      regexp_replace(lower(coalesce(raw, '')), '[^a-z0-9_]', '', 'g')
      from 1 for 20
    ) as cleaned
  ) s;
$$;

comment on function public.normalize_username(text) is
  'Folds a candidate username to the stored form, or null when nothing usable '
  'is left. The unique index is on this output, so case can never collide.';

create table public.profile (
  id uuid primary key references auth.users (id) on delete cascade,

  -- Nullable on purpose: a Google sign-in arrives with a display name that may
  -- be taken or unusable, and a sign-up that 500s over a name collision is a
  -- worse trade than an account that asks for one on first visit.
  username text
    check (username is null or username = public.normalize_username(username)),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profile is
  'One row per account. Only the display name lives here — email, password and '
  'identity provider stay in auth.users.';

-- Partial, so the many rows with no username yet do not collide with each
-- other. `normalize_username` already lower-cased it, so a plain index on the
-- column is the case-insensitive one.
create unique index profile_username_key
  on public.profile (username)
  where username is not null;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profile_touch_updated_at
  before update on public.profile
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- The six badges, as reference data.
--
-- Identity and the target a progress row counts towards are data; the artwork
-- and the ring geometry stay in `lib/badges.ts`, where they have to be anyway
-- (a badge is a PNG with a measured hole in it). The point of the table is the
-- foreign key below — a typo'd slug cannot create an orphan progress row — and
-- having one place for the targets when the rules land.
--
-- `default_target` is transcribed from the criteria already written on
-- /achievements, not invented here: finish one set, 6 of 10, 8 of 10, 10 of 10,
-- win ten duels, a Perfect in each of the four eras.
-- ---------------------------------------------------------------------------
create table public.badge (
  slug text primary key check (slug = lower(slug) and slug ~ '^[a-z][a-z0-9-]*$'),
  sort_order integer not null,
  default_target integer not null check (default_target > 0),
  -- Whether it sits on the one ladder you climb or outside it. Mirrors
  -- `Badge.rank` in lib/badges.ts.
  is_rank boolean not null default true
);

comment on table public.badge is
  'The badges that exist, and the count each ones progress heads towards. '
  'Artwork and ring geometry live in lib/badges.ts.';

insert into public.badge (slug, sort_order, default_target, is_rank) values
  ('bronze',   1,  1, true),
  ('silver',   2,  6, true),
  ('gold',     3,  8, true),
  ('diamond',  4, 10, true),
  ('ruby',     5, 10, false),
  ('amethyst', 6,  4, false);

create table public.user_badge_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  badge_slug text not null references public.badge (slug) on update cascade,

  -- How far along, and what it is heading for. Two plain integers rather than a
  -- percentage, because every criterion already written down is a count of
  -- something and a percentage cannot be incremented.
  progress integer not null default 0 check (progress >= 0),
  target integer not null check (target > 0),

  -- Set once, when the badge is earned. Null is "not yet", which is also what
  -- makes "my badges" a `where unlocked_at is not null` rather than a flag that
  -- can disagree with the counts.
  unlocked_at timestamptz,

  -- The extension point. Whatever the eventual rule has to remember between
  -- rounds — which eras have had a Perfect, a best-set score, a streak — goes
  -- in here rather than becoming a column per badge.
  details jsonb not null default '{}'::jsonb,

  updated_at timestamptz not null default now(),

  primary key (user_id, badge_slug)
);

comment on table public.user_badge_progress is
  'One row per (player, badge): how far along they are and when they earned it. '
  'Deliberately says nothing about HOW progress is computed — the rules are not '
  'decided yet. Written only by the service role.';

create trigger user_badge_progress_touch_updated_at
  before update on public.user_badge_progress
  for each row execute function public.touch_updated_at();

-- "The badges this player has earned, most recent first" is the only read that
-- is not keyed on the whole primary key.
create index user_badge_progress_unlocked_idx
  on public.user_badge_progress (user_id, unlocked_at desc)
  where unlocked_at is not null;

-- ---------------------------------------------------------------------------
-- A profile for every account, created by the database rather than by the
-- sign-up path.
--
-- In the database because there are three ways in — email sign-up, Google, and
-- whatever is added next — and a profile created by one of them is a profile
-- the others forget. `security definer` is what lets it write a table the new
-- user has no grant on yet.
--
-- The exception block is the whole reason this is plpgsql: a taken username
-- must not fail the sign-up. The account is created with no name and the
-- account page asks for one.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
begin
  candidate := public.normalize_username(
    coalesce(
      new.raw_user_meta_data ->> 'username',
      new.raw_user_meta_data ->> 'preferred_username',
      new.raw_user_meta_data ->> 'user_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  );

  begin
    insert into public.profile (id, username) values (new.id, candidate);
  exception
    when unique_violation then
      insert into public.profile (id, username) values (new.id, null)
      on conflict (id) do nothing;
  end;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates public.profile for a new auth.users row. A taken username is '
  'swallowed and the profile is left unnamed rather than failing the sign-up.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security and grants.
--
-- Supabase grants anon and authenticated ALL privileges on every new table in
-- `public` by default, so both of these ship world-writable unless the grants
-- are revoked as well as the policies withheld (CLAUDE.md). Revoke first, then
-- hand back exactly what the site needs.
-- ---------------------------------------------------------------------------
alter table public.profile enable row level security;
alter table public.user_badge_progress enable row level security;
alter table public.badge enable row level security;

revoke all on public.profile from anon, authenticated;
revoke all on public.user_badge_progress from anon, authenticated;
revoke all on public.badge from anon, authenticated;

-- A player reads and renames their own row and nobody else's. There is no
-- policy for insert or delete: the trigger above does the one and
-- `on delete cascade` from auth.users does the other.
create policy "a player reads their own profile"
  on public.profile for select to authenticated
  using (id = auth.uid());

create policy "a player renames their own profile"
  on public.profile for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Read-only, and only your own. A badge you have not earned is a row you can
-- see the progress of; awarding one is a write, and there is no write policy at
-- all — only the service role can set `unlocked_at`.
create policy "a player reads their own badge progress"
  on public.user_badge_progress for select to authenticated
  using (user_id = auth.uid());

-- Reference data, like `locale` and `license`.
create policy "badges are readable by everyone"
  on public.badge for select to anon, authenticated
  using (true);

grant select on public.badge to anon, authenticated;
grant select on public.user_badge_progress to authenticated;
-- Column-scoped on purpose: `id`, `created_at` and `updated_at` are not the
-- player's to set, and a column grant is a cheaper guarantee of that than a
-- trigger that checks for tampering.
grant select, update (username) on public.profile to authenticated;
