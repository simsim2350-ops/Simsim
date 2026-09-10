// send-phone-otp — Phase 2 (Authentica SMS delivery) test suite.
//
// Covers: provider request construction, secret handling, provider response
// mapping (success/400/401/429/500/malformed/timeout), OTP-security
// invariants (never in response, never in logs), and regression proof that
// nothing about the RPC contract or provider request shape silently changed.
//
// No real Authentica call anywhere in this file (fetchImpl is always a fake).
// No real Supabase call anywhere in this file (db.rpc is always a fake).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildHandler } from '../../supabase/functions/send-phone-otp/handler.js'
import { createAuthenticaAdapter } from '../../supabase/functions/send-phone-otp/authenticaAdapter.js'
import { isCanonicalPhone, toE164 } from '../../supabase/functions/send-phone-otp/phoneFormat.js'
import { extractSourceIp, hashIp } from '../../supabase/functions/send-phone-otp/ipHash.js'

const TEST_PHONE = '512345678'
const TEST_CODE = '654321'
const FAKE_API_KEY = 'synthetic_test_authentica_key_not_real'

function makeReq(body, { method = 'POST' } = {}) {
  return new Request('https://example.test/send-phone-otp', {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function makeDb({
  rpcResult = { data: { requested: true, otp_code: TEST_CODE }, error: null },
  ipCheckResult = { data: true, error: null },
  rpcSpy,
} = {}) {
  return {
    rpc: rpcSpy ?? vi.fn(async (name) => {
      if (name === 'check_and_log_otp_ip_request') return ipCheckResult
      if (name === 'request_phone_otp_for_delivery') return rpcResult
      throw new Error(`unexpected rpc name in test: ${name}`)
    }),
  }
}

function jsonFetchResponse(status, body) {
  return new Response(body === null ? '' : JSON.stringify(body), { status })
}

// ═══════════════════════════════════════════════════════════════════════════
// A. Provider request construction
// ═══════════════════════════════════════════════════════════════════════════
describe('authenticaAdapter — request construction', () => {
  it('calls the exact documented endpoint, method, and headers', async () => {
    const fetchImpl = vi.fn(async () => jsonFetchResponse(200, { success: true, data: null, message: 'OTP send successfully' }))
    const adapter = createAuthenticaAdapter({ apiKey: FAKE_API_KEY, fetchImpl })
    await adapter.sendOtpSms({ phoneE164: '+966512345678', otpCode: TEST_CODE })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.authentica.sa/api/v2/send-otp')
    expect(init.method).toBe('POST')
    expect(init.headers['X-Authorization']).toBe(FAKE_API_KEY)
    expect(init.headers['Accept']).toBe('application/json')
    expect(init.headers['Content-Type']).toBe('application/json')
  })

  it('sends method:"sms" and the E.164 phone in the body', async () => {
    const fetchImpl = vi.fn(async () => jsonFetchResponse(200, { success: true, data: null, message: 'ok' }))
    const adapter = createAuthenticaAdapter({ apiKey: FAKE_API_KEY, fetchImpl })
    await adapter.sendOtpSms({ phoneE164: '+966512345678', otpCode: TEST_CODE })

    const [, init] = fetchImpl.mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.method).toBe('sms')
    expect(body.phone).toBe('+966512345678')
  })

  it('E.164 conversion: 5XXXXXXXX -> +9665XXXXXXXX, no other representation introduced', () => {
    expect(toE164(TEST_PHONE)).toBe('+966512345678')
    expect(isCanonicalPhone(TEST_PHONE)).toBe(true)
    // non-canonical inputs never silently accepted/converted
    expect(toE164('0512345678')).toBeNull()
    expect(toE164('+966512345678')).toBeNull()
    expect(toE164('966512345678')).toBeNull()
  })

  it('rejects a non-canonical phone before ever calling fetch', async () => {
    const fetchImpl = vi.fn()
    const adapter = createAuthenticaAdapter({ apiKey: FAKE_API_KEY, fetchImpl })
    const result = await adapter.sendOtpSms({ phoneE164: '0512345678', otpCode: TEST_CODE })
    expect(result.ok).toBe(false)
    expect(result.errorCategory).toBe('invalid_phone')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// B. Secret handling
// ═══════════════════════════════════════════════════════════════════════════
describe('secret handling', () => {
  it('adapter refuses to call the provider at all when apiKey is missing', async () => {
    const fetchImpl = vi.fn()
    const adapter = createAuthenticaAdapter({ apiKey: undefined, fetchImpl })
    const result = await adapter.sendOtpSms({ phoneE164: '+966512345678', otpCode: TEST_CODE })
    expect(result.ok).toBe(false)
    expect(result.errorCategory).toBe('config_error')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('handler returns a safe 500 (never invents a key) when AUTHENTICA_API_KEY is missing', async () => {
    const db = makeDb()
    const handle = buildHandler({ db, apiKey: undefined })
    const res = await handle(makeReq({ phone: TEST_PHONE }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'internal_error' })
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it('the API key never appears anywhere in any HTTP response body', async () => {
    const fetchImpl = vi.fn(async () => jsonFetchResponse(200, { success: true, data: null, message: 'ok' }))
    const db = makeDb()
    const handle = buildHandler({ db, apiKey: FAKE_API_KEY, fetchImpl })
    const res = await handle(makeReq({ phone: TEST_PHONE }))
    const text = await res.text()
    expect(text).not.toContain(FAKE_API_KEY)
  })

  it('the API key never appears in any console log call', async () => {
    const logs = spyOnConsole()
    const fetchImpl = vi.fn(async () => jsonFetchResponse(200, { success: true, data: null, message: 'ok' }))
    const db = makeDb()
    const handle = buildHandler({ db, apiKey: FAKE_API_KEY, fetchImpl })
    await handle(makeReq({ phone: TEST_PHONE }))
    logs.expectNeverLogged(FAKE_API_KEY)
    logs.restore()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// C. Provider response handling
// ═══════════════════════════════════════════════════════════════════════════
describe('provider response handling', () => {
  const cases = [
    { name: 'success', response: () => jsonFetchResponse(200, { success: true, data: null, message: 'OTP send successfully' }), expectOk: true },
    { name: '400 invalid request', response: () => jsonFetchResponse(400, { errors: [{ message: 'bad request' }] }), expectCategory: 'invalid_request' },
    { name: '401 unauthorized', response: () => jsonFetchResponse(401, { errors: [{ message: 'Unauthorized' }] }), expectCategory: 'auth_error' },
    { name: '422 validation error', response: () => jsonFetchResponse(422, { errors: [{ message: 'invalid phone' }] }), expectCategory: 'invalid_request' },
    { name: '429 rate limited', response: () => jsonFetchResponse(429, { errors: [{ message: 'too many requests' }] }), expectCategory: 'rate_limited' },
    { name: '500 provider error', response: () => jsonFetchResponse(500, { errors: [{ message: 'server error' }] }), expectCategory: 'provider_error' },
    { name: '503 provider error', response: () => jsonFetchResponse(503, {}), expectCategory: 'provider_error' },
    { name: 'malformed JSON body', response: () => new Response('not json{{{', { status: 200 }), expectCategory: 'malformed_response' },
    { name: 'success status but unexpected body shape', response: () => jsonFetchResponse(200, { success: false }), expectCategory: 'unexpected_success_shape' },
  ]

  for (const c of cases) {
    it(`maps ${c.name} correctly`, async () => {
      const fetchImpl = vi.fn(async () => c.response())
      const adapter = createAuthenticaAdapter({ apiKey: FAKE_API_KEY, fetchImpl })
      const result = await adapter.sendOtpSms({ phoneE164: '+966512345678', otpCode: TEST_CODE })
      if (c.expectOk) {
        expect(result.ok).toBe(true)
      } else {
        expect(result.ok).toBe(false)
        expect(result.errorCategory).toBe(c.expectCategory)
      }
    })
  }

  it('maps a network failure (fetch throws) to network_error', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('fetch failed') })
    const adapter = createAuthenticaAdapter({ apiKey: FAKE_API_KEY, fetchImpl })
    const result = await adapter.sendOtpSms({ phoneE164: '+966512345678', otpCode: TEST_CODE })
    expect(result.ok).toBe(false)
    expect(result.errorCategory).toBe('network_error')
  })

  it('maps a timeout (AbortError) to timeout, not network_error', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const err = new Error('aborted')
          err.name = 'AbortError'
          reject(err)
        })
      })
    })
    const adapter = createAuthenticaAdapter({ apiKey: FAKE_API_KEY, fetchImpl, timeoutMs: 5 })
    const result = await adapter.sendOtpSms({ phoneE164: '+966512345678', otpCode: TEST_CODE })
    expect(result.ok).toBe(false)
    expect(result.errorCategory).toBe('timeout')
  })

  it('handler maps a failed provider send to a safe, generic caller-facing reason (never the provider category verbatim)', async () => {
    const fetchImpl = vi.fn(async () => jsonFetchResponse(401, { errors: [{ message: 'Unauthorized' }] }))
    const db = makeDb()
    const handle = buildHandler({ db, apiKey: FAKE_API_KEY, fetchImpl })
    const res = await handle(makeReq({ phone: TEST_PHONE }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('failed')
    expect(body.reason).toBe('delivery_failed')
    expect(JSON.stringify(body)).not.toMatch(/auth_error|401|Unauthorized/)
  })

  it('handler returns status:"sent" on provider success, with no other fields', async () => {
    const fetchImpl = vi.fn(async () => jsonFetchResponse(200, { success: true, data: null, message: 'OTP send successfully' }))
    const db = makeDb()
    const handle = buildHandler({ db, apiKey: FAKE_API_KEY, fetchImpl })
    const res = await handle(makeReq({ phone: TEST_PHONE }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ status: 'sent' })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// D. OTP security
// ═══════════════════════════════════════════════════════════════════════════
describe('OTP security', () => {
  it('the OTP code never appears in the HTTP response, on success or failure', async () => {
    for (const providerOk of [true, false]) {
      const fetchImpl = vi.fn(async () => providerOk
        ? jsonFetchResponse(200, { success: true, data: null, message: 'ok' })
        : jsonFetchResponse(500, {}))
      const db = makeDb()
      const handle = buildHandler({ db, apiKey: FAKE_API_KEY, fetchImpl })
      const res = await handle(makeReq({ phone: TEST_PHONE }))
      const text = await res.text()
      expect(text).not.toContain(TEST_CODE)
    }
  })

  it('the OTP code never appears in any console log call across the whole handler run', async () => {
    const logs = spyOnConsole()
    const fetchImpl = vi.fn(async () => jsonFetchResponse(200, { success: true, data: null, message: 'ok' }))
    const db = makeDb()
    const handle = buildHandler({ db, apiKey: FAKE_API_KEY, fetchImpl })
    await handle(makeReq({ phone: TEST_PHONE }))
    logs.expectNeverLogged(TEST_CODE)
    logs.restore()
  })

  it('logs mask the phone number — the raw 9-digit phone never appears in a log line', async () => {
    const logs = spyOnConsole()
    const fetchImpl = vi.fn(async () => jsonFetchResponse(500, {}))
    const db = makeDb()
    const handle = buildHandler({ db, apiKey: FAKE_API_KEY, fetchImpl })
    await handle(makeReq({ phone: TEST_PHONE }))
    logs.expectNeverLogged(TEST_PHONE)
    logs.restore()
  })

  it('handler never writes to a database table directly — only calls the two existing RPCs (no second OTP mechanism, no ad-hoc table access)', async () => {
    const fetchImpl = vi.fn(async () => jsonFetchResponse(200, { success: true, data: null, message: 'ok' }))
    const rpcSpy = vi.fn(async (name) => {
      if (name === 'check_and_log_otp_ip_request') return { data: true, error: null }
      if (name === 'request_phone_otp_for_delivery') return { data: { requested: true, otp_code: TEST_CODE }, error: null }
      throw new Error(`unexpected rpc: ${name}`)
    })
    const db = { rpc: rpcSpy, from: vi.fn(() => { throw new Error('handler must never touch tables directly') }) }
    const handle = buildHandler({ db, apiKey: FAKE_API_KEY, fetchImpl })
    await handle(makeReq({ phone: TEST_PHONE }))
    expect(rpcSpy).toHaveBeenCalledTimes(2)
    expect(rpcSpy).toHaveBeenCalledWith('check_and_log_otp_ip_request', expect.objectContaining({ p_ip_hash: expect.any(String) }))
    expect(rpcSpy).toHaveBeenCalledWith('request_phone_otp_for_delivery', { p_phone: TEST_PHONE })
  })

  it('rejects a malformed/missing phone before calling the RPC or the provider', async () => {
    const fetchImpl = vi.fn()
    const db = makeDb()
    const handle = buildHandler({ db, apiKey: FAKE_API_KEY, fetchImpl })
    for (const bad of ['0512345678', '+966512345678', '51234', '', undefined, 12345678]) {
      const res = await handle(makeReq({ phone: bad }))
      expect(res.status).toBe(400)
    }
    expect(db.rpc).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('propagates request_phone_otp_for_delivery cooldown/rate-limit as safe, distinguishable reasons — never a raw Postgres error', async () => {
    const cooldownDb = makeDb({ rpcResult: { data: null, error: { message: 'otp_cooldown' } } })
    const res1 = await buildHandler({ db: cooldownDb, apiKey: FAKE_API_KEY })(makeReq({ phone: TEST_PHONE }))
    expect(res1.status).toBe(200)
    expect((await res1.json())).toEqual({ status: 'rejected', reason: 'cooldown' })

    const rateLimitDb = makeDb({ rpcResult: { data: null, error: { message: 'otp_rate_limited' } } })
    const res2 = await buildHandler({ db: rateLimitDb, apiKey: FAKE_API_KEY })(makeReq({ phone: TEST_PHONE }))
    expect((await res2.json())).toEqual({ status: 'rejected', reason: 'rate_limited' })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// F. Abuse protection (Phase 2.1 — IP-based, second layer above Phase 1's
//    per-phone limits)
// ═══════════════════════════════════════════════════════════════════════════
describe('abuse protection (IP layer)', () => {
  it('extractSourceIp reads the first entry of x-forwarded-for', () => {
    const req = new Request('https://example.test/x', { headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } })
    expect(extractSourceIp(req)).toBe('203.0.113.9')
  })

  it('extractSourceIp falls back to x-real-ip, then to "unknown"', () => {
    expect(extractSourceIp(new Request('https://example.test/x', { headers: { 'x-real-ip': '198.51.100.4' } }))).toBe('198.51.100.4')
    expect(extractSourceIp(new Request('https://example.test/x'))).toBe('unknown')
  })

  it('hashIp is deterministic (same IP -> same hash) and looks like a sha256 hex digest', async () => {
    const h1 = await hashIp('203.0.113.9')
    const h2 = await hashIp('203.0.113.9')
    const h3 = await hashIp('203.0.113.10')
    expect(h1).toBe(h2)
    expect(h1).not.toBe(h3)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
  })

  it('calls check_and_log_otp_ip_request BEFORE the phone-level RPC, and skips the phone RPC entirely when blocked', async () => {
    const calls = []
    const rpcSpy = vi.fn(async (name) => {
      calls.push(name)
      if (name === 'check_and_log_otp_ip_request') return { data: false, error: null }
      return { data: { requested: true, otp_code: TEST_CODE }, error: null }
    })
    const fetchImpl = vi.fn()
    const db = { rpc: rpcSpy }
    const handle = buildHandler({ db, apiKey: FAKE_API_KEY, fetchImpl })
    const res = await handle(makeReq({ phone: TEST_PHONE }))

    expect(calls).toEqual(['check_and_log_otp_ip_request'])
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
  })

  it('IP-blocked response is generic and indistinguishable from the generic phone-level rejection (no internal reason leaked)', async () => {
    const db = makeDb({ ipCheckResult: { data: false, error: null } })
    const handle = buildHandler({ db, apiKey: FAKE_API_KEY })
    const res = await handle(makeReq({ phone: TEST_PHONE }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ status: 'rejected', reason: 'rejected' })
    expect(JSON.stringify(body)).not.toMatch(/ip|abuse|volume/i)
  })

  it('passes the configured max/window to the RPC (kept in sync with the SQL defaults, not silently drifting)', async () => {
    const rpcSpy = vi.fn(async (name) =>
      name === 'check_and_log_otp_ip_request'
        ? { data: true, error: null }
        : { data: { requested: true, otp_code: TEST_CODE }, error: null },
    )
    const fetchImpl = vi.fn(async () => jsonFetchResponse(200, { success: true, data: null, message: 'ok' }))
    const db = { rpc: rpcSpy }
    await buildHandler({ db, apiKey: FAKE_API_KEY, fetchImpl })(makeReq({ phone: TEST_PHONE }))
    expect(rpcSpy).toHaveBeenCalledWith('check_and_log_otp_ip_request', {
      p_ip_hash: expect.any(String),
      p_max_requests: 20,
      p_window_minutes: 15,
    })
  })

  it('fails CLOSED (500) if the IP-check RPC itself errors — never silently allows through', async () => {
    const db = makeDb({ ipCheckResult: { data: null, error: { message: 'db unavailable' } } })
    const handle = buildHandler({ db, apiKey: FAKE_API_KEY })
    const res = await handle(makeReq({ phone: TEST_PHONE }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'internal_error' })
  })

  it('the raw (unhashed) source IP never appears in logs — only a short hash prefix', async () => {
    const logs = spyOnConsole()
    const db = makeDb({ ipCheckResult: { data: false, error: null } })
    const handle = buildHandler({ db, apiKey: FAKE_API_KEY })
    const req = new Request('https://example.test/send-phone-otp', {
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.77' },
      body: JSON.stringify({ phone: TEST_PHONE }),
    })
    await handle(req)
    logs.expectNeverLogged('203.0.113.77')
    logs.restore()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// E. Protocol basics (method/CORS/body)
// ═══════════════════════════════════════════════════════════════════════════
describe('protocol handling', () => {
  it('responds to OPTIONS with CORS headers, no body processing', async () => {
    const db = makeDb()
    const handle = buildHandler({ db, apiKey: FAKE_API_KEY })
    const res = await handle(makeReq(undefined, { method: 'OPTIONS' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('rejects non-POST methods with 405', async () => {
    const db = makeDb()
    const handle = buildHandler({ db, apiKey: FAKE_API_KEY })
    const res = await handle(makeReq(undefined, { method: 'GET' }))
    expect(res.status).toBe(405)
  })

  it('rejects malformed JSON bodies with 400', async () => {
    const db = makeDb()
    const handle = buildHandler({ db, apiKey: FAKE_API_KEY })
    const req = new Request('https://example.test/send-phone-otp', { method: 'POST', body: 'not json' })
    const res = await handle(req)
    expect(res.status).toBe(400)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// test helpers
// ═══════════════════════════════════════════════════════════════════════════
function spyOnConsole() {
  const calls = []
  const record = (...args) => calls.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
  const spies = ['log', 'warn', 'error'].map((level) => vi.spyOn(console, level).mockImplementation((...args) => record(...args)))
  return {
    expectNeverLogged(secret) {
      const joined = calls.join('\n')
      expect(joined).not.toContain(secret)
    },
    restore() {
      spies.forEach((s) => s.mockRestore())
    },
  }
}
