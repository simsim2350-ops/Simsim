import { useEffect, useState } from 'react'
import { paymentIdempotencyStorageKey } from './cartHelpers'

// TASK-PAY-3.6D.3 — مفتاح إتقان الدفع: يُولَّد مرة واحدة لكل "محاولة دفع"، يُحفظ في localStorage
// فينجو من إعادة تحميل الصفحة أثناء التحويل لصفحة المزوّد (SESSION_RETRY_CONTINUITY، تقرير 3.6D-A) —
// نفس نمط idempotencyKey في useCart.js حرفياً، لكن لهوية "محاولة دفع" منفصلة عن هوية السلة.
//
// هذا الملف لا يقرر متى يُمسَح المفتاح (نجاح/فشل نهائي/إلغاء صريح) — ذلك قرار المُستدعي عبر clearKey()
// الصريحة؛ حالات الانتظار/إعادة المحاولة (retryable_error/requires_reconciliation/redirect) تتطلّب
// إبقاء نفس المفتاح، وهذا الحد الفاصل قرار تدفّق واجهة، لا شأن لهذه الدالة به.
export function usePaymentIdempotencyKey(slug, branchId) {
  const [paymentIdempotencyKey, setPaymentIdempotencyKey] = useState(null)

  useEffect(() => {
    if (!slug || !branchId) return
    const storageKey = paymentIdempotencyStorageKey(slug, branchId)
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) { setPaymentIdempotencyKey(stored); return }
    } catch { /* تجاهل */ }
    const fresh = crypto.randomUUID()
    try { localStorage.setItem(storageKey, fresh) } catch { /* تجاهل */ }
    setPaymentIdempotencyKey(fresh)
  }, [slug, branchId])

  const clearKey = () => {
    setPaymentIdempotencyKey(null)
    if (!slug || !branchId) return
    try { localStorage.removeItem(paymentIdempotencyStorageKey(slug, branchId)) } catch { /* تجاهل */ }
  }

  return { paymentIdempotencyKey, clearKey }
}
