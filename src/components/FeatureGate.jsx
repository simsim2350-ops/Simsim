import { useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { state as featureState } from '../lib/features'
import UpgradeModal from './UpgradeModal'

// ============================================================================
// FeatureGate — بوابة القدرة الموحّدة (PCR) — ADR-40 · M4
// ============================================================================
// تلفّ أي عنصر (Page / Component / Button / Action). تقرأ الحالة من authStore
// (خريطة محمّلة مسبقاً — صفر استعلام). fail-open: قدرة غير مسجّلة/غير محمّلة → تُعرض.
//
// props:
//   feature   : مفتاح القدرة (snake_case) — لا يُستخدَم المفتاح مباشرة إلا هنا/عبر Feature API.
//   mode      : 'hide' (افتراضي، لا تُعرض) | 'disable' (تظهر معطّلة) | 'upgrade' (تفتح رسالة الترقية)
//   fallback  : بديل يُعرض عند القفل في وضع hide (افتراضي: لا شيء)
//   children  : المحتوى المحميّ
export default function FeatureGate({ feature, mode = 'hide', fallback = null, children }) {
  const features = useAuthStore((s) => s.features)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const st = featureState(features, feature)

  if (st.usable) return children

  if (mode === 'disable') {
    return (
      <span aria-disabled="true" title={st.upgrade_message || 'غير متاح في باقتك'}
            style={{ opacity: 0.5, pointerEvents: 'none', display: 'inline-block' }}>
        {children}
      </span>
    )
  }

  if (mode === 'upgrade') {
    return (
      <>
        <span onClick={() => setShowUpgrade(true)} style={{ cursor: 'pointer' }}>{children}</span>
        {showUpgrade && (
          <UpgradeModal feature={feature} name={st.name} message={st.upgrade_message}
                        onClose={() => setShowUpgrade(false)} />
        )}
      </>
    )
  }

  return fallback
}
