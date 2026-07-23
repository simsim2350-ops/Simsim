// المُهايئ الأساس (BaseAdapter) — يوفّر السباكة المشتركة لكل المزوّدين:
// حقن الإعدادات (config) والمُسجِّل (logger)، مع إبقاء توابع القدرة مجرّدة.
// المزوّدون الفعليون في providers/ يمدّدون عقد قدرتهم (الذي يمدّد IntegrationAdapter)،
// ويمكنهم إعادة استخدام هذه السباكة عبر التركيب. لا منطق أعمال هنا.

import { NullLogger } from '../logs'

export class BaseAdapter {
  /** @param {import('../types').AdapterDeps} [deps] */
  constructor({ config, logger } = {}) {
    /** @type {import('../types').CapabilityConfig|undefined} */
    this.config = config
    /** @type {import('../logs').Logger} */
    this.logger = logger || new NullLogger()
  }

  /** وضع المزوّد (test/live) من الإعدادات. */
  get mode() { return this.config?.mode ?? 'test' }
}
