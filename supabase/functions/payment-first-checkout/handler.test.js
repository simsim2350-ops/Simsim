// @vitest-environment happy-dom
//
// اختبارات Edge Function لـ payment-first-checkout (TASK-PAY-3.6D-E).
// المنطق مُختبَر عبر handler.js (الدوال المُحقونة) — لا استيراد من index.ts (خاص بـDeno).
// لا Deno حقيقي، لا Supabase حقيقي، لا Moyasar حقيقي — orchestrate/db مُموَّهان بالكامل.

import { describe, it, expect, vi } from 'vitest'
import { buildHandler } from './handler.js'

const BASE_URL = 'https://app.simsim.example'
const VALID_QR_TOKEN = '11111111-1111-1111-1111-111111111111'

// ——————————— مساعدات Mock (نفس نمط tests/unit/paymentWebhook.test.js) ———————————

function makeChain(result = { data: null, error: null }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
}

function makeDb(...chains) {
  let i = 0
  return { from: vi.fn().mockImplementation(() => chains[i++] ?? makeChain()) }
}

function qrTableChain(overrides = {}) {
  return makeChain({
    data: { id: 'table-1', table_number: '5', restaurant_id: 'rest-1', branch_id: 'branch-1', ...overrides },
    error: null,
  })
}
function restaurantChain(overrides = {}) {
  return makeChain({
    data: { id: 'rest-1', slug: 'my-resto', is_active: true, platform_suspended: false, ...overrides },
    error: null,
  })
}
function branchChain(overrides = {}) {
  return makeChain({
    data: { id: 'branch-1', restaurant_id: 'rest-1', is_active: true, is_paused: false, ...overrides },
    error: null,
  })
}
function paymentTxChain(overrides = {}) {
  return makeChain({ data: { amount: 42.5, currency: 'SAR', ...overrides }, error: null })
}

function qrFoundDb(extra = []) {
  return makeDb(qrTableChain(), restaurantChain(), branchChain(), ...extra)
}
function slugFoundDb(extra = []) {
  return makeDb(restaurantChain(), ...extra)
}

function makeRequest(body, opts = {}) {
  const method = opts.method ?? 'POST'
  const hasBody = method !== 'OPTIONS' && method !== 'GET' && method !== 'HEAD'
  return new Request('https://example.com/payment-first-checkout', {
    method,
    headers: { 'content-type': 'application/json' },
    body: hasBody ? (opts.rawBody ?? JSON.stringify(body)) : undefined,
  })
}

const VALID_QR_BODY = Object.freeze({
  table_qr_token: VALID_QR_TOKEN,
  type: 'dine_in',
  customer_phone: '512345678',
  items: [{ product_id: 'p1', quantity: 1 }],
})

const VALID_SLUG_BODY = Object.freeze({
  restaurant_slug: 'my-resto',
  branch_id: 'branch-1',
  type: 'takeaway',
  customer_phone: '512345678',
  items: [{ product_id: 'p1', quantity: 1 }],
})

async function callHandler({ body, db, orchestrate, publicAppBaseUrl = BASE_URL, method, rawBody }) {
  const handle = buildHandler({ db, orchestrate, publicAppBaseUrl })
  const req = makeRequest(body, { method, rawBody })
  const res = await handle(req)
  const json = await res.json().catch(() => null)
  return { res, json }
}

const succeededOrchestrate = (overrides = {}) =>
  vi.fn().mockResolvedValue({
    status: 'succeeded',
    paymentTransactionId: 'tx-1',
    providerRef: 'pay_ref_1',
    paymentStatus: 'pending',
    redirectUrl: 'https://moyasar.example/checkout/abc',
    idempotencyKey: 'pay_generated_key',
    idempotent: false,
    ...overrides,
  })

// ══════════════════════════════════════════════════════════════════
// PHASE 21 — 1..49
// ══════════════════════════════════════════════════════════════════

