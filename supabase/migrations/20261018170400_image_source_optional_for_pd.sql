-- ============================================================================
-- TEMPUS — public-domain uploads may omit the source page
--
-- Panel uploads default to PD, and for PD / PD-US / CC0 there is nobody to
-- attribute and no licence term that needs the page; every other licence
-- still requires it.
-- ============================================================================

alter table public.image alter column source_page_url drop not null;

alter table public.image
  add constraint image_source_required_unless_pd
  check (license_code in ('PD', 'PD-US', 'CC0-1.0') or source_page_url is not null);
