-- Phase 3C.7 — Customer Phone <-> Session Binding Fix
--
-- BUG (proven in production, see CUSTOMER_IDENTITY_PHONE_VERIFICATION_BYPASS_DIAGNOSTIC_REPORT.md):
-- /api/customer/checkout validated session.valid and derived customer_id
-- correctly, but never checked that the phone number submitted in a given
-- checkout request actually belongs to that session's own verified
-- customer_identities row. Once any phone was verified once on a browser,
-- that session could be reused to place orders under ANY other phone number
-- for the rest of the session's 30-day lifetime, with zero new OTP.
--
-- FIX: validate_customer_session now also returns the session's own
-- customer's verified phone, so the server-side checkout boundary
-- (menu-next/app/api/customer/checkout/handler.js) can compare it against
-- the phone submitted in the request and reject a mismatch BEFORE ever
-- calling create_order.
--
-- Same signature as before (p_token text) -> only the function body/return
-- shape changes (an added jsonb key). Per the Phase 3C.1 lesson learned,
-- CREATE OR REPLACE FUNCTION only creates a duplicate overload when the
-- PARAMETER LIST changes -- it does not change here, so this replaces the
-- existing function in place, preserving its OID and its existing grants
-- (service_role only; already revoked from public/anon/authenticated since
-- Phase 3A). Verified after applying, not assumed.

create or replace function public.validate_customer_session(p_token text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_hash text;
  v_row record;
  v_now timestamptz := now();
  v_phone text;
begin
  if p_token is null or length(p_token) = 0 then
    return jsonb_build_object('valid', false, 'customer_id', null, 'phone', null);
  end if;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  select * into v_row from public.customer_sessions
   where session_token_hash = v_hash
   limit 1;

  if not found or v_row.revoked_at is not null or v_row.expires_at <= v_now then
    return jsonb_build_object('valid', false, 'customer_id', null, 'phone', null);
  end if;

  if v_row.last_seen_at is null or v_now - v_row.last_seen_at > interval '1 hour' then
    update public.customer_sessions set last_seen_at = v_now where id = v_row.id;
  end if;

  select ci.phone into v_phone from public.customer_identities ci where ci.id = v_row.customer_id;

  return jsonb_build_object('valid', true, 'customer_id', v_row.customer_id, 'phone', v_phone);
end;
$function$;
