// dashboard-login-guard — Migration 5.0 (F-01 remediation) test suite.
//
// Covers: malformed-input short-circuit (never touches DB or Supabase Auth),
// fail-closed on precheck/DB/network errors, account-lockout and IP-throttle
// rejection (never calls Supabase Auth), success/failure outcome recording,
// enumeration-safety (every rejection path returns byte-identical responses),
// CORS origin allowlisting, and secret-safety in logs.
//
// No real Supabase call anywhere in this file (db.rpc is always a fake).
// No real Supabase Auth call anywhere in this file (fetchImpl is always a fake).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildHandler } from '../../supabase/functions/dashboard-login-guard/handler.js'
import { extractSourceIp, hashIp } from '../../supabase/functions/dashboard-login-guard/ipHash.js'

const TEST_EMAIL = 'owner@example.com'
const TEST_PASSWORD = 'CorrectHorseBatteryStaple123!'
const ALLOWED_ORIGIN = 'https://simsimmenu.com'

function makeReq(body, { method = 'POST', origin = ALLOWED_ORIGIN, rawBody } = {}) {
  const headers = {}
  if (origin) headers.origin = origin
  return new Request('https://example.test/dashboard-login-guard', {
    method,
    headers,
    body: method === 'OPTIONS' ? undefined : rawBody !== undefined ? rawBody : body === undefined ? undefined : JSON.stringify(body),
  })
}

function makeDb({ precheck = { data: { allowed: true }, error: null }, record = { data: { locked: false }, error: null }, rpcSpy } = {}) {
  return {
    rpc: rpcSpy ?? vi.fn(async (name) => {
      if (name === 'check_dashboard_login_allowed') return precheck
      if (name === 'record_dashboard_login_outcome') return record
      throw new Error(`unexpected rpc name in test: ${name}`)
    }),
  }
}

function authSuccessResponse() {
  return new Response(JSON.stringify({ access_token: 'fake.jwt.access', refresh_token: 'fake_refresh_token', token_type: 'bearer', expires_in: 3600 }), { status: 200 })
}

function authFailureResponse() {
  return new Response(JSON.stringify({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }), { status: 400 })
}

let consoleLogSpy, consoleWarnSpy, consoleErrorSpy

