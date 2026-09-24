-- SimSim — Phase 6, Migration 7: Dashboard login IP-LEVEL rate-limit —
-- parallel-request race fix (deferred finding from the Final Authorization
-- Security Audit / SIMSIM_PRODUCTION_SECURITY_SIGN_OFF.md §5/§12).
--
-- Scope: IP-level throttle race ONLY. Does NOT touch the ACCOUNT-level
-- lockout mechanism (dashboard_login_lockouts, its pending_count/
-- failure_count columns, or Migration 5.1's reservation logic on that
-- table) — that race is already CLOSED. Does NOT touch Login.jsx,
-- StaffLogin.jsx, authStore.js, or dashboard-login-guard's handler.js/
-- index.ts — both RPCs below keep their exact Migration 5.0/5.1 names and
-- signatures, so the Edge Function needs zero code changes.
--
-- ============================================================================
-- ROOT CAUSE (empirically reproduced before writing this migration — see
-- SIMSIM_IP_RATE_LIMIT_RACE_REMEDIATION_REPORT.md §4/§5):
--
-- check_dashboard_login_allowed's IP check has always been a bare
-- `SELECT count(*) FROM dashboard_login_attempts WHERE ip_hash = ... AND
-- outcome = 'failure' AND created_at > now() - interval '15 minutes'` —
-- a read with no corresponding row to lock, no reservation, and no
-- atomicity. A burst of truly concurrent requests sharing one ip_hash can
-- all read the same stale (pre-increment) count before any of them commits
-- its own 'failure' row via record_dashboard_login_outcome (called only
-- AFTER a full Supabase Auth round-trip) — letting the admitted-and-
-- forwarded-to-Auth count overshoot the nominal 20/15-minute threshold.
--
-- Empirical proof (Staging, rgqsetckcigkgsyobyjg, clean 15-minute window):
-- 50 genuinely concurrent requests from 50 distinct .invalid test accounts,
-- all sharing one real source IP, produced 26 'failure' (admitted) rows
-- against a threshold of 20 — a clear, reproducible overshoot, not a
-- theoretical concern.
--
-- ============================================================================
-- WHY A SCHEMA CHANGE IS REQUIRED (same reasoning class as Migration 5.1,
-- applied to the IP dimension instead of the account dimension):
--
-- dashboard_login_attempts is an append-only log with no unique/lockable
-- row per ip_hash — many rows can share one ip_hash, so there is nothing
-- to take a row lock on for that dimension today. The account-level fix
-- (Migration 5.1) worked because dashboard_login_lockouts already had one
-- row per account_key to lock. The equivalent fix for IP requires the same
-- kind of dedicated, lockable aggregate row — one per ip_hash — carrying
-- its own pending_count reservation counter.
--
-- Unlike the account dimension (a hard lock_until once failure_count hits
-- 5), the IP dimension is a SLIDING window (any 15-minute lookback,
-- recomputed fresh every call) — this migration does NOT convert it to a
-- fixed-bucket counter (that would be a real behavior change to the
-- window semantics, out of scope and not requested). Instead, the existing
-- rolling-window COUNT(*) query is kept byte-for-byte, and a NEW per-IP
-- pending_count reservation is layered on top of it: the admission gate
-- becomes `(rolling window failure count) + pending_count < 20`, checked
-- and incremented atomically under a row lock on the new per-IP row. This
-- closes the exact same class of TOCTOU gap Migration 5.1 closed for
-- accounts, without changing the window's sliding semantics at all.
--
-- Concurrency proof: because the new dashboard_login_ip_throttle row for a
-- given ip_hash is locked (via INSERT ... ON CONFLICT ... RETURNING) for
-- the full duration of check_dashboard_login_allowed's function call, two
-- concurrent calls sharing the same ip_hash are fully serialized against
-- each other for their IP-admission decision — the second call's read of
-- "rolling failure count + pending_count" can only happen after the first
-- call's own pending_count increment (or block) has already committed.
-- This holds regardless of which account_key each concurrent call carries
-- (multiple different accounts hammering the same IP are serialized on the
-- IP row exactly the same way one account hammering itself is serialized
-- on the account row) — closing the "multiple accounts, same IP" variant
-- of this race, not just the single-account-same-IP variant.
--
-- ============================================================================
-- WHAT IS UNCHANGED (verified against the live deployed source before
-- writing this migration):
--   - Both RPC names and signatures: check_dashboard_login_allowed(text,
--     text) returns jsonb; record_dashboard_login_outcome(text, text,
--     boolean) returns jsonb.
--   - SECURITY DEFINER, SET search_path TO 'public' on both.
--   - REVOKE ALL ... FROM public, anon, authenticated; GRANT EXECUTE ... TO
--     service_role — identical grant posture on both existing functions.
--   - The account-level reservation mechanism (dashboard_login_lockouts,
--     pending_count/failure_count, the 5-failures/15-minute lock) — every
--     line of Migration 5.1's account logic is preserved byte-for-byte.
--   - The IP rolling-window query itself (WHERE ip_hash = ... AND outcome
--     = 'failure' AND created_at > now() - interval '15 minutes') and the
--     20-failure threshold — unchanged values, unchanged semantics.
--   - dashboard_login_attempts: no schema change, no new outcome value.
--   - The generic {"allowed": bool} / {"locked": bool} response shapes —
--     handler.js is not modified by this migration.
-- ============================================================================
begin;

