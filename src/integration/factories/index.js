// مصنع التكامل (Integration Factory) — نقطة الدخول الوحيدة للتطبيق للحصول على مُهايئ قدرة.
// Dependency Inversion: التطبيق يعتمد على العقود، والمصنع يحقن الإعدادات/المُسجِّل ويختار
// المزوّد المُفعَّل من الإعدادات عبر السجلّ — بلا أي if/else خاص بمزوّد.

import { IntegrationError, IntegrationErrorCode } from '../errors'
import { registry as defaultRegistry } from '../registry'
import { defaultConfig } from '../config'
import { defaultLogger, ContextLogger } from '../logs'

export class IntegrationFactory {
  #registry; #config; #logger
  /** @param {{registry?:import('../registry').ProviderRegistry, config?:import('../config').IntegrationConfig, logger?:import('../logs').Logger}} [deps] */
  constructor({ registry = defaultRegistry, config = defaultConfig, logger = defaultLogger } = {}) {
    this.#registry = registry
    this.#config = config
    this.#logger = logger
  }

  /**
   * الحصول على مُهايئ القدرة المُفعَّلة (المزوّد يُختار من الإعدادات).
   * @param {string} capability @returns {import('../contracts').IntegrationAdapter}
   */
  get(capability) {
    const conf = this.#config.getCapabilityConfig(capability)
    if (!conf.enabled || !conf.providerKey) {
      throw new IntegrationError({ code: IntegrationErrorCode.CAPABILITY_DISABLED, capability, message: `القدرة «${capability}» معطّلة أو بلا مزوّد.` })
    }
    const logger = new ContextLogger(this.#logger, { capability, provider: conf.providerKey })
    return this.#registry.resolve(capability, conf.providerKey, { config: conf, logger })
  }
}

/** مصنع افتراضي مشترك يستخدم السجلّ والإعدادات الافتراضية (الخاملة). */
export const integration = new IntegrationFactory()
