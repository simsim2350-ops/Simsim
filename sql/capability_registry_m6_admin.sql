-- ============================================================================
-- PCR — M6.1: خلفية لوحة إدارة الكتالوج (Super Admin) — ADR-40
-- ============================================================================
-- دوال admin_* مبوّبة: قراءة is_platform_admin · كتابة platform_admin_can('manage_flags')
-- + Audit ذرّي (log_platform_action). البوابة أول بيان بعد begin (يفرضه حارس ADR-28).
-- تدير: الكتالوج (قدرات/فئات) · التبعيات · ربط الباقات · overrides المطعم · مزامنة Manifest.
-- ============================================================================

-- ============================ قراءة ============================

-- الفئات
create or replace function public.admin_list_capability_categories()
returns table (key text, name text, name_en text, description text, icon text, sort_order int, capabilities_count int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  return query
    select c.key, c.name, c.name_en, c.description, c.icon, c.sort_order,
           (select count(*) from feature_flags f where f.category_id = c.id)::int
    from feature_categories c order by c.sort_order, c.name;
end; $$;

-- الكتالوج الكامل (للشجرة/الفلاتر) — مع عدّ التبعيات/الباقات/التخصيصات
create or replace function public.admin_list_capabilities()
returns table (
  key text, name text, description text, category_key text, module text, parent_key text,
  kind text, type text, scope text, lifecycle_status text, runtime_status text,
  version int, deprecated boolean, sort_order int, icon text,
  deps_count int, plans_count int, overrides_count int
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
           (select count(*) from restaurant_feature_overrides o where o.key = f.key)::int
    from feature_flags f left join feature_categories c on c.id = f.category_id
    order by f.sort_order, f.key;
end; $$;

-- تفاصيل قدرة واحدة (للوحة التحرير) — القدرة + تبعياتها + الباقات المرتبطة + عدد التخصيصات
create or replace function public.admin_capability_detail(p_key text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  select jsonb_build_object(
    'capability', (select to_jsonb(f) - 'category_id' || jsonb_build_object(
                     'category_key', (select key from feature_categories c where c.id = f.category_id))
                   from feature_flags f where f.key = p_key),
    'dependencies', coalesce((select jsonb_agg(jsonb_build_object(
                       'depends_on_key', d.depends_on_key, 'dependency_type', d.dependency_type))
                     from feature_dependencies d where d.feature_key = p_key), '[]'::jsonb),
    'plans', coalesce((select jsonb_agg(jsonb_build_object(
                'plan_id', pf.plan_id, 'plan_name', p.name, 'is_included', pf.is_included, 'value', pf.value))
              from plan_features pf join plans p on p.id = pf.plan_id where pf.feature_key = p_key), '[]'::jsonb),
    'overrides_count', (select count(*) from restaurant_feature_overrides o where o.key = p_key)
  ) into v;
  return v;
end; $$;

-- ============================ كتابة: القدرات ============================

create or replace function public.admin_upsert_capability(p jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_key text := p->>'key'; v_old jsonb;
begin
  if not public.platform_admin_can('manage_flags') then raise exception 'forbidden'; end if;
  if v_key is null or v_key !~ '^[a-z][a-z0-9_]*(@[0-9]+)?$' then raise exception 'invalid key (snake_case required)'; end if;
  select to_jsonb(f) into v_old from feature_flags f where key = v_key;
  insert into feature_flags(key,name,description,category_id,module,parent_key,kind,type,scope,
    default_value,allowed_values,metric,unit,lifecycle_status,runtime_status,version,
    compatibility_version,supersedes,deprecated,icon,upgrade_message,sort_order,tags,
    required_permissions,enabled_global,created_by,updated_by)
  values (
    v_key, p->>'name', p->>'description',
    (select id from feature_categories where key = p->>'category_key'),
    p->>'module', nullif(p->>'parent_key',''), p->>'kind',
    coalesce(p->>'type','feature'), coalesce(p->>'scope','restaurant'),
    p->'default_value', p->'allowed_values', p->>'metric', p->>'unit',
    coalesce(p->>'lifecycle_status','active'), coalesce(p->>'runtime_status','enabled'),
    coalesce((p->>'version')::int,1), p->>'compatibility_version', nullif(p->>'supersedes',''),
    coalesce((p->>'deprecated')::boolean,false), p->>'icon', p->>'upgrade_message',
    coalesce((p->>'sort_order')::int,0),
    coalesce((select array_agg(value) from jsonb_array_elements_text(p->'tags')), '{}'),
    coalesce((select array_agg(value) from jsonb_array_elements_text(p->'required_permissions')), '{}'),
    coalesce((p->>'enabled_global')::boolean,false), auth.uid(), auth.uid())
  on conflict(key) do update set
    name=excluded.name, description=excluded.description, category_id=excluded.category_id,
    module=excluded.module, parent_key=excluded.parent_key, kind=excluded.kind, type=excluded.type,
    scope=excluded.scope, default_value=excluded.default_value, allowed_values=excluded.allowed_values,
    metric=excluded.metric, unit=excluded.unit, lifecycle_status=excluded.lifecycle_status,
    runtime_status=excluded.runtime_status, version=excluded.version,
    compatibility_version=excluded.compatibility_version, supersedes=excluded.supersedes,
    deprecated=excluded.deprecated, icon=excluded.icon, upgrade_message=excluded.upgrade_message,
    sort_order=excluded.sort_order, tags=excluded.tags, required_permissions=excluded.required_permissions,
    enabled_global=excluded.enabled_global, updated_by=auth.uid(), updated_at=now();
  perform public.log_platform_action(case when v_old is null then 'capability.create' else 'capability.update' end,
    'capability', null, v_old, jsonb_build_object('key',v_key));
  return v_key;
end; $$;

create or replace function public.admin_delete_capability(p_key text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.platform_admin_can('manage_flags') then raise exception 'forbidden'; end if;
  if not exists(select 1 from feature_flags where key = p_key) then raise exception 'capability not found'; end if;
  delete from feature_flags where key = p_key;  -- deps/plan_features/overrides تُحذف بالـcascade
  perform public.log_platform_action('capability.delete','capability', null, jsonb_build_object('key',p_key), null);
  return true;
end; $$;

-- ============================ كتابة: الفئات ============================

create or replace function public.admin_upsert_capability_category(p jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_key text := p->>'key'; v_old jsonb;
begin
  if not public.platform_admin_can('manage_flags') then raise exception 'forbidden'; end if;
  if v_key is null or v_key !~ '^[a-z][a-z0-9_]*$' then raise exception 'invalid key (snake_case required)'; end if;
  select to_jsonb(c) into v_old from feature_categories c where key = v_key;
  insert into feature_categories(key,name,name_en,description,icon,sort_order,created_by,updated_by)
  values (v_key, p->>'name', p->>'name_en', p->>'description', p->>'icon',
          coalesce((p->>'sort_order')::int,0), auth.uid(), auth.uid())
  on conflict(key) do update set name=excluded.name, name_en=excluded.name_en,
    description=excluded.description, icon=excluded.icon, sort_order=excluded.sort_order,
    updated_by=auth.uid(), updated_at=now();
  perform public.log_platform_action(case when v_old is null then 'capability_category.create' else 'capability_category.update' end,
    'capability_category', null, v_old, jsonb_build_object('key',v_key));
  return v_key;
end; $$;

create or replace function public.admin_delete_capability_category(p_key text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.platform_admin_can('manage_flags') then raise exception 'forbidden'; end if;
  if exists(select 1 from feature_flags where category_id = (select id from feature_categories where key = p_key))
    then raise exception 'category has capabilities — reassign first'; end if;
  delete from feature_categories where key = p_key;
  perform public.log_platform_action('capability_category.delete','capability_category', null, jsonb_build_object('key',p_key), null);
  return true;
end; $$;

-- ============================ كتابة: التبعيات ============================

create or replace function public.admin_set_capability_dependency(p_feature text, p_depends_on text, p_type text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.platform_admin_can('manage_flags') then raise exception 'forbidden'; end if;
  if p_feature = p_depends_on then raise exception 'a capability cannot depend on itself'; end if;
  if coalesce(p_type,'required') not in ('required','optional','conflicts') then raise exception 'invalid dependency_type'; end if;
  insert into feature_dependencies(feature_key, depends_on_key, dependency_type, created_by)
  values (p_feature, p_depends_on, coalesce(p_type,'required'), auth.uid())
  on conflict(feature_key, depends_on_key, dependency_type) do nothing;
  perform public.log_platform_action('capability_dependency.set','capability', null, null,
    jsonb_build_object('feature',p_feature,'depends_on',p_depends_on,'type',p_type));
  return true;
end; $$;

create or replace function public.admin_delete_capability_dependency(p_feature text, p_depends_on text, p_type text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.platform_admin_can('manage_flags') then raise exception 'forbidden'; end if;
  delete from feature_dependencies where feature_key = p_feature and depends_on_key = p_depends_on
    and dependency_type = coalesce(p_type,'required');
  perform public.log_platform_action('capability_dependency.delete','capability', null,
    jsonb_build_object('feature',p_feature,'depends_on',p_depends_on,'type',p_type), null);
  return true;
end; $$;

-- ============================ كتابة: ربط الباقات ============================

create or replace function public.admin_set_plan_feature(p_plan_id uuid, p_feature_key text, p_is_included boolean, p_value jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.platform_admin_can('manage_flags') then raise exception 'forbidden'; end if;
  if not exists(select 1 from plans where id = p_plan_id) then raise exception 'plan not found'; end if;
  if not exists(select 1 from feature_flags where key = p_feature_key) then raise exception 'capability not found'; end if;
  insert into plan_features(plan_id, feature_key, is_included, value, created_by, updated_by)
  values (p_plan_id, p_feature_key, coalesce(p_is_included,true), p_value, auth.uid(), auth.uid())
  on conflict(plan_id, feature_key) do update set
    is_included=excluded.is_included, value=excluded.value, updated_by=auth.uid(), updated_at=now();
  perform public.log_platform_action('plan_feature.set','plan', p_plan_id, null,
    jsonb_build_object('feature',p_feature_key,'is_included',p_is_included,'value',p_value));
  return true;
end; $$;

create or replace function public.admin_delete_plan_feature(p_plan_id uuid, p_feature_key text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.platform_admin_can('manage_flags') then raise exception 'forbidden'; end if;
  delete from plan_features where plan_id = p_plan_id and feature_key = p_feature_key;
  perform public.log_platform_action('plan_feature.delete','plan', p_plan_id,
    jsonb_build_object('feature',p_feature_key), null);
  return true;
end; $$;

-- ============================ كتابة: تخصيص المطعم (مُنمَّط) ============================
-- p_value = null → إزالة التخصيص (وراثة الباقة/الافتراضي). النوع feature يُخزَّن في enabled.

create or replace function public.admin_set_capability_override(p_restaurant_id uuid, p_key text, p_value jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_type text;
begin
  if not public.platform_admin_can('manage_flags') then raise exception 'forbidden'; end if;
  select type into v_type from feature_flags where key = p_key;
  if v_type is null then raise exception 'capability not found'; end if;
  if p_value is null then
    delete from restaurant_feature_overrides where key = p_key and restaurant_id = p_restaurant_id;
  else
    insert into restaurant_feature_overrides(restaurant_id, key, enabled, value, created_by, updated_by)
    values (p_restaurant_id, p_key,
            case when v_type = 'feature' then (p_value = to_jsonb(true)) else null end,
            case when v_type = 'feature' then null else p_value end, auth.uid(), auth.uid())
    on conflict(restaurant_id, key) do update set
      enabled = case when v_type = 'feature' then (p_value = to_jsonb(true)) else null end,
      value   = case when v_type = 'feature' then null else p_value end,
      updated_by = auth.uid(), updated_at = now();
  end if;
  perform public.log_platform_action('capability_override.set','capability', p_restaurant_id, null,
    jsonb_build_object('key',p_key,'value',p_value));
  return true;
end; $$;

-- ============================ مزامنة Manifest (bulk upsert) ============================
-- تستقبل { categories:[...], capabilities:[...], dependencies:[...] } وتُطبّقها UPSERT.
-- نقطة المزامنة الوحيدة من الكود للـDB (تُستدعى من أداة إدارية أو سكربت مؤقت للمشرف).

create or replace function public.admin_sync_capabilities(p_manifest jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c jsonb; n_cat int := 0; n_cap int := 0; n_dep int := 0;
begin
  if not public.platform_admin_can('manage_flags') then raise exception 'forbidden'; end if;
  for c in select * from jsonb_array_elements(coalesce(p_manifest->'categories','[]'::jsonb)) loop
    perform public.admin_upsert_capability_category(c); n_cat := n_cat + 1;
  end loop;
  for c in select * from jsonb_array_elements(coalesce(p_manifest->'capabilities','[]'::jsonb)) loop
    perform public.admin_upsert_capability(c); n_cap := n_cap + 1;
  end loop;
  for c in select * from jsonb_array_elements(coalesce(p_manifest->'dependencies','[]'::jsonb)) loop
    perform public.admin_set_capability_dependency(c->>'feature', c->>'depends_on', c->>'type'); n_dep := n_dep + 1;
  end loop;
  perform public.log_platform_action('capabilities.sync','capability', null, null,
    jsonb_build_object('categories',n_cat,'capabilities',n_cap,'dependencies',n_dep));
  return jsonb_build_object('categories',n_cat,'capabilities',n_cap,'dependencies',n_dep);
end; $$;

-- ============================ الأذونات ============================
-- كلها للـauthenticated (الواجهة تستدعيها)، والخادم يفرض البوابة. إلغاء anon/public.
grant  execute on function public.admin_list_capability_categories()                         to authenticated;
grant  execute on function public.admin_list_capabilities()                                  to authenticated;
grant  execute on function public.admin_capability_detail(text)                              to authenticated;
grant  execute on function public.admin_upsert_capability(jsonb)                             to authenticated;
grant  execute on function public.admin_delete_capability(text)                              to authenticated;
grant  execute on function public.admin_upsert_capability_category(jsonb)                    to authenticated;
grant  execute on function public.admin_delete_capability_category(text)                     to authenticated;
grant  execute on function public.admin_set_capability_dependency(text,text,text)            to authenticated;
grant  execute on function public.admin_delete_capability_dependency(text,text,text)         to authenticated;
grant  execute on function public.admin_set_plan_feature(uuid,text,boolean,jsonb)            to authenticated;
grant  execute on function public.admin_delete_plan_feature(uuid,text)                       to authenticated;
grant  execute on function public.admin_set_capability_override(uuid,text,jsonb)             to authenticated;
grant  execute on function public.admin_sync_capabilities(jsonb)                             to authenticated;

revoke execute on function public.admin_list_capability_categories()                         from public, anon;
revoke execute on function public.admin_list_capabilities()                                  from public, anon;
revoke execute on function public.admin_capability_detail(text)                              from public, anon;
revoke execute on function public.admin_upsert_capability(jsonb)                             from public, anon;
revoke execute on function public.admin_delete_capability(text)                              from public, anon;
revoke execute on function public.admin_upsert_capability_category(jsonb)                    from public, anon;
revoke execute on function public.admin_delete_capability_category(text)                     from public, anon;
revoke execute on function public.admin_set_capability_dependency(text,text,text)            from public, anon;
revoke execute on function public.admin_delete_capability_dependency(text,text,text)         from public, anon;
revoke execute on function public.admin_set_plan_feature(uuid,text,boolean,jsonb)            from public, anon;
revoke execute on function public.admin_delete_plan_feature(uuid,text)                       from public, anon;
revoke execute on function public.admin_set_capability_override(uuid,text,jsonb)             from public, anon;
revoke execute on function public.admin_sync_capabilities(jsonb)                             from public, anon;

-- ============================================================================
-- نهاية M6.1 (الخلفية). الواجهة = M6.2 (وحدة admin/features/catalog كسولة).
-- كل الدوال admin_* تحرس نفسها بالبوابة كأول بيان — يغطّيها حارس ADR-28 تلقائياً.
-- ============================================================================
