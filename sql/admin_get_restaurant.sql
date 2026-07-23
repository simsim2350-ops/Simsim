-- تفاصيل مطعم واحد للمشرف (قراءة) — Restaurant 360 (Super Admin)
-- مقاييس + إعدادات + فروع + ملخّصات + Health/MRR (من restaurant_stats) + الاشتراك + الفواتير + النشاط.
-- SECURITY DEFINER مبوّبة بـ is_platform_admin(). ro materialized (توحيد المسحات — ADR-28).
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
    'id', r.id, 'name', r.name, 'slug', r.slug, 'is_active', r.is_active, 'platform_suspended', r.platform_suspended,
    'subscription_plan', r.subscription_plan, 'created_at', r.created_at,
    'phone', r.phone, 'address', r.address, 'type', r.type, 'currency', r.currency, 'logo_url', r.logo_url,
    'owner_email', (select u.email from auth.users u where u.id = r.owner_id),
    'branches_count', (select count(*) from branches b where b.restaurant_id = r.id),
    'orders_total', agg.orders_total, 'orders_30d', agg.orders_30d,
    'revenue_total', agg.revenue_total, 'customers_count', agg.customers_count,
    'branches', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id',b.id,'name',b.name,'is_primary',b.is_primary,'is_active',b.is_active,'is_paused',b.is_paused,'address',b.address
                 ) order by b.is_primary desc, b.sort_order),'[]'::jsonb) from branches b where b.restaurant_id = r.id),
    'top_products', tp.v, 'daily', dl.v,
    -- Restaurant 360: طبقة F1 + الفوترة + النشاط
    'stats', (select to_jsonb(rs) from restaurant_stats rs where rs.restaurant_id = r.id),
    'subscription', (select to_jsonb(s) from subscriptions s where s.restaurant_id = r.id),
    'invoices', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id',i.id,'number',i.invoice_number,'total',i.total,'net',i.amount_net,'vat',i.vat_amount,
                   'status',i.status,'issued_at',i.issued_at,'due_at',i.due_at,'paid_at',i.paid_at) order by i.issued_at desc),'[]'::jsonb)
                 from (select * from invoices where restaurant_id = r.id order by issued_at desc limit 10) i),
    'activity', (select coalesce(jsonb_agg(jsonb_build_object(
                   'action',a.action,'at',a.created_at,'role',a.role,'old',a.old_value,'new',a.new_value) order by a.created_at desc),'[]'::jsonb)
                 from (select * from platform_audit_logs where target_type='restaurant' and target_id = r.id order by created_at desc limit 15) a)
  ) into result
  from restaurants r, agg, tp, dl where r.id = p_restaurant_id;
  return result;
end; $$;
grant execute on function public.admin_get_restaurant(uuid) to authenticated;
revoke execute on function public.admin_get_restaurant(uuid) from public, anon;
