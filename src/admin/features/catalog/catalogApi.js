import { supabase } from '../../../lib/supabase'
import { listPlans } from '../billing/billingApi'
import { CATEGORIES, CAPABILITIES, DEPENDENCIES } from '../../../registry/features.manifest'

// خدمة لوحة الكتالوج (Super Admin): كل وصول عبر دوال admin_* المبوّبة (M6.1).
const call = async (fn, args) => {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data
}

// ===== قراءة =====
export const listCategories   = () => call('admin_list_capability_categories').then((d) => d || [])
export const listCapabilities = () => call('admin_list_capabilities').then((d) => d || [])
export const capabilityDetail = (key) => call('admin_capability_detail', { p_key: key })
export { listPlans }

// ===== كتابة: قدرات/فئات =====
export const upsertCapability = (payload) => call('admin_upsert_capability', { p: payload })
export const deleteCapability = (key)     => call('admin_delete_capability', { p_key: key })
export const upsertCategory   = (payload) => call('admin_upsert_capability_category', { p: payload })
export const deleteCategory   = (key)     => call('admin_delete_capability_category', { p_key: key })

// ===== تبعيات =====
export const setDependency    = (feature, dependsOn, type) =>
  call('admin_set_capability_dependency', { p_feature: feature, p_depends_on: dependsOn, p_type: type })
export const deleteDependency = (feature, dependsOn, type) =>
  call('admin_delete_capability_dependency', { p_feature: feature, p_depends_on: dependsOn, p_type: type })

// ===== ربط الباقات =====
export const setPlanFeature    = (planId, key, isIncluded, value) =>
  call('admin_set_plan_feature', { p_plan_id: planId, p_feature_key: key, p_is_included: isIncluded, p_value: value })
export const deletePlanFeature = (planId, key) =>
  call('admin_delete_plan_feature', { p_plan_id: planId, p_feature_key: key })

// ===== تخصيص المطعم =====
export const listOverrides = (key) => call('admin_list_feature_overrides', { p_key: key }).then((d) => d || [])
export const setOverride   = (restaurantId, key, value) =>
  call('admin_set_capability_override', { p_restaurant_id: restaurantId, p_key: key, p_value: value })

// ===== مزامنة Manifest =====
export const syncCapabilities = (manifest) => call('admin_sync_capabilities', { p_manifest: manifest })

// تحويل الـManifest (مصدر الحقيقة) إلى حمولة المزامنة (أسماء أعمدة الـDB).
export function manifestSyncPayload() {
  return {
    categories: CATEGORIES.map((c) => ({
      key: c.key, name: c.name, name_en: c.name_en, icon: c.icon, sort_order: c.sort_order,
    })),
    capabilities: CAPABILITIES.map((c) => ({
      key: c.key, name: c.name, description: c.description ?? null, category_key: c.category ?? null,
      module: c.module ?? null, parent_key: c.parent ?? null, kind: c.kind ?? null,
      type: c.type ?? 'feature', scope: c.scope ?? 'restaurant',
      default_value: c.default_value === undefined ? null : c.default_value,
      allowed_values: c.allowed_values ?? null, metric: c.metric ?? null, unit: c.unit ?? null,
      lifecycle_status: c.lifecycle_status ?? 'active', runtime_status: c.runtime_status ?? 'enabled',
      sort_order: c.sort_order ?? 0, icon: c.icon ?? null, upgrade_message: c.upgrade_message ?? null,
      tags: c.tags ?? [], required_permissions: c.required_permissions ?? [],
      enabled_global: c.type === 'feature' ? !!c.default_enabled : false,
    })),
    dependencies: DEPENDENCIES.map((d) => ({ feature: d.feature, depends_on: d.depends_on, type: d.type ?? 'required' })),
  }
}

// فحص صلاحية الكتابة (لإظهار/إخفاء أزرار الكتابة؛ الخادم يفرضها فعلياً).
export const can = (capability) =>
  supabase.rpc('platform_admin_can', { p_capability: capability }).then(({ data }) => !!data)
