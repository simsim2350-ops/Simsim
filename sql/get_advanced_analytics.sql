-- ============================================================================
-- Phase 3 / P3.1أ — التحليلات المتقدمة (get_advanced_analytics)
-- ----------------------------------------------------------------------------
-- تجميع خادمي (jsonb) للمؤشّرات التي لا توفّرها get_analytics_summary:
--   • تأثير الولاء على المبيعات (أعضاء مقابل غير أعضاء)
--   • رضا العملاء CSAT · معدل العودة في الفترة
--   • أداء الفروع (مبيعات + تقييم + شكاوى في جدول واحد)
--   • أكثر أسباب الشكاوى (حسب التصنيف اليدوي)
--
-- ⚠️ لا تُعدَّل get_analytics_summary إطلاقاً (أفضل المنتجات/مبيعات الفروع تبقى فيها).
-- SECURITY INVOKER → تحترم RLS ونطاق فرع الموظف تلقائياً (نفس نمط ADR-26).
-- «عضو ولاء» = له حساب في الدفتر بـ lifetime_earned > 0.
-- ⚠️ يُنفَّذ في Supabase بعد موافقة المالك.
-- ============================================================================

-- 1) تصنيف الشكوى (يدوي — يملؤه المالك؛ جاهز ليملأه الـAI في Phase 4)
alter table public.reviews add column if not exists complaint_category text;

-- 2) دالة التحليلات المتقدمة
create or replace function public.get_advanced_analytics(
  p_restaurant_id uuid,
  p_from          timestamptz,
  p_to            timestamptz,
  p_branch_id     uuid default null
) returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with ord as (
    select o.*, (la.customer_phone is not null) as is_member
    from orders o
    left join loyalty_accounts la
      on  la.restaurant_id   = o.restaurant_id
      and la.customer_phone  = o.customer_phone
      and la.lifetime_earned > 0
    where o.restaurant_id = p_restaurant_id
      and o.created_at >= p_from and o.created_at < p_to
      and (p_branch_id is null or o.branch_id = p_branch_id)
  ),
  comp as (select * from ord where status = 'completed'),
  rev as (
    select * from reviews r
    where r.restaurant_id = p_restaurant_id
      and r.created_at >= p_from and r.created_at < p_to
      and (p_branch_id is null or r.branch_id = p_branch_id)
  ),
  mem as (select count(*) c, coalesce(sum(total),0) s from comp where is_member),
  non as (select count(*) c, coalesce(sum(total),0) s from comp where not is_member),
  cust as (
    select customer_phone, count(*) n from ord
    where coalesce(customer_phone,'') <> '' group by 1
  ),
  bperf as (
    select b.id, b.name, b.is_primary,
           coalesce(o.revenue,0) as revenue, coalesce(o.orders,0) as orders,
           r.avg_rating, coalesce(r.reviews,0) as reviews, coalesce(r.complaints,0) as complaints
    from branches b
    left join (select branch_id, sum(total) revenue, count(*) orders from comp
               where branch_id is not null group by 1) o on o.branch_id = b.id
    left join (select branch_id, round(avg(rating)::numeric,1) avg_rating, count(*) reviews,
                      count(*) filter (where rating <= 2) complaints
               from rev where branch_id is not null group by 1) r on r.branch_id = b.id
    where b.restaurant_id = p_restaurant_id
  ),
  cats as (
    select coalesce(nullif(btrim(complaint_category),''), 'غير مصنّف') as cat, count(*) c
    from rev where rating <= 2 group by 1
  )
  select jsonb_build_object(
    -- تأثير الولاء على المبيعات
    'loyalty_impact', jsonb_build_object(
      'member_orders',        (select c from mem),
      'member_revenue',       (select s from mem),
      'member_aov',           (select case when c > 0 then round(s/c, 2) else 0 end from mem),
      'nonmember_orders',     (select c from non),
      'nonmember_revenue',    (select s from non),
      'nonmember_aov',        (select case when c > 0 then round(s/c, 2) else 0 end from non),
      'member_revenue_share', (select case when ((select s from mem) + (select s from non)) > 0
                                 then round((select s from mem) * 100.0 / ((select s from mem) + (select s from non)), 1)
                                 else 0 end),
      'aov_uplift_pct',       (select case when (select case when c>0 then s/c else 0 end from non) > 0
                                 then round(((select case when c>0 then s/c else 0 end from mem)
                                           - (select case when c>0 then s/c else 0 end from non))
                                           * 100.0 / (select case when c>0 then s/c else 0 end from non), 1)
                                 else 0 end)
    ),
    -- رضا العملاء
    'satisfaction', jsonb_build_object(
      'avg_rating',     (select coalesce(round(avg(rating)::numeric,1), 0) from rev),
      'reviews_count',  (select count(*) from rev),
      'satisfied_pct',  (select case when count(*) > 0
                          then round(count(*) filter (where rating >= 4) * 100.0 / count(*), 1) else 0 end from rev),
      'detractors_pct', (select case when count(*) > 0
                          then round(count(*) filter (where rating <= 2) * 100.0 / count(*), 1) else 0 end from rev)
    ),
    -- معدل العودة في الفترة
    'return_rate', (select case when count(*) > 0
                     then round(count(*) filter (where n > 1) * 100.0 / count(*), 1) else 0 end from cust),
    'customers_in_period', (select count(*) from cust),
    -- أداء الفروع (مبيعات + تقييم + شكاوى)
    'branch_performance', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'is_primary', is_primary,
        'revenue', revenue, 'orders', orders,
        'avg_rating', avg_rating, 'reviews', reviews, 'complaints', complaints
      ) order by revenue desc) from bperf), '[]'::jsonb),
    -- أكثر أسباب الشكاوى
    'complaint_reasons', coalesce((
      select jsonb_agg(jsonb_build_object('category', cat, 'count', c) order by c desc) from cats), '[]'::jsonb)
  );
$$;

revoke all on function public.get_advanced_analytics(uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.get_advanced_analytics(uuid, timestamptz, timestamptz, uuid) to authenticated;
