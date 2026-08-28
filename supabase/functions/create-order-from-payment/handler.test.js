// @vitest-environment happy-dom
//
// اختبارات Edge Function لـ create-order-from-payment (TASK-PAY-3.6D.6).
// المنطق مُختبَر عبر handler.js (الدوال المُحقونة) — لا استيراد من index.ts (خاص بـDeno).
// لا Deno حقيقي، لا Supabase حقيقي — createOrder/db مُموَّهان بالكامل (نفس نمط
// payment-first-checkout/handler.test.js حرفياً).

import { describe, it, expect, vi } from 'vitest'
import { buildHandler } from './handler.js'

const VALID_QR_TOKEN = '11111111-1111-1111-1111-111111111111'

// ——————————— مساعدات Mock (نفس نمط payment-first-checkout/handler.test.js) ———————————

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

function paymentTxChain(overrides = {}) {
  return makeChain({ data: { id: 'tx-1', restaurant_id: 'rest-1', status: 'succeeded', ...overrides }, error: null })
}
function notFoundChain() {
  return makeChain({ data: null, error: null })
}
function qrTableChain(overrides = {}) {
  return makeChain({
    data: { id: 'table-1', table_number: '5', restaurant_id: 'rest-1', branch_id: 'branch-1', ...overrides },
    error: null,
  })
}
function restaurantChain(overrides = {}) {
  return makeChain({ data: { id: 'rest-1', is_active: true, platform_suspended: false, ...overrides }, error: null })
}

/** ترتيب from() الحقيقي في handler.js: payment_transactions ثم (restaurant_tables, restaurants) لـQR أو (restaurants) لـslug. */
function slugFoundDb(paymentTxOverrides = {}, restaurantOverrides = {}) {
  return makeDb(paymentTxChain(paymentTxOverrides), restaurantChain(restaurantOverrides))
}
function qrFoundDb(paymentTxOverrides = {}, tableOverrides = {}, restaurantOverrides = {}) {
  return makeDb(paymentTxChain(paymentTxOverrides), qrTableChain(tableOverrides), restaurantChain(restaurantOverrides))
}

function makeRequest(body, opts = {}) {
  const method = opts.method ?? 'POST'
  const hasBody = method !== 'OPTIONS' && method !== 'GET' && method !== 'HEAD'
  return new Request('https://example.com/create-order-from-payment', {
    method,
    headers: { 'content-type': 'application/json' },
    body: hasBody ? (opts.rawBody ?? JSON.stringify(body)) : undefined,
  })
}

const VALID_QR_BODY = Object.freeze({
  table_qr_token: VALID_QR_TOKEN,
  paymentIdempotencyKey: 'pay_abc123',
  customerPhone: '512345678',
})

const VALID_SLUG_BODY = Object.freeze({
  restaurant_slug: 'my-resto',
  paymentIdempotencyKey: 'pay_abc123',
  customerPhone: '512345678',
})

async function callHandler({ body, db, createOrder, method, rawBody }) {
  const handle = buildHandler({ db, createOrder })
  const req = makeRequest(body, { method, rawBody })
  const res = await handle(req)
  const json = await res.json().catch(() => null)
  return { res, json }
}

const succeededCreateOrder = (overrides = {}) =>
  vi.fn().mockResolvedValue({
    status: 'succeeded',
    orderId: 'order-1',
    orderNumber: 'ORD-0001',
    accessToken: 'access-tok-1',
    paymentTransactionId: 'tx-1',
    idempotent: false,
    ...overrides,
  })

// ══════════════════════════════════════════════════════════════════
// السلوك الأساسي (طلب/استجابة، أخطاء تحقّق، طرق HTTP)
// ══════════════════════════════════════════════════════════════════

