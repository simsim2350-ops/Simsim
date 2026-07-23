// بنية الأحداث العامة (Events) لطبقة التكامل — ناقل نشر/اشتراك محايد في الذاكرة.
// بنية تحتية عامة فقط: لا مُنتِجين/مستهلِكين فعليين، ولا منطق أعمال.

/**
 * @typedef {Object} IntegrationEvent
 * @property {string} type            إحدى IntegrationEventType (أو نوع مُطبَّع)
 * @property {string} [capability]
 * @property {string} [provider]
 * @property {Object} [payload]
 * @property {string} occurredAt      ISO timestamp
 */

export class EventBus {
  /** @type {Map<string, Set<Function>>} */
  #handlers = new Map()

  /** اشتراك في نوع حدث. يُرجع دالة إلغاء الاشتراك. @param {string} type @param {(e:IntegrationEvent)=>void} handler */
  on(type, handler) {
    if (!this.#handlers.has(type)) this.#handlers.set(type, new Set())
    this.#handlers.get(type).add(handler)
    return () => this.#handlers.get(type)?.delete(handler)
  }

  /** نشر حدث لكل المشتركين (تزامني، معزول عن أخطاء المشتركين). @param {IntegrationEvent} event */
  emit(event) {
    const set = this.#handlers.get(event?.type)
    if (!set) return
    for (const handler of set) {
      try { handler(event) } catch { /* اشتراك واحد لا يُسقط البقية */ }
    }
  }

  /** إزالة كل المشتركين (لنوع محدّد أو الكل). @param {string} [type] */
  clear(type) { type ? this.#handlers.delete(type) : this.#handlers.clear() }
}

/** مصنع حدث موحّد. @param {string} type @param {Partial<IntegrationEvent>} [data] */
export const makeEvent = (type, data = {}) => ({ type, occurredAt: new Date().toISOString(), ...data })

/** ناقل أحداث افتراضي مشترك. */
export const eventBus = new EventBus()
