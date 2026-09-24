-- ============================================================================
-- Rollback for phase6_migration7_ip_rate_limit_atomicity_fix.sql
-- ----------------------------------------------------------------------------
-- Restores check_dashboard_login_allowed / record_dashboard_login_outcome to
-- their EXACT Migration 5.1 bodies (byte-for-byte from
-- sql/phase6_migration5_1_dashboard_login_account_race_fix.sql) and drops the
-- new dashboard_login_ip_throttle table.
--
-- ⚠️ Restores the IP-level rolling-window race documented in
-- SIMSIM_PRODUCTION_SECURITY_SIGN_OFF.md §5/§12 and empirically reproduced in
-- SIMSIM_IP_RATE_LIMIT_RACE_REMEDIATION_REPORT.md (§4/§5 — 26 admitted against
-- a 20 threshold under 50 concurrent requests). The ACCOUNT-level fix
-- (Migration 5.1) is NOT affected by this rollback — its logic is restored
-- unchanged, not removed. Use only for verified rollback testing or an
-- explicit owner-directed revert — never as a routine operation.
-- ============================================================================
begin;

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
  v_failure_count     integer;
  v_pending_count     integer;
  v_lock_until        timestamptz;
  v_ip_failure_count  integer;
begin
  if p_account_key is null or btrim(p_account_key) = '' or p_ip_hash is null or btrim(p_ip_hash) = '' then
    return jsonb_build_object('allowed', false);
  end if;

  insert into public.dashboard_login_lockouts (account_key, failure_count, pending_count, lock_until, updated_at)
  values (p_account_key, 0, 0, null, now())
  on conflict (account_key) do update
    set failure_count = case
          when dashboard_login_lockouts.lock_until is not null
               and dashboard_login_lockouts.lock_until <= now()
            then 0
          else dashboard_login_lockouts.failure_count
        end,
        lock_until = case
          when dashboard_login_lockouts.lock_until is not null
               and dashboard_login_lockouts.lock_until <= now()
            then null
          else dashboard_login_lockouts.lock_until
        end,
        updated_at = now()
  returning failure_count, pending_count, lock_until
    into v_failure_count, v_pending_count, v_lock_until;

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

  if v_failure_count + v_pending_count >= 5 then
    insert into public.dashboard_login_attempts (account_key, ip_hash, outcome)
    values (p_account_key, p_ip_hash, 'blocked');
    return jsonb_build_object('allowed', false);
  end if;

  update public.dashboard_login_lockouts
     set pending_count = pending_count + 1,
         updated_at = now()
   where account_key = p_account_key;

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
  v_failure_count integer;
  v_lock_until    timestamptz;
begin
  if p_account_key is null or btrim(p_account_key) = '' or p_ip_hash is null or btrim(p_ip_hash) = '' then
    return jsonb_build_object('locked', false);
  end if;

  if p_success then
    update public.dashboard_login_lockouts
       set pending_count = greatest(pending_count - 1, 0),
           failure_count = case when lock_until is not null and lock_until > now() then failure_count else 0 end,
           lock_until    = case when lock_until is not null and lock_until > now() then lock_until else null end,
           updated_at = now()
     where account_key = p_account_key;

    insert into public.dashboard_login_attempts (account_key, ip_hash, outcome)
    values (p_account_key, p_ip_hash, 'success');

    return jsonb_build_object('locked', false);
  end if;

  update public.dashboard_login_lockouts
     set pending_count = greatest(pending_count - 1, 0),
         failure_count = failure_count + 1,
         updated_at = now()
   where account_key = p_account_key
  returning failure_count, lock_until into v_failure_count, v_lock_until;

  if v_failure_count >= 5 and (v_lock_until is null or v_lock_until <= now()) then
    update public.dashboard_login_lockouts
       set lock_until = now() + interval '15 minutes'
     where account_key = p_account_key;
  end if;

  insert into public.dashboard_login_attempts (account_key, ip_hash, outcome)
  values (p_account_key, p_ip_hash, 'failure');

  return jsonb_build_object('locked', v_failure_count >= 5);
end;
$function$;

revoke all on function public.record_dashboard_login_outcome(text, text, boolean) from public, anon, authenticated;
grant execute on function public.record_dashboard_login_outcome(text, text, boolean) to service_role;

drop table if exists public.dashboard_login_ip_throttle;

commit;
