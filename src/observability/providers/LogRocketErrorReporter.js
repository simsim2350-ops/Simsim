// مُنفِّذ LogRocket لـErrorReporter — يُفعَّل فقط إذا وُجد VITE_LOGROCKET_APP_ID.
// لا يكسر التطبيق إذا غاب المعرّف أو أخفق LogRocket في الإقلاع.
// لا يعمل في بيئة التطوير (import.meta.env.DEV) لتفادي تسجيل جلسات dev.
// كل إعدادات الخصوصية (network/URL/console/IP/DOM/exceptions) تأتي من privacy/ — لا منطق sanitizer هنا.
import LogRocket from 'logrocket'
import { ErrorReporter } from '../contracts'
import { buildLogRocketOptions, scrubErrorText } from '../privacy/networkPolicy'
import { toSafeError, installGlobalExceptionBoundary } from '../privacy/exceptionBoundary'
import { safeErrorMeta } from '../privacy/exceptionMessagePolicy'

const STACK_MAX_LENGTH = 2000

// extra لـLogRocket: قيم نصية/رقمية منظَّفة فقط (لا كائنات، لا بيانات طلب/استجابة).
function buildExtra(context) {
  const extra = {}
  if (context?.source) extra.source = scrubErrorText(context.source, 80)
  if (context?.componentStack) extra.componentStack = scrubErrorText(context.componentStack, STACK_MAX_LENGTH)
  if (context?.filename) extra.filename = scrubErrorText(context.filename, 200)
  if (Number.isFinite(context?.lineno)) extra.lineno = context.lineno
  if (Number.isFinite(context?.colno)) extra.colno = context.colno
  return extra
}

export class LogRocketErrorReporter extends ErrorReporter {
  #ready = false
  #uninstallBoundary = null

  constructor() {
    super()
    const appId = import.meta.env.VITE_LOGROCKET_APP_ID
    if (!appId || import.meta.env.DEV) return

    try {
      LogRocket.init(appId, buildLogRocketOptions())
      this.#ready = true
      // الخيارات تعطّل الالتقاط التلقائي الخام (shouldDetectExceptions=false)؛ هذا الحدّ يعوّضه بنسخة منظَّفة.
      this.#uninstallBoundary = installGlobalExceptionBoundary((raw, context) => this.captureException(raw, context))
    } catch {
      // إذا أخفق LogRocket في الإقلاع: التطبيق يستمر بلا observability.
    }
  }

  /** يزيل مستمعي حدّ الاستثناءات (للاختبارات وإعادة التحميل الساخنة). لا يوقف LogRocket نفسه. */
  dispose() {
    try { this.#uninstallBoundary?.() } catch { /* ignore */ }
    this.#uninstallBoundary = null
  }

  captureException(error, context) {
    if (!this.#ready) return
    try {
      // Phase 1.8G: الرسالة الأصلية لا تُرسَل أبداً (Default-Deny). ما يُرسَل: نسخة آمنة + بيانات تجميع لا تحوي نصاً أصلياً.
      const safe = toSafeError(error)
      const meta = safeErrorMeta(safe)
      const extra = buildExtra(context)
      if (meta) {
        extra.fingerprint = meta.fingerprint
        extra.valueKind = meta.kind
        extra.messageRedacted = meta.redacted
        if (meta.code) extra.errorCode = meta.code
      }
      LogRocket.captureException(safe, { extra })
    } catch {
      // لا propagation — الإبلاغ يفشل بصمت.
    }
  }

  captureMessage(message, context) {
    if (!this.#ready) return
    try {
      LogRocket.captureMessage(scrubErrorText(message), { extra: buildExtra(context) })
    } catch {
      // لا propagation.
    }
  }
}
