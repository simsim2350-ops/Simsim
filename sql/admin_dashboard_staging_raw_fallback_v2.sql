-- Staging-only regression repair v2: Dashboard fallback while the F1 metrics-rollup layer is absent.
-- It intentionally reads only existing base tables and preserves the JSON shape expected by the admin UI.
-- Marketing CMS is not referenced or changed by this migration.

create or replace function public.admin_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin';
  end if;

  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'mrr', 0,
      'total_restaurants', (select count(*) from restaurants),
      'active_restaurants', (select count(*) from restaurants where is_active),
      'orders_30d', (select count(*) from orders where created_at >= now() - interval '30 days'),
      'outstanding_amount', (select coalesce(sum(total), 0) from invoices where status = 'open'),
      'new_restaurants_7d', (select count(*) from restaurants where created_at >= now() - interval '7 days'),
      'churn_risk_count', 0,
      'mrr_30d_ago', 0
    ),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object('d', d, 'orders', orders, 'revenue', revenue) order by d), '[]'::jsonb)
      from (
        select to_char((created_at at time zone 'Asia/Riyadh')::date, 'MM-DD') as d,
               count(*) as orders,
               coalesce(sum(total) filter (where status = 'completed'), 0) as revenue
        from orders
        where created_at >= now() - interval '30 days'
        group by 1
      ) daily
    ),
    'alerts', jsonb_build_object(
      'overdue', (
        select coalesce(jsonb_agg(t order by (t->>'due')), '[]'::jsonb)
        from (
          select jsonb_build_object('restaurant', r.name, 'amount', i.total, 'days', (now()::date - i.due_at), 'due', i.due_at) as t
          from invoices i
          join restaurants r on r.id = i.restaurant_id
          where i.status = 'open' and i.due_at is not null and i.due_at < now()::date
          order by i.due_at
          limit 10
        ) overdue_rows
      ),
      'expiring', (
        select coalesce(jsonb_agg(t order by (t->>'period_end')), '[]'::jsonb)
        from (
          select jsonb_build_object('restaurant', r.name, 'period_end', s.current_period_end) as t
          from subscriptions s
          join restaurants r on r.id = s.restaurant_id
          where s.status in ('active', 'trialing')
            and s.current_period_end is not null
            and s.current_period_end between now()::date and now()::date + 7
          order by s.current_period_end
          limit 10
        ) expiring_rows
      ),
      'churn', '[]'::jsonb
    ),
    'top_growing', '[]'::jsonb,
    'least_active', (
      select coalesce(jsonb_agg(t order by (t->>'orders')::int), '[]'::jsonb)
      from (
        select jsonb_build_object('restaurant', r.name, 'orders', count(o.id), 'health', 0) as t
        from restaurants r
        left join orders o on o.restaurant_id = r.id and o.created_at >= now() - interval '30 days'
        group by r.id, r.name
        order by count(o.id) asc, r.name
        limit 5
      ) least_active_rows
    ),
    'updated_at', now()
  ) into result;

  return result;
end;
$$;

grant execute on function public.admin_dashboard() to authenticated;
revoke execute on function public.admin_dashboard() from public, anon;
notify pgrst, 'reload schema';
