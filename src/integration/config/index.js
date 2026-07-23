// إعدادات طبقة التكامل (Configuration).
// كل اختيار مزوّد وإعداداته غير السرّية يأتي من هنا فقط — لا قيم مضمّنة في الكود.
// ⚠️ المفاتيح السرّية لا تُخزَّن هنا إطلاقاً؛ تُحقن في بيئة الخادم (Edge Function env) وقت التشغيل.

import { ProviderMode } from '../types'

/** إعداد قدرة معطّل افتراضياً — الطبقة خاملة حتى تُضبط الإعدادات. */
const DISABLED = Object.freeze({ enabled: false, providerKey: null, mode: ProviderMode.TEST, options: {} })

/**
 * مزوّد إعدادات محايد: يقرأ اختيار المزوّد لكل قدرة من مصدر مُحقَّن (كائن/قارئ بيئة).
 * لا يعرف أي مزوّد بعينه، ولا يحمل أسراراً.
 */
export class IntegrationConfig {
  #source
  /** @param {Record<string, import('../types').CapabilityConfig>} [source] */
  constructor(source = {}) { this.#source = source || {} }

  /**
   * إعداد قدرة بعينها (أو DISABLED إن لم تُضبط).
   * @param {string} capability @returns {import('../types').CapabilityConfig}
   */
  getCapabilityConfig(capability) {
    return this.#source[capability] || DISABLED
  }

  /** هل القدرة مُفعَّلة ولها مزوّد مُختار؟ @param {string} capability */
  isEnabled(capability) {
    const c = this.getCapabilityConfig(capability)
    return Boolean(c.enabled && c.providerKey)
  }
}

/** إعدادات افتراضية فارغة (كل القدرات معطّلة) — تبقي الطبقة خاملة. */
export const defaultConfig = new IntegrationConfig({})
