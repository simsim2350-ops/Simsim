// اختبارات سياسة الخصوصية Default-Deny لـLogRocket (Phase 1.8E). كل الأسرار هنا canaries وهمية فقط.
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  PRODUCTION_POLICY,
  createNetworkSanitizers,
  sanitizePageUrl,
  scrubErrorText,
  buildLogRocketOptions,
} from './networkPolicy'

const C = {
  password: 'FAKE_PASSWORD_8f31c2',
  access: 'FAKE_ACCESS_TOKEN_8f31c2',
  refresh: 'FAKE_REFRESH_TOKEN_8f31c2',
  bearer: 'FAKE_BEARER_8f31c2',
  email: 'fake-user@example.invalid',
  order: 'FAKE_ORDER_TOKEN_8f31c2xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
}
const CANARIES = Object.values(C)
const expectNoCanary = (value) => {
  const s = JSON.stringify(value ?? null)
  for (const c of CANARIES) expect(s).not.toContain(c)
}

const ASSETS = 'assets.example.invalid'
const SB = 'abcd1234.supabase.example.invalid'
const assetsEntry = { host: ASSETS, methods: ['GET'], pathPattern: /^\/static\/[\w.-]+\.js$/ }
const ordersEntry = { host: SB, methods: ['GET'], pathPattern: /^\/rest\/v1\/orders$/ }
const allowAssets = { mode: 'metadata', allow: [assetsEntry] }
const allowOrders = { mode: 'metadata', allow: [assetsEntry, ordersEntry] }

// طلب "كما يراه الـSDK" محمّلاً بكل أنواع الأسرار.
const makeRequest = (url, extra = {}) => ({
  reqId: 'fetch-1',
  url,
  method: 'GET',
  headers: { Authorization: `Bearer ${C.bearer}`, authorization: `Bearer ${C.bearer}`, apikey: C.access, Cookie: `sid=${C.refresh}` },
  body: JSON.stringify({ email: C.email, password: C.password, access_token: C.access, refresh_token: C.refresh, order_access_token: C.order }),
  referrer: `https://${ASSETS}/page?token=${C.access}#access_token=${C.access}`,
  mode: 'cors',
  credentials: 'include',
  ...extra,
})
const okAssetUrl = `https://${ASSETS}/static/app.js`
const sanitize = (policy, request) => createNetworkSanitizers(policy).requestSanitizer(request)

afterEach(() => { vi.unstubAllGlobals() })

describe('PRODUCTION_POLICY', () => {
  it('الافتراضي الوحيد: mode=off و allow=[] ومُجمَّد', () => {
    expect(PRODUCTION_POLICY.mode).toBe('off')
    expect(PRODUCTION_POLICY.allow).toEqual([])
    expect(Object.isFrozen(PRODUCTION_POLICY)).toBe(true)
    expect(Object.isFrozen(PRODUCTION_POLICY.allow)).toBe(true)
  })
  it('بلا policy => مُغلق (isEnabled=false) وكل طلب null', () => {
    const s = createNetworkSanitizers()
    expect(s.isEnabled).toBe(false)
    expect(s.requestSanitizer(makeRequest(okAssetUrl))).toBeNull()
  })
})

