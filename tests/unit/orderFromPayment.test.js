// TASK-PAY-3.6B — اختبارات createOrderFromSuccessfulPayment (src/payments/services/checkoutOrchestration.js)
// كل الاختبارات هنا بـdb وهمية بالكامل — بلا اتصال حقيقي بقاعدة البيانات، بلا Moyasar، بلا webhook.
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createOrderFromSuccessfulPayment } from '../../src/payments/services/checkoutOrchestration.js'
import { computeCheckoutFingerprint } from '../../src/payments/checkoutBinding.js'
import { TransactionStatus } from '../../src/payments/types/index.js'

const RID = '11111111-1111-4111-8111-111111111111'
const RID_OTHER = '99999999-9999-4999-8999-999999999999'
const BID = '22222222-2222-4222-8222-222222222222'
const PID = '33333333-3333-4333-8333-333333333333'
const TX_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function makeChain(result = { data: null, error: null }) {
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
}
function makeRpcChain(result = { data: null, error: null }) {
  return { single: vi.fn().mockResolvedValue(result), then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) }
}
/** fromChains تُستهلَك بالترتيب لكل from() (اتفاقية هذه الدالة: 1) payment_transactions SELECT
 * 2) orders SELECT (تحقّق مسبق) ثم لاحقاً استدعاءات from() إضافية إن وُجدت (استرداد سباق). */
function makeDb({ rpcResults = [], fromChains = [] } = {}) {
  let ri = 0, fi = 0
  return {
    rpc: vi.fn().mockImplementation(() => makeRpcChain(rpcResults[ri++] ?? { data: null, error: null })),
    from: vi.fn().mockImplementation(() => fromChains[fi++] ?? makeChain()),
  }
}

let validSnapshot

beforeEach(async () => {
  vi.clearAllMocks()
  const fingerprint = await computeCheckoutFingerprint({
    restaurant_id: RID, branch_id: BID, type: 'dine_in',
    items: [{ product_id: PID, quantity: 2, options: [] }], coupon_code: null,
  })
  validSnapshot = {
    restaurant_id: RID, branch_id: BID, type: 'dine_in',
    items: [{ product_id: PID, quantity: 2, options: [] }],
    coupon_code: null,
    subtotal: 17.39, tax: 2.61, delivery_fee: 0, total: 20.0, currency: 'SAR',
    fingerprint, quoted_at: '2026-08-26T12:00:00.000Z',
  }
})

function succeededTx(overrides = {}) {
  return {
    id: TX_ID, restaurant_id: RID, amount: 20.0, currency: 'SAR',
    status: TransactionStatus.SUCCEEDED, metadata: { checkout: validSnapshot },
    ...overrides,
  }
}

function validInput(overrides = {}) {
  return { paymentTransactionId: TX_ID, customerPhone: '512345678', tableNumber: 'T1', ...overrides }
}

function validOrderRow(overrides = {}) {
  return {
    id: 'order-uuid-1', order_number: 'SIM-1001', access_token: 'tok_abc123',
    subtotal: 17.39, tax: 2.61, delivery_fee: 0, total: 20.0, price_changed: false, price_changes: [],
    ...overrides,
  }
}

// ══════════════════════════════════════════════════════════════════
// OFP-01/02: نجاح → Order مُنشأ، بمعرّف معاملة دفع صحيح
// ══════════════════════════════════════════════════════════════════

describe('OFP-01: دفع ناجح → Order يُنشأ', () => {
  it('يستدعي create_order بـp_dry_run=false مرة واحدة، ويعيد status=succeeded', async () => {
    const db = makeDb({
      fromChains: [makeChain({ data: succeededTx(), error: null }), makeChain({ data: null, error: null })],
      rpcResults: [{ data: validOrderRow(), error: null }],
    })
    const result = await createOrderFromSuccessfulPayment(validInput(), { db })
    expect(result.status).toBe('succeeded')
    expect(result.orderId).toBe('order-uuid-1')
    expect(db.rpc).toHaveBeenCalledTimes(1)
    expect(db.rpc.mock.calls[0][1].p_dry_run).toBe(false)
  })
})

describe('OFP-02: الطلب المُنشأ يحمل payment_transaction_id الصحيح', () => {
  it('يُمرَّر p_payment_transaction_id = معرّف المعاملة نفسها، ويظهر في الاستجابة', async () => {
    const db = makeDb({
      fromChains: [makeChain({ data: succeededTx(), error: null }), makeChain({ data: null, error: null })],
      rpcResults: [{ data: validOrderRow(), error: null }],
    })
    const result = await createOrderFromSuccessfulPayment(validInput(), { db })
    expect(db.rpc.mock.calls[0][1].p_payment_transaction_id).toBe(TX_ID)
    expect(result.paymentTransactionId).toBe(TX_ID)
  })
})

