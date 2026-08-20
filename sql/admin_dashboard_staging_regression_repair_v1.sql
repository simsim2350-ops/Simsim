-- Staging-only regression repair: restore the missing admin dashboard RPC and refresh PostgREST schema cache.
-- This migration is intentionally independent from Marketing CMS behavior.

create or replace function public.admin_dashboard()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'mrr',                (select coalesce(sum(mrr),0) from restaurant_stats),
      'total_restaurants',  (select count(*) from restaurants),
      'active_restaurants', (select count(*) from restaurant_stats where subscription_status in ('active','trialing','past_due')),
      'orders_30d',         (select coalesce(sum(orders_30d),0) from restaurant_stats),
      'outstanding_amount', (select coalesce(sum(outstanding_amount),0) from restaurant_stats),
      'new_restaurants_7d', (select count(*) from restaurants where created_at >= now()-interval '7 days'),
      'churn_risk_count',   (select count(*) from restaurant_stats where churn_risk='high'),
      'mrr_30d_ago',        (select coalesce(mrr,0) from platform_daily_metrics
                              where day <= (now() at time zone 'Asia/Riyadh')::date - 30 order by day desc limit 1)
    ),
    'series', (select coalesce(jsonb_agg(jsonb_build_object(
                  'd', to_char(day,'MM-DD'), 'orders', orders_count, 'revenue', orders_revenue, 'mrr', mrr) order by day),'[]'::jsonb)
                from (select * from platform_daily_metrics order by day desc limit 30) x),
    'alerts', jsonb_build_object(
      'overdue', (select coalesce(jsonb_agg(t order by (t->>'due')),'[]'::jsonb) from (
                    select jsonb_build_object('restaurant', r.name, 'amount', i.total,
                           'days', (now()::date - i.due_at), 'due', i.due_at) as t
                    from invoices i join restaurants r on r.id=i.restaurant_id
                    where i.status='open' and i.due_at is not null and i.due_at < now()::date
                    order by i.due_at limit 10) q),
      'expiring', (select coalesce(jsonb_agg(t order by (t->>'period_end')),'[]'::jsonb) from (
                     select jsonb_build_object('restaurant', r.name, 'period_end', s.current_period_end) as t
                     from subscriptions s join restaurants r on r.id=s.restaurant_id
                     where s.status in ('active','trialing') and s.current_period_end is not null
                       and s.current_period_end between now()::date and now()::date + 7
                     order by s.current_period_end limit 10) q),
      'churn', (select coalesce(jsonb_agg(t),'[]'::jsonb) from (
                  select jsonb_build_object('restaurant', r.name, 'health', rs.health_score, 'last_order', rs.last_order_at) as t
                  from restaurant_stats rs join restaurants r on r.id=rs.restaurant_id
                  where rs.churn_risk='high' order by rs.health_score limit 8) q)
    ),
    'top_growing', (select coalesce(jsonb_agg(t),'[]'::jsonb) from (
                      select jsonb_build_object('restaurant', r.name, 'growth', rs.growth_pct, 'orders', rs.orders_30d) as t
                      from restaurant_stats rs join restaurants r on r.id=rs.restaurant_id
                      where rs.growth_pct is not null order by rs.growth_pct desc limit 5) q),
    'least_active', (select coalesce(jsonb_agg(t),'[]'::jsonb) from (
                       select jsonb_build_object('restaurant', r.name, 'orders', rs.orders_30d, 'health', rs.health_score) as t
                       from restaurant_stats rs join restaurants r on r.id=rs.restaurant_id
                       order by rs.orders_30d asc, rs.health_score asc limit 5) q),
    'updated_at', (select max(updated_at) from restaurant_stats)
  ) into result;
  return result;
end; $$;

grant execute on function public.admin_dashboard() to authenticated;
revoke execute on function public.admin_dashboard() from public, anon;
notify pgrst, 'reload schema';