describe('requestSanitizer — default deny', () => {
  it('1) mode off => null لكل طلب حتى لو كانت allowlist صالحة', () => {
    const s = createNetworkSanitizers({ mode: 'off', allow: [assetsEntry] })
    expect(s.isEnabled).toBe(false)
    for (const url of [okAssetUrl, `https://${SB}/rest/v1/orders`, `https://${SB}/functions/v1/dashboard-login-guard`]) {
      expect(s.requestSanitizer(makeRequest(url))).toBeNull()
    }
  })

  it('2) allowlist فارغة أو غير صالحة => null و isEnabled=false', () => {
    for (const policy of [{ mode: 'metadata', allow: [] }, { mode: 'metadata' }, { mode: 'metadata', allow: 'x' }, { mode: 'bodies', allow: [assetsEntry] }]) {
      const s = createNetworkSanitizers(policy)
      expect(s.isEnabled).toBe(false)
      expect(s.requestSanitizer(makeRequest(okAssetUrl))).toBeNull()
    }
  })

  it('3) endpoint غير معروف / host آخر / فعل غير مسموح => null', () => {
    for (const request of [
      makeRequest(`https://${ASSETS}/api/private`),
      makeRequest(`https://other.example.invalid/static/app.js`),
      makeRequest(okAssetUrl, { method: 'POST' }),
      makeRequest(`https://${ASSETS}/static/app.js.map`),
    ]) expect(sanitize(allowAssets, request)).toBeNull()
  })

  it('4) dashboard-login-guard => null (حتى مع allowlist لنفس الـhost)', () => {
    const req = makeRequest(`https://${SB}/functions/v1/dashboard-login-guard`, { method: 'POST' })
    expect(sanitize(allowOrders, req)).toBeNull()
    expect(sanitize(allowOrders, makeRequest(`https://${SB}/functions/v1/dashboard-login-guard?x=1`, { method: 'POST' }))).toBeNull()
  })

  it('5) create-platform-admin => null', () => {
    expect(sanitize(allowOrders, makeRequest(`https://${SB}/functions/v1/create-platform-admin`, { method: 'POST' }))).toBeNull()
  })

  it('6) Supabase Auth => null', () => {
    for (const path of ['/auth/v1/token?grant_type=password', '/auth/v1/signup', '/auth/v1/recover', '/auth/v1/user', '/auth/v1/logout', '/auth/v1/verify']) {
      expect(sanitize(allowOrders, makeRequest(`https://${SB}${path}`, { method: 'POST' }))).toBeNull()
    }
  })

  it('7) Supabase REST => null ما لم يُسمح به صراحةً؛ وعند السماح: بلا query', () => {
    const url = `https://${SB}/rest/v1/orders?select=*&email=eq.${C.email}`
    expect(sanitize(allowAssets, makeRequest(url))).toBeNull()
    const out = sanitize(allowOrders, makeRequest(url))
    expect(out).toEqual({ url: `https://${SB}/rest/v1/orders`, headers: {} })
    expectNoCanary(out)
  })
})

