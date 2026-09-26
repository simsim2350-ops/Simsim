// اختبارات سياسة رسائل الاستثناءات (Phase 1.8G): Default-Deny. قيم اصطناعية فقط — لا بيانات عملاء ولا أسرار حقيقية.
import { describe, it, expect } from 'vitest'
import { classifyException, toSafeError, safeErrorMeta, REDACTED_MESSAGE, SAFE_ERROR_CODES } from './exceptionMessagePolicy'
import { scrubErrorText } from './networkPolicy'
import { IntegrationError, IntegrationErrorCode, ApplicationError, ExternalApiError } from '../../integration/errors'
import { AsyncTimeoutError } from '../../lib/asyncTimeout'

const SECRET = 'SIMSIM_CANARY_SECRET_001'
const EMAIL = 'SIMSIM_CANARY_EMAIL_001'
const TOKEN = 'SIMSIM_CANARY_TOKEN_001'
const dump = (e) => JSON.stringify({ m: e.message, s: e.stack, n: e.name })

const withStack = (err, stack) => { err.stack = stack; return err }
const v8Stack = (header) => `${header}\n    at createOrder (https://app.example.invalid/assets/order-1a2b3c.js?token=${TOKEN}:184:9)\n    at https://app.example.invalid/assets/x.js#${SECRET}:1:1`

describe('1–4: رسالة Error عادية بقيم تطبيق عادية → REDACTED', () => {
  it('قيم عادية لا تطابق أي نمط سرّي', () => {
    const e = withStack(new Error('Order 928372 failed for customer 55192'), v8Stack('Error: Order 928372 failed for customer 55192'))
    const safe = toSafeError(e)
    expect(safe.message).toBe(REDACTED_MESSAGE)
    expect(dump(safe)).not.toMatch(/928372|55192|customer|failed for/i)
  })

  it.each([
    ['SIMSIM_CANARY_SECRET_001', SECRET],
    ['SIMSIM_CANARY_EMAIL_001', EMAIL],
    ['SIMSIM_CANARY_TOKEN_001', TOKEN],
  ])('العلامة %s لا تظهر في message/stack/name', (_l, marker) => {
    const msg = `boom ${marker} ${marker}`
    const safe = toSafeError(withStack(new Error(msg), v8Stack(`Error: ${msg}`)))
    expect(safe.message).toBe(REDACTED_MESSAGE)
    expect(dump(safe)).not.toContain(marker)
    expect(dump(safe)).not.toContain('SIMSIM_CANARY')
  })

  it('بريد حقيقي الشكل وسرّيات مشكّلة → لا شيء منها (الرسالة كلها محجوبة)', () => {
    const msg = 'x simsim-canary-email-001@example.invalid Bearer SIMSIM_CANARY_BEARER_001 password=SIMSIM_CANARY_SECRET_001'
    const safe = toSafeError(new Error(msg))
    expect(safe.message).toBe(REDACTED_MESSAGE)
    expect(dump(safe)).not.toMatch(/simsim-canary|BEARER|password|SECRET/i)
  })
})

describe('5–7: unhandled rejection (Error / string / object)', () => {
  it('Error → منظَّف', () => {
    const safe = toSafeError(new TypeError(`F2 rejection ${TOKEN}`))
    expect(safe.name).toBe('TypeError')
    expect(safe.message).toBe(REDACTED_MESSAGE)
    expect(safeErrorMeta(safe).kind).toBe('error')
    expect(dump(safe)).not.toContain(TOKEN)
  })

  it('string → default-deny', () => {
    const safe = toSafeError(`F2 string ${SECRET}`)
    expect(safe.message).toBe(REDACTED_MESSAGE)
    expect(safeErrorMeta(safe).kind).toBe('string')
    expect(dump(safe)).not.toContain(SECRET)
  })

  it.each([
    ['كائن بحقل message وحقول أخرى', { message: `m ${SECRET}`, name: 'ApiError', response: { data: EMAIL }, code: `x${TOKEN}` }, 'object'],
    ['كائن بلا message', { password: SECRET, email: EMAIL, nested: { token: TOKEN } }, 'object'],
    ['مصفوفة', [SECRET, { EMAIL }], 'array'],
    ['كائن بـtoString/toJSON خبيثة', { toString: () => SECRET, toJSON: () => ({ SECRET }) }, 'object'],
  ])('%s: لا تسلسل خام للكائن', (_l, reason, kind) => {
    const safe = toSafeError(reason)
    expect(safe.message).toBe(REDACTED_MESSAGE)
    expect(safe.name).toBe('Error')
    expect(safeErrorMeta(safe).kind).toBe(kind)
    const d = dump(safe) + JSON.stringify(safeErrorMeta(safe))
    for (const s of [SECRET, EMAIL, TOKEN, 'response', 'nested', 'password']) expect(d).not.toContain(s)
  })

  it.each([[42, 'number'], [null, 'null'], [undefined, 'undefined'], [true, 'boolean'], [() => SECRET, 'function'], [Symbol('s'), 'symbol'], [10n, 'bigint']])(
    'قيمة غير قابلة للتصنيف %s → REDACTED مع kind فقط', (reason, kind) => {
      const safe = toSafeError(reason)
      expect(safe.message).toBe(REDACTED_MESSAGE)
      expect(safeErrorMeta(safe).kind).toBe(kind)
      expect(dump(safe)).not.toContain(SECRET)
    })
})

