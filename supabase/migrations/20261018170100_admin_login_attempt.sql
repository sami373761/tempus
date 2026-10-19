-- ============================================================================
-- TEMPUS — admin sign-in throttle
--
-- No CAPTCHA: failed attempts are counted per IP and per username over a
-- sliding 15-minute window and the larger count decides the wait. A success
-- does not reset anything — the window simply slides — so a correct guess in
-- the middle of a spray does not buy the attacker a fresh budget.
--
-- Service role only. The sign-in Server Action calls admin_login_gate before
-- it tries the password (or TOTP code) and admin_login_record after.
-- ============================================================================

create table public.admin_login_attempt (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('password', 'totp')),
  ip inet not null,
  username text,
  success boolean not null,
  created_at timestamptz not null default now()
);

create index admin_login_attempt_ip_idx on public.admin_login_attempt (kind, ip, created_at desc);
create index admin_login_attempt_user_idx on public.admin_login_attempt (kind, username, created_at desc);

alter table public.admin_login_attempt enable row level security;
revoke all on public.admin_login_attempt from anon, authenticated, public;
grant select, insert, delete on public.admin_login_attempt to service_role;

-- Seconds the caller must wait before the next attempt is even tried.
--   0-2 failures in 15 min: none; then 2^(n-2) seconds (1, 2, 4 ...) up to 900.
--   10 failures on one username in an hour: that username is locked for the
--   hour, whatever the IP — the returned wait is the time until the oldest of
--   those ten leaves the window.
-- The wait is measured from the latest failure, so a caller who waits it out
-- gets exactly one more try before the next, longer wait.
create or replace function public.admin_login_gate(p_kind text, p_ip inet, p_username text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ip_fail int;
  v_user_fail int;
  v_n int;
  v_last timestamptz;
  v_wait int := 0;
  v_hour_fail int;
  v_lock_until timestamptz;
begin
  p_username := nullif(lower(btrim(p_username)), '');

  select count(*), max(created_at) into v_ip_fail, v_last
  from public.admin_login_attempt
  where kind = p_kind and ip = p_ip and not success
    and created_at > now() - interval '15 minutes';

  select count(*) into v_user_fail
  from public.admin_login_attempt
  where kind = p_kind and p_username is not null and username = p_username and not success
    and created_at > now() - interval '15 minutes';

  if v_user_fail > v_ip_fail then
    select max(created_at) into v_last
    from public.admin_login_attempt
    where kind = p_kind and username = p_username and not success
      and created_at > now() - interval '15 minutes';
  end if;

  v_n := greatest(v_ip_fail, v_user_fail);
  if v_n > 2 then
    v_wait := least(900, power(2, least(v_n - 2, 10))::int);
    v_wait := greatest(0, ceil(extract(epoch from (v_last + make_interval(secs => v_wait) - now())))::int);
  end if;

  if p_username is not null then
    select count(*) into v_hour_fail
    from public.admin_login_attempt
    where kind = p_kind and username = p_username and not success
      and created_at > now() - interval '1 hour';
    if v_hour_fail >= 10 then
      select created_at + interval '1 hour' into v_lock_until
      from public.admin_login_attempt
      where kind = p_kind and username = p_username and not success
        and created_at > now() - interval '1 hour'
      order by created_at desc
      offset 9 limit 1;
      v_wait := greatest(v_wait, ceil(extract(epoch from (v_lock_until - now())))::int);
    end if;
  end if;

  return v_wait;
end;
$$;

create or replace function public.admin_login_record(
  p_kind text, p_ip inet, p_username text, p_success boolean
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.admin_login_attempt (kind, ip, username, success)
  values (p_kind, p_ip, nullif(lower(btrim(p_username)), ''), p_success);
$$;

create or replace function public.admin_login_attempt_prune()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted int;
begin
  delete from public.admin_login_attempt where created_at < now() - interval '30 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.admin_login_gate(text, inet, text) from public, anon, authenticated;
revoke execute on function public.admin_login_record(text, inet, text, boolean) from public, anon, authenticated;
revoke execute on function public.admin_login_attempt_prune() from public, anon, authenticated;
grant execute on function public.admin_login_gate(text, inet, text) to service_role;
grant execute on function public.admin_login_record(text, inet, text, boolean) to service_role;
grant execute on function public.admin_login_attempt_prune() to service_role;