describe('payment-first-checkout handler', () => {
  it('PFCX-01 OPTIONS → 200', async () => {
    const { res } = await callHandler({ body: null, db: makeDb(), orchestrate: vi.fn(), method: 'OPTIONS' })
    expect(res.status).toBe(200)
  })

  it('PFCX-02 wrong method → 405', async () => {
    const { res, json } = await callHandler({ body: null, db: makeDb(), orchestrate: vi.fn(), method: 'GET' })
    expect(res.status).toBe(405)
    expect(json.error).toBe('method_not_allowed')
  })

  it('PFCX-03 malformed JSON → 400', async () => {
    const { res, json } = await callHandler({ db: makeDb(), orchestrate: vi.fn(), rawBody: '{not json' })
    expect(res.status).toBe(400)
    expect(json.error).toBe('invalid_request')
  })

  it('PFCX-04 missing required field (customer_phone) → 400', async () => {
    const body = { ...VALID_QR_BODY, customer_phone: undefined }
    const { res, json } = await callHandler({ body, db: makeDb(), orchestrate: vi.fn() })
    expect(res.status).toBe(400)
    expect(json.error).toBe('invalid_request')
  })

  it('PFCX-05 missing required field (items) → 400', async () => {
    const body = { ...VALID_QR_BODY, items: undefined }
    const { res, json } = await callHandler({ body, db: makeDb(), orchestrate: vi.fn() })
    expect(res.status).toBe(400)
    expect(json.error).toBe('invalid_request')
  })

  it('PFCX-06 QR tenant found → orchestrate called with resolved restaurant/branch', async () => {
    const orchestrate = succeededOrchestrate()
    const db = qrFoundDb([paymentTxChain()])
    const { res, json } = await callHandler({ body: VALID_QR_BODY, db, orchestrate })
    expect(res.status).toBe(200)
    expect(json.status).toBe('succeeded')
    expect(orchestrate).toHaveBeenCalledWith(
      expect.objectContaining({ restaurant_id: 'rest-1', branch_id: 'branch-1' }),
      { db }
    )
  })

  it('PFCX-07 QR tenant not found → 200 rejected/tenant_not_found', async () => {
    const db = makeDb(qrTableChain({ id: undefined }), )
    db.from = vi.fn().mockImplementation(() => makeChain({ data: null, error: null }))
    const { res, json } = await callHandler({ body: VALID_QR_BODY, db, orchestrate: vi.fn() })
    expect(res.status).toBe(200)
    expect(json).toEqual({ status: 'rejected', reason: 'tenant_not_found' })
  })

  it('PFCX-08 QR inactive (qr_enabled/status filter yields no row) → 200 rejected/tenant_not_found', async () => {
    const db = makeDb(makeChain({ data: null, error: null }))
    const { res, json } = await callHandler({ body: VALID_QR_BODY, db, orchestrate: vi.fn() })
    expect(res.status).toBe(200)
    expect(json).toEqual({ status: 'rejected', reason: 'tenant_not_found' })
  })

  it('PFCX-09 restaurant inactive → 200 rejected/tenant_not_found', async () => {
    const db = makeDb(qrTableChain(), restaurantChain({ is_active: false }))
    const { res, json } = await callHandler({ body: VALID_QR_BODY, db, orchestrate: vi.fn() })
    expect(res.status).toBe(200)
    expect(json).toEqual({ status: 'rejected', reason: 'tenant_not_found' })
  })

  it('PFCX-10 restaurant platform_suspended → 200 rejected/tenant_not_found', async () => {
    const db = makeDb(qrTableChain(), restaurantChain({ platform_suspended: true }))
    const { res, json } = await callHandler({ body: VALID_QR_BODY, db, orchestrate: vi.fn() })
    expect(res.status).toBe(200)
    expect(json).toEqual({ status: 'rejected', reason: 'tenant_not_found' })
  })

  it('PFCX-11 branch inactive → 200 rejected/tenant_not_found', async () => {
    const db = makeDb(qrTableChain(), restaurantChain(), branchChain({ is_active: false }))
    const { res, json } = await callHandler({ body: VALID_QR_BODY, db, orchestrate: vi.fn() })
    expect(res.status).toBe(200)
    expect(json).toEqual({ status: 'rejected', reason: 'tenant_not_found' })
  })

  it('PFCX-12 branch is_paused → 200 rejected/tenant_not_found', async () => {
    const db = makeDb(qrTableChain(), restaurantChain(), branchChain({ is_paused: true }))
    const { res, json } = await callHandler({ body: VALID_QR_BODY, db, orchestrate: vi.fn() })
    expect(res.status).toBe(200)
    expect(json).toEqual({ status: 'rejected', reason: 'tenant_not_found' })
  })

  it('PFCX-13 non-QR restaurant found → orchestrate called with resolved restaurant_id + client branch_id', async () => {
    const orchestrate = succeededOrchestrate()
    const db = slugFoundDb([paymentTxChain()])
    const { res, json } = await callHandler({ body: VALID_SLUG_BODY, db, orchestrate })
    expect(res.status).toBe(200)
    expect(json.status).toBe('succeeded')
    expect(orchestrate).toHaveBeenCalledWith(
      expect.objectContaining({ restaurant_id: 'rest-1', branch_id: 'branch-1' }),
      { db }
    )
  })

  it('PFCX-14 non-QR restaurant missing → 200 rejected/tenant_not_found', async () => {
    const db = makeDb(makeChain({ data: null, error: null }))
    const { res, json } = await callHandler({ body: VALID_SLUG_BODY, db, orchestrate: vi.fn() })
    expect(res.status).toBe(200)
    expect(json).toEqual({ status: 'rejected', reason: 'tenant_not_found' })
  })

  it('PFCX-15 non-QR restaurant suspended → 200 rejected/tenant_not_found', async () => {
    const db = makeDb(restaurantChain({ platform_suspended: true }))
    const { res, json } = await callHandler({ body: VALID_SLUG_BODY, db, orchestrate: vi.fn() })
    expect(res.status).toBe(200)
    expect(json).toEqual({ status: 'rejected', reason: 'tenant_not_found' })
  })

  it('PFCX-16 invalid type → 400', async () => {
    const body = { ...VALID_SLUG_BODY, type: 'teleport' }
    const { res, json } = await callHandler({ body, db: makeDb(), orchestrate: vi.fn() })
    expect(res.status).toBe(400)
    expect(json.error).toBe('invalid_request')
  })

  it('PFCX-17 delivery missing delivery_address → 400', async () => {
    const body = { ...VALID_SLUG_BODY, type: 'delivery' }
    const { res, json } = await callHandler({ body, db: makeDb(), orchestrate: vi.fn() })
    expect(res.status).toBe(400)
    expect(json.error).toBe('invalid_request')
  })

  it('PFCX-18 dine_in non-QR missing table_number → 400', async () => {
    const body = { ...VALID_SLUG_BODY, type: 'dine_in' }
    const { res, json } = await callHandler({ body, db: makeDb(), orchestrate: vi.fn() })
    expect(res.status).toBe(400)
    expect(json.error).toBe('invalid_request')
  })

  it('PFCX-19 QR table_number derived server-side (orchestrate receives resolved table_number)', async () => {
    const orchestrate = succeededOrchestrate()
    const db = qrFoundDb([paymentTxChain()])
    await callHandler({ body: VALID_QR_BODY, db, orchestrate })
    expect(orchestrate).toHaveBeenCalledWith(
      expect.objectContaining({ table_number: '5' }),
      { db }
    )
  })

  it('PFCX-20 client-supplied table_number for QR path cannot override server-derived value', async () => {
    const orchestrate = succeededOrchestrate()
    const db = qrFoundDb([paymentTxChain()])
    const body = { ...VALID_QR_BODY, table_number: 'FORGED-99' }
    await callHandler({ body, db, orchestrate })
    expect(orchestrate).toHaveBeenCalledWith(
      expect.objectContaining({ table_number: '5' }),
      { db }
    )
  })

  it('PFCX-21 >100 items → 400', async () => {
    const items = Array.from({ length: 101 }, (_, i) => ({ product_id: `p${i}`, quantity: 1 }))
    const body = { ...VALID_SLUG_BODY, items }
    const { res, json } = await callHandler({ body, db: makeDb(), orchestrate: vi.fn() })
    expect(res.status).toBe(400)
    expect(json.error).toBe('invalid_request')
  })

  it('PFCX-22 >32KB body → 400', async () => {
    const rawBody = JSON.stringify({ ...VALID_SLUG_BODY, notes: 'x'.repeat(40 * 1024) })
    const { res, json } = await callHandler({ db: makeDb(), orchestrate: vi.fn(), rawBody })
    expect(res.status).toBe(400)
    expect(json.error).toBe('invalid_request')
  })

  it('PFCX-23 absurd quantity (negative) → 400', async () => {
    const body = { ...VALID_SLUG_BODY, items: [{ product_id: 'p1', quantity: -1 }] }
    const { res, json } = await callHandler({ body, db: makeDb(), orchestrate: vi.fn() })
    expect(res.status).toBe(400)
    expect(json.error).toBe('invalid_request')
  })

  it('PFCX-23b absurd quantity (>1000) → 400', async () => {
    const body = { ...VALID_SLUG_BODY, items: [{ product_id: 'p1', quantity: 1001 }] }
    const { res, json } = await callHandler({ body, db: makeDb(), orchestrate: vi.fn() })
    expect(res.status).toBe(400)
    expect(json.error).toBe('invalid_request')
  })

  it('PFCX-24 overlong customer_name → 400 (rejected, not truncated)', async () => {
    const body = { ...VALID_SLUG_BODY, customer_name: 'a'.repeat(501) }
    const { res, json } = await callHandler({ body, db: makeDb(), orchestrate: vi.fn() })
    expect(res.status).toBe(400)
    expect(json.error).toBe('invalid_request')
  })

  it('PFCX-25 overlong notes → 400 (rejected, not truncated)', async () => {
    const body = { ...VALID_SLUG_BODY, notes: 'a'.repeat(501) }
    const { res, json } = await callHandler({ body, db: makeDb(), orchestrate: vi.fn() })
    expect(res.status).toBe(400)
    expect(json.error).toBe('invalid_request')
  })

  it('PFCX-26 overlong delivery_address → 400 (rejected, not truncated)', async () => {
    const body = { ...VALID_SLUG_BODY, type: 'delivery', delivery_address: 'a'.repeat(501) }
    const { res, json } = await callHandler({ body, db: makeDb(), orchestrate: vi.fn() })
    expect(res.status).toBe(400)
    expect(json.error).toBe('invalid_request')
  })

  it('PFCX-27 phone shape rejection → 400', async () => {
    const body = { ...VALID_SLUG_BODY, customer_phone: '12345' }
    const { res, json } = await callHandler({ body, db: makeDb(), orchestrate: vi.fn() })
    expect(res.status).toBe(400)
    expect(json.error).toBe('invalid_request')
  })

  it('PFCX-28 rejected → HTTP 200', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'rejected', reason: 'dry_run_failed' })
    const db = slugFoundDb()
    const { res, json } = await callHandler({ body: VALID_SLUG_BODY, db, orchestrate })
    expect(res.status).toBe(200)
    expect(json).toEqual({ status: 'rejected', reason: 'dry_run_failed' })
  })

  it('PFCX-29 price_changed → HTTP 200', async () => {
    const orchestrate = vi.fn().mockResolvedValue({
      status: 'price_changed',
      dryRun: { subtotal: 10, tax: 1.5, delivery_fee: 0, total: 11.5, price_changes: [] },
    })
    const db = slugFoundDb()
    const { res, json } = await callHandler({ body: VALID_SLUG_BODY, db, orchestrate })
    expect(res.status).toBe(200)
    expect(json).toEqual({
      status: 'price_changed',
      dryRun: { subtotal: 10, tax: 1.5, delivery_fee: 0, total: 11.5 },
    })
  })

  it('PFCX-30 failed → HTTP 200', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'failed', reason: 'provider_failed' })
    const db = slugFoundDb()
    const { res, json } = await callHandler({ body: VALID_SLUG_BODY, db, orchestrate })
    expect(res.status).toBe(200)
    expect(json).toEqual({ status: 'failed', reason: 'provider_failed' })
  })

  it('PFCX-31 retryable_error → HTTP 200', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'retryable_error', reason: 'idempotency_race_unrecovered' })
    const db = slugFoundDb()
    const { res, json } = await callHandler({ body: VALID_SLUG_BODY, db, orchestrate })
    expect(res.status).toBe(200)
    expect(json).toEqual({ status: 'retryable_error', reason: 'idempotency_race_unrecovered' })
  })

  it('PFCX-32 requires_reconciliation → HTTP 200', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'requires_reconciliation', paymentTransactionId: null })
    const db = slugFoundDb()
    const { res, json } = await callHandler({ body: VALID_SLUG_BODY, db, orchestrate })
    expect(res.status).toBe(200)
    expect(json).toEqual({ status: 'requires_reconciliation' })
  })

  it('PFCX-32b succeeded → HTTP 200', async () => {
    const orchestrate = succeededOrchestrate()
    const db = slugFoundDb([paymentTxChain()])
    const { res, json } = await callHandler({ body: VALID_SLUG_BODY, db, orchestrate })
    expect(res.status).toBe(200)
    expect(json.status).toBe('succeeded')
  })

  it('PFCX-33 providerRef not exposed in any response', async () => {
    const orchestrate = succeededOrchestrate()
    const db = slugFoundDb([paymentTxChain()])
    const { json } = await callHandler({ body: VALID_SLUG_BODY, db, orchestrate })
    expect(json).not.toHaveProperty('providerRef')
    expect(JSON.stringify(json)).not.toContain('pay_ref_1')
  })

  it('PFCX-34 paymentTransactionId not exposed in any response', async () => {
    const orchestrate = succeededOrchestrate()
    const db = slugFoundDb([paymentTxChain()])
    const { json } = await callHandler({ body: VALID_SLUG_BODY, db, orchestrate })
    expect(json).not.toHaveProperty('paymentTransactionId')
    expect(JSON.stringify(json)).not.toContain('tx-1')
  })

  it('PFCX-35 total re-read from payment_transactions, not from orchestration/client', async () => {
    const orchestrate = succeededOrchestrate()
    const txChain = paymentTxChain({ amount: 99.9 })
    const db = slugFoundDb([txChain])
    const { json } = await callHandler({ body: { ...VALID_SLUG_BODY, clientTotal: 1 }, db, orchestrate })
    expect(json.total).toBe(99.9)
  })

  it('PFCX-36 currency returned from payment_transactions', async () => {
    const orchestrate = succeededOrchestrate()
    const db = slugFoundDb([paymentTxChain({ currency: 'SAR' })])
    const { json } = await callHandler({ body: VALID_SLUG_BODY, db, orchestrate })
    expect(json.currency).toBe('SAR')
  })

  it('PFCX-37 returnUrl generated server-side and passed to orchestrate', async () => {
    const orchestrate = succeededOrchestrate()
    const db = slugFoundDb([paymentTxChain()])
    await callHandler({ body: VALID_SLUG_BODY, db, orchestrate })
    const [input] = orchestrate.mock.calls[0]
    expect(input.returnUrl.startsWith(`${BASE_URL}/menu/my-resto?payment_callback=`)).toBe(true)
  })

  it('PFCX-38 returnUrl ignores any client-supplied returnUrl value', async () => {
    const orchestrate = succeededOrchestrate()
    const db = slugFoundDb([paymentTxChain()])
    const body = { ...VALID_SLUG_BODY, returnUrl: 'https://evil.example/steal' }
    await callHandler({ body, db, orchestrate })
    const [input] = orchestrate.mock.calls[0]
    expect(input.returnUrl).not.toContain('evil.example')
    expect(input.returnUrl.startsWith(BASE_URL)).toBe(true)
  })

  it('PFCX-39 QR token appended to return URL for QR-scoped checkout — canonical param name "table" (TASK_3_6D_4_C_1)', async () => {
    const orchestrate = succeededOrchestrate()
    const db = qrFoundDb([paymentTxChain()])
    await callHandler({ body: VALID_QR_BODY, db, orchestrate })
    const [input] = orchestrate.mock.calls[0]
    expect(input.returnUrl).toContain(`&table=${encodeURIComponent(VALID_QR_TOKEN)}`)
  })

  it('PFCX-40 no "table" param in non-QR return URL', async () => {
    const orchestrate = succeededOrchestrate()
    const db = slugFoundDb([paymentTxChain()])
    await callHandler({ body: VALID_SLUG_BODY, db, orchestrate })
    const [input] = orchestrate.mock.calls[0]
    expect(input.returnUrl).not.toContain('&table=')
  })

  it('PFCX-40b deprecated "t" param never appears in any return URL (no compatibility alias, TASK_3_6D_4_C_1)', async () => {
    const orchestrate = succeededOrchestrate()
    const dbQr = qrFoundDb([paymentTxChain()])
    await callHandler({ body: VALID_QR_BODY, db: dbQr, orchestrate })
    const qrUrl = orchestrate.mock.calls[0][0].returnUrl
    expect(qrUrl).not.toMatch(/[?&]t=/)

    orchestrate.mockClear()
    const dbSlug = slugFoundDb([paymentTxChain()])
    await callHandler({ body: VALID_SLUG_BODY, db: dbSlug, orchestrate })
    const slugUrl = orchestrate.mock.calls[0][0].returnUrl
    expect(slugUrl).not.toMatch(/[?&]t=/)
  })

  it('PFCX-42a non-QR return URL includes branch=tenant.branch_id exactly, URL-encoded', async () => {
    const orchestrate = succeededOrchestrate()
    const db = slugFoundDb([paymentTxChain()])
    await callHandler({ body: VALID_SLUG_BODY, db, orchestrate })
    const [input] = orchestrate.mock.calls[0]
    expect(input.returnUrl).toContain(`&branch=${encodeURIComponent('branch-1')}`)
  })

  it('PFCX-42b QR return URL never includes a redundant branch param', async () => {
    const orchestrate = succeededOrchestrate()
    const db = qrFoundDb([paymentTxChain()])
    await callHandler({ body: VALID_QR_BODY, db, orchestrate })
    const [input] = orchestrate.mock.calls[0]
    expect(input.returnUrl).not.toContain('&branch=')
  })

  it('PFCX-42c return URL carries exactly the approved parameter set — no extra parameters (non-QR: payment_callback + branch)', async () => {
    const orchestrate = succeededOrchestrate()
    const db = slugFoundDb([paymentTxChain()])
    await callHandler({ body: VALID_SLUG_BODY, db, orchestrate })
    const [input] = orchestrate.mock.calls[0]
    const url = new URL(input.returnUrl)
    expect([...url.searchParams.keys()].sort()).toEqual(['branch', 'payment_callback'])
  })

  it('PFCX-42d return URL carries exactly the approved parameter set — no extra parameters (QR: payment_callback + table)', async () => {
    const orchestrate = succeededOrchestrate()
    const db = qrFoundDb([paymentTxChain()])
    await callHandler({ body: VALID_QR_BODY, db, orchestrate })
    const [input] = orchestrate.mock.calls[0]
    const url = new URL(input.returnUrl)
    expect([...url.searchParams.keys()].sort()).toEqual(['payment_callback', 'table'])
  })

  it('PFCX-42e return URL base/slug/payment_callback shape unchanged by this contract', async () => {
    const orchestrate = succeededOrchestrate()
    const db = slugFoundDb([paymentTxChain()])
    await callHandler({ body: VALID_SLUG_BODY, db, orchestrate })
    const [input] = orchestrate.mock.calls[0]
    expect(input.returnUrl.startsWith(`${BASE_URL}/menu/my-resto?payment_callback=`)).toBe(true)
  })

  it('PFCX-41 client-supplied idempotency key preserved and forwarded unchanged', async () => {
    const orchestrate = succeededOrchestrate()
    const db = slugFoundDb([paymentTxChain()])
    const body = { ...VALID_SLUG_BODY, paymentIdempotencyKey: 'pay_client_supplied_key' }
    await callHandler({ body, db, orchestrate })
    const [input] = orchestrate.mock.calls[0]
    expect(input.paymentIdempotencyKey).toBe('pay_client_supplied_key')
  })

  it('PFCX-42 no automatic key replacement across two calls with the same supplied key', async () => {
    const orchestrate1 = succeededOrchestrate()
    const orchestrate2 = succeededOrchestrate()
    const body = { ...VALID_SLUG_BODY, paymentIdempotencyKey: 'pay_stable_key' }
    await callHandler({ body, db: slugFoundDb([paymentTxChain()]), orchestrate: orchestrate1 })
    await callHandler({ body, db: slugFoundDb([paymentTxChain()]), orchestrate: orchestrate2 })
    expect(orchestrate1.mock.calls[0][0].paymentIdempotencyKey).toBe('pay_stable_key')
    expect(orchestrate2.mock.calls[0][0].paymentIdempotencyKey).toBe('pay_stable_key')
  })

  it('PFCX-43 raw exception from orchestrate → HTTP 500', async () => {
    const orchestrate = vi.fn().mockRejectedValue(new Error('Database connection string leaked: postgres://secret'))
    const db = slugFoundDb()
    const { res, json } = await callHandler({ body: VALID_SLUG_BODY, db, orchestrate })
    expect(res.status).toBe(500)
    expect(json).toEqual({ error: 'internal_error' })
  })

  it('PFCX-44 no raw exception text ever exposed in response body', async () => {
    const orchestrate = vi.fn().mockRejectedValue(new Error('Database connection string leaked: postgres://secret'))
    const db = slugFoundDb()
    const { json } = await callHandler({ body: VALID_SLUG_BODY, db, orchestrate })
    expect(JSON.stringify(json)).not.toContain('postgres://secret')
  })

  it('PFCX-45 no service_role value appears in any response body', async () => {
    const orchestrate = succeededOrchestrate()
    const db = slugFoundDb([paymentTxChain()])
    const { json } = await callHandler({ body: VALID_SLUG_BODY, db, orchestrate })
    expect(JSON.stringify(json)).not.toMatch(/service_role/i)
  })

  it('PFCX-46 handler never calls db.rpc("create_order", ...) directly', async () => {
    const orchestrate = succeededOrchestrate()
    const db = slugFoundDb([paymentTxChain()])
    db.rpc = vi.fn()
    await callHandler({ body: VALID_SLUG_BODY, db, orchestrate })
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it('PFCX-47 handler source never references paymentService.refund', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.join(process.cwd(), 'supabase/functions/payment-first-checkout/handler.js'),
      'utf8'
    )
    const importLines = src.split('\n').filter((l) => l.trim().startsWith('import'))
    expect(importLines.join('\n')).not.toMatch(/refund/i)
  })

  it('PFCX-48 does not import from payment-webhook (source-independence check)', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.join(process.cwd(), 'supabase/functions/payment-first-checkout/handler.js'),
      'utf8'
    )
    const importLines = src.split('\n').filter((l) => l.trim().startsWith('import'))
    expect(importLines.join('\n')).not.toContain('payment-webhook')
  })

  it('PFCX-49 no real Moyasar/network call — orchestrate is fully injected and the only call boundary', async () => {
    const orchestrate = succeededOrchestrate()
    const db = slugFoundDb([paymentTxChain()])
    await callHandler({ body: VALID_SLUG_BODY, db, orchestrate })
    expect(orchestrate).toHaveBeenCalledTimes(1)
  })
})

