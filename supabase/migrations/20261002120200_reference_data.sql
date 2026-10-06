-- ============================================================================
-- Reference data the application depends on at runtime.
-- Idempotent: safe to re-run.
-- ============================================================================

-- Supported languages. English is the fallback for every other locale.
-- Swap/extend this list freely — no schema change is needed for a 6th language.
insert into public.locale (code, name, english_name, fallback_code, sort_order) values
  ('en', 'English',  'English', null, 10),
  ('tr', 'Türkçe',   'Turkish', 'en', 20),
  ('de', 'Deutsch',  'German',  'en', 30),
  ('fr', 'Français', 'French',  'en', 40),
  ('es', 'Español',  'Spanish', 'en', 50)
on conflict (code) do update
  set name         = excluded.name,
      english_name = excluded.english_name,
      sort_order   = excluded.sort_order;

-- Licenses commonly encountered when sourcing historical imagery.
insert into public.license (code, name, url, requires_attribution, allows_commercial, sort_order) values
  ('PD',           'Public domain',                      'https://en.wikipedia.org/wiki/Public_domain',       false, true,  10),
  ('PD-US',        'Public domain in the United States',  'https://en.wikipedia.org/wiki/Public_domain',       false, true,  20),
  ('CC0-1.0',      'CC0 1.0 Universal',                  'https://creativecommons.org/publicdomain/zero/1.0/', false, true,  30),
  ('CC-BY-4.0',    'Creative Commons BY 4.0',            'https://creativecommons.org/licenses/by/4.0/',       true,  true,  40),
  ('CC-BY-SA-4.0', 'Creative Commons BY-SA 4.0',         'https://creativecommons.org/licenses/by-sa/4.0/',    true,  true,  50),
  ('CC-BY-3.0',    'Creative Commons BY 3.0',            'https://creativecommons.org/licenses/by/3.0/',       true,  true,  60),
  ('CC-BY-SA-3.0', 'Creative Commons BY-SA 3.0',         'https://creativecommons.org/licenses/by-sa/3.0/',    true,  true,  70),
  ('CC-BY-NC-4.0', 'Creative Commons BY-NC 4.0',         'https://creativecommons.org/licenses/by-nc/4.0/',    true,  false, 80)
on conflict (code) do update
  set name                 = excluded.name,
      url                  = excluded.url,
      requires_attribution = excluded.requires_attribution,
      allows_commercial    = excluded.allows_commercial,
      sort_order           = excluded.sort_order;
