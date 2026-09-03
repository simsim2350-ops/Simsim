-- ============================================================================
-- Public feature labels for marketing pricing (Plans ↔ Capability Registry)
-- ============================================================================
-- Adds is_public/public_label to feature_flags so marketing_public_plans can
-- surface curated, customer-facing feature bullets instead of internal
-- admin-navigation labels. Source of truth stays features.manifest.js →
-- admin_sync_capabilities → admin_upsert_capability (mechanism unchanged,
-- only its column list grows). Both new columns are additive/defaulted —
-- zero behavior change for existing rows until explicitly curated.

alter table public.feature_flags
  add column if not exists is_public boolean not null default false,
  add column if not exists public_label text;

comment on column public.feature_flags.is_public is
  'Opts this capability into the public marketing pricing feed (marketing_public_plans). Curated via features.manifest.js, not runtime-editable.';
comment on column public.feature_flags.public_label is
  'Customer-facing label for marketing_public_plans. For type=limit rows this holds the countable noun (e.g. "فرع"), formatted into "حتى N فرع" by the RPC. Falls back to feature_flags.name only when unset — never exposes the raw feature_key.';

-- ============================================================================
-- admin_upsert_capability: carry is_public/public_label through the same
-- manifest-sync upsert used for every other feature_flags column.
-- ============================================================================
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
    required_permissions,enabled_global,is_public,public_label,created_by,updated_by)
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
    coalesce((p->>'enabled_global')::boolean,false),
    coalesce((p->>'is_public')::boolean,false), p->>'public_label',
    auth.uid(), auth.uid())
  on conflict(key) do update set
    name=excluded.name, description=excluded.description, category_id=excluded.category_id,
    module=excluded.module, parent_key=excluded.parent_key, kind=excluded.kind, type=excluded.type,
    scope=excluded.scope, default_value=excluded.default_value, allowed_values=excluded.allowed_values,
    metric=excluded.metric, unit=excluded.unit, lifecycle_status=excluded.lifecycle_status,
    runtime_status=excluded.runtime_status, version=excluded.version,
    compatibility_version=excluded.compatibility_version, supersedes=excluded.supersedes,
    deprecated=excluded.deprecated, icon=excluded.icon, upgrade_message=excluded.upgrade_message,
    sort_order=excluded.sort_order, tags=excluded.tags, required_permissions=excluded.required_permissions,
    enabled_global=excluded.enabled_global, is_public=excluded.is_public, public_label=excluded.public_label,
    updated_by=auth.uid(), updated_at=now();
  perform public.log_platform_action(case when v_old is null then 'capability.create' else 'capability.update' end,
    'capability', null, v_old, jsonb_build_object('key',v_key));
  return v_key;
end; $$;

-- ============================================================================
-- marketing_public_plans: only is_public=true AND is_included=true features,
-- using public_label (never the internal name). Limit-type values are
-- formatted into customer-friendly Arabic text: "حتى N {label}" when a value
-- is set, "{label} غير محدود" when the plan grants it with no cap (value is
-- null but the row is explicitly included). Anonymous-safe: SECURITY DEFINER,
-- reads only public.plans/plan_features/feature_flags, exposes no admin data.
-- ============================================================================
create or replace function public.marketing_public_plans(p_locale text default 'ar')
returns jsonb language sql stable security definer set search_path = 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'billingCycle', p.billing_cycle,
    'price', p.price,
    'sortOrder', p.sort_order,
    'features', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', pf.feature_key,
        'name', case
          when ff.type = 'limit' then case
            when pf.value is null then coalesce(ff.public_label, ff.name) || ' غير محدود'
            else 'حتى ' || to_char((pf.value #>> '{}')::numeric, 'FM999,999,999') || ' ' || coalesce(ff.public_label, ff.name)
          end
          else coalesce(ff.public_label, ff.name)
        end,
        'included', pf.is_included,
        'value', pf.value
      ) order by ff.sort_order, pf.feature_key)
      from public.plan_features pf
      join public.feature_flags ff on ff.key = pf.feature_key
      where pf.plan_id = p.id and pf.is_included = true and ff.is_public = true
    ), '[]'::jsonb)
  ) order by p.sort_order, p.name), '[]'::jsonb)
  from public.plans p
  where p.is_active = true;
$$;
