-- ============================================================================
-- The "Born When?" subject pool, and the one fact about these events the other
-- pools have no equivalent of.
--
-- Two kinds of row here, and the difference between them is load-bearing — the
-- same split the film & television migration makes
-- (20261009120000_screen_topic_category.sql), for the same two reasons:
--
--   * `when-born` is `kind = 'topic'`, exactly like `football` and `screen`.
--     That is what decides which game may deal these events: a topic link says
--     which subject pool an event belongs to, and the general games (date
--     guessing, comparison, daily, survival, head-to-head) draw only from
--     events that carry none. So the pool is opt-in on both sides —
--     `randomEvents` / `countPublishedEvents` in lib/db/queries.ts is the
--     single place it is applied, and nothing about any existing draw changes.
--
--     It matters more here than it did for the films. These 150 people are
--     dated by *birth year*, which is a different question from the one the
--     date-guessing game asks about its 500 events ("when did this happen").
--     Without the topic link, `/guess` would start dealing a photograph of
--     Mozart and grading the answer against 1756 while telling the player
--     nothing about which of his dates was wanted.
--
--   * The fourteen fields are `kind = 'other'`, which is deliberately *not* a
--     pool. `poolRestriction()` reads `kind = 'topic'` and nothing else, so
--     these are invisible to every draw; they exist because the dataset knows
--     what each person is known for and the game prints it on the photograph.
--     A portrait bust with no label is close to unanswerable — see
--     lib/game/when-born.ts for why the pill is part of the round.
--
-- Filing the field as a category rather than a column on `event` is what keeps
-- it a data change: `event` is shared by 500 historical events, 97 football
-- ones, 200 films and these, so a `field` column would be null for 797 of
-- them. The same reasoning as the eras, which are also categories.
--
-- Three of the fourteen slugs are not the source file's word for them. The data
-- says `religious`, `business` and `movie`-style bare adjectives; `kind =
-- 'other'` slugs are read by people as well as code, so the stored slugs are
-- `religious-figure` and `entrepreneur`. `scripts/parse-when-born.ts` holds the
-- one mapping between the two, and `PERSON_FIELDS` in lib/game/when-born.ts is
-- the list the client validates against.
--
-- No new table, so there are no default grants to revoke: `category`,
-- `category_translation` and `event_category` already carry the content
-- policies (anon/authenticated SELECT only).
--
-- The era trigger deletes `kind = 'era'` links only, so both the topic link and
-- the field link survive an edit to an event's year. That is worth stating for
-- this pool in particular: fifteen of these people were born BCE, so their era
-- links are the ones most likely to be recomputed.
-- ============================================================================

insert into public.category (slug, kind) values
  ('when-born',        'topic'),
  ('leader',           'other'),
  ('religious-figure', 'other'),
  ('philosopher',      'other'),
  ('explorer',         'other'),
  ('scientist',        'other'),
  ('inventor',         'other'),
  ('writer',           'other'),
  ('artist',           'other'),
  ('musician',         'other'),
  ('actor',            'other'),
  ('director',         'other'),
  ('athlete',          'other'),
  ('entrepreneur',     'other'),
  ('activist',         'other')
on conflict (slug) do update set kind = excluded.kind;

