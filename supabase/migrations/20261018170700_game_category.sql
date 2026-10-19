-- ============================================================================
-- TEMPUS — subject games become data
--
-- Until now a subject game (football, basketball, film & TV, Born When?) was a
-- topic category row plus code in a dozen places. From here a game category
-- is one row in public.game_category: its rails (panes), its tolerance ladder
-- (bands), its image folder, its home-page card, its optional tag group. The
-- admin panel creates new ones; the four that exist are migrated with
-- is_builtin = true and the values their constants hold today
-- (lib/game/builtin-categories.ts rebuilds those values from the code, and
-- scripts/admin-test-db/category-parity.ts + admin:check compare them).
--
-- The general date game (`history`) is NOT a category: its panes, BANDS and
-- /guess stay in code.
-- ============================================================================

create table public.game_category (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  category_id uuid not null unique references public.category (id),
  layout text not null check (layout in ('landscape', 'poster')),
  panes jsonb not null check (jsonb_typeof(panes) = 'array' and jsonb_array_length(panes) > 0),
  default_pane text not null,
  bands jsonb not null check (jsonb_typeof(bands) = 'array'),
  image_prefix text not null unique check (image_prefix ~ '^[a-z0-9-]+$'),
  card_image_key text,
  backdrop_key text,
  tag_kind text check (tag_kind ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  show_on_home boolean not null default false,
  home_order smallint not null default 100,
  status text not null default 'draft' check (status in ('draft', 'published')),
  is_builtin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The core games' names are taken; a category must not shadow one.
alter table public.game_category add constraint game_category_slug_not_core
  check (slug not in ('history', 'compare', 'survival', 'daily', 'versus'));

create table public.game_category_translation (
  slug text references public.game_category (slug) on update cascade on delete cascade,
  locale_code text references public.locale (code),
  title text not null check (length(btrim(title)) > 0),
  blurb text,
  primary key (slug, locale_code)
);

create trigger game_category_set_updated_at
  before update on public.game_category
  for each row execute function public.set_updated_at();

-- Tag groups (§7.6): an `other` category belongs to at most one group, which
-- a game category names in tag_kind. Null for every other category kind.
alter table public.category add column tag_kind text
  check (tag_kind is null or tag_kind ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

update public.category set tag_kind = 'screen-format' where kind = 'other' and slug in ('film', 'series');
update public.category set tag_kind = 'person-field'
  where kind = 'other' and slug in ('leader', 'religious-figure', 'philosopher', 'explorer', 'scientist',
    'inventor', 'writer', 'artist', 'musician', 'actor', 'director', 'athlete', 'entrepreneur', 'activist');

-- ---------------------------------------------------------------------------
-- RLS: the game reads published rows signed out; writes only through the
-- admin_* functions (service role). Column grants are explicit.
-- ---------------------------------------------------------------------------
alter table public.game_category enable row level security;
alter table public.game_category_translation enable row level security;
revoke all on public.game_category from anon, authenticated, public;
revoke all on public.game_category_translation from anon, authenticated, public;

create policy "published game categories are readable by everyone"
  on public.game_category for select to anon, authenticated
  using (status = 'published');

create policy "published game category titles are readable by everyone"
  on public.game_category_translation for select to anon, authenticated
  using (exists (select 1 from public.game_category g where g.slug = game_category_translation.slug and g.status = 'published'));

grant select (slug, layout, panes, default_pane, bands, image_prefix, card_image_key, backdrop_key,
  tag_kind, show_on_home, home_order, status, is_builtin)
  on public.game_category to anon, authenticated;
grant select (slug, locale_code, title, blurb) on public.game_category_translation to anon, authenticated;
grant all on public.game_category, public.game_category_translation to service_role;

-- ---------------------------------------------------------------------------
-- The four built-in categories, as the code has them today.
-- ---------------------------------------------------------------------------
insert into public.game_category
  (slug, category_id, layout, panes, default_pane, bands, image_prefix, tag_kind, home_order,
   show_on_home, status, is_builtin)
select v.slug, c.id, v.layout, v.panes, v.default_pane, v.bands, v.image_prefix, v.tag_kind, v.home_order,
  true, 'published', true
from (values
  ('football', 'landscape', '[{"key":"football","label":{"en":"Football","tr":"Futbol","de":"Fußball","fr":"Football","es":"Fútbol"},"scale":"year","minYear":1850,"maxYear":2026,"tickStep":25}]'::jsonb, 'football', '[{"verdict":"perfect","relative":0,"floorYears":0},{"verdict":"great","relative":0,"floorYears":3},{"verdict":"good","relative":0,"floorYears":8},{"verdict":"bad","relative":0,"floorYears":25}]'::jsonb, 'football', null, 10),
  ('basketball', 'landscape', '[{"key":"basketball","label":{"en":"Basketball","tr":"Basketbol","de":"Basketball","fr":"Basket-ball","es":"Baloncesto"},"scale":"year","minYear":1875,"maxYear":2026,"tickStep":25}]'::jsonb, 'basketball', '[{"verdict":"perfect","relative":0,"floorYears":0},{"verdict":"great","relative":0,"floorYears":2},{"verdict":"good","relative":0,"floorYears":7},{"verdict":"bad","relative":0,"floorYears":20}]'::jsonb, 'basketball', null, 20),
  ('screen', 'poster', '[{"key":"screen","label":{"en":"Film & TV","tr":"Film & Dizi","de":"Film & Serien","fr":"Films & séries","es":"Cine y series"},"scale":"year","minYear":1900,"maxYear":2026,"tickStep":25}]'::jsonb, 'screen', '[{"verdict":"perfect","relative":0,"floorYears":0},{"verdict":"great","relative":0,"floorYears":2},{"verdict":"good","relative":0,"floorYears":6},{"verdict":"bad","relative":0,"floorYears":15}]'::jsonb, 'film-dizi', 'screen-format', 30),
  ('when-born', 'poster', '[{"key":"born-antiquity","label":{"en":"BC","tr":"MÖ","de":"v. Chr.","fr":"av. J.-C.","es":"a. C."},"scale":"bce-linear","minDisplay":0,"maxDisplay":1500,"stepYears":1,"tickStep":250},{"key":"born-premodern","label":{"en":"1–1500","tr":"1–1500","de":"1–1500","fr":"1–1500","es":"1–1500"},"scale":"year","minYear":0,"maxYear":1500,"tickStep":250},{"key":"born-modern","label":{"en":"1500–2026","tr":"1500–2026","de":"1500–2026","fr":"1500–2026","es":"1500–2026"},"scale":"year","minYear":1500,"maxYear":2026,"tickStep":100}]'::jsonb, 'born-modern', '[{"verdict":"perfect","relative":0,"floorYears":0},{"verdict":"great","relative":0.025,"floorYears":12},{"verdict":"good","relative":0.1,"floorYears":30},{"verdict":"bad","relative":0.2,"floorYears":75}]'::jsonb, 'when-born', 'person-field', 40)
) as v(slug, layout, panes, default_pane, bands, image_prefix, tag_kind, home_order)
join public.category c on c.slug = v.slug and c.kind = 'topic';

insert into public.game_category_translation (slug, locale_code, title, blurb)
values
  ('football', 'en', 'Football', 'The same timeline game, played over the history of football.'),
  ('football', 'tr', 'Futbol', 'Aynı zaman çizelgesi oyunu, futbol tarihi üzerinden.'),
  ('football', 'de', 'Fußball', 'Dasselbe Zeitleisten-Spiel, über die Geschichte des Fußballs.'),
  ('football', 'fr', 'Football', 'Le même jeu de frise, sur l''histoire du football.'),
  ('football', 'es', 'Fútbol', 'El mismo juego de la línea de tiempo, sobre la historia del fútbol.'),
  ('basketball', 'en', 'Basketball', 'Dates from the history of basketball, court by court.'),
  ('basketball', 'tr', 'Basketbol', 'Basketbol tarihinden tarihler, parke parke.'),
  ('basketball', 'de', 'Basketball', 'Daten aus der Geschichte des Basketballs.'),
  ('basketball', 'fr', 'Basket-ball', 'Des dates tirées de l''histoire du basket-ball.'),
  ('basketball', 'es', 'Baloncesto', 'Fechas de la historia del baloncesto.'),
  ('screen', 'en', 'Film & TV', 'Premieres and milestones from film and television.'),
  ('screen', 'tr', 'Film & Dizi', 'Sinema ve televizyondan galalar ve dönüm noktaları.'),
  ('screen', 'de', 'Film & Serien', 'Premieren und Meilensteine aus Film und Fernsehen.'),
  ('screen', 'fr', 'Films & séries', 'Sorties et grandes dates du cinéma et de la télévision.'),
  ('screen', 'es', 'Cine y series', 'Estrenos e hitos del cine y la televisión.'),
  ('when-born', 'en', 'Born When?', 'Guess the year a famous figure was born.'),
  ('when-born', 'tr', 'Ne zaman doğdu?', 'Ünlü bir ismin doğduğu yılı tahmin et.'),
  ('when-born', 'de', 'Wann geboren?', 'Rate das Geburtsjahr einer berühmten Person.'),
  ('when-born', 'fr', 'Né quand ?', 'Devine l''année de naissance d''une personnalité.'),
  ('when-born', 'es', '¿Cuándo nació?', 'Adivina el año en que nació una figura famosa.');

-- ---------------------------------------------------------------------------
-- Game names: the check lists become one trigger. A game is a core game or
-- a game_category slug. (An FK cannot express "or a core name".)
-- ---------------------------------------------------------------------------
create or replace function public.assert_game_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.game in ('history', 'compare', 'survival', 'daily', 'versus') then
    if tg_table_name = 'solo_set' and new.game in ('daily', 'versus') then
      raise exception '%: game % is not a solo game', tg_table_name, new.game using errcode = '23514';
    end if;
    return new;
  end if;
  if exists (select 1 from public.game_category g where g.slug = new.game) then
    return new;
  end if;
  raise exception '%: unknown game %', tg_table_name, new.game using errcode = '23514';
end;
$$;

revoke execute on function public.assert_game_name() from public, anon, authenticated;

alter table public.score_entry drop constraint score_entry_game_check;
alter table public.solo_set drop constraint solo_set_game_check;

create trigger score_entry_assert_game
  before insert or update of game on public.score_entry
  for each row execute function public.assert_game_name();
create trigger solo_set_assert_game
  before insert or update of game on public.solo_set
  for each row execute function public.assert_game_name();

-- ---------------------------------------------------------------------------
-- The two scoring functions that listed the date games by name now read
-- "every game but the comparison modes", so a new category earns the same
-- flawless bonus and counts the same Perfects. Otherwise unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bank_solo_round(p_user_id uuid, p_set_id uuid, p_game text, p_round_id uuid, p_event_id uuid, p_verdict text, p_correct boolean, p_tp integer, p_set_size integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_kind text := case when p_game = 'survival' then 'run' else 'set' end;
  v_set public.solo_set;
  v_existing public.solo_answer;
  v_bonus integer := 0;
  v_closed boolean := false;
  v_top boolean := p_verdict in ('perfect', 'great');
  -- Every game but the two comparison modes is answered with a year:
  -- history and every subject category (built-in or panel-made).
  v_date_game boolean := p_game not in ('compare', 'survival');
begin
  if p_tp < 0 or p_set_size < 1 then
    raise exception 'bank_solo_round: bad arguments';
  end if;

  insert into public.solo_set (id, user_id, game, kind)
  values (p_set_id, p_user_id, p_game, v_kind)
  on conflict (id) do nothing;

  select * into v_set from public.solo_set where id = p_set_id for update;

  if v_set.user_id <> p_user_id or v_set.game <> p_game then
    return jsonb_build_object('status', 'foreign');
  end if;

  select * into v_existing from public.solo_answer where round_id = p_round_id;
  if found then
    return jsonb_build_object(
      'status', 'duplicate',
      'tp', v_existing.tp,
      'bonus', 0,
      'set', jsonb_build_object(
        'answered', v_set.answered, 'tp', v_set.tp,
        'closed', v_set.closed_at is not null)
    );
  end if;

  if v_set.closed_at is not null
     or (v_kind = 'set' and v_set.answered >= p_set_size) then
    return jsonb_build_object('status', 'closed');
  end if;

  insert into public.solo_answer
    (round_id, set_id, user_id, game, event_id, verdict, correct, tp)
  values
    (p_round_id, p_set_id, p_user_id, p_game, p_event_id, p_verdict, p_correct, p_tp);

  if p_tp > 0 then
    insert into public.score_entry (user_id, game, kind, source, tp)
    values (p_user_id, p_game, 'round', 'round:' || p_round_id, p_tp)
    on conflict (user_id, source) do nothing;
  end if;

  update public.solo_set s set
    answered = s.answered + 1,
    correct = s.correct + case when p_correct then 1 else 0 end,
    perfects = s.perfects + case when p_verdict = 'perfect' then 1 else 0 end,
    top_tier = s.top_tier + case when v_top then 1 else 0 end,
    tp = s.tp + p_tp
  where s.id = p_set_id
  returning * into v_set;

  if v_kind = 'set' then
    if v_set.answered >= p_set_size then
      v_closed := true;

      -- Finishing a set. SET_COMPLETE_TP in lib/game/points.ts.
      insert into public.score_entry (user_id, game, kind, source, tp)
      values (p_user_id, p_game, 'set', 'set:' || p_set_id, 5)
      on conflict (user_id, source) do nothing;
      v_bonus := v_bonus + 5;

      -- Every answer Great or Perfect. SET_FLAWLESS_TP.
      if v_date_game and v_set.top_tier >= p_set_size then
        insert into public.score_entry (user_id, game, kind, source, tp)
        values (p_user_id, p_game, 'flawless', 'flawless:' || p_set_id, 20)
        on conflict (user_id, source) do nothing;
        v_bonus := v_bonus + 20;
      end if;
    end if;
  else
    if not p_correct then
      v_closed := true;
    else
      -- Survival milestones. SURVIVAL_MILESTONES.
      if v_set.correct in (10, 25, 50) then
        insert into public.score_entry (user_id, game, kind, source, tp)
        values (
          p_user_id, p_game, 'streak',
          'streak:' || p_set_id || ':' || v_set.correct,
          case v_set.correct when 10 then 10 when 25 then 30 else 75 end
        )
        on conflict (user_id, source) do nothing;
        v_bonus := v_bonus + case v_set.correct when 10 then 10 when 25 then 30 else 75 end;
      end if;
    end if;
  end if;

  if v_closed then
    update public.solo_set set closed_at = now(), tp = tp + v_bonus
    where id = p_set_id
    returning * into v_set;
  elsif v_bonus > 0 then
    update public.solo_set set tp = tp + v_bonus
    where id = p_set_id
    returning * into v_set;
  end if;

  return jsonb_build_object(
    'status', 'banked',
    'tp', p_tp,
    'bonus', v_bonus,
    'set', jsonb_build_object(
      'answered', v_set.answered, 'tp', v_set.tp,
      'closed', v_set.closed_at is not null)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.player_stats(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with perfect_rounds as (
    select game, count(*)::integer as n
    from public.solo_answer
    where user_id = p_user_id
      and verdict = 'perfect'
      and game not in ('compare', 'survival')
    group by game
  ),
  daily_perfects as (
    select count(*)::integer as n
    from public.daily_attempt a
    cross join lateral jsonb_array_elements(a.answers) as answer
    where a.user_id = p_user_id and answer ->> 'verdict' = 'perfect'
  ),
  daily_runs as (
    select count(*)::integer as n
    from (
      select puzzle_date - (row_number() over (order by puzzle_date))::integer as island
      from public.daily_attempt
      where user_id = p_user_id and completed_at is not null
    ) days
    group by island
  )
  select jsonb_build_object(
    'tp', coalesce((select sum(tp) from public.score_entry where user_id = p_user_id), 0),
    -- history (with the daily's perfects) plus one key per subject
    -- category, so a category made in the panel counts towards the badge
    -- ladder with no change here (lib/game/badge-rules.ts reads the map).
    'perfects', jsonb_build_object(
      'history',
        coalesce((select n from perfect_rounds where game = 'history'), 0)
        + coalesce((select n from daily_perfects), 0)
    ) || coalesce((
      select jsonb_object_agg(g.slug, coalesce(r.n, 0))
      from public.game_category g
      left join perfect_rounds r on r.game = g.slug
    ), '{}'::jsonb),
    'bestSurvival', coalesce((
      select max(correct) from public.solo_set
      where user_id = p_user_id and kind = 'run'), 0),
    'bestHistorySetPerfects', coalesce((
      select max(perfects) from public.solo_set
      where user_id = p_user_id and game = 'history' and kind = 'set'), 0),
    'compareFlawlessSets', (
      select count(*) from public.solo_set
      where user_id = p_user_id and game = 'compare'
        and closed_at is not null and correct = answered),
    'topTierSets', (
      select count(*) from public.solo_set
      where user_id = p_user_id and kind = 'set' and closed_at is not null
        and game not in ('compare', 'survival')
        and top_tier = answered),
    'bestDailyStreak', coalesce((select max(n) from daily_runs), 0)
  );
$function$;
