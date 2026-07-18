-- رؤى صفحة العملاء (أكثر منتج + اتجاه المتوسط الشهري) — M1 / الخيار A / خطوة A2
-- SECURITY INVOKER: يخضع لـ RLS (يحترم نطاق فرع الموظف). توقيت الأشهر بتوقيت الرياض.
-- نُفِّذ في Supabase ✅
create or replace function public.get_customers_insights(p_restaurant_id uuid)
returns table (top_product text, this_month_avg numeric, last_month_avg numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with noncancelled as (
    select total, items, created_at
    from orders
    where restaurant_id = p_restaurant_id and status <> 'cancelled'
  ),
  months as (
    select
      avg(total) filter (where date_trunc('month', created_at at time zone 'Asia/Riyadh')
                             = date_trunc('month', now() at time zone 'Asia/Riyadh')) as this_month_avg,
      avg(total) filter (where date_trunc('month', created_at at time zone 'Asia/Riyadh')
                             = date_trunc('month', (now() at time zone 'Asia/Riyadh') - interval '1 month')) as last_month_avg
    from noncancelled
  ),
  prod as (
    select it->>'name' as name, sum(coalesce((it->>'qty')::numeric, 1)) as qty
    from noncancelled n
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(n.items)='array' then n.items else '[]'::jsonb end) as it
    where it->>'name' is not null
    group by it->>'name'
    order by qty desc
    limit 1
  )
  select (select name from prod), m.this_month_avg, m.last_month_avg from months m;
$$;
grant execute on function public.get_customers_insights(uuid) to authenticated;
