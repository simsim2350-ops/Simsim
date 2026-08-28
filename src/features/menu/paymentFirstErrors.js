// خريطة أسباب رفض تدفّق "الدفع أولاً" (usePaymentFirstCheckout: status='rejected') إلى رسائل
// عربية/إنجليزية — TASK-PAY-3.6D.2. دالة خالصة — تُختبَر بلا شبكة، نفس نمط orderErrors.js تماماً.
//
// reason === 'dry_run_failed' حالة خاصة: رسالتها الخام (message) هي نفسها خطأ create_order
// الحقيقي (نفس الاستدعاء الذي يستخدمه المسار القديم) — تُفوَّض لـmapOrderError الموجودة فعلاً
// بدل تكرار خريطة رسائل قاعدة البيانات هنا من جديد.

import { mapOrderError } from './orderErrors'

const REASON_MESSAGES = {
  unsupported_currency: { ar: 'العملة غير مدعومة حالياً', en: 'This currency is not supported right now' },
  invalid_idempotency_key: { ar: 'حدث خطأ تقني في محاولة الدفع، أعد المحاولة', en: 'A technical error occurred with this payment attempt — please retry' },
  snapshot_failed: { ar: 'تعذّر تجهيز تفاصيل الطلب للدفع، أعد المحاولة', en: 'Could not prepare order details for payment — please retry' },
  amount_integrity_violation: { ar: 'تعذّر التحقق من المبلغ، أعد المحاولة', en: 'Could not verify the amount — please retry' },
  snapshot_integrity_violation: { ar: 'تغيّرت تفاصيل الطلب، أعد فتح السلة وحاول مجدداً', en: 'Order details changed — reopen your cart and try again' },
  tenant_not_found: { ar: 'هذا المطعم أو الفرع غير متاح للطلب حالياً', en: 'This restaurant or branch is unavailable right now' },
}

const FALLBACK = { ar: 'تعذّر إتمام الطلب. لم يتم تأكيد الطلب — حاول مرة أخرى', en: 'Could not complete checkout. The order was not confirmed — try again' }

/**
 * @param {string|undefined} reason حقل response.reason من usePaymentFirstCheckout عند status='rejected'
 * @param {string|undefined} message حقل response.message الخام (موجود فقط لبعض الأسباب)
 * @returns {{ar: string, en: string}}
 */
export function mapPaymentFirstRejectionReason(reason, message) {
  if (reason === 'dry_run_failed') return mapOrderError(message)
  if (reason && REASON_MESSAGES[reason]) return REASON_MESSAGES[reason]
  return FALLBACK
}
