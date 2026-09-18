-- SimSim — Phase 6, Migration 5.0: Dashboard Email+Password login rate
-- limiting + temporary account lockout (F-01, SIMSIM_DASHBOARD_LOGIN_
-- SECURITY_AUDIT_REPORT.md; design in SIMSIM_DASHBOARD_LOGIN_HARDENING_
-- PREFLIGHT_REPORT.md).
--
-- Scope: Dashboard/Staff Email+Password login ONLY (src/pages/Login.jsx,
-- src/pages/StaffLogin.jsx, both via src/store/authStore.js's signIn()).
-- Does NOT touch, reuse, or depend on Customer OTP/Customer Session
-- (customer_sessions, customer_phone_verifications, get_customer_loyalty) —
-- those remain a completely separate system, per every prior migration in
-- this series' explicit instruction.
--
-- Deliberately independent from every existing rate-limit table
-- (otp_ip_request_log, loyalty_lookup_rate_log) — same "one counter domain
-- per concern, never conflated" precedent this project has followed since
-- Migration 4.1.
--
-- account_key is the NORMALIZED (trim + lowercase) submitted login email —
-- NOT a foreign key to auth.users. A non-existing email must be rate-limited
-- identically to a real one (enumeration-safety), which requires tracking it
-- even though no matching auth.users row exists.
--
-- Two SECURITY DEFINER functions, both service_role-only (called only by the
-- new `dashboard-login-guard` Edge Function, which has SUPABASE_SERVICE_ROLE_
-- KEY automatically available — same as every other Edge Function in this
-- project):
--   1) check_dashboard_login_allowed(account_key, ip_hash) — called BEFORE
--      forwarding credentials to Supabase Auth. Denies immediately (without
--      ever calling Supabase Auth) if the account is currently locked OR the
--      IP has already crossed its own failed-attempt threshold.
--   2) record_dashboard_login_outcome(account_key, ip_hash, success) —
--      called AFTER Supabase Auth responds. On success: resets the account's
--      counter and clears any lock. On failure: atomically increments the
--      account's counter (via INSERT ... ON CONFLICT DO UPDATE, Postgres's
--      standard atomic-upsert-increment pattern — the same class of fix this
--      project already used once before for a real concurrent-request race,
--      see sql/customer_identity_phase1.sql's SELECT ... FOR UPDATE comment)
--      and sets a 15-minute lock_until once the count reaches 5.
--
-- Policy (approved for this implementation — Migration 5.0 task's own §3,
-- not independently re-derived here):
--   Account: 5 failed attempts -> 15-minute temporary lockout.
--   IP:      20 failed attempts / 15-minute sliding window -> temporary
--            throttle (mirrors check_and_log_otp_ip_request's own existing
--            20/15 policy for consistency).
--   Combined via OR: either one blocking is sufficient to reject a request.
--
-- IP hashing: SHA-256 of the extracted source IP (no HMAC, no raw IP stored)
-- — same unsalted-SHA-256 pattern already used by send-phone-otp/ipHash.js
-- and menu-next/app/api/customer/loyalty/ipHash.js.
--
-- IP counter semantics (task §17): only a REAL 'failure' outcome (a
-- confirmed wrong-credentials response from Supabase Auth) counts toward the
-- IP sliding window. A malformed request never reaches these functions at
-- all (rejected by the Edge Function before any DB call). A 'blocked'
-- outcome (already-locked account, or already-throttled IP) is logged for
-- observability only and does NOT itself count toward the IP window — this
-- prevents a single throttled IP from perpetuating its own throttle via the
-- log entries the throttle itself creates.
begin;

-- ============================================================================
-- 1) dashboard_login_lockouts — one row per account_key that has ever failed
--    a login. Small, frequently-updated state table, kept separate from the
--    append-only log below.
-- ============================================================================
create table if not exists public.dashboard_login_lockouts (
  account_key    text primary key,
  failure_count  integer not null default 0,
  lock_until     timestamptz,
  updated_at     timestamptz not null default now()
);

