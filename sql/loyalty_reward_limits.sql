-- ============================================================================
-- Phase 2 / (هـ-2) حدود استخدام المكافآت — redeem_reward
-- ----------------------------------------------------------------------------
-- يضيف فحص «حد لكل عميل + فترة» قبل الخصم، من conditions على المكافأة:
--   { "per_customer_limit": int, "period": "none"|"day"|"week"|"month" }
-- الفترات نوافذ متدحرجة (يومي=آخر يوم، أسبوعي=7 أيام، شهري=30 يوماً).
-- الافتراضي (بلا per_customer_limit) = بلا حد.
-- ⚠️ يُنفَّذ في Supabase بعد موافقة المالك.
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
  v_limit   int;
  v_period  text;
  v_since   timestamptz;
  v_used    int;
begin
  if not has_restaurant_access(p_restaurant_id) then
    raise exception 'access_denied' using errcode = 'insufficient_privilege';
  end if;

  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if v_phone = '' then
    raise exception 'invalid_phone';
  end if;

  select * into v_reward from loyalty_rewards
  where id = p_reward_id and restaurant_id = p_restaurant_id;
  if not found then raise exception 'reward_not_found'; end if;
  if not v_reward.is_active then raise exception 'reward_inactive'; end if;

  -- حد الاستخدام لكل عميل (ضمن الفترة)
  v_limit  := coalesce((v_reward.conditions->>'per_customer_limit')::int, 0);
  v_period := coalesce(v_reward.conditions->>'period', 'none');
  if v_limit > 0 then
    v_since := case v_period
      when 'day'   then now() - interval '1 day'
      when 'week'  then now() - interval '7 days'
      when 'month' then now() - interval '30 days'
      else null end;
    select count(*) into v_used from loyalty_transactions
    where restaurant_id = p_restaurant_id and customer_phone = v_phone
      and type = 'redeem' and reward_id = v_reward.id
      and (v_since is null or created_at >= v_since);
    if v_used >= v_limit then
      raise exception 'reward_limit_reached';
    end if;
  end if;

  select coalesce(current_balance, 0) into v_balance from loyalty_accounts
  where restaurant_id = p_restaurant_id and customer_phone = v_phone;
  v_balance := coalesce(v_balance, 0);
  if v_balance < v_reward.points_cost then
    raise exception 'insufficient_points' using errcode = 'check_violation';
  end if;

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
