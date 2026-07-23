-- «الحالة التشغيلية» للمطعم (Super Admin) — تشخيص دعم للقراءة فقط، بلا بيانات عملاء فردية.
-- Lazy: تُستدعى عند فتح التبويب فقط. SECURITY DEFINER مبوّبة بـ is_platform_admin().
create or replace function public.admin_restaurant_operational(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  select jsonb_build_object(
    'menu', (
      select jsonb_build_object(
        'categories',         (select count(*) from categories c where c.restaurant_id = p_restaurant_id),
        'products_total',     count(*),
        'products_available', count(*) filter (where p.is_available is true),
        'products_hidden',    count(*) filter (where p.is_available is not true),
        'uncategorized',      count(*) filter (where p.category_id is null),
        'missing_price',      count(*) filter (where p.price = 0),
        'missing_image',      count(*) filter (where coalesce(p.image_url,'') = '')
      )
      from products p where p.restaurant_id = p_restaurant_id
    ),
    'config', (
      select jsonb_build_object(
        'slug',               r.slug,
        'currency',           r.currency,
        'is_active',          r.is_active,
        'platform_suspended', r.platform_suspended,
        'has_logo',           coalesce(r.logo_url,'') <> '',
        'has_phone',          coalesce(r.phone,'')    <> '',
        'has_address',        coalesce(r.address,'')  <> '',
        'branches_total',     (select count(*) from branches b where b.restaurant_id = r.id),
        'branches_active',    (select count(*) from branches b where b.restaurant_id = r.id and b.is_active and not coalesce(b.is_paused,false))
      )
      from restaurants r where r.id = p_restaurant_id
    )
  ) into result;
  return result;
end; $$;
grant  execute on function public.admin_restaurant_operational(uuid) to authenticated;
revoke execute on function public.admin_restaurant_operational(uuid) from public, anon;
