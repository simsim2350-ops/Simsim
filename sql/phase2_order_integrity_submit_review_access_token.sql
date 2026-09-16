-- Phase 2 Order Integrity — confirmed security risk fix (re-verified from
-- Phase 1 SEC-6, now with the missing piece: the order_access_token IS
-- already available at both real call sites — OrderStatusView.tsx (prop)
-- and MyOrdersView.tsx (order.accessToken) — confirmed by direct read of
-- current menu-next source during Phase 2. The only caller that does NOT
-- have it, src/features/menu/hooks/useReviews.js, is confirmed DEAD CODE
-- (zero imports anywhere in src/, not routed in App.jsx) — not touched.
--
-- Backward-compatible rollout: p_access_token is a NEW optional parameter
-- (DEFAULT NULL). The frontend (menu-next/lib/reviews.ts and its two call
-- sites) is updated in this same phase to always send it, but until that
-- code is actually deployed to Vercel, production keeps working exactly as
-- before — old calls omitting p_access_token still succeed via the old
-- (no-check) path. Once the new frontend is live, every real call carries
-- the token and is strictly checked. This avoids breaking live customer
-- review submission during the gap between this migration and the actual
-- frontend deploy (which this audit does not perform — see the Phase 2
-- report's Remaining Risks / Next Steps).
--
-- The old 3-argument signature is explicitly dropped first so there is no
-- ambiguous overload and no way to keep calling the old (parameter-list)
-- identity once this is live.

drop function if exists public.submit_review(uuid, integer, text);

CREATE OR REPLACE FUNCTION public.submit_review(
  p_order_id uuid,
  p_rating integer,
  p_comment text DEFAULT NULL::text,
  p_access_token text DEFAULT NULL::text
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order record;
  v_id    uuid;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'invalid_rating';
  end if;

  select id, restaurant_id, branch_id, customer_phone, customer_name, status, order_access_token
    into v_order
  from orders where id = p_order_id;
  if not found then raise exception 'order_not_found'; end if;

  -- Transitional: only enforced when the caller supplies a token at all.
  -- Old (not-yet-redeployed) clients omit it and are unaffected; any
  -- caller that DOES supply one must match exactly.
  if p_access_token is not null and (v_order.order_access_token is null or v_order.order_access_token <> p_access_token) then
    raise exception 'order_access_denied';
  end if;

  if v_order.status <> 'completed' then raise exception 'order_not_completed'; end if;

  if exists (select 1 from reviews where order_id = p_order_id) then
    raise exception 'already_reviewed';
  end if;

  insert into reviews (restaurant_id, branch_id, order_id, customer_name, customer_phone, rating, comment)
  values (v_order.restaurant_id, v_order.branch_id, p_order_id,
          v_order.customer_name, v_order.customer_phone,
          p_rating, nullif(btrim(coalesce(p_comment, '')), ''))
  returning id into v_id;

  return v_id;
end;
$function$;
