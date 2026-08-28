// أنواع وثوابت نظام الدفع (Enums) — مصدر الحقيقة الوحيد لكل الحالات والمفاتيح.
// المشروع بلا TypeScript؛ نستخدم كائنات مُجمّدة + JSDoc typedefs للتلميح والتحقق البصري.
// هذه الطبقة خاملة: لا تستورد شيئاً ولا تتصل بأي مزوّد.

/** مفاتيح مزوّدي الدفع المدعومين (تطابق عمود key في جدول payment_providers). */
export const PaymentProvider = Object.freeze({
  MANUAL: 'manual',
  MOYASAR: 'moyasar',
  TAP: 'tap',
  HYPERPAY: 'hyperpay',
  STRIPE: 'stripe',
})

/** دورة حياة محاولة الدفع (تطابق قيد status في payment_transactions). */
export const TransactionStatus = Object.freeze({
  INITIATED: 'initiated',   // أُنشئت المحاولة محلياً، لم تُرسل بعد
  PENDING: 'pending',       // بانتظار إتمام العميل/تأكيد المزوّد
  SUCCEEDED: 'succeeded',   // نجحت
  FAILED: 'failed',         // فشلت
  CANCELLED: 'cancelled',   // ألغاها العميل/انتهت مهلتها
  REFUNDED: 'refunded',     // استُردّت بالكامل
})

/** الحالة المالية عالية المستوى لفاتورة/اشتراك (مشتقّة من المعاملات، لا تُخزَّن هنا). */
export const PaymentStatus = Object.freeze({
  UNPAID: 'unpaid',
  PAID: 'paid',
  PARTIALLY_REFUNDED: 'partially_refunded',
  REFUNDED: 'refunded',
  FAILED: 'failed',
})

/** حالة الاسترداد. */
export const RefundStatus = Object.freeze({
  NONE: 'none',
  REQUESTED: 'requested',
  PROCESSING: 'processing',
  REFUNDED: 'refunded',
  FAILED: 'failed',
})

/** أنواع أحداث Webhook المُوحّدة (يُطبِّع كل مُهايئ أحداث مزوّده إلى هذه المجموعة). */
export const WebhookEventType = Object.freeze({
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_PENDING: 'payment.pending',
  PAYMENT_CANCELLED: 'payment.cancelled',
  REFUND_SUCCEEDED: 'refund.succeeded',
  REFUND_FAILED: 'refund.failed',
  // TASK-PAY-3.4-REMEDIATION: نوع حدث موثَّق رسمياً لدى Moyasar (payment_refunded/voided/captured/verified)
  // لكن بلا منطق عمل مُحدَّد بعد — يميّزه عن UNKNOWN (نوع غير معروف إطلاقاً) دون اختراع تحويل حالة.
  RECOGNIZED_UNHANDLED: 'recognized_unhandled',
  UNKNOWN: 'unknown',
})

/** وضع التشغيل لكل مزوّد. */
export const PaymentMode = Object.freeze({ TEST: 'test', LIVE: 'live' })

// ————— JSDoc typedefs (عقود البيانات المتنقّلة بين الطبقات) —————

/**
 * @typedef {Object} CreateChargeInput
 * @property {string} restaurantId
 * @property {string} [invoiceId]
 * @property {number} amount
 * @property {string} currency
 * @property {string} idempotencyKey  مفتاح إتقان من جهتنا لمنع الشحن المزدوج
 * @property {Object} [metadata]
 * @property {string} [returnUrl]     عنوان العودة بعد إتمام الدفع (للتحويل)
 */

/**
 * @typedef {Object} ChargeResult
 * @property {string} providerRef            معرّف الشحنة لدى المزوّد
 * @property {TransactionStatus[keyof TransactionStatus]} status
 * @property {string} [redirectUrl]          عنوان تحويل العميل (لو التدفّق يتطلّب صفحة مزوّد)
 * @property {string} [clientSecret]         سرّ العميل (لو التدفّق داخل الصفحة)
 * @property {Object} [raw]                  حمولة المزوّد الخام
 */

/**
 * @typedef {Object} WebhookParseResult
 * @property {string} eventId                معرّف الحدث لدى المزوّد (Idempotency)
 * @property {WebhookEventType[keyof WebhookEventType]} type
 * @property {string} [providerRef]          ربط الحدث بمعاملة
 * @property {TransactionStatus[keyof TransactionStatus]} [status]
 * @property {Object} [raw]
 */

/**
 * @typedef {Object} RefundInput
 * @property {string} providerRef
 * @property {string} restaurantId           TASK-PAY-3.6C.3.0: إلزامي — يُتحقَّق من مطابقته لمالك المعاملة الفعلي
 * @property {number} [amount]               جزئي؛ يُترك فارغاً للاسترداد الكامل
 * @property {string} [reason]
 * @property {string} idempotencyKey
 */

/**
 * @typedef {Object} RefundResult
 * @property {string} refundRef
 * @property {RefundStatus[keyof RefundStatus]} status
 * @property {Object} [raw]
 */
