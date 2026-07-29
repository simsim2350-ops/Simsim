-- ============================================================================
-- PCR — M7: أدوار الموظفين (Manager/Cashier) — تفعيل feature_permissions (UI-soft)
-- ============================================================================
-- قرارات المالك: أدوار ثابتة {manager,cashier,staff} (owner ضمني عبر restaurants.owner_id)
-- · الدور = قالب افتراضي لـallowed_pages مع تخصيص ممكن (هجين) · فرض UI-soft (لا RLS)
-- · صلاحيات إجراءات الطلبات خارج النطاق (ADR-24، قرار منفصل).
--
-- هذا الملف صغير ومحايد: (1) قيد قيمة role (NOT VALID، الصفوف الحالية 'staff' صالحة)
-- (2) توسعة effective_features لتُرجع required_permissions لكل قدرة (لتفعيل فحص الدور
--     بالواجهة عبر canAccess). تغيير إضافي بحت — لا يمسّ has_feature ولا القيَم.
-- ============================================================================

-- 1) قيد قيمة الدور (NOT VALID — لا يمسّ الصفوف القائمة)
alter table public.restaurant_members drop constraint if exists rm_role_valid;
alter table public.restaurant_members add constraint rm_role_valid
  check (role in ('manager','cashier','staff')) not valid;

-- 2) effective_features تُرجع أيضاً required_permissions (إضافة حقل — بقية السلوك مطابق)
create or replace function public.effective_features(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.has_restaurant_access(p_restaurant_id) or public.is_platform_admin()) then
    raise exception 'access denied';
  end if;
  return (
    select coalesce(jsonb_object_agg(f.key, jsonb_build_object(
      'value',                public.feature_value(p_restaurant_id, f.key),
      'type',                 f.type,
      'scope',                f.scope,
      'kind',                 f.kind,
      'parent_key',           f.parent_key,
      'lifecycle_status',     f.lifecycle_status,
      'runtime_status',       f.runtime_status,
      'name',                 f.name,
      'upgrade_message',      f.upgrade_message,
      'required_permissions', to_jsonb(f.required_permissions)
    )), '{}'::jsonb)
    from public.feature_flags f
    where f.lifecycle_status <> 'archived'
  );
end;
$$;

grant  execute on function public.effective_features(uuid) to authenticated;
revoke execute on function public.effective_features(uuid) from public, anon;

-- ============================================================================
-- نهاية M7 (خلفية). الباقي كود عميل: permissions.js (أدوار/قوالب + فحص الدور)
-- · Staff.jsx (اختيار الدور + تطبيق القالب) · AppShell/RequirePage (تمرير الدور).
-- ============================================================================
