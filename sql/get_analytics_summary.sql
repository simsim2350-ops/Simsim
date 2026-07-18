-- تجميع التحليلات خادمياً — M1 / صفحة التحليلات (B1)
-- SECURITY INVOKER (يحترم RLS/نطاق الفرع). الأوقات بتوقيت الرياض. يرجع مجاميع فقط،
-- والضريبة تُفكّ في JS عبر lib/pricing.js (completed_gross_sum يحفظ الخطّية والـclamp).
-- نُفِّذ في Supabase ✅
create or replace function public.get_analytics_summary(
  p_restaurant_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_prev_from timestamptz,
  p_prev_to timestamptz,
  p_branch_id uuid default null
) returns jsonb
language sql stable security invoker set search_path = public as $$
  with cur as (
    select * from orders
    where restaurant_id = p_restaurant_id
      and created_at >= p_from and created_at < p_to
      and (p_branch_id is null or branch_id = p_branch_id)
  ),
  prev as (
    select total, status from orders
    where restaurant_id = p_restaurant_id
      and created_at >= p_prev_from and created_at < p_prev_to
      and (p_branch_id is null or branch_id = p_branch_id)
  ),
  comp as (select * from cur where status = 'completed'),
  daily as (
    select to_char((created_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as d,
           count(*) as orders,
           coalesce(sum(total) filter (where status='completed'),0) as revenue
    from cur group by 1
  ),
  prods as (
    select it->>'name' as name, max(it->>'emoji') as emoji,
           sum(coalesce((it->>'qty')::numeric,1)) as count,
           sum(coalesce((it->>'price')::numeric,0) * coalesce((it->>'qty')::numeric,1)) as revenue
    from cur c
    cross join lateral jsonb_array_elements(case when jsonb_typeof(c.items)='array' then c.items else '[]'::jsonb end) it
    where it->>'name' is not null
    group by it->>'name'
  ),
  statuses as (select status, count(*) c from cur group by status),
  types as (select coalesce(type,'dine_in') t, sum(total) s from comp group by 1),
  branchrev as (select branch_id, sum(total) s from comp where branch_id is not null group by branch_id),
  reasons as (select coalesce(cancel_reason,'غير محدد') r, count(*) c from cur where status='cancelled' group by 1),
  hours as (select extract(hour from (created_at at time zone 'Asia/Riyadh'))::int h, count(*) c from comp group by 1)
  select jsonb_build_object(
    'total_orders',        (select count(*) from cur),
    'completed_count',     (select count(*) from comp),
    'cancelled_count',     (select count(*) from cur where status='cancelled'),
    'revenue',             (select coalesce(sum(total),0) from comp),
    'completed_gross_sum', (select coalesce(sum(greatest(total - coalesce(delivery_fee,0),0)),0) from comp),
    'unique_customers',    (select count(distinct customer_phone) from cur where coalesce(customer_phone,'')<>''),
    'avg_prep_minutes',    (select avg(greatest(extract(epoch from (updated_at-created_at))/60,0)) from comp where updated_at is not null),
    'prev_revenue',        (select coalesce(sum(total),0) from prev where status='completed'),
    'prev_total_orders',   (select count(*) from prev),
    'daily',          coalesce((select jsonb_agg(jsonb_build_object('d',d,'orders',orders,'revenue',revenue) order by d) from daily),'[]'::jsonb),
    'products',       coalesce((select jsonb_agg(jsonb_build_object('name',name,'emoji',emoji,'count',count,'revenue',revenue)) from prods),'[]'::jsonb),
    'status_counts',  coalesce((select jsonb_object_agg(status,c) from statuses),'{}'::jsonb),
    'type_revenue',   coalesce((select jsonb_object_agg(t,s) from types),'{}'::jsonb),
    'branch_revenue', coalesce((select jsonb_object_agg(branch_id::text,s) from branchrev),'{}'::jsonb),
    'cancel_reasons', coalesce((select jsonb_agg(jsonb_build_object('reason',r,'count',c) order by c desc) from reasons),'[]'::jsonb),
    'hours',          coalesce((select jsonb_object_agg(h::text,c) from hours),'{}'::jsonb)
  );
$$;
grant execute on function public.get_analytics_summary(uuid,timestamptz,timestamptz,timestamptz,timestamptz,uuid) to authenticated;
