import { supabase } from '../../../lib/supabase'

// خدمة المزايا (Feature Flags): كل وصول عبر RPC مبوّبة —
// قراءة is_platform_admin · كتابة platform_admin_can('manage_flags') + Audit ذرّي في الخادم.
const call = async (fn, args) => {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data
}

export const listFlags = () => call('admin_list_feature_flags').then((d) => d || [])
export const upsertFlag = (f) => call('admin_upsert_feature_flag', {
  p_key: f.key, p_description: f.description || null, p_enabled_global: !!f.enabled_global,
})
export const deleteFlag = (key) => call('admin_delete_feature_flag', { p_key: key })

// تخصيص لكل مطعم — p_enabled=null يزيل التخصيص (يعود المطعم للوراثة من العام).
export const listOverrides = (key) => call('admin_list_feature_overrides', { p_key: key }).then((d) => d || [])
export const setOverride = (key, restaurantId, enabled) =>
  call('admin_set_feature_override', { p_key: key, p_restaurant_id: restaurantId, p_enabled: enabled })

// فحص صلاحية المستخدم الحالي (لإظهار/إخفاء إجراءات الكتابة).
export const can = (capability) =>
  supabase.rpc('platform_admin_can', { p_capability: capability }).then(({ data }) => !!data)
