// عقد المُهايئ (Adapter Contract) — واجهة مجرّدة يجب أن يحقّقها كل مزوّد دفع مستقبلاً.
// لا تنفيذ هنا: كل تابع يرمي «غير مُنفَّذ». المزوّدون الفعليون يعيشون في ../adapters.
// الفائدة: تُوحّد الطبقات العليا (services) تعاملها مع كل المزوّدين خلف هذا العقد الواحد.

/**
 * @typedef {import('../types').CreateChargeInput} CreateChargeInput
 * @typedef {import('../types').ChargeResult} ChargeResult
 * @typedef {import('../types').WebhookParseResult} WebhookParseResult
 * @typedef {import('../types').RefundInput} RefundInput
 * @typedef {import('../types').RefundResult} RefundResult
 */

const notImplemented = (name) => {
  throw new Error(`PaymentAdapter.${name} غير مُنفَّذ — هذه واجهة مجرّدة. حقّقها في مُهايئ مزوّد داخل ../adapters.`)
}

export class PaymentAdapter {
  /** مفتاح المزوّد (أحد قيم PaymentProvider). @returns {string} */
  get key() { return notImplemented('key') }

  /**
   * إنشاء عملية شحن لدى المزوّد.
   * @param {CreateChargeInput} _input
   * @returns {Promise<ChargeResult>}
   */
  // eslint-disable-next-line no-unused-vars
  async createCharge(_input) { return notImplemented('createCharge') }

  /**
   * التحقّق من حالة دفعة لدى المزوّد (لتأكيد النجاح بعد العودة/الاستعلام).
   * @param {string} _providerRef
   * @returns {Promise<ChargeResult>}
   */
  // eslint-disable-next-line no-unused-vars
  async verifyPayment(_providerRef) { return notImplemented('verifyPayment') }

  /**
   * تحليل حمولة Webhook والتحقّق من توقيعها، وإرجاع حدث مُوحّد.
   * @param {unknown} _payload
   * @param {Record<string,string>} _headers
   * @returns {WebhookParseResult}
   */
  // eslint-disable-next-line no-unused-vars
  parseWebhook(_payload, _headers) { return notImplemented('parseWebhook') }

  /**
   * طلب استرداد (كلي أو جزئي).
   * @param {RefundInput} _input
   * @returns {Promise<RefundResult>}
   */
  // eslint-disable-next-line no-unused-vars
  async refundPayment(_input) { return notImplemented('refundPayment') }

  /**
   * تطبيع حالة المزوّد الخام إلى TransactionStatus مُوحّدة.
   * @param {string} _providerStatus
   * @returns {string}
   */
  // eslint-disable-next-line no-unused-vars
  mapStatus(_providerStatus) { return notImplemented('mapStatus') }
}
