-- Coupon regression tests for create_order.
-- Safe to run in a transaction: all test coupon/order rows are rolled back.
-- Requires an existing available product fixture supplied by the caller.
-- Do not run against Production with a real customer payload.

begin;

-- Replace these fixture values when running in an isolated Preview database.
-- The test body is intentionally explicit so price and usage assertions are visible.
do $$
declare
  v_coupon_id uuid;
  v_result record;
  v_usage integer;
  v_restaurant_id uuid := '06a6b955-4842-4fcb-a0f1-264484a1c323';
  v_branch_id uuid := '6a9018b7-e254-43ea-aafd-c203c47783b3';
  v_product_id uuid := '57f16865-e647-4816-804a-ccf27fee0961';
  v_code text := 'REGRESSION_' || replace(gen_random_uuid()::text, '-', '');
begin
  insert into public.coupons (
    restaurant_id, branch_id, code, discount_type, discount_value,
    min_order_amount, expires_at, is_active, usage_limit, usage_count
  ) values (
    v_restaurant_id, v_branch_id, v_code, 'fixed', 1,
    0, now() + interval '1 hour', true, 1, 0
  ) returning id into v_coupon_id;

  -- Test 1: price mismatch must not consume the coupon or create an order.
  select * into v_result
  from public.create_order(
    v_restaurant_id, v_branch_id, 'regression', null, 'Regression', '500000000',
    'dine_in', jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id, 'quantity', 1, 'options', jsonb_build_array()
    )), 'regression', v_code, 1, 'regression-coupon-key-0001'
  ) limit 1;

  select usage_count into v_usage from public.coupons where id = v_coupon_id;
  if v_result.price_changed is distinct from true or v_result.id is not null or v_usage <> 0 then
    raise exception 'coupon mismatch regression failed: price_changed=%, order_id=%, usage_count=%', v_result.price_changed, v_result.id, v_usage;
  end if;

  -- Test 2: correct server total for product 6 minus fixed discount 1 is 5.
  select * into v_result
  from public.create_order(
    v_restaurant_id, v_branch_id, 'regression', null, 'Regression', '500000000',
    'dine_in', jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id, 'quantity', 1, 'options', jsonb_build_array()
    )), 'regression', v_code, 5, 'regression-coupon-key-0001'
  ) limit 1;

  select usage_count into v_usage from public.coupons where id = v_coupon_id;
  if v_result.id is null or v_result.price_changed is distinct from false or v_result.total <> 5 or v_usage <> 1 then
    raise exception 'coupon success regression failed: order_id=%, price_changed=%, total=%, usage_count=%', v_result.id, v_result.price_changed, v_result.total, v_usage;
  end if;
end $$;

rollback;

-- Concurrent race test requirement:
-- Run two simultaneous valid create_order calls against an isolated Preview coupon
-- with usage_limit=1. Expected: one call succeeds and increments usage_count to 1;
-- the other is rejected by the row lock/usage-limit check. This is deliberately
-- not executed against Production by this regression script.