-- ----------------------------------------------------------------------------
-- 1) New table: one row per ip_hash that has ever attempted a login.
--    Tracks requests admitted through the IP gate and forwarded to Supabase
--    Auth, but whose outcome is not yet recorded — the IP-dimension analog
--    of dashboard_login_lockouts.pending_count (Migration 5.1).
-- ----------------------------------------------------------------------------
create table if not exists public.dashboard_login_ip_throttle (
  ip_hash        text primary key,
  pending_count  integer not null default 0,
  updated_at     timestamptz not null default now(),
  constraint dashboard_login_ip_throttle_pending_count_nonneg check (pending_count >= 0)
);

alter table public.dashboard_login_ip_throttle enable row level security;
-- RLS enabled, zero policies — identical posture to dashboard_login_lockouts
-- and dashboard_login_attempts: no anon/authenticated access of any kind,
-- direct or indirect. Only the two SECURITY DEFINER functions below (both
-- service_role-only) ever touch this table.

revoke all on public.dashboard_login_ip_throttle from public, anon, authenticated;

-- No change to dashboard_login_lockouts or dashboard_login_attempts (tables,
-- columns, indexes, or constraints) — both reused exactly as-is.

-- ----------------------------------------------------------------------------
-- 2) check_dashboard_login_allowed — account-lock check and account
--    reservation gate UNCHANGED from Migration 5.1. The IP check is
--    upgraded from a bare read to a lock-then-read-then-reserve sequence.
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
  v_ip_pending_count  integer;
  v_ip_failure_count  integer;
