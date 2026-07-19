-- تعليق المطعم على مستوى المنصّة (لا يقدر المالك فكّه) — إصلاح M3 (Super Admin)
-- المشكلة: زر تعليق المشرف كان يغيّر is_active (تحكّم المالك نفسه) فيعيد المالك تفعيله.
-- الحل: علم منفصل platform_suspended يتحكّم به المشرف فقط + فرض خادمي على إنشاء الطلب.
-- نُفِّذ في Supabase ✅ (اختُبر بمعاملة rollback: تعليق يعمل، طلب يُرفض، مالك غير مشرف يُمنع).

-- 1) العمود
alter table public.restaurants add column if not exists platform_suspended boolean not null default false;

-- 2) Trigger حارس: لا يغيّر platform_suspended إلا مشرف منصّة (يحمي من تحديث المالك المباشر)
create or replace function public.protect_platform_suspended() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.platform_suspended is distinct from old.platform_suspended
     and not public.is_platform_admin() then
    raise exception 'platform_suspended can only be changed by a platform admin';
  end if;
  return new;
end; $$;
drop trigger if exists trg_protect_platform_suspended on public.restaurants;
create trigger trg_protect_platform_suspended before update on public.restaurants
  for each row execute function public.protect_platform_suspended();

-- 3) RPC المشرف (يستبدل admin_set_restaurant_active) + Audit
create or replace function public.admin_set_platform_suspended(p_restaurant_id uuid, p_suspended boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare old_val boolean;
begin
  if not public.platform_admin_can('manage_restaurants') then raise exception 'forbidden'; end if;
  select platform_suspended into old_val from restaurants where id = p_restaurant_id;
  if not found then raise exception 'restaurant not found'; end if;
  update restaurants set platform_suspended = p_suspended where id = p_restaurant_id;
  perform public.log_platform_action('restaurant.set_platform_suspended', 'restaurant', p_restaurant_id,
          jsonb_build_object('platform_suspended', old_val), jsonb_build_object('platform_suspended', p_suspended));
  return p_suspended;
end; $$;
grant execute on function public.admin_set_platform_suspended(uuid,boolean) to authenticated;
revoke execute on function public.admin_set_platform_suspended(uuid,boolean) from public, anon;
drop function if exists public.admin_set_restaurant_active(uuid, boolean);

-- 4) الفرض الخادمي: منع إنشاء الطلب لو المطعم معلَّق من المنصّة
--    (تأهيل r.id مهم: العمود المُخرَج id يتعارض معه وإلا) — راجع sql/create_order_rpc.sql للنسخة الكاملة المحدَّثة.
-- 5) admin_list_restaurants / admin_get_restaurant حُدِّثتا لإرجاع platform_suspended (راجع ملفّيهما).