describe('create-order-from-payment handler — basics', () => {
  it('COFP-B01 OPTIONS → 200', async () => {
    const { res } = await callHandler({ body: null, db: makeDb(), createOrder: vi.fn(), method: 'OPTIONS' })
    expect(res.status).toBe(200)
  })

  it('COFP-B02 wrong method → 405', async () => {
    const { res, json } = await callHandler({ body: null, db: makeDb(), createOrder: vi.fn(), method: 'GET' })
    expect(res.status).toBe(405)
    expect(json.error).toBe('method_not_allowed')
  })

  it('COFP-B03 malformed JSON → 400 validation_error', async () => {
    const { res, json } = await callHandler({ db: makeDb(), createOrder: vi.fn(), rawBody: '{not json' })
    expect(res.status).toBe(400)
    expect(json.status).toBe('validation_error')
  })

  it('COFP-B04 >32KB body → 400 validation_error', async () => {
    const rawBody = JSON.stringify({ ...VALID_SLUG_BODY, notes: 'x'.repeat(40 * 1024) })
    const { res, json } = await callHandler({ db: makeDb(), createOrder: vi.fn(), rawBody })
    expect(res.status).toBe(400)
    expect(json.status).toBe('validation_error')
  })

  it('COFP-B05 both restaurant_slug and table_qr_token present → 400', async () => {
    const body = { ...VALID_SLUG_BODY, table_qr_token: VALID_QR_TOKEN }
    const { res, json } = await callHandler({ body, db: makeDb(), createOrder: vi.fn() })
    expect(res.status).toBe(400)
    expect(json.status).toBe('validation_error')
  })

  it('COFP-B06 neither restaurant_slug nor table_qr_token present → 400', async () => {
    const body = { paymentIdempotencyKey: 'pay_abc123', customerPhone: '512345678' }
    const { res, json } = await callHandler({ body, db: makeDb(), createOrder: vi.fn() })
    expect(res.status).toBe(400)
    expect(json.status).toBe('validation_error')
  })

  it('COFP-B07 invalid table_qr_token shape → 400', async () => {
    const body = { ...VALID_QR_BODY, table_qr_token: 'not-a-uuid' }
    const { res, json } = await callHandler({ body, db: makeDb(), createOrder: vi.fn() })
    expect(res.status).toBe(400)
    expect(json.status).toBe('validation_error')
  })

  it('COFP-B08 missing paymentIdempotencyKey → 400', async () => {
    const body = { ...VALID_SLUG_BODY, paymentIdempotencyKey: undefined }
    const { res, json } = await callHandler({ body, db: makeDb(), createOrder: vi.fn() })
    expect(res.status).toBe(400)
    expect(json.status).toBe('validation_error')
  })

  it('COFP-B09 overlong notes → 400 (rejected, not truncated)', async () => {
    const body = { ...VALID_SLUG_BODY, notes: 'a'.repeat(501) }
    const { res, json } = await callHandler({ body, db: makeDb(), createOrder: vi.fn() })
    expect(res.status).toBe(400)
    expect(json.status).toBe('validation_error')
  })

  it('COFP-B10 overlong deliveryAddress → 400', async () => {
    const body = { ...VALID_SLUG_BODY, deliveryAddress: 'a'.repeat(501) }
    const { res, json } = await callHandler({ body, db: makeDb(), createOrder: vi.fn() })
    expect(res.status).toBe(400)
    expect(json.status).toBe('validation_error')
  })
})

// ══════════════════════════════════════════════════════════════════
// 28 السيناريوهات المطلوبة صراحةً من موافقة المالك (TASK 3.6D.6)
// ══════════════════════════════════════════════════════════════════

