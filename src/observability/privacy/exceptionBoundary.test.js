// @vitest-environment happy-dom
// اختبارات حدّ الاستثناءات (Phase 1.8F، ومسار الرسائل Default-Deny في Phase 1.8G). قيم اصطناعية فقط
// (SIMSIM_CANARY_* / FAKE_*) — لا أسرار حقيقية. تفاصيل السياسة نفسها في exceptionMessagePolicy.test.js.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('logrocket', () => ({
  default: { init: vi.fn(), captureException: vi.fn(), captureMessage: vi.fn() },
}))

import LogRocket from 'logrocket'
import { LogRocketErrorReporter } from '../providers/LogRocketErrorReporter'
import { toSafeError, installGlobalExceptionBoundary } from './exceptionBoundary'
import { REDACTED_MESSAGE } from './exceptionMessagePolicy'
import { AsyncTimeoutError } from '../../lib/asyncTimeout'

const SECRET = 'SIMSIM_CANARY_SECRET_001'
const EMAIL = 'simsim-canary-email-001@example.invalid'
const TOKEN = 'SIMSIM_CANARY_TOKEN_001_abcdefghijklmnopqrstuvwxyz0123456789'
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJTSU1TSU1fQ0FOQVJZIn0.c2lnbmF0dXJl'
const BEARER = 'SIMSIM_CANARY_BEARER_001'
const PLAIN = 'Order 928372 failed for customer 55192'
const dirtyMessage = `failed password=${SECRET} for ${EMAIL} with Bearer ${BEARER} jwt ${JWT} token ${TOKEN} https://api.example.invalid/x?token=${SECRET}#${SECRET} ${PLAIN}`
const dirtyStack = `Error: ${dirtyMessage}\n    at fn (https://app.example.invalid/assets/index-abc.js?v=${SECRET}:10:5)\n    at cb (https://app.example.invalid/assets/x.js#${SECRET}:1:1)`

const dump = (e) => JSON.stringify({ m: e.message, s: e.stack, n: e.name })
const expectClean = (e) => {
  const d = dump(e)
  for (const s of [SECRET, EMAIL, BEARER, JWT, TOKEN, 'token=', 'password=' + SECRET, '928372', '55192', 'customer']) expect(d).not.toContain(s)
}

