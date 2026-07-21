-- تفاصيل مطعم واحد للمشرف (قراءة) — M3.1 (Super Admin / إدارة المطاعم)
-- قرار الخصوصية (أ): مقاييس + إعدادات + فروع + ملخّصات فقط — بلا بيانات عملاء فردية (جوال/اسم).
-- SECURITY DEFINER مبوّبة بـ is_platform_admin() (raise لغير المشرف). نُفِّذ في Supabase ✅
--
-- ADR-28 (توحيد المسحات): طلبات المطعم تُقرأ مرة واحدة في CTE `ro` (materialized) بدل ~6 مسحات
-- منفصلة (orders_total/30d/revenue/customers/top_products/daily). كلها مُقيَّدة بمطعم واحد أصلاً
-- (لا تجميع عابر لكل المطاعم — النمط المكلف غائب هنا)، لكن التوحيد يخفّف الحمل لمطعم ضخم.
-- تحقّق تطابق 100% مع النسخة السابقة على المطاعم الحيّة قبل النشر (نمط ADR-26).
create or replace function public.admin_get_restaurant(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  with ro as materialized (
    select o.total, o.status, o.created_at, o.customer_phone, o.items
    from orders o where o.restaurant_id = p_restaurant_id
  ),
  agg as (
    select count(*) orders_total,
           count(*) filter (where created_at >= now() - interval '30 days') orders_30d,
           coalesce(sum(total) filter (where status='completed'),0) revenue_total,
           count(distinct customer_phone) filter (where coalesce(customer_phone,'')<>'') customers_count
    from ro
  ),
  tp as (
    select coalesce(jsonb_agg(jsonb_build_object('name',name,'count',cnt) order by cnt desc),'[]'::jsonb) v from (
      select it->>'name' name, sum(coalesce((it->>'qty')::numeric,1)) cnt
      from ro cross join lateral jsonb_array_elements(case when jsonb_typeof(ro.items)='array' then ro.items else '[]'::jsonb end) it
      where ro.status<>'cancelled' and it->>'name' is not null
      group by it->>'name' order by cnt desc limit 5) s
  ),
  dl as (
    select coalesce(jsonb_agg(jsonb_build_object('d',d,'orders',orders) order by d),'[]'::jsonb) v from (
      select to_char((created_at at time zone 'Asia/Riyadh')::date,'YYYY-MM-DD') d, count(*) orders
      from ro where created_at >= now() - interval '14 days' group by 1) x
  )
  select jsonb_build_object(
    'id', r.id, 'name', r.name, 'slug', r.slug, 'is_active', r.is_active,
    'subscription_plan', r.subscription_plan, 'created_at', r.created_at,
    'phone', r.phone, 'address', r.address, 'type', r.type, 'currency', r.currency, 'logo_url', r.logo_url,
    'owner_email', (select u.email from auth.users u where u.id = r.owner_id),
    'branches_count', (select count(*) from branches b where b.restaurant_id = r.id),
    'orders_total', agg.orders_total, 'orders_30d', agg.orders_30d,
    'revenue_total', agg.revenue_total, 'customers_count', agg.customers_count,
    'branches', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id',b.id,'name',b.name,'is_primary',b.is_primary,'is_active',b.is_active,'is_paused',b.is_paused,'address',b.address
                 ) order by b.is_primary desc, b.sort_order),'[]'::jsonb) from branches b where b.restaurant_id = r.id),
    'top_products', tp.v, 'daily', dl.v
  ) into result
  from restaurants r, agg, tp, dl where r.id = p_restaurant_id;
  return result;
end; $$;
grant execute on function public.admin_get_restaurant(uuid) to authenticated;
revoke execute on function public.admin_get_restaurant(uuid) from public, anon;
