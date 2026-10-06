-- ============================================================================
-- Row Level Security
--
-- Read model: anonymous and signed-in visitors may read PUBLISHED content and
-- all reference data. Nothing is writable through the anon/authenticated keys.
--
-- Write model: content is authored with the service-role key (lib/db/admin.ts),
-- which bypasses RLS. When an admin UI arrives, replace that with explicit
-- policies keyed off an `admin` role or a JWT claim.
-- ============================================================================

alter table public.locale               enable row level security;
alter table public.event                enable row level security;
alter table public.event_translation    enable row level security;
alter table public.category             enable row level security;
alter table public.category_translation enable row level security;
alter table public.event_category       enable row level security;
alter table public.license              enable row level security;
alter table public.image                enable row level security;

-- --- reference data: world readable ----------------------------------------

create policy "locale is readable by everyone"
  on public.locale for select to anon, authenticated
  using (is_active);

create policy "license is readable by everyone"
  on public.license for select to anon, authenticated
  using (true);

create policy "category is readable by everyone"
  on public.category for select to anon, authenticated
  using (true);

create policy "category_translation is readable by everyone"
  on public.category_translation for select to anon, authenticated
  using (true);

-- --- content: published events only ----------------------------------------

create policy "published events are readable by everyone"
  on public.event for select to anon, authenticated
  using (status = 'published');

create policy "translations of published events are readable by everyone"
  on public.event_translation for select to anon, authenticated
  using (
    exists (
      select 1 from public.event e
      where e.id = event_translation.event_id
        and e.status = 'published'
    )
  );

create policy "images of published events are readable by everyone"
  on public.image for select to anon, authenticated
  using (
    exists (
      select 1 from public.event e
      where e.id = image.event_id
        and e.status = 'published'
    )
  );

create policy "category links of published events are readable by everyone"
  on public.event_category for select to anon, authenticated
  using (
    exists (
      select 1 from public.event e
      where e.id = event_category.event_id
        and e.status = 'published'
    )
  );

-- --- grants ----------------------------------------------------------------
-- RLS filters rows; grants decide which verbs are reachable at all.

grant select on
  public.locale,
  public.license,
  public.category,
  public.category_translation,
  public.event,
  public.event_translation,
  public.event_category,
  public.image,
  public.event_localized
to anon, authenticated;
