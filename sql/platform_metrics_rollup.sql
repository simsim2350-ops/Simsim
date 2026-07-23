-- ========== F1.2: المجاميع (Rollup) + إحصاءات المطاعم + المهمّة المجدولة ==========
-- جداول ملخّصات جاهزة تُحدَّث كل 10 دقائق عبر pg_cron — اللوحة تقرأها بدل مسح الجداول الخام.
-- RLS: قراءة المشرف فقط. الدوال DEFINER (المهمّة تعمل بصلاحيات النظام).

-- 1) المجاميع اليومية للمنصّة (صف لكل يوم بتوقيت الرياض)
create table if not exists public.platform_daily_metrics (
  day                  date primary key,
  orders_count         int not null default 0,
  orders_revenue       numeric(14,2) not null default 0,
  completed_revenue    numeric(14,2) not null default 0,
  active_restaurants   int not null default 0,   -- طلبوا خلال اليوم
  new_restaurants      int not null default 0,
  mrr                  numeric(14,2) not null default 0,   -- تراكمي حتى نهاية اليوم (من الـLedger)
  new_mrr              numeric(14,2) not null default 0,
  churned_mrr          numeric(14,2) not null default 0,
  invoices_issued      int not null default 0,
  invoices_paid_amount numeric(14,2) not null default 0,
  overdue_amount       numeric(14,2) not null default 0,
  updated_at           timestamptz not null default now()
);
alter table public.platform_daily_metrics enable row level security;
create policy pdm_admin_select on public.platform_daily_metrics for select using (public.is_platform_admin());

-- 2) إحصاءات كل مطعم (لقطة مُدنرملة — القائمة تقرأ/تفرز/تفلتر عليها)
create table if not exists public.restaurant_stats (
  restaurant_id       uuid primary key references restaurants(id) on delete cascade,
  health_score        int not null default 0,
  health_band         text not null default 'red',
  mrr                 numeric(12,2) not null default 0,
  subscription_status text,
  plan_label          text,
  period_end          date,
  last_order_at       timestamptz,
  orders_30d          int not null default 0,
  orders_prev_30d     int not null default 0,
  growth_pct          numeric(6,1),
  outstanding_amount  numeric(12,2) not null default 0,
  last_login_at       timestamptz,
  churn_risk          text not null default 'low',
  updated_at          timestamptz not null default now()
);
alter table public.restaurant_stats enable row level security;
create policy rs_admin_select on public.restaurant_stats for select using (public.is_platform_admin());
create index if not exists idx_rstats_health on public.restaurant_stats (health_score);
create index if not exists idx_rstats_churn  on public.restaurant_stats (churn_risk);

-- 3) تحديث إحصاءات المطاعم (Health Score قابل للضبط: نشاط40 · فوترة30 · تفاعل20 · نمو10)
create or replace function public.refresh_restaurant_stats()
returns void language plpgsql security definer set search_path = public as $$
begin
  with base as (
    select r.id as restaurant_id,
      (select max(o.created_at) from orders o where o.restaurant_id = r.id) as last_order_at,
      (select count(*) from orders o where o.restaurant_id = r.id and o.created_at >= now()-interval '30 days') as orders_30d,
      (select count(*) from orders o where o.restaurant_id = r.id and o.created_at >= now()-interval '60 days' and o.created_at < now()-interval '30 days') as orders_prev_30d,
      s.status as sub_status, s.plan_label, s.current_period_end as period_end,
      public._sub_mrr(s.amount, s.billing_cycle, s.status) as mrr,
      (select coalesce(sum(i.total),0) from invoices i where i.restaurant_id = r.id and i.status='open') as outstanding,
      u.last_sign_in_at as last_login_at
    from restaurants r
    left join subscriptions s on s.restaurant_id = r.id
    left join auth.users u on u.id = r.owner_id
  ),
  scored as (
    select b.*,
      (case when b.last_order_at >= now()-interval '3 days' then 100
            when b.last_order_at >= now()-interval '7 days' then 80
            when b.last_order_at >= now()-interval '14 days' then 50
            when b.last_order_at >= now()-interval '30 days' then 20 else 0 end) as act,
      (case when b.sub_status='canceled' or b.sub_status is null then 0
            when b.sub_status='past_due' or b.outstanding>0 then 40 else 100 end) as bill,
      (case when b.last_login_at >= now()-interval '7 days' then 100
            when b.last_login_at >= now()-interval '30 days' then 60
            when b.last_login_at is not null then 20 else 0 end) as eng,
      (case when b.orders_prev_30d=0 and b.orders_30d>0 then 100
            when b.orders_30d > b.orders_prev_30d then 100
            when b.orders_30d = b.orders_prev_30d then 60 else 30 end) as grw,
      (case when b.orders_prev_30d>0 then round((b.orders_30d-b.orders_prev_30d)::numeric*100/b.orders_prev_30d,1) else null end) as growth_pct
    from base b
  ),
  final as (
    select s.*, round(0.4*act + 0.3*bill + 0.2*eng + 0.1*grw)::int as health from scored s
  )
  insert into restaurant_stats(restaurant_id, health_score, health_band, mrr, subscription_status, plan_label,
    period_end, last_order_at, orders_30d, orders_prev_30d, growth_pct, outstanding_amount, last_login_at, churn_risk, updated_at)
  select restaurant_id, health,
    case when health>=70 then 'green' when health>=40 then 'yellow' else 'red' end,
    coalesce(mrr,0), sub_status, plan_label, period_end, last_order_at, orders_30d, orders_prev_30d, growth_pct, outstanding, last_login_at,
    case when (last_order_at is null or last_order_at < now()-interval '14 days') or outstanding>0 or sub_status='past_due' or health<40 then 'high'
         when health<70 then 'med' else 'low' end,
    now()
  from final
  on conflict (restaurant_id) do update set
    health_score=excluded.health_score, health_band=excluded.health_band, mrr=excluded.mrr,
    subscription_status=excluded.subscription_status, plan_label=excluded.plan_label, period_end=excluded.period_end,
    last_order_at=excluded.last_order_at, orders_30d=excluded.orders_30d, orders_prev_30d=excluded.orders_prev_30d,
    growth_pct=excluded.growth_pct, outstanding_amount=excluded.outstanding_amount, last_login_at=excluded.last_login_at,
    churn_risk=excluded.churn_risk, updated_at=now();
