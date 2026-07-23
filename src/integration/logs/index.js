// تجريد التسجيل (Logging Abstraction) لطبقة التكامل.
// غير مربوط بأي مزوّد Logging حقيقي: الافتراضي NullLogger (لا شيء).
// مزوّد تسجيل فعلي (Datadog/Sentry/…) يُضاف لاحقاً كتنفيذ لواجهة Logger دون تغيير المتصلين.

import { LogLevel } from '../types'

/** واجهة المُسجِّل — كل التوابع بلا أثر افتراضياً (تُستبدَل بتنفيذ فعلي لاحقاً). */
export class Logger {
  /** @param {string} _level @param {string} _message @param {Object} [_meta] */
  log(_level, _message, _meta) {}
  debug(message, meta) { this.log(LogLevel.DEBUG, message, meta) }
  info(message, meta)  { this.log(LogLevel.INFO, message, meta) }
  warn(message, meta)  { this.log(LogLevel.WARN, message, meta) }
  error(message, meta) { this.log(LogLevel.ERROR, message, meta) }
  /** إرجاع مُسجِّل مُثرى بسياق ثابت (capability/provider/requestId). @param {Object} _ctx */
  withContext(_ctx) { return this }
}

/** الافتراضي: لا يسجّل شيئاً — يبقي الطبقة خاملة تماماً. */
export class NullLogger extends Logger {}

/** مُسجِّل بسياق ثابت يلتف حول مُسجِّل آخر (Decorator، بلا مزوّد خارجي). */
export class ContextLogger extends Logger {
  #inner; #ctx
  constructor(inner, ctx = {}) { super(); this.#inner = inner || new NullLogger(); this.#ctx = ctx }
  log(level, message, meta) { this.#inner.log(level, message, { ...this.#ctx, ...meta }) }
  withContext(ctx) { return new ContextLogger(this.#inner, { ...this.#ctx, ...ctx }) }
}

/** مُسجِّل افتراضي مشترك (خامل). يُستبدَل عبر الإعدادات لاحقاً. */
export const defaultLogger = new NullLogger()
