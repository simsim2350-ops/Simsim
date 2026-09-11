// app/api/customer/checkout — Phase 3C.2 (server-side order boundary) test suite.
//
// Covers: session cookie is the ONLY source of customer_id (never the body,
// even when the body supplies one — the spoofing case), missing/invalid/
// revoked session all fail closed with a generic 401 and never call
// create_order, valid session correctly calls create_order /
// create_order_from_table_qr with customer_id from the session, error
// passthrough, missing service_role, and safe-logging invariants (no
// token/full phone/customer_id leaked to console).
//
// No real Supabase call anywhere in this file — db.rpc is always a fake.

import { describe, it, expect, vi } from 'vitest'
import { buildCheckoutHandler } from '../../menu-next/app/api/customer/checkout/handler.js'

const TEST_TOKEN = 'a'.repeat(64)
const CUSTOMER_A = '11111111-1111-1111-1111-111111111111'
const CUSTOMER_B = '22222222-2222-2222-2222-222222222222'
const TEST_PHONE = '512345678'
// Customer B's own verified phone — distinct from TEST_PHONE (Customer A's),
// used by the phone/session binding tests below.
const TEST_PHONE_B = '598765432'

function makeReq(body, { method = 'POST', cookie } = {}) {
  const headers = {}
  if (cookie !== undefined) headers['cookie'] = cookie
  return new Request('https://example.test/api/customer/checkout', {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function withSessionCookie(token = TEST_TOKEN) {
  return `other_cookie=1; simsim_customer_session=${token}; another=2`
}

function makeDb({
  validateResult = { data: { valid: true, customer_id: CUSTOMER_A, phone: TEST_PHONE }, error: null },
  createOrderResult = { data: { id: 'order-1', order_number: '#0001', access_token: 'tok', subtotal: 5, tax: 0.75, delivery_fee: 0, total: 5.75, price_changed: false, price_changes: [] }, error: null },
  rpcSpy,
} = {}) {
  return {
    rpc: rpcSpy ?? vi.fn(async (name, args) => {
      if (name === 'validate_customer_session') return validateResult
      if (name === 'create_order' || name === 'create_order_from_table_qr') return createOrderResult
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

const validOrderBody = {
  p_restaurant_id: 'rest-1',
  p_branch_id: 'branch-1',
  p_type: 'takeaway',
  p_customer_phone: TEST_PHONE,
  p_items: [{ product_id: 'prod-1', quantity: 1 }],
}

const validQrBody = {
  p_qr_token: 'qr-token-1',
  p_customer_phone: TEST_PHONE,
  p_items: [{ product_id: 'prod-1', quantity: 1 }],
}

describe('POST /api/customer/checkout — method / session gate', () => {
  it('rejects non-POST', async () => {
    const handle = buildCheckoutHandler({ db: makeDb() })
    const res = await handle(makeReq(undefined, { method: 'GET' }))
    expect(res.status).toBe(405)
  })

  it('rejects with no cookie header at all — generic 401, no RPC call', async () => {
    const rpcSpy = vi.fn()
    const handle = buildCheckoutHandler({ db: makeDb({ rpcSpy }) })
    const res = await handle(makeReq(validOrderBody))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
    expect(rpcSpy).not.toHaveBeenCalled()
  })

  it('rejects when the cookie header exists but has no simsim_customer_session entry', async () => {
    const rpcSpy = vi.fn()
    const handle = buildCheckoutHandler({ db: makeDb({ rpcSpy }) })
    const res = await handle(makeReq(validOrderBody, { cookie: 'unrelated=1' }))
    expect(res.status).toBe(401)
    expect(rpcSpy).not.toHaveBeenCalled()
  })

  it('rejects an invalid/expired/revoked session with the identical generic 401 — no order created', async () => {
    const rpcSpy = vi.fn(async (name) => {
      if (name === 'validate_customer_session') return { data: { valid: false, customer_id: null }, error: null }
      throw new Error(`create_order must not be called: ${name}`)
    })
    const handle = buildCheckoutHandler({ db: makeDb({ rpcSpy }) })
    const res = await handle(makeReq(validOrderBody, { cookie: withSessionCookie() }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
    expect(rpcSpy).toHaveBeenCalledTimes(1)
    expect(rpcSpy).toHaveBeenCalledWith('validate_customer_session', { p_token: TEST_TOKEN })
  })

  it('fails closed with a generic 500 when service_role is not configured — never invents a client', async () => {
    const handle = buildCheckoutHandler({ db: null })
    const res = await handle(makeReq(validOrderBody, { cookie: withSessionCookie() }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'internal_error' })
  })
})

describe('POST /api/customer/checkout — customer_id trust boundary (spoofing)', () => {
  it('NEVER reads customer_id from the body, even when supplied — uses only the session customer_id', async () => {
    const rpcSpy = vi.fn(async (name, args) => {
      if (name === 'validate_customer_session') return { data: { valid: true, customer_id: CUSTOMER_A, phone: TEST_PHONE }, error: null }
      if (name === 'create_order') {
        expect(args.p_customer_id).toBe(CUSTOMER_A) // never CUSTOMER_B, despite the body below
        return { data: { id: 'order-1', order_number: '#0001', access_token: 'tok', subtotal: 5, tax: 0.75, delivery_fee: 0, total: 5.75, price_changed: false, price_changes: [] }, error: null }
      }
      throw new Error(`unexpected rpc: ${name}`)
    })
    const handle = buildCheckoutHandler({ db: makeDb({ rpcSpy }) })
    const spoofedBody = { ...validOrderBody, customer_id: CUSTOMER_B, p_customer_id: CUSTOMER_B }
    const res = await handle(makeReq(spoofedBody, { cookie: withSessionCookie() }))
    expect(res.status).toBe(200)
    const createOrderCall = rpcSpy.mock.calls.find((c) => c[0] === 'create_order')
    expect(createOrderCall[1].p_customer_id).toBe(CUSTOMER_A)
    expect(createOrderCall[1].p_customer_id).not.toBe(CUSTOMER_B)
  })

  it('the resulting order is never attributable to a different authenticated customer (B logs in, A cannot become B)', async () => {
    const rpcSpy = vi.fn(async (name, args) => {
      if (name === 'validate_customer_session') return { data: { valid: true, customer_id: CUSTOMER_B, phone: TEST_PHONE_B }, error: null }
      if (name === 'create_order') return { data: { id: 'order-2', order_number: '#0002', access_token: 'tok', subtotal: 5, tax: 0.75, delivery_fee: 0, total: 5.75, price_changed: false, price_changes: [] }, error: null }
      throw new Error(`unexpected rpc: ${name}`)
    })
    const handle = buildCheckoutHandler({ db: makeDb({ rpcSpy }) })
    // Session belongs to B, checking out with B's own real phone; body tries
    // to assert customer_id A. Order must be B's, never A's — this test is
    // isolating the customer_id trust boundary, not the phone/session
    // binding check (covered separately below), so the phone here matches B.
    const spoofedBody = { ...validOrderBody, p_customer_phone: TEST_PHONE_B, p_customer_id: CUSTOMER_A }
    await handle(makeReq(spoofedBody, { cookie: withSessionCookie() }))
    const createOrderCall = rpcSpy.mock.calls.find((c) => c[0] === 'create_order')
    expect(createOrderCall[1].p_customer_id).toBe(CUSTOMER_B)
  })
})

// Phase 3C.7 — fixes a proven production bug (see
// CUSTOMER_IDENTITY_PHONE_VERIFICATION_BYPASS_DIAGNOSTIC_REPORT.md): a valid
// session alone let a browser place an order under ANY phone number, not
// just the one its session was actually OTP-verified for. These tests
// reproduce the exact bug scenario and lock in the fix.
describe('POST /api/customer/checkout — phone/session binding (Phase 3C.7)', () => {
  it('session phone matches submitted phone exactly → order created', async () => {
    const rpcSpy = vi.fn(async (name) => {
      if (name === 'validate_customer_session') return { data: { valid: true, customer_id: CUSTOMER_A, phone: TEST_PHONE }, error: null }
      if (name === 'create_order') return { data: { id: 'order-1', order_number: '#0001', access_token: 'tok', subtotal: 5, tax: 0.75, delivery_fee: 0, total: 5.75, price_changed: false, price_changes: [] }, error: null }
      throw new Error(`unexpected rpc: ${name}`)
    })
    const handle = buildCheckoutHandler({ db: makeDb({ rpcSpy }) })
    const res = await handle(makeReq(validOrderBody, { cookie: withSessionCookie() }))
    expect(res.status).toBe(200)
    expect(rpcSpy.mock.calls.some((c) => c[0] === 'create_order')).toBe(true)
  })

  it('EXACT PRODUCTION BUG REPRODUCTION: Phone A verified → session A → checkout submits Phone B → 401 phone_verification_required, create_order NEVER called', async () => {
    const rpcSpy = vi.fn(async (name) => {
      // Session was verified for TEST_PHONE (Phone A) — this is fixed truth
      // for the whole test, exactly like the real session row in prod.
      if (name === 'validate_customer_session') return { data: { valid: true, customer_id: CUSTOMER_A, phone: TEST_PHONE }, error: null }
      throw new Error(`create_order must NEVER be called on a phone mismatch: ${name}`)
    })
    const handle = buildCheckoutHandler({ db: makeDb({ rpcSpy }) })
    // Same session (Phone A's), but the checkout body now submits Phone B —
    // exactly the production scenario that created order #0168 with a phone
    // that didn't match the session's own verified identity.
    const res = await handle(makeReq({ ...validOrderBody, p_customer_phone: TEST_PHONE_B }, { cookie: withSessionCookie() }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'phone_verification_required' })
    expect(rpcSpy.mock.calls.some((c) => c[0] === 'create_order')).toBe(false)
  })

  it('after the mismatch above, the SAME session retried with Phone A again → SUCCESS, no new OTP required', async () => {
    const rpcSpy = vi.fn(async (name) => {
      if (name === 'validate_customer_session') return { data: { valid: true, customer_id: CUSTOMER_A, phone: TEST_PHONE }, error: null }
      if (name === 'create_order') return { data: { id: 'order-1', order_number: '#0001', access_token: 'tok', subtotal: 5, tax: 0.75, delivery_fee: 0, total: 5.75, price_changed: false, price_changes: [] }, error: null }
      throw new Error(`unexpected rpc: ${name}`)
    })
    const handle = buildCheckoutHandler({ db: makeDb({ rpcSpy }) })
    // Retry with the original phone the session actually belongs to.
    const res = await handle(makeReq(validOrderBody, { cookie: withSessionCookie() }))
    expect(res.status).toBe(200)
    expect(rpcSpy.mock.calls.some((c) => c[0] === 'create_order')).toBe(true)
  })

  it('canonical-equivalent phone formats (+9665XXXXXXXX / 9665XXXXXXXX / 05XXXXXXXX) all match the session phone → order created', async () => {
    const formats = [`+966${TEST_PHONE}`, `966${TEST_PHONE}`, `0${TEST_PHONE}`, TEST_PHONE]
    for (const formatted of formats) {
      const rpcSpy = vi.fn(async (name, args) => {
        if (name === 'validate_customer_session') return { data: { valid: true, customer_id: CUSTOMER_A, phone: TEST_PHONE }, error: null }
        if (name === 'create_order') {
          expect(args.p_customer_phone).toBe(formatted) // forwarded to create_order exactly as submitted — only the COMPARISON is canonicalized
          return { data: { id: 'order-1', order_number: '#0001', access_token: 'tok', subtotal: 5, tax: 0.75, delivery_fee: 0, total: 5.75, price_changed: false, price_changes: [] }, error: null }
        }
        throw new Error(`unexpected rpc: ${name}`)
      })
      const handle = buildCheckoutHandler({ db: makeDb({ rpcSpy }) })
      const res = await handle(makeReq({ ...validOrderBody, p_customer_phone: formatted }, { cookie: withSessionCookie() }))
      expect(res.status).toBe(200)
    }
  })

  it('a genuinely different phone (not just a different format) is rejected, never created as an order', async () => {
    const rpcSpy = vi.fn(async (name) => {
      if (name === 'validate_customer_session') return { data: { valid: true, customer_id: CUSTOMER_A, phone: TEST_PHONE }, error: null }
      throw new Error(`create_order must not be called: ${name}`)
    })
    const handle = buildCheckoutHandler({ db: makeDb({ rpcSpy }) })
    const res = await handle(makeReq({ ...validOrderBody, p_customer_phone: TEST_PHONE_B }, { cookie: withSessionCookie() }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'phone_verification_required' })
  })

  it("Customer A's session cannot be used to place an order under Customer B's phone (cross-customer phone spoofing)", async () => {
    const rpcSpy = vi.fn(async (name) => {
      if (name === 'validate_customer_session') return { data: { valid: true, customer_id: CUSTOMER_A, phone: TEST_PHONE }, error: null }
      throw new Error(`create_order must not be called: ${name}`)
    })
    const handle = buildCheckoutHandler({ db: makeDb({ rpcSpy }) })
    // A's session, but the form now has B's real phone typed into it.
    const res = await handle(makeReq({ ...validOrderBody, p_customer_phone: TEST_PHONE_B }, { cookie: withSessionCookie() }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'phone_verification_required' })
    expect(rpcSpy.mock.calls.some((c) => c[0] === 'create_order')).toBe(false)
  })

  it('a session with no phone at all (data-integrity edge case) fails closed with internal_error, not a false success', async () => {
    const rpcSpy = vi.fn(async (name) => {
      if (name === 'validate_customer_session') return { data: { valid: true, customer_id: CUSTOMER_A, phone: null }, error: null }
      throw new Error(`create_order must not be called: ${name}`)
    })
    const handle = buildCheckoutHandler({ db: makeDb({ rpcSpy }) })
    const res = await handle(makeReq(validOrderBody, { cookie: withSessionCookie() }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'internal_error' })
  })

  it('idempotency is unaffected by the phone check — same key, same matching phone, resubmitted → still forwarded unchanged', async () => {
    const rpcSpy = vi.fn(async (name, args) => {
      if (name === 'validate_customer_session') return { data: { valid: true, customer_id: CUSTOMER_A, phone: TEST_PHONE }, error: null }
      if (name === 'create_order') return { data: { id: 'order-1', order_number: '#0001', access_token: 'tok', subtotal: 5, tax: 0.75, delivery_fee: 0, total: 5.75, price_changed: false, price_changes: [] }, error: null }
    })
    const handle = buildCheckoutHandler({ db: makeDb({ rpcSpy }) })
    await handle(makeReq({ ...validOrderBody, p_idempotency_key: 'idem-abc' }, { cookie: withSessionCookie() }))
    const call = rpcSpy.mock.calls.find((c) => c[0] === 'create_order')
    expect(call[1].p_idempotency_key).toBe('idem-abc')
  })

  it('Car Pickup fields are unaffected by the phone check — still forwarded when the phone matches', async () => {
    const rpcSpy = vi.fn(async (name, args) => {
      if (name === 'validate_customer_session') return { data: { valid: true, customer_id: CUSTOMER_A, phone: TEST_PHONE }, error: null }
      if (name === 'create_order') return { data: { id: 'order-1', order_number: '#0001', access_token: 'tok', subtotal: 5, tax: 0.75, delivery_fee: 0, total: 5.75, price_changed: false, price_changes: [] }, error: null }
    })
    const handle = buildCheckoutHandler({ db: makeDb({ rpcSpy }) })
    const res = await handle(makeReq({ ...validOrderBody, p_type: 'car_pickup', p_car_info: 'red car' }, { cookie: withSessionCookie() }))
    expect(res.status).toBe(200)
    const call = rpcSpy.mock.calls.find((c) => c[0] === 'create_order')
    expect(call[1].p_car_info).toBe('red car')
  })

  it('QR checkout is equally protected by the phone check', async () => {
    const rpcSpy = vi.fn(async (name) => {
      if (name === 'validate_customer_session') return { data: { valid: true, customer_id: CUSTOMER_A, phone: TEST_PHONE }, error: null }
      throw new Error(`create_order_from_table_qr must not be called: ${name}`)
    })
    const handle = buildCheckoutHandler({ db: makeDb({ rpcSpy }) })
    const res = await handle(makeReq({ ...validQrBody, p_customer_phone: TEST_PHONE_B }, { cookie: withSessionCookie() }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'phone_verification_required' })
  })

  it('never logs the full phone number even on a phone mismatch', async () => {
    const spy = spyOnConsole()
    const rpcSpy = vi.fn(async (name) => {
      if (name === 'validate_customer_session') return { data: { valid: true, customer_id: CUSTOMER_A, phone: TEST_PHONE }, error: null }
      throw new Error(`create_order must not be called: ${name}`)
    })
    const handle = buildCheckoutHandler({ db: makeDb({ rpcSpy }) })
    await handle(makeReq({ ...validOrderBody, p_customer_phone: TEST_PHONE_B }, { cookie: withSessionCookie() }))
    spy.expectNeverLogged(TEST_PHONE)
    spy.expectNeverLogged(TEST_PHONE_B)
    spy.restore()
  })
})

describe('POST /api/customer/checkout — successful order creation', () => {
  it('valid session + regular order fields → calls create_order with all fields forwarded + session customer_id', async () => {
    const rpcSpy = vi.fn(async (name, args) => {
      if (name === 'validate_customer_session') return { data: { valid: true, customer_id: CUSTOMER_A, phone: TEST_PHONE }, error: null }
      if (name === 'create_order') return { data: { id: 'order-1', order_number: '#0001', access_token: 'tok', subtotal: 5, tax: 0.75, delivery_fee: 0, total: 5.75, price_changed: false, price_changes: [] }, error: null }
      throw new Error(`unexpected rpc: ${name}`)
    })
    const handle = buildCheckoutHandler({ db: makeDb({ rpcSpy }) })
    const res = await handle(makeReq(validOrderBody, { cookie: withSessionCookie() }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ id: 'order-1', order_number: '#0001' })
    const createOrderCall = rpcSpy.mock.calls.find((c) => c[0] === 'create_order')
    expect(createOrderCall[1]).toMatchObject({
      p_restaurant_id: 'rest-1',
      p_branch_id: 'branch-1',
      p_type: 'takeaway',
      p_customer_phone: TEST_PHONE,
      p_customer_id: CUSTOMER_A,
    })
  })

  it('valid session + p_qr_token present → calls create_order_from_table_qr, not create_order', async () => {
    const rpcSpy = vi.fn(async (name, args) => {
      if (name === 'validate_customer_session') return { data: { valid: true, customer_id: CUSTOMER_A, phone: TEST_PHONE }, error: null }
      if (name === 'create_order_from_table_qr') return { data: { id: 'order-qr', order_number: '#0002', access_token: 'tok', subtotal: 5, tax: 0.75, delivery_fee: 0, total: 5.75, price_changed: false, price_changes: [] }, error: null }
      throw new Error(`create_order must not be called for a QR request: ${name}`)
    })
    const handle = buildCheckoutHandler({ db: makeDb({ rpcSpy }) })
    const res = await handle(makeReq(validQrBody, { cookie: withSessionCookie() }))
    expect(res.status).toBe(200)
    const qrCall = rpcSpy.mock.calls.find((c) => c[0] === 'create_order_from_table_qr')
    expect(qrCall[1]).toMatchObject({ p_qr_token: 'qr-token-1', p_customer_id: CUSTOMER_A })
  })

  it('never returns a session token in the JSON body', async () => {
    const handle = buildCheckoutHandler({ db: makeDb() })
    const res = await handle(makeReq(validOrderBody, { cookie: withSessionCookie() }))
    const text = await res.text()
    expect(text).not.toContain(TEST_TOKEN)
  })
})

describe('POST /api/customer/checkout — existing create_order behavior preserved', () => {
  it('passes through a create_order business-rule error unchanged (e.g. "delivery is unavailable")', async () => {
    const rpcSpy = vi.fn(async (name) => {
      if (name === 'validate_customer_session') return { data: { valid: true, customer_id: CUSTOMER_A, phone: TEST_PHONE }, error: null }
      if (name === 'create_order') return { data: null, error: { message: 'delivery is unavailable' } }
      throw new Error(`unexpected rpc: ${name}`)
    })
    const handle = buildCheckoutHandler({ db: makeDb({ rpcSpy }) })
    const res = await handle(makeReq(validOrderBody, { cookie: withSessionCookie() }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'delivery is unavailable' })
  })

  it('forwards p_idempotency_key unchanged', async () => {
    const rpcSpy = vi.fn(async (name, args) => {
      if (name === 'validate_customer_session') return { data: { valid: true, customer_id: CUSTOMER_A, phone: TEST_PHONE }, error: null }
      if (name === 'create_order') return { data: { id: 'order-1', order_number: '#0001', access_token: 'tok', subtotal: 5, tax: 0.75, delivery_fee: 0, total: 5.75, price_changed: false, price_changes: [] }, error: null }
    })
    const handle = buildCheckoutHandler({ db: makeDb({ rpcSpy }) })
    await handle(makeReq({ ...validOrderBody, p_idempotency_key: 'idem-123' }, { cookie: withSessionCookie() }))
    const call = rpcSpy.mock.calls.find((c) => c[0] === 'create_order')
    expect(call[1].p_idempotency_key).toBe('idem-123')
  })

  it('forwards Car Pickup fields (p_car_info) unchanged for car_pickup type', async () => {
    const rpcSpy = vi.fn(async (name, args) => {
      if (name === 'validate_customer_session') return { data: { valid: true, customer_id: CUSTOMER_A, phone: TEST_PHONE }, error: null }
      if (name === 'create_order') return { data: { id: 'order-1', order_number: '#0001', access_token: 'tok', subtotal: 5, tax: 0.75, delivery_fee: 0, total: 5.75, price_changed: false, price_changes: [] }, error: null }
    })
    const handle = buildCheckoutHandler({ db: makeDb({ rpcSpy }) })
    await handle(makeReq({ ...validOrderBody, p_type: 'car_pickup', p_car_info: 'red car' }, { cookie: withSessionCookie() }))
    const call = rpcSpy.mock.calls.find((c) => c[0] === 'create_order')
    expect(call[1].p_car_info).toBe('red car')
    expect(call[1].p_type).toBe('car_pickup')
  })

  it('rejects a malformed body (missing required fields) with invalid_request, after session validation succeeds', async () => {
    const rpcSpy = vi.fn(async (name) => {
      if (name === 'validate_customer_session') return { data: { valid: true, customer_id: CUSTOMER_A, phone: TEST_PHONE }, error: null }
      throw new Error(`create_order must not be called: ${name}`)
    })
    const handle = buildCheckoutHandler({ db: makeDb({ rpcSpy }) })
    const res = await handle(makeReq({ p_restaurant_id: 'rest-1' }, { cookie: withSessionCookie() }))
    expect(res.status).toBe(400)
    expect(rpcSpy).toHaveBeenCalledTimes(1) // only validate_customer_session — body is checked after session
    expect(rpcSpy.mock.calls[0][0]).toBe('validate_customer_session')
  })
})

describe('POST /api/customer/checkout — logging safety', () => {
  it('never logs the session token, full phone number, or customer_id', async () => {
    const spy = spyOnConsole()
    const handle = buildCheckoutHandler({ db: makeDb() })
    await handle(makeReq(validOrderBody, { cookie: withSessionCookie() }))
    spy.expectNeverLogged(TEST_TOKEN)
    spy.expectNeverLogged(TEST_PHONE)
    spy.expectNeverLogged(CUSTOMER_A)
    spy.restore()
  })

  it('never logs the token/phone/customer_id even on a create_order error', async () => {
    const spy = spyOnConsole()
    const rpcSpy = vi.fn(async (name) => {
      if (name === 'validate_customer_session') return { data: { valid: true, customer_id: CUSTOMER_A, phone: TEST_PHONE }, error: null }
      if (name === 'create_order') return { data: null, error: { message: 'restaurant is unavailable' } }
    })
    const handle = buildCheckoutHandler({ db: makeDb({ rpcSpy }) })
    await handle(makeReq(validOrderBody, { cookie: withSessionCookie() }))
    spy.expectNeverLogged(TEST_TOKEN)
    spy.expectNeverLogged(TEST_PHONE)
    spy.expectNeverLogged(CUSTOMER_A)
    spy.restore()
  })
})
