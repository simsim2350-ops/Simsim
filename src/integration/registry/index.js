// سجلّ المزوّدين (Provider Registry) — Strategy Pattern + Open/Closed.
// يربط (قدرة, مفتاح مزوّد) بمصنع يُنشئ المُهايئ. إضافة مزوّد = register(...) فقط،
// دون أي if/else أو switch في التطبيق أو في الطبقة. الاختيار يتمّ لاحقاً بالإعدادات.

import { IntegrationError, IntegrationErrorCode } from '../errors'

const keyOf = (capability, provider) => `${capability}:${provider}`

export class ProviderRegistry {
  /** @type {Map<string, (deps:import('../types').AdapterDeps)=>import('../contracts').IntegrationAdapter>} */
  #factories = new Map()

  /**
   * تسجيل مصنع مُهايئ لمزوّد ضمن قدرة.
   * @param {string} capability @param {string} provider
   * @param {(deps:import('../types').AdapterDeps)=>import('../contracts').IntegrationAdapter} factory
   */
  register(capability, provider, factory) {
    if (typeof factory !== 'function') {
      throw new IntegrationError({ code: IntegrationErrorCode.CONFIG_MISSING, capability, provider, message: 'مصنع المُهايئ مطلوب.' })
    }
    this.#factories.set(keyOf(capability, provider), factory)
    return this
  }

  /** هل يوجد مزوّد مُسجَّل لهذه القدرة؟ */
  has(capability, provider) { return this.#factories.has(keyOf(capability, provider)) }

  /**
   * إنشاء مُهايئ المزوّد المطلوب (أو خطأ مُطبَّع إن لم يُسجَّل).
   * @param {string} capability @param {string} provider @param {import('../types').AdapterDeps} deps
   * @returns {import('../contracts').IntegrationAdapter}
   */
  resolve(capability, provider, deps) {
    const factory = this.#factories.get(keyOf(capability, provider))
    if (!factory) {
      throw new IntegrationError({ code: IntegrationErrorCode.PROVIDER_NOT_REGISTERED, capability, provider, message: `لا مزوّد مُسجَّل: ${keyOf(capability, provider)}` })
    }
    return factory(deps)
  }

  /** قائمة المزوّدين المُسجَّلين لقدرة. @param {string} capability @returns {string[]} */
  list(capability) {
    const prefix = `${capability}:`
    return [...this.#factories.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length))
  }
}

/** سجلّ افتراضي مشترك — فارغ الآن (لا مزوّد مُسجَّل في مرحلة التأسيس). */
export const registry = new ProviderRegistry()
