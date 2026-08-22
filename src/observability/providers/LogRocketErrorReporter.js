// مُنفِّذ LogRocket لـErrorReporter — يُفعَّل فقط إذا وُجد VITE_LOGROCKET_APP_ID.
// لا يكسر التطبيق إذا غاب المعرّف أو أخفق LogRocket في الإقلاع.
// لا يعمل في بيئة التطوير (import.meta.env.DEV) لتفادي تسجيل جلسات dev.
import LogRocket from 'logrocket'
import { ErrorReporter } from '../contracts'

export class LogRocketErrorReporter extends ErrorReporter {
  #ready = false

  constructor() {
    super()
    const appId = import.meta.env.VITE_LOGROCKET_APP_ID
    if (!appId || import.meta.env.DEV) return

    try {
      LogRocket.init(appId, {
        // ── Privacy: Network sanitizers ──────────────────────────────────────
        network: {
          requestSanitizer: request => {
            // حذف Authorization header (يحتوي Supabase Bearer token)
            if (request.headers['Authorization']) {
              request.headers['Authorization'] = '[REDACTED]'
            }
            // حذف Supabase anon key header
            if (request.headers['apikey']) {
              request.headers['apikey'] = '[REDACTED]'
            }
            // حذف body طلبات المصادقة (تحتوي password أو OTP)
            const url = request.url || ''
            if (url.includes('/auth/') || url.includes('/token')) {
              request.body = '[REDACTED - auth request]'
            }
            return request
          },
          responseSanitizer: response => {
            // حذف body استجابات المصادقة (تحتوي access_token وrefresh_token)
            const url = response.url || ''
            if (url.includes('/auth/') || url.includes('/token')) {
              response.body = '[REDACTED - auth response]'
            }
            return response
          },
        },
        // ── Privacy: DOM input masking ────────────────────────────────────────
        dom: {
          // يمنع تسجيل ما يكتبه المستخدم في أي input (كلمة المرور، البريد، OTP، إلخ)
          inputSanitizer: true,
        },
      })
      this.#ready = true
    } catch {
      // إذا أخفق LogRocket في الإقلاع: التطبيق يستمر بلا observability.
    }
  }

  captureException(error, context) {
    if (!this.#ready) return
    try {
      const extra = {}
      if (context?.source) extra.source = context.source
      if (context?.componentStack) extra.componentStack = context.componentStack
      LogRocket.captureException(error, { extra })
    } catch {
      // لا propagation — الإبلاغ يفشل بصمت.
    }
  }

  captureMessage(message, context) {
    if (!this.#ready) return
    try {
      const extra = {}
      if (context?.source) extra.source = context.source
      LogRocket.captureMessage(message, { extra })
    } catch {
      // لا propagation.
    }
  }
}
