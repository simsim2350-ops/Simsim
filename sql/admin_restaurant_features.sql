-- المزايا الفعّالة لمطعم واحد (Super Admin) — تشخيص دعم للقراءة فقط.
-- لكل ميزة: الحالة الفعلية على هذا المطعم (override إن وُجد، وإلا العام) + هل هي مُخصّصة.
-- Lazy: تُستدعى عند فتح تبويب «الحالة التشغيلية». SECURITY DEFINER مبوّبة بـ is_platform_admin().
create or replace function public.admin_restaurant_features(p_restaurant_id uuid)
returns table (key text, description text, effective boolean, overridden boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  return query
    select f.key, f.description,
           coalesce(o.enabled, f.enabled_global) as effective,
           (o.restaurant_id is not null)         as overridden
    from feature_flags f
    left join restaurant_feature_overrides o
      on o.key = f.key and o.restaurant_id = p_restaurant_id
    order by f.key;
end; $$;
grant  execute on function public.admin_restaurant_features(uuid) to authenticated;
revoke execute on function public.admin_restaurant_features(uuid) from public, anon;
