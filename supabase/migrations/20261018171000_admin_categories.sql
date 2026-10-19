-- ============================================================================
-- TEMPUS — admin panel: game categories (§7). Same contract as
-- 20261018170800_admin_content.sql.
--
-- Bands are computed in TypeScript (lib/game/auto-bands.ts, a pure function
-- with tests) and passed in; SQL stores them and enforces the structural
-- rules: pane keys unique, the default pane one of them, contiguous rails,
-- and no event of the category left outside the new timeline.
-- ============================================================================

-- Panes must be ordered oldest first, touch end to start, never overlap.
-- Returns null when valid, otherwise a short reason.
create or replace function public.panes_problem(p_panes jsonb, p_default text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_prev_hi bigint;
  v_p jsonb;
  v_lo bigint;
  v_hi bigint;
  v_keys text[] := '{}';
begin
  if jsonb_typeof(p_panes) <> 'array' or jsonb_array_length(p_panes) = 0 then
    return 'no-panes';
  end if;
  for v_p in select * from jsonb_array_elements(p_panes) loop
    if coalesce(v_p ->> 'key', '') = '' or (v_p ->> 'key') = any (v_keys) then
      return 'bad-key';
    end if;
    if v_p ->> 'scale' not in ('year', 'bce-linear', 'bce-log') then
      return 'bad-scale';
    end if;
    v_keys := v_keys || (v_p ->> 'key');
    select min_year, max_year into v_lo, v_hi from public.panes_year_bounds(jsonb_build_array(v_p));
    if v_lo is null or v_hi is null or v_lo >= v_hi then
      return 'empty-pane';
    end if;
    -- Contiguous: a pane starts where the previous ended (the shared hinge).
    if v_prev_hi is not null and v_lo <> v_prev_hi then
      return case when v_lo < v_prev_hi then 'overlap' else 'gap' end;
    end if;
    v_prev_hi := v_hi;
  end loop;
  if not (p_default = any (v_keys)) then
    return 'bad-default-pane';
  end if;
  return null;
end;
$$;

create or replace function public.admin_category_list()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', g.slug, 'layout', g.layout, 'status', g.status, 'isBuiltin', g.is_builtin,
    'showOnHome', g.show_on_home, 'homeOrder', g.home_order, 'imagePrefix', g.image_prefix,
    'title', coalesce((select title from public.game_category_translation t where t.slug = g.slug and t.locale_code = 'tr'), g.slug),
    'events', (select count(*) from public.event_category ec where ec.category_id = g.category_id),
    'playable', (select count(*) from public.event_category ec join public.event e on e.id = ec.event_id
      where ec.category_id = g.category_id and e.status = 'published'
        and exists (select 1 from public.image i where i.event_id = e.id and i.is_primary))
  ) order by g.home_order, g.slug), '[]'::jsonb)
  from public.game_category g;
$$;