alter table public.dashboard_login_lockouts enable row level security;
-- RLS enabled, zero policies — identical posture to every other Phase 1-6
-- security table (customer_identities, otp_ip_request_log,
-- loyalty_lookup_rate_log): no anon/authenticated access of any kind, direct
-- or indirect. The only door in is the two SECURITY DEFINER functions below,
-- themselves service_role-only.

-- ============================================================================
-- 2) dashboard_login_attempts — append-only operational log. NEVER stores
--    password, password hash, access token, refresh token, OTP, or any
--    secret — only an account key (an email, already known to whoever typed
--    it), a hashed IP, a coarse outcome, and a timestamp.
-- ============================================================================
create table if not exists public.dashboard_login_attempts (
  id           bigint generated always as identity primary key,
  account_key  text not null,
  ip_hash      text not null,
  outcome      text not null check (outcome in ('failure', 'success', 'blocked')),
  created_at   timestamptz not null default now()
);

create index if not exists idx_dashboard_login_attempts_account_time
  on public.dashboard_login_attempts (account_key, created_at);
create index if not exists idx_dashboard_login_attempts_ip_time
  on public.dashboard_login_attempts (ip_hash, created_at);

alter table public.dashboard_login_attempts enable row level security;
-- Same posture as above — RLS enabled, zero policies.

-- Defense-in-depth: explicit revoke even though RLS with no policies already
-- blocks anon/authenticated at the row level for any PostgREST-issued query.
revoke all on public.dashboard_login_lockouts from public, anon, authenticated;
revoke all on public.dashboard_login_attempts from public, anon, authenticated;

-- ============================================================================
-- 3) check_dashboard_login_allowed — the pre-credential-check gate. Called
--    ONCE per login attempt, BEFORE the Edge Function ever forwards
--    credentials to Supabase Auth. Returns {"allowed": true|false} — never
--    reveals WHY a request was denied (account-locked vs IP-throttled),
--    matching this project's own enumeration-safe-by-construction precedent
--    (validate_customer_session, verify_phone_otp).
-- ============================================================================
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
    -- Malformed caller input at the DB layer — fail closed, deny.
    return jsonb_build_object('allowed', false);
  end if;

  -- Account lockout check — does not touch/increment anything, only reads.
  select lock_until into v_lock_until
    from public.dashboard_login_lockouts
   where account_key = p_account_key;

  if v_lock_until is not null and v_lock_until > now() then
    insert into public.dashboard_login_attempts (account_key, ip_hash, outcome)
    values (p_account_key, p_ip_hash, 'blocked');
    return jsonb_build_object('allowed', false);
  end if;

  -- IP sliding-window check — counts ONLY real 'failure' outcomes (task §17),
  -- never 'blocked' or 'success' rows.
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

  -- Opportunistic cleanup (~1% of calls), same pattern as
  -- check_and_log_otp_ip_request/check_and_log_loyalty_rate — no separate
  -- scheduled job. Runs on the read path here since this function is called
  -- on every attempt; kept outside any multi-statement transaction boundary
  -- risk since this whole function body IS the transaction (a single
  -- function call), so no additional lock contention beyond what this
  -- function already takes.
  if random() < 0.01 then
    delete from public.dashboard_login_attempts where created_at < now() - interval '1 day';
  end if;

  return jsonb_build_object('allowed', true);
end;
$function$;

revoke all on function public.check_dashboard_login_allowed(text, text) from public, anon, authenticated;
grant execute on function public.check_dashboard_login_allowed(text, text) to service_role;

-- ============================================================================
-- 4) record_dashboard_login_outcome — called ONCE per login attempt, AFTER
--    Supabase Auth has actually responded (and only when
--    check_dashboard_login_allowed returned allowed:true, i.e. Supabase Auth
--    was actually called). Atomic increment via INSERT ... ON CONFLICT DO
--    UPDATE — Postgres's standard atomic-upsert-increment idiom, immune to
--    the lost-update race a separate SELECT-then-UPDATE would have (task
--    §15/§33).
-- ============================================================================
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

  -- Atomic upsert-increment. If a PRIOR lockout already expired
  -- (lock_until <= now()), this failure starts a FRESH cycle (count = 1),
  -- per task §9/§19 — never a continuation of an already-exhausted count.
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

commit;
