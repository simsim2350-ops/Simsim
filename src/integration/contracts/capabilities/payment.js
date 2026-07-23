// عقد قدرة الدفع (Payment Capability Contract).
// ملاحظة معمارية: النطاق المالي (نماذج/حالات الدفع) يعيش في src/payments (غير مُعدَّل).
// هذا العقد هو واجهة القدرة داخل طبقة التكامل؛ مُهايئ مزوّد الدفع المستقبلي يحقّقه
// ويفوّض للنطاق المالي — فيصبح الدفع خدمةً خارجيةً تمرّ عبر البوابة الموحّدة دون تغيير سلوكه.

import { IntegrationAdapter } from '../IntegrationAdapter'
import { notImplemented } from '../../errors'

export class PaymentContract extends IntegrationAdapter {
  /** @param {import('../../types').CapabilityConfig} [_i] @returns {Promise<any>} */
  async createCharge(_i) { return notImplemented('PaymentContract.createCharge') }
  /** @param {string} _providerRef */
  async verifyPayment(_providerRef) { return notImplemented('PaymentContract.verifyPayment') }
  /** @param {unknown} _payload @param {Record<string,string>} _headers */
  parseWebhook(_payload, _headers) { return notImplemented('PaymentContract.parseWebhook') }
  /** @param {Object} _i */
  async refundPayment(_i) { return notImplemented('PaymentContract.refundPayment') }
  /** @param {string} _providerStatus */
  mapStatus(_providerStatus) { return notImplemented('PaymentContract.mapStatus') }
}