// ══════════════════════════════════════════════════════════════════
// PHASE 22 — اختبارات أمنية صريحة
// ══════════════════════════════════════════════════════════════════

describe('payment-first-checkout handler — security', () => {
  it('SEC-01 client-supplied restaurant_id is never read/trusted (QR path)', async () => {
    const orchestrate = succeededOrchestrate()
    const db = qrFoundDb([paymentTxChain()])
    const body = { ...VALID_QR_BODY, restaurant_id: 'FORGED-RESTAURANT' }
    await callHandler({ body, db, orchestrate })
    expect(orchestrate.mock.calls[0][0].restaurant_id).toBe('rest-1')
  })

  it('SEC-02 client-supplied restaurant_id is never read/trusted (non-QR path)', async () => {
    const orchestrate = succeededOrchestrate()
    const db = slugFoundDb([paymentTxChain()])
    const body = { ...VALID_SLUG_BODY, restaurant_id: 'FORGED-RESTAURANT' }
    await callHandler({ body, db, orchestrate })
    expect(orchestrate.mock.calls[0][0].restaurant_id).toBe('rest-1')
  })

  it('SEC-03 client-supplied table_id is never read/trusted', async () => {
    const orchestrate = succeededOrchestrate()
    const db = qrFoundDb([paymentTxChain()])
    const body = { ...VALID_QR_BODY, table_id: 'FORGED-TABLE' }
    await callHandler({ body, db, orchestrate })
    const input = orchestrate.mock.calls[0][0]
    expect(input.table_id).toBeUndefined()
  })

  it('SEC-04 client-supplied currency is never forwarded to orchestrate', async () => {
    const orchestrate = succeededOrchestrate()
    const db = slugFoundDb([paymentTxChain()])
    const body = { ...VALID_SLUG_BODY, currency: 'USD' }
    await callHandler({ body, db, orchestrate })
    expect(orchestrate.mock.calls[0][0].currency).toBeUndefined()
  })

  it('SEC-05 client-supplied returnUrl never forwarded verbatim', async () => {
    const orchestrate = succeededOrchestrate()
    const db = slugFoundDb([paymentTxChain()])
    const body = { ...VALID_SLUG_BODY, returnUrl: 'https://evil.example/steal' }
    await callHandler({ body, db, orchestrate })
    expect(orchestrate.mock.calls[0][0].returnUrl).not.toBe('https://evil.example/steal')
  })

  it('SEC-06 client-supplied providerRef is never read/forwarded', async () => {
    const orchestrate = succeededOrchestrate()
    const db = slugFoundDb([paymentTxChain()])
    const body = { ...VALID_SLUG_BODY, providerRef: 'FORGED-REF' }
    await callHandler({ body, db, orchestrate })
    expect(orchestrate.mock.calls[0][0].providerRef).toBeUndefined()
  })

  it('SEC-07 QR path ignores/rejects client-supplied branch_id (always server-resolved)', async () => {
    const orchestrate = succeededOrchestrate()
    const db = qrFoundDb([paymentTxChain()])
    const body = { ...VALID_QR_BODY, branch_id: 'FORGED-BRANCH' }
    await callHandler({ body, db, orchestrate })
    expect(orchestrate.mock.calls[0][0].branch_id).toBe('branch-1')
  })

  it('SEC-08 cross-tenant QR resolution: branch.restaurant_id mismatch → rejected, not forwarded', async () => {
    const db = makeDb(qrTableChain(), restaurantChain(), branchChain({ restaurant_id: 'ANOTHER-RESTAURANT' }))
    const orchestrate = vi.fn()
    const { res, json } = await callHandler({ body: VALID_QR_BODY, db, orchestrate })
    expect(res.status).toBe(200)
    expect(json).toEqual({ status: 'rejected', reason: 'tenant_not_found' })
    expect(orchestrate).not.toHaveBeenCalled()
  })

  it('SEC-09 inactive restaurant never reaches orchestrate', async () => {
    const db = makeDb(qrTableChain(), restaurantChain({ is_active: false }))
    const orchestrate = vi.fn()
    await callHandler({ body: VALID_QR_BODY, db, orchestrate })
    expect(orchestrate).not.toHaveBeenCalled()
  })

  it('SEC-10 suspended restaurant never reaches orchestrate', async () => {
    const db = makeDb(qrTableChain(), restaurantChain({ platform_suspended: true }))
    const orchestrate = vi.fn()
    await callHandler({ body: VALID_QR_BODY, db, orchestrate })
    expect(orchestrate).not.toHaveBeenCalled()
  })
})