describe('create-order-from-payment handler — owner-required scenarios', () => {
  it('1. valid successful payment (slug path) → 200 succeeded', async () => {
    const createOrder = succeededCreateOrder()
    const db = slugFoundDb()
    const { res, json } = await callHandler({ body: VALID_SLUG_BODY, db, createOrder })
    expect(res.status).toBe(200)
    expect(json.status).toBe('succeeded')
    expect(json.orderId).toBe('order-1')
  })

  it('2. paymentIdempotencyKey resolves paymentTransactionId server-side', async () => {
    const createOrder = succeededCreateOrder()
    const db = slugFoundDb()
    await callHandler({ body: VALID_SLUG_BODY, db, createOrder })
    // db.from('payment_transactions') هو أول استدعاء — والمُفتاح المُمرَّر لـeq هو نفس paymentIdempotencyKey
    const firstChain = db.from.mock.results[0].value
    expect(db.from).toHaveBeenCalledWith('payment_transactions')
    expect(firstChain.eq).toHaveBeenCalledWith('idempotency_key', 'pay_abc123')
    expect(createOrder.mock.calls[0][0].paymentTransactionId).toBe('tx-1')
  })

  it('3. client-supplied paymentTransactionId cannot override server-resolved value', async () => {
    const createOrder = succeededCreateOrder()
    const db = slugFoundDb()
    const body = { ...VALID_SLUG_BODY, paymentTransactionId: 'FORGED-TX-ID' }
    await callHandler({ body, db, createOrder })
    expect(createOrder.mock.calls[0][0].paymentTransactionId).toBe('tx-1')
  })

  it('4. payment pending → 200 status=pending, createOrder never called', async () => {
    const createOrder = vi.fn()
    const db = slugFoundDb({ status: 'pending' })
    const { res, json } = await callHandler({ body: VALID_SLUG_BODY, db, createOrder })
    expect(res.status).toBe(200)
    expect(json).toEqual({ status: 'pending' })
    expect(createOrder).not.toHaveBeenCalled()
  })

  it('5. payment failed → 200 status=pending (generalized), createOrder never called', async () => {
    const createOrder = vi.fn()
    const db = slugFoundDb({ status: 'failed' })
    const { res, json } = await callHandler({ body: VALID_SLUG_BODY, db, createOrder })
    expect(res.status).toBe(200)
    expect(json).toEqual({ status: 'pending' })
    expect(createOrder).not.toHaveBeenCalled()
  })

  it('6. unknown payment key → 200 status=not_found, createOrder never called', async () => {
    const createOrder = vi.fn()
    const db = makeDb(notFoundChain())
    const { res, json } = await callHandler({ body: VALID_SLUG_BODY, db, createOrder })
    expect(res.status).toBe(200)
    expect(json).toEqual({ status: 'not_found' })
    expect(createOrder).not.toHaveBeenCalled()
  })

  it('7. tenant mismatch (resolved restaurant differs from payment restaurant_id) → not_found, createOrder never called', async () => {
    const createOrder = vi.fn()
    const db = slugFoundDb({ restaurant_id: 'rest-OTHER' }, { id: 'rest-1' })
    const { res, json } = await callHandler({ body: VALID_SLUG_BODY, db, createOrder })
    expect(res.status).toBe(200)
    expect(json).toEqual({ status: 'not_found' })
    expect(createOrder).not.toHaveBeenCalled()
  })

  it('8. malformed request (invalid phone shape) → 400 validation_error', async () => {
    const body = { ...VALID_SLUG_BODY, customerPhone: '12345' }
    const { res, json } = await callHandler({ body, db: makeDb(), createOrder: vi.fn() })
    expect(res.status).toBe(400)
    expect(json.status).toBe('validation_error')
  })

  it('9. missing customer data (no customerPhone at all) → 400 validation_error', async () => {
    const body = { ...VALID_SLUG_BODY, customerPhone: undefined }
    const { res, json } = await callHandler({ body, db: makeDb(), createOrder: vi.fn() })
    expect(res.status).toBe(400)
    expect(json.status).toBe('validation_error')
  })

  it('10. invalid customer data (non-string customerName) → 400 validation_error', async () => {
    const body = { ...VALID_SLUG_BODY, customerName: 12345 }
    const { res, json } = await callHandler({ body, db: makeDb(), createOrder: vi.fn() })
    expect(res.status).toBe(400)
    expect(json.status).toBe('validation_error')
  })

  it('11. delivery data (deliveryAddress) forwarded to createOrder', async () => {
    const createOrder = succeededCreateOrder()
    const db = slugFoundDb()
    const body = { ...VALID_SLUG_BODY, deliveryAddress: 'حي النخيل، شارع 5' }
    await callHandler({ body, db, createOrder })
    expect(createOrder.mock.calls[0][0].deliveryAddress).toBe('حي النخيل، شارع 5')
  })

  it('12. non-QR table data (tableNumber) forwarded to createOrder as client-declared', async () => {
    const createOrder = succeededCreateOrder()
    const db = slugFoundDb()
    const body = { ...VALID_SLUG_BODY, tableNumber: '12' }
    await callHandler({ body, db, createOrder })
    expect(createOrder.mock.calls[0][0].tableNumber).toBe('12')
  })

  it('13. QR table resolution — createOrder receives server-resolved table_number', async () => {
    const createOrder = succeededCreateOrder()
    const db = qrFoundDb()
    await callHandler({ body: VALID_QR_BODY, db, createOrder })
    expect(createOrder.mock.calls[0][0].tableNumber).toBe('5')
  })

  it('14. QR path ignores client-supplied tableNumber entirely (no persisted-value override)', async () => {
    const createOrder = succeededCreateOrder()
    const db = qrFoundDb()
    const body = { ...VALID_QR_BODY, tableNumber: 'FORGED-99' }
    await callHandler({ body, db, createOrder })
    expect(createOrder.mock.calls[0][0].tableNumber).toBe('5')
  })

  it('15. first order creation → idempotent:false surfaced in response', async () => {
    const createOrder = succeededCreateOrder({ idempotent: false })
    const db = slugFoundDb()
    const { json } = await callHandler({ body: VALID_SLUG_BODY, db, createOrder })
    expect(json.idempotent).toBe(false)
  })

  it('16. repeated same payment → idempotent:true surfaced in response', async () => {
    const createOrder = succeededCreateOrder({ idempotent: true })
    const db = slugFoundDb()
    const { json } = await callHandler({ body: VALID_SLUG_BODY, db, createOrder })
    expect(json.idempotent).toBe(true)
    expect(json.status).toBe('succeeded')
  })

  it('17. concurrent duplicate calls — race-recovered result (idempotent:true) still maps to the same succeeded shape', async () => {
    const winner = succeededCreateOrder({ idempotent: false })
    const loser = succeededCreateOrder({ idempotent: true })
    const { json: j1 } = await callHandler({ body: VALID_SLUG_BODY, db: slugFoundDb(), createOrder: winner })
    const { json: j2 } = await callHandler({ body: VALID_SLUG_BODY, db: slugFoundDb(), createOrder: loser })
    expect(j1.status).toBe('succeeded')
    expect(j2.status).toBe('succeeded')
    expect(j1.orderId).toBe(j2.orderId)
  })

  it('18. raw Postgres error from createOrder never exposed → 500 internal_error only', async () => {
    const createOrder = vi.fn().mockRejectedValue(new Error('duplicate key value violates unique constraint "orders_payment_transaction_id_uidx"'))
    const db = slugFoundDb()
    const { res, json } = await callHandler({ body: VALID_SLUG_BODY, db, createOrder })
    expect(res.status).toBe(500)
    expect(json).toEqual({ error: 'internal_error' })
    expect(JSON.stringify(json)).not.toContain('orders_payment_transaction_id_uidx')
  })

  it('19. providerRef never exposed even if present on the underlying result', async () => {
    const createOrder = succeededCreateOrder({ providerRef: 'pay_ref_should_not_leak' })
    const db = slugFoundDb()
    const { json } = await callHandler({ body: VALID_SLUG_BODY, db, createOrder })
    expect(json).not.toHaveProperty('providerRef')
    expect(JSON.stringify(json)).not.toContain('pay_ref_should_not_leak')
  })

  it('20. paymentTransactionId never exposed in the response', async () => {
    const createOrder = succeededCreateOrder()
    const db = slugFoundDb()
    const { json } = await callHandler({ body: VALID_SLUG_BODY, db, createOrder })
    expect(json).not.toHaveProperty('paymentTransactionId')
    expect(JSON.stringify(json)).not.toContain('tx-1')
  })

  it('21. client-supplied amount never forwarded to createOrder', async () => {
    const createOrder = succeededCreateOrder()
    const db = slugFoundDb()
    const body = { ...VALID_SLUG_BODY, amount: 1 }
    await callHandler({ body, db, createOrder })
    expect(createOrder.mock.calls[0][0]).not.toHaveProperty('amount')
  })

  it('22. client-supplied currency never forwarded to createOrder', async () => {
    const createOrder = succeededCreateOrder()
    const db = slugFoundDb()
    const body = { ...VALID_SLUG_BODY, currency: 'USD' }
    await callHandler({ body, db, createOrder })
    expect(createOrder.mock.calls[0][0]).not.toHaveProperty('currency')
  })

  it('23. client-supplied items never forwarded to createOrder', async () => {
    const createOrder = succeededCreateOrder()
    const db = slugFoundDb()
    const body = { ...VALID_SLUG_BODY, items: [{ product_id: 'p1', quantity: 999 }] }
    await callHandler({ body, db, createOrder })
    expect(createOrder.mock.calls[0][0]).not.toHaveProperty('items')
  })

  it('24. client-supplied branch_id never forwarded to createOrder', async () => {
    const createOrder = succeededCreateOrder()
    const db = slugFoundDb()
    const body = { ...VALID_SLUG_BODY, branch_id: 'FORGED-BRANCH' }
    await callHandler({ body, db, createOrder })
    expect(createOrder.mock.calls[0][0]).not.toHaveProperty('branch_id')
  })

  it('25. client-supplied restaurant_id never overrides server-resolved expectedRestaurantId', async () => {
    const createOrder = succeededCreateOrder()
    const db = slugFoundDb()
    const body = { ...VALID_SLUG_BODY, restaurant_id: 'FORGED-RESTAURANT' }
    await callHandler({ body, db, createOrder })
    expect(createOrder.mock.calls[0][0].expectedRestaurantId).toBe('rest-1')
  })

  it('26. createOrderFromSuccessfulPayment called exactly once on success', async () => {
    const createOrder = succeededCreateOrder()
    const db = slugFoundDb()
    await callHandler({ body: VALID_SLUG_BODY, db, createOrder })
    expect(createOrder).toHaveBeenCalledTimes(1)
  })

  it('27/28. handler never touches payment-webhook or the payment-status RPC source (independence check)', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.join(process.cwd(), 'supabase/functions/create-order-from-payment/handler.js'), 'utf8')
    const importLines = src.split('\n').filter((l) => l.trim().startsWith('import'))
    expect(importLines.join('\n')).not.toContain('payment-webhook')
    expect(importLines.join('\n')).not.toMatch(/payment_status_reads|get_payment_status_by_idempotency_key/)
  })
})

