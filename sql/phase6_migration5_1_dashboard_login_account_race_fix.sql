-- SimSim — Phase 6, Migration 5.1: Dashboard login ACCOUNT-LEVEL lockout —
-- parallel-request race fix (Finding #1, SIMSIM_FINAL_AUTHORIZATION_
-- SECURITY_AUDIT_REPORT.md; design in SIMSIM_MIGRATION_5_1_PARALLEL_LOGIN_
-- RACE_DESIGN.md).
--
-- Scope: ACCOUNT-level lockout race ONLY. Does NOT touch the IP-level
-- throttle's own query/logic (left byte-for-byte identical to Migration
-- 5.0) — that race is explicitly deferred, see the implementation report's
-- "Deferred IP Race Finding" section. Does NOT touch Login.jsx,
-- StaffLogin.jsx, authStore.js, or dashboard-login-guard's handler.js/
-- index.ts — both RPCs below keep their exact Migration 5.0 names and
-- signatures, so the Edge Function needs zero code changes.
--
-- ============================================================================
-- ROOT CAUSE (full analysis in the design doc; summarized here for anyone
-- reading this migration file in isolation):
--
-- Migration 5.0's check_dashboard_login_allowed() only ever read
-- lock_until — it never read, nor reserved against, failure_count. Because
-- failure_count was only incremented AFTER a real Supabase Auth round-trip
-- (inside record_dashboard_login_outcome, called from the Edge Function's
-- STEP 7), a burst of truly concurrent requests against a not-yet-locked
-- account could ALL read lock_until=NULL and ALL be forwarded to real
-- Supabase Auth password verification, before any of them had recorded a
-- failure — inflating "5 attempts, then a 15-minute lock" to "5 sequential
-- + up to N concurrent per burst," bounded only by an attacker's own
-- concurrency.
--
-- ============================================================================
-- WHY A SCHEMA CHANGE IS REQUIRED (not just an RPC-body change):
--
-- An earlier draft of this fix (design doc's original prototype) tried to
-- use failure_count ITSELF as the "reservation" — incrementing it
-- optimistically at precheck time, before Auth even ran, then resetting it
-- to 0 unconditionally on any success. That has a real correctness bug:
-- under 4-wrong-password + 1-correct-password concurrent requests, if the
-- correct one's confirmation is processed while the other 4 are still
-- mid-flight (or have just pushed failure_count to 5, setting lock_until),
-- the success's unconditional reset could erase confirmed failures from
-- OTHER, unrelated concurrent requests, or even lift a lock that had just
-- been set by them.
--
-- The fix is to separate "how many requests are currently reserved and
-- awaiting a real outcome" (pending_count) from "how many requests have
-- been CONFIRMED to have failed" (failure_count). The admission gate is
-- `failure_count + pending_count < 5` — this bounds concurrent exposure
-- WITHOUT ever needing to guess at an in-flight request's eventual outcome.
-- This requires one new column: dashboard_login_lockouts.pending_count.
--
-- Concurrency proof (full version in the design doc, §9 of the
-- implementation report): because pending_count + failure_count can never
-- exceed 5 at any instant (every admission is gated on the CURRENT sum,
-- checked and incremented atomically under the same row lock), and a
-- successful request's own reservation slot can never itself become a
-- confirmed failure, it is mathematically impossible for failure_count to
-- reach 5 (a real lock) while a success from THAT SAME batch is still
-- pending — so a success can never race against, or retroactively lift, an
-- active lock. The `lock_until > now()` guard kept in the success branch
-- below is defense-in-depth for this invariant, not a load-bearing fix by
-- itself.
--
-- ============================================================================
-- WHAT IS UNCHANGED FROM MIGRATION 5.0 (verified against the live deployed
-- source before writing this migration):
--   - Both RPC names and signatures: check_dashboard_login_allowed(text,
--     text) returns jsonb; record_dashboard_login_outcome(text, text,
--     boolean) returns jsonb.
--   - SECURITY DEFINER, SET search_path TO 'public' on both.
--   - REVOKE ALL ... FROM public, anon, authenticated; GRANT EXECUTE ... TO
--     service_role — identical grant posture, re-stated explicitly below
--     for the same defense-in-depth reason Migration 5.0 stated it.
--   - Fail-closed on malformed input (unchanged first branch in both
--     functions).
--   - The IP sliding-window check (20 failures / 15 minutes): byte-for-byte
--     identical query, unchanged threshold, unchanged "only 'failure'
--     counts, never 'blocked'" invariant. This migration does not touch the
--     IP dimension at all — see the implementation report's Deferred IP
--     Race Finding.
--   - dashboard_login_attempts: no schema change, no new outcome value —
--     still exactly 'failure' | 'success' | 'blocked', logged at the same
--     semantic points (blocked at reservation-deny, success/failure at
--     confirm).
--   - The generic {"allowed": bool} / {"locked": bool} response shapes both
--     functions return — handler.js's own interpretation of them is
--     unchanged, and handler.js itself is not modified by this migration.
--   - 5 failures -> 15 minutes; 20 IP failures / 15 minutes: policy values
--     themselves are unchanged; only WHEN the account-side count is
--     incremented changes (before Auth instead of after).
--
-- ============================================================================
begin;

-- ----------------------------------------------------------------------------
-- 1) Schema change: one new column, additive and backward-compatible.
--    Tracks requests that have been admitted through the gate and forwarded
--    to Supabase Auth, but whose outcome (success/failure) is not yet known.
-- ----------------------------------------------------------------------------
alter table public.dashboard_login_lockouts
  add column if not exists pending_count integer not null default 0;

