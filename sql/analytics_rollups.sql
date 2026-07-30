-- ============================================================================
-- Analytics Core Layer — M3: المستهلك/التجميع + قراءة لوحة المشرف (ADR-42)
-- ============================================================================
-- يعمّم نمط refresh_* + pg_cron الموجود (ADR-31): يطوي أحداث العميل الخام
-- (analytics_events) إلى مجاميع يومية جاهزة، ويُربط بمنسّق الكرون الموجود
-- (refresh_platform_metrics كل 10 دقائق) — بلا جدولة جديدة ولا منطق مكرّر.
-- القراءة عبر admin_analytics_overview: قمع العميل (من التجميع) + تبنّي الميزات
-- (من بيانات PCR الموجودة feature_flags/plan_features/overrides — بلا تكرار).
-- ============================================================================

-- 1) مجاميع قمع العميل اليومية (مستوى المنصّة، بتوقيت الرياض)
create table if not exists public.analytics_funnel_daily (
  day            date primary key,
  menu_views     int not null default 0,
  product_views  int not null default 0,
  cart_adds      int not null default 0,
  orders_placed  int not null default 0,
  updated_at     timestamptz not null default now()
);
alter table public.analytics_funnel_daily enable row level security;
drop policy if exists afd_admin_select on public.analytics_funnel_daily;
create policy afd_admin_select on public.analytics_funnel_daily for select using (public.is_platform_admin());

-- 2) التجميع (آخر 3 أيام لالتقاط المتأخّر) — نمط refresh_platform_daily_metrics
create or replace function public.refresh_analytics_rollups()
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into analytics_funnel_daily(day, menu_views, product_views, cart_adds, orders_placed, updated_at)
  select d.day,
    count(*) filter (where e.event_type = 'menu.viewed'),
    count(*) filter (where e.event_type = 'menu.product_viewed'),
    count(*) filter (where e.event_type = 'cart.item_added'),
    count(*) filter (where e.event_type = 'order.placed'),
    now()
  from (select generate_series((now() at time zone 'Asia/Riyadh')::date - 2,
                               (now() at time zone 'Asia/Riyadh')::date, interval '1 day')::date as day) d
  left join analytics_events e
    on (e.occurred_at at time zone 'Asia/Riyadh')::date = d.day and e.scope = 'customer'
  group by d.day
  on conflict (day) do update set
    menu_views = excluded.menu_views, product_views = excluded.product_views,
    cart_adds = excluded.cart_adds, orders_placed = excluded.orders_placed, updated_at = now();
end; $$;

-- 3) ربط بمنسّق الكرون الموجود (إضافي، غير كاسر) — يعيد تعريفه شاملاً النداءين القائمين
create or replace function public.refresh_platform_metrics()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_restaurant_stats();
  perform public.refresh_platform_daily_metrics();
  perform public.refresh_analytics_rollups();
end; $$;

-- 4) قراءة لوحة المشرف: قمع العميل (30 يوماً) + تبنّي الميزات (من بيانات PCR الموجودة)
create or replace function public.admin_analytics_overview()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  select jsonb_build_object(
    'funnel', (
      select jsonb_build_object(
        'menu_views',    coalesce(sum(menu_views),0),
        'product_views', coalesce(sum(product_views),0),
        'cart_adds',     coalesce(sum(cart_adds),0),
        'orders_placed', coalesce(sum(orders_placed),0)
      )
      from analytics_funnel_daily
      where day > (now() at time zone 'Asia/Riyadh')::date - 30
    ),
    'feature_adoption', (
      select coalesce(jsonb_agg(r), '[]'::jsonb) from (
        select jsonb_build_object(
          'key', f.key, 'name', f.name, 'enabled_global', f.enabled_global,
          'plans_including', (select count(*) from plan_features pf where pf.feature_key = f.key and pf.is_included),
          'overrides_on',    (select count(*) from restaurant_feature_overrides o where o.key = f.key and o.enabled is true),
          'overrides_off',   (select count(*) from restaurant_feature_overrides o where o.key = f.key and o.enabled is false)
        ) as r
        from feature_flags f
        where f.type = 'feature'
        order by (select count(*) from plan_features pf where pf.feature_key = f.key and pf.is_included) desc,
                 (select count(*) from restaurant_feature_overrides o where o.key = f.key) desc,
                 f.sort_order
        limit 12
      ) s
    )
  ) into v;
  return v;
end; $$;
grant  execute on function public.admin_analytics_overview() to authenticated;
revoke execute on function public.admin_analytics_overview() from public, anon;
