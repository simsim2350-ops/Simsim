-- أول خدمة مشرف (Admin Service): قائمة المطاعم للقراءة فقط — M1.4 (Super Admin)
-- SECURITY DEFINER مبوّبة بـ is_platform_admin() (raise إن لم يكن مشرفاً). نُفِّذ في Supabase ✅
-- نمط قالبي لكل خدمات المشرف: المشرف لا يصل جداول المستأجرين مباشرة، فقط عبر دوال كهذه.
create or replace function public.admin_list_restaurants()
returns table (id uuid, name text, slug text, is_active boolean, subscription_plan text,
               created_at timestamptz, owner_email text, branches_count int, orders_count int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  return query
    select r.id, r.name, r.slug, r.is_active, r.subscription_plan, r.created_at,
           u.email::text,
           coalesce(bc.cnt,0)::int, coalesce(oc.cnt,0)::int
    from restaurants r
    left join auth.users u on u.id = r.owner_id
    left join (select restaurant_id, count(*) cnt from branches group by 1) bc on bc.restaurant_id = r.id
    left join (select restaurant_id, count(*) cnt from orders   group by 1) oc on oc.restaurant_id = r.id
    order by r.created_at desc;
end; $$;
grant execute on function public.admin_list_restaurants() to authenticated;
revoke execute on function public.admin_list_restaurants() from public, anon;