beforeEach(() => {
  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

// ═══════════════════════════════════════════════════════════════════════════
// A. Malformed input — must never touch the DB or Supabase Auth
// ═══════════════════════════════════════════════════════════════════════════
describe('malformed input short-circuits before any DB or Auth call', () => {
  it('rejects missing password without calling db.rpc or fetch', async () => {
    const rpcSpy = vi.fn()
    const db = makeDb({ rpcSpy })
    const fetchImpl = vi.fn()
    const handle = buildHandler({ db, authUrl: 'https://proj.supabase.co', anonKey: 'anon', fetchImpl })

    const res = await handle(makeReq({ email: TEST_EMAIL }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_credentials', error_description: 'Invalid login credentials' })
    expect(rpcSpy).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects malformed email shape without calling db.rpc or fetch', async () => {
    const rpcSpy = vi.fn()
    const db = makeDb({ rpcSpy })
    const fetchImpl = vi.fn()
    const handle = buildHandler({ db, authUrl: 'https://proj.supabase.co', anonKey: 'anon', fetchImpl })

    const res = await handle(makeReq({ email: 'not-an-email', password: TEST_PASSWORD }))
    expect(res.status).toBe(400)
    expect(rpcSpy).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON body without calling db.rpc or fetch', async () => {
    const rpcSpy = vi.fn()
    const db = makeDb({ rpcSpy })
    const fetchImpl = vi.fn()
    const handle = buildHandler({ db, authUrl: 'https://proj.supabase.co', anonKey: 'anon', fetchImpl })

    const res = await handle(makeReq(undefined, { rawBody: '{not valid json' }))
    expect(res.status).toBe(400)
    expect(rpcSpy).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects an oversized body without calling db.rpc or fetch', async () => {
    const rpcSpy = vi.fn()
    const db = makeDb({ rpcSpy })
    const fetchImpl = vi.fn()
    const handle = buildHandler({ db, authUrl: 'https://proj.supabase.co', anonKey: 'anon', fetchImpl })

    const res = await handle(makeReq(undefined, { rawBody: JSON.stringify({ email: TEST_EMAIL, password: 'x'.repeat(2000) }) }))
    expect(res.status).toBe(400)
    expect(rpcSpy).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects GET requests with 405', async () => {
    const db = makeDb()
    const handle = buildHandler({ db, authUrl: 'https://proj.supabase.co', anonKey: 'anon', fetchImpl: vi.fn() })
    const res = await handle(makeReq(undefined, { method: 'GET' }))
    expect(res.status).toBe(405)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// B. Precheck (account lockout / IP throttle) — must block BEFORE Supabase Auth
// ═══════════════════════════════════════════════════════════════════════════
describe('precheck blocks before ever calling Supabase Auth', () => {
  it('rejects when the account is locked, without calling fetch', async () => {
    const db = makeDb({ precheck: { data: { allowed: false }, error: null } })
    const fetchImpl = vi.fn()
    const handle = buildHandler({ db, authUrl: 'https://proj.supabase.co', anonKey: 'anon', fetchImpl })

    const res = await handle(makeReq({ email: TEST_EMAIL, password: TEST_PASSWORD }))
    expect(res.status).toBe(400)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('fails CLOSED (rejects, no Supabase Auth call) when the precheck RPC errors', async () => {
    const db = makeDb({ precheck: { data: null, error: { message: 'connection refused' } } })
    const fetchImpl = vi.fn()
    const handle = buildHandler({ db, authUrl: 'https://proj.supabase.co', anonKey: 'anon', fetchImpl })

    const res = await handle(makeReq({ email: TEST_EMAIL, password: TEST_PASSWORD }))
    expect(res.status).toBe(400)
    expect(fetchImpl).not.toHaveBeenCalled()
    // The real error must never reach the response body.
    const bodyText = JSON.stringify(await res.clone().json())
    expect(bodyText).not.toContain('connection refused')
  })

  it('fails CLOSED when db is not configured (null)', async () => {
    const fetchImpl = vi.fn()
    const handle = buildHandler({ db: null, authUrl: 'https://proj.supabase.co', anonKey: 'anon', fetchImpl })
    const res = await handle(makeReq({ email: TEST_EMAIL, password: TEST_PASSWORD }))
    expect(res.status).toBe(400)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('fails CLOSED when the Supabase Auth fetch itself throws (network error)', async () => {
    const db = makeDb()
    const fetchImpl = vi.fn(async () => { throw new Error('network down') })
    const handle = buildHandler({ db, authUrl: 'https://proj.supabase.co', anonKey: 'anon', fetchImpl })
    const res = await handle(makeReq({ email: TEST_EMAIL, password: TEST_PASSWORD }))
    expect(res.status).toBe(400)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// C. Successful login — forwards to Supabase Auth, resets counter, returns tokens
// ═══════════════════════════════════════════════════════════════════════════
describe('successful login', () => {
  it('forwards credentials to the real Supabase Auth token endpoint', async () => {
    const db = makeDb()
    const fetchImpl = vi.fn(async () => authSuccessResponse())
    const handle = buildHandler({ db, authUrl: 'https://proj.supabase.co', anonKey: 'my-anon-key', fetchImpl })

    await handle(makeReq({ email: TEST_EMAIL, password: TEST_PASSWORD }))

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://proj.supabase.co/auth/v1/token?grant_type=password')
    expect(init.headers.apikey).toBe('my-anon-key')
    expect(JSON.parse(init.body)).toEqual({ email: TEST_EMAIL, password: TEST_PASSWORD })
  })

  it('returns exactly access_token and refresh_token, nothing else from the Auth response', async () => {
    const db = makeDb()
    const fetchImpl = vi.fn(async () => authSuccessResponse())
    const handle = buildHandler({ db, authUrl: 'https://proj.supabase.co', anonKey: 'anon', fetchImpl })

    const res = await handle(makeReq({ email: TEST_EMAIL, password: TEST_PASSWORD }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ access_token: 'fake.jwt.access', refresh_token: 'fake_refresh_token' })
  })

  it('records the outcome as success', async () => {
    const rpcSpy = vi.fn(async (name, args) => {
      if (name === 'check_dashboard_login_allowed') return { data: { allowed: true }, error: null }
      if (name === 'record_dashboard_login_outcome') {
        expect(args.p_success).toBe(true)
        expect(args.p_account_key).toBe(TEST_EMAIL)
        return { data: { locked: false }, error: null }
      }
      throw new Error('unexpected rpc')
    })
    const db = makeDb({ rpcSpy })
    const fetchImpl = vi.fn(async () => authSuccessResponse())
    const handle = buildHandler({ db, authUrl: 'https://proj.supabase.co', anonKey: 'anon', fetchImpl })

    await handle(makeReq({ email: TEST_EMAIL, password: TEST_PASSWORD }))
    expect(rpcSpy).toHaveBeenCalledWith('record_dashboard_login_outcome', expect.objectContaining({ p_success: true }))
  })

  it('normalizes the account_key (trim + lowercase) before every RPC call', async () => {
    const rpcSpy = vi.fn(async (name) => {
      if (name === 'check_dashboard_login_allowed') return { data: { allowed: true }, error: null }
      return { data: { locked: false }, error: null }
    })
    const db = makeDb({ rpcSpy })
    const fetchImpl = vi.fn(async () => authSuccessResponse())
    const handle = buildHandler({ db, authUrl: 'https://proj.supabase.co', anonKey: 'anon', fetchImpl })

    await handle(makeReq({ email: '  Owner@Example.COM  ', password: TEST_PASSWORD }))
    expect(rpcSpy.mock.calls[0][1].p_account_key).toBe('owner@example.com')
    expect(rpcSpy.mock.calls[1][1].p_account_key).toBe('owner@example.com')
  })

  it('does not flip a real success into a rejection if recording the outcome fails', async () => {
    const rpcSpy = vi.fn(async (name) => {
      if (name === 'check_dashboard_login_allowed') return { data: { allowed: true }, error: null }
      if (name === 'record_dashboard_login_outcome') throw new Error('db blip')
      throw new Error('unexpected')
    })
    const db = makeDb({ rpcSpy })
    const fetchImpl = vi.fn(async () => authSuccessResponse())
    const handle = buildHandler({ db, authUrl: 'https://proj.supabase.co', anonKey: 'anon', fetchImpl })

    const res = await handle(makeReq({ email: TEST_EMAIL, password: TEST_PASSWORD }))
    expect(res.status).toBe(200)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// D. Wrong password — generic rejection, recorded as failure
// ═══════════════════════════════════════════════════════════════════════════
describe('wrong password', () => {
  it('returns the generic rejection when Supabase Auth rejects the credentials', async () => {
    const db = makeDb()
    const fetchImpl = vi.fn(async () => authFailureResponse())
    const handle = buildHandler({ db, authUrl: 'https://proj.supabase.co', anonKey: 'anon', fetchImpl })

    const res = await handle(makeReq({ email: TEST_EMAIL, password: 'wrong' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_credentials', error_description: 'Invalid login credentials' })
  })

  it('records the outcome as failure', async () => {
    const rpcSpy = vi.fn(async (name, args) => {
      if (name === 'check_dashboard_login_allowed') return { data: { allowed: true }, error: null }
      if (name === 'record_dashboard_login_outcome') {
        expect(args.p_success).toBe(false)
        return { data: { locked: false }, error: null }
      }
      throw new Error('unexpected')
    })
    const db = makeDb({ rpcSpy })
    const fetchImpl = vi.fn(async () => authFailureResponse())
    const handle = buildHandler({ db, authUrl: 'https://proj.supabase.co', anonKey: 'anon', fetchImpl })

    await handle(makeReq({ email: TEST_EMAIL, password: 'wrong' }))
    expect(rpcSpy).toHaveBeenCalledWith('record_dashboard_login_outcome', expect.objectContaining({ p_success: false }))
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// D2. email_not_confirmed — preserved distinctly (pre-existing Login.jsx UX),
// only ever reachable with the CORRECT password (empirically confirmed live
// against Supabase Auth in the implementation task), so it never reopens
// enumeration on wrong-password attempts.
// ═══════════════════════════════════════════════════════════════════════════
describe('email_not_confirmed (correct password, unconfirmed account)', () => {
  function authEmailNotConfirmedResponse() {
    return new Response(JSON.stringify({ code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' }), { status: 400 })
  }

  it('returns a distinct {error:"email_not_confirmed"} response, not the generic rejection, and not tokens', async () => {
    const db = makeDb()
    const fetchImpl = vi.fn(async () => authEmailNotConfirmedResponse())
    const handle = buildHandler({ db, authUrl: 'https://x.supabase.co', anonKey: 'a', fetchImpl })

    const res = await handle(makeReq({ email: TEST_EMAIL, password: 'correct-but-unconfirmed' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: 'email_not_confirmed' })
    expect(body).not.toEqual(GENERIC_BODY_FOR_TEST)
  })

  it('records the outcome as success (resets the counter), not as a failure', async () => {
    const rpcSpy = vi.fn(async (name, args) => {
      if (name === 'check_dashboard_login_allowed') return { data: { allowed: true }, error: null }
      if (name === 'record_dashboard_login_outcome') {
        expect(args.p_success).toBe(true)
        return { data: { locked: false }, error: null }
      }
      throw new Error('unexpected')
    })
    const db = makeDb({ rpcSpy })
    const fetchImpl = vi.fn(async () => authEmailNotConfirmedResponse())
    const handle = buildHandler({ db, authUrl: 'https://x.supabase.co', anonKey: 'a', fetchImpl })

    await handle(makeReq({ email: TEST_EMAIL, password: 'correct-but-unconfirmed' }))
    expect(rpcSpy).toHaveBeenCalledWith('record_dashboard_login_outcome', expect.objectContaining({ p_success: true }))
  })
})

const GENERIC_BODY_FOR_TEST = { error: 'invalid_credentials', error_description: 'Invalid login credentials' }

// ═══════════════════════════════════════════════════════════════════════════
// E. Enumeration safety — every rejection path must be byte-identical
// ═══════════════════════════════════════════════════════════════════════════
describe('enumeration safety — every rejection reason converges to one response', () => {
  it('malformed input, locked account, IP-throttled, and wrong password all return the identical body+status', async () => {
    const malformedRes = await buildHandler({ db: makeDb(), authUrl: 'https://x.supabase.co', anonKey: 'a', fetchImpl: vi.fn() })(
      makeReq({ email: TEST_EMAIL }) // missing password
    )
    const lockedRes = await buildHandler({
      db: makeDb({ precheck: { data: { allowed: false }, error: null } }),
      authUrl: 'https://x.supabase.co', anonKey: 'a', fetchImpl: vi.fn(),
    })(makeReq({ email: TEST_EMAIL, password: TEST_PASSWORD }))
    const wrongPasswordRes = await buildHandler({
      db: makeDb(), authUrl: 'https://x.supabase.co', anonKey: 'a',
      fetchImpl: vi.fn(async () => authFailureResponse()),
    })(makeReq({ email: TEST_EMAIL, password: 'wrong' }))
    const limiterErrorRes = await buildHandler({
      db: makeDb({ precheck: { data: null, error: { message: 'boom' } } }),
      authUrl: 'https://x.supabase.co', anonKey: 'a', fetchImpl: vi.fn(),
    })(makeReq({ email: TEST_EMAIL, password: TEST_PASSWORD }))

    const bodies = await Promise.all([malformedRes, lockedRes, wrongPasswordRes, limiterErrorRes].map((r) => r.clone().json()))
    const statuses = [malformedRes, lockedRes, wrongPasswordRes, limiterErrorRes].map((r) => r.status)

    expect(new Set(statuses).size).toBe(1) // all identical status
    expect(bodies.every((b) => JSON.stringify(b) === JSON.stringify(bodies[0]))).toBe(true) // all identical body
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// F. CORS
// ═══════════════════════════════════════════════════════════════════════════
describe('CORS origin allowlisting', () => {
  it('reflects an allowed origin', async () => {
    const db = makeDb()
    const handle = buildHandler({ db, authUrl: 'https://x.supabase.co', anonKey: 'a', fetchImpl: vi.fn(async () => authFailureResponse()), allowedOrigins: ['https://simsimmenu.com'] })
    const res = await handle(makeReq({ email: TEST_EMAIL, password: 'wrong' }, { origin: 'https://simsimmenu.com' }))
    expect(res.headers.get('access-control-allow-origin')).toBe('https://simsimmenu.com')
  })

  it('does not reflect a disallowed origin', async () => {
    const db = makeDb()
    const handle = buildHandler({ db, authUrl: 'https://x.supabase.co', anonKey: 'a', fetchImpl: vi.fn(async () => authFailureResponse()), allowedOrigins: ['https://simsimmenu.com'] })
    const res = await handle(makeReq({ email: TEST_EMAIL, password: 'wrong' }, { origin: 'https://evil.example.com' }))
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('does not use a wildcard origin', async () => {
    const db = makeDb()
    const handle = buildHandler({ db, authUrl: 'https://x.supabase.co', anonKey: 'a', fetchImpl: vi.fn(async () => authFailureResponse()) })
    const res = await handle(makeReq({ email: TEST_EMAIL, password: 'wrong' }, { origin: 'https://simsimmenu.com' }))
    expect(res.headers.get('access-control-allow-origin')).not.toBe('*')
  })

  it('handles OPTIONS preflight', async () => {
    const db = makeDb()
    const handle = buildHandler({ db, authUrl: 'https://x.supabase.co', anonKey: 'a', fetchImpl: vi.fn() })
    const res = await handle(makeReq(undefined, { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// G. Secret safety — password/tokens must never appear in logs or be re-referenced
// ═══════════════════════════════════════════════════════════════════════════
describe('secret safety', () => {
  it('never logs the password, in success or failure', async () => {
    const db = makeDb()
    const fetchImplSuccess = vi.fn(async () => authSuccessResponse())
    await buildHandler({ db, authUrl: 'https://x.supabase.co', anonKey: 'a', fetchImpl: fetchImplSuccess })(
      makeReq({ email: TEST_EMAIL, password: TEST_PASSWORD })
    )
    const fetchImplFail = vi.fn(async () => authFailureResponse())
    await buildHandler({ db, authUrl: 'https://x.supabase.co', anonKey: 'a', fetchImpl: fetchImplFail })(
      makeReq({ email: TEST_EMAIL, password: TEST_PASSWORD })
    )

    const allLogCalls = [...consoleLogSpy.mock.calls, ...consoleWarnSpy.mock.calls, ...consoleErrorSpy.mock.calls]
    const allLogText = JSON.stringify(allLogCalls)
    expect(allLogText).not.toContain(TEST_PASSWORD)
  })

  it('never logs the access_token or refresh_token', async () => {
    const db = makeDb()
    const fetchImpl = vi.fn(async () => authSuccessResponse())
    await buildHandler({ db, authUrl: 'https://x.supabase.co', anonKey: 'a', fetchImpl })(
      makeReq({ email: TEST_EMAIL, password: TEST_PASSWORD })
    )
    const allLogCalls = [...consoleLogSpy.mock.calls, ...consoleWarnSpy.mock.calls, ...consoleErrorSpy.mock.calls]
    const allLogText = JSON.stringify(allLogCalls)
    expect(allLogText).not.toContain('fake.jwt.access')
    expect(allLogText).not.toContain('fake_refresh_token')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// H. ipHash — regression proof it's unchanged from the existing precedent
// ═══════════════════════════════════════════════════════════════════════════
describe('ipHash — same extraction/hash contract as send-phone-otp/loyalty', () => {
  it('extracts the first x-forwarded-for entry', () => {
    const req = new Request('https://example.test/x', { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } })
    expect(extractSourceIp(req)).toBe('1.2.3.4')
  })

  it('falls back to x-real-ip, then "unknown"', () => {
    const reqRealIp = new Request('https://example.test/x', { headers: { 'x-real-ip': '9.9.9.9' } })
    expect(extractSourceIp(reqRealIp)).toBe('9.9.9.9')
    const reqNone = new Request('https://example.test/x')
    expect(extractSourceIp(reqNone)).toBe('unknown')
  })

  it('hashes deterministically (same IP -> same hash)', async () => {
    const h1 = await hashIp('1.2.3.4')
    const h2 = await hashIp('1.2.3.4')
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
  })
})
