// طبقة الخدمة (Service) — تنسيق محايد للمزوّد بين العقد والمُهايئات والبيانات.
// خاملة في مرحلة الأساس: لا اتصال شبكي، ولا كتابة فعلية، ولا مزوّد مربوط.
// كل تدفّق يمرّ عبر getAdapter(provider) ثم يُحدِّث payment_transactions — يُبنى لاحقاً.
//
// السبب: عزل «ماذا نفعل» (تنسيق) عن «كيف يفعله كل مزوّد» (مُهايئ)، فلا تتسرّب تفاصيل مزوّد
// إلى بقية النظام، وإضافة مزوّد جديد لا تمسّ هذه الطبقة.

import { getAdapter } from '../adapters'
import { newIdempotencyKey } from '../utils'

const FOUNDATION_ONLY = 'مرحلة الأساس فقط: لم يُربط أي مزوّد/تكامل بعد.'

export const paymentService = {
  /**
   * بدء عملية دفع لفاتورة عبر المزوّد المُفعَّل (خامل الآن).
   * التدفّق المقصود لاحقاً: إنشاء صف payment_transactions=initiated → adapter.createCharge →
   * تحديث الصف بـ provider_ref/redirectUrl والحالة pending.
   * @param {import('../types').CreateChargeInput} input
   */
  async startCharge(input) {
    void input; void getAdapter; void newIdempotencyKey
    throw new Error(`startCharge — ${FOUNDATION_ONLY}`)
  },

  /**
   * تأكيد دفعة بعد عودة العميل أو عبر استعلام (خامل الآن).
   * @param {string} providerRef
   */
  async confirmCharge(providerRef) {
    void providerRef
    throw new Error(`confirmCharge — ${FOUNDATION_ONLY}`)
  },

  /**
   * معالجة حدث Webhook مُطبَّع بإتقان (خامل الآن).
   * التدفّق المقصود: تسجيل الحدث في payment_webhook_events (فريد provider+event_id) →
   * إن لم يُعالَج بعد، حدِّث المعاملة المرتبطة ثم علّم processed_at.
   * @param {import('../types').WebhookParseResult} event
   */
  async handleWebhookEvent(event) {
    void event
    throw new Error(`handleWebhookEvent — ${FOUNDATION_ONLY}`)
  },

  /**
   * طلب استرداد (خامل الآن).
   * @param {import('../types').RefundInput} input
   */
  async refund(input) {
    void input
    throw new Error(`refund — ${FOUNDATION_ONLY}`)
  },
}
