import { useEffect, useState } from 'react'
import { paymentIdempotencyStorageKey } from './cartHelpers'

// TASK-PAY-3.6D.4 — قراءة فقط لمفتاح إتقان دفع محفوظ مسبقاً، لاستئناف محاولة قائمة عند العودة من
// صفحة المزوّد (Payment-First Callback Landing). خلافاً لـusePaymentIdempotencyKey (3.6D.3 — تُولِّد
// مفتاحاً جديداً عند غيابه، مناسبة فقط لبدء محاولة جديدة)، هذا الملف لا يكتب على localStorage إطلاقاً
// ولا يستدعي crypto.randomUUID() في أي مسار — غياب المفتاح هنا يعني ببساطة "لا محاولة لاستئنافها"،
// وليس إشارة لبدء واحدة جديدة (القاعدة الصريحة: لا تُولَّد مفاتيح إتقان جديدة عند الاستئناف).
export function useResumedPaymentIdempotencyKey(slug, branchId) {
  const [resumedKey, setResumedKey] = useState(null)

  useEffect(() => {
    if (!slug || !branchId) { setResumedKey(null); return }
    try {
      setResumedKey(localStorage.getItem(paymentIdempotencyStorageKey(slug, branchId)))
    } catch {
      setResumedKey(null)
    }
  }, [slug, branchId])

  return resumedKey
}