describe('8–9: قائمة السماح (رموز first-party)', () => {
  it('كل رمز في القائمة → رسالة ثابتة يملكها الملف، لا الأصلية', () => {
    for (const code of SAFE_ERROR_CODES) {
      const safe = toSafeError(Object.assign(new Error(`free text ${SECRET} order 928372`), { code }))
      expect(safe.message).not.toBe(REDACTED_MESSAGE)
      expect(safe.message).not.toContain('928372')
      expect(dump(safe)).not.toContain(SECRET)
      expect(safeErrorMeta(safe)).toMatchObject({ code, redacted: false })
    }
  })

  it('AsyncTimeoutError الفعلي (كود SIMSIM_ASYNC_TIMEOUT) → رسالة آمنة واسم محفوظ', () => {
    const safe = toSafeError(new AsyncTimeoutError('load orders for customer 55192', 12000))
    expect(safe.name).toBe('AsyncTimeoutError')
    expect(safe.message).toBe('Async operation timed out')
    expect(dump(safe)).not.toContain('55192')
  })

  it('IntegrationError بكود معروف ورسالة حرّة → الرسالة الثابتة فقط', () => {
    const safe = toSafeError(new IntegrationError({ code: IntegrationErrorCode.PROVIDER_NOT_REGISTERED, capability: 'payments', provider: 'acme', message: `لا مزوّد مُسجَّل: payments:acme ${SECRET}` }))
    expect(safe.name).toBe('IntegrationError')
    expect(safe.message).toBe('Integration error: provider_not_registered')
    expect(dump(safe)).not.toMatch(/acme|payments|SECRET/)
  })

  it('خطأ first-party برمز غير موجود في القائمة → REDACTED (لا افتراض)', () => {
    const app = toSafeError(new ApplicationError({ code: 'order_928372_failed', message: 'Order 928372 failed' }))
    expect(app.name).toBe('ApplicationError')
    expect(app.message).toBe(REDACTED_MESSAGE)
    const ext = toSafeError(new ExternalApiError('Provider said: customer 55192 declined', { provider: 'acme', statusCode: 402, raw: { card: '4111' } }))
    expect(ext.message).toBe(REDACTED_MESSAGE)
    expect(dump(ext)).not.toMatch(/55192|acme|4111/)
    const plain = toSafeError(new Error('order failed'))
    expect(plain.message).toBe(REDACTED_MESSAGE)
  })

  it('القائمة متزامنة مع الرموز المعرَّفة فعلاً في التطبيق (لا انحراف)', () => {
    const expected = ['SIMSIM_ASYNC_TIMEOUT', ...Object.values(IntegrationErrorCode)].sort()
    expect([...SAFE_ERROR_CODES].sort()).toEqual(expected)
    expect(new AsyncTimeoutError('x', 1).code).toBe('SIMSIM_ASYNC_TIMEOUT')
  })

  it('الرسائل الثابتة لا تحوي أي كلمة حسّاسة ولا تتغيّر بالمُنظِّف', () => {
    for (const code of SAFE_ERROR_CODES) {
      const { message } = classifyException({ message: 'x', code })
      expect(message).not.toMatch(/password|passwd|secret|token|email|phone|authorization|cookie|bearer|jwt|credential|otp|@|https?:|[?#=]/i)
      expect(scrubErrorText(message)).toBe(message)
      expect(message.length).toBeLessThanOrEqual(80)
    }
    expect(REDACTED_MESSAGE).toBe('[REDACTED_EXCEPTION_MESSAGE]')
  })
})

describe('10–11: تنظيف stack', () => {
  const build = () => withStack(new Error(`boom ${SECRET}`), v8Stack(`Error: boom ${SECRET}`))

  it('query محذوف من عناوين الإطارات (?token=…)', () => {
    const safe = toSafeError(build())
    expect(safe.stack).not.toContain(TOKEN)
    expect(safe.stack).not.toContain('token=')
    expect(safe.stack).toContain('https://app.example.invalid/assets/order-1a2b3c.js:184:9')
  })

  it('hash محذوف (#…)', () => {
    const safe = toSafeError(build())
    expect(safe.stack).not.toContain(SECRET)
    expect(safe.stack).not.toContain('#')
    expect(safe.stack).toContain('https://app.example.invalid/assets/x.js:1:1')
  })

  it('رأس الـstack يُعاد بناؤه: لا رسالة أصلية، والبنية والمواقع تبقى', () => {
    const safe = toSafeError(withStack(new Error('Order 928372 failed for customer 55192'), v8Stack('Error: Order 928372 failed for customer 55192')))
    expect(safe.stack).toBe([
      `Error: ${REDACTED_MESSAGE}`,
      '    at createOrder (https://app.example.invalid/assets/order-1a2b3c.js:184:9)',
      '    at <anonymous> (https://app.example.invalid/assets/x.js:1:1)',
    ].join('\n'))
  })

  it('رسالة متعدّدة الأسطر تحوي أسطراً شبيهة بالإطارات: تُقتطع مع الرأس ولا تتسرّب', () => {
    const msg = 'failed\n    at customer55192 (https://evil.example.invalid/customers/55192:1:1)\nfor Mohammed'
    const stack = `Error: ${msg}\n    at real (https://app.example.invalid/assets/a.js:5:6)`
    const safe = toSafeError(withStack(new Error(msg), stack))
    expect(safe.stack).toBe(`Error: ${REDACTED_MESSAGE}\n    at real (https://app.example.invalid/assets/a.js:5:6)`)
    expect(dump(safe)).not.toMatch(/55192|Mohammed|evil/)
  })

  it('رأس بلا مطابقة بالاسم (الاسم عُدِّل بعد الإنشاء) ما زال يُقتطع', () => {
    const e = new AsyncTimeoutError('op with customer 55192', 1)
    e.stack = `Error: ${e.message}\n    at run (https://app.example.invalid/assets/a.js:9:9)`
    const safe = toSafeError(e)
    expect(safe.stack).toBe('AsyncTimeoutError: Async operation timed out\n    at run (https://app.example.invalid/assets/a.js:9:9)')
  })

  it('صيغة Firefox/Safari (بلا رأس) تُحلَّل وتُنظَّف ولا يُسقَط أول إطار', () => {
    const stack = `createOrder@https://app.example.invalid/assets/o.js?token=${TOKEN}:12:34\n@https://app.example.invalid/assets/p.js#${SECRET}:1:2`
    const safe = toSafeError(withStack(new Error(`m ${SECRET}`), stack))
    expect(safe.stack).toBe(`Error: ${REDACTED_MESSAGE}\n    at createOrder (https://app.example.invalid/assets/o.js:12:34)\n    at <anonymous> (https://app.example.invalid/assets/p.js:1:2)`)
  })

  it('إطارات بمواقع غير http(s) أو أسماء دوال غير صالحة → قيم محايدة بلا نص حرّ', () => {
    const stack = 'Error: x\n    at customer 55192 (https://app.example.invalid/a.js:1:1)\n    at fn (webpack-internal:///./secret/path.js:2:2)\n    at eval (eval at evaluate (:311:30), <anonymous>:1:1)\n    at not a frame Mohammed'
    const safe = toSafeError(withStack(new Error('x'), stack))
    expect(safe.stack).toContain('    at <anonymous> (https://app.example.invalid/a.js:1:1)')
    expect(safe.stack).toContain('    at fn (<unknown>:2:2)')
    expect(dump(safe)).not.toMatch(/55192|Mohammed|secret\/path/)
  })

  it('يحدّ عدد الإطارات والطول', () => {
    const many = Array.from({ length: 200 }, (_, i) => `    at f${i} (https://app.example.invalid/a.js:${i + 1}:1)`).join('\n')
    const safe = toSafeError(withStack(new Error('x'), `Error: x\n${many}`))
    expect(safe.stack.split('\n').length).toBeLessThanOrEqual(16)
    expect(safe.stack.length).toBeLessThanOrEqual(2000)
  })

  it('لا stack ⇒ رأس آمن فقط', () => {
    const e = new Error('x'); e.stack = undefined
    expect(toSafeError(e).stack).toBe(`Error: ${REDACTED_MESSAGE}`)
  })
})

describe('Phase 8: اختبارات عدائية ضد التنظيف بالأنماط فقط', () => {
  const adversarial = [
    'customer 928372', 'order 928372', 'user 55192', 'session 918273', 'reference 123456789',
    'Failed for Mohammed', 'Email is Mohammed@example.test', 'Bearer ABC123', 'token ABC123',
    'شكراً يا محمد طلب رقم 4471', 'x'.repeat(31), 'https://api.example.invalid/orders/928372/items',
  ]

  it.each(adversarial)('"%s" كرسالة Error/string/كائن → لا تُمرَّر مطلقاً', (text) => {
    const outputs = [
      toSafeError(new Error(text)),
      toSafeError(withStack(new Error(text), `Error: ${text}\n    at f (https://app.example.invalid/a.js:1:1)`)),
      toSafeError(text),
      toSafeError({ message: text }),
      toSafeError(Object.assign(new Error(text), { name: text })),
    ]
    for (const safe of outputs) {
      expect(safe.message).toBe(REDACTED_MESSAGE)
      expect(safe.name).toBe('Error')
      const d = dump(safe) + JSON.stringify(safeErrorMeta(safe))
      for (const piece of text.split(/\s+/).filter((p) => p.length >= 4 && !/^(Error|Failed|Email|token|Bearer)$/i.test(p))) expect(d).not.toContain(piece)
    }
  })

  it('انتحال الرمز: نص الرمز في الرسالة، أو رمز بنوع/شكل مختلف، أو مفاتيح النموذج الأولي → REDACTED', () => {
    const spoofs = [
      new Error('SIMSIM_ASYNC_TIMEOUT'), // النص وحده لا يكفي: يجب أن يكون code
      Object.assign(new Error('x'), { code: 'TIMEOUT' }), // حالة أحرف مختلفة
      Object.assign(new Error('x'), { code: ' timeout' }),
      Object.assign(new Error('x'), { code: 'timeout\n' }),
      Object.assign(new Error('x'), { code: '__proto__' }),
      Object.assign(new Error('x'), { code: 'constructor' }),
      Object.assign(new Error('x'), { code: 'toString' }),
      Object.assign(new Error('x'), { code: { toString: () => 'timeout' } }),
      Object.assign(new Error('x'), { code: ['timeout'] }),
      Object.assign(new Error('x'), { code: new String('timeout') }),
      Object.assign(new Error('x'), { code: 408 }),
    ]
    for (const e of spoofs) {
      const safe = toSafeError(e)
      expect(safe.message).toBe(REDACTED_MESSAGE)
      expect(safeErrorMeta(safe).code).toBeNull()
    }
  })

  it('انتحال الاسم: اسم حرّ (قد يحوي بيانات) → Error', () => {
    for (const name of ['Order 928372 failed', 'ApiError', 'CustomerError', 'error', 'TYPEERROR', 'Error\n at x', SECRET]) {
      const safe = toSafeError(Object.assign(new Error('x'), { name }))
      expect(safe.name).toBe('Error')
    }
    expect(toSafeError(new RangeError('x')).name).toBe('RangeError')
  })

  it('رسالة تحوي نص رسالة ثابتة من القائمة لا تكسب أي امتياز', () => {
    expect(toSafeError(new Error('Async operation timed out')).message).toBe(REDACTED_MESSAGE)
    expect(toSafeError('Integration error: timeout').message).toBe(REDACTED_MESSAGE)
  })
})

describe('fingerprint: تجميع بلا نص أصلي', () => {
  const fp = (x) => safeErrorMeta(toSafeError(x)).fingerprint

  it('قصير (4 hex) ومستقر ولا يحوي أي جزء من الرسالة', () => {
    const a = fp(new Error(`Order 928372 failed ${SECRET}`))
    expect(a).toMatch(/^[0-9a-f]{4}$/)
    expect(fp(new Error(`Order 928372 failed ${SECRET}`))).toBe(a)
    expect(a).not.toContain('SECRET')
  })

  it('يوحّد الرسائل المتشابهة بنيوياً (الأرقام) ويفرّق القوالب المختلفة', () => {
    expect(fp(new Error('Order 111 failed for customer 222'))).toBe(fp(new Error('Order 999 failed for customer 4')))
    expect(fp(new Error('Order 111 failed'))).not.toBe(fp(new Error('Payment 111 declined')))
  })

  it('ليس مرجعاً لاستعادة القيم: قاموس من 300 ألف اسم يعطي عدة مرشّحين لنفس الهاش (16 بت)', () => {
    const target = classifyException(new Error('Failed for Mohammed')).fingerprint
    const alphabet = 'abcdefghijklmnopqrstuvwxyz'
    let matches = 0
    for (let i = 0; i < 300000; i += 1) {
      let n = i
      let name = ''
      for (let k = 0; k < 5; k += 1) { name += alphabet[n % 26]; n = Math.floor(n / 26) }
      if (classifyException({ message: `Failed for ${name}` }).fingerprint === target) matches += 1
    }
    expect(matches).toBeGreaterThanOrEqual(2)
  })

  it('رمز القائمة يُجمَّع بالرمز لا بالنص', () => {
    const a = fp(Object.assign(new Error('one'), { code: 'timeout' }))
    const b = fp(Object.assign(new Error('two 928372'), { code: 'timeout' }))
    expect(a).toBe(b)
  })
})

describe('سلامة السياسة', () => {
  it('لا تعدّل المُدخل (حتى المُجمَّد) ولا تضيف عليه خصائص', () => {
    const e = Object.assign(new Error(`m ${SECRET}`), { code: 'timeout', extra: { password: SECRET } })
    Object.freeze(e)
    const before = JSON.stringify({ m: e.message, s: e.stack, k: Object.getOwnPropertyNames(e) })
    toSafeError(e)
    expect(JSON.stringify({ m: e.message, s: e.stack, k: Object.getOwnPropertyNames(e) })).toBe(before)
    const like = { message: 'x', response: { s: SECRET } }
    const snap = JSON.stringify(Object.getOwnPropertyNames(like))
    toSafeError(like)
    expect(JSON.stringify(Object.getOwnPropertyNames(like))).toBe(snap)
  })

  it('النسخة الآمنة جديدة، بلا حقول إضافية (response/config/cause/errors)، ولا cause', () => {
    const e = new Error('x', { cause: new Error(SECRET) })
    e.response = { data: EMAIL }
    const safe = toSafeError(e)
    expect(safe).not.toBe(e)
    expect(Object.getOwnPropertyNames(safe).sort()).toEqual(['message', 'name', 'stack'])
    expect(safe.cause).toBeUndefined()
    expect(toSafeError(new AggregateError([new Error(SECRET)], 'agg')).errors).toBeUndefined()
  })

  it('مُدخلات عدائية لا ترمي (Proxy، getters ترمي، دائرية…)', () => {
    const cyclic = { message: 'x' }; cyclic.self = cyclic
    const hostile = new Proxy({}, { get() { throw new Error(SECRET) }, has() { throw new Error(SECRET) } })
    const throwing = { get message() { throw new Error(SECRET) } }
    const throwingStack = Object.defineProperty(new Error('x'), 'stack', { get() { throw new Error(SECRET) } })
    for (const input of [hostile, throwing, throwingStack, cyclic, Symbol('s'), 10n, Object.create(null)]) {
      expect(() => toSafeError(input)).not.toThrow()
      const safe = toSafeError(input)
      expect(safe).toBeInstanceOf(Error)
      expect(safe.message).toBe(REDACTED_MESSAGE)
      expect(dump(safe)).not.toContain(SECRET)
    }
  })

  it('لا يحوّل الكائنات إلى نص أبداً (لا JSON.stringify/String على reason)', () => {
    let touched = 0
    const trap = { get message() { touched += 1; return 'x' }, toString() { touched += 100; return SECRET }, toJSON() { touched += 100; return SECRET } }
    toSafeError(trap)
    expect(touched).toBeLessThan(100)
  })
})
