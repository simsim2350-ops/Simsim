-- خدمة لوحة المنصّة: مقاييس مجمّعة عبر كل المطاعم — M2 (Super Admin)
-- SECURITY DEFINER مبوّبة بـ is_platform_admin() (raise لغير المشرف). نُفِّذ في Supabase ✅
-- مجاميع حيّة مناسبة للحجم الحالي؛ قابلة للاستبدال بجداول ملخّص/Materialized View عند التوسّع
-- بلا لمس واجهة الخدمة (dashboardApi.platformOverview).
create or replace function public.admin_platform_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  select jsonb_build_object(
    'restaurants_total',   (select count(*) from restaurants),
    'restaurants_active',  (select count(*) from restaurants where is_active),
    'restaurants_new_30d', (select count(*) from restaurants where created_at >= now() - interval '30 days'),
    'orders_total',        (select count(*) from orders),
    'orders_30d',          (select count(*) from orders where created_at >= now() - interval '30 days'),
    'orders_today',        (select count(*) from orders where created_at >= date_trunc('day', now() at time zone 'Asia/Riyadh')),
    'revenue_total',       (select coalesce(sum(total),0) from orders where status='completed'),
    'revenue_30d',         (select coalesce(sum(total),0) from orders where status='completed' and created_at >= now() - interval '30 days'),
    'customers_total',     (select count(distinct customer_phone) from orders where coalesce(customer_phone,'')<>''),
    'plans',               (select coalesce(jsonb_object_agg(subscription_plan, cnt),'{}'::jsonb)
                             from (select coalesce(subscription_plan,'—') subscription_plan, count(*) cnt from restaurants group by 1) p),
    'daily',               (select coalesce(jsonb_agg(jsonb_build_object('d',d,'orders',orders,'revenue',revenue) order by d),'[]'::jsonb)
                             from (select to_char((created_at at time zone 'Asia/Riyadh')::date,'YYYY-MM-DD') d,
                                          count(*) orders,
                                          coalesce(sum(total) filter (where status='completed'),0) revenue
                                   from orders where created_at >= now() - interval '14 days' group by 1) x)
  ) into result;
  return result;
end; $$;
grant execute on function public.admin_platform_overview() to authenticated;
revoke execute on function public.admin_platform_overview() from public, anon;