end; $$;

-- 4) تحديث المجاميع اليومية (آخر 3 أيام لالتقاط أي بيانات متأخّرة)
create or replace function public.refresh_platform_daily_metrics()
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into platform_daily_metrics(day, orders_count, orders_revenue, completed_revenue, active_restaurants,
    new_restaurants, mrr, new_mrr, churned_mrr, invoices_issued, invoices_paid_amount, overdue_amount, updated_at)
  select d.day,
    (select count(*) from orders o where (o.created_at at time zone 'Asia/Riyadh')::date = d.day),
    (select coalesce(sum(o.total),0) from orders o where (o.created_at at time zone 'Asia/Riyadh')::date = d.day),
    (select coalesce(sum(o.total),0) from orders o where o.status='completed' and (o.created_at at time zone 'Asia/Riyadh')::date = d.day),
    (select count(distinct o.restaurant_id) from orders o where (o.created_at at time zone 'Asia/Riyadh')::date = d.day),
    (select count(*) from restaurants r where (r.created_at at time zone 'Asia/Riyadh')::date = d.day),
    (select coalesce(sum(e.mrr_delta),0) from subscription_events e where e.created_at < (d.day + 1)),
    (select coalesce(sum(e.mrr_delta),0) from subscription_events e where (e.created_at at time zone 'Asia/Riyadh')::date = d.day and e.mrr_delta>0),
    (select coalesce(-sum(e.mrr_delta),0) from subscription_events e where (e.created_at at time zone 'Asia/Riyadh')::date = d.day and e.mrr_delta<0),
    (select count(*) from invoice_events e where e.event_type='issued' and (e.created_at at time zone 'Asia/Riyadh')::date = d.day),
    (select coalesce(sum(e.amount),0) from invoice_events e where e.event_type='paid' and (e.created_at at time zone 'Asia/Riyadh')::date = d.day),
    (select coalesce(sum(i.total),0) from invoices i where i.status='open' and i.due_at < now()),
    now()
  from (select generate_series((now() at time zone 'Asia/Riyadh')::date - 2, (now() at time zone 'Asia/Riyadh')::date, interval '1 day')::date as day) d
  on conflict (day) do update set
    orders_count=excluded.orders_count, orders_revenue=excluded.orders_revenue, completed_revenue=excluded.completed_revenue,
    active_restaurants=excluded.active_restaurants, new_restaurants=excluded.new_restaurants, mrr=excluded.mrr,
    new_mrr=excluded.new_mrr, churned_mrr=excluded.churned_mrr, invoices_issued=excluded.invoices_issued,
    invoices_paid_amount=excluded.invoices_paid_amount, overdue_amount=excluded.overdue_amount, updated_at=now();
end; $$;

-- 5) مُنسّق واحد + مُشغّل يدوي للمشرف
create or replace function public.refresh_platform_metrics()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_restaurant_stats();
  perform public.refresh_platform_daily_metrics();
end; $$;

create or replace function public.admin_refresh_metrics()
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  perform public.refresh_platform_metrics();
  return true;
end; $$;
grant  execute on function public.admin_refresh_metrics() to authenticated;
revoke execute on function public.admin_refresh_metrics() from public, anon;

-- 6) الجدولة عبر pg_cron (كل 10 دقائق) + تشغيل فوري لتعبئة أولية
create extension if not exists pg_cron;
select cron.schedule('refresh-platform-metrics', '*/10 * * * *', $$ select public.refresh_platform_metrics(); $$);
select public.refresh_platform_metrics();