create or replace function public.admin_category_detail(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with g as (select * from public.game_category where slug = p_slug),
  b as (select bb.* from g cross join lateral public.panes_year_bounds(g.panes) bb),
  ev as (
    select e.id, e.slug, e.year, e.status from public.event e
    join public.event_category ec on ec.event_id = e.id
    where ec.category_id = (select category_id from g)
  )
  select case when not exists (select 1 from g) then null else jsonb_build_object(
    'category', (select jsonb_build_object(
      'slug', g.slug, 'layout', g.layout, 'panes', g.panes, 'defaultPane', g.default_pane, 'bands', g.bands,
      'imagePrefix', g.image_prefix, 'cardImageKey', g.card_image_key, 'backdropKey', g.backdrop_key,
      'tagKind', g.tag_kind, 'showOnHome', g.show_on_home, 'homeOrder', g.home_order, 'status', g.status,
      'isBuiltin', g.is_builtin) from g),
    'bounds', (select jsonb_build_object('min', min_year, 'max', max_year) from b),
    'titles', coalesce((select jsonb_agg(jsonb_build_object('locale', t.locale_code, 'title', t.title, 'blurb', t.blurb)
      order by t.locale_code) from public.game_category_translation t where t.slug = p_slug), '[]'::jsonb),
    'tags', coalesce((select jsonb_agg(jsonb_build_object(
        'slug', c.slug,
        'names', coalesce((select jsonb_object_agg(ct.locale_code, ct.name) from public.category_translation ct
          where ct.category_id = c.id), '{}'::jsonb),
        'used', (select count(*) from public.event_category ec where ec.category_id = c.id)) order by c.slug)
      from public.category c, g where c.kind = 'other' and c.tag_kind = g.tag_kind), '[]'::jsonb),
    'years', coalesce((select jsonb_agg(year order by year) from ev), '[]'::jsonb),
    'outOfBounds', coalesce((select jsonb_agg(jsonb_build_object('id', ev.id, 'slug', ev.slug, 'year', ev.year,
      'name', public.admin_event_name(ev.id)) order by ev.year)
      from ev, b where ev.year not between b.min_year and b.max_year), '[]'::jsonb),
    'counts', jsonb_build_object(
      'events', (select count(*) from ev),
      'published', (select count(*) from ev where status = 'published'),
      'playable', (select count(*) from ev where status = 'published'
        and exists (select 1 from public.image i where i.event_id = ev.id and i.is_primary)))
  ) end;
$$;

-- Internal: write the five titles (game_category_translation, mirrored into
-- category_translation so the topic category reads the same everywhere).
create or replace function public.admin_write_category_titles(p_slug text, p_titles jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t jsonb;
begin
  for v_t in select * from jsonb_array_elements(coalesce(p_titles, '[]'::jsonb)) loop
    if nullif(btrim(v_t ->> 'title'), '') is null then
      continue;
    end if;
    insert into public.game_category_translation (slug, locale_code, title, blurb)
    values (p_slug, v_t ->> 'locale', btrim(v_t ->> 'title'), nullif(btrim(v_t ->> 'blurb'), ''))
    on conflict (slug, locale_code) do update set title = excluded.title, blurb = excluded.blurb;
    insert into public.category_translation (category_id, locale_code, name)
    select g.category_id, v_t ->> 'locale', btrim(v_t ->> 'title') from public.game_category g where g.slug = p_slug
    on conflict (category_id, locale_code) do update set name = excluded.name;
  end loop;
end;
$$;

-- p_input: { slug, layout, panes, defaultPane, bands, imagePrefix, tagKind,
-- titles: [{locale, title, blurb}] }. Always created as a draft, off the home
-- page.
create or replace function public.admin_create_category(p_actor uuid, p_input jsonb, p_note text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text := p_input ->> 'slug';
  v_category uuid;
  v_problem text;
begin
  if v_slug is null or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or v_slug in ('history', 'compare', 'survival', 'daily', 'versus') then
    raise exception 'bad-slug: %', v_slug;
  end if;
  if exists (select 1 from public.category where slug = v_slug) then
    raise exception 'slug-taken: %', v_slug;
  end if;
  if exists (select 1 from public.game_category where image_prefix = p_input ->> 'imagePrefix') then
    raise exception 'prefix-taken: %', p_input ->> 'imagePrefix';
  end if;
  if (p_input ->> 'imagePrefix') in ('bce', 'ce', 'future', 'homepage', 'date-guessing-game', 'comparison-game',
      '3d-models', 'videos', '1v1', 'user_profile_pictures') then
    raise exception 'prefix-taken: % is reserved', p_input ->> 'imagePrefix';
  end if;
  v_problem := public.panes_problem(p_input -> 'panes', p_input ->> 'defaultPane');
  if v_problem is not null then raise exception 'bad-panes: %', v_problem; end if;

  insert into public.category (slug, kind) values (v_slug, 'topic') returning id into v_category;
  insert into public.game_category (slug, category_id, layout, panes, default_pane, bands, image_prefix, tag_kind)
  values (v_slug, v_category, p_input ->> 'layout', p_input -> 'panes', p_input ->> 'defaultPane',
    p_input -> 'bands', p_input ->> 'imagePrefix', nullif(p_input ->> 'tagKind', ''));
  perform public.admin_write_category_titles(v_slug, p_input -> 'titles');

  perform public.admin_log(p_actor, 'category.create', 'game_category', v_slug, null, p_input, p_note);
  return v_slug;
end;
$$;

-- Same input as create (slug from the argument). A built-in category keeps
-- its slug, layout and image folder; its bands change only with
-- p_input.applyBands = true (§7.4: the editor shows the computed ladder, the
-- admin confirms it).
create or replace function public.admin_update_category(p_actor uuid, p_slug text, p_input jsonb, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.game_category;
  v_before jsonb;
  v_panes jsonb;
  v_problem text;
  v_out int;
begin
  select * into v_old from public.game_category where slug = p_slug for update;
  if not found then raise exception 'not-found: category %', p_slug; end if;

  v_panes := coalesce(p_input -> 'panes', v_old.panes);
  v_problem := public.panes_problem(v_panes, coalesce(p_input ->> 'defaultPane', v_old.default_pane));
  if v_problem is not null then raise exception 'bad-panes: %', v_problem; end if;

  select count(*) into v_out
  from public.event e
  join public.event_category ec on ec.event_id = e.id and ec.category_id = v_old.category_id
  cross join lateral public.panes_year_bounds(v_panes) b
  where e.year not between b.min_year and b.max_year;
  if v_out > 0 then
    raise exception 'out-of-bounds: % events fall outside the new timeline', v_out;
  end if;

  if v_old.is_builtin and (
    coalesce(p_input ->> 'layout', v_old.layout) <> v_old.layout
    or coalesce(p_input ->> 'imagePrefix', v_old.image_prefix) <> v_old.image_prefix
  ) then
    raise exception 'builtin: layout and image folder of a built-in category are fixed';
  end if;

  v_before := to_jsonb(v_old) || jsonb_build_object('titles', (
    select jsonb_agg(to_jsonb(t)) from public.game_category_translation t where t.slug = p_slug));

  update public.game_category set
    layout = coalesce(p_input ->> 'layout', layout),
    panes = v_panes,
    default_pane = coalesce(p_input ->> 'defaultPane', default_pane),
    bands = case
      when p_input -> 'bands' is null then bands
      when is_builtin and not coalesce((p_input ->> 'applyBands')::boolean, false) then bands
      else p_input -> 'bands' end,
    image_prefix = coalesce(p_input ->> 'imagePrefix', image_prefix),
    tag_kind = case when p_input ? 'tagKind' then nullif(p_input ->> 'tagKind', '') else tag_kind end
  where slug = p_slug;

  perform public.admin_write_category_titles(p_slug, p_input -> 'titles');
  perform public.admin_log(p_actor, 'category.update', 'game_category', p_slug, v_before, p_input, p_note);
end;
$$;

create or replace function public.admin_set_category_art(
  p_actor uuid, p_slug text, p_kind text, p_key text, p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  if p_kind not in ('card', 'backdrop') then raise exception 'bad-kind: %', p_kind; end if;
  if p_key is not null and p_key !~ '^[a-z0-9-]+/[A-Za-z0-9][A-Za-z0-9._-]*\.(jpg|webp)$' then
    raise exception 'bad-key: %', p_key;
  end if;
  select case when p_kind = 'card' then card_image_key else backdrop_key end into v_old
  from public.game_category where slug = p_slug for update;
  if not found then raise exception 'not-found: category %', p_slug; end if;

  update public.game_category set
    card_image_key = case when p_kind = 'card' then p_key else card_image_key end,
    backdrop_key = case when p_kind = 'backdrop' then p_key else backdrop_key end
  where slug = p_slug;

  perform public.admin_log(p_actor, 'category.set_art', 'game_category', p_slug,
    jsonb_build_object('kind', p_kind, 'key', v_old), jsonb_build_object('kind', p_kind, 'key', p_key), p_note);
end;
$$;

-- p_tags: [{ slug, names: { <locale>: name } }] — the full list for the
-- category's tag group. Tags left out are deleted, unless an event uses them.
create or replace function public.admin_save_category_tags(p_actor uuid, p_slug text, p_tags jsonb, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_before jsonb;
  v_tag jsonb;
  v_id uuid;
  v_used text;
begin
  select tag_kind into v_kind from public.game_category where slug = p_slug for update;
  if not found then raise exception 'not-found: category %', p_slug; end if;
  if v_kind is null then raise exception 'no-tag-kind: enable the tag group first'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('slug', c.slug, 'names', (
    select jsonb_object_agg(ct.locale_code, ct.name) from public.category_translation ct where ct.category_id = c.id))), '[]'::jsonb)
  into v_before from public.category c where c.kind = 'other' and c.tag_kind = v_kind;

  select string_agg(c.slug, ', ') into v_used
  from public.category c
  where c.kind = 'other' and c.tag_kind = v_kind
    and not exists (select 1 from jsonb_array_elements(p_tags) t where t ->> 'slug' = c.slug)
    and exists (select 1 from public.event_category ec where ec.category_id = c.id);
  if v_used is not null then raise exception 'tag-in-use: %', v_used; end if;

  delete from public.category c
  where c.kind = 'other' and c.tag_kind = v_kind
    and not exists (select 1 from jsonb_array_elements(p_tags) t where t ->> 'slug' = c.slug);

  for v_tag in select * from jsonb_array_elements(p_tags) loop
    if coalesce(v_tag ->> 'slug', '') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      raise exception 'bad-slug: %', v_tag ->> 'slug';
    end if;
    select id into v_id from public.category where slug = v_tag ->> 'slug';
    if v_id is null then
      insert into public.category (slug, kind, tag_kind) values (v_tag ->> 'slug', 'other', v_kind) returning id into v_id;
    elsif not exists (select 1 from public.category where id = v_id and kind = 'other' and tag_kind = v_kind) then
      raise exception 'slug-taken: %', v_tag ->> 'slug';
    end if;
    insert into public.category_translation (category_id, locale_code, name)
    select v_id, n.key, btrim(n.value) from jsonb_each_text(coalesce(v_tag -> 'names', '{}'::jsonb)) n
    where nullif(btrim(n.value), '') is not null and exists (select 1 from public.locale l where l.code = n.key)
    on conflict (category_id, locale_code) do update set name = excluded.name;
  end loop;

  perform public.admin_log(p_actor, 'category.save_tags', 'game_category', p_slug, v_before, p_tags, p_note);
end;
$$;

-- What publishing needs, as a list of missing items (empty = ready).
create or replace function public.admin_category_publish_gaps(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with g as (select * from public.game_category where slug = p_slug)
  select coalesce(jsonb_agg(gap), '[]'::jsonb) from (
    select 'playable-events' as gap from g
    where (select count(*) from public.event_category ec join public.event e on e.id = ec.event_id
      where ec.category_id = g.category_id and e.status = 'published'
        and exists (select 1 from public.image i where i.event_id = e.id and i.is_primary)) < 10
    union all
    select 'titles' from g
    where (select count(*) from public.game_category_translation t where t.slug = g.slug) < (select count(*) from public.locale)
    -- The built-in four keep their art in code (lib/storage/images.ts).
    union all
    select 'card-image' from g where not g.is_builtin and g.card_image_key is null
    union all
    select 'backdrop' from g where not g.is_builtin and g.backdrop_key is null
  ) x;
$$;

create or replace function public.admin_set_category_status(p_actor uuid, p_slug text, p_status text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
  v_gaps jsonb;
begin
  if p_status not in ('draft', 'published') then raise exception 'bad-status: %', p_status; end if;
  select status into v_old from public.game_category where slug = p_slug for update;
  if not found then raise exception 'not-found: category %', p_slug; end if;

  if p_status = 'published' then
    v_gaps := public.admin_category_publish_gaps(p_slug);
    if jsonb_array_length(v_gaps) > 0 then
      return jsonb_build_object('ok', false, 'missing', v_gaps);
    end if;
  end if;

  update public.game_category set status = p_status,
    show_on_home = case when p_status = 'draft' then false else show_on_home end
  where slug = p_slug;
  perform public.admin_log(p_actor, 'category.set_status', 'game_category', p_slug,
    jsonb_build_object('status', v_old), jsonb_build_object('status', p_status), p_note);
  return jsonb_build_object('ok', true, 'missing', '[]'::jsonb);
end;
$$;

create or replace function public.admin_set_category_home(
  p_actor uuid, p_slug text, p_show boolean, p_order integer, p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.game_category;
begin
  select * into v_old from public.game_category where slug = p_slug for update;
  if not found then raise exception 'not-found: category %', p_slug; end if;
  if p_show and v_old.status <> 'published' then
    raise exception 'not-published: only a published category goes on the home page';
  end if;
  update public.game_category set show_on_home = p_show, home_order = coalesce(p_order, home_order)
  where slug = p_slug;
  perform public.admin_log(p_actor, 'category.set_home', 'game_category', p_slug,
    jsonb_build_object('show', v_old.show_on_home, 'order', v_old.home_order),
    jsonb_build_object('show', p_show, 'order', coalesce(p_order, v_old.home_order)), p_note);
end;
$$;

create or replace function public.admin_delete_category(p_actor uuid, p_slug text, p_typed text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.game_category;
  v_before jsonb;
begin
  select * into v_g from public.game_category where slug = p_slug for update;
  if not found then raise exception 'not-found: category %', p_slug; end if;
  if v_g.is_builtin then raise exception 'builtin: a built-in category cannot be deleted'; end if;
  if coalesce(p_typed, '') <> p_slug then raise exception 'confirm-mismatch: typed slug does not match'; end if;
  if exists (select 1 from public.event_category where category_id = v_g.category_id) then
    raise exception 'has-events: move or delete the category''s events first';
  end if;
  if exists (select 1 from public.solo_set where game = p_slug) or exists (select 1 from public.score_entry where game = p_slug) then
    raise exception 'has-plays: the category has been played; unpublish it instead';
  end if;

  v_before := to_jsonb(v_g);
  delete from public.game_category where slug = p_slug;
  -- The tag group goes too when no other category shares it, and only the
  -- tags no event uses (none can: the category has no events).
  if v_g.tag_kind is not null and not exists (select 1 from public.game_category where tag_kind = v_g.tag_kind) then
    delete from public.category c where c.kind = 'other' and c.tag_kind = v_g.tag_kind
      and not exists (select 1 from public.event_category ec where ec.category_id = c.id);
  end if;
  delete from public.category where id = v_g.category_id;

  perform public.admin_log(p_actor, 'category.delete', 'game_category', p_slug, v_before, null, p_note);
end;
$$;

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        'panes_problem', 'admin_category_list', 'admin_category_detail', 'admin_create_category',
        'admin_update_category', 'admin_set_category_art', 'admin_save_category_tags',
        'admin_category_publish_gaps', 'admin_set_category_status', 'admin_set_category_home',
        'admin_delete_category')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  execute 'revoke execute on function public.admin_write_category_titles(text, jsonb) from public, anon, authenticated, service_role';
end $$;
