-- Phase 2: إدارة Feature Flags (المزايا) — فوق البنية القائمة (feature_flags + has_feature).
-- قراءة: is_platform_admin · كتابة: platform_admin_can('manage_flags') + Audit ذرّي.
create or replace function public.admin_list_feature_flags()
returns table (key text, description text, enabled_global boolean, overrides_count int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  return query
    select f.key, f.description, f.enabled_global,
           (select count(*) from restaurant_feature_overrides o where o.key = f.key)::int
    from feature_flags f order by f.key;
end; $$;

create or replace function public.admin_upsert_feature_flag(p_key text, p_description text, p_enabled_global boolean)
returns text language plpgsql security definer set search_path = public as $$
declare v_old jsonb;
begin
  if not public.platform_admin_can('manage_flags') then raise exception 'forbidden'; end if;
  if coalesce(trim(p_key),'') = '' then raise exception 'key required'; end if;
  select to_jsonb(f) into v_old from feature_flags f where f.key = p_key;
  insert into feature_flags(key, description, enabled_global)
  values (p_key, p_description, coalesce(p_enabled_global,false))
  on conflict (key) do update set description = excluded.description, enabled_global = excluded.enabled_global;
  perform public.log_platform_action(case when v_old is null then 'flag.create' else 'flag.update' end,
    'flag', null, v_old, jsonb_build_object('key',p_key,'enabled_global',p_enabled_global));
  return p_key;
end; $$;

create or replace function public.admin_delete_feature_flag(p_key text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.platform_admin_can('manage_flags') then raise exception 'forbidden'; end if;
  if not exists(select 1 from feature_flags where key = p_key) then raise exception 'flag not found'; end if;
  delete from feature_flags where key = p_key;  -- overrides تُحذف بالـcascade
  perform public.log_platform_action('flag.delete','flag', null, jsonb_build_object('key',p_key), null);
  return true;
end; $$;

-- تخصيص لكل مطعم: p_enabled null = إزالة التخصيص (وراثة العام)
create or replace function public.admin_set_feature_override(p_key text, p_restaurant_id uuid, p_enabled boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.platform_admin_can('manage_flags') then raise exception 'forbidden'; end if;
  if not exists(select 1 from feature_flags where key = p_key) then raise exception 'flag not found'; end if;
  if p_enabled is null then
    delete from restaurant_feature_overrides where key = p_key and restaurant_id = p_restaurant_id;
  else
    insert into restaurant_feature_overrides(restaurant_id, key, enabled)
    values (p_restaurant_id, p_key, p_enabled)
    on conflict (restaurant_id, key) do update set enabled = excluded.enabled;
  end if;
  perform public.log_platform_action('flag.override','flag', p_restaurant_id, null, jsonb_build_object('key',p_key,'enabled',p_enabled));
  return true;
end; $$;

create or replace function public.admin_list_feature_overrides(p_key text)
returns table (restaurant_id uuid, restaurant_name text, enabled boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  return query
    select o.restaurant_id, r.name, o.enabled
    from restaurant_feature_overrides o join restaurants r on r.id = o.restaurant_id
    where o.key = p_key order by r.name;
end; $$;

grant  execute on function public.admin_list_feature_flags()                          to authenticated;
grant  execute on function public.admin_upsert_feature_flag(text,text,boolean)         to authenticated;
grant  execute on function public.admin_delete_feature_flag(text)                      to authenticated;
grant  execute on function public.admin_set_feature_override(text,uuid,boolean)        to authenticated;
grant  execute on function public.admin_list_feature_overrides(text)                   to authenticated;
revoke execute on function public.admin_list_feature_flags()                          from public, anon;
revoke execute on function public.admin_upsert_feature_flag(text,text,boolean)         from public, anon;
revoke execute on function public.admin_delete_feature_flag(text)                      from public, anon;
revoke execute on function public.admin_set_feature_override(text,uuid,boolean)        from public, anon;
revoke execute on function public.admin_list_feature_overrides(text)                   from public, anon;
