// أدوات طبقة التكامل (Utils) — دوال نقيّة محايدة، بلا شبكة ولا مزوّد ولا حالة.

/** توليد مفتاح إتقان (Idempotency Key) فريد. */
export function newIdempotencyKey(prefix = 'intg') {
  const rand = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}_${rand}`
}

/** حساب تأخير تراجُعي أُسّي (Exponential Backoff) بالميلي ثانية. @param {number} attempt @param {number} [baseMs] @param {number} [capMs] */
export function backoffDelay(attempt, baseMs = 200, capMs = 10000) {
  const a = Math.max(0, Number(attempt) || 0)
  return Math.min(capMs, baseMs * (2 ** a))
}

/** سياسة إعادة محاولة افتراضية (وصف فقط — لا تنفيذ). */
export const defaultRetryPolicy = Object.freeze({ maxAttempts: 3, baseMs: 200, capMs: 10000 })

const SECRET_HINT = /(secret|token|key|authorization|password|signature)/i

/** إخفاء الحقول الحسّاسة قبل التسجيل — نسخة سطحية آمنة. @param {Object} obj */
export function redactSecrets(obj) {
  if (!obj || typeof obj !== 'object') return obj
  const out = Array.isArray(obj) ? [] : {}
  for (const [k, v] of Object.entries(obj)) {
    out[k] = SECRET_HINT.test(k) ? '***' : (v && typeof v === 'object' ? redactSecrets(v) : v)
  }
  return out
}
