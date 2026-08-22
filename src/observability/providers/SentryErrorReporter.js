// مُنفِّذ Sentry لـErrorReporter — يُفعَّل فقط إذا وُجد VITE_SENTRY_DSN.
// لا يكسر التطبيق إذا غاب DSN أو أخفق Sentry في الإقلاع.
import * as Sentry from '@sentry/react'
import { ErrorReporter } from '../contracts'

export class SentryErrorReporter extends ErrorReporter {
  #ready = false

  constructor() {
    super()
    const dsn = import.meta.env.VITE_SENTRY_DSN
    if (!dsn) return

    try {
      Sentry.init({
        dsn,
        environment: import.meta.env.MODE,
        // أرسل 10% من traces فقط — لا تكسر الأداء.
        tracesSampleRate: 0.1,
        // لا session replay — يحتوي على PII بصري.
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
        // لا إرسال PII تلقائي من المتصفح.
        sendDefaultPii: false,
        // لا تُرسل أخطاء dev console.
        beforeSend(event) {
          if (import.meta.env.DEV) return null
          return event
        },
      })
      this.#ready = true
    } catch {
      // إذا أخفق Sentry في الإقلاع: التطبيق يستمر بلا observability.
    }
  }

  captureException(error, context) {
    if (!this.#ready) return
    try {
      Sentry.withScope(scope => {
        if (context?.source) scope.setTag('source', context.source)
        if (context?.componentStack) scope.setExtra('componentStack', context.componentStack)
        Sentry.captureException(error)
      })
    } catch {
      // لا propagation — الإبلاغ يفشل بصمت.
    }
  }

  captureMessage(message, context) {
    if (!this.#ready) return
    try {
      Sentry.withScope(scope => {
        if (context?.source) scope.setTag('source', context.source)
        Sentry.captureMessage(message)
      })
    } catch {
      // لا propagation.
    }
  }
}
