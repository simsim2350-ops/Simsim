-- ============================================================================
-- SimSim Customer Session — Phase 3A: Database Foundation ONLY
-- ============================================================================
-- Implements exactly what SIMSIM_PHASE3_CUSTOMER_SESSION_DESIGN_REPORT.md §5/§11
-- approved: customer_sessions table + 4 service_role-only RPCs. No caller exists
-- yet (no Route Handler, no cookie, no Edge Function change) — this file alone
-- changes zero observable application behavior.
--
-- Explicitly NOT touched by this file: customer_identities, customer_phone_
-- verifications, restaurant_customers, request_phone_otp[_for_delivery],
-- verify_phone_otp, otp_ip_request_log, check_and_log_otp_ip_request,
-- create_order, orders, Feature Registry, loyalty — none referenced, none
-- altered.
-- ============================================================================

-- ============================================================================
-- 1) customer_sessions — one row per active/past session. Many rows per
--    customer_id are expected and required (multi-device, design report §8).
--    No restaurant_id column — the session is deliberately global (§9).
-- ============================================================================
create table if not exists public.customer_sessions (
  id                 uuid primary key default gen_random_uuid(),
  customer_id        uuid not null references public.customer_identities(id) on delete cascade,
  -- SHA-256 of a 256-bit cryptographically random token (extensions.gen_random_
  -- bytes(32) — same generator already used for create_order's access_token and
  -- Phase 1's OTP codes). Unsalted deliberately: unlike the 6-digit OTP codes
  -- (low entropy, salted to defeat precompute), a 256-bit random token has no
  -- practical rainbow-table risk — this matches marketing_preview_tokens.
  -- token_hash's own established precedent (also unsalted, also high-entropy).
  -- The plaintext token is NEVER stored — only this hash.
  session_token_hash text not null unique,
  created_at         timestamptz not null default now(),
  -- Absolute lifetime (design report §7: 30 days). No idle-timeout column in v1
  -- (deliberately deferred — see design report §7's reasoning).
  expires_at         timestamptz not null,
  -- Best-effort "last used" marker — updated opportunistically inside
  -- validate_customer_session (only when stale by >1h), never on every call.
  last_seen_at       timestamptz,
  -- NULL = active. Non-null = explicitly revoked (logout / revoke-all) —
  -- checked independently of expires_at so revocation is instant, not
  -- dependent on natural expiry.
  revoked_at         timestamptz
);

create index if not exists idx_customer_sessions_customer on public.customer_sessions (customer_id);

-- RLS enabled, zero policies — identical posture to every Phase 1/2/2.1 table
-- (customer_identities, customer_phone_verifications, otp_ip_request_log): no
-- anon or authenticated access of any kind, direct or indirect. The only door
-- in is the four SECURITY DEFINER functions below, themselves service_role-only.
alter table public.customer_sessions enable row level security;

-- ============================================================================
-- 2) create_customer_session — mints a new session for an already-resolved
--    customer_id (the caller is trusted to have already confirmed OTP success
--    via the existing, unmodified verify_phone_otp — this function does not
--    re-verify anything, it only issues a session for a customer_id it is
--    handed). Plaintext token returned ONCE, here only — never persisted,
--    never re-derivable from the stored hash.
-- ============================================================================
create or replace function public.create_customer_session(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_hash text;
  v_session_id uuid;
begin
  if p_customer_id is null then
    raise exception 'customer_id required';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  insert into public.customer_sessions (customer_id, session_token_hash, expires_at)
  values (p_customer_id, v_hash, now() + interval '30 days')
  returning id into v_session_id;

  return jsonb_build_object('session_id', v_session_id, 'token', v_token);
end;
$$;

grant execute on function public.create_customer_session(uuid) to service_role;
revoke execute on function public.create_customer_session(uuid) from public, anon, authenticated;

-- ============================================================================
-- 3) validate_customer_session — the sole read path. Fail-closed and
--    enumeration-safe by construction: a nonexistent, malformed, expired, or
--    revoked token all produce the exact same {"valid": false, "customer_id":
--    null} shape — no branch reveals *why* a token was rejected. No input-
--    format pre-validation is performed on purpose: a malformed token simply
--    fails to match any stored hash, which already yields the uniform
--    rejection shape without a separate code path to keep in sync.
-- ============================================================================
create or replace function public.validate_customer_session(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_row record;
  v_now timestamptz := now();
begin
  if p_token is null or length(p_token) = 0 then
    return jsonb_build_object('valid', false, 'customer_id', null);
  end if;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  select * into v_row from public.customer_sessions
   where session_token_hash = v_hash
   limit 1;

  if not found or v_row.revoked_at is not null or v_row.expires_at <= v_now then
    return jsonb_build_object('valid', false, 'customer_id', null);
  end if;

  -- Opportunistic last_seen_at update (design report §7: not on every call).
  if v_row.last_seen_at is null or v_now - v_row.last_seen_at > interval '1 hour' then
    update public.customer_sessions set last_seen_at = v_now where id = v_row.id;
  end if;

  return jsonb_build_object('valid', true, 'customer_id', v_row.customer_id);
end;
$$;

grant execute on function public.validate_customer_session(text) to service_role;
revoke execute on function public.validate_customer_session(text) from public, anon, authenticated;

-- ============================================================================
-- 4) revoke_customer_session — logout for exactly one session (the one whose
--    token the caller holds). Accepts the token directly (not session_id) so
--    a future logout call needs exactly one round trip, not a validate-then-
--    revoke pair. Idempotent: revoking an already-revoked or nonexistent
--    token is a safe no-op, not an error.
-- ============================================================================
create or replace function public.revoke_customer_session(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_updated integer;
begin
  if p_token is null or length(p_token) = 0 then
    return jsonb_build_object('revoked', false);
  end if;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  update public.customer_sessions
     set revoked_at = now()
   where session_token_hash = v_hash
     and revoked_at is null
  returning 1 into v_updated;

  return jsonb_build_object('revoked', coalesce(v_updated, 0) > 0);
end;
$$;

grant execute on function public.revoke_customer_session(text) to service_role;
revoke execute on function public.revoke_customer_session(text) from public, anon, authenticated;

-- ============================================================================
-- 5) revoke_all_customer_sessions — "log out everywhere" for a customer_id.
--    Only ever revokes rows already belonging to the given customer_id — no
--    cross-customer reach is possible by construction (a plain WHERE
--    customer_id = p_customer_id, no dynamic SQL, no broader match).
-- ============================================================================
create or replace function public.revoke_all_customer_sessions(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_customer_id is null then
    raise exception 'customer_id required';
  end if;

  update public.customer_sessions
     set revoked_at = now()
   where customer_id = p_customer_id
     and revoked_at is null;
  get diagnostics v_count = row_count;

  return jsonb_build_object('revoked_count', v_count);
end;
$$;

grant execute on function public.revoke_all_customer_sessions(uuid) to service_role;
revoke execute on function public.revoke_all_customer_sessions(uuid) from public, anon, authenticated;

-- ============================================================================
-- End of Phase 3A. No Route Handler, no cookie, no Edge Function, no change to
-- verify_phone_otp/create_order/checkout/restaurant_customers/customer_
-- identities/Feature Registry/loyalty/menu. Nothing calls any function in this
-- file yet — zero observable behavior change for any existing user or flow.
-- ============================================================================
