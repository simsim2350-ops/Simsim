-- ============================================================================
-- SimSim Customer Identity — Phase 2.1: IP-based abuse protection for
-- send-phone-otp (Authentica SMS balance protection)
-- ============================================================================
-- WHY A NEW TABLE IS ACTUALLY NEEDED (per Phase 2.1 instructions §11 — "stop
-- and explain" before any new persistent infrastructure):
--
-- Phase 1's limits (5 sends/hour, 60s cooldown, 5 attempts, 5min expiry) are
-- keyed by (restaurant-agnostic) PHONE — customer_phone_verifications has one
-- row per customer_identity, unique on customer_id. They cannot detect or
-- bound the specific abuse pattern this phase is asked to defend against:
-- one source hitting send-phone-otp with MANY DIFFERENT phone numbers
-- (IP A → phone A, B, C, D, ...). Each such phone is a brand-new
-- customer_identities row with its own fresh cooldown/hourly counter — Phase
-- 1's protection is correctly scoped per-identity and provides zero defense
-- against this specific cross-identity, single-source volume attack.
--
-- Inspected first (per instructions) for a reusable existing mechanism:
--   - No IP/rate-limiting table or RPC exists anywhere in this codebase
--     (confirmed by repository-wide search before writing this file).
--   - Supabase Auth's own dashboard rate limits (reports/TASK_1_4_RATE_
--     LIMITING_VERIFICATION_REPORT.md) are unrelated — they gate GoTrue
--     endpoints (sign-up/sign-in/token refresh), not custom Edge
--     Functions/RPCs, and that report explicitly records "IP Address
--     Forwarding: DISABLED — do NOT enable" as a distinct, deliberate owner
--     decision for Auth; unrelated to this table.
--   - analytics_events exists but is a general-purpose analytics log (no
--     uniqueness/TTL semantics, RLS shaped for analytics reads) — repurposing
--     it for a security-enforcement decision path was rejected as scope
--     contamination of an unrelated system, not "the smallest mechanism."
--
-- Conclusion: a small, purpose-built, single-table mechanism is the smallest
-- correct fix for a gap no existing mechanism covers. Genuinely minimal:
-- one append-only log table, one counting+inserting RPC, no framework.
-- ============================================================================

create table if not exists public.otp_ip_request_log (
  id           bigint generated always as identity primary key,
  -- SHA-256 of the source IP, computed in the Edge Function before this table
  -- is ever touched — the raw IP address itself is never persisted (privacy
  -- default, same spirit as this system's OTP-code hashing). Hashing is
  -- deterministic (no per-row salt) specifically because counting requires
  -- matching the SAME IP to the SAME hash across requests — unlike OTP codes,
  -- which must never be matched across rows.
  ip_hash      text not null,
  requested_at timestamptz not null default now()
);

create index if not exists idx_otp_ip_request_log_ip_time
  on public.otp_ip_request_log (ip_hash, requested_at);

-- RLS enabled, zero policies — identical posture to every other Phase 1/2
-- table (customer_identities, customer_phone_verifications): no anon/
-- authenticated access of any kind, direct or indirect. The only door in is
-- the SECURITY DEFINER function below, itself restricted to service_role.
alter table public.otp_ip_request_log enable row level security;

-- ============================================================================
-- check_and_log_otp_ip_request — atomic "count recent requests for this IP,
-- reject if at/over the limit, else log this one and allow." One function,
-- one table, no separate "reset" job needed (sliding window via requested_at
-- comparison). service_role only — called from send-phone-otp before it ever
-- touches request_phone_otp_for_delivery, so abusive traffic never reaches
-- (or costs) the phone-level OTP system at all.
--
-- Defaults (20 requests / 15 minutes per source IP) are a deliberate
-- trade-off, not a proven-optimal constant: a shared/NAT IP (e.g. a busy
-- restaurant's own guest WiFi with several real customers verifying at once)
-- can legitimately need more than one or two attempts per window; a value
-- this generous still hard-bounds worst-case SMS cost per source to a small,
-- fixed number regardless of how many distinct phone numbers are tried.
-- Documented as tunable — not asserted as definitively correct.
-- ============================================================================
create or replace function public.check_and_log_otp_ip_request(
  p_ip_hash text,
  p_max_requests integer default 20,
  p_window_minutes integer default 15
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip_hash text := coalesce(nullif(trim(p_ip_hash), ''), 'unknown');
  v_count integer;
begin
  select count(*) into v_count
    from public.otp_ip_request_log
   where ip_hash = v_ip_hash
     and requested_at > now() - make_interval(mins => p_window_minutes);

  if v_count >= p_max_requests then
    return false;
  end if;

  insert into public.otp_ip_request_log (ip_hash) values (v_ip_hash);

  -- Opportunistic, cheap cleanup (~1% of calls) instead of a separate pg_cron
  -- job — keeps the table bounded without adding scheduled infrastructure for
  -- what is intentionally a small, append-mostly log.
  if random() < 0.01 then
    delete from public.otp_ip_request_log where requested_at < now() - interval '1 day';
  end if;

  return true;
end;
$$;

grant execute on function public.check_and_log_otp_ip_request(text, integer, integer) to service_role;
revoke execute on function public.check_and_log_otp_ip_request(text, integer, integer) from public, anon, authenticated;