// ══════════════════════════════════════════════════════════════════
// OFP-03/04: سلامة المبلغ والبصمة
// ══════════════════════════════════════════════════════════════════

describe('OFP-03: عدم تطابق المبلغ → Order لا يُنشأ', () => {
  it('payment_transactions.amount ≠ snapshot.total → رفض قبل أي استدعاء create_order', async () => {
    const db = makeDb({
      fromChains: [makeChain({ data: succeededTx({ amount: 999.99 }), error: null }), makeChain({ data: null, error: null })],
    })
    const result = await createOrderFromSuccessfulPayment(validInput(), { db })
    expect(result.status).toBe('rejected')
    expect(result.reason).toBe('amount_integrity_violation')
    expect(db.rpc).not.toHaveBeenCalled()
  })
})

describe('OFP-04: بصمة اللقطة غير صالحة → Order لا يُنشأ', () => {
  it('لقطة مُعدَّلة (منتج مختلف عن ما يُطابق البصمة المخزَّنة) → رفض', async () => {
    const tampered = { ...succeededTx() }
    tampered.metadata = { checkout: { ...validSnapshot, items: [{ product_id: RID_OTHER, quantity: 1, options: [] }] } }
    const db = makeDb({
      fromChains: [makeChain({ data: tampered, error: null }), makeChain({ data: null, error: null })],
    })
    const result = await createOrderFromSuccessfulPayment(validInput(), { db })
    expect(result.status).toBe('rejected')
    expect(result.reason).toBe('snapshot_fingerprint_mismatch')
    expect(db.rpc).not.toHaveBeenCalled()
  })
})

// ══════════════════════════════════════════════════════════════════
// OFP-05: الدفع غير ناجح
// ══════════════════════════════════════════════════════════════════

describe('OFP-05: الدفع غير ناجح (pending/failed) → Order لا يُنشأ', () => {
  it('status=pending → رفض', async () => {
    const db = makeDb({ fromChains: [makeChain({ data: succeededTx({ status: TransactionStatus.PENDING }), error: null })] })
    const result = await createOrderFromSuccessfulPayment(validInput(), { db })
    expect(result.status).toBe('rejected')
    expect(result.reason).toBe('payment_not_successful')
    expect(db.rpc).not.toHaveBeenCalled()
  })
  it('status=failed → رفض', async () => {
    const db = makeDb({ fromChains: [makeChain({ data: succeededTx({ status: TransactionStatus.FAILED }), error: null })] })
    const result = await createOrderFromSuccessfulPayment(validInput(), { db })
    expect(result.status).toBe('rejected')
    expect(result.reason).toBe('payment_not_successful')
    expect(db.rpc).not.toHaveBeenCalled()
  })
})

// ══════════════════════════════════════════════════════════════════
// OFP-06/07: معاملة غير موجودة / تناقض مطعم
// ══════════════════════════════════════════════════════════════════

describe('OFP-06: معاملة الدفع غير موجودة → رفض', () => {
  it('لا صف مطابق → status=rejected، reason=payment_transaction_not_found', async () => {
    const db = makeDb({ fromChains: [makeChain({ data: null, error: null })] })
    const result = await createOrderFromSuccessfulPayment(validInput(), { db })
    expect(result.status).toBe('rejected')
    expect(result.reason).toBe('payment_transaction_not_found')
    expect(db.rpc).not.toHaveBeenCalled()
  })
})

describe('OFP-07: عدم تطابق المستأجر → رفض', () => {
  it('expectedRestaurantId المُرسَل لا يطابق عمود ملكية المعاملة الفعلي', async () => {
    const db = makeDb({ fromChains: [makeChain({ data: succeededTx(), error: null })] })
    const result = await createOrderFromSuccessfulPayment(validInput({ expectedRestaurantId: RID_OTHER }), { db })
    expect(result.status).toBe('rejected')
    expect(result.reason).toBe('tenant_mismatch')
    expect(db.rpc).not.toHaveBeenCalled()
  })
})

// ══════════════════════════════════════════════════════════════════
// OFP-08/09: إعادة تشغيل / سباق تزامن
// ══════════════════════════════════════════════════════════════════