alter table public.dashboard_login_lockouts
  add constraint dashboard_login_lockouts_pending_count_nonneg check (pending_count >= 0);

-- No change to dashboard_login_attempts (table, indexes, or its outcome
-- CHECK constraint) — reused exactly as-is.

-- ----------------------------------------------------------------------------
-- 2) check_dashboard_login_allowed — becomes the RESERVE step. Still called
--    ONCE per attempt, still BEFORE Supabase Auth. Same name, same
--    signature, same {"allowed": bool} return shape.
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
  v_failure_count     integer;
  v_pending_count     integer;
  v_lock_until        timestamptz;
  v_ip_failure_count  integer;
begin
  if p_account_key is null or btrim(p_account_key) = '' or p_ip_hash is null or btrim(p_ip_hash) = '' then
    -- Malformed caller input at the DB layer — fail closed, deny. Unchanged.
    return jsonb_build_object('allowed', false);
  end if;

  -- Atomically lock-or-create the account row (INSERT ... ON CONFLICT ...
  -- RETURNING — Postgres's atomic upsert-with-lock primitive; safe against
  -- concurrent first-inserts of the same account_key, unlike a bare SELECT
  -- FOR UPDATE would be for a not-yet-existing row).
  --
  -- If an existing lock has already expired (lock_until <= now()), this
  -- same statement eagerly normalizes failure_count back to 0 and clears
  -- lock_until — starting a fresh cycle — so every check below, and
  -- record_dashboard_login_outcome's failure branch, can trust
  -- failure_count/lock_until to already reflect "no stale expired lock."
  -- This preserves Migration 5.0's own "expired lock -> fresh cycle at 1"
  -- behavior, just performed at reservation time instead of at record time.
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

  -- Still actively locked (after the expiry-normalization above).
  if v_lock_until is not null and v_lock_until > now() then
    insert into public.dashboard_login_attempts (account_key, ip_hash, outcome)
    values (p_account_key, p_ip_hash, 'blocked');
    return jsonb_build_object('allowed', false);
  end if;

  -- IP sliding-window check — UNCHANGED from Migration 5.0, byte-for-byte.
  -- The IP-level race is explicitly deferred (implementation report §14),
  -- not addressed by this migration.
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

  -- ACCOUNT-LEVEL RESERVATION GATE — the actual Migration 5.1 fix.
  -- confirmed failures + currently-pending (in-flight) requests must stay
  -- below 5. Checked and incremented atomically, under the row lock already
  -- held by the upsert above (same function call = same transaction = same
  -- lock held throughout), so no concurrent caller for this account_key can
  -- observe a stale sum between this check and the increment below.
  if v_failure_count + v_pending_count >= 5 then
    insert into public.dashboard_login_attempts (account_key, ip_hash, outcome)
    values (p_account_key, p_ip_hash, 'blocked');
    return jsonb_build_object('allowed', false);
  end if;

  -- Reserve this attempt's slot.
  update public.dashboard_login_lockouts
     set pending_count = pending_count + 1,
         updated_at = now()
   where account_key = p_account_key;

  -- Opportunistic cleanup (~1% of calls) — unchanged from Migration 5.0.
  if random() < 0.01 then
    delete from public.dashboard_login_attempts where created_at < now() - interval '1 day';
  end if;

  return jsonb_build_object('allowed', true);
end;
$function$;

revoke all on function public.check_dashboard_login_allowed(text, text) from public, anon, authenticated;
grant execute on function public.check_dashboard_login_allowed(text, text) to service_role;

-- ----------------------------------------------------------------------------
-- 3) record_dashboard_login_outcome — becomes the CONFIRM step. Still
--    called ONCE per attempt, still AFTER Supabase Auth responds, still
--    only when check_dashboard_login_allowed returned allowed:true. Same
--    name, same signature, same {"locked": bool} return shape.
-- ----------------------------------------------------------------------------
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
    -- Release this request's reservation slot. Reset the confirmed-failure
    -- streak on a genuine success — safe to do unconditionally in the
    -- normal case (see the concurrency proof in this file's header
    -- comment): a lock can only ever be set once failure_count reaches 5
    -- CONFIRMED failures, and a request that is itself a success can never
    -- have contributed to that count, so a success can never arrive after
    -- an active lock was set by requests from its own admitted batch.
    -- The `lock_until > now()` guard is kept anyway as defense-in-depth —
    -- expected to be unreachable in normal operation, but ensures a
    -- success can NEVER lift an active lock even if a future change to
    -- this function violated the invariant above.
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

  -- Failure: release the reservation slot AND atomically promote it to a
  -- confirmed failure, in one statement. failure_count is already
  -- correctly baselined (fresh-cycle-normalized if an old lock had
  -- expired) by check_dashboard_login_allowed's reservation step, so this
  -- is always a plain +1 here — no CASE-based "is the old lock expired"
  -- logic needed at this point anymore (moved earlier, to reservation).
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

commit;
