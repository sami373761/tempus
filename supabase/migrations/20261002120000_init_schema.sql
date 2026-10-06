-- ============================================================================
-- TEMPUS — initial schema
--
-- Domain: ~1,000 historical events, each with multilingual text, tags and one
-- primary image whose bytes live in Cloudflare R2 (never in Postgres).
--
-- Design notes
--   * Historical dates use ASTRONOMICAL YEAR NUMBERING so BCE/CE sorts and
--     compares as plain integer math:  1 BCE = 0, 2 BCE = -1, 1000 BCE = -999.
--   * Translations are rows, not columns: adding a 6th language is an INSERT.
--   * Images store only an R2 bucket + object key plus provenance metadata.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- How exact the stored date is. Drives rendering and game scoring tolerance.
create type public.date_precision as enum (
  'day',
  'month',
  'year',
  'decade',
  'century',
  'millennium'
);

create type public.publication_status as enum (
  'draft',
  'review',
  'published',
  'archived'
);

-- Lets a single table serve topical tags, regions and eras.
create type public.category_kind as enum (
  'topic',
  'region',
  'era',
  'other'
);

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at is
  'Trigger helper: stamps updated_at on every UPDATE.';

-- Renders an astronomical year as a human label: 0 -> '1 BCE', 1066 -> '1066 CE'.
-- bigint, so deep-time years (e.g. -4539999999 = 4.54 billion BCE) are in range.
create or replace function public.historical_year_label(p_year bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_year <= 0 then (1 - p_year)::text || ' BCE'
    else p_year::text || ' CE'
  end;
$$;

-- ---------------------------------------------------------------------------
-- locale — supported languages (reference data, not an enum, so the set of
-- languages can grow without a schema migration)
-- ---------------------------------------------------------------------------

create table public.locale (
  code           text        primary key,
  name           text        not null,
  english_name   text        not null,
  fallback_code  text        references public.locale (code) on update cascade,
  is_active      boolean     not null default true,
  sort_order     smallint    not null default 100,

  constraint locale_code_format check (code ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  constraint locale_no_self_fallback check (fallback_code is distinct from code)
);

comment on table public.locale is 'BCP 47 language tags the content is translated into.';
comment on column public.locale.name is 'Endonym, e.g. "Deutsch".';
comment on column public.locale.fallback_code is 'Locale to fall back to when a translation row is missing.';

-- ---------------------------------------------------------------------------
-- event — one historical event, language-neutral
-- ---------------------------------------------------------------------------

create table public.event (
  id          uuid                    primary key default gen_random_uuid(),
  slug        text                    not null unique,

  -- Astronomical year numbering: negative/zero = BCE, positive = CE.
  --   1000 BCE -> -999      500 BCE -> -499      1 BCE -> 0      1000 CE -> 1000
  -- bigint because the dataset reaches cosmological scale:
  --   4.54 billion BCE (formation of the Earth) -> -4539999999
  year        bigint                  not null,
  month       smallint,
  day         smallint,
  precision   public.date_precision   not null default 'year',

  -- Monotonic integer key for ORDER BY / BETWEEN across the whole timeline.
  -- Unknown month/day collapse to Jan 1, which keeps ordering stable.
  -- Max magnitude is ~1.5e14, four orders of magnitude inside bigint's range.
  sort_key    bigint generated always as (
                year * 10000
                + coalesce(month, 1)::bigint * 100
                + coalesce(day, 1)::bigint
              ) stored,

  status      public.publication_status not null default 'draft',

  created_at  timestamptz             not null default now(),
  updated_at  timestamptz             not null default now(),

  constraint event_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint event_year_range check (year between -15000000000 and 3000),
  constraint event_month_range check (month is null or month between 1 and 12),
  constraint event_day_range check (day is null or day between 1 and 31),
  constraint event_day_requires_month check (day is null or month is not null),
  -- Stored parts must match the declared precision.
  constraint event_precision_matches_parts check (
    case precision
      when 'day'   then month is not null and day is not null
      when 'month' then month is not null and day is null
      else              month is null     and day is null
    end
  )
);

comment on table public.event is 'A historical event. Language-neutral; text lives in event_translation.';
comment on column public.event.year is
  'Astronomical year numbering: 1 BCE = 0, 2 BCE = -1, 1000 BCE = -999, 4.54 billion BCE = -4539999999. Sorts numerically across the BCE/CE boundary.';
comment on column public.event.sort_key is
  'Generated year*10000 + month*100 + day. Monotonic over the full timeline; use for ordering and range queries.';

create index event_sort_key_idx on public.event (sort_key);
create index event_status_sort_key_idx on public.event (status, sort_key);
create index event_year_idx on public.event (year);

create trigger event_set_updated_at
  before update on public.event
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- event_translation — one row per (event, locale)
-- Extend with new translatable fields by adding columns here.
-- ---------------------------------------------------------------------------

create table public.event_translation (
  event_id     uuid        not null references public.event (id) on delete cascade,
  locale_code  text        not null references public.locale (code) on update cascade,

  name         text        not null,
  description  text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  primary key (event_id, locale_code),
  constraint event_translation_name_not_blank check (length(btrim(name)) > 0)
);

comment on table public.event_translation is
  'Localized name/description per event. Adding a language = inserting rows, not altering the schema.';

create index event_translation_locale_idx on public.event_translation (locale_code);

create trigger event_translation_set_updated_at
  before update on public.event_translation
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- category / category_translation / event_category
-- ---------------------------------------------------------------------------

create table public.category (
  id          uuid                  primary key default gen_random_uuid(),
  slug        text                  not null unique,
  kind        public.category_kind  not null default 'topic',
  created_at  timestamptz           not null default now(),
  updated_at  timestamptz           not null default now(),

  constraint category_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

comment on table public.category is 'Tags/categories: topics, regions or eras, distinguished by kind.';

create trigger category_set_updated_at
  before update on public.category
  for each row execute function public.set_updated_at();

create table public.category_translation (
  category_id  uuid        not null references public.category (id) on delete cascade,
  locale_code  text        not null references public.locale (code) on update cascade,

  name         text        not null,
  description  text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  primary key (category_id, locale_code),
  constraint category_translation_name_not_blank check (length(btrim(name)) > 0)
);

create index category_translation_locale_idx on public.category_translation (locale_code);

create trigger category_translation_set_updated_at
  before update on public.category_translation
  for each row execute function public.set_updated_at();

create table public.event_category (
  event_id     uuid        not null references public.event (id) on delete cascade,
  category_id  uuid        not null references public.category (id) on delete cascade,
  created_at   timestamptz not null default now(),

  primary key (event_id, category_id)
);

comment on table public.event_category is 'Many-to-many: an event has one or more categories.';

create index event_category_category_idx on public.event_category (category_id);

-- ---------------------------------------------------------------------------
-- license — reference data for image rights
-- ---------------------------------------------------------------------------

create table public.license (
  code                 text     primary key,
  name                 text     not null,
  url                  text,
  requires_attribution boolean  not null default true,
  allows_commercial    boolean  not null default true,
  sort_order           smallint not null default 100
);

comment on table public.license is 'Normalized licenses referenced by images (CC-BY-4.0, public domain, ...).';

-- ---------------------------------------------------------------------------
-- image — pointer to a Cloudflare R2 object + provenance. No binary data here.
-- ---------------------------------------------------------------------------

create table public.image (
  id                uuid        primary key default gen_random_uuid(),
  event_id          uuid        not null references public.event (id) on delete cascade,
  is_primary        boolean     not null default false,

  -- Location in R2. The public URL is built in the app layer as
  -- `${NEXT_PUBLIC_R2_PUBLIC_BASE_URL}/${r2_object_key}`.
  r2_bucket         text        not null,
  r2_object_key     text        not null,

  -- File metadata (used for <Image> sizing, cache busting, integrity checks).
  mime_type         text        not null,
  byte_size         bigint,
  width             integer,
  height            integer,
  checksum_sha256   text,

  -- Provenance and rights.
  source_name       text,
  source_page_url   text        not null,
  author            text,
  license_code      text        not null references public.license (code) on update cascade,
  attribution_text  text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint image_object_unique unique (r2_bucket, r2_object_key),
  constraint image_object_key_format check (r2_object_key ~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$'),
  constraint image_mime_type_supported check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
  ),
  constraint image_source_page_url_http check (source_page_url ~ '^https?://'),
  constraint image_width_positive check (width is null or width > 0),
  constraint image_height_positive check (height is null or height > 0),
  constraint image_byte_size_positive check (byte_size is null or byte_size > 0),
  constraint image_checksum_format check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$')
);

comment on table public.image is
  'Metadata for an image stored in Cloudflare R2. Postgres holds the object key only, never the bytes.';
comment on column public.image.r2_object_key is
  'Full R2 object key, e.g. events/<event-slug>/<uuid>.webp';

-- At most one primary image per event.
create unique index image_one_primary_per_event
  on public.image (event_id)
  where is_primary;

create index image_event_idx on public.image (event_id);

create trigger image_set_updated_at
  before update on public.image
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- event_localized — flattened read model for game queries:
-- one row per (event, locale) with the primary image joined in.
-- security_invoker keeps the callers RLS policies in force.
-- ---------------------------------------------------------------------------

create view public.event_localized
with (security_invoker = true) as
select
  e.id                as event_id,
  e.slug,
  e.year,
  e.month,
  e.day,
  e.precision,
  e.sort_key,
  e.status,
  public.historical_year_label(e.year) as year_label,
  t.locale_code,
  t.name,
  t.description,
  i.id                as image_id,
  i.r2_bucket         as image_bucket,
  i.r2_object_key     as image_object_key,
  i.mime_type         as image_mime_type,
  i.width             as image_width,
  i.height            as image_height,
  i.source_name       as image_source_name,
  i.source_page_url   as image_source_page_url,
  i.author            as image_author,
  i.license_code      as image_license_code,
  i.attribution_text  as image_attribution_text
from public.event e
join public.event_translation t on t.event_id = e.id
left join public.image i on i.event_id = e.id and i.is_primary;

comment on view public.event_localized is
  'Read model for the game: event + one locales text + its primary image.';
