// ============================================================================
// featuresApi — طبقة الوصول للبيانات لسجل القدرات (جهة المطعم) — ADR-40 · M4
// ============================================================================
// كل وصول عبر RPC مبوّبة (effective_features مبوّبة بـ has_restaurant_access).
// تُستهلَك من authStore (تحميل واحد عند الدخول) و UpgradeModal (خيارات الترقية).
import { supabase } from './supabase'

// خريطة كل القدرات الفعّالة لمطعم + قيَمها (استدعاء واحد — نمط ADR-13).
export async function fetchEffectiveFeatures(restaurantId) {
  if (!restaurantId) return {}
  const { data, error } = await supabase.rpc('effective_features', { p_restaurant_id: restaurantId })
  if (error) throw error
  return data || {}
}

// الباقات التي تمنح قدرة معيّنة (لرسالة الترقية) — الأرخص أولاً.
export async function fetchUpgradeOptions(featureKey) {
  const { data, error } = await supabase.rpc('feature_upgrade_options', { p_key: featureKey })
  if (error) throw error
  return data || []
}
