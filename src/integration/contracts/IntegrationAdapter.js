// العقد الجذر لأي مُهايئ تكامل (Interface First).
// كل مزوّد خارجي — مهما كانت قدرته — يحقّق هذا العقد الأساسي، ثم عقد قدرته المتخصّص.
// لا تنفيذ هنا: الأعضاء المجرّدة ترمي «غير مُنفَّذ».

import { notImplemented } from '../errors'

export class IntegrationAdapter {
  /** القدرة التي يخدمها هذا المُهايئ (إحدى IntegrationCapability). @returns {string} */
  get capability() { return notImplemented('IntegrationAdapter.capability') }

  /** مفتاح المزوّد (مثل moyasar, twilio, firebase). @returns {string} */
  get provider() { return notImplemented('IntegrationAdapter.provider') }

  /**
   * فحص صحّة الاتصال بالمزوّد.
   * @returns {Promise<string>} إحدى ProviderHealth
   */
  async healthCheck() { return notImplemented('IntegrationAdapter.healthCheck') }
}