describe('OFP-08: طلب موجود فعلاً لنفس معاملة الدفع → يُعاد نفسه، لا تكرار', () => {
  it('idempotent:true، لا استدعاء create_order إطلاقاً', async () => {
    const existing = { id: 'order-existing-1', order_number: 'SIM-999', order_access_token: 'tok_existing' }
    const db = makeDb({ fromChains: [makeChain({ data: succeededTx(), error: null }), makeChain({ data: existing, error: null })] })
    const result = await createOrderFromSuccessfulPayment(validInput(), { db })
    expect(result.status).toBe('succeeded')
    expect(result.idempotent).toBe(true)
    expect(result.orderId).toBe('order-existing-1')
    expect(db.rpc).not.toHaveBeenCalled()
  })
})

describe('OFP-09: سباق تزامن حقيقي (تجاوز التحقّق المسبق) → Order واحد فقط', () => {
  it('create_order يرمي خطأ قيد orders_payment_transaction_id_uidx → استرداد آمن، لا Order مكرَّر', async () => {
    const winner = { id: 'order-race-winner', order_number: 'SIM-1002', order_access_token: 'tok_race' }
    const db = makeDb({
      fromChains: [
        makeChain({ data: succeededTx(), error: null }), // قراءة معاملة الدفع
        makeChain({ data: null, error: null }), // التحقّق المسبق: لا طلب بعد (سباق حقيقي)
        makeChain({ data: winner, error: null }), // استرداد بعد فشل create_order
      ],
      rpcResults: [{ data: null, error: { message: 'duplicate key value violates unique constraint "orders_payment_transaction_id_uidx"' } }],
    })
    const result = await createOrderFromSuccessfulPayment(validInput(), { db })
    expect(result.status).toBe('succeeded')
    expect(result.idempotent).toBe(true)
    expect(result.orderId).toBe('order-race-winner')
    expect(db.rpc).toHaveBeenCalledTimes(1) // لا محاولة إنشاء ثانية
  })
})

// ══════════════════════════════════════════════════════════════════
// OFP-10: انحراف سعر/كوبون بعد نجاح الدفع
// ══════════════════════════════════════════════════════════════════

describe('OFP-10: انحراف سعر بعد نجاح الدفع → Order لا يُنشأ، حالة مطابقة لاحقة آمنة', () => {
  it('create_order يُرجع price_changed=true (بلا استثناء) → status=price_drift_requires_reconciliation', async () => {
    const db = makeDb({
      fromChains: [makeChain({ data: succeededTx(), error: null }), makeChain({ data: null, error: null })],
      rpcResults: [{ data: validOrderRow({ id: null, order_number: null, access_token: null, price_changed: true, total: 25.0 }), error: null }],
    })
    const result = await createOrderFromSuccessfulPayment(validInput(), { db })
    expect(result.status).toBe('price_drift_requires_reconciliation')
    expect(result.status).not.toBe('failed')
    expect(result.dryRun.total).toBe(25.0)
  })
})

// ══════════════════════════════════════════════════════════════════
// OFP-11/12/13: لا محاولة دفع ثانية، لا Moyasar، لا تعديل webhook
// ══════════════════════════════════════════════════════════════════

describe('OFP-11: لا محاولة دفع ثانية تُطلَق', () => {
  it('لا استيراد/استدعاء لـpaymentService.startCharge داخل هذه الدالة', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.join(process.cwd(), 'src/payments/services/checkoutOrchestration.js'), 'utf8')
    const fnBody = src.slice(src.indexOf('export async function createOrderFromSuccessfulPayment'))
    expect(fnBody).not.toMatch(/startCharge/)
  })
})

describe('OFP-12: لا استدعاء Moyasar', () => {
  it('لا استيراد لمُهايئ Moyasar أو سجلّ المُهايئات في هذا الملف (فحص أسطر import فقط، لا التعليقات)', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.join(process.cwd(), 'src/payments/services/checkoutOrchestration.js'), 'utf8')
    const importLines = src.split('\n').filter((line) => /^\s*import\b/.test(line))
    for (const line of importLines) {
      expect(line).not.toMatch(/adapters\/index|moyasar/i)
    }
  })
})

describe('OFP-13: لا تعديل مطلوب على الـwebhook', () => {
  it('supabase/functions/payment-webhook/handler.js لا يستورد شيئاً من 3.6B', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.join(process.cwd(), 'supabase/functions/payment-webhook/handler.js'), 'utf8')
    expect(src).not.toMatch(/createOrderFromSuccessfulPayment|checkoutOrchestration/)
  })
})

// ══════════════════════════════════════════════════════════════════
// OFP-14/15/16: حدود الثقة
// ══════════════════════════════════════════════════════════════════