begin
  if p_account_key is null or btrim(p_account_key) = '' or p_ip_hash is null or btrim(p_ip_hash) = '' then
    -- Malformed caller input at the DB layer — fail closed, deny. Unchanged.
    return jsonb_build_object('allowed', false);
  end if;

  -- ACCOUNT reservation gate — byte-for-byte unchanged from Migration 5.1.
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

  -- ============================================================================
  -- IP RESERVATION GATE — THE ACTUAL MIGRATION 7 FIX.
  --
  -- Atomically lock-or-create the per-IP throttle row FIRST (same atomic
  -- upsert-with-lock primitive used for the account row above). Holding
  -- this row lock for the remainder of this function call serializes every
  -- concurrent request sharing this ip_hash — regardless of which
  -- account_key each one carries — against this exact read-then-reserve
  -- sequence, closing the race proven in the reproduction test.
  -- ============================================================================
  insert into public.dashboard_login_ip_throttle (ip_hash, pending_count, updated_at)
  values (p_ip_hash, 0, now())
  on conflict (ip_hash) do update
    set updated_at = now()
  returning pending_count into v_ip_pending_count;

  -- Rolling-window failure count — UNCHANGED query, unchanged 15-minute
  -- window, unchanged "only 'failure' counts, never 'blocked'" invariant.
  -- Now safe to read without a race: no other concurrent caller for this
  -- ip_hash can be mid-flight past this point until this call finishes.
  select count(*) into v_ip_failure_count
    from public.dashboard_login_attempts
   where ip_hash = p_ip_hash
     and outcome = 'failure'
     and created_at > now() - interval '15 minutes';

  if v_ip_failure_count + v_ip_pending_count >= 20 then
    insert into public.dashboard_login_attempts (account_key, ip_hash, outcome)
    values (p_account_key, p_ip_hash, 'blocked');
    return jsonb_build_object('allowed', false);
  end if;

  -- ACCOUNT-LEVEL RESERVATION GATE — byte-for-byte unchanged from
  -- Migration 5.1.
  if v_failure_count + v_pending_count >= 5 then
    insert into public.dashboard_login_attempts (account_key, ip_hash, outcome)
    values (p_account_key, p_ip_hash, 'blocked');
    return jsonb_build_object('allowed', false);
  end if;

  -- Both gates passed — reserve both slots.
  update public.dashboard_login_lockouts
     set pending_count = pending_count + 1,
         updated_at = now()
   where account_key = p_account_key;

  update public.dashboard_login_ip_throttle
     set pending_count = pending_count + 1,
         updated_at = now()
   where ip_hash = p_ip_hash;

  -- Opportunistic cleanup (~1% of calls) — unchanged from Migration 5.0/5.1
  -- for dashboard_login_attempts; extended to also age out long-idle
  -- per-IP throttle rows (pending_count already 0, i.e. no in-flight
  -- reservation, and untouched for a full day) so this new table does not
  -- grow unboundedly with one row per distinct historical IP forever.
  if random() < 0.01 then
    delete from public.dashboard_login_attempts where created_at < now() - interval '1 day';
    delete from public.dashboard_login_ip_throttle
     where pending_count = 0 and updated_at < now() - interval '1 day';
  end if;

  return jsonb_build_object('allowed', true);
end;
$function$;

revoke all on function public.check_dashboard_login_allowed(text, text) from public, anon, authenticated;
grant execute on function public.check_dashboard_login_allowed(text, text) to service_role;

-- ----------------------------------------------------------------------------
-- 3) record_dashboard_login_outcome — account-side logic UNCHANGED from
--    Migration 5.1. Adds releasing this request's IP-side reservation slot
--    in BOTH the success and failure branches (mirrors the account side's
--    own release-on-confirm pattern exactly).
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
    update public.dashboard_login_lockouts
       set pending_count = greatest(pending_count - 1, 0),
           failure_count = case when lock_until is not null and lock_until > now() then failure_count else 0 end,
           lock_until    = case when lock_until is not null and lock_until > now() then lock_until else null end,
           updated_at = now()
     where account_key = p_account_key;

    -- Release this request's IP-side reservation slot. No change to any
    -- rolling-window failure count — a success is never counted toward it
    -- (unchanged invariant), so there is nothing to "reset" on the IP side,
    -- only the pending reservation to release.
    update public.dashboard_login_ip_throttle
       set pending_count = greatest(pending_count - 1, 0),
           updated_at = now()
     where ip_hash = p_ip_hash;

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

  -- Release this request's IP-side reservation slot. The confirmed
  -- 'failure' row inserted below is what the NEXT call's rolling-window
  -- COUNT(*) will pick up — this table only ever tracks in-flight
  -- (not-yet-confirmed) requests, exactly like the account side.
  update public.dashboard_login_ip_throttle
     set pending_count = greatest(pending_count - 1, 0),
         updated_at = now()
   where ip_hash = p_ip_hash;

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
