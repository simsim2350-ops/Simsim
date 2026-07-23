-- خدمة المشرف: قائمة المطاعم (قراءة) — ترقيم/بحث/فرز/فلترة خادمية + Health من restaurant_stats.
-- SECURITY DEFINER مبوّبة بـ is_platform_admin(). تقرأ الملخّصات الجاهزة (F1) — تتوسّع لآلاف المطاعم.
-- الفرز عبر قائمة بيضاء (whitelist) داخل CASE — آمن ضد الحقن.

drop function if exists public.admin_list_restaurants();
drop function if exists public.admin_list_restaurants(text, int, int);
drop function if exists public.admin_list_restaurants(text, text, text, text, int, int);

create or replace function public.admin_list_restaurants(
  p_search text default null,
  p_sort   text default 'created_at',   -- created_at | health | mrr | orders | name
  p_dir    text default 'desc',         -- asc | desc
  p_filter text default null,           -- null | at_risk | green | yellow | red
  p_limit  int  default 25,
  p_offset int  default 0
)
returns table (id uuid, name text, slug text, is_active boolean, platform_suspended boolean,
               subscription_status text, mrr numeric, health_score int, health_band text,
               churn_risk text, orders_30d int, last_order_at timestamptz, created_at timestamptz,
               owner_email text, total_count bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_limit  int := least(greatest(coalesce(p_limit,25),1),100);
  v_offset int := greatest(coalesce(p_offset,0),0);
  v_search text := nullif(trim(coalesce(p_search,'')),'');
  v_asc    boolean := lower(coalesce(p_dir,'desc')) = 'asc';
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  return query
    with page as (
      select r.id, r.name, r.slug, r.is_active, r.platform_suspended, r.created_at,
             u.email::text as owner_email,
             rs.subscription_status,
             coalesce(rs.mrr,0)          as mrr,
             coalesce(rs.health_score,0) as health_score,
             coalesce(rs.health_band,'red') as health_band,
             coalesce(rs.churn_risk,'low')  as churn_risk,
             coalesce(rs.orders_30d,0)   as orders_30d,
             rs.last_order_at,
             count(*) over() as total_count
      from restaurants r
      left join restaurant_stats rs on rs.restaurant_id = r.id
      left join auth.users u on u.id = r.owner_id
      where (v_search is null or r.name ilike '%'||v_search||'%' or r.slug ilike '%'||v_search||'%' or u.email ilike '%'||v_search||'%')
        and (p_filter is null
             or (p_filter = 'at_risk' and coalesce(rs.churn_risk,'low') = 'high')
             or (p_filter in ('green','yellow','red') and coalesce(rs.health_band,'red') = p_filter))
      order by
        case when p_sort='health' and     v_asc then coalesce(rs.health_score,0) end asc,
        case when p_sort='health' and not v_asc then coalesce(rs.health_score,0) end desc,
        case when p_sort='mrr'    and     v_asc then coalesce(rs.mrr,0) end asc,
        case when p_sort='mrr'    and not v_asc then coalesce(rs.mrr,0) end desc,
        case when p_sort='orders' and     v_asc then coalesce(rs.orders_30d,0) end asc,
        case when p_sort='orders' and not v_asc then coalesce(rs.orders_30d,0) end desc,
        case when p_sort='name'   and     v_asc then r.name end asc,
        case when p_sort='name'   and not v_asc then r.name end desc,
        r.created_at desc
      limit v_limit offset v_offset
    )
    select p.id, p.name, p.slug, p.is_active, p.platform_suspended, p.subscription_status, p.mrr,
           p.health_score, p.health_band, p.churn_risk, p.orders_30d, p.last_order_at, p.created_at,
           p.owner_email, p.total_count
    from page p
    order by
      case when p_sort='health' and     v_asc then p.health_score end asc,
      case when p_sort='health' and not v_asc then p.health_score end desc,
      case when p_sort='mrr'    and     v_asc then p.mrr end asc,
      case when p_sort='mrr'    and not v_asc then p.mrr end desc,
      case when p_sort='orders' and     v_asc then p.orders_30d end asc,
      case when p_sort='orders' and not v_asc then p.orders_30d end desc,
      case when p_sort='name'   and     v_asc then p.name end asc,
      case when p_sort='name'   and not v_asc then p.name end desc,
      p.created_at desc;
end; $$;

grant  execute on function public.admin_list_restaurants(text,text,text,text,int,int) to authenticated;
revoke execute on function public.admin_list_restaurants(text,text,text,text,int,int) from public, anon;
