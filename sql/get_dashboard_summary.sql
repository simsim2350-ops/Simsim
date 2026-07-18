-- تجميع لوحة التحكم (الجزء التحليلي) — M1 / Dashboard (الخيار A)
-- SECURITY INVOKER (يحترم RLS). الأوقات بتوقيت الرياض. الرسم = مبيعات غير الملغاة يومياً.
-- الجزء التشغيلي (طلبات اليوم/الأمس + اللحظي) يبقى في الواجهة. نُفِّذ في Supabase ✅
create or replace function public.get_dashboard_summary(
  p_restaurant_id uuid, p_from timestamptz, p_to timestamptz
) returns jsonb
language sql stable security invoker set search_path = public as $$
  with cur as (
    select * from orders
    where restaurant_id = p_restaurant_id
      and created_at >= p_from and created_at < p_to
  ),
  daily as (
    select to_char((created_at at time zone 'Asia/Riyadh')::date,'YYYY-MM-DD') as d,
           coalesce(sum(total) filter (where status <> 'cancelled'),0) as value
    from cur group by 1
  ),
  prods as (
    select it->>'name' as name, max(it->>'emoji') as emoji,
           sum(coalesce((it->>'qty')::numeric,1)) as count
    from cur c
    cross join lateral jsonb_array_elements(case when jsonb_typeof(c.items)='array' then c.items else '[]'::jsonb end) it
    where it->>'name' is not null
    group by it->>'name'
  )
  select jsonb_build_object(
    'chart_daily',      coalesce((select jsonb_agg(jsonb_build_object('d',d,'value',value) order by d) from daily),'[]'::jsonb),
    'products',         coalesce((select jsonb_agg(jsonb_build_object('name',name,'emoji',emoji,'count',count) order by count desc) from prods),'[]'::jsonb),
    'unique_customers', (select count(distinct customer_phone) from cur where coalesce(customer_phone,'')<>'')
  );
$$;
grant execute on function public.get_dashboard_summary(uuid,timestamptz,timestamptz) to authenticated;