insert into public.category_translation (category_id, locale_code, name)
select c.id, v.locale_code, v.name
from (values
  -- The pool. Named as the home board already names it, in all five languages
  -- — see `whenBornTitle` in lib/i18n/dictionary.ts.
  ('when-born', 'en', 'Born When?'),
  ('when-born', 'tr', 'Ne zaman doğdu?'),
  ('when-born', 'de', 'Wann geboren?'),
  ('when-born', 'fr', 'Né quand ?'),
  ('when-born', 'es', '¿Cuándo nació?'),

  -- The fourteen fields. Singular and capitalised, because every one of them
  -- is printed as a pill naming the one person on screen rather than as a
  -- heading over a group.
  --
  -- German takes `Herrscher` for `leader` rather than the literal translation,
  -- which is unusable in German for reasons that have nothing to do with this
  -- game. `Herrscher` ("ruler") is in any case the better word for a pool of
  -- pharaohs, emperors and presidents.
  ('leader', 'en', 'Leader'),
  ('leader', 'tr', 'Lider'),
  ('leader', 'de', 'Herrscher'),
  ('leader', 'fr', 'Dirigeant'),
  ('leader', 'es', 'Líder'),

  ('religious-figure', 'en', 'Religious Figure'),
  ('religious-figure', 'tr', 'Dini Önder'),
  ('religious-figure', 'de', 'Religiöse Figur'),
  ('religious-figure', 'fr', 'Figure religieuse'),
  ('religious-figure', 'es', 'Figura religiosa'),

  ('philosopher', 'en', 'Philosopher'),
  ('philosopher', 'tr', 'Filozof'),
  ('philosopher', 'de', 'Philosoph'),
  ('philosopher', 'fr', 'Philosophe'),
  ('philosopher', 'es', 'Filósofo'),

  ('explorer', 'en', 'Explorer'),
  ('explorer', 'tr', 'Kaşif'),
  ('explorer', 'de', 'Entdecker'),
  ('explorer', 'fr', 'Explorateur'),
  ('explorer', 'es', 'Explorador'),

  ('scientist', 'en', 'Scientist'),
  ('scientist', 'tr', 'Bilim İnsanı'),
  ('scientist', 'de', 'Wissenschaftler'),
  ('scientist', 'fr', 'Scientifique'),
  ('scientist', 'es', 'Científico'),

  ('inventor', 'en', 'Inventor'),
  ('inventor', 'tr', 'Mucit'),
  ('inventor', 'de', 'Erfinder'),
  ('inventor', 'fr', 'Inventeur'),
  ('inventor', 'es', 'Inventor'),

  ('writer', 'en', 'Writer'),
  ('writer', 'tr', 'Yazar'),
  ('writer', 'de', 'Schriftsteller'),
  ('writer', 'fr', 'Écrivain'),
  ('writer', 'es', 'Escritor'),

  ('artist', 'en', 'Artist'),
  ('artist', 'tr', 'Sanatçı'),
  ('artist', 'de', 'Künstler'),
  ('artist', 'fr', 'Artiste'),
  ('artist', 'es', 'Artista'),

  ('musician', 'en', 'Musician'),
  ('musician', 'tr', 'Müzisyen'),
  ('musician', 'de', 'Musiker'),
  ('musician', 'fr', 'Musicien'),
  ('musician', 'es', 'Músico'),

  ('actor', 'en', 'Actor'),
  ('actor', 'tr', 'Oyuncu'),
  ('actor', 'de', 'Schauspieler'),
  ('actor', 'fr', 'Acteur'),
  ('actor', 'es', 'Actor'),

  ('director', 'en', 'Director'),
  ('director', 'tr', 'Yönetmen'),
  ('director', 'de', 'Regisseur'),
  ('director', 'fr', 'Réalisateur'),
  ('director', 'es', 'Director'),

  ('athlete', 'en', 'Athlete'),
  ('athlete', 'tr', 'Sporcu'),
  ('athlete', 'de', 'Sportler'),
  ('athlete', 'fr', 'Athlète'),
  ('athlete', 'es', 'Atleta'),

  ('entrepreneur', 'en', 'Entrepreneur'),
  ('entrepreneur', 'tr', 'Girişimci'),
  ('entrepreneur', 'de', 'Unternehmer'),
  ('entrepreneur', 'fr', 'Entrepreneur'),
  ('entrepreneur', 'es', 'Empresario'),

  ('activist', 'en', 'Activist'),
  ('activist', 'tr', 'Aktivist'),
  ('activist', 'de', 'Aktivist'),
  ('activist', 'fr', 'Militant'),
  ('activist', 'es', 'Activista')
) as v(slug, locale_code, name)
join public.category c on c.slug = v.slug
on conflict (category_id, locale_code) do update set name = excluded.name;
