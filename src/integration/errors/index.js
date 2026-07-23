// نظام أخطاء موحّد لطبقة التكامل — سلسلة تحويل واضحة:
//   External API Error  →  Integration Error  →  Application Error
// الهدف: لا يتسرّب خطأ مزوّد خام إلى التطبيق؛ يُطبَّع دائماً عبر هذه الطبقة.

/** رموز أخطاء التكامل الموحّدة. */
export const IntegrationErrorCode = Object.freeze({
  NOT_IMPLEMENTED: 'not_implemented',
  PROVIDER_NOT_REGISTERED: 'provider_not_registered',
  CAPABILITY_DISABLED: 'capability_disabled',
  CONFIG_MISSING: 'config_missing',
  PROVIDER_ERROR: 'provider_error',
  WEBHOOK_VERIFICATION_FAILED: 'webhook_verification_failed',
  TIMEOUT: 'timeout',
  RATE_LIMITED: 'rate_limited',
  UNKNOWN: 'unknown',
})

/** خطأ مزوّد خارجي خام (أدنى طبقة) — يلتقط استجابة المزوّد كما هي دون تفسير. */
export class ExternalApiError extends Error {
  constructor(message, { provider, statusCode, raw, cause } = {}) {
    super(message)
    this.name = 'ExternalApiError'
    this.provider = provider ?? null
    this.statusCode = statusCode ?? null
    this.raw = raw ?? null
    if (cause) this.cause = cause
  }
}

/** خطأ طبقة التكامل (طبقة وسطى) — مُطبَّع، يحمل السياق دون تفاصيل حسّاسة. */
export class IntegrationError extends Error {
  constructor({ code = IntegrationErrorCode.UNKNOWN, message, capability, provider, cause } = {}) {
    super(message || code)
    this.name = 'IntegrationError'
    this.code = code
    this.capability = capability ?? null
    this.provider = provider ?? null
    if (cause) this.cause = cause
  }
}

/** خطأ آمن موجّه للتطبيق (أعلى طبقة) — بلا أي تفاصيل داخلية للمزوّد. */
export class ApplicationError extends Error {
  constructor({ code = IntegrationErrorCode.UNKNOWN, message, cause } = {}) {
    super(message || 'حدث خطأ في خدمة خارجية')
    this.name = 'ApplicationError'
    this.code = code
    if (cause) this.cause = cause
  }
}

/** رافع خطأ «غير مُنفَّذ» موحّد للعقود المجرّدة. */
export function notImplemented(member) {
  throw new IntegrationError({ code: IntegrationErrorCode.NOT_IMPLEMENTED, message: `${member} غير مُنفَّذ (عقد مجرّد).` })
}

/**
 * ترقية خطأ مزوّد خام إلى IntegrationError مُطبَّع.
 * @param {unknown} err @param {{capability?:string, provider?:string, code?:string}} [ctx]
 */
export function toIntegrationError(err, ctx = {}) {
  if (err instanceof IntegrationError) return err
  const code = ctx.code || (err instanceof ExternalApiError ? IntegrationErrorCode.PROVIDER_ERROR : IntegrationErrorCode.UNKNOWN)
  return new IntegrationError({ code, message: err?.message, capability: ctx.capability, provider: ctx.provider, cause: err })
}

/** خفض IntegrationError إلى ApplicationError آمن للتطبيق. */
export function toApplicationError(err) {
  if (err instanceof ApplicationError) return err
  const code = err instanceof IntegrationError ? err.code : IntegrationErrorCode.UNKNOWN
  return new ApplicationError({ code, cause: err })
}
