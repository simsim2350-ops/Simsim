-- ============================================================================
-- Phase 1 / خطوة 6أ — دالة استبدال مكافأة من الكتالوج (redeem_reward)
-- ----------------------------------------------------------------------------
-- الاستبدال الفعلي الذي يخصم من الدفتر مقابل مكافأة من loyalty_rewards.
-- تُستدعى من لوحة تحكم المطعم (صاحب/موظف مخوّل) عند تسليم مكافأة لعميل.
--
-- الأمان (نمط ADR-27/29):
--   • DEFINER + بوابة صريحة has_restaurant_access (DEFINER يتجاوز RLS).
--   • الكتابة عبر نقطة الدفتر الوحيدة loyalty_post (مع حاجز الرصيد السالب).
--   • تُمنح لـ authenticated فقط (لا anon).
--
-- ⚠️ يُنفَّذ في Supabase بعد موافقة المالك. لا شيء يستدعيها بعد → صفر تغيير مرئي.
-- ============================================================================

create or replace function public.redeem_reward(
  p_restaurant_id uuid,
  p_reward_id     uuid,
  p_phone         text
)
returns public.loyalty_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reward  loyalty_rewards;
  v_phone   text;
  v_balance int;
  v_row     loyalty_transactions;
begin
  -- بوابة صريحة
  if not has_restaurant_access(p_restaurant_id) then
    raise exception 'access_denied' using errcode = 'insufficient_privilege';
  end if;

  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if v_phone = '' then
    raise exception 'invalid_phone';
  end if;

  -- المكافأة موجودة/تخص المطعم/مفعّلة
  select * into v_reward from loyalty_rewards
  where id = p_reward_id and restaurant_id = p_restaurant_id;
  if not found then raise exception 'reward_not_found'; end if;
  if not v_reward.is_active then raise exception 'reward_inactive'; end if;

  -- رصيد العميل يكفي
  select coalesce(current_balance, 0) into v_balance from loyalty_accounts
  where restaurant_id = p_restaurant_id and customer_phone = v_phone;
  v_balance := coalesce(v_balance, 0);
  if v_balance < v_reward.points_cost then
    raise exception 'insufficient_points' using errcode = 'check_violation';
  end if;

  -- الخصم عبر نقطة الكتابة الوحيدة في الدفتر
  v_row := loyalty_post(
    p_restaurant_id, v_phone, 'redeem', -v_reward.points_cost,
    'استبدال: ' || v_reward.name, 'reward',
    null, null, auth.uid(), v_reward.id
  );

  return v_row;
end;
$$;

revoke all on function public.redeem_reward(uuid, uuid, text) from public, anon;
grant execute on function public.redeem_reward(uuid, uuid, text) to authenticated;
