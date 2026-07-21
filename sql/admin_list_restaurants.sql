-- خدمة المشرف: قائمة المطاعم (قراءة) — M1.4 + ترقيم/بحث خادمي (Super Admin)
-- SECURITY DEFINER مبوّبة بـ is_platform_admin() (raise إن لم يكن مشرفاً).
-- نمط قالبي لكل خدمات المشرف: المشرف لا يصل جداول المستأجرين مباشرة، فقط عبر دوال كهذه.
--
-- التصميم (قابلية التوسّع لآلاف المطاعم):
--   • بحث + ترقيم خادمي (p_search/p_limit/p_offset)، الحدّ مقيّد 1..100.
--   • total_count عبر count(*) over() (يُحسب قبل LIMIT) للترقيم في الواجهة.
--   • عدّ الطلبات/الفروع بعد الترقيم (CTE page) فيُحسب لصفوف الصفحة فقط —
--     لا مسح كامل لجدولي orders/branches في كل استدعاء (يستفيد من فهرس orders(restaurant_id,...)).
--   • يُرجع platform_suspended (كان يُرجعه المنشور — إصلاح انحراف الملف عن المنشور).

drop function if exists public.admin_list_restaurants();
drop function if exists public.admin_list_restaurants(text, int, int);

create or replace function public.admin_list_restaurants(
  p_search text default null,
  p_limit  int  default 25,
  p_offset int  default 0
)
returns table (id uuid, name text, slug text, is_active boolean, platform_suspended boolean,
               subscription_plan text, created_at timestamptz, owner_email text,
               branches_count int, orders_count int, total_count bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_limit  int := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  return query
    with page as (
      select r.id, r.name, r.slug, r.is_active, r.platform_suspended, r.subscription_plan,
             r.created_at, u.email::text as owner_email,
             count(*) over() as total_count
      from restaurants r
      left join auth.users u on u.id = r.owner_id
      where v_search is null
         or r.name  ilike '%'||v_search||'%'
         or r.slug  ilike '%'||v_search||'%'
         or u.email ilike '%'||v_search||'%'
      order by r.created_at desc
      limit v_limit offset v_offset
    )
    select p.id, p.name, p.slug, p.is_active, p.platform_suspended, p.subscription_plan,
           p.created_at, p.owner_email,
           (select count(*) from branches b where b.restaurant_id = p.id)::int,
           (select count(*) from orders   o where o.restaurant_id = p.id)::int,
           p.total_count
    from page p
    order by p.created_at desc;
end; $$;

grant  execute on function public.admin_list_restaurants(text,int,int) to authenticated;
revoke execute on function public.admin_list_restaurants(text,int,int) from public, anon;
