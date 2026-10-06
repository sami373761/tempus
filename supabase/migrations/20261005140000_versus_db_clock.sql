-- ---------------------------------------------------------------------------
-- The database clock, readable by the application.
--
-- Every deadline in this feature is stamped by Postgres `clock_timestamp()`,
-- but `buildMatchView` was reporting `serverNow` from the *Node* process's
-- `Date.now()`. Those are two different machines — a Vercel function and a
-- Supabase instance — and the browser measures its offset against whichever
-- one answers it. The difference was measured at 50-112ms on a dev machine,
-- with no guarantee of sign: when Node runs ahead of Postgres, every client's
-- countdown reaches zero *before* the deadline it is counting towards has
-- actually passed, `versus_reconcile` correctly does nothing, and the round
-- sits at "next round in 0".
--
-- So the clock the client calibrates against has to be the clock that sets
-- the deadlines. One function, read once per view, alongside the reconcile
-- that precedes it.
--
-- `volatile` is not the default for `language sql` by accident: marked stable
-- this would be folded to one value per statement and could be cached, which
-- is precisely wrong for a clock.
-- ---------------------------------------------------------------------------
create or replace function public.versus_db_now()
returns timestamptz
language sql
volatile
set search_path = ''
as $$ select clock_timestamp() $$;

comment on function public.versus_db_now is
  'The database clock. The client measures its offset against this, because '
  'this is the clock every round deadline is stamped from.';

-- Same posture as every other versus_* function: reachable by the service
-- role only. PostgREST exposes anything `anon` may execute as an RPC
-- endpoint, and a new function in `public` is granted to `public` by default.
revoke all on function public.versus_db_now() from public, anon, authenticated;
