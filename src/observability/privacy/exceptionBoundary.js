// حدّ الاستثناءات (Phase 1.8F، وسياسة الرسائل Phase 1.8G). يستبدل الالتقاط التلقائي في LogRocket (Raven/unhandledrejection)
// الذي يسجّل رسائل الأخطاء الخام. المراقبة تبقى: نلتقط uncaught errors وunhandled rejections بأنفسنا ونمرّر
// إلى LogRocket نسخة آمنة مبنيّة من الصفر فقط (toSafeError في exceptionMessagePolicy: Default-Deny — لا رسالة أصلية).
// الخيار shouldDetectExceptions=false (في المصنع) هو ما يوقف الالتقاط الخام — انظر buildLogRocketOptions.
//
// نقاط التغطية:
//  • window 'error'              ← يغطي ما كان Raven/window.onerror يلتقطه (الأخطاء غير الملتقطة، وthrow لقيمة غير Error).
//  • window 'unhandledrejection' ← يغطي رفض الـPromise (كان الـSDK يمرّر evt.reason الخام كما هو لأي نوع).
//  • استثناءات React الملتقطة في RootErrorBoundary ← تمرّ عبر captureException الصريح (نفس toSafeError).
// المستمعون سلبيون: لا preventDefault ولا stopPropagation ولا رمي — سلوك التطبيق ومعالجة الأخطاء الأخرى لا تتأثر.
import { sanitizePageUrl } from './networkPolicy'

export { toSafeError } from './exceptionMessagePolicy'

const MAX_REPORTS_PER_PAGE = 100

const isObjectLike = (v) => v !== null && (typeof v === 'object' || typeof v === 'function')

/**
 * يثبّت مستمعي error/unhandledrejection ويُرجع دالة إلغاء. `report(raw, context)` يستلم القيمة الخام ليحوّلها
 * المُستدعي عبر toSafeError قبل أي إرسال (الـreporter يفعل ذلك). لا يرمي أبداً.
 * @param {(raw: unknown, context: Record<string, string|number>) => void} report
 * @param {Window} [target]
 * @returns {() => void}
 */
export function installGlobalExceptionBoundary(report, target = typeof window !== 'undefined' ? window : undefined) {
  if (!target || typeof target.addEventListener !== 'function' || typeof report !== 'function') return () => {}
  const seen = new WeakSet()
  let count = 0

  const forward = (raw, context) => {
    try {
      if (count >= MAX_REPORTS_PER_PAGE) return
      if (isObjectLike(raw)) {
        if (seen.has(raw)) return
        seen.add(raw)
      }
      count += 1
      report(raw, context)
    } catch {
      // لا يؤثر على التطبيق أبداً.
    }
  }

  const onError = (event) => {
    try {
      const raw = event && event.error !== undefined && event.error !== null ? event.error : event && event.message
      const context = { source: 'window.error' }
      if (event && Number.isFinite(event.lineno)) context.lineno = event.lineno
      if (event && Number.isFinite(event.colno)) context.colno = event.colno
      const file = event ? sanitizePageUrl(event.filename) : null
      if (file) context.filename = file
      forward(raw, context)
    } catch {
      // ignore
    }
  }

  const onRejection = (event) => {
    try {
      forward(event ? event.reason : undefined, { source: 'unhandledrejection' })
    } catch {
      // ignore
    }
  }

  target.addEventListener('error', onError)
  target.addEventListener('unhandledrejection', onRejection)
  return () => {
    try {
      target.removeEventListener('error', onError)
      target.removeEventListener('unhandledrejection', onRejection)
    } catch {
      // ignore
    }
  }
}
