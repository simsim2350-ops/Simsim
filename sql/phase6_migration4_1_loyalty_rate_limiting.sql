-- SimSim — Phase 6, Migration 4.1: independent rate limiting for the
-- customer loyalty lookup path (/api/customer/loyalty). Deliberately NOT
-- sharing otp_ip_request_log/check_and_log_otp_ip_request — that table and
-- function are OTP-specific semantics (SMS-cost protection); reusing them
-- here would let a customer's OTP attempts and loyalty lookups throttle
-- each other, which is not the intended behavior. Same IP-hash + sliding
-- window pattern, independent counter, independent (looser) policy
-- appropriate for a cheap, frequent, read-only UI widget rather than a
-- scarce SMS-triggering action.
--
-- Policy (freshly chosen for this path — not derived from any existing
-- documented business rule, since none existed for loyalty lookups before
-- this migration): 30 requests / 5-minute sliding window per IP hash.
-- Reasoning: My Orders can legitimately re-fetch loyalty on every mount
-- (order-status polling, navigation back/forth), so the window is short and
-- the allowance generous compared to OTP's 20/15min (a deliberately scarce,
-- costly action) — while still bounding scripted enumeration/scraping.
--
-- Applied to production via mcp__claude_ai_Supabase__apply_migration on
-- 2026-09-18 (same session as this file's creation). This file is the local
-- record of that migration, matching this project's existing convention.

begin;

create table if not exists public.loyalty_lookup_rate_log (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  requested_at timestamptz not null default now()
);

create index if not exists idx_loyalty_lookup_rate_log_ip_time
  on public.loyalty_lookup_rate_log (ip_hash, requested_at);

alter table public.loyalty_lookup_rate_log enable row level security;
-- No policies defined: default-deny for anon/authenticated; postgres and
-- service_role bypass RLS entirely (BYPASSRLS), matching this project's
-- existing customer_identities/customer_phone_verifications pattern.

create or replace function public.check_and_log_loyalty_rate(
  p_ip_hash text,
  p_max_requests integer default 30,
  p_window_minutes integer default 5
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ip_hash text := coalesce(nullif(trim(p_ip_hash), ''), 'unknown');
  v_count integer;
begin
  select count(*) into v_count
    from public.loyalty_lookup_rate_log
   where ip_hash = v_ip_hash
     and requested_at > now() - make_interval(mins => p_window_minutes);

  if v_count >= p_max_requests then
    return false;
  end if;

  insert into public.loyalty_lookup_rate_log (ip_hash) values (v_ip_hash);

  if random() < 0.01 then
    delete from public.loyalty_lookup_rate_log where requested_at < now() - interval '1 day';
  end if;

  return true;
end;
$function$;

revoke all on function public.check_and_log_loyalty_rate(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_and_log_loyalty_rate(text, integer, integer) to service_role;

commit;