describe('requestSanitizer — لا يُرجَع إلا { url, headers: {} }', () => {
  const out = () => sanitize(allowAssets, makeRequest(okAssetUrl))

  it('الشكل الوحيد: url + headers فارغة (8, 10, 20–23)', () => {
    const result = out()
    expect(result).toEqual({ url: okAssetUrl, headers: {} })
    expect(Object.keys(result).sort()).toEqual(['headers', 'url'])
    expectNoCanary(result)
  })

  it('8/9/20/21/22/23) لا body ولا referrer ولا mode ولا credentials ولا method ولا reqId', () => {
    const result = out()
    for (const key of ['body', 'referrer', 'mode', 'credentials', 'method', 'reqId']) expect(result).not.toHaveProperty(key)
  })

  it.each(['Authorization', 'authorization', 'AUTHORIZATION', 'Cookie', 'cookie', 'Set-Cookie', 'apikey', 'X-Api-Key'])(
    '10–14) الـheader %s لا يظهر أبداً',
    (name) => {
      const result = sanitize(allowAssets, makeRequest(okAssetUrl, { headers: { [name]: `Bearer ${C.bearer} ${C.access}` } }))
      expect(result.headers).toEqual({})
      expectNoCanary(result)
    },
  )

  it('headers كـHeaders instance (تُلتقط بأسماء lowercase) => لا تظهر', () => {
    const headers = new Headers({ Authorization: `Bearer ${C.bearer}`, apikey: C.access })
    const result = sanitize(allowAssets, makeRequest(okAssetUrl, { headers }))
    expect(result).toEqual({ url: okAssetUrl, headers: {} })
  })

  it('15/16) الـquery والـhash يُحذفان', () => {
    const result = sanitize(allowAssets, makeRequest(`${okAssetUrl}?token=${C.access}&email=${C.email}#access_token=${C.refresh}`))
    expect(result.url).toBe(okAssetUrl)
    expect(result.url).not.toMatch(/[?#]/)
    expectNoCanary(result)
  })

  it('30) لا يُرجع المُدخل ولا أي كائن منه', () => {
    const request = makeRequest(okAssetUrl)
    const result = sanitize(allowAssets, request)
    expect(result).not.toBe(request)
    expect(result.headers).not.toBe(request.headers)
  })

  it('29) لا يعدّل المُدخل', () => {
    const request = makeRequest(okAssetUrl)
    const before = JSON.stringify(request)
    const headersRef = request.headers
    sanitize(allowAssets, request)
    expect(JSON.stringify(request)).toBe(before)
    expect(request.headers).toBe(headersRef)
  })

  it('حتمي: نفس المُدخل => نفس المخرج', () => {
    const s = createNetworkSanitizers(allowAssets)
    expect(s.requestSanitizer(makeRequest(okAssetUrl))).toEqual(s.requestSanitizer(makeRequest(okAssetUrl)))
  })
})

describe('requestSanitizer — URLs مرفوضة', () => {
  it('17) userinfo => null', () => {
    expect(sanitize(allowAssets, makeRequest(`https://user:pass@${ASSETS}/static/app.js`))).toBeNull()
    expect(sanitize(allowAssets, makeRequest(`https://${C.password}@${ASSETS}/static/app.js`))).toBeNull()
  })

  it.each(['not a url', '', 'http://', '::::', 'https://', 'http://[::1'])('18) URL غير صالح %j => null', (url) => {
    expect(sanitize(allowAssets, makeRequest(url))).toBeNull()
  })

  it.each([
    ['19', 'data:text/plain,hello'],
    ['20', 'javascript:alert(1)'],
    ['21', `blob:https://${ASSETS}/0b2f5c1e-1111-2222-3333-444455556666`],
    ['x', 'ftp://assets.example.invalid/static/app.js'],
    ['x', 'file:///etc/passwd'],
    ['x', 'ws://assets.example.invalid/static/app.js'],
  ])('%s) scheme غير http(s) %j => null', (_n, url) => {
    expect(sanitize(allowAssets, makeRequest(url))).toBeNull()
  })

  it.each([
    `https://${ASSETS}/static/../auth/token`,
    `https://${ASSETS}/static/./app.js`,
    `https://${ASSETS}/static/..`,
    `https://${ASSETS}/../static/app.js`,
    `https://${ASSETS}/static/..%2fapp.js`,
  ])('22) traversal %j => null', (url) => {
    expect(sanitize(allowAssets, makeRequest(url))).toBeNull()
  })

  it.each([
    `https://${ASSETS}/static/%2e%2e/app.js`,
    `https://${ASSETS}/static/%2E%2E/app.js`,
    `https://${ASSETS}/static/..%2F/app.js`,
    `https://${ASSETS}/static%2fapp.js`,
    `https://${ASSETS}/static%5capp.js`,
    `https://${ASSETS}/static/%252e%252e/app.js`,
    `https://${ASSETS}/static/app%00.js`,
    `https://${ASSETS}/static\\app.js`,
    `https://${ASSETS}/static/app.js\t`,
    `https://${ASSETS}//static/app.js`,
  ])('23) ترميز/فواصل مشبوهة %j => null', (url) => {
    expect(sanitize(allowAssets, makeRequest(url))).toBeNull()
  })

  it('24) URL طويل => null', () => {
    expect(sanitize(allowAssets, makeRequest(`https://${ASSETS}/static/${'a'.repeat(600)}.js`))).toBeNull()
  })

  it('URL الناتج لا يتجاوز maxUrlLength ولا يتخطّى السقف الصلب', () => {
    const s = createNetworkSanitizers({ ...allowAssets, maxUrlLength: 999999 })
    expect(s.requestSanitizer(makeRequest(`https://${ASSETS}/static/${'a'.repeat(2100)}.js`))).toBeNull()
  })
})

describe('requestSanitizer — مُدخلات مشوَّهة (fail-closed)', () => {
  it('25) مُدخلات ليست طلباً صالحاً => null بلا رمي', () => {
    const s = createNetworkSanitizers(allowAssets)
    for (const bad of [null, undefined, 42, 'str', true, [], {}, { url: 5, method: 'GET' }, { url: okAssetUrl }, { method: 'GET' }, { url: new URL(okAssetUrl), method: 'GET' }]) {
      expect(() => s.requestSanitizer(bad)).not.toThrow()
      expect(s.requestSanitizer(bad)).toBeNull()
    }
  })

  it('26) مُدخل مُجمَّد (frozen) => null بلا رمي في الوضع الافتراضي؛ ومع allowlist يعمل بلا تعديل', () => {
    const frozen = Object.freeze({ ...makeRequest(okAssetUrl), headers: Object.freeze({ ...makeRequest(okAssetUrl).headers }) })
    expect(() => createNetworkSanitizers().requestSanitizer(frozen)).not.toThrow()
    expect(createNetworkSanitizers().requestSanitizer(frozen)).toBeNull()
    expect(sanitize(allowAssets, frozen)).toEqual({ url: okAssetUrl, headers: {} })
    expect(Object.isFrozen(frozen)).toBe(true)
  })

  it('27) getter يرمي (Proxy) => null بلا رمي', () => {
    const hostile = new Proxy({}, { get() { throw new Error('boom') } })
    const s = createNetworkSanitizers(allowAssets)
    expect(() => s.requestSanitizer(hostile)).not.toThrow()
    expect(s.requestSanitizer(hostile)).toBeNull()
    const throwingUrl = { get url() { throw new Error('boom') }, method: 'GET' }
    expect(s.requestSanitizer(throwingUrl)).toBeNull()
  })

  it('28) مُدخل دائري (cyclic) => null بلا رمي ولا تعليق', () => {
    const cyclic = { method: 'GET' }
    cyclic.url = cyclic
    cyclic.self = cyclic
    expect(sanitize(allowAssets, cyclic)).toBeNull()
    // حقل دائري إضافي لا يهم: المُخرَج يُبنى من url/method فقط.
    const extraCycle = makeRequest(okAssetUrl)
    extraCycle.self = extraCycle
    expect(sanitize(allowAssets, extraCycle)).toEqual({ url: okAssetUrl, headers: {} })
  })

  it('fuzz حتمي: لا رمي أبداً، والمخرج null أو {url,headers:{}} بلا ? # @', () => {
    let seed = 1337
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
    const pieces = ['https://', 'http://', ASSETS, SB, '/static/', '/app.js', '/rest/v1/orders', '/..', '/.', '%2e', '%2f', '%5c', '%', '?', '#', '@', ':', '\\', ' ', '\u0000', '‮', '/', '//', C.access, C.email, 'é', '字', '%E4%BD%A0']
    const s = createNetworkSanitizers(allowOrders)
    for (let i = 0; i < 1500; i += 1) {
      let url = ''
      const n = 1 + Math.floor(rnd() * 8)
      for (let j = 0; j < n; j += 1) url += pieces[Math.floor(rnd() * pieces.length)]
      const method = rnd() > 0.5 ? 'GET' : 'get'
      const result = s.requestSanitizer({ url, method, headers: { authorization: C.bearer }, body: C.password })
      if (result !== null) {
        expect(Object.keys(result).sort()).toEqual(['headers', 'url'])
        expect(result.headers).toEqual({})
        expect(result.url).toMatch(/^https?:\/\/[^?#@\\\s]+$/)
        expectNoCanary(result)
      }
    }
  })
})

describe('requestSanitizer — سلوك الـallowlist', () => {
  it('الفعل غير حسّاس لحالة الأحرف، والـhost كذلك، والمنفذ يُطابَق حرفياً', () => {
    expect(sanitize(allowAssets, makeRequest(`HTTPS://Assets.Example.Invalid/static/app.js`, { method: 'get' }))).toEqual({ url: okAssetUrl, headers: {} })
    const withPort = { mode: 'metadata', allow: [{ host: 'localhost:5173', methods: ['GET'], pathPattern: /^\/static\/[\w.-]+\.js$/ }] }
    expect(sanitize(withPort, makeRequest('http://localhost:5173/static/a.js'))).toEqual({ url: 'http://localhost:5173/static/a.js', headers: {} })
    expect(sanitize(withPort, makeRequest('http://localhost:9999/static/a.js'))).toBeNull()
  })

  it('المعرّفات (UUID/أرقام/hex/tokens) تُخفى بـ:id قبل المطابقة وفي المخرج', () => {
    const policy = { mode: 'metadata', allow: [{ host: SB, methods: ['GET'], pathPattern: /^\/rest\/v1\/orders\/:id$/ }] }
    for (const id of ['0b2f5c1e-1111-2222-3333-444455556666', '12345', 'deadbeefdeadbeef00', C.order]) {
      const out = sanitize(policy, makeRequest(`https://${SB}/rest/v1/orders/${id}`))
      expect(out).toEqual({ url: `https://${SB}/rest/v1/orders/:id`, headers: {} })
      expectNoCanary(out)
    }
    expect(sanitize(policy, makeRequest(`https://${SB}/rest/v1/orders/plain-name`))).toBeNull()
  })

  it('مسار نسبي: يعمل فقط عند وجود location.origin وإلا null', () => {
    expect(sanitize(allowAssets, makeRequest('/static/app.js'))).toBeNull()
    vi.stubGlobal('location', { origin: `https://${ASSETS}` })
    expect(sanitize(allowAssets, makeRequest('/static/app.js'))).toEqual({ url: okAssetUrl, headers: {} })
    expect(sanitize(allowAssets, makeRequest('//evil.example.invalid/static/app.js'))).toBeNull()
  })

  it('regex بعلامة g لا يتغيّر سلوكه بين الاستدعاءات (نسخة بلا g)', () => {
    const s = createNetworkSanitizers({ mode: 'metadata', allow: [{ host: ASSETS, methods: ['GET'], pathPattern: /^\/static\/[\w.-]+\.js$/g }] })
    for (let i = 0; i < 4; i += 1) expect(s.requestSanitizer(makeRequest(okAssetUrl))).toEqual({ url: okAssetUrl, headers: {} })
  })
})

describe('تحقق السياسة — أي خلل يُغلق الكل', () => {
  const bad = [
    ['pattern غير مُثبَّت', { host: ASSETS, methods: ['GET'], pathPattern: /\/static\/a\.js/ }],
    ['pattern يبدأ فقط ^', { host: ASSETS, methods: ['GET'], pathPattern: /^\/static\/a\.js/ }],
    ['wildcard .*', { host: ASSETS, methods: ['GET'], pathPattern: /^\/static\/.*$/ }],
    ['wildcard .+', { host: ASSETS, methods: ['GET'], pathPattern: /^\/static\/.+$/ }],
    ['[\\s\\S]', { host: ASSETS, methods: ['GET'], pathPattern: /^\/static\/[\s\S]*$/ }],
    ['host بـwildcard', { host: '*.example.invalid', methods: ['GET'], pathPattern: /^\/a$/ }],
    ['host فارغ', { host: '', methods: ['GET'], pathPattern: /^\/a$/ }],
    ['فعل بحروف صغيرة', { host: ASSETS, methods: ['get'], pathPattern: /^\/a$/ }],
    ['بلا أفعال', { host: ASSETS, methods: [], pathPattern: /^\/a$/ }],
    ['pattern ليس RegExp', { host: ASSETS, methods: ['GET'], pathPattern: '^/a$' }],
    ['كيان null', null],
  ]
  it.each(bad)('%s => isEnabled=false ولا يُقبل حتى مع كيان صالح آخر', (_name, entry) => {
    const s = createNetworkSanitizers({ mode: 'metadata', allow: [assetsEntry, entry] })
    expect(s.isEnabled).toBe(false)
    expect(s.requestSanitizer(makeRequest(okAssetUrl))).toBeNull()
  })

  it('policy نفسها لا تتأثر بتعديل لاحق للمُدخل (نسخ داخلية)', () => {
    const allow = [{ ...assetsEntry, methods: ['GET'] }]
    const s = createNetworkSanitizers({ mode: 'metadata', allow })
    allow[0].host = 'evil.example.invalid'
    allow[0].methods.push('POST')
    expect(s.requestSanitizer(makeRequest(okAssetUrl))).toEqual({ url: okAssetUrl, headers: {} })
    expect(s.requestSanitizer(makeRequest(`https://evil.example.invalid/static/app.js`))).toBeNull()
  })
})

describe('responseSanitizer', () => {
  it('39) يُرجع null دائماً ولا يُرجع أي شيء من الاستجابة', () => {
    const { responseSanitizer } = createNetworkSanitizers(allowOrders)
    const hostile = new Proxy({}, { get() { throw new Error('boom') } })
    const inputs = [
      undefined, null, 1, 'x', {},
      { reqId: 'fetch-1', status: 200, headers: { authorization: C.bearer, 'set-cookie': C.refresh }, body: JSON.stringify({ access_token: C.access, refresh_token: C.refresh }), method: 'POST', url: `https://${SB}/functions/v1/dashboard-login-guard` },
      hostile,
    ]
    for (const input of inputs) {
      expect(responseSanitizer(input)).toBeNull()
    }
  })

  it('null أيضاً في وضع off وعند السياسة الافتراضية', () => {
    expect(createNetworkSanitizers().responseSanitizer({ body: C.access })).toBeNull()
    expect(createNetworkSanitizers({ mode: 'off' }).responseSanitizer({ body: C.access })).toBeNull()
  })
})

describe('sanitizePageUrl', () => {
  it('31/32) يحذف query وhash وuserinfo ويُبقي origin+pathname', () => {
    expect(sanitizePageUrl(`https://simsim.example.invalid/auth/callback?code=${C.access}#access_token=${C.access}&refresh_token=${C.refresh}`))
      .toBe('https://simsim.example.invalid/auth/callback')
    expect(sanitizePageUrl(`https://user:${C.password}@simsim.example.invalid/reset-password?token=${C.access}`))
      .toBe('https://simsim.example.invalid/reset-password')
    expect(sanitizePageUrl('https://simsim.example.invalid')).toBe('https://simsim.example.invalid/')
  })

  it('33) أي خطأ/مُدخل غير صالح => null بلا رمي', () => {
    for (const bad of [null, undefined, 42, {}, [], '', 'not a url', '/relative/path', 'javascript:alert(1)', 'data:text/plain,x', 'about:blank', `https://${'a'.repeat(5000)}.example.invalid/`]) {
      expect(() => sanitizePageUrl(bad)).not.toThrow()
      expect(sanitizePageUrl(bad)).toBeNull()
    }
  })

  it('لا يُرجع أي canary من query/hash', () => {
    expectNoCanary(sanitizePageUrl(`https://simsim.example.invalid/x?a=${C.email}&b=${C.password}#${C.refresh}`))
  })
})

describe('scrubErrorText', () => {
  it('34) يُخفي JWT', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJGQUtFIn0.c2lnbmF0dXJlRkFLRQ'
    const out = scrubErrorText(`failed with ${jwt} here`)
    expect(out).not.toContain(jwt)
    expect(out).toContain('[jwt]')
  })

  it('35) يُخفي Bearer tokens', () => {
    const out = scrubErrorText(`Authorization: Bearer ${C.bearer}`)
    expect(out).not.toContain(C.bearer)
    expect(out).toContain('[redacted]')
  })

  it('36) يُخفي الإيميلات', () => {
    const out = scrubErrorText(`user ${C.email} not found`)
    expect(out).not.toContain(C.email)
    expect(out).toContain('[email]')
  })

  it('37) يُخفي tokens الطويلة (≥32)', () => {
    const out = scrubErrorText(`order ${C.order} failed`)
    expect(out).not.toContain(C.order)
    expect(out).toContain('[token]')
  })

  it('يُخفي قيم password/token المُفتاحية (JSON و query و =)', () => {
    for (const text of [
      `{"password":"${C.password}"}`,
      `password=${C.password}&x=1`,
      `refresh_token: ${C.refresh}`,
      `access-token="${C.access}"`,
    ]) {
      const out = scrubErrorText(text)
      expectNoCanary(out)
      expect(out).toContain('[redacted]')
    }
  })

  it('يقطع الطول ويحترم maxLength', () => {
    expect(scrubErrorText('x '.repeat(5000)).length).toBeLessThanOrEqual(500)
    expect(scrubErrorText('a b '.repeat(200), 50).length).toBeLessThanOrEqual(50)
  })

  it('38) لا يرمي أبداً ويُرجع string دائماً', () => {
    const cyclic = {}
    cyclic.self = cyclic
    const inputs = [
      undefined, null, 0, 123n, Symbol('s'), {}, [], cyclic, 'x'.repeat(1_000_000),
      { toString() { throw new Error('boom') } },
      new Proxy({}, { get() { throw new Error('boom') } }),
      Object.create(null),
    ]
    for (const input of inputs) {
      expect(() => scrubErrorText(input)).not.toThrow()
      expect(typeof scrubErrorText(input)).toBe('string')
    }
    expect(scrubErrorText({ toString() { throw new Error('boom') } })).toBe('[unavailable]')
    expect(scrubErrorText(null)).toBe('')
  })

  it('JWT كامل داخل رسالة/JSON يُخفى', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJTWU5USEVUSUMifQ.c2ln'
    for (const text of [`token invalid: ${jwt}`, `{"jwt":"${jwt}"}`, `Authorization: ${jwt}`]) {
      expect(scrubErrorText(text)).not.toContain(jwt)
    }
  })

  it('query وhash داخل عناوين URL تُحذفان مع بقاء origin+path', () => {
    const out = scrubErrorText(`GET https://api.example.invalid/v1/items?token=SIMSIM_CANARY_TOKEN_001&email=${C.email}#SIMSIM_CANARY_SECRET_001 failed`)
    expect(out).toContain('https://api.example.invalid/v1/items')
    expect(out).not.toMatch(/SIMSIM_CANARY_(TOKEN|SECRET)_001|token=|email=|#/)
    expectNoCanary(out)
  })

  it('باراميترات حسّاسة بلا URL كامل (?code=، ?otp=، ?email=) تُخفى', () => {
    for (const text of ['at /auth/callback?code=SIMSIM_CANARY_TOKEN_001', 'redirect ?otp=SIMSIM_CANARY_SECRET_001 failed', 'x&email=SIMSIM_CANARY_EMAIL_001&y=1']) {
      expect(scrubErrorText(text)).not.toMatch(/SIMSIM_CANARY_(TOKEN|SECRET|EMAIL)_001/)
    }
  })

  it('يحافظ على الرسائل غير الحسّاسة كما هي (فائدة المراقبة)', () => {
    const msg = "Cannot read properties of undefined (reading 'items') at Orders.render"
    expect(scrubErrorText(msg)).toBe(msg)
    expect(scrubErrorText('TypeError: Failed to fetch')).toBe('TypeError: Failed to fetch')
  })

  it('لا يُبقي أي canary في أي صيغة مختلطة', () => {
    const mixed = `Bearer ${C.bearer} ${C.email} ${C.order} password=${C.password} refresh_token=${C.refresh} access_token=${C.access}`
    expectNoCanary(scrubErrorText(mixed, 2000))
  })
})

describe('buildLogRocketOptions', () => {
  it('الافتراضي (الإنتاج): network مُغلق، sanitizers موجودة، URL sanitizer، بلا IP، بلا console، input مُخفى', () => {
    const o = buildLogRocketOptions()
    expect(o.network.isEnabled).toBe(false)
    expect(typeof o.network.requestSanitizer).toBe('function')
    expect(typeof o.network.responseSanitizer).toBe('function')
    expect(o.browser.urlSanitizer).toBe(sanitizePageUrl)
    expect(o.dom.inputSanitizer).toBe(true)
    expect(o.console.isEnabled).toBe(false)
    expect(o.console.shouldAggregateConsoleErrors).toBe(false)
    expect(o.shouldCaptureIP).toBe(false)
  })

  it('DOM (Phase 1.8F): input + text مُخفيان، خصائص الروابط مخفية بنيوياً، وعنوان الصفحة معطَّل', () => {
    const o = buildLogRocketOptions()
    expect(o.dom.inputSanitizer).toBe(true)
    expect(o.dom.textSanitizer).toBe(true)
    expect(o.dom.disablePageTitles).toBe(true)
    for (const attr of ['href', 'xlink:href', 'action', 'formaction']) expect(o.dom.hiddenAttributes).toContain(attr)
    expect(Object.keys(o.dom).sort()).toEqual(['disablePageTitles', 'hiddenAttributes', 'inputSanitizer', 'textSanitizer'])
  })

  it('hiddenAttributes نسخة جديدة في كل استدعاء (لا تُشارَك ولا يمكن تعديل الأصل)', () => {
    const a = buildLogRocketOptions()
    a.dom.hiddenAttributes.push('data-mutated')
    expect(buildLogRocketOptions().dom.hiddenAttributes).not.toContain('data-mutated')
  })

  it('الالتقاط التلقائي للاستثناءات مُعطَّل في SDK (يعوّضه exceptionBoundary)', () => {
    expect(buildLogRocketOptions().shouldDetectExceptions).toBe(false)
    expect(buildLogRocketOptions(allowOrders).shouldDetectExceptions).toBe(false)
  })

  it('السلوك غير الحسّاس يبقى: urlSanitizer وsanitizers الشبكة موجودة، والإنتاج off/[]', () => {
    const o = buildLogRocketOptions()
    expect(typeof o.browser.urlSanitizer).toBe('function')
    expect(typeof o.network.requestSanitizer).toBe('function')
    expect(o.network.isEnabled).toBe(false)
    expect(PRODUCTION_POLICY.mode).toBe('off')
    expect(PRODUCTION_POLICY.allow).toEqual([])
  })

  it('الـsanitizers الافتراضية تُسقط كل شيء', () => {
    const o = buildLogRocketOptions()
    expect(o.network.requestSanitizer(makeRequest(okAssetUrl))).toBeNull()
    expect(o.network.responseSanitizer({ body: C.access })).toBeNull()
  })

  it('وضع metadata (آلية فقط، لا يُستخدم في الإنتاج) لا يُفعّل إلا مع allowlist صالحة ويُبقي login-guard محجوباً', () => {
    const on = buildLogRocketOptions(allowOrders)
    expect(on.network.isEnabled).toBe(true)
    expect(on.network.requestSanitizer(makeRequest(`https://${SB}/functions/v1/dashboard-login-guard`, { method: 'POST' }))).toBeNull()
    expect(buildLogRocketOptions({ mode: 'metadata', allow: [] }).network.isEnabled).toBe(false)
  })
})
