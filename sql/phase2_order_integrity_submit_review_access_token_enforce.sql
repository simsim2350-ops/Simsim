-- Phase 2 Order Integrity — closes the transitional authorization gap left
-- open by phase2_order_integrity_submit_review_access_token.sql.
--
-- That earlier migration made p_access_token OPTIONAL by design, as a
-- deliberate rollout bridge: `if p_access_token is not null and (...)`.
-- Any caller that simply omitted the token (or passed NULL) skipped the
-- ownership check entirely and only had to satisfy order_not_completed /
-- already_reviewed — meaning any party who knew a completed order's UUID
-- could insert a review for it, with no proof of ownership at all. Found
-- and documented during an independent pre-merge audit of PR #415
-- (SIMSIM_PR415_MENU_NEXT_AND_MIGRATION_VERIFICATION_REPORT.md, Finding 1)
-- — NOT a defect in that PR's own frontend changes (menu-next/lib/reviews.ts
-- and its two call sites already always send the token correctly), but in
-- this RPC's own transitional check.
--
-- The rollout condition that justified the transitional gap no longer
-- applies: both real, live call sites (menu-next's OrderStatusView.tsx and
-- MyOrdersView.tsx) already send order_access_token on every call (verified
-- by direct source read, same audit above). The only other caller of
-- submitReview() in the whole repo, src/features/menu/hooks/useReviews.js,
-- is confirmed dead code — zero imports anywhere in src/, not reachable from
-- App.jsx's routing (re-verified directly in this task via grep across
-- src/). No live caller needs a null-token fallback, so none is kept.
--
-- Fix: the token is now REQUIRED. A NULL or empty/whitespace-only token is
-- rejected with the exact same order_access_denied message already used for
-- a wrong token — this keeps the error surface identical to what a caller
-- already had to handle, and avoids telling an unauthorized caller whether
-- their failure was "no token" vs "wrong token" (both look the same).
--
-- Everything else is BYTE-FOR-BYTE UNCHANGED from the previous version:
-- same signature (no DROP FUNCTION needed — CREATE OR REPLACE is sufficient
-- since the parameter list/types are identical), same order of checks
-- (order lookup -> access check -> status check -> duplicate check ->
-- insert), same order_not_found / order_not_completed / already_reviewed
-- messages, same SECURITY DEFINER + SET search_path, same grants (unchanged
-- here — anon/authenticated execute grants from sql/submit_review.sql still
-- apply; this is required, not a new exposure, since menu-next customers
-- are anonymous by design and are authorized via the access token, not via
-- Supabase Auth).

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

  -- Access token is now mandatory — a missing/empty token is treated exactly
  -- like a wrong one (same message, no extra information about which case
  -- occurred). This replaces the old `if p_access_token is not null and
  -- (...)` transitional check, which skipped this block entirely when the
  -- token was omitted.
  if p_access_token is null or btrim(p_access_token) = '' then
    raise exception 'order_access_denied';
  end if;

  if v_order.order_access_token is null or v_order.order_access_token <> p_access_token then
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