describe('toSafeError (Default-Deny)', () => {
  it('Error: الرسالة محجوبة بالكامل، والاسم القياسي محفوظ، والنسخة جديدة', () => {
    const original = new TypeError(dirtyMessage)
    original.stack = dirtyStack
    const safe = toSafeError(original)
    expect(safe).not.toBe(original)
    expect(safe).toBeInstanceOf(Error)
    expect(safe.name).toBe('TypeError')
    expect(safe.message).toBe(REDACTED_MESSAGE)
    expectClean(safe)
  })

  it('Error.stack المحتوي على أسرار وعناوين بـquery/hash لا يُعيد إدخالها، ومواقع الإطارات تبقى', () => {
    const e = new Error('plain')
    e.stack = dirtyStack
    const safe = toSafeError(e)
    expectClean(safe)
    expect(safe.stack).toContain('https://app.example.invalid/assets/index-abc.js:10:5')
    expect(safe.stack).not.toMatch(/[?#]SIMSIM|\?v=/)
  })

  it('رسالة «غير حسّاسة» لا تُمرَّر أيضاً (تغيّر مقصود: Default-Deny)', () => {
    const e = new TypeError("Cannot read properties of undefined (reading 'items')")
    expect(toSafeError(e).message).toBe(REDACTED_MESSAGE)
  })

  it('لا يعدّل الخطأ الأصلي (حتى المُجمَّد)', () => {
    const original = new Error(dirtyMessage)
    original.extra = { password: SECRET }
    Object.freeze(original)
    const before = { message: original.message, stack: original.stack, name: original.name, keys: Object.keys(original) }
    const safe = toSafeError(original)
    expect(original.message).toBe(before.message)
    expect(original.stack).toBe(before.stack)
    expect(original.name).toBe(before.name)
    expect(Object.keys(original)).toEqual(before.keys)
    expect(Object.isFrozen(original)).toBe(true)
    expect(safe).not.toHaveProperty('extra')
  })

  it('لا يعدّل الخطأ/الكائن الأصلي غير المُجمَّد (ولا يضيف خصائص عليه)', () => {
    const snapshot = (o) => JSON.stringify(Object.getOwnPropertyNames(o).sort().map((k) => [k, String(Object.getOwnPropertyDescriptor(o, k).value)]))
    const err = new Error(dirtyMessage)
    err.custom = 'x'
    const reasonLike = { message: dirtyMessage, name: 'ApiError', response: { secret: SECRET } }
    const errBefore = snapshot(err)
    const likeBefore = snapshot(reasonLike)
    toSafeError(err)
    toSafeError(reasonLike)
    expect(snapshot(err)).toBe(errBefore)
    expect(snapshot(reasonLike)).toBe(likeBefore)
  })

  it('لا ينسخ حقولاً إضافية (response/config/cause) من الخطأ', () => {
    const e = new Error('x')
    e.response = { data: { access_token: SECRET } }
    e.config = { headers: { Authorization: `Bearer ${BEARER}` } }
    e.cause = new Error(SECRET)
    const safe = toSafeError(e)
    expect(JSON.stringify(Object.getOwnPropertyNames(safe).sort())).not.toMatch(/response|config|cause/)
    expect(dump(safe)).not.toContain(SECRET)
  })

  it.each([
    ['string', dirtyMessage],
    ['كائن بحقل message', { message: dirtyMessage, name: 'ApiError', response: { secret: SECRET } }],
  ])('rejection من نوع %s يُحجب', (_l, reason) => {
    const safe = toSafeError(reason)
    expect(safe.message).toBe(REDACTED_MESSAGE)
    expectClean(safe)
    expect(JSON.stringify(safe.message)).not.toContain('response')
  })

  it.each([
    ['كائن بلا message', { password: SECRET, email: EMAIL }],
    ['رقم', 42],
    ['null', null],
    ['undefined', undefined],
    ['مصفوفة', [SECRET]],
    ['دالة', () => SECRET],
    ['boolean', true],
  ])('%s: لا يُحوَّل إلى نص، ويُحجب', (_l, reason) => {
    const safe = toSafeError(reason)
    expect(safe.message).toBe(REDACTED_MESSAGE)
    expect(dump(safe)).not.toContain(SECRET)
    expect(dump(safe)).not.toContain(EMAIL)
  })

  it('رمز first-party معروف → رسالة ثابتة آمنة (لا الأصلية)', () => {
    const safe = toSafeError(new AsyncTimeoutError(`op for ${PLAIN}`, 1))
    expect(safe.message).toBe('Async operation timed out')
    expectClean(safe)
  })

  it('مُدخلات عدائية لا ترمي وتُرجع Error آمناً', () => {
    const cyclic = { message: 'x' }
    cyclic.self = cyclic
    const hostile = new Proxy({}, { get() { throw new Error(SECRET) } })
    const throwingMessage = { get message() { throw new Error(SECRET) } }
    for (const input of [hostile, throwingMessage, cyclic, Symbol('s'), 10n, Object.create(null)]) {
      expect(() => toSafeError(input)).not.toThrow()
      const safe = toSafeError(input)
      expect(safe).toBeInstanceOf(Error)
      expect(dump(safe)).not.toContain(SECRET)
    }
  })

  it('يقطع طول stack (≤ 2000) ورسالته ثابتة', () => {
    const e = new Error('a '.repeat(2000))
    e.stack = 'at x (y)\n'.repeat(1000)
    const safe = toSafeError(e)
    expect(safe.message).toBe(REDACTED_MESSAGE)
    expect(safe.stack.length).toBeLessThanOrEqual(2000)
  })
})

describe('installGlobalExceptionBoundary', () => {
  let uninstall
  afterEach(() => { if (uninstall) uninstall(); uninstall = undefined })

  const errorEvent = (error, extra = {}) => new ErrorEvent('error', { error, message: error?.message ?? String(error), cancelable: true, ...extra })
  const rejectionEvent = (reason) => { const e = new Event('unhandledrejection', { cancelable: true }); Object.defineProperty(e, 'reason', { value: reason }); return e }

  it('uncaught error: يمرّر القيمة الخام إلى report مرة واحدة مع سياق آمن، دون تعديل الحدث ولا منع سلوكه', () => {
    const report = vi.fn()
    uninstall = installGlobalExceptionBoundary(report, window)
    const err = new Error(dirtyMessage)
    const ev = errorEvent(err, { filename: `https://app.example.invalid/assets/a.js?t=${SECRET}#${SECRET}`, lineno: 12, colno: 3 })
    const notPrevented = window.dispatchEvent(ev)
    expect(notPrevented).toBe(true)
    expect(ev.defaultPrevented).toBe(false)
    expect(report).toHaveBeenCalledTimes(1)
    const [raw, context] = report.mock.calls[0]
    expect(raw).toBe(err)
    expect(context).toEqual({ source: 'window.error', lineno: 12, colno: 3, filename: 'https://app.example.invalid/assets/a.js' })
    expect(JSON.stringify(context)).not.toContain(SECRET)
  })

  it('unhandledrejection: Error/string/كائن — يمرّر reason كما هو ولا يمنع السلوك الافتراضي', () => {
    const report = vi.fn()
    uninstall = installGlobalExceptionBoundary(report, window)
    const reasons = [new Error(dirtyMessage), dirtyMessage, { message: dirtyMessage }, { secret: SECRET }, 7, null]
    for (const r of reasons) {
      const ev = rejectionEvent(r)
      expect(window.dispatchEvent(ev)).toBe(true)
      expect(ev.defaultPrevented).toBe(false)
    }
    expect(report).toHaveBeenCalledTimes(reasons.length)
    expect(report.mock.calls.map((c) => c[1].source)).toEqual(reasons.map(() => 'unhandledrejection'))
  })

  it('لا يعطّل مستمعين آخرين (لا stopPropagation)', () => {
    const other = vi.fn()
    window.addEventListener('error', other)
    uninstall = installGlobalExceptionBoundary(vi.fn(), window)
    window.dispatchEvent(errorEvent(new Error('x')))
    window.removeEventListener('error', other)
    expect(other).toHaveBeenCalledTimes(1)
  })

  it('يزيل التكرار لنفس الكائن ويحدّ العدد لكل صفحة', () => {
    const report = vi.fn()
    uninstall = installGlobalExceptionBoundary(report, window)
    const err = new Error('dup')
    window.dispatchEvent(errorEvent(err))
    window.dispatchEvent(rejectionEvent(err))
    expect(report).toHaveBeenCalledTimes(1)
    for (let i = 0; i < 300; i += 1) window.dispatchEvent(errorEvent(new Error(`e${i}`)))
    expect(report.mock.calls.length).toBeLessThanOrEqual(100)
  })

  it('لا يرمي إذا رمى report، ولا يؤثر على التطبيق', () => {
    uninstall = installGlobalExceptionBoundary(() => { throw new Error(SECRET) }, window)
    expect(() => window.dispatchEvent(errorEvent(new Error('x')))).not.toThrow()
    expect(() => window.dispatchEvent(rejectionEvent(new Error('x')))).not.toThrow()
  })

  it('حدث بلا error (Script error.) يمرَّر كنص خام إلى report (الحجب يحدث في toSafeError)', () => {
    const report = vi.fn()
    uninstall = installGlobalExceptionBoundary(report, window)
    window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }))
    expect(report.mock.calls[0][0]).toBe('Script error.')
    expect(toSafeError(report.mock.calls[0][0]).message).toBe(REDACTED_MESSAGE)
  })

  it('يُلغى التثبيت بدالة الإلغاء، وبلا هدف/بلا report لا يفعل شيئاً', () => {
    const report = vi.fn()
    const off = installGlobalExceptionBoundary(report, window)
    off()
    window.dispatchEvent(errorEvent(new Error('after')))
    expect(report).not.toHaveBeenCalled()
    expect(typeof installGlobalExceptionBoundary(null, window)).toBe('function')
    expect(typeof installGlobalExceptionBoundary(report, null)).toBe('function')
  })
})

