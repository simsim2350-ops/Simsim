// سياسة رسائل الاستثناءات (Phase 1.8G) — Default-Deny.
// المشكلة (canary 1.8F): تنظيف الرسائل بالأنماط (scrubErrorText) لا يحجب قيماً عادية غير شبيهة بالأسرار
// (رقم طلب، اسم عميل، معرّف…). لذلك رسالة أي استثناء لا تُرسَل إلى LogRocket إطلاقاً، ويُرسَل بدلاً منها:
//   • رسالة ثابتة يملكها هذا الملف إن كان للخطأ رمز (code) موجود في قائمة السماح أدناه (رموز first-party فقط)؛
//   • وإلا REDACTED_MESSAGE.
// لا نصّ أصلي يخرج من هنا أبداً: لا في message ولا في stack (رأس الـstack يُعاد بناؤه، والإطارات تُحلَّل بنيوياً)
// ولا في fingerprint (هاش قصير منخفض الإنتروبيا محسوب محلياً على نصّ مُطبَّع).
// لا تعتمد هذه الوحدة على أي طبقة أخرى ولا على LogRocket.
import { scrubErrorText, sanitizePageUrl } from './networkPolicy'

export const REDACTED_MESSAGE = '[REDACTED_EXCEPTION_MESSAGE]'

// قائمة السماح: رمز خطأ first-party → رسالة ثابتة. الرموز تطابق ما هو معرَّف فعلاً في التطبيق:
//   • IntegrationErrorCode في src/integration/errors/index.js (اختبار يمنع الانحراف بينهما)
//   • AsyncTimeoutError.code في src/lib/asyncTimeout.js
// الرسالة الأصلية لهذه الأخطاء قد تحوي نصاً حراً (نص مزوّد، اسم عملية) فلا تُستخدم أبداً؛ الرسالة المرسَلة ثابتة.
// ممنوع إضافة أي رمز يحمل/يُشتق من بريد أو هاتف أو token أو كلمة مرور أو query أو محتوى عميل أو معرّفات.
const SAFE_CODE_MESSAGES = new Map([
  ['SIMSIM_ASYNC_TIMEOUT', 'Async operation timed out'],
  ['not_implemented', 'Integration error: not_implemented'],
  ['provider_not_registered', 'Integration error: provider_not_registered'],
  ['capability_disabled', 'Integration error: capability_disabled'],
  ['config_missing', 'Integration error: config_missing'],
  ['provider_error', 'Integration error: provider_error'],
  ['webhook_verification_failed', 'Integration error: webhook_verification_failed'],
  ['timeout', 'Integration error: timeout'],
  ['rate_limited', 'Integration error: rate_limited'],
  ['unknown', 'Integration error: unknown'],
])
export const SAFE_ERROR_CODES = Object.freeze([...SAFE_CODE_MESSAGES.keys()])

// أسماء الأخطاء المسموح بإبقائها (قياسية في JS + أنواع first-party). أي اسم آخر يُستبدل بـ'Error'
// (الاسم حرّ قد يحمل بيانات). مطابقة تامة فقط.
const SAFE_NAMES = new Set([
  'Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'EvalError', 'URIError', 'AggregateError',
  'AsyncTimeoutError', 'ExternalApiError', 'IntegrationError', 'ApplicationError',
])

const STACK_MAX = 2000
const STACK_INPUT_MAX = 20000
const FRAME_LIMIT = 15
const LOCATION_MAX = 300
const UNKNOWN_LOCATION = '<unknown>'

const isObjectLike = (v) => v !== null && (typeof v === 'object' || typeof v === 'function')

// ── fingerprint: هاش FNV-1a بـ16 بت فقط (4 خانات hex) على نصّ مُطبَّع (أرقام→0، محتوى علامات الاقتباس محذوف).
// 16 بت عمداً: يكفي لفصل رسائل مختلفة في نفس الموضع، ولا يصلح كمرجع (dictionary) لاستعادة القيمة الأصلية.
function shortHash(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return (h & 0xffff).toString(16).padStart(4, '0')
}

