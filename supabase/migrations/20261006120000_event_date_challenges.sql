-- ============================================================================
-- TEMPUS — date challenges
--
-- A player who thinks an event's stored year is wrong says so from the result
-- panel: "is the date incorrect?" -> "challenge" -> "earlier" or "later". One
-- row here per answer.
--
-- **The direction IS the vote.** The admin panel wants events sortable by
-- upvotes and downvotes, so the two answers are stored as the signed numbers
-- that aggregate straight into that: `later` is +1, `earlier` is -1, and an
-- event's score is `sum(direction)`. Storing the words and mapping them in the
-- application would put the sort order in two places; a smallint sorts in SQL
-- and still reads back as a word through the check constraint.
--
-- There are no accounts (CLAUDE.md, gap 5), so there is nothing to key a
-- "one vote per person" rule on. This table is therefore a stream of reports
-- for an editor to read, not a referendum to be trusted. The counts are a
-- signal about which dates players keep disputing — the editor checks the
-- source and decides.
--
-- Unlike the match tables this one is NOT ephemeral: it is the only durable
-- player-generated data on the site, and it is the whole reason it exists.
-- ============================================================================

create table public.event_date_challenge (
  id uuid primary key default gen_random_uuid(),

  event_id uuid not null
    references public.event (id) on delete cascade,

  -- +1 the stored year is too early (the event happened later)
  -- -1 the stored year is too late  (the event happened earlier)
  direction smallint not null check (direction in (-1, 1)),

  -- Which language the round was played in. Not needed to count a vote, but a
  -- date that is only ever challenged from one locale is a translation problem
  -- rather than a dating one, and that is worth being able to see.
  locale_code text
    references public.locale (code) on update cascade on delete set null,

  created_at timestamptz not null default now()
);

comment on table public.event_date_challenge is
  'Player reports that an event is dated wrongly. direction: +1 the real date '
  'is later than the stored year, -1 it is earlier. Sum the column for the '
  'score the admin panel sorts by.';

-- Every read is "the challenges for this event" or "the challenges since", and
-- the admin list is ordered by both.
create index event_date_challenge_event_idx
  on public.event_date_challenge (event_id, created_at desc);

-- ---------------------------------------------------------------------------
-- The admin panel's read model.
--
-- A LEFT join from `event`, so an event nobody has challenged is still a row
-- with a zero score — "sort by most disputed" and "sort by least" are then the
-- same query in two directions rather than two queries.
-- ---------------------------------------------------------------------------
create view public.event_challenge_stats
with (security_invoker = true) as
select
  e.id                                                     as event_id,
  e.slug,
  e.year,
  e.status,
  count(c.id) filter (where c.direction = 1)::int           as later_votes,
  count(c.id) filter (where c.direction = -1)::int          as earlier_votes,
  count(c.id)::int                                          as total_votes,
  coalesce(sum(c.direction), 0)::int                        as score,
  max(c.created_at)                                         as last_challenged_at
from public.event e
left join public.event_date_challenge c on c.event_id = e.id
group by e.id, e.slug, e.year, e.status;

comment on view public.event_challenge_stats is
  'One row per event with its challenge tally. score = later_votes - '
  'earlier_votes; order by it in either direction to rank disputed dates.';

-- ---------------------------------------------------------------------------
-- Row Level Security and grants.
--
-- Supabase grants anon ALL privileges on every new table in `public` by
-- default, so a new table ships world-writable unless both layers are closed
-- deliberately (CLAUDE.md). Writes here go through the service role in
-- app/actions/challenges.ts, exactly like every other write on the site, which
-- is what keeps the one client-reachable path validated in one place.
-- ---------------------------------------------------------------------------
alter table public.event_date_challenge enable row level security;

-- No policies at all: neither reading other players' reports nor writing one
-- directly is something a browser should be able to do.
revoke all on public.event_date_challenge from anon, authenticated;
revoke all on public.event_challenge_stats from anon, authenticated;