// ══════════════════════════════════════════════════════════════════
// حالات المستأجر الإضافية (تعزيز — نفس فحوصات payment-first-checkout للمستأجر)
// ══════════════════════════════════════════════════════════════════

describe('create-order-from-payment handler — tenant resolution edge cases', () => {
  it('COFP-T01 QR token not found → not_found, createOrder never called', async () => {
    const createOrder = vi.fn()
    const db = makeDb(paymentTxChain(), notFoundChain())
    const { res, json } = await callHandler({ body: VALID_QR_BODY, db, createOrder })
    expect(res.status).toBe(200)
    expect(json).toEqual({ status: 'not_found' })
    expect(createOrder).not.toHaveBeenCalled()
  })

  it('COFP-T02 QR restaurant inactive → not_found, createOrder never called', async () => {
    const createOrder = vi.fn()
    const db = qrFoundDb({}, {}, { is_active: false })
    const { json } = await callHandler({ body: VALID_QR_BODY, db, createOrder })
    expect(json).toEqual({ status: 'not_found' })
    expect(createOrder).not.toHaveBeenCalled()
  })

  it('COFP-T03 QR restaurant platform_suspended → not_found, createOrder never called', async () => {
    const createOrder = vi.fn()
    const db = qrFoundDb({}, {}, { platform_suspended: true })
    const { json } = await callHandler({ body: VALID_QR_BODY, db, createOrder })
    expect(json).toEqual({ status: 'not_found' })
    expect(createOrder).not.toHaveBeenCalled()
  })

  it('COFP-T04 non-QR restaurant not found → not_found, createOrder never called', async () => {
    const createOrder = vi.fn()
    const db = makeDb(paymentTxChain(), notFoundChain())
    const { json } = await callHandler({ body: VALID_SLUG_BODY, db, createOrder })
    expect(json).toEqual({ status: 'not_found' })
    expect(createOrder).not.toHaveBeenCalled()
  })

  it('COFP-T05 non-QR restaurant suspended → not_found, createOrder never called', async () => {
    const createOrder = vi.fn()
    const db = slugFoundDb({}, { platform_suspended: true })
    const { json } = await callHandler({ body: VALID_SLUG_BODY, db, createOrder })
    expect(json).toEqual({ status: 'not_found' })
    expect(createOrder).not.toHaveBeenCalled()
  })
})