const normalizeForFingerprint = (s) => s
  .slice(0, 500)
  .replace(/(["'`])(?:(?!\1).)*\1/g, '$1$1')
  .replace(/\d+/g, '0')
  .replace(/\s+/g, ' ')
  .trim()

function kindOf(reason) {
  if (reason === null) return 'null'
  if (Array.isArray(reason)) return 'array'
  if (reason instanceof Error) return 'error'
  return typeof reason === 'object' ? 'object' : typeof reason
}

// ── تحليل stack بنيوياً: نُعيد بناء كل إطار من (اسم دالة صارم، موقع منظَّف، سطر، عمود) ولا نمرّر أي نص حرّ.
const V8_FRAME = /^\s*at\s+(?:(.*?)\s+\()?(.+?):(\d{1,7}):(\d{1,7})\)?\s*$/
const GECKO_FRAME = /^([^@\s]{0,100})@(.+?):(\d{1,7})(?::(\d{1,7}))?\s*$/
const FN_NAME = /^(?:(?:async|new) )?[A-Za-z_$<][\w$.<>[\]]{0,79}(?: \[as [A-Za-z_$][\w$]{0,39}\])?$/

function parseFrame(line) {
  let fn
  let file
  let row
  let col
  let m = V8_FRAME.exec(line)
  if (m) {
    [, fn, file, row, col] = m
  } else {
    m = GECKO_FRAME.exec(line)
    if (!m) return null
    ;[, fn, file, row, col] = m
  }
  const location = scrubErrorText(sanitizePageUrl(file) || UNKNOWN_LOCATION, LOCATION_MAX)
  const name = fn && FN_NAME.test(fn) ? fn : '<anonymous>'
  return `    at ${name} (${location}:${row}${col ? `:${col}` : ''})`
}

// رأس الـstack (`${name}: ${message}`) يحوي الرسالة الأصلية وقد تمتد لعدة أسطر تشبه الإطارات → نقتطع كل ما حتى نهاية
// الرسالة (المعروفة لنا حرفياً) قبل تحليل الأسطر. رأس بلا إطار لا يطابق أي صيغة إطار أصلاً (يُهمَل)، وFirefox/Safari بلا رأس.
function safeFrames(stack, message) {
  if (typeof stack !== 'string') return []
  let body = stack.slice(0, STACK_INPUT_MAX)
  if (message) {
    const at = body.indexOf(message)
    if (at >= 0) body = body.slice(at + message.length)
  }
  return body.split(/\r?\n/).slice(0, 200).map(parseFrame).filter(Boolean).slice(0, FRAME_LIMIT)
}

const safeMeta = new WeakMap()

/** بيانات الوصف الآمنة لخطأ أنشأه toSafeError (fingerprint/kind/code) — أو undefined. */
export function safeErrorMeta(error) {
  return isObjectLike(error) ? safeMeta.get(error) : undefined
}

const FALLBACK = Object.freeze({ name: 'Error', message: REDACTED_MESSAGE, stack: `Error: ${REDACTED_MESSAGE}`, fingerprint: '0000', kind: 'unknown', code: null, redacted: true })

/**
 * يصنّف أي قيمة مُلتقَطة ويُرجع وصفاً آمناً فقط: name (قائمة سماح) / message (ثابت) / stack (إطارات مُعاد بناؤها) /
 * fingerprint / kind. لا يقرأ من الكائنات إلا حقول نصية بعينها (message/name/stack/code)، ولا يحوّل كائنات إلى نص.
 * @param {unknown} reason
 */
export function classifyException(reason) {
  try {
    const kind = kindOf(reason)
    let rawMessage = ''
    let rawName
    let rawStack
    let rawCode
    if (typeof reason === 'string') {
      rawMessage = reason
    } else if (isObjectLike(reason)) {
      if (typeof reason.message === 'string') rawMessage = reason.message
      if (typeof reason.name === 'string') rawName = reason.name
      if (typeof reason.stack === 'string') rawStack = reason.stack
      if (typeof reason.code === 'string') rawCode = reason.code
    }

    const name = rawName !== undefined && SAFE_NAMES.has(rawName) ? rawName : 'Error'
    const known = rawCode !== undefined ? SAFE_CODE_MESSAGES.get(rawCode) : undefined
    const message = known !== undefined ? known : REDACTED_MESSAGE
    const code = known !== undefined ? rawCode : null
    const fingerprint = shortHash(code ? `code:${code}` : `${kind}|${name}|${normalizeForFingerprint(rawMessage)}`)

    const header = `${name}: ${message}`
    const frames = safeFrames(rawStack, rawMessage)
    const stack = (frames.length > 0 ? `${header}\n${frames.join('\n')}` : header).slice(0, STACK_MAX)
    return { name, message, stack, fingerprint, kind, code, redacted: code === null }
  } catch {
    return FALLBACK
  }
}

/**
 * يبني Error جديداً آمناً من أي قيمة (لا يعدّل المُدخل). الرسالة إما ثابت قائمة السماح أو REDACTED_MESSAGE.
 * @param {unknown} reason
 * @returns {Error}
 */
export function toSafeError(reason) {
  const c = classifyException(reason)
  const safe = new Error(c.message)
  safe.name = c.name
  safe.stack = c.stack
  safeMeta.set(safe, { fingerprint: c.fingerprint, kind: c.kind, code: c.code, redacted: c.redacted })
  return safe
}
