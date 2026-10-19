-- ============================================================================
-- TEMPUS — date challenges become one vote per account
--
-- The original table (20261006120000) was a stream of anonymous reports
-- because there were no accounts. There are now, so a vote is keyed on the
-- player: one per account, per event, per stored year. Changing the year
-- starts a fresh count (the old votes were about a year that no longer
-- stands); changing a name or description does not.
--
-- Legacy rows. Existing reports have no account. They are kept, flagged
-- `is_legacy`, and stamped with the event's current year (no year has been
-- edited since they were cast — there was no editor). The flag rather than a
-- `created_at > <migration time>` check because a timestamp comparison would
-- silently admit an account-less row inserted with a backdated created_at.
--
-- year_at_vote is stamped by a trigger from public.event, never taken from the
-- caller: the server is the only party that knows which year was on screen.
-- ============================================================================

alter table public.event_date_challenge
  add column user_id uuid references auth.users (id) on delete cascade,
  add column year_at_vote bigint,
  add column is_legacy boolean not null default false;

update public.event_date_challenge c
set year_at_vote = e.year, is_legacy = true
from public.event e
where e.id = c.event_id;

alter table public.event_date_challenge
  alter column year_at_vote set not null,
  add constraint event_date_challenge_account_required check (is_legacy or user_id is not null),
  add constraint event_date_challenge_one_vote unique (event_id, user_id, year_at_vote);

-- New rows are never legacy; the flag is only ever set by the update above.
create or replace function public.event_date_challenge_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select e.year into new.year_at_vote from public.event e where e.id = new.event_id;
  if new.year_at_vote is null then
    raise exception 'event_date_challenge: no event %', new.event_id using errcode = '23503';
  end if;
  new.is_legacy := false;
  return new;
end;
$$;

create trigger event_date_challenge_stamp
  before insert on public.event_date_challenge
  for each row execute function public.event_date_challenge_stamp();

comment on column public.event_date_challenge.user_id is
  'The account that voted. Null only on is_legacy rows from before votes needed an account.';
comment on column public.event_date_challenge.year_at_vote is
  'event.year when the vote was cast, stamped by trigger. Only votes for the current year count.';

comment on table public.event_date_challenge is
  'Player votes that an event is dated wrongly. direction: +1 the real date is '
  'later than the stored year, -1 earlier. Signed-in players only: one vote per '
  'account per event per stored year, not changeable or retractable. Rows from '
  'before accounts are is_legacy.';

-- "Tarih doğru, kapat": an editor looked at the votes up to reviewed_at for
-- the event's year and dismissed them. Votes after it are open again.
create table public.event_challenge_review (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.event (id) on delete cascade,
  year bigint not null,
  reviewed_at timestamptz not null default now(),
  actor_id uuid not null,
  note text
);

create index event_challenge_review_event_idx
  on public.event_challenge_review (event_id, reviewed_at desc);

alter table public.event_challenge_review enable row level security;
revoke all on public.event_challenge_review from anon, authenticated, public;
grant select, insert on public.event_challenge_review to service_role;

-- The read model, redefined: the tally counts only *open* votes — cast for
-- the event's current year and after its latest review at that year.
-- all_votes keeps the lifetime count for context.
drop view public.event_challenge_stats;

create view public.event_challenge_stats
with (security_invoker = true) as
with last_review as (
  select distinct on (r.event_id) r.event_id, r.year, r.reviewed_at
  from public.event_challenge_review r
  order by r.event_id, r.reviewed_at desc
)
select
  e.id                                                         as event_id,
  e.slug,
  e.year,
  e.status,
  count(c.id) filter (where c.open and c.direction = 1)::int   as later_votes,
  count(c.id) filter (where c.open and c.direction = -1)::int  as earlier_votes,
  count(c.id) filter (where c.open)::int                       as total_votes,
  coalesce(sum(c.direction) filter (where c.open), 0)::int     as score,
  max(c.created_at) filter (where c.open)                      as last_challenged_at,
  count(c.id)::int                                             as all_votes,
  lr.reviewed_at                                               as reviewed_at
from public.event e
left join last_review lr on lr.event_id = e.id and lr.year = e.year
left join lateral (
  select x.id, x.direction, x.created_at,
    (x.year_at_vote = e.year and (lr.reviewed_at is null or x.created_at > lr.reviewed_at)) as open
  from public.event_date_challenge x
  where x.event_id = e.id
) c on true
group by e.id, e.slug, e.year, e.status, lr.reviewed_at;

comment on view public.event_challenge_stats is
  'One row per event with its OPEN challenge tally (votes for the current year, '
  'after the latest review). score = later_votes - earlier_votes.';

revoke all on public.event_challenge_stats from anon, authenticated, public;
grant select on public.event_challenge_stats to service_role;
