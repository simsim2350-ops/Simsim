-- ============================================================================
-- Phase 2 / (ب) لوحة تحكم الولاء — get_loyalty_dashboard
-- ----------------------------------------------------------------------------
-- تجميع خادمي (jsonb) لكل مؤشّرات لوحة الولاء من الدفتر — بلا تنزيل حركات للمتصفح
-- (مبدأ ADR-26). SECURITY INVOKER → تحترم RLS الدفتر تلقائياً (قراءة صاحب المطعم).
--
-- التعريفات المعتمدة: معدل الاستبدال = المستخدَمة÷الممنوحة · الاحتفاظ = % من كسبوا
-- أكثر من مرة (عادوا وطلبوا ثانيةً).
-- ⚠️ يُنفَّذ في Supabase بعد موافقة المالك.
-- ============================================================================

create or replace function public.get_loyalty_dashboard(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_granted bigint; v_used bigint; v_expired bigint;
  v_total int; v_active int; v_outstanding bigint; v_returning int;
begin
  select
    coalesce(sum(case when points > 0 then points else 0 end), 0),
    coalesce(sum(case when type = 'redeem' then -points else 0 end), 0),
    coalesce(sum(case when type = 'expire' then -points else 0 end), 0)
  into v_granted, v_used, v_expired
  from loyalty_transactions where restaurant_id = p_restaurant_id;

  select count(*), coalesce(sum(current_balance), 0),
         count(*) filter (where last_activity_at >= now() - interval '30 days')
  into v_total, v_outstanding, v_active
  from loyalty_accounts where restaurant_id = p_restaurant_id;

  select count(*) into v_returning from (
    select account_id from loyalty_transactions
    where restaurant_id = p_restaurant_id and type = 'earn' and source = 'order'
    group by account_id having count(*) > 1
  ) x;

  return jsonb_build_object(
    'points_granted',     v_granted,
    'points_used',        v_used,
    'points_expired',     v_expired,
    'points_outstanding', v_outstanding,
    'total_customers',    v_total,
    'active_customers',   v_active,
    'redemption_rate',    case when v_granted > 0 then round(v_used::numeric / v_granted * 100, 1) else 0 end,
    'retention_rate',     case when v_total   > 0 then round(v_returning::numeric / v_total * 100, 1) else 0 end,
    'top_customers', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select a.customer_name as name, a.customer_phone as phone, a.current_balance as balance,
               ti.name as tier, ti.icon as tier_icon, ti.color as tier_color
        from loyalty_accounts a
        left join loyalty_tiers ti on ti.id = a.tier_id
        where a.restaurant_id = p_restaurant_id
        order by a.current_balance desc limit 5
      ) t
    ),
    'top_rewards', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select r.name, count(*) as uses
        from loyalty_transactions tx
        join loyalty_rewards r on r.id = tx.reward_id
        where tx.restaurant_id = p_restaurant_id and tx.type = 'redeem' and tx.reward_id is not null
        group by r.id, r.name order by count(*) desc limit 5
      ) t
    ),
    'tier_distribution', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select ti.name, ti.icon, ti.color, count(a.id) as customers
        from loyalty_tiers ti
        left join loyalty_accounts a on a.tier_id = ti.id and a.restaurant_id = p_restaurant_id
        where ti.restaurant_id = p_restaurant_id
        group by ti.id, ti.name, ti.icon, ti.color, ti.sort_order
        order by ti.sort_order
      ) t
    )
  );
end;
$$;

revoke all on function public.get_loyalty_dashboard(uuid) from public, anon;
grant execute on function public.get_loyalty_dashboard(uuid) to authenticated;
