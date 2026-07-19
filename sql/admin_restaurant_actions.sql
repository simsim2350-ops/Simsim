-- إجراءات إدارة المطاعم (كتابة) — M3.2 (Super Admin)
-- مبوّبة بـ platform_admin_can('manage_restaurants') (يمرّ super_admin، يُمنع read_only).
-- كل إجراء يسجّل Audit ذرّياً داخل نفس المعاملة. نُفِّذ في Supabase ✅ (اختُبر بمعاملة rollback).

create or replace function public.admin_set_restaurant_active(p_restaurant_id uuid, p_active boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare old_val boolean;
begin
  if not public.platform_admin_can('manage_restaurants') then raise exception 'forbidden'; end if;
  select is_active into old_val from restaurants where id = p_restaurant_id;
  if old_val is null then raise exception 'restaurant not found'; end if;
  update restaurants set is_active = p_active where id = p_restaurant_id;
  perform public.log_platform_action('restaurant.set_active', 'restaurant', p_restaurant_id,
          jsonb_build_object('is_active', old_val), jsonb_build_object('is_active', p_active));
  return p_active;
end; $$;

create or replace function public.admin_set_restaurant_plan(p_restaurant_id uuid, p_plan text)
returns text language plpgsql security definer set search_path = public as $$
declare old_val text;
begin
  if not public.platform_admin_can('manage_restaurants') then raise exception 'forbidden'; end if;
  if coalesce(trim(p_plan),'') = '' then raise exception 'plan required'; end if;
  select subscription_plan into old_val from restaurants where id = p_restaurant_id;
  if not found then raise exception 'restaurant not found'; end if;
  update restaurants set subscription_plan = p_plan where id = p_restaurant_id;
  perform public.log_platform_action('restaurant.set_plan', 'restaurant', p_restaurant_id,
          jsonb_build_object('plan', old_val), jsonb_build_object('plan', p_plan));
  return p_plan;
end; $$;

grant execute on function public.admin_set_restaurant_active(uuid,boolean) to authenticated;
grant execute on function public.admin_set_restaurant_plan(uuid,text)     to authenticated;
revoke execute on function public.admin_set_restaurant_active(uuid,boolean) from public, anon;
revoke execute on function public.admin_set_restaurant_plan(uuid,text)     from public, anon;
