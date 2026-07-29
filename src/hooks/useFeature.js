import { useAuthStore } from '../store/authStore'
import { state as featureState } from '../lib/features'

// ============================================================================
// useFeature — عُدّة سجل القدرات الأمرية (PCR — ADR-40)
// ============================================================================
// يُكمل <FeatureGate> (التصريحي) للحالات الأمرية:
//   Components : const { usable } = useFeature('menu_reviews'); if (!usable) return null
//   Actions    : const f = useFeature('online_payment'); onClick={() => f.usable ? pay() : f.requireUpgrade()}
// (Pages تُحمى في RequirePage/nav · API/الخادم عبر has_feature/feature_value في RPC/Edge.)
//
// يقرأ الخريطة المحمّلة مسبقاً في authStore (صفر استعلام). fail-open: قدرة غير
// مسجّلة/غير محمّلة → usable=true (غير كاسر — الحارس يمنع المفاتيح غير المسجّلة).
export function useFeature(key) {
  const features = useAuthStore((s) => s.features)
  const st = featureState(features, key)
  return {
    ...st,                 // { known, usable, locked, value, type, runtime_status, name, upgrade_message }
    key,
  }
}

export default useFeature