// ══════════════════════════════════════════════════════════════════
// عقد الاستجابة الكامل (بقية الحالات المعتمدة)
// ══════════════════════════════════════════════════════════════════

describe('create-order-from-payment handler — full response contract', () => {
  it('COFP-R01 retryable_error (order_race_unrecovered) → 200 status=retryable_error, no reason leaked', async () => {
    const createOrder = vi.fn().mockResolvedValue({ status: 'retryable_error', reason: 'order_race_unrecovered', paymentTransactionId: 'tx-1' })
    const db = slugFoundDb()
    const { res, json } = await callHandler({ body: VALID_SLUG_BODY, db, createOrder })
    expect(res.status).toBe(200)
    expect(json).toEqual({ status: 'retryable_error' })
  })

  it('COFP-R02 price_drift_requires_reconciliation → 200 status=requires_reconciliation, no dryRun/paymentTransactionId leaked', async () => {
    const createOrder = vi.fn().mockResolvedValue({
      status: 'price_drift_requires_reconciliation',
      paymentTransactionId: 'tx-1',
      dryRun: { subtotal: 10, tax: 1.5, delivery_fee: 0, total: 11.5 },
    })
    const db = slugFoundDb()
    const { res, json } = await callHandler({ body: VALID_SLUG_BODY, db, createOrder })
    expect(res.status).toBe(200)
    expect(json).toEqual({ status: 'requires_reconciliation' })
  })

  it('COFP-R03 rejected/snapshot_fingerprint_mismatch → 500 internal_error, reason never exposed', async () => {
    const createOrder = vi.fn().mockResolvedValue({ status: 'rejected', reason: 'snapshot_fingerprint_mismatch', paymentTransactionId: 'tx-1' })
    const db = slugFoundDb()
    const { res, json } = await callHandler({ body: VALID_SLUG_BODY, db, createOrder })
    expect(res.status).toBe(500)
    expect(json).toEqual({ error: 'internal_error' })
  })

  it('COFP-R04 rejected/amount_integrity_violation → 500 internal_error, reason never exposed', async () => {
    const createOrder = vi.fn().mockResolvedValue({ status: 'rejected', reason: 'amount_integrity_violation', paymentTransactionId: 'tx-1' })
    const db = slugFoundDb()
    const { res, json } = await callHandler({ body: VALID_SLUG_BODY, db, createOrder })
    expect(res.status).toBe(500)
    expect(json).toEqual({ error: 'internal_error' })
  })

  it('COFP-R05 rejected/create_order_failed → 500 internal_error, raw message never exposed', async () => {
    const createOrder = vi.fn().mockResolvedValue({ status: 'rejected', reason: 'create_order_failed', message: 'internal pg detail leak', paymentTransactionId: 'tx-1' })
    const db = slugFoundDb()
    const { json } = await callHandler({ body: VALID_SLUG_BODY, db, createOrder })
    expect(json).toEqual({ error: 'internal_error' })
    expect(JSON.stringify(json)).not.toContain('internal pg detail leak')
  })

  it('COFP-R06 unexpected/unknown status from createOrder → 500 internal_error (no invented category)', async () => {
    const createOrder = vi.fn().mockResolvedValue({ status: 'something_new_and_unmapped' })
    const db = slugFoundDb()
    const { res, json } = await callHandler({ body: VALID_SLUG_BODY, db, createOrder })
    expect(res.status).toBe(500)
    expect(json).toEqual({ error: 'internal_error' })
  })

  it('COFP-R07 no service_role value ever appears in any response body', async () => {
    const createOrder = succeededCreateOrder()
    const db = slugFoundDb()
    const { json } = await callHandler({ body: VALID_SLUG_BODY, db, createOrder })
    expect(JSON.stringify(json)).not.toMatch(/service_role/i)
  })

  it('COFP-R08 handler never calls db.rpc directly (all order-creation logic delegated to createOrder)', async () => {
    const createOrder = succeededCreateOrder()
    const db = slugFoundDb()
    db.rpc = vi.fn()
    await callHandler({ body: VALID_SLUG_BODY, db, createOrder })
    expect(db.rpc).not.toHaveBeenCalled()
  })
})
