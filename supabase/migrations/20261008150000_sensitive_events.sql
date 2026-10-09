-- ============================================================================
-- Sensitive photographs: a flag, not a list in the code.
--
-- A few of the events this game teaches are atrocities, and their photographs
-- are the kind a player should choose to look at rather than have dealt to
-- them face up in the middle of a round. `is_sensitive` marks those events;
-- the UI blurs the picture behind a reveal control (`EventVisual` in
-- components/event-visual.tsx) wherever it is shown.
--
-- It is a column rather than a hardcoded set of slugs because which events
-- deserve it is an editorial judgement that will grow with the dataset, and
-- because the admin panel that is coming will need to set it without a deploy.
-- It lives on `event` rather than on `image` because the judgement is about
-- the subject, so replacing the photograph must not quietly clear the flag.
--
-- No new grants and no new policies: the column inherits the table's SELECT
-- (content is world-readable) and the table's revoked write privileges, so it
-- is editable only through the service role, like every other content column.
-- ============================================================================

alter table public.event
  add column if not exists is_sensitive boolean not null default false;

comment on column public.event.is_sensitive is
  'True when this event''s photograph should be shown blurred behind a reveal control. Editorial judgement about the subject, not a property of the image file.';

-- The read model has to carry it: the games draw from this view and never from
-- `event` directly, so a flag the view does not expose cannot reach a player.
-- Appended at the end of the column list because `create or replace view`
-- allows new columns only after the existing ones.
create or replace view public.event_localized
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
  i.attribution_text  as image_attribution_text,
  e.is_sensitive
from public.event e
join public.event_translation t on t.event_id = e.id
left join public.image i on i.event_id = e.id and i.is_primary;

comment on view public.event_localized is
  'Read model for the game: event + one locales text + its primary image.';

-- The first event to carry the flag. The photograph attached to the Rwandan
-- genocide is of its victims.
update public.event set is_sensitive = true where slug = 'rwandan-genocide';
