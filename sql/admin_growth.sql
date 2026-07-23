-- Phase 2: صفحة النمو — تقرأ Event Ledger + platform_daily_metrics (تحليلات لا تُستدرك بلا التاريخ).
-- SECURITY DEFINER مبوّبة بـ is_platform_admin().
create or replace function public.admin_growth()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'current_mrr',      (select coalesce(sum(mrr),0) from restaurant_stats),
      'active_subs',      (select count(*) from subscriptions where status in ('active','past_due','trialing')),
      'total_subs',       (select count(*) from subscriptions),
      'new_mrr_30d',      (select coalesce(sum(mrr_delta) filter (where mrr_delta>0),0) from subscription_events where created_at >= now()-interval '30 days'),
      'churned_mrr_30d',  (select coalesce(-sum(mrr_delta) filter (where mrr_delta<0),0) from subscription_events where created_at >= now()-interval '30 days'),
      'churned_subs_30d', (select count(*) from subscription_events where event_type='canceled' and created_at >= now()-interval '30 days'),
      'new_subs_30d',     (select count(*) from subscription_events where event_type='created' and created_at >= now()-interval '30 days')
    ),
    'mrr_series', (select coalesce(jsonb_agg(jsonb_build_object('d', to_char(day,'MM-DD'), 'mrr', mrr) order by day),'[]'::jsonb)
                    from (select * from platform_daily_metrics order by day desc limit 90) x),
    'monthly', (select coalesce(jsonb_agg(jsonb_build_object(
                  'month', m, 'new_mrr', new_mrr, 'churned_mrr', churned_mrr, 'net_mrr', net_mrr,
                  'new_subs', new_subs, 'churned_subs', churned_subs) order by m),'[]'::jsonb)
                from (
                  select to_char((created_at at time zone 'Asia/Riyadh'),'YYYY-MM') m,
                    coalesce(sum(mrr_delta) filter (where mrr_delta>0),0)  new_mrr,
                    coalesce(-sum(mrr_delta) filter (where mrr_delta<0),0) churned_mrr,
                    coalesce(sum(mrr_delta),0)                             net_mrr,
                    count(*) filter (where event_type='created')  new_subs,
                    count(*) filter (where event_type='canceled') churned_subs
                  from subscription_events
                  where created_at >= (now() at time zone 'Asia/Riyadh') - interval '6 months'
                  group by 1) y)
  ) into result;
  return result;
end; $$;
grant  execute on function public.admin_growth() to authenticated;
revoke execute on function public.admin_growth() from public, anon;
