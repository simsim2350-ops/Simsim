// عقود طبقة Observability — المصدر الموحّد لتجريد التسجيل والإبلاغ عن الأخطاء.
// طبقة عابرة (Cross-Cutting) تستهلكها كل الطبقات عبر هذه الواجهات فقط.
// خاملة: بلا مزوّد فعلي، بلا منطق أعمال، بلا PII.

/** مستويات التسجيل الموحّدة. */
export const LogLevel = Object.freeze({ DEBUG: 'debug', INFO: 'info', WARN: 'warn', ERROR: 'error' })

/** واجهة المُسجِّل — كل التوابع بلا أثر افتراضياً (تُستبدَل بمُنفِّذ فعلي عبر configure). */
export class Logger {
  /** @param {string} _level @param {string} _message @param {Object} [_meta] */
  log(_level, _message, _meta) {}
  debug(message, meta) { this.log(LogLevel.DEBUG, message, meta) }
  info(message, meta)  { this.log(LogLevel.INFO, message, meta) }
  warn(message, meta)  { this.log(LogLevel.WARN, message, meta) }
  error(message, meta) { this.log(LogLevel.ERROR, message, meta) }
  /** مُسجِّل مُثرى بسياق ثابت (requestId/tenant/…). @param {Object} _ctx */
  withContext(_ctx) { return this }
}

/** واجهة الإبلاغ عن الأخطاء — تُستبدَل لاحقاً بمزوّد فعلي (Sentry/…) بلا لمس المتصلين. */
export class ErrorReporter {
  /** @param {Error} _error @param {Object} [_context] */
  captureException(_error, _context) {}
  /** @param {string} _message @param {Object} [_context] */
  captureMessage(_message, _context) {}
}
