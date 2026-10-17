-- ============================================================================
-- TEMPUS — online head-to-head: matchmaking, the seat with no browser, and
-- Chrono Rating
--
-- Until now a match was an invitation: one player opened a room, sent the
-- code, and a friend took the other seat. This adds a second way in — "Find
-- opponent" — for the general game only (`match_public_is_history`), and the
-- rating that makes a stranger worth playing. A public match is the same row,
-- the same rounds and the same state machine as a private one. What is new is
-- how seat 2 is filled, what the clock does in the first three seconds, and
-- what happens when the match ends.
--
-- **Lobbies are found, not invited to.** A searcher first tries to take seat 2
-- of somebody else's open lobby (`versus_matchmake`); failing that it opens
-- its own and waits in it. A lobby is invisible to matchmaking until its rounds
-- are dealt — it is inserted with `public_tier` null and `versus_publish_lobby`
-- sets it once the draw is in — so nobody is ever seated into a match with no
-- questions. Two people who press the button in the same second both open
-- lobbies; every poll lets a searcher move into an *older* lobby than its own,
-- and "older" is a strict order (created_at, then id), so of two simultaneous
-- searchers exactly one moves and they meet instead of each getting a bot.
--
-- **The bot is a seat with no browser, so reconcile plays it.** When nobody
-- arrives within the search window, `versus_seat_bot` puts a bot in seat 2 and
-- decides its whole game on the spot: a guess, its verdict, its points and a
-- thinking time for every round, planned in TypeScript (lib/game/versus-bot.ts,
-- where `gradeGuess` stays the only grader) and stored on `match_round`, which
-- no client can read. Nothing then has to *run* the bot. There is no worker,
-- no cron and no timer: `versus_reconcile` already runs at the head of every
-- entry point to apply the deadlines that have passed, and a bot's answer is
-- just one more thing that falls due at a known instant (`bot_commit_at`).
-- Both clients of a public round prompt the server on a short jittered
-- heartbeat while the opponent has not answered (PUBLIC_TICK_MS in
-- lib/game/versus.ts) — against a person too — which is what makes "the first
-- call after that instant" arrive within a second or so. Whether a seat is a
-- bot lives only in `match_player` (`bot_level`), a table with no client
-- grants at all.
--
-- **So in a public match a lock-in is found out, never announced.** In a bot
-- match every call that can write the bot's answer is the person's own — their
-- heartbeat, their lock-in, their refresh — so if a first answer moved the
-- `match` row, a bot's "locked in" would always arrive in the body of one of
-- the player's own responses while a person's arrived on the socket at moments
-- of its own, and devtools would tell them apart in a round. Instead nobody's
-- first answer touches the row: `versus_submit` writes a person's to
-- `match_answer` and leaves `match` alone, exactly as reconcile writes a
-- bot's, and each seat learns that the other has answered from its own
-- requests, which read `match_answer` for it (`theyAnswered` in the per-seat
-- view; app/api/versus/tick). A first answer is timed when it was given — a
-- person's at the submit, a bot's at its planned instant — and found by the
-- next heartbeat after, so the gap between an opponent's `elapsedMs` and the
-- moment the badge appeared is the same random fraction of a heartbeat either
-- way. The answer that completes a round reveals it there and then, from
-- either kind of seat, and is timed at that instant: a person's at the submit
-- that reveals, a bot's at the reconcile that writes it — so `reveal_until_at`
-- minus the second answer's time is the same few microseconds whoever was
-- second. Only a round whose deadline has also passed before anybody called in
-- — the one case nobody was watching — is backdated to the planned instant, so
-- the bot is still recorded as having answered in time rather than as a
-- timeout. Private matches keep the pushed count: two browsers, no stand-in.
--
-- **Public matches pay KP, not TP.** A bot has no account, and TP is only ever
-- paid between two accounts (`versus_bank_tp`). Paying TP for public matches
-- would therefore pay against people and never against bots, and a player's TP
-- history would mark every opponent who was a bot. So the public game has its
-- own currency — Chrono Rating, `profile.chrono_rating`, mirrored for display
-- in lib/game/chrono-rating.ts — settled against people and bots alike. A bot
-- seat with a shown rating gets a display delta from the same rule (and no
-- write anywhere), so the result screen moves both numbers whoever the
-- opponent was. Private matches pay TP exactly as before and no rating.
--
-- **The invite code is no longer readable by clients.** `match` had a
-- `using (true)` select policy and a table-wide grant. That was right for what
-- it was for — a client subscribing to the row whose id it holds — and it also
-- let anyone with the anon key run `select code from match where phase =
-- 'lobby'` and walk into strangers' rooms. The policy stays (rows are still
-- readable, which is how Realtime authorises a subscriber at all — a guest's
-- seat is a bearer token, not an `auth.uid()` a policy could name), but the
-- table grant becomes a column grant that leaves out `code`, `public_tier`
-- (which ranks a lobby's host), the two bookkeeping timestamps, and every
-- column that says *who* sits in a seat: the names, the ratings and the
-- settled rating changes. Those are on a row anyone with the anon key can list
-- or subscribe to unfiltered, so granting them would publish every account's
-- username, rating and online results, show who is waiting in which lobby
-- right now — and let a scraper follow one name across every match it has
-- played, which a bot's name, drawn from a pool and seated wherever it is
-- needed, would not survive (it would sit in two matches at once, or never in
-- seat 1). They are fixed once a match fills (the deltas once it ends), so
-- each seat reads them in its own server-built view instead and the push never
-- needs them. Realtime honours the grant: `realtime.apply_rls` checks
-- `has_column_privilege` for the subscriber's role column by column and pushes
-- only the selectable ones, so the row on the socket is exactly
-- MATCH_CLIENT_COLUMNS in lib/game/versus.ts. It needs SELECT on the primary
-- key to match the row at all, which `id` has. Keep the grant and that list in
-- step.
--
-- **Settlement is a BEFORE trigger with a ledger.** A rating changes when a
-- public match ends — it completes, or a player who has started it leaves —
-- and there are several ways for that to happen (reconcile's last reveal,
-- `versus_abandon`, `versus_forfeit_user`, and whatever is added next). A
-- trigger on the phase change cannot be forgotten by any of them, which is the
-- argument scoring.sql makes for TP. It is BEFORE rather than AFTER so the
-- deltas land in the same row version that announces the end: the push that
-- tells both clients the match is over is the moment each reads its view for
-- the numbers to show (the deltas themselves are not granted), and that read
-- can never land between the end and a second update that would bump
-- `version` again and leave it a beat out of date. The ledger,
-- `chrono_rating_entry`, is keyed on (user, match), so a match settles a
-- player at most once whatever fires twice, and the profile only moves when
-- the ledger row was actually written. Each delta is taken from the player's
-- rating *at settlement*, not the snapshot on the seat: another match may have
-- settled in between — the forfeit of an abandoned one, closed by the very
-- search that started this one.
--
-- **A result has to be one somebody could have lost.** Two bounds keep a
-- rating from being manufactured. A walk-out before the first reveal costs the
-- leaver the loss (or the intro would be a free look at the opponent before
-- deciding to play) but wins the other seat nothing: nothing was played, and a
-- second tab that joins and leaves would otherwise be +30 every ten seconds.
-- And a guest is nobody in particular — the account behind its own private
-- window, as easily as a stranger. The back-to-back rule reaches a guest only
-- through the match it has just finished (`prev_match_id`, below), not as a
-- person, so an account takes at most a handful of paying results a day from
-- opponents shown as guests. That count covers bots posing as guests too, on
-- purpose: a cap that only real guests could hit would tell the player which
-- were which.
--
-- **A bot's name is reserved the moment it is worn.** A person's seat name is
-- their registered username, and a bot's is a name no account holds — so
-- without more, "is the opponent's name taken?" (one rename on the account
-- page, or one PATCH to `profile`) would answer "is the opponent a person?".
-- `versus_seat_bot` therefore writes the name it seats into
-- `reserved_username`, and a trigger on `profile` refuses a reserved name with
-- the very error the unique index raises for a taken one. Every name an
-- opponent has ever been shown is then taken, whoever wore it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Chrono Rating on the profile.
--
-- Not client-writable: the column grant on `profile` stays `update
-- (username)`, and the table-wide select (own row, by RLS) is what lets the
-- player read it. The check is the floor — a rating never goes below zero, and
-- the settlement clamps to it before writing rather than relying on this.
-- ---------------------------------------------------------------------------
alter table public.profile
  add column if not exists chrono_rating integer not null default 0
    check (chrono_rating >= 0);

comment on column public.profile.chrono_rating is
  'Online head-to-head Chrono Rating (KP), floor 0. Written only by '
  'versus_settle_rating() when a public match settles; every change is a row in '
  'chrono_rating_entry. Mirrored for display in lib/game/chrono-rating.ts.';

-- ---------------------------------------------------------------------------
-- match — the public-match columns.
--
-- All but `public_tier` are shown to the two players, and none of them says
-- whether the other seat is a person: a bot's name is a plausible username,
-- its rating a plausible rating, and a bot posing as a guest has neither, like
-- a guest. Only `is_public` and `forfeit_seat` are granted to clients, though:
-- the names, ratings and deltas reach the two seats through their own views
-- and nobody else (see the header and the grant at the end).
-- ---------------------------------------------------------------------------
alter table public.match
  add column if not exists is_public boolean not null default false,
  add column if not exists public_tier smallint
    check (public_tier between 1 and 3),
  add column if not exists seat1_name text
    check (char_length(seat1_name) <= 32),
  add column if not exists seat2_name text
    check (char_length(seat2_name) <= 32),
  add column if not exists seat1_rating integer check (seat1_rating >= 0),
  add column if not exists seat2_rating integer check (seat2_rating >= 0),
  add column if not exists seat1_rating_delta integer,
  add column if not exists seat2_rating_delta integer,
  add column if not exists forfeit_seat smallint
    check (forfeit_seat in (1, 2));

-- A rating has to mean one thing: a league that mixed football specialists
-- with film buffs would rank neither. PUBLIC_VERSUS_MODE in lib/game/versus.ts.
alter table public.match drop constraint if exists match_public_is_history;
alter table public.match
  add constraint match_public_is_history check (not is_public or mode = 'history');

comment on column public.match.is_public is
  'An online (matchmade) match rather than an invitation. History mode only; '
  'no rematch; pays Chrono Rating instead of TP.';
comment on column public.match.public_tier is
  'The host''s league (chrono_tier of seat1_rating), set by '
  'versus_publish_lobby once the rounds are dealt. Null = not discoverable. '
  'Not granted to clients.';
comment on column public.match.seat1_name is
  'Display name shown for seat 1 in a public match; null is a guest. Not '
  'granted to clients: served only in the two seats'' views.';
comment on column public.match.seat2_name is
  'Display name shown for seat 2 in a public match; null is a guest. Not '
  'granted to clients: served only in the two seats'' views.';
comment on column public.match.seat1_rating is
  'Seat 1''s Chrono Rating when it was seated; null is a guest. Not granted to '
  'clients.';
comment on column public.match.seat2_rating is
  'Seat 2''s Chrono Rating when it was seated; null is a guest. Not granted to '
  'clients.';
comment on column public.match.seat1_rating_delta is
  'The rating change settled for seat 1 when the public match ended; null for '
  'a guest, or while unsettled. Not granted to clients.';
comment on column public.match.seat2_rating_delta is
  'The rating change settled for seat 2 when the public match ended; null for '
  'a guest, or while unsettled. Not granted to clients.';
comment on column public.match.forfeit_seat is
  'The seat that left a started public match. Settles as a loss for it and, '
  'once a round has been revealed, a win for the other; null for a lobby '
  'closed before it filled.';

comment on table public.match is
  'Head-to-head match state. Every client-granted column is safe to show '
  'anyone; anything that would leak an answer belongs in match_round or '
  'match_answer. The invite code, public_tier and the seats'' names, ratings and '
  'rating changes are not granted to clients.';

-- What matchmaking scans: open, published lobbies of one league, oldest first.
create index if not exists match_public_lobby_idx
  on public.match (public_tier, created_at)
  where phase = 'lobby' and is_public;

-- ---------------------------------------------------------------------------
-- match_player — the bot seat.
--
-- Private like the rest of this table, which is the point: this is the only
-- place in the database that knows a seat is a bot. Archetype and level are
-- both set or both null, and a bot never holds an account.
-- ---------------------------------------------------------------------------
alter table public.match_player
  add column if not exists bot_archetype text,
  add column if not exists bot_level smallint check (bot_level between 1 and 3);

alter table public.match_player drop constraint if exists match_player_bot_shape;
alter table public.match_player
  add constraint match_player_bot_shape
    check ((bot_archetype is null) = (bot_level is null));

alter table public.match_player drop constraint if exists match_player_bot_no_account;
alter table public.match_player
  add constraint match_player_bot_no_account
    check (bot_level is null or user_id is null);

comment on column public.match_player.bot_archetype is
  'A bot seat''s character (BOT_ARCHETYPES in lib/game/versus-bot.ts); null for '
  'a person. Never client-readable.';
comment on column public.match_player.bot_level is
  'A bot seat''s level, 1-3 (its host''s league); null for a person. Never '
  'client-readable — whether a seat is a bot must not reach a client.';

-- `versus_forfeit_user` looks seats up by account.
create index if not exists match_player_user_idx
  on public.match_player (user_id)
  where user_id is not null;

-- ---------------------------------------------------------------------------
-- match_player — where a searching host came from, and where it went.
--
-- Both on the seat rather than the match, because this table is granted to no
-- client at all, and both are about the person in the seat rather than the
-- game.
--
--   * `prev_match_id` — the public match a lobby's host had just finished when
--     they pressed "Find new opponent" (the end screen hands its own seat in,
--     and the action checks it). It is what keeps two *guests* — or an account
--     and a guest — from meeting again straight away: neither has a ledger row
--     that names the other, but both lobbies name the one match they shared.
--     No foreign key, like the ledger's: matches are swept.
--   * `moved_to` — set on an abandoned lobby's host seat when a poll moved that
--     host into an older lobby (`versus_matchmake`). The move commits before
--     its answer leaves the server, and that answer is the only thing that
--     tells the host where they now sit; if it is lost, the host's next poll
--     from the old lobby finds this and is told again rather than "gone" —
--     with an opponent already waiting at question one.
--
-- And `token_hash` gets an index of its own, for the one lookup that is not
-- keyed by match: "Find opponent" retried with the token of an attempt whose
-- answer never arrived finds the seat that attempt took (findVersusOpponent).
-- Not unique: a token names one seat per match, and an attempt whose lobby
-- was closed half-made takes its next seat under the same token. (The name
-- `match_player_token_idx` is the original (match_id, token_hash) index's.)
-- ---------------------------------------------------------------------------
alter table public.match_player
  add column if not exists prev_match_id uuid,
  add column if not exists moved_to uuid;

comment on column public.match_player.prev_match_id is
  'For a public lobby''s host: the public match they had just finished when they '
  'searched again. Matchmaking never pairs two lobbies that name the same one.';
comment on column public.match_player.moved_to is
  'For the host of a lobby closed by a merge: the match versus_matchmake moved '
  'them into, so a lost answer can be repeated.';

create index if not exists match_player_token_hash_idx
  on public.match_player (token_hash);

-- ---------------------------------------------------------------------------
-- match_round — the bot's plan.
--
-- One answer per round, decided when the bot is seated. Stored beside the
-- event it answers, in the table that is already private in full, and copied
-- into `match_answer` by `versus_reconcile` once `bot_commit_at` has passed.
-- `bot_commit_at` is stamped when its round starts (round_started_at plus the
-- thinking time); before that reconcile derives the same instant.
-- ---------------------------------------------------------------------------
alter table public.match_round
  add column if not exists bot_guess bigint,
  add column if not exists bot_verdict text,
  add column if not exists bot_points integer,
  add column if not exists bot_think_ms integer check (bot_think_ms >= 0),
  add column if not exists bot_commit_at timestamptz;

comment on column public.match_round.bot_guess is
  'The bot seat''s planned guess for this round (astronomical year); null when '
  'the match has no bot.';
comment on column public.match_round.bot_think_ms is
  'The bot''s planned thinking time, in milliseconds after round_started_at. '
  'Always inside the round, so a bot never times out.';
comment on column public.match_round.bot_commit_at is
  'round_started_at + bot_think_ms, stamped when the round starts. The earliest '
  'instant versus_reconcile may write the bot''s answer. A first answer is timed '
  'at this instant; one that completes the round at the reconcile that writes it.';

-- ---------------------------------------------------------------------------
-- The rating ledger.
--
-- One row per (player, public match) that moved their rating. The primary key
-- is the idempotency guard — the same match cannot settle a player twice — and
-- the history a future "rating over time" screen would read. `match_id` has no
-- foreign key on purpose: matches are ephemeral and `versus_sweep` deletes
-- them, and a ledger whose rows vanished with them would not be a ledger. It
-- is also where matchmaking finds both players' last opponents, so the same two
-- people are not paired twice in a row, and where settlement counts the day's
-- paying results against guests.
-- ---------------------------------------------------------------------------
create table if not exists public.chrono_rating_entry (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- No foreign key: matches are swept, the ledger is not.
  match_id uuid not null,
  -- The other account. Null for a guest or a bot — which is why nothing about
  -- this column may ever be shown to the player it belongs to.
  opponent_id uuid references auth.users (id) on delete set null,
  -- The opponent was *shown* as a guest (no name, no rating): a person without
  -- an account or a bot posing as one, deliberately not told apart. What the
  -- daily guest cap in versus_apply_rating counts.
  opponent_guest boolean not null default false,
  outcome text not null check (outcome in ('win', 'loss', 'draw')),
  -- The change actually applied: after the floor at zero, so a 4-KP loss in
  -- the bottom league records -4, not -10.
  delta integer not null,
  rating_before integer not null check (rating_before >= 0),
  rating_after integer not null check (rating_after >= 0),
  created_at timestamptz not null default now(),

  primary key (user_id, match_id),
  constraint chrono_rating_entry_sums check (rating_after = rating_before + delta)
);

-- An earlier draft of this table had no `opponent_guest`; `create table if not
-- exists` would leave such a table as it was (the same reason the old
-- versus_matchmake and versus_apply_rating overloads are dropped below).
alter table public.chrono_rating_entry
  add column if not exists opponent_guest boolean not null default false;

comment on table public.chrono_rating_entry is
  'The Chrono Rating ledger: one row per (player, public match) settled, written '
  'only by versus_apply_rating(). The primary key makes settlement idempotent. '
  'Service role only.';

create index if not exists chrono_rating_entry_user_idx
  on public.chrono_rating_entry (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Names no account may take: every name a bot has sat down under.
--
-- See the header. Written by `versus_seat_bot` in the transaction that seats
-- the bot, so the name is reserved before any player can have seen it; never
-- deleted, because a player can be shown a name today and try it next week.
-- Names are only added once worn rather than the whole pool up front: a pool
-- name nobody has been shown tells nobody anything, and lib/game/bot-names.ts
-- stays the one list. A name an account already held before a bot would have
-- worn it is never worn (`botDisguise` skips taken names), so this table and
-- `profile.username` never hold the same name for two different reasons.
--
-- Service role only, like the ledger: a client that could read it would have
-- the list of names that are bots.
-- ---------------------------------------------------------------------------
create table if not exists public.reserved_username (
  username text primary key
    check (username = public.normalize_username(username)),
  created_at timestamptz not null default now()
);

comment on table public.reserved_username is
  'Usernames no account may take — every name a bot has been seated under. '
  'Written by versus_seat_bot; enforced on profile by profile_refuse_reserved_'
  'username. Service role only.';

-- The refusal is the unique index's own, word for word — code, constraint,
-- message and detail — because the account page is not the only place it can
-- be read: `authenticated` may PATCH its own `profile.username` through
-- PostgREST directly, and gets back whatever this raises. Any difference from
-- a real collision would be the same tell this table exists to remove.
-- `handle_new_user` already catches unique_violation and leaves the new
-- account unnamed, and `setUsername` maps 23505 to "that name is taken", so
-- both ways of naming an account treat a reserved name as a taken one without
-- knowing this exists. An unchanged name passes (`is distinct from`), so a
-- profile update that does not touch the name is never refused.
create or replace function public.profile_refuse_reserved_username()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.username is null then
    return new;
  end if;
  -- Nested rather than one `and`: `old` is only a row on an update.
  if tg_op = 'UPDATE' then
    if new.username is not distinct from old.username then
      return new;
    end if;
  end if;

  if exists (
    select 1 from public.reserved_username r where r.username = new.username
  ) then
    raise exception using
      errcode = 'unique_violation',
      message = 'duplicate key value violates unique constraint "profile_username_key"',
      detail = format('Key (username)=(%s) already exists.', new.username),
      constraint = 'profile_username_key',
      schema = 'public',
      table = 'profile';
  end if;
  return new;
end;
$$;

drop trigger if exists profile_refuse_reserved_username on public.profile;

create trigger profile_refuse_reserved_username
  before insert or update of username on public.profile
  for each row execute function public.profile_refuse_reserved_username();

-- ===========================================================================
-- The rating rule
--
-- Paired with lib/game/chrono-rating.ts: `chrono_tier` is `chronoTier()` and
-- `chrono_delta` is `CHRONO_RATING_RULES`. The database settles and the
-- application only predicts and displays, so a drift between the two would
-- show a player one number and bank another. Change both together.
-- ===========================================================================

-- The league a rating plays in. Null — a guest — is the bottom league.
create or replace function public.chrono_tier(p_rating integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_rating is null or p_rating < 300 then 1
    when p_rating < 700 then 2
    else 3
  end;
$$;

comment on function public.chrono_tier(integer) is
  'League of a Chrono Rating: <300 (or null, a guest) 1, <700 2, else 3. '
  'Mirrors chronoTier() in lib/game/chrono-rating.ts.';

-- What a result is worth in the league `p_rating` plays in. Raw: NOT floored,
-- because the floor depends on the rating it is applied to and the caller is
-- the one holding that. Null for an outcome that is not one of the three.
create or replace function public.chrono_delta(p_rating integer, p_outcome text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case public.chrono_tier(p_rating)
    when 1 then case p_outcome when 'win' then 30 when 'loss' then -10 when 'draw' then 5 end
    when 2 then case p_outcome when 'win' then 25 when 'loss' then -18 when 'draw' then 5 end
    else        case p_outcome when 'win' then 20 when 'loss' then -22 when 'draw' then 5 end
  end;
$$;

comment on function public.chrono_delta(integer, text) is
  'Raw rating change for a win/loss/draw in the league of p_rating (not floored '
  'at 0). Mirrors CHRONO_RATING_RULES in lib/game/chrono-rating.ts.';

-- ===========================================================================
-- Matchmaking
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Make a dealt public lobby discoverable.
--
-- The application inserts a public lobby, deals its rounds, then calls this.
-- Until it does, `public_tier` is null and `versus_matchmake` cannot see the
-- lobby — so the window in which a lobby exists but has no questions is a
-- window in which nobody can be seated into it. Refuses (false) for anything
-- that is not a public lobby with a full draw for its generation.
--
-- It also marks the host as present, from this moment: matchmaking only seats
-- someone opposite a host who has asked recently (see versus_matchmake), and
-- the dealing that came before this can take long enough that the seat row's
-- own insert time would already read as an absent host.
-- ---------------------------------------------------------------------------
create or replace function public.versus_publish_lobby(p_match_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_match public.match;
  v_rounds integer;
begin
  select * into v_match from public.match where id = p_match_id for update;
  if not found or not v_match.is_public or v_match.phase <> 'lobby' then
    return false;
  end if;

  select count(*) into v_rounds
  from public.match_round r
  where r.match_id = p_match_id and r.generation = v_match.generation;

  if v_rounds < v_match.total_rounds then
    return false;
  end if;

  update public.match
  set public_tier = public.chrono_tier(v_match.seat1_rating)
  where id = p_match_id;

  update public.match_player
  set last_seen_at = clock_timestamp()
  where match_id = p_match_id and seat = 1;

  return true;
end;
$$;

comment on function public.versus_publish_lobby(uuid) is
  'Makes a dealt public lobby visible to matchmaking by setting public_tier to '
  'its host''s league. False if it is not a public lobby with all its rounds.';

-- ---------------------------------------------------------------------------
-- Fill seat 2 of a public lobby and start it.
--
-- Shared by the two ways seat 2 is filled — a person (`versus_matchmake`) and
-- a bot (`versus_seat_bot`) — so the two cannot start a match differently,
-- which is the first thing that would tell them apart. Assumes the caller
-- holds the row lock, has checked the lobby is open and has already inserted
-- the seat-2 `match_player` row.
--
-- The ready gate is skipped (both ready): nobody accepted an invitation, they
-- asked to play now. And the first round starts `p_intro_seconds` in the
-- future rather than now — PUBLIC_MATCH_INTRO_SECONDS, the "opponent found"
-- moment — with its deadline counted from there, so the intro is not a phase
-- of its own and costs nobody any of their twenty seconds. `versus_submit`
-- refuses a guess that arrives before it (`early`), and a bot's thinking time
-- is counted from the same instant a person's is. Returns that instant.
-- ---------------------------------------------------------------------------
create or replace function public.versus_fill_public_match(
  p_match_id uuid,
  p_name text,
  p_rating integer,
  p_intro_seconds integer
)
returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  v_start timestamptz := clock_timestamp()
    + make_interval(secs => greatest(coalesce(p_intro_seconds, 0), 0));
begin
  update public.match m
  set seat2_joined = true,
      seat1_ready = true,
      seat2_ready = true,
      seat2_name = p_name,
      seat2_rating = p_rating,
      phase = 'playing',
      current_idx = 0,
      answered_count = 0,
      reveal_until_at = null,
      round_started_at = v_start,
      round_deadline_at = v_start + make_interval(secs => m.round_seconds)
  where m.id = p_match_id;

  return v_start;
end;
$$;

comment on function public.versus_fill_public_match(uuid, text, integer, integer) is
  'Takes a public lobby to playing with seat 2 filled: both ready, round 0 '
  'starting after the intro. Caller holds the lock and inserted the seat.';

-- ---------------------------------------------------------------------------
-- Look for someone to play.
--
-- Called with no own lobby by "Find opponent" (take a waiting seat if there is
-- one, else the caller opens a lobby), and with the caller's own lobby by every
-- poll of the searching screen (move into an older lobby if one has appeared).
-- Answers, as jsonb `status`:
--
--   joined   seated in seat 2 of `match_id` / `code`, which has started; the
--            caller's own lobby, if given, is closed and points at it
--            (`moved_to`, so a lost answer can be given again)
--   matched  the caller's own lobby has already been filled — go and play it
--   gone     the caller's own lobby no longer exists or was closed
--   none     nobody to play yet
--
-- Who may meet whom:
--
--   * only lobbies opened in the last `p_fresh_seconds` (PUBLIC_LOBBY_FRESH_
--     SECONDS), and only while their host is still asking: its seat must
--     have been seen in the last `p_host_seen_ms` (SEARCH_HOST_SEEN_MS). A
--     poll stamps that here, under the lobby's own lock, so it costs no round
--     trip and cannot be lost the way a separate touch could. Age alone was
--     not enough: a host who closed the tab, or left the page, two seconds
--     after opening a lobby left it matchable for the rest of its freshness —
--     and whoever was seated there played ten rounds against nobody, while
--     an absent account host was rated the loss.
--   * only an *older* lobby than the caller's own, in the strict order
--     (created_at, id). Of two searchers who opened lobbies in the same
--     instant exactly one can move into the other's, and the other's poll
--     finds itself `matched`. Without the order both could move at once.
--   * never your own lobby in another tab, and never the people you have
--     just played — "the same two players cannot rematch back-to-back", in
--     two ways because a guest has no identity to compare:
--       - by the match: a host whose lobby was opened from the end of the
--         match the caller has just left (`prev_match_id` = `p_avoid_match`,
--         or for a poll the caller's own lobby's) — which is what keeps two
--         guests, or a guest and an account, from pressing "Find new
--         opponent" into each other's arms. Also an account host who sat in
--         that match, and a host whose previous match had the caller's
--         account in it, so a link on only one side is still enough when the
--         other side is an account;
--       - by the ledger: a host who is the account you last played, or whose
--         last opponent was you — each side's newest row, both sides because
--         "last" differs between them (after A and B play, one bot match
--         moves A's newest row on while B's still names A).
--   * a guest only meets the bottom league. An account meets its own league,
--     or a host within `p_near_rating` across a boundary, so a 290 and a 320
--     find each other rather than both waiting. Same league first, then the
--     nearest rating, then the longest-waiting.
--
-- `skip locked`: a lobby whose host is mid-poll (and so holds its lock) is
-- passed over for this call rather than waited on. It cannot deadlock either —
-- a poller holds its own lobby and reaches only for older ones.
-- ---------------------------------------------------------------------------

-- An earlier draft of this function had neither `p_avoid_match` nor
-- `p_host_seen_ms`; a database that ran it would otherwise keep that overload.
drop function if exists public.versus_matchmake(uuid, uuid, integer, text, text, integer, integer, integer);

create or replace function public.versus_matchmake(
  p_own_match uuid,
  p_user_id uuid,
  p_rating integer,
  p_name text,
  p_token_hash text,
  p_intro_seconds integer,
  p_fresh_seconds integer,
  p_near_rating integer,
  p_avoid_match uuid,
  p_host_seen_ms integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_own public.match;
  v_target public.match;
  v_last_opponent uuid;
  v_avoid uuid := p_avoid_match;
  v_tier integer := public.chrono_tier(p_rating);
  v_inserted integer;
begin
  if p_own_match is not null then
    select * into v_own from public.match where id = p_own_match for update;
    if not found or not v_own.is_public or v_own.phase = 'abandoned' then
      return jsonb_build_object('status', 'gone');
    end if;
    if v_own.phase <> 'lobby' or v_own.seat2_joined then
      return jsonb_build_object('status', 'matched');
    end if;

    -- The host is here: this is its poll. Committed with whatever else this
    -- call does, and visible to the next searcher's candidate test.
    update public.match_player h
    set last_seen_at = clock_timestamp()
    where h.match_id = p_own_match and h.seat = 1
    returning coalesce(v_avoid, h.prev_match_id) into v_avoid;
  end if;

  if p_user_id is not null then
    select e.opponent_id into v_last_opponent
    from public.chrono_rating_entry e
    where e.user_id = p_user_id
    order by e.created_at desc
    limit 1;
  end if;

  select m.* into v_target
  from public.match m
  where m.is_public
    and m.phase = 'lobby'
    and m.mode = 'history'
    and not m.seat2_joined
    and m.public_tier is not null
    and m.created_at > clock_timestamp() - make_interval(secs => p_fresh_seconds)
    and (
      p_own_match is null
      or (m.id <> p_own_match
          and (m.created_at, m.id) < (v_own.created_at, v_own.id))
    )
    -- A host who is still asking.
    and exists (
      select 1
      from public.match_player h
      where h.match_id = m.id
        and h.seat = 1
        and h.last_seen_at
          > clock_timestamp() - greatest(coalesce(p_host_seen_ms, 0), 0) * interval '1 millisecond'
    )
    -- Not someone the caller has just played (see above). A null on either
    -- side of any of these compares as null, which the `exists` reads as "no
    -- such host": a searcher with no previous match and no account excludes
    -- nobody but by the match it came from. The ledger probes are one look at
    -- chrono_rating_entry_user_idx per candidate, the seat probes one at
    -- match_player_user_idx.
    and not exists (
      select 1
      from public.match_player h
      where h.match_id = m.id
        and h.seat = 1
        and (
          h.prev_match_id = v_avoid
          or h.user_id = p_user_id
          or h.user_id = v_last_opponent
          or exists (
            select 1 from public.match_player x
            where x.match_id = v_avoid and x.user_id = h.user_id
          )
          or exists (
            select 1 from public.match_player x
            where x.match_id = h.prev_match_id and x.user_id = p_user_id
          )
          or (
            (
              select e.opponent_id
              from public.chrono_rating_entry e
              where e.user_id = h.user_id
              order by e.created_at desc
              limit 1
            ) = p_user_id
          )
        )
    )
    and (
      case
        when p_user_id is null then m.public_tier = 1
        else m.public_tier = v_tier
          or (m.seat1_rating is not null
              and abs(m.seat1_rating - p_rating) <= p_near_rating)
      end
    )
  order by
    (m.public_tier = v_tier) desc,
    abs(coalesce(m.seat1_rating, 0) - coalesce(p_rating, 0)),
    m.created_at
  limit 1
  for update of m skip locked;

  if not found then
    return jsonb_build_object('status', 'none');
  end if;

  -- A seat-2 row with `seat2_joined` still false cannot happen for a public
  -- lobby (both are written in one transaction, here and in versus_seat_bot),
  -- but if one ever did, the searcher should simply keep searching rather than
  -- have "Find opponent" fail on a broken lobby it never chose.
  insert into public.match_player (match_id, seat, token_hash, user_id)
  values (v_target.id, 2, p_token_hash, p_user_id)
  on conflict (match_id, seat) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('status', 'none');
  end if;

  perform public.versus_fill_public_match(
    v_target.id, p_name, p_rating, p_intro_seconds
  );

  -- The caller's own lobby never filled, so closing it settles nothing
  -- (`forfeit_seat` stays null; see versus_settle_rating). Its host seat
  -- remembers where the host went, for a poll whose answer to this never
  -- arrived (pollVersusSearch repeats it from there).
  if p_own_match is not null then
    update public.match set phase = 'abandoned' where id = p_own_match;
    update public.match_player
    set moved_to = v_target.id
    where match_id = p_own_match and seat = 1;
  end if;

  return jsonb_build_object(
    'status', 'joined',
    'match_id', v_target.id,
    'code', v_target.code
  );
end;
$$;

comment on function public.versus_matchmake(uuid, uuid, integer, text, text, integer, integer, integer, uuid, integer) is
  'Seats the caller in seat 2 of the best open public lobby (older than its own, '
  'if it has one; with a host seen recently; not someone just played) and starts '
  'it. jsonb status: joined | matched | gone | none.';

-- ---------------------------------------------------------------------------
-- Seat a bot in an unfilled public lobby.
--
-- The client decides *when* to ask (a random moment in the search window) and
-- the server decides whether it may: before `p_min_wait_ms` has passed since
-- the lobby opened the answer is `early`, so a client cannot skip the wait and
-- farm bots. Answers 'seated' | 'matched' (a person got there first) | 'early'
-- | 'gone'.
--
-- `p_moves` is the bot's whole game, planned by the application: a jsonb array
-- of `{idx, guess, verdict, points, think_ms}`, one per round of the current
-- generation. Every round must get one — a bot that has no answer for round
-- six would simply time out there, which is the kind of tell that has to be a
-- loud failure here rather than a quiet oddity on screen — so a short or
-- malformed plan raises and nothing is seated.
-- ---------------------------------------------------------------------------
create or replace function public.versus_seat_bot(
  p_match_id uuid,
  p_token_hash text,
  p_archetype text,
  p_level integer,
  p_name text,
  p_rating integer,
  p_moves jsonb,
  p_min_wait_ms integer,
  p_intro_seconds integer
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_match public.match;
  v_planned integer;
  v_start timestamptz;
begin
  select * into v_match from public.match where id = p_match_id for update;
  if not found or not v_match.is_public or v_match.phase = 'abandoned' then
    return 'gone';
  end if;
  if v_match.phase <> 'lobby' or v_match.seat2_joined then
    return 'matched';
  end if;
  if clock_timestamp()
       < v_match.created_at + greatest(coalesce(p_min_wait_ms, 0), 0) * interval '1 millisecond' then
    return 'early';
  end if;

  insert into public.match_player (
    match_id, seat, token_hash, user_id, bot_archetype, bot_level
  )
  values (p_match_id, 2, p_token_hash, null, p_archetype, p_level);

  update public.match_round r
  set bot_guess = x.guess,
      bot_verdict = x.verdict,
      bot_points = x.points,
      bot_think_ms = x.think_ms,
      bot_commit_at = null
  from jsonb_to_recordset(p_moves)
    as x(idx integer, guess bigint, verdict text, points integer, think_ms integer)
  where r.match_id = p_match_id
    and r.generation = v_match.generation
    and r.idx = x.idx
    and x.guess is not null
    and x.verdict is not null
    and x.points is not null
    and x.think_ms is not null;

  get diagnostics v_planned = row_count;
  if v_planned < v_match.total_rounds then
    raise exception 'versus_seat_bot: a plan for % of % rounds', v_planned, v_match.total_rounds;
  end if;

  -- The name is taken from this transaction on, for everyone (see
  -- reserved_username): by the time the host can read it, no account can
  -- register it, so trying to tells them nothing. An account that already
  -- holds it — registered between the application's check and this call —
  -- fails the seating instead of sharing a name with a bot; the next poll
  -- draws another.
  if p_name is not null then
    insert into public.reserved_username (username) values (p_name)
    on conflict (username) do nothing;

    if exists (select 1 from public.profile p where p.username = p_name) then
      raise exception 'versus_seat_bot: % is an account''s username', p_name;
    end if;
  end if;

  v_start = public.versus_fill_public_match(
    p_match_id, p_name, p_rating, p_intro_seconds
  );

  -- Round 0's moment is known now. Later rounds are stamped by
  -- versus_reconcile as each one starts.
  update public.match_round r
  set bot_commit_at = v_start + r.bot_think_ms * interval '1 millisecond'
  where r.match_id = p_match_id
    and r.generation = v_match.generation
    and r.idx = 0;

  return 'seated';
end;
$$;

comment on function public.versus_seat_bot(uuid, text, text, integer, text, integer, jsonb, integer, integer) is
  'Seats a bot with its precomputed plan in an unfilled public lobby and starts '
  'it. Refuses (early) before p_min_wait_ms. seated | matched | early | gone.';

-- ===========================================================================
-- The state machine, extended
--
-- The bodies below are the ones from 20261005120000_versus_matches.sql (and
-- 20261017120000_scoring.sql for the TP trigger), each with only the additions
-- the public game needs. Read the originals for the reasoning that has not
-- changed.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Bring a match up to date with the wall clock — now including the bot.
--
-- Everything the original says still holds: it runs at the head of every
-- entry point, applies the deadlines that have already passed, stamps each new
-- window from `clock_timestamp()` and then stops, so an abandoned match plays
-- out at its normal pace rather than flashing past.
--
-- The addition is one more thing that can fall due. A bot cannot press a
-- button, so its answer is due at `bot_commit_at` (or, for a round whose
-- stamp is missing, `round_started_at + bot_think_ms` — the same instant) and
-- the first reconcile after that writes it, shaped exactly like the answer a
-- person's submit would have written at that moment (see the header):
--
--   * **first in the round** — timed at the planned instant, and nothing is
--     written to `match`. The person finds it with their own next request,
--     reading `match_answer`, which is how they find a person's first answer
--     too; and the gap between its `elapsedMs` and the moment they saw it is
--     the same fraction of a heartbeat either way. Timed at the write instead,
--     the badge and the stored time would always agree to the millisecond,
--     which a person's never do.
--   * **second** — timed at the write, which reveals the round on the spot, as
--     a person's second submit does. Timed at the plan instead, the gap between
--     its `elapsedMs` and `reveal_until_at` (both on the pushed row) would be a
--     heartbeat's worth where a person's is nothing.
--
-- It is checked *before* the deadline on purpose: when nobody has called in
-- for a while and both the bot's moment and the deadline have passed, the bot
-- did answer in time and must be recorded as having done so, not as a
-- timeout — and only then is it backdated to the planned instant. A moment at
-- or after the deadline is never written — the round simply times out —
-- though planned thinking times are always inside the round.
--
-- Three transitions per round at the most now (bot answer, reveal, next), so
-- the guard is raised to match.
-- ---------------------------------------------------------------------------
create or replace function public.versus_reconcile(p_match_id uuid)
returns public.match
language plpgsql
set search_path = ''
as $$
declare
  v_match public.match;
  v_guard integer := 0;
  v_bot_seat integer;
  v_round public.match_round;
  v_commit_at timestamptz;
  v_answered_at timestamptz;
  v_count integer;
begin
  select * into v_match from public.match where id = p_match_id for update;
  if not found then
    raise exception 'match % not found', p_match_id using errcode = 'no_data_found';
  end if;

  -- Only a public match can have a bot, and its seats never change once
  -- filled, so this is read once rather than per transition.
  if v_match.is_public then
    select p.seat into v_bot_seat
    from public.match_player p
    where p.match_id = p_match_id and p.bot_level is not null;
  end if;

  loop
    v_guard = v_guard + 1;
    -- Three transitions per round at the very most, plus slack. A cap rather
    -- than trust: a bug below must not become an unkillable statement.
    exit when v_guard > (v_match.total_rounds * 3) + 4;

    -- When, if at all, the bot's answer to the live round falls due.
    v_commit_at = null;
    if v_bot_seat is not null and v_match.phase = 'playing' then
      select * into v_round
      from public.match_round r
      where r.match_id = v_match.id
        and r.generation = v_match.generation
        and r.idx = v_match.current_idx;

      if found
         and v_round.bot_guess is not null
         and not exists (
           select 1 from public.match_answer a
           where a.match_id = v_match.id
             and a.generation = v_match.generation
             and a.idx = v_match.current_idx
             and a.seat = v_bot_seat
         ) then
        v_commit_at = coalesce(
          v_round.bot_commit_at,
          v_match.round_started_at + v_round.bot_think_ms * interval '1 millisecond'
        );
      end if;
    end if;

    if v_commit_at is not null
       and clock_timestamp() >= v_commit_at
       and v_match.round_deadline_at is not null
       and v_commit_at < v_match.round_deadline_at then
      -- Whether the person has already answered — whether this one is second.
      select count(*) into v_count
      from public.match_answer a
      where a.match_id = v_match.id
        and a.generation = v_match.generation
        and a.idx = v_match.current_idx;

      -- Second, and the round still open: now, the reveal's instant. First, or
      -- the deadline gone by as well (nobody was there to see it): the plan.
      if v_count >= 1 and clock_timestamp() < v_match.round_deadline_at then
        v_answered_at = clock_timestamp();
      else
        v_answered_at = v_commit_at;
      end if;

      insert into public.match_answer (
        match_id, generation, idx, seat,
        guess, verdict, points, elapsed_ms, answered_at
      )
      values (
        v_match.id, v_match.generation, v_match.current_idx, v_bot_seat,
        v_round.bot_guess, v_round.bot_verdict, coalesce(v_round.bot_points, 0),
        -- The same expression versus_submit times a person with.
        greatest(0, round(
          extract(epoch from (v_answered_at - v_match.round_started_at)) * 1000
        ))::integer,
        v_answered_at
      )
      on conflict (match_id, generation, idx, seat) do nothing;

      -- No `answered_count`: a public match never announces a first answer
      -- (versus_submit leaves the row alone for a person's too). The second
      -- closes the round.
      if v_count >= 1 then
        perform public.versus_reveal(v_match);
      end if;

    elsif v_match.phase = 'playing'
       and v_match.round_deadline_at is not null
       and clock_timestamp() >= v_match.round_deadline_at then
      perform public.versus_reveal(v_match);

    elsif v_match.phase = 'revealed'
          and v_match.reveal_until_at is not null
          and clock_timestamp() >= v_match.reveal_until_at then

      if v_match.current_idx + 1 >= v_match.total_rounds then
        update public.match
        set phase = 'complete',
            reveal_until_at = null,
            round_started_at = null,
            round_deadline_at = null
        where id = v_match.id;
      else
        update public.match m
        set phase = 'playing',
            current_idx = m.current_idx + 1,
            answered_count = 0,
            round_started_at = clock_timestamp(),
            round_deadline_at = clock_timestamp()
              + make_interval(secs => m.round_seconds),
            reveal_until_at = null
        where m.id = v_match.id
        returning * into v_match;

        -- The new round's bot moment, counted from the start just stamped.
        if v_bot_seat is not null then
          update public.match_round r
          set bot_commit_at = v_match.round_started_at
            + r.bot_think_ms * interval '1 millisecond'
          where r.match_id = v_match.id
            and r.generation = v_match.generation
            and r.idx = v_match.current_idx
            and r.bot_think_ms is not null;
        end if;
      end if;

    else
      exit;
    end if;

    select * into v_match from public.match where id = p_match_id;
  end loop;

  return v_match;
end;
$$;

comment on function public.versus_reconcile(uuid) is
  'Applies every deadline that has passed — and, in a public match with a bot, '
  'writes the bot''s answer once its moment has passed (unannounced if first, '
  'revealing if second). Run at the head of every entry point, so the match '
  'state never depends on a client having called in.';

-- ---------------------------------------------------------------------------
-- Record one guess — now refusing one that arrives during the intro, timing
-- it on the database's clock, and in a public match announcing only a reveal.
--
-- A public match's first round is stamped to start a few seconds in the
-- future (versus_fill_public_match). A guess before then is `early`: the
-- picture is under the "opponent found" overlay, and an answer counted from a
-- start that has not happened would be an answer with negative thinking time.
-- Private rounds always start at "now", so for them this never fires.
--
-- `elapsed_ms` is now `clock_timestamp() - round_started_at` at the insert,
-- not the application's `p_elapsed_ms`. That one was the server action's
-- `Date.now()` against a Postgres timestamp — two clocks — taken a network
-- hop before the row landed, while a bot is timed in versus_reconcile on the
-- database's clock. With the two seats timed differently, the gap between an
-- opponent's `elapsedMs` and the reveal it caused (both on the pushed row)
-- would say which kind of seat it was; timed alike, the gap is the same
-- fraction of a millisecond for both. Private matches get the same, better
-- number: the one clock CLAUDE.md already makes the referee of the countdown.
-- `p_elapsed_ms` stays in the signature and is used only if the round somehow
-- has no start.
--
-- **A public match's first answer touches nothing but `match_answer`.** No
-- `answered_count`, so no new row version and no push: the opponent finds the
-- answer with its own next request (the per-seat view reads `match_answer`),
-- which is the only way it can ever find a bot's. The second answer reveals
-- the round as it always has, and that is the one push. `answered_count`
-- therefore stays 0 throughout a public match; private matches keep counting.
-- ---------------------------------------------------------------------------
create or replace function public.versus_submit(
  p_match_id uuid,
  p_seat integer,
  p_idx integer,
  p_guess bigint,
  p_verdict text,
  p_points integer,
  p_elapsed_ms integer,
  out result text,
  out match_row public.match
)
language plpgsql
set search_path = ''
as $$
declare
  v_inserted integer;
  v_count integer;
  v_now timestamptz;
begin
  match_row = public.versus_reconcile(p_match_id);

  if match_row.phase <> 'playing' then
    result = 'closed';
    return;
  end if;

  if match_row.current_idx <> p_idx then
    result = 'stale';
    return;
  end if;

  v_now = clock_timestamp();

  if match_row.round_started_at is not null
     and v_now < match_row.round_started_at then
    result = 'early';
    return;
  end if;

  insert into public.match_answer (
    match_id, generation, idx, seat,
    guess, verdict, points, elapsed_ms, answered_at
  )
  values (
    p_match_id, match_row.generation, p_idx, p_seat,
    p_guess, p_verdict, p_points,
    -- The same expression versus_reconcile times a bot with. A `case`, not a
    -- coalesce: `greatest` skips nulls, so a missing start would read as 0.
    case
      when match_row.round_started_at is null then greatest(0, p_elapsed_ms)
      else greatest(0, round(
        extract(epoch from (v_now - match_row.round_started_at)) * 1000
      ))::integer
    end,
    v_now
  )
  on conflict (match_id, generation, idx, seat) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    result = 'duplicate';
    return;
  end if;

  select count(*) into v_count
  from public.match_answer a
  where a.match_id = p_match_id
    and a.generation = match_row.generation
    and a.idx = p_idx;

  -- Pushed in an invitation; found, not told, in a public match (above).
  if not match_row.is_public then
    update public.match
    set answered_count = v_count
    where id = p_match_id
    returning * into match_row;
  end if;

  -- The round ends the moment the second answer lands, however much time is
  -- left. That is the point of the mode.
  if v_count >= 2 then
    perform public.versus_reveal(match_row);
    select * into match_row from public.match where id = p_match_id;
  end if;

  result = 'accepted';
end;
$$;

-- ---------------------------------------------------------------------------
-- Rematch — private matches only.
--
-- A public match has no rematch: the end screen offers a new opponent instead,
-- and matchmaking will not pair the same two back-to-back. Refused here as
-- well as hidden in the UI, because a rematch is an offer the other seat has
-- to answer, and a bot cannot answer one — an offer that a person sometimes
-- accepts and a bot never does is a way to tell them apart. Declining is
-- refused for the same reason from the other side: `rematch_declined_by` is on
-- the pushed row, and a seat that can be seen declining is a seat with a
-- person behind it. All three come back with the row unchanged, as for any
-- other request that does not apply.
-- ---------------------------------------------------------------------------
create or replace function public.versus_request_rematch(
  p_match_id uuid,
  p_seat integer
)
returns public.match
language plpgsql
set search_path = ''
as $$
declare
  v_match public.match;
begin
  v_match = public.versus_reconcile(p_match_id);

  if v_match.is_public then
    return v_match;
  end if;

  if v_match.phase <> 'complete' then
    return v_match;
  end if;

  update public.match
  set rematch_by = p_seat,
      rematch_declined_by = null
  where id = p_match_id
  returning * into v_match;

  return v_match;
end;
$$;

create or replace function public.versus_start_rematch(p_match_id uuid)
returns public.match
language plpgsql
set search_path = ''
as $$
declare
  v_match public.match;
  v_rounds integer;
begin
  select * into v_match from public.match where id = p_match_id for update;
  if not found then
    raise exception 'match % not found', p_match_id using errcode = 'no_data_found';
  end if;

  if v_match.is_public then
    return v_match;
  end if;

  if v_match.phase <> 'complete' then
    return v_match;
  end if;

  -- The caller deals generation + 1 before calling; without those rows the
  -- match would start on a round that does not exist.
  select count(*) into v_rounds
  from public.match_round r
  where r.match_id = p_match_id and r.generation = v_match.generation + 1;

  if v_rounds < v_match.total_rounds then
    return v_match;
  end if;

  update public.match m
  set generation = m.generation + 1,
      phase = 'playing',
      current_idx = 0,
      answered_count = 0,
      seat1_score = 0,
      seat2_score = 0,
      seat1_ready = true,
      seat2_ready = true,
      history = '[]'::jsonb,
      rematch_by = null,
      rematch_declined_by = null,
      round_started_at = clock_timestamp(),
      round_deadline_at = clock_timestamp()
        + make_interval(secs => m.round_seconds),
      reveal_until_at = null
  where m.id = p_match_id
  returning * into v_match;

  return v_match;
end;
$$;

-- The original took no lock and read nothing first; this one has to read
-- `is_public`, and reads it under the lock like every other transition. A
-- missing match still comes back as the all-null row the original returned.
create or replace function public.versus_decline_rematch(
  p_match_id uuid,
  p_seat integer
)
returns public.match
language plpgsql
set search_path = ''
as $$
declare
  v_match public.match;
begin
  select * into v_match from public.match where id = p_match_id for update;
  if not found or v_match.is_public then
    return v_match;
  end if;

  update public.match
  set rematch_by = null,
      rematch_declined_by = p_seat
  where id = p_match_id
  returning * into v_match;

  return v_match;
end;
$$;

-- ---------------------------------------------------------------------------
-- Leave a match.
--
-- Replaces the application's direct `update ... set phase = 'abandoned'`, so
-- leaving goes through the same lock and the same reconcile as everything
-- else — a player who leaves after the last reveal has elapsed finds the match
-- complete, and is not blamed for leaving it.
--
-- Who left matters only once a public match has started: a lobby closed
-- before it filled is a cancelled search and settles nothing, while leaving a
-- started public match is a forfeit (`forfeit_seat`), which the settlement
-- trigger reads as a loss for the leaver and (once anything has been scored)
-- a win for the other seat. A private match never records one — there is no
-- rating for it to move.
--
-- Leaving during the *last* round's reveal is not leaving: every round has
-- been played and both scores are final, and only the six seconds of showing
-- the answer remain. Such a match is completed here, exactly as reconcile
-- would complete it when the window closes, and settles on its scores. As a
-- forfeit it would turn a won match into a loss for whoever pressed "Find
-- opponent" (which forfeits every open match first) before the window ran
-- out. Private matches too: a fully played invitation that pays its TP when
-- the window closes should not stop paying it because someone left early.
-- ---------------------------------------------------------------------------
create or replace function public.versus_abandon(p_match_id uuid, p_seat integer)
returns public.match
language plpgsql
set search_path = ''
as $$
declare
  v_match public.match;
begin
  if p_seat is null or p_seat not in (1, 2) then
    raise exception 'versus_abandon: no seat %', p_seat;
  end if;

  -- Takes the row lock, and leaves the match where the clock says it is.
  v_match = public.versus_reconcile(p_match_id);

  if v_match.phase = 'revealed'
     and v_match.current_idx + 1 >= v_match.total_rounds then
    -- reconcile's last-reveal step, a few seconds early.
    update public.match
    set phase = 'complete',
        reveal_until_at = null,
        round_started_at = null,
        round_deadline_at = null
    where id = p_match_id
    returning * into v_match;

  elsif v_match.phase in ('lobby', 'playing', 'revealed') then
    update public.match m
    set phase = 'abandoned',
        forfeit_seat = case
          when m.is_public and m.phase <> 'lobby' then p_seat
          else null
        end
    where m.id = p_match_id
    returning * into v_match;
  end if;

  return v_match;
end;
$$;

comment on function public.versus_abandon(uuid, integer) is
  'Leaves a match: abandoned, and in a started public match forfeit_seat = the '
  'leaver (settled by versus_settle_rating). During the last reveal it '
  'completes the match instead. Reconciles first.';

-- ---------------------------------------------------------------------------
-- Close every unfinished public match an account is still sitting in.
--
-- Called by "Find opponent" before it searches, so a player who closes the tab
-- on a match they are losing and queues again still takes the loss: the old
-- match is forfeited here, exactly as if they had pressed leave. Without it a
-- losing match against a bot could be dodged forever, since a bot never leaves
-- and a match nobody touches never ends. Lobbies close without a result, like
-- any cancelled search. Returns how many were closed.
--
-- Every lock is taken before anything is settled: first all the matches, in
-- id order, then every profile their settlements will touch, in id order —
-- the order versus_settle_rating takes profiles in. Abandoning one at a time
-- would not do. Each forfeit settles under its match lock and holds the
-- players' profile locks to commit, so this would sit on match 1 and profile
-- U while waiting for match 2. The opponent's tick on match 2, meanwhile,
-- would hold match 2 and wait for profile U as it settled — a cycle Postgres
-- breaks by failing one of them. With the locks taken up front, nothing here
-- waits on a match while holding a profile, and the profiles come in one
-- sorted pass rather than one settlement's pair after another (match 1's
-- opponent held while waiting on match 2's could cross a settlement between
-- those two). Since every match is held before the loop, none can be swept
-- out from under it either.
-- ---------------------------------------------------------------------------
create or replace function public.versus_forfeit_user(
  p_user_id uuid,
  p_except_match uuid
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_seat record;
  v_after public.match;
  v_closed integer := 0;
begin
  if p_user_id is null then
    return 0;
  end if;

  -- Rows are locked after the sort (ORDER BY runs before FOR UPDATE), so in
  -- id order. A match that settled while this waited for it is re-checked
  -- against the phase and left out.
  select coalesce(array_agg(t.id order by t.id), '{}'::uuid[]) into v_ids
  from (
    select m.id
    from public.match m
    where m.is_public
      and m.phase in ('lobby', 'playing', 'revealed')
      and (p_except_match is null or m.id <> p_except_match)
      and exists (
        select 1
        from public.match_player p
        where p.match_id = m.id and p.user_id = p_user_id
      )
    order by m.id
    for update of m
  ) t;

  if cardinality(v_ids) = 0 then
    return 0;
  end if;

  perform 1
  from public.profile pr
  where pr.id in (
    select p.user_id
    from public.match_player p
    where p.match_id = any (v_ids) and p.user_id is not null
  )
  order by pr.id
  for update;

  for v_seat in
    select distinct on (p.match_id) p.match_id, p.seat
    from public.match_player p
    where p.match_id = any (v_ids) and p.user_id = p_user_id
    order by p.match_id, p.seat
  loop
    v_after = public.versus_abandon(v_seat.match_id, v_seat.seat);
    -- 'complete' when it was in its last reveal (see versus_abandon).
    if v_after.phase in ('abandoned', 'complete') then
      v_closed = v_closed + 1;
    end if;
  end loop;

  return v_closed;
end;
$$;

comment on function public.versus_forfeit_user(uuid, uuid) is
  'Abandons every unfinished public match the account sits in (except one), '
  'forfeiting the started ones. Returns the number closed.';

-- ===========================================================================
-- Settlement
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- No TP for public matches.
--
-- The original trigger body from 20261017120000_scoring.sql, with one line in
-- front of it. A bot has no account and this pays only when both seats are
-- accounts, so TP from public matches would flow against people and never
-- against bots — and a player's TP history would then say which opponents
-- were which. The public game pays Chrono Rating instead
-- (versus_settle_rating, below). Private matches are untouched.
-- ---------------------------------------------------------------------------
create or replace function public.versus_bank_tp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u1 uuid;
  v_u2 uuid;
  v_paid integer;
  v_tp1 integer;
  v_tp2 integer;
  v_source text := 'versus:' || new.id || ':' || new.generation;
begin
  if new.is_public then
    return new;
  end if;

  select user_id into v_u1 from public.match_player where match_id = new.id and seat = 1;
  select user_id into v_u2 from public.match_player where match_id = new.id and seat = 2;

  if v_u1 is null or v_u2 is null or v_u1 = v_u2 then
    return new;
  end if;

  select count(*) into v_paid
  from public.score_entry
  where user_id = v_u1
    and opponent_id = v_u2
    and kind = 'versus'
    and created_at >= date_trunc('day', now(), 'UTC');

  -- VERSUS_DAILY_PAIR_CAP.
  if v_paid >= 3 then
    return new;
  end if;

  -- VERSUS_TP: win 30, draw 10, loss 5.
  if new.seat1_score > new.seat2_score then
    v_tp1 := 30; v_tp2 := 5;
  elsif new.seat1_score < new.seat2_score then
    v_tp1 := 5; v_tp2 := 30;
  else
    v_tp1 := 10; v_tp2 := 10;
  end if;

  insert into public.score_entry (user_id, game, kind, source, tp, opponent_id)
  values
    (v_u1, 'versus', 'versus', v_source, v_tp1, v_u2),
    (v_u2, 'versus', 'versus', v_source, v_tp2, v_u1)
  on conflict (user_id, source) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- One seat's rating change for one settled match. Returns the delta to show.
--
--   * an account: lock its profile, apply the rule to the rating it has
--     *now*, clamp at zero, and write the ledger row. The primary key on
--     (user, match) is the guard — if the row is already there this match
--     already settled them, the profile is left alone and the banked delta is
--     what is reported.
--   * ...unless the opponent was shown as a guest (`p_opponent_guest`: the
--     other seat shows no rating) and the account has already taken five
--     paying results from guests today (UTC). Then the match is unrated for
--     it: 0, no ledger row, profile untouched. A guest is the one opponent the
--     back-to-back rule can only see through the match just played
--     (`prev_match_id`) — an account's own private window is a guest, and a
--     fresh one has no previous match — so without a bound an account could
--     play itself up a league against a tab it controls. Wins *and* draws count, because two tabs that
--     copy each other's answers tie every time; losses do not, since nobody
--     farms them, but past the cap they are unrated too. "Shown as a guest"
--     includes a bot posing as one, on purpose: a cap that only real guests
--     could exhaust would tell the player, after the fifth, which was which.
--   * a bot with a shown rating: the same rule applied to that number, written
--     nowhere. It exists so the result screen moves the opponent's rating as
--     it would a person's.
--   * a guest, or a bot posing as one: null. Nothing is stored for a guest and
--     nothing is shown.
--
-- `p_opponent` is the other seat's account, null for a guest or a bot — the
-- ledger's record of who was played, which is also where matchmaking finds the
-- last opponents to keep apart.
-- ---------------------------------------------------------------------------

-- An earlier draft of this migration had no `p_opponent_guest`; a database
-- that ran it would otherwise keep that overload beside this one.
drop function if exists public.versus_apply_rating(uuid, uuid, boolean, integer, text, uuid);

create or replace function public.versus_apply_rating(
  p_match_id uuid,
  p_user_id uuid,
  p_is_bot boolean,
  p_shown_rating integer,
  p_outcome text,
  p_opponent uuid,
  p_opponent_guest boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Paying results (win, draw) an account may take from opponents shown as
  -- guests per UTC day; the day boundary is versus_bank_tp's.
  c_guest_daily_cap constant integer := 5;
  v_before integer;
  v_after integer;
  v_delta integer;
  v_paid integer;
  v_inserted integer;
begin
  if p_outcome is null or p_outcome not in ('win', 'loss', 'draw') then
    raise exception 'versus_apply_rating: bad outcome %', p_outcome;
  end if;

  if p_is_bot then
    if p_shown_rating is null then
      return null;
    end if;
    v_before = greatest(p_shown_rating, 0);
    return greatest(0, v_before + public.chrono_delta(v_before, p_outcome)) - v_before;
  end if;

  if p_user_id is null then
    return null;
  end if;

  select p.chrono_rating into v_before
  from public.profile p
  where p.id = p_user_id
  for update;

  -- Every account has a profile (handle_new_user), but one deleted mid-match
  -- has nothing left to rate.
  if not found then
    return null;
  end if;

  -- Already settled: report what was banked. Checked before the cap, so a
  -- second firing cannot read its own first as one of today's five.
  select e.delta into v_delta
  from public.chrono_rating_entry e
  where e.user_id = p_user_id and e.match_id = p_match_id;
  if found then
    return v_delta;
  end if;

  if p_opponent_guest then
    select count(*) into v_paid
    from public.chrono_rating_entry e
    where e.user_id = p_user_id
      and e.opponent_guest
      and e.outcome in ('win', 'draw')
      and e.created_at >= date_trunc('day', now(), 'UTC');

    if v_paid >= c_guest_daily_cap then
      return 0;
    end if;
  end if;

  v_after = greatest(0, v_before + public.chrono_delta(v_before, p_outcome));
  v_delta = v_after - v_before;

  -- `on conflict` stays as the last word on idempotency; the profile lock
  -- above already serialises one player's settlements, so it should never be
  -- what decides.
  insert into public.chrono_rating_entry (
    user_id, match_id, opponent_id, opponent_guest,
    outcome, delta, rating_before, rating_after
  )
  values (
    p_user_id, p_match_id, p_opponent, coalesce(p_opponent_guest, false),
    p_outcome, v_delta, v_before, v_after
  )
  on conflict (user_id, match_id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    select e.delta into v_delta
    from public.chrono_rating_entry e
    where e.user_id = p_user_id and e.match_id = p_match_id;
    return v_delta;
  end if;

  update public.profile
  set chrono_rating = v_after
  where id = p_user_id;

  return v_delta;
end;
$$;

comment on function public.versus_apply_rating(uuid, uuid, boolean, integer, text, uuid, boolean) is
  'Settles one seat of a public match: an account is rated and ledgered '
  '(idempotent on user+match; unrated past five paying results a day against '
  'guest-shown opponents), a rated bot gets a display delta, a guest null.';

-- ---------------------------------------------------------------------------
-- Settle a public match as it ends.
--
-- BEFORE UPDATE, so the deltas are written into the very row version that
-- moves the match to `complete` or `abandoned` (see the header). Fires once
-- per match: only on the step from a live phase to a terminal one, and a
-- public match has no way back out (no rematch).
--
--   complete   by score; equal scores are a draw.
--   abandoned  only a started match with a `forfeit_seat`: a loss for that
--              seat, and a win for the other once a round has been revealed.
--              Before that — the intro, or round 0 still open — the seat that
--              stayed gets nothing (0, or null if it shows no rating): no
--              round was played that it could have lost, and a seat that sits
--              down and leaves at once is the cheapest result there is to
--              manufacture. The leaver still loses, or the intro would be a
--              free look at who was drawn before deciding to play. A lobby
--              closed before it filled, or one closed by a searcher moving
--              into another lobby, has no forfeit and settles nothing.
--
-- Each seat is rated against what the other seat *shows*: no rating means
-- shown as a guest, which is what versus_apply_rating's guest cap counts.
--
-- The two profile rows are locked up front in id order: two matches between
-- the same pair settling at once would otherwise each lock "their" seat 1
-- first and wait on each other.
-- ---------------------------------------------------------------------------
create or replace function public.versus_settle_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seat1 public.match_player;
  v_seat2 public.match_player;
  v_outcome1 text;
  v_outcome2 text;
  v_played boolean;
begin
  if not (new.seat1_joined and new.seat2_joined) then
    return new;
  end if;

  -- A round is in `history` once it has been revealed, and only then has
  -- anybody's score moved.
  v_played = jsonb_array_length(coalesce(new.history, '[]'::jsonb)) > 0;

  if new.phase = 'complete' then
    if new.seat1_score > new.seat2_score then
      v_outcome1 := 'win'; v_outcome2 := 'loss';
    elsif new.seat1_score < new.seat2_score then
      v_outcome1 := 'loss'; v_outcome2 := 'win';
    else
      v_outcome1 := 'draw'; v_outcome2 := 'draw';
    end if;
  elsif new.forfeit_seat = 1 then
    v_outcome1 := 'loss';
    v_outcome2 := case when v_played then 'win' end;
  elsif new.forfeit_seat = 2 then
    v_outcome1 := case when v_played then 'win' end;
    v_outcome2 := 'loss';
  else
    return new;
  end if;

  select * into v_seat1 from public.match_player where match_id = new.id and seat = 1;
  select * into v_seat2 from public.match_player where match_id = new.id and seat = 2;

  -- One account in both seats is not a result. Matchmaking never seats a
  -- player against their own lobby; this is the same guard versus_bank_tp has.
  if v_seat1.user_id is not null and v_seat1.user_id = v_seat2.user_id then
    return new;
  end if;

  perform 1
  from public.profile p
  where p.id in (v_seat1.user_id, v_seat2.user_id)
  order by p.id
  for update;

  -- No outcome: the seat that stayed through an unplayed walk-out. Unchanged,
  -- shown as such — 0 beside a rating, nothing where there is none — and the
  -- same whether that seat is a person or a bot.
  new.seat1_rating_delta := case
    when v_outcome1 is null then
      case when new.seat1_rating is not null then 0 end
    else public.versus_apply_rating(
      new.id, v_seat1.user_id, v_seat1.bot_level is not null,
      new.seat1_rating, v_outcome1, v_seat2.user_id, new.seat2_rating is null
    )
  end;
  new.seat2_rating_delta := case
    when v_outcome2 is null then
      case when new.seat2_rating is not null then 0 end
    else public.versus_apply_rating(
      new.id, v_seat2.user_id, v_seat2.bot_level is not null,
      new.seat2_rating, v_outcome2, v_seat1.user_id, new.seat1_rating is null
    )
  end;

  return new;
end;
$$;

drop trigger if exists match_settle_rating on public.match;

create trigger match_settle_rating
  before update of phase on public.match
  for each row
  when (
    new.is_public
    and new.phase in ('complete', 'abandoned')
    and old.phase not in ('complete', 'abandoned')
  )
  execute function public.versus_settle_rating();

-- ===========================================================================
-- Row Level Security and grants
-- ===========================================================================

-- The ledger: service role only, like score_entry. A player who could write a
-- rating row could award themselves any rating, and one who could read it
-- would learn from a null `opponent_id` which of their opponents had no
-- account.
alter table public.chrono_rating_entry enable row level security;
revoke all on public.chrono_rating_entry from anon, authenticated;

-- `match`: from a table grant to a column grant (see the header). The list is
-- MATCH_CLIENT_COLUMNS in lib/game/versus.ts — keep the two in step. Not
-- granted: `code` (the invite), `public_tier` (a lobby's league),
-- `created_at` / `updated_at` (bookkeeping no screen reads), and the seats'
-- `seatN_name`, `seatN_rating` and `seatN_rating_delta` — identity, on a row
-- anyone can list, and served to the two seats in their own views instead.
-- `is_public` and `forfeit_seat` stay: without a name beside them they link
-- no row to any person.
revoke select on public.match from anon, authenticated;

grant select (
  id,
  mode,
  phase,
  generation,
  total_rounds,
  round_seconds,
  reveal_seconds,
  current_idx,
  round_started_at,
  round_deadline_at,
  reveal_until_at,
  answered_count,
  seat1_joined,
  seat2_joined,
  seat1_ready,
  seat2_ready,
  seat1_score,
  seat2_score,
  history,
  rematch_by,
  rematch_declined_by,
  version,
  is_public,
  forfeit_seat
) on public.match to anon, authenticated;

comment on policy "match rows are readable by everyone" on public.match is
  'Rows stay listable — Realtime authorises a subscriber through this policy, '
  'and a guest''s seat has no auth.uid() to name — but only the column-granted '
  'subset (MATCH_CLIENT_COLUMNS in lib/game/versus.ts) is selectable: no invite '
  'code, and nothing that names or rates a seat.';

-- Names bots have worn: service role only (see the table). A client that could
-- read it would hold the list of names that are bots.
alter table public.reserved_username enable row level security;
revoke all on public.reserved_username from anon, authenticated;

-- Every function here is the service role's alone, the posture of every other
-- versus_* function: PostgREST exposes anything `anon` may execute as an RPC
-- endpoint, and a new function in `public` is executable by `public` by
-- default. Restated for the replaced ones too; `create or replace` keeps their
-- old revokes, but the list here is then the whole story.
revoke all on function
  public.chrono_tier(integer),
  public.chrono_delta(integer, text),
  public.versus_publish_lobby(uuid),
  public.versus_fill_public_match(uuid, text, integer, integer),
  public.versus_matchmake(uuid, uuid, integer, text, text, integer, integer, integer, uuid, integer),
  public.versus_seat_bot(uuid, text, text, integer, text, integer, jsonb, integer, integer),
  public.versus_abandon(uuid, integer),
  public.versus_forfeit_user(uuid, uuid),
  public.versus_apply_rating(uuid, uuid, boolean, integer, text, uuid, boolean),
  public.versus_settle_rating(),
  public.versus_reconcile(uuid),
  public.versus_submit(uuid, integer, integer, bigint, text, integer, integer),
  public.versus_request_rematch(uuid, integer),
  public.versus_start_rematch(uuid),
  public.versus_decline_rematch(uuid, integer),
  public.versus_bank_tp(),
  public.profile_refuse_reserved_username()
  from public, anon, authenticated;
