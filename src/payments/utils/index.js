// أدوات دفع محايدة للمزوّد (Utils) — دوال نقيّة فقط، بلا أي اتصال بمزوّد أو شبكة.
import { TransactionStatus } from '../types'

/** توليد مفتاح إتقان (Idempotency Key) فريد لعملية شحن — يمنع الشحن المزدوج. */
export function newIdempotencyKey(prefix = 'sim') {
  const rand = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`)
  return `${prefix}_${rand}`
}

const TERMINAL = new Set([
  TransactionStatus.SUCCEEDED,
  TransactionStatus.FAILED,
  TransactionStatus.CANCELLED,
  TransactionStatus.REFUNDED,
])

/** هل هذه الحالة نهائية (لا تتغيّر بعدها)؟ @param {string} status */
export const isTerminalStatus = (status) => TERMINAL.has(status)

/** هل المعاملة ناجحة؟ @param {string} status */
export const isSuccess = (status) => status === TransactionStatus.SUCCEEDED

/** تطبيع مبلغ إلى رقم موجب بمنزلتين (حارس مدخلات نقي). @param {number|string} amount */
export function normalizeAmount(amount) {
  const n = Number(amount)
  if (!Number.isFinite(n) || n < 0) throw new Error('مبلغ غير صالح')
  return Math.round(n * 100) / 100
}
