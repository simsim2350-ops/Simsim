// الوصول الموحّد لطبقة Observability — نقطة واحدة يستهلكها كل التطبيق.
// خامل افتراضياً (Null)؛ configure() يستبدل المُنفِّذ بمزوّد فعلي لاحقاً بلا لمس أي متصل (Open/Closed).
import { NullLogger } from './NullLogger'
import { NullErrorReporter } from './NullErrorReporter'

let _logger = new NullLogger()
let _errorReporter = new NullErrorReporter()

export const observability = {
  /** @returns {import('./contracts').Logger} */
  get logger() { return _logger },
  /** @returns {import('./contracts').ErrorReporter} */
  get errorReporter() { return _errorReporter },
  /**
   * حقن مُنفِّذ فعلي (يُستدعى مرة عند الإقلاع مستقبلاً). أي حقل غير مُمرَّر يبقى كما هو.
   * @param {{logger?:import('./contracts').Logger, errorReporter?:import('./contracts').ErrorReporter}} [impl]
   */
  configure(impl = {}) {
    if (impl.logger) _logger = impl.logger
    if (impl.errorReporter) _errorReporter = impl.errorReporter
  },
}