describe('OFP-14: العميل لا يتحكّم بالمبلغ', () => {
  it('p_client_total المُمرَّر لـcreate_order يساوي snapshot.total دائماً، بصرف النظر عن أي حقل مُدخَل آخر', async () => {
    const db = makeDb({
      fromChains: [makeChain({ data: succeededTx(), error: null }), makeChain({ data: null, error: null })],
      rpcResults: [{ data: validOrderRow(), error: null }],
    })
    await createOrderFromSuccessfulPayment(validInput({ amount: 1, clientTotal: 999999 }), { db })
    expect(db.rpc.mock.calls[0][1].p_client_total).toBe(20.0)
  })
})

describe('OFP-15: العميل لا يتحكّم بملكية معرّف معاملة الدفع', () => {
  it('p_restaurant_id المُرسَل لـcreate_order دائماً من عمود payment_transactions.restaurant_id', async () => {
    const db = makeDb({
      fromChains: [makeChain({ data: succeededTx(), error: null }), makeChain({ data: null, error: null })],
      rpcResults: [{ data: validOrderRow(), error: null }],
    })
    await createOrderFromSuccessfulPayment(validInput({ expectedRestaurantId: RID }), { db })
    expect(db.rpc.mock.calls[0][1].p_restaurant_id).toBe(RID)
  })
})

describe('OFP-16: بصمة مُرسَلة من العميل تُتجاهَل (لا مُدخَل بصمة أصلاً)', () => {
  it('حقن fingerprint في input لا يؤثّر — التحقّق دائماً من اللقطة المخزَّنة فقط', async () => {
    const db = makeDb({
      fromChains: [makeChain({ data: succeededTx(), error: null }), makeChain({ data: null, error: null })],
      rpcResults: [{ data: validOrderRow(), error: null }],
    })
    const result = await createOrderFromSuccessfulPayment(validInput({ fingerprint: 'a'.repeat(64) }), { db })
    expect(result.status).toBe('succeeded')
  })
})

// ══════════════════════════════════════════════════════════════════
// OFP-17: لا معلومات تعريف شخصية أبعد مما يتطلّبه create_order أصلاً
// ══════════════════════════════════════════════════════════════════

describe('OFP-17: الحد الأدنى من البيانات الشخصية — فقط ما يتطلّبه create_order أصلاً', () => {
  it('customerPhone وحده كافٍ (dine_in مع tableNumber) — بلا customerName/notes', async () => {
    const db = makeDb({
      fromChains: [makeChain({ data: succeededTx(), error: null }), makeChain({ data: null, error: null })],
      rpcResults: [{ data: validOrderRow(), error: null }],
    })
    const result = await createOrderFromSuccessfulPayment({ paymentTransactionId: TX_ID, customerPhone: '512345678', tableNumber: 'T1' }, { db })
    expect(result.status).toBe('succeeded')
    const params = db.rpc.mock.calls[0][1]
    expect(params.p_customer_name).toBeNull()
    expect(params.p_notes).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════════
// INTEG-01 (PHASE 16) — تكامل اصطناعي كامل بـdb وهمية فقط
// ══════════════════════════════════════════════════════════════════

describe('INTEG-01: معاملة دفع ناجحة (وهمية) → createOrderFromSuccessfulPayment → create_order(p_dry_run=false) → Order مربوط', () => {
  it('السلسلة الكاملة تعمل بدون قاعدة بيانات حقيقية وبدون Moyasar', async () => {
    const db = makeDb({
      fromChains: [makeChain({ data: succeededTx(), error: null }), makeChain({ data: null, error: null })],
      rpcResults: [{ data: validOrderRow({ id: 'order-integ-1', order_number: 'SIM-INTEG-1', access_token: 'tok_integ' }), error: null }],
    })

    const result = await createOrderFromSuccessfulPayment(
      { paymentTransactionId: TX_ID, customerPhone: '512345678', tableNumber: 'T7' },
      { db }
    )

    expect(result).toEqual({
      status: 'succeeded',
      orderId: 'order-integ-1',
      orderNumber: 'SIM-INTEG-1',
      accessToken: 'tok_integ',
      paymentTransactionId: TX_ID,
      idempotent: false,
    })

    const [fnName, params] = db.rpc.mock.calls[0]
    expect(fnName).toBe('create_order')
    expect(params.p_payment_transaction_id).toBe(TX_ID)
    expect(params.p_restaurant_id).toBe(RID)
    expect(params.p_branch_id).toBe(BID)
    expect(params.p_items).toEqual([{ product_id: PID, quantity: 2, options: [] }])
    expect(params.p_client_total).toBe(20.0)
    expect(params.p_dry_run).toBe(false)
  })
})
