-- ============================================================================
-- Expose is_public/public_label through admin_list_capabilities
-- ============================================================================
-- The Admin Plans feature selector needs to show, per capability: its
-- internal name, whether it's public-eligible, and its curated public label
-- (to preview exactly what customers will see). Both columns already exist
-- on feature_flags (marketing_plans_public_features_v1.sql); this migration
-- only extends the existing admin-only listing RPC to return them.
--
-- Postgres requires DROP before changing a function's RETURNS TABLE shape;
-- grants are re-applied identically to the pre-existing ones (authenticated
-- only, explicitly revoked from public/anon) — no change to who can call it.

drop function if exists public.admin_list_capabilities();

create function public.admin_list_capabilities()
returns table (
  key text, name text, description text, category_key text, module text, parent_key text,
  kind text, type text, scope text, lifecycle_status text, runtime_status text,
  version int, deprecated boolean, sort_order int, icon text,
  deps_count int, plans_count int, overrides_count int,
  is_public boolean, public_label text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  return query
    select f.key, f.name, f.description, c.key, f.module, f.parent_key,
           f.kind, f.type, f.scope, f.lifecycle_status, f.runtime_status,
           f.version, f.deprecated, f.sort_order, f.icon,
           (select count(*) from feature_dependencies d where d.feature_key = f.key)::int,
           (select count(*) from plan_features pf where pf.feature_key = f.key)::int,
           (select count(*) from restaurant_feature_overrides o where o.key = f.key)::int,
           f.is_public, f.public_label
    from feature_flags f left join feature_categories c on c.id = f.category_id
    order by f.sort_order, f.key;
end; $$;

grant execute on function public.admin_list_capabilities() to authenticated;
revoke execute on function public.admin_list_capabilities() from public, anon;
