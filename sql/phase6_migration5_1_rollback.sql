-- SimSim — Phase 6, Migration 5.1 — ROLLBACK SCRIPT
-- Reverts check_dashboard_login_allowed / record_dashboard_login_outcome to
-- their exact Migration 5.0 bodies, and drops the pending_count column
-- Migration 5.1 added. Touches nothing else — no other table, no other
-- function, no RLS policy, no Customer OTP/Session/Loyalty, no Page/Branch
-- Authorization, no Menu/Orders/POS.
--
-- Dashboard/Staff login API contract is unaffected either direction: both
-- functions keep their Migration-5.0-era names and signatures throughout
-- (5.0 -> 5.1 -> back to 5.0), so dashboard-login-guard/handler.js needs no
-- change to call either version — this rollback is safe to run without
-- coordinating an Edge Function redeploy.
--
-- Data compatibility: any dashboard_login_lockouts row written under 5.1
-- (including one with a currently-active lock_until, or a nonzero
-- pending_count from a request that was in flight at rollback time) remains
-- fully valid and readable by the reverted 5.0-era functions — 5.0 never
-- reads pending_count, so its presence is simply inert until this script
-- drops the column. dashboard_login_attempts is untouched by either
-- version's schema, so its history is preserved across the rollback
-- unmodified.

begin;

-- ----------------------------------------------------------------------------
-- 1) Restore both functions to their exact Migration 5.0 bodies.
-- ----------------------------------------------------------------------------
create or replace function public.check_dashboard_login_allowed(
  p_account_key text,
  p_ip_hash text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lock_until timestamptz;
  v_ip_failure_count integer;
begin
  if p_account_key is null or btrim(p_account_key) = '' or p_ip_hash is null or btrim(p_ip_hash) = '' then
    return jsonb_build_object('allowed', false);
  end if;

  select lock_until into v_lock_until
    from public.dashboard_login_lockouts
   where account_key = p_account_key;

  if v_lock_until is not null and v_lock_until > now() then
    insert into public.dashboard_login_attempts (account_key, ip_hash, outcome)
    values (p_account_key, p_ip_hash, 'blocked');
    return jsonb_build_object('allowed', false);
  end if;

  select count(*) into v_ip_failure_count
    from public.dashboard_login_attempts
   where ip_hash = p_ip_hash
     and outcome = 'failure'
     and created_at > now() - interval '15 minutes';

  if v_ip_failure_count >= 20 then
    insert into public.dashboard_login_attempts (account_key, ip_hash, outcome)
    values (p_account_key, p_ip_hash, 'blocked');
    return jsonb_build_object('allowed', false);
  end if;

  if random() < 0.01 then
    delete from public.dashboard_login_attempts where created_at < now() - interval '1 day';
  end if;

  return jsonb_build_object('allowed', true);
end;
$function$;

revoke all on function public.check_dashboard_login_allowed(text, text) from public, anon, authenticated;
grant execute on function public.check_dashboard_login_allowed(text, text) to service_role;

create or replace function public.record_dashboard_login_outcome(
  p_account_key text,
  p_ip_hash text,
  p_success boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_count integer;
begin
  if p_account_key is null or btrim(p_account_key) = '' or p_ip_hash is null or btrim(p_ip_hash) = '' then
    return jsonb_build_object('locked', false);
  end if;

  if p_success then
    insert into public.dashboard_login_lockouts (account_key, failure_count, lock_until, updated_at)
    values (p_account_key, 0, null, now())
    on conflict (account_key) do update
      set failure_count = 0,
          lock_until = null,
          updated_at = now();

    insert into public.dashboard_login_attempts (account_key, ip_hash, outcome)
    values (p_account_key, p_ip_hash, 'success');

    return jsonb_build_object('locked', false);
  end if;

  insert into public.dashboard_login_lockouts (account_key, failure_count, lock_until, updated_at)
  values (p_account_key, 1, null, now())
  on conflict (account_key) do update
    set failure_count = case
          when dashboard_login_lockouts.lock_until is not null and dashboard_login_lockouts.lock_until <= now()
            then 1
          else dashboard_login_lockouts.failure_count + 1
        end,
        lock_until = case
          when dashboard_login_lockouts.lock_until is not null and dashboard_login_lockouts.lock_until <= now()
            then null
          else dashboard_login_lockouts.lock_until
        end,
        updated_at = now()
  returning failure_count into v_count;

  if v_count >= 5 then
    update public.dashboard_login_lockouts
       set lock_until = now() + interval '15 minutes'
     where account_key = p_account_key;
  end if;

  insert into public.dashboard_login_attempts (account_key, ip_hash, outcome)
  values (p_account_key, p_ip_hash, 'failure');

  return jsonb_build_object('locked', v_count >= 5);
end;
$function$;

revoke all on function public.record_dashboard_login_outcome(text, text, boolean) from public, anon, authenticated;
grant execute on function public.record_dashboard_login_outcome(text, text, boolean) to service_role;

-- ----------------------------------------------------------------------------
-- 2) Drop the column Migration 5.1 added. Safe: 5.0-era functions (just
--    restored above) never reference pending_count.
-- ----------------------------------------------------------------------------
alter table public.dashboard_login_lockouts
  drop constraint if exists dashboard_login_lockouts_pending_count_nonneg;

alter table public.dashboard_login_lockouts
  drop column if exists pending_count;

commit;
