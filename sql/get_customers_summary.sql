-- تجميع العملاء خادمياً (بدل تنزيل كل الطلبات للمتصفح) — M1 / الخيار A
-- SECURITY INVOKER: يخضع لـ RLS فيحترم نطاق فرع الموظف تلقائياً (ADR-18).
-- الدلالات مطابقة تماماً لمنطق Customers.jsx الحالي (تحقّق بمقارنة على البيانات الحيّة).
-- نُفِّذ في Supabase ✅
create or replace function public.get_customers_summary(p_restaurant_id uuid)
returns table (
  phone                  text,
  name                   text,
  order_count            int,
  total_spent            numeric,
  completed_spent        numeric,
  first_order_at         timestamptz,
  last_order_at          timestamptz,
  recent_orders_30       int,
  branch_counts          jsonb,
  most_ordered_branch_id uuid
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select trim(coalesce(customer_phone,'')) as phone, customer_name, status,
           total, branch_id, created_at
    from orders
    where restaurant_id = p_restaurant_id
      and trim(coalesce(customer_phone,'')) <> ''
  ),
  phones as (select distinct phone from base),
  all_bounds as (  -- شبكة أمان: عميل بطلبات ملغاة فقط يبقى ظاهراً (مطابق للسلوك الحالي)
    select phone, min(created_at) as min_all, max(created_at) as max_all
    from base group by phone
  ),
  stats as (select * from base where status <> 'cancelled'),  -- الإحصاءات من غير الملغاة فقط
  agg as (
    select phone,
      count(*)::int as order_count,
      coalesce(sum(total),0) as total_spent,
      coalesce(sum(total) filter (where status = 'completed'),0) as completed_spent,
      min(created_at) as first_stat,
      max(created_at) as last_stat,
      count(*) filter (where created_at >= now() - interval '30 days')::int as recent_orders_30
    from stats group by phone
  ),
  name_pick as (  -- آخر اسم غير فارغ أدخله العميل (الأحدث زمنياً)
    select distinct on (phone) phone, customer_name as name
    from base where customer_name is not null
    order by phone, created_at desc
  ),
  bc as (  -- عدد الطلبات لكل فرع + الفرع الأكثر طلباً
    select phone,
           jsonb_object_agg(branch_id::text, cnt) as branch_counts,
           (array_agg(branch_id order by cnt desc))[1] as most_ordered_branch_id
    from (select phone, branch_id, count(*) as cnt
          from stats where branch_id is not null group by phone, branch_id) g
    group by phone
  )
  select
    p.phone,
    n.name,
    coalesce(a.order_count,0),
    coalesce(a.total_spent,0),
    coalesce(a.completed_spent,0),
    coalesce(a.first_stat, ab.min_all) as first_order_at,
    coalesce(a.last_stat,  ab.max_all) as last_order_at,
    coalesce(a.recent_orders_30,0),
    coalesce(bc.branch_counts, '{}'::jsonb),
    bc.most_ordered_branch_id
  from phones p
  left join all_bounds ab on ab.phone = p.phone
  left join agg a         on a.phone  = p.phone
  left join name_pick n   on n.phone  = p.phone
  left join bc            on bc.phone = p.phone;
$$;

grant execute on function public.get_customers_summary(uuid) to authenticated;
