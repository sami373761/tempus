-- ============================================================================
-- Local development seed (`supabase db reset`). NOT part of the migrations and
-- never applied to production. Two events, to exercise BCE + CE paths.
-- ============================================================================

insert into public.category (id, slug, kind) values
  ('11111111-1111-4111-8111-000000000001', 'law',      'topic'),
  ('11111111-1111-4111-8111-000000000002', 'politics', 'topic'),
  ('11111111-1111-4111-8111-000000000003', 'warfare',  'topic'),
  ('11111111-1111-4111-8111-000000000004', 'ancient-near-east', 'era')
on conflict (slug) do nothing;

insert into public.category_translation (category_id, locale_code, name) values
  ('11111111-1111-4111-8111-000000000001', 'en', 'Law'),
  ('11111111-1111-4111-8111-000000000001', 'tr', 'Hukuk'),
  ('11111111-1111-4111-8111-000000000002', 'en', 'Politics'),
  ('11111111-1111-4111-8111-000000000003', 'en', 'Warfare'),
  ('11111111-1111-4111-8111-000000000004', 'en', 'Ancient Near East')
on conflict do nothing;

-- --- 1754 BCE: astronomical year = -1753 (BCE year n -> 1 - n) --------------

insert into public.event (id, slug, year, precision, status) values
  ('22222222-2222-4222-8222-000000000001', 'code-of-hammurabi', -1753, 'year', 'published')
on conflict (slug) do nothing;

insert into public.event_translation (event_id, locale_code, name, description) values
  ('22222222-2222-4222-8222-000000000001', 'en', 'Code of Hammurabi',
   'One of the earliest and most complete written legal codes, inscribed on a basalt stele in Babylon.'),
  ('22222222-2222-4222-8222-000000000001', 'tr', 'Hammurabi Kanunları',
   'Babil''de bir bazalt stel üzerine kazınmış, bilinen en eski ve en kapsamlı yazılı hukuk derlemelerinden biri.'),
  ('22222222-2222-4222-8222-000000000001', 'de', 'Codex Hammurapi',
   'Eine der frühesten und vollständigsten erhaltenen Gesetzessammlungen, in eine Basaltstele in Babylon gemeißelt.'),
  ('22222222-2222-4222-8222-000000000001', 'fr', 'Code de Hammurabi',
   'L''un des plus anciens et des plus complets codes juridiques écrits, gravé sur une stèle de basalte à Babylone.'),
  ('22222222-2222-4222-8222-000000000001', 'es', 'Código de Hammurabi',
   'Uno de los códigos legales escritos más antiguos y completos, grabado en una estela de basalto en Babilonia.')
on conflict do nothing;

insert into public.event_category (event_id, category_id) values
  ('22222222-2222-4222-8222-000000000001', '11111111-1111-4111-8111-000000000001'),
  ('22222222-2222-4222-8222-000000000001', '11111111-1111-4111-8111-000000000004')
on conflict do nothing;

insert into public.image (
  event_id, is_primary, r2_bucket, r2_object_key, mime_type, width, height,
  source_name, source_page_url, author, license_code, attribution_text
) values (
  '22222222-2222-4222-8222-000000000001', true,
  'history-images', 'events/code-of-hammurabi/stele.webp', 'image/webp', 1200, 1800,
  'Wikimedia Commons',
  'https://commons.wikimedia.org/wiki/File:P1050763_Louvre_code_Hammurabi_face_rwk.JPG',
  'Mbzt', 'CC-BY-3.0', 'Mbzt, CC BY 3.0, via Wikimedia Commons'
) on conflict do nothing;

-- --- 476 CE ----------------------------------------------------------------

insert into public.event (id, slug, year, month, day, precision, status) values
  ('22222222-2222-4222-8222-000000000002', 'fall-of-the-western-roman-empire', 476, 9, 4, 'day', 'published')
on conflict (slug) do nothing;

insert into public.event_translation (event_id, locale_code, name, description) values
  ('22222222-2222-4222-8222-000000000002', 'en', 'Fall of the Western Roman Empire',
   'Odoacer deposes Romulus Augustulus, the last emperor of the Western Roman Empire.'),
  ('22222222-2222-4222-8222-000000000002', 'tr', 'Batı Roma İmparatorluğu''nun Yıkılışı',
   'Odoacer, Batı Roma İmparatorluğu''nun son imparatoru Romulus Augustulus''u tahttan indirir.'),
  ('22222222-2222-4222-8222-000000000002', 'de', 'Untergang des Westromischen Reiches',
   'Odoaker setzt Romulus Augustulus ab, den letzten Kaiser des Westromischen Reiches.'),
  ('22222222-2222-4222-8222-000000000002', 'fr', 'Chute de l''Empire romain d''Occident',
   'Odoacre dépose Romulus Augustule, dernier empereur de l''Empire romain d''Occident.'),
  ('22222222-2222-4222-8222-000000000002', 'es', 'Caída del Imperio romano de Occidente',
   'Odoacro depone a Rómulo Augústulo, el último emperador del Imperio romano de Occidente.')
on conflict do nothing;

insert into public.event_category (event_id, category_id) values
  ('22222222-2222-4222-8222-000000000002', '11111111-1111-4111-8111-000000000002'),
  ('22222222-2222-4222-8222-000000000002', '11111111-1111-4111-8111-000000000003')
on conflict do nothing;

insert into public.image (
  event_id, is_primary, r2_bucket, r2_object_key, mime_type, width, height,
  source_name, source_page_url, author, license_code, attribution_text
) values (
  '22222222-2222-4222-8222-000000000002', true,
  'history-images', 'events/fall-of-the-western-roman-empire/romulus-augustulus.webp',
  'image/webp', 1600, 1000,
  'Wikimedia Commons',
  'https://commons.wikimedia.org/wiki/File:Romulus_Augustus_solidus.jpg',
  null, 'PD', 'Public domain, via Wikimedia Commons'
) on conflict do nothing;
