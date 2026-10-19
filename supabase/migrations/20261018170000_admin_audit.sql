-- ============================================================================
-- TEMPUS — admin audit log
--
-- Every admin write is a plpgsql `admin_*` function that changes the data and
-- writes one row here in the same transaction, so the log cannot disagree with
-- what happened. `admin_log` is the same writer for steps that happen outside
-- the database (Supabase Auth bans, account deletion, cache revalidation).
--
-- Service role only: RLS on, no policies, every grant revoked. The panel reads
-- it through the service-role client behind requireAdmin().
-- ============================================================================

create table public.admin_audit (
  id bigint generated always as identity primary key,
  -- No FK to auth.users: an admin account that is later deleted must not take
  -- its history with it (on delete cascade) or block its own deletion
  -- (no action). The id is kept as a plain value.
  actor_id uuid not null,
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  target_table text not null,
  target_id text not null,
  before jsonb,
  after jsonb,
  note text,
  created_at timestamptz not null default now()
);

create index admin_audit_target_idx on public.admin_audit (target_table, target_id, created_at desc);
create index admin_audit_created_idx on public.admin_audit (created_at desc);
create index admin_audit_action_idx on public.admin_audit (action, created_at desc);

alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from anon, authenticated, public;
grant select, insert on public.admin_audit to service_role;

comment on table public.admin_audit is
  'One row per admin write, written by the same transaction as the write. '
  'Service role only.';

-- The generic writer. Internal helper for the admin_* functions as well as the
-- TS side (Auth API steps), so it is service_role-executable too.
create or replace function public.admin_log(
  p_actor uuid,
  p_action text,
  p_table text,
  p_id text,
  p_before jsonb default null,
  p_after jsonb default null,
  p_note text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if p_actor is null then
    raise exception 'admin_log: actor is required';
  end if;
  insert into public.admin_audit (actor_id, action, target_table, target_id, before, after, note)
  values (p_actor, p_action, p_table, p_id, p_before, p_after, nullif(btrim(p_note), ''))
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.admin_log(uuid, text, text, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.admin_log(uuid, text, text, text, jsonb, jsonb, text) to service_role;