describe('LogRocketErrorReporter — مسار الاستثناءات من طرف لطرف', () => {
  const created = []
  const makeReporter = () => { const r = new LogRocketErrorReporter(); created.push(r); return r }
  beforeEach(() => {
    LogRocket.init.mockClear()
    LogRocket.captureException.mockClear()
    vi.stubEnv('VITE_LOGROCKET_APP_ID', 'test-org/test-project')
    vi.stubEnv('DEV', false)
  })
  afterEach(() => { while (created.length) created.pop().dispose(); vi.unstubAllEnvs() })

  const rejection = (reason) => { const e = new Event('unhandledrejection'); Object.defineProperty(e, 'reason', { value: reason }); return e }

  it('uncaught error و unhandledrejection يُرسلان إلى LogRocket كنسخة آمنة فقط، ولا يصل أي خام', () => {
    const reporter = makeReporter()
    expect(LogRocket.init).toHaveBeenCalledTimes(1)
    expect(LogRocket.init.mock.calls[0][1].shouldDetectExceptions).toBe(false)
    const err = new Error(dirtyMessage); err.stack = dirtyStack
    window.dispatchEvent(new ErrorEvent('error', { error: err, message: err.message, filename: 'https://app.example.invalid/a.js?x=1', lineno: 1, colno: 2 }))
    window.dispatchEvent(rejection({ message: dirtyMessage, password: SECRET }))
    window.dispatchEvent(rejection(dirtyMessage))
    expect(LogRocket.captureException).toHaveBeenCalledTimes(3)
    for (const [sent, opts] of LogRocket.captureException.mock.calls) {
      expect(sent).toBeInstanceOf(Error)
      expect(sent).not.toBe(err)
      expect(sent.message).toBe(REDACTED_MESSAGE)
      expectClean(sent)
      expect(JSON.stringify(opts)).not.toContain(SECRET)
      expect(JSON.stringify(opts)).not.toMatch(/928372|55192|customer/)
      expect(Object.values(opts.extra).every((v) => ['string', 'number', 'boolean'].includes(typeof v))).toBe(true)
      expect(opts.extra.fingerprint).toMatch(/^[0-9a-f]{4}$/)
      expect(opts.extra.messageRedacted).toBe(true)
    }
    expect(LogRocket.captureException.mock.calls[0][1].extra).toMatchObject({ source: 'window.error', lineno: 1, colno: 2, filename: 'https://app.example.invalid/a.js', valueKind: 'error' })
    expect(LogRocket.captureException.mock.calls[1][1].extra.valueKind).toBe('object')
    expect(LogRocket.captureException.mock.calls[2][1].extra.valueKind).toBe('string')
    reporter.captureMessage('done')
  })

  it('explicit captureException: الرسالة محجوبة، والمكوّن/المصدر يبقيان منظَّفين', () => {
    const reporter = makeReporter()
    reporter.captureException(new Error(dirtyMessage), { source: 'RootErrorBoundary', componentStack: `at X (${TOKEN}) ${EMAIL}` })
    const [sent, opts] = LogRocket.captureException.mock.calls.at(-1)
    expect(sent.message).toBe(REDACTED_MESSAGE)
    expectClean(sent)
    expect(JSON.stringify(opts)).not.toMatch(new RegExp(`${EMAIL}|${TOKEN}`))
    expect(opts.extra.source).toBe('RootErrorBoundary')
  })

  it('رمز first-party معروف: رسالة ثابتة + errorCode، ولا نص أصلي', () => {
    const reporter = makeReporter()
    reporter.captureException(new AsyncTimeoutError(PLAIN, 5))
    const [sent, opts] = LogRocket.captureException.mock.calls.at(-1)
    expect(sent.message).toBe('Async operation timed out')
    expect(sent.name).toBe('AsyncTimeoutError')
    expect(opts.extra).toMatchObject({ errorCode: 'SIMSIM_ASYNC_TIMEOUT', messageRedacted: false })
    expect(JSON.stringify([sent.message, sent.stack, opts])).not.toMatch(/928372|55192/)
  })

  it('إعادة تشغيل حمولات canary المرحلة 1.8F (F1–F5): لا علامة ولا قيمة شكلية تصل إلى LogRocket، والمراقبة باقية', () => {
    makeReporter()
    const MARKERS = ['SIMSIM_CANARY_SECRET_001', 'SIMSIM_CANARY_EMAIL_001', 'SIMSIM_CANARY_TOKEN_001', 'SIMSIM_CANARY_BEARER_001', 'SIMSIM_CANARY_LONGTOKEN_001']
    const shaped = `F5 shaped password=${SECRET} token=SIMSIM_CANARY_TOKEN_001 user ${EMAIL} Bearer SIMSIM_CANARY_BEARER_001 jwt ${JWT} url https://staging-canary.invalid/x?code=SIMSIM_CANARY_TOKEN_001#SIMSIM_CANARY_SECRET_001 long SIMSIM_CANARY_LONGTOKEN_001_abcdefghijklmnopqrstuvwxyz`
    const f3 = new Error('F3 sensitive stack')
    f3.stack = `Error: F3 sensitive stack\n    at eval (http://127.0.0.1/__c/f3-eval.js?code=SIMSIM_CANARY_TOKEN_001#SIMSIM_CANARY_SECRET_001:1:1)`
    const f1 = new Error('F1 boom SIMSIM_CANARY_SECRET_001 SIMSIM_CANARY_EMAIL_001')
    const events = [
      () => window.dispatchEvent(new ErrorEvent('error', { error: f1, message: f1.message })),
      () => window.dispatchEvent(rejection(new Error('F2 rejection SIMSIM_CANARY_TOKEN_001'))),
      () => window.dispatchEvent(rejection('F2 string SIMSIM_CANARY_SECRET_001')),
      () => window.dispatchEvent(new ErrorEvent('error', { error: f3, message: f3.message, filename: 'http://127.0.0.1/__c/f3-eval.js?code=SIMSIM_CANARY_TOKEN_001#SIMSIM_CANARY_SECRET_001', lineno: 1, colno: 1 })),
      () => window.dispatchEvent(new ErrorEvent('error', { error: new Error(shaped), message: shaped })),
      () => window.dispatchEvent(rejection(`F5 rejection ${shaped}`)),
    ]
    events.forEach((fire) => fire())
    const reporter = created[0]
    reporter.captureException(new Error(`F4 explicit ${SECRET} ${EMAIL} SIMSIM_CANARY_TOKEN_001 password=${SECRET}`), { source: 'RootErrorBoundary' })
    const calls = LogRocket.captureException.mock.calls
    expect(calls).toHaveLength(7)
    const all = JSON.stringify(calls.map(([sent, opts]) => [sent.name, sent.message, sent.stack, opts]))
    for (const m of [...MARKERS, 'simsim-canary-email-001', 'eyJhbGci', 'password=', 'code=', '#SIMSIM']) expect(all).not.toContain(m)
    for (const [sent, opts] of calls) {
      expect(sent.message).toBe(REDACTED_MESSAGE)
      expect(opts.extra.fingerprint).toMatch(/^[0-9a-f]{4}$/)
    }
    expect(calls[3][0].stack).toContain('/__c/f3-eval.js:1:1')
  })

  it('لا حدّ في DEV ولا بلا App ID (لا مستمعين تُثبَّت)', () => {
    vi.stubEnv('DEV', true)
    makeReporter()
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('x'), message: 'x' }))
    expect(LogRocket.captureException).not.toHaveBeenCalled()
  })
})
