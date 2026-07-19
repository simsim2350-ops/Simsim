-- تفاصيل مطعم واحد للمشرف (قراءة) — M3.1 (Super Admin / إدارة المطاعم)
-- قرار الخصوصية (أ): مقاييس + إعدادات + فروع + ملخّصات فقط — بلا بيانات عملاء فردية (جوال/اسم).
-- SECURITY DEFINER مبوّبة بـ is_platform_admin() (raise لغير المشرف). نُفِّذ في Supabase ✅
create or replace function public.admin_get_restaurant(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  select jsonb_build_object(
    'id', r.id, 'name', r.name, 'slug', r.slug, 'is_active', r.is_active,
    'subscription_plan', r.subscription_plan, 'created_at', r.created_at,
    'phone', r.phone, 'address', r.address, 'type', r.type, 'currency', r.currency, 'logo_url', r.logo_url,
    'owner_email', (select u.email from auth.users u where u.id = r.owner_id),
    'branches_count', (select count(*) from branches b where b.restaurant_id = r.id),
    'orders_total',   (select count(*) from orders o where o.restaurant_id = r.id),
    'orders_30d',     (select count(*) from orders o where o.restaurant_id = r.id and o.created_at >= now() - interval '30 days'),
    'revenue_total',  (select coalesce(sum(total),0) from orders o where o.restaurant_id = r.id and o.status='completed'),
    'customers_count',(select count(distinct customer_phone) from orders o where o.restaurant_id = r.id and coalesce(customer_phone,'')<>''),
    'branches', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id',b.id,'name',b.name,'is_primary',b.is_primary,'is_active',b.is_active,'is_paused',b.is_paused,'address',b.address
                 ) order by b.is_primary desc, b.sort_order),'[]'::jsonb) from branches b where b.restaurant_id = r.id),
    'top_products', (select coalesce(jsonb_agg(jsonb_build_object('name',name,'count',cnt) order by cnt desc),'[]'::jsonb) from (
        select it->>'name' name, sum(coalesce((it->>'qty')::numeric,1)) cnt
        from orders o cross join lateral jsonb_array_elements(case when jsonb_typeof(o.items)='array' then o.items else '[]'::jsonb end) it
        where o.restaurant_id = r.id and o.status<>'cancelled' and it->>'name' is not null
        group by it->>'name' order by cnt desc limit 5) tp),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('d',d,'orders',orders) order by d),'[]'::jsonb) from (
        select to_char((created_at at time zone 'Asia/Riyadh')::date,'YYYY-MM-DD') d, count(*) orders
        from orders o where o.restaurant_id = r.id and o.created_at >= now() - interval '14 days' group by 1) x)
  ) into result
  from restaurants r where r.id = p_restaurant_id;
  return result;
end; $$;
grant execute on function public.admin_get_restaurant(uuid) to authenticated;
revoke execute on function public.admin_get_restaurant(uuid) from public, anon;
