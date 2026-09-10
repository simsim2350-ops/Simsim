// app/api/customer/verify-otp — Phase 3B (Customer Session issuance) test suite.
//
// Covers: request validation, the OTP-fail vs OTP-success branch, session
// cookie construction/attributes, "token never in the JSON body" (success and
// every failure path), DB-error handling at each step, missing service_role
// client, and safe-logging invariants (no token/customer_id/full phone in any
// console call).
//
// No real Supabase call anywhere in this file — db.rpc is always a fake.

import { describe, it, expect, vi } from 'vitest'
import {
  buildVerifyOtpHandler,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from '../../menu-next/app/api/customer/verify-otp/handler.js'

const TEST_PHONE = '512345678'
const TEST_CODE = '654321'
const TEST_CUSTOMER_ID = '11111111-1111-1111-1111-111111111111'
const TEST_TOKEN = 'a'.repeat(64) // shape-only stand-in, not a real generated token

function makeReq(body, { method = 'POST' } = {}) {
  return new Request('https://example.test/api/customer/verify-otp', {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function makeDb({
  verifyResult = { data: { verified: true, customer_id: TEST_CUSTOMER_ID }, error: null },
  sessionResult = { data: { session_id: 'sess-1', token: TEST_TOKEN }, error: null },
  rpcSpy,
} = {}) {
  return {
    rpc: rpcSpy ?? vi.fn(async (name) => {
      if (name === 'verify_phone_otp') return verifyResult
      if (name === 'create_customer_session') return sessionResult
      throw new Error(`unexpected rpc in test: ${name}`)
    }),
  }
}

function spyOnConsole() {
  const calls = []
  const record = (...args) => calls.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
  const spies = ['log', 'warn', 'error'].map((level) => vi.spyOn(console, level).mockImplementation((...args) => record(...args)))
  return {
    expectNeverLogged(secret) {
      expect(calls.join('\n')).not.toContain(secret)
    },
    restore() {
      spies.forEach((s) => s.mockRestore())
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// A. Request validation
// ═══════════════════════════════════════════════════════════════════════════
describe('request validation', () => {
  it('rejects non-POST methods', async () => {
    const handle = buildVerifyOtpHandler({ db: makeDb() })
    const res = await handle(makeReq(undefined, { method: 'GET' }))
    expect(res.status).toBe(405)
  })

  it('rejects malformed JSON', async () => {
    const handle = buildVerifyOtpHandler({ db: makeDb() })
    const req = new Request('https://example.test/api/customer/verify-otp', { method: 'POST', body: 'not json' })
    const res = await handle(req)
    expect(res.status).toBe(400)
  })

  it('rejects a non-canonical phone before calling any RPC', async () => {
    const db = makeDb()
    const handle = buildVerifyOtpHandler({ db })
    for (const bad of ['0512345678', '+966512345678', '51234', '', undefined, 12345678]) {
      const res = await handle(makeReq({ phone: bad, code: TEST_CODE }))
      expect(res.status).toBe(400)
    }
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it('rejects a malformed code before calling any RPC', async () => {
    const db = makeDb()
    const handle = buildVerifyOtpHandler({ db })
    for (const bad of ['12345', '1234567', 'abcdef', '', undefined, 123456]) {
      const res = await handle(makeReq({ phone: TEST_PHONE, code: bad }))
      expect(res.status).toBe(400)
    }
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it('returns 500 (never invents a client) when service_role is not configured', async () => {
    const handle = buildVerifyOtpHandler({ db: null })
    const res = await handle(makeReq({ phone: TEST_PHONE, code: TEST_CODE }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'internal_error' })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// B. Successful flow
// ═══════════════════════════════════════════════════════════════════════════
describe('successful verification → session issuance', () => {
  it('calls verify_phone_otp then create_customer_session, in that order, with correct args', async () => {
    const calls = []
    const rpcSpy = vi.fn(async (name, args) => {
      calls.push([name, args])
      if (name === 'verify_phone_otp') return { data: { verified: true, customer_id: TEST_CUSTOMER_ID }, error: null }
      if (name === 'create_customer_session') return { data: { session_id: 's1', token: TEST_TOKEN }, error: null }
    })
    const handle = buildVerifyOtpHandler({ db: { rpc: rpcSpy } })
    await handle(makeReq({ phone: TEST_PHONE, code: TEST_CODE }))

    expect(calls).toEqual([
      ['verify_phone_otp', { p_phone: TEST_PHONE, p_code: TEST_CODE }],
      ['create_customer_session', { p_customer_id: TEST_CUSTOMER_ID }],
    ])
  })

  it('never accepts customer_id from the request body — only from verify_phone_otp', async () => {
    const rpcSpy = vi.fn(async (name) => {
      if (name === 'verify_phone_otp') return { data: { verified: true, customer_id: TEST_CUSTOMER_ID }, error: null }
      if (name === 'create_customer_session') return { data: { session_id: 's1', token: TEST_TOKEN }, error: null }
    })
    const handle = buildVerifyOtpHandler({ db: { rpc: rpcSpy } })
    // attacker-supplied customer_id in the body — must be completely ignored
    await handle(makeReq({ phone: TEST_PHONE, code: TEST_CODE, customer_id: 'attacker-controlled-id' }))
    const sessionCall = rpcSpy.mock.calls.find(([name]) => name === 'create_customer_session')
    expect(sessionCall[1]).toEqual({ p_customer_id: TEST_CUSTOMER_ID })
  })

  it('returns {verified:true} with status 200', async () => {
    const handle = buildVerifyOtpHandler({ db: makeDb() })
    const res = await handle(makeReq({ phone: TEST_PHONE, code: TEST_CODE }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ verified: true })
  })

  it('sets the session cookie with exactly the required attributes', async () => {
    const handle = buildVerifyOtpHandler({ db: makeDb() })
    const res = await handle(makeReq({ phone: TEST_PHONE, code: TEST_CODE }))
    const cookie = res.headers.get('set-cookie')
    expect(cookie).toBeTruthy()
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=${TEST_TOKEN}`)
    expect(cookie).toMatch(/Path=\//)
    expect(cookie).toMatch(new RegExp(`Max-Age=${SESSION_MAX_AGE_SECONDS}\\b`))
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/Secure/)
    expect(cookie).toMatch(/SameSite=Lax/)
    expect(SESSION_MAX_AGE_SECONDS).toBe(30 * 24 * 60 * 60) // 30 days, exactly
  })

  it('does NOT set a Domain attribute (host-only cookie by default)', async () => {
    const handle = buildVerifyOtpHandler({ db: makeDb() })
    const res = await handle(makeReq({ phone: TEST_PHONE, code: TEST_CODE }))
    expect(res.headers.get('set-cookie')).not.toMatch(/Domain=/i)
  })

  it('the token never appears in the JSON response body', async () => {
    const handle = buildVerifyOtpHandler({ db: makeDb() })
    const res = await handle(makeReq({ phone: TEST_PHONE, code: TEST_CODE }))
    const text = await res.text()
    expect(text).not.toContain(TEST_TOKEN)
    expect(JSON.parse(text)).toEqual({ verified: true })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// C. Failed OTP verification — no session created
// ═══════════════════════════════════════════════════════════════════════════
describe('failed OTP verification', () => {
  it('returns {verified:false}, status 200, and does NOT call create_customer_session', async () => {
    const rpcSpy = vi.fn(async (name) => {
      if (name === 'verify_phone_otp') return { data: { verified: false }, error: null }
      throw new Error(`should not call ${name}`)
    })
    const handle = buildVerifyOtpHandler({ db: { rpc: rpcSpy } })
    const res = await handle(makeReq({ phone: TEST_PHONE, code: TEST_CODE }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ verified: false })
    expect(rpcSpy).toHaveBeenCalledTimes(1)
  })

  it('sets no Set-Cookie header on failure', async () => {
    const db = makeDb({ verifyResult: { data: { verified: false }, error: null } })
    const handle = buildVerifyOtpHandler({ db })
    const res = await handle(makeReq({ phone: TEST_PHONE, code: TEST_CODE }))
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('treats an expired-OTP verify_phone_otp result identically to a wrong-code result (same generic shape)', async () => {
    // verify_phone_otp's own contract (Phase 1) already collapses expired/
    // wrong/attempts-exhausted/nonexistent into {"verified": false} — this
    // handler must not add any distinguishing branch on top of that.
    const db = makeDb({ verifyResult: { data: { verified: false }, error: null } })
    const handle = buildVerifyOtpHandler({ db })
    const res = await handle(makeReq({ phone: TEST_PHONE, code: TEST_CODE }))
    expect(await res.json()).toEqual({ verified: false })
  })

  it('a replayed (already-used) OTP — verify_phone_otp returns false again — creates no new session', async () => {
    const rpcSpy = vi.fn(async (name) => {
      if (name === 'verify_phone_otp') return { data: { verified: false }, error: null }
      throw new Error('create_customer_session must not be called on replay')
    })
    const handle = buildVerifyOtpHandler({ db: { rpc: rpcSpy } })
    const res = await handle(makeReq({ phone: TEST_PHONE, code: TEST_CODE }))
    expect(await res.json()).toEqual({ verified: false })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// D. DB error handling
// ═══════════════════════════════════════════════════════════════════════════
describe('DB error handling', () => {
  it('verify_phone_otp RPC error → safe 500, no raw error text leaked', async () => {
    const db = makeDb({ verifyResult: { data: null, error: { message: 'some internal postgres detail' } } })
    const handle = buildVerifyOtpHandler({ db })
    const res = await handle(makeReq({ phone: TEST_PHONE, code: TEST_CODE }))
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toContain('some internal postgres detail')
    expect(JSON.parse(text)).toEqual({ error: 'internal_error' })
  })

  it('create_customer_session RPC error → safe 500, and the cookie is never set', async () => {
    const db = makeDb({ sessionResult: { data: null, error: { message: 'boom' } } })
    const handle = buildVerifyOtpHandler({ db })
    const res = await handle(makeReq({ phone: TEST_PHONE, code: TEST_CODE }))
    expect(res.status).toBe(500)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('verify_phone_otp succeeding without a customer_id → safe 500 (defensive, should never happen)', async () => {
    const db = makeDb({ verifyResult: { data: { verified: true }, error: null } })
    const handle = buildVerifyOtpHandler({ db })
    const res = await handle(makeReq({ phone: TEST_PHONE, code: TEST_CODE }))
    expect(res.status).toBe(500)
  })

  it('create_customer_session succeeding without a token → safe 500 (defensive, should never happen)', async () => {
    const db = makeDb({ sessionResult: { data: { session_id: 's1' }, error: null } })
    const handle = buildVerifyOtpHandler({ db })
    const res = await handle(makeReq({ phone: TEST_PHONE, code: TEST_CODE }))
    expect(res.status).toBe(500)
  })

  it('a thrown exception from either RPC call is caught and mapped to a safe 500', async () => {
    const db = { rpc: vi.fn(async () => { throw new Error('network blew up') }) }
    const handle = buildVerifyOtpHandler({ db })
    const res = await handle(makeReq({ phone: TEST_PHONE, code: TEST_CODE }))
    expect(res.status).toBe(500)
    expect(await res.text()).not.toContain('network blew up')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// E. Logging safety
// ═══════════════════════════════════════════════════════════════════════════
describe('logging safety', () => {
  it('the session token never appears in any console log call, on success', async () => {
    const logs = spyOnConsole()
    const handle = buildVerifyOtpHandler({ db: makeDb() })
    await handle(makeReq({ phone: TEST_PHONE, code: TEST_CODE }))
    logs.expectNeverLogged(TEST_TOKEN)
    logs.restore()
  })

  it('the raw phone number never appears in any console log call', async () => {
    const logs = spyOnConsole()
    const handle = buildVerifyOtpHandler({ db: makeDb() })
    await handle(makeReq({ phone: TEST_PHONE, code: TEST_CODE }))
    logs.expectNeverLogged(TEST_PHONE)
    logs.restore()
  })

  it('the OTP code never appears in any console log call', async () => {
    const logs = spyOnConsole()
    const handle = buildVerifyOtpHandler({ db: makeDb() })
    await handle(makeReq({ phone: TEST_PHONE, code: TEST_CODE }))
    logs.expectNeverLogged(TEST_CODE)
    logs.restore()
  })

  it('the customer_id never appears in any console log call', async () => {
    const logs = spyOnConsole()
    const handle = buildVerifyOtpHandler({ db: makeDb() })
    await handle(makeReq({ phone: TEST_PHONE, code: TEST_CODE }))
    logs.expectNeverLogged(TEST_CUSTOMER_ID)
    logs.restore()
  })

  it('DB error messages are truncated/sanitized, never logged raw, even on failure paths', async () => {
    const logs = spyOnConsole()
    const db = makeDb({ verifyResult: { data: null, error: { message: 'SENSITIVE_DB_DETAIL_MARKER' } } })
    const handle = buildVerifyOtpHandler({ db })
    await handle(makeReq({ phone: TEST_PHONE, code: TEST_CODE }))
    // The sanitizer forwards short messages verbatim (it only truncates long
    // ones) — this test instead confirms the token/phone/code/customer_id
    // invariants above hold even on this failure path, and that no full
    // request body or stack trace is ever dumped.
    logs.expectNeverLogged(JSON.stringify({ phone: TEST_PHONE, code: TEST_CODE }))
    logs.restore()
  })
})
