// TASK-PAY-3.6A-2 — اختبارات src/payments/services/checkoutOrchestration.js
// معظم الاختبارات تستخدم paymentService وهمية (مُحاكاة) لتفصل منطق التنسيق عن paymentService
// نفسها (مُختبَرة بالفعل في paymentService.test.js). اختبار التكامل الوحيد (INTEG) يستخدم
// paymentService الحقيقية غير المُعدَّلة، مع مُهايئ Moyasar وهمي — بلا أي استدعاء شبكي حقيقي.
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/payments/adapters/index.js', () => ({
  getAdapter: vi.fn(),
}))

import { initiatePaymentFirstCheckout } from '../../src/payments/services/checkoutOrchestration.js'
import { paymentService as realPaymentService } from '../../src/payments/services/paymentService.js'
import { getAdapter } from '../../src/payments/adapters/index.js'
import { computeCheckoutFingerprint } from '../../src/payments/checkoutBinding.js'
import { TransactionStatus } from '../../src/payments/types/index.js'

const RID = '11111111-1111-4111-8111-111111111111'
const BID = '22222222-2222-4222-8222-222222222222'
const PID = '33333333-3333-4333-8333-333333333333'
const PID_B = '44444444-4444-4444-8444-444444444444'

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
  return {
    single: vi.fn().mockResolvedValue(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
}

/** db وهمية: rpcResults تُستهلَك بالترتيب لكل استدعاء rpc()، fromChains بالترتيب لكل استدعاء from(). */
function makeDb({ rpcResults = [], fromChains = [] } = {}) {
  let ri = 0
  let fi = 0
  return {
    rpc: vi.fn().mockImplementation(() => makeRpcChain(rpcResults[ri++] ?? { data: null, error: null })),
    from: vi.fn().mockImplementation(() => fromChains[fi++] ?? makeChain()),
  }
}

function validDryRun(overrides = {}) {
  return {
    id: null,
    order_number: null,
    access_token: null,
    subtotal: 5.22,
    tax: 0.78,
    delivery_fee: 0,
    total: 6.0,
    price_changed: false,
    price_changes: [],
    ...overrides,
  }
}

function validInput(overrides = {}) {
  return {
    restaurant_id: RID,
    branch_id: BID,
    type: 'dine_in',
    table_number: 'T1',
    customer_phone: '512345678',
    items: [{ product_id: PID, quantity: 1, options: [] }],
    coupon_code: null,
    ...overrides,
  }
}

/** paymentService وهمية — تُعزل منطق التنسيق عن الاستدعاء الحقيقي (مُختبَر بمعزل في paymentService.test.js). */
function makeFakePaymentService(impl) {
  return { startCharge: vi.fn().mockImplementation(impl ?? (async () => ({
    transactionId: 'tx_fake_1', providerRef: 'pay_fake_1', status: TransactionStatus.INITIATED,
    redirectUrl: 'https://pay.example.com/x', idempotent: false,
  }))) }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ══════════════════════════════════════════════════════════════════
// ORCH-01..04: dry-run → snapshot → startCharge → مبلغ مطابق
// ══════════════════════════════════════════════════════════════════

describe('ORCH-01: مُدخل صالح → استدعاء dry-run بالمعاملات الصحيحة', () => {
  it('يستدعي create_order بـp_dry_run=true وبنفس قيم مُدخل التسجيل', async () => {
    const db = makeDb({ rpcResults: [{ data: validDryRun(), error: null }] })
    const ps = makeFakePaymentService()
    await initiatePaymentFirstCheckout(validInput(), { db, paymentService: ps })

    expect(db.rpc).toHaveBeenCalledTimes(1)
    const [fnName, params] = db.rpc.mock.calls[0]
    expect(fnName).toBe('create_order')
    expect(params.p_restaurant_id).toBe(RID)
    expect(params.p_branch_id).toBe(BID)
    expect(params.p_type).toBe('dine_in')
    expect(params.p_items).toEqual([{ product_id: PID, quantity: 1, options: [] }])
    expect(params.p_dry_run).toBe(true)
  })
})

describe('ORCH-02: dry-run الناجح → لقطة تُبنى وتُمرَّر إلى startCharge', () => {
  it('metadata.checkout في استدعاء startCharge هو لقطة صالحة', async () => {
    const db = makeDb({ rpcResults: [{ data: validDryRun(), error: null }] })
    const ps = makeFakePaymentService()
    await initiatePaymentFirstCheckout(validInput(), { db, paymentService: ps })

    expect(ps.startCharge).toHaveBeenCalledTimes(1)
    const [chargeInput] = ps.startCharge.mock.calls[0]
    expect(chargeInput.metadata.checkout).toMatchObject({
      restaurant_id: RID, branch_id: BID, type: 'dine_in',
      subtotal: 5.22, tax: 0.78, delivery_fee: 0, total: 6.0, currency: 'SAR',
    })
    expect(chargeInput.metadata.checkout.fingerprint).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('ORCH-03: اللقطة تؤدي إلى استدعاء startCharge واحد بالضبط', () => {
  it('لا استدعاءات مكرَّرة', async () => {
    const db = makeDb({ rpcResults: [{ data: validDryRun(), error: null }] })
    const ps = makeFakePaymentService()
    await initiatePaymentFirstCheckout(validInput(), { db, paymentService: ps })
    expect(ps.startCharge).toHaveBeenCalledTimes(1)
  })
})

describe('ORCH-04: مبلغ الدفع = إجمالي dry-run حرفياً', () => {
  it('لا حساب ولا تقريب — نفس القيمة تماماً', async () => {
    const db = makeDb({ rpcResults: [{ data: validDryRun({ total: 87.65 }), error: null }] })
    const ps = makeFakePaymentService()
    await initiatePaymentFirstCheckout(validInput(), { db, paymentService: ps })
    const [chargeInput] = ps.startCharge.mock.calls[0]
    expect(chargeInput.amount).toBe(87.65)
  })
})

// ══════════════════════════════════════════════════════════════════
// ORCH-05..08: حدود الثقة (Trust Boundary)
// ══════════════════════════════════════════════════════════════════

describe('ORCH-05: العملة دائماً SAR', () => {
  it('حتى بلا إرسال currency من المستدعي', async () => {
    const db = makeDb({ rpcResults: [{ data: validDryRun(), error: null }] })
    const ps = makeFakePaymentService()
    await initiatePaymentFirstCheckout(validInput(), { db, paymentService: ps })
    expect(ps.startCharge.mock.calls[0][0].currency).toBe('SAR')
  })
  it('عملة أخرى مُرسَلة من العميل تُرفَض صراحة قبل أي dry-run', async () => {
    const db = makeDb()
    const ps = makeFakePaymentService()
    const result = await initiatePaymentFirstCheckout(validInput({ currency: 'USD' }), { db, paymentService: ps })
    expect(result.status).toBe('rejected')
    expect(result.reason).toBe('unsupported_currency')
    expect(db.rpc).not.toHaveBeenCalled()
    expect(ps.startCharge).not.toHaveBeenCalled()
  })
})

describe('ORCH-06: العميل لا يتحكّم بالمبلغ', () => {
  it('input.amount المُرسَل خطأً من عميل مُفترَض لا يُقرأ إطلاقاً — المبلغ من dry-run فقط', async () => {
    const db = makeDb({ rpcResults: [{ data: validDryRun({ total: 6.0 }), error: null }] })
    const ps = makeFakePaymentService()
    await initiatePaymentFirstCheckout(validInput({ amount: 999999 }), { db, paymentService: ps })
    expect(ps.startCharge.mock.calls[0][0].amount).toBe(6.0)
  })
})

describe('ORCH-07: العميل لا يتحكّم بـprovider_ref', () => {
  it('provider_ref في الاستجابة يأتي فقط من نتيجة startCharge، لا من مُدخل العميل', async () => {
    const db = makeDb({ rpcResults: [{ data: validDryRun(), error: null }] })
    const ps = makeFakePaymentService(async () => ({
      transactionId: 'tx_1', providerRef: 'pay_real_1', status: TransactionStatus.INITIATED, redirectUrl: null, idempotent: false,
    }))
    const result = await initiatePaymentFirstCheckout(validInput({ providerRef: 'pay_INJECTED', provider_ref: 'pay_INJECTED' }), { db, paymentService: ps })
    expect(result.providerRef).toBe('pay_real_1')
  })
})

describe('ORCH-08: العميل لا يتحكّم بحالة الدفع', () => {
  it('paymentStatus في الاستجابة يأتي فقط من نتيجة startCharge', async () => {
    const db = makeDb({ rpcResults: [{ data: validDryRun(), error: null }] })
    const ps = makeFakePaymentService(async () => ({
      transactionId: 'tx_1', providerRef: 'pay_1', status: TransactionStatus.PENDING, redirectUrl: null, idempotent: false,
    }))
    const result = await initiatePaymentFirstCheckout(validInput({ status: 'succeeded', paymentStatus: 'succeeded' }), { db, paymentService: ps })
    expect(result.paymentStatus).toBe(TransactionStatus.PENDING)
  })
})

// ══════════════════════════════════════════════════════════════════
// ORCH-09..10: اللقطة والبصمة
// ══════════════════════════════════════════════════════════════════

describe('ORCH-09: metadata.checkout مُضمَّنة دائماً في استدعاء startCharge', () => {
  it('يحتوي الحقول المطلوبة كلها', async () => {
    const db = makeDb({ rpcResults: [{ data: validDryRun(), error: null }] })
    const ps = makeFakePaymentService()
    await initiatePaymentFirstCheckout(validInput({ coupon_code: 'SAVE10' }), { db, paymentService: ps })
    const snap = ps.startCharge.mock.calls[0][0].metadata.checkout
    expect(snap.coupon_code).toBe('SAVE10')
    expect(Array.isArray(snap.items)).toBe(true)
    expect(typeof snap.quoted_at).toBe('string')
  })
})

describe('ORCH-10: بصمة اللقطة صحيحة — تطابق computeCheckoutFingerprint لنفس مُدخل التسجيل', () => {
  it('نفس القيمة تماماً', async () => {
    const db = makeDb({ rpcResults: [{ data: validDryRun(), error: null }] })
    const ps = makeFakePaymentService()
    const input = validInput({ coupon_code: 'SAVE10' })
    await initiatePaymentFirstCheckout(input, { db, paymentService: ps })
    const snap = ps.startCharge.mock.calls[0][0].metadata.checkout
    const expected = await computeCheckoutFingerprint({
      restaurant_id: RID, branch_id: BID, type: 'dine_in',
      items: [{ product_id: PID, quantity: 1, options: [] }], coupon_code: 'SAVE10',
    })
    expect(snap.fingerprint).toBe(expected)
  })
})

// ══════════════════════════════════════════════════════════════════
// ORCH-11..14: الإتقان (Idempotency)
// ══════════════════════════════════════════════════════════════════

describe('ORCH-11: نفس مفتاح الإتقان مُعاد الاستخدام عبر إعادة محاولة نفس المحاولة', () => {
  it('استدعاءان بنفس paymentIdempotencyKey → نفس المفتاح يُمرَّر لـstartCharge كلا المرتين', async () => {
    const db1 = makeDb({ rpcResults: [{ data: validDryRun(), error: null }] })
    const db2 = makeDb({ rpcResults: [{ data: validDryRun(), error: null }] })
    const ps1 = makeFakePaymentService()
    const ps2 = makeFakePaymentService()
    const KEY = 'pay_client_supplied_key_001'

    const r1 = await initiatePaymentFirstCheckout(validInput({ paymentIdempotencyKey: KEY }), { db: db1, paymentService: ps1 })
    const r2 = await initiatePaymentFirstCheckout(validInput({ paymentIdempotencyKey: KEY }), { db: db2, paymentService: ps2 })

    expect(r1.idempotencyKey).toBe(KEY)
    expect(r2.idempotencyKey).toBe(KEY)
    expect(ps1.startCharge.mock.calls[0][0].idempotencyKey).toBe(KEY)
    expect(ps2.startCharge.mock.calls[0][0].idempotencyKey).toBe(KEY)
  })
})

describe('ORCH-12: سباق تزامن على نفس مفتاح جديد — استرداد آمن دون استدعاء ثانٍ للمزوّد', () => {
  it('startCharge يرمي خطأ قيد uq_paytx_idempotency_key → قراءة آمنة تُعيد الصف الموجود كـidempotent:true', async () => {
    const existingRow = { id: 'tx_race_winner', status: TransactionStatus.SUCCEEDED, provider_ref: 'pay_race_1', metadata: { redirect_url: 'https://pay.example.com/race' } }
    const db = makeDb({
      rpcResults: [{ data: validDryRun(), error: null }],
      fromChains: [makeChain({ data: existingRow, error: null })], // قراءة الاسترداد
    })
    const ps = makeFakePaymentService(async () => {
      throw new Error('startCharge: فشل إنشاء المعاملة — duplicate key value violates unique constraint "uq_paytx_idempotency_key"')
    })

    const result = await initiatePaymentFirstCheckout(validInput(), { db, paymentService: ps })

    expect(result.status).toBe('succeeded')
    expect(result.idempotent).toBe(true)
    expect(result.paymentTransactionId).toBe('tx_race_winner')
    expect(result.providerRef).toBe('pay_race_1')
    expect(ps.startCharge).toHaveBeenCalledTimes(1) // لا استدعاء ثانٍ
  })

  it('إن تعذّر استرداد الصف (حالة نظرية) → خطأ قابل لإعادة المحاولة، لا مفتاح جديد تلقائياً', async () => {
    const db = makeDb({
      rpcResults: [{ data: validDryRun(), error: null }],
      fromChains: [makeChain({ data: null, error: null })], // لا صف موجود
    })
    const ps = makeFakePaymentService(async () => {
      throw new Error('startCharge: فشل إنشاء المعاملة — duplicate key value violates unique constraint "uq_paytx_idempotency_key"')
    })
    const result = await initiatePaymentFirstCheckout(validInput(), { db, paymentService: ps })
    expect(result.status).toBe('retryable_error')
    expect(result.reason).toBe('idempotency_race_unrecovered')
  })
})

describe('ORCH-13: مفتاح إتقان مختلف → محاولة منفصلة', () => {
  it('استدعاءان بمفتاحين صريحين مختلفين → كل واحد يُمرَّر لـstartCharge كما هو', async () => {
    const db1 = makeDb({ rpcResults: [{ data: validDryRun(), error: null }] })
    const db2 = makeDb({ rpcResults: [{ data: validDryRun(), error: null }] })
    const ps1 = makeFakePaymentService()
    const ps2 = makeFakePaymentService()
    const r1 = await initiatePaymentFirstCheckout(validInput({ paymentIdempotencyKey: 'pay_key_A' }), { db: db1, paymentService: ps1 })
    const r2 = await initiatePaymentFirstCheckout(validInput({ paymentIdempotencyKey: 'pay_key_B' }), { db: db2, paymentService: ps2 })
    expect(r1.idempotencyKey).toBe('pay_key_A')
    expect(r2.idempotencyKey).toBe('pay_key_B')
    expect(r1.idempotencyKey).not.toBe(r2.idempotencyKey)
  })
  it('بلا مفتاح صريح على الإطلاق → مفتاحان مُولَّدان مختلفان لاستدعاءين منفصلين', async () => {
    const db1 = makeDb({ rpcResults: [{ data: validDryRun(), error: null }] })
    const db2 = makeDb({ rpcResults: [{ data: validDryRun(), error: null }] })
    const r1 = await initiatePaymentFirstCheckout(validInput(), { db: db1, paymentService: makeFakePaymentService() })
    const r2 = await initiatePaymentFirstCheckout(validInput(), { db: db2, paymentService: makeFakePaymentService() })
    expect(r1.idempotencyKey).not.toBe(r2.idempotencyKey)
  })
})

describe('ORCH-14: سلة مُغيَّرة → محاولة دفع جديدة (بصمة مختلفة)', () => {
  it('منتج مختلف ينتج بصمة لقطة مختلفة', async () => {
    const db1 = makeDb({ rpcResults: [{ data: validDryRun(), error: null }] })
    const db2 = makeDb({ rpcResults: [{ data: validDryRun(), error: null }] })
    const ps1 = makeFakePaymentService()
    const ps2 = makeFakePaymentService()
    await initiatePaymentFirstCheckout(validInput({ items: [{ product_id: PID, quantity: 1, options: [] }] }), { db: db1, paymentService: ps1 })
    await initiatePaymentFirstCheckout(validInput({ items: [{ product_id: PID_B, quantity: 1, options: [] }] }), { db: db2, paymentService: ps2 })
    const fp1 = ps1.startCharge.mock.calls[0][0].metadata.checkout.fingerprint
    const fp2 = ps2.startCharge.mock.calls[0][0].metadata.checkout.fingerprint
    expect(fp1).not.toBe(fp2)
  })
})

// ══════════════════════════════════════════════════════════════════
// ORCH-15..16: تغيّر السعر / فشل dry-run
// ══════════════════════════════════════════════════════════════════

describe('ORCH-15: price_changed=true → لا دفع يبدأ', () => {
  it('startCharge لا يُستدعى إطلاقاً، الاستجابة price_changed بالأرقام الجديدة', async () => {
    const db = makeDb({ rpcResults: [{
      data: validDryRun({ price_changed: true, total: 55, price_changes: [{ client_total: 50, server_total: 55 }] }),
      error: null,
    }] })
    const ps = makeFakePaymentService()
    const result = await initiatePaymentFirstCheckout(validInput({ clientTotal: 50 }), { db, paymentService: ps })
    expect(result.status).toBe('price_changed')
    expect(result.dryRun.total).toBe(55)
    expect(ps.startCharge).not.toHaveBeenCalled()
  })
})

describe('ORCH-16: فشل dry-run → لا دفع', () => {
  it('create_order يُرجع خطأً (مثلاً منتج غير متاح) → رفض، لا استدعاء startCharge', async () => {
    const db = makeDb({ rpcResults: [{ data: null, error: { message: 'product is unavailable for this branch' } }] })
    const ps = makeFakePaymentService()
    const result = await initiatePaymentFirstCheckout(validInput(), { db, paymentService: ps })
    expect(result.status).toBe('rejected')
    expect(result.reason).toBe('dry_run_failed')
    expect(ps.startCharge).not.toHaveBeenCalled()
  })
})

// ══════════════════════════════════════════════════════════════════
// ORCH-17..18: فشل المزوّد / غموض G-5
// ══════════════════════════════════════════════════════════════════

describe('ORCH-17: فشل مزوّد نظيف → لا Order، لا إعادة محاولة تلقائية', () => {
  it('خطأ ببادئة Moyasar الرسمية → status=failed، reason=provider_failed', async () => {
    const db = makeDb({ rpcResults: [{ data: validDryRun(), error: null }] })
    const ps = makeFakePaymentService(async () => { throw new Error('Moyasar error 422: card declined') })
    const result = await initiatePaymentFirstCheckout(validInput(), { db, paymentService: ps })
    expect(result.status).toBe('failed')
    expect(result.reason).toBe('provider_failed')
    expect(ps.startCharge).toHaveBeenCalledTimes(1) // لا إعادة محاولة تلقائية
    // لا استدعاء ثانٍ لـcreate_order (أي بلا p_dry_run:false) بعد الفشل
    expect(db.rpc).toHaveBeenCalledTimes(1)
  })
})

describe('ORCH-18: خطأ غامض (لا Moyasar ولا startCharge ولا سباق) → حالة مطابقة لاحقة، ليست فشلاً قطعياً', () => {
  it('status=requires_reconciliation، بلا أي كتابة على قاعدة البيانات من هذه الطبقة', async () => {
    const db = makeDb({ rpcResults: [{ data: validDryRun(), error: null }] })
    const ps = makeFakePaymentService(async () => { throw new Error('permission denied for table payment_transactions') })
    const result = await initiatePaymentFirstCheckout(validInput(), { db, paymentService: ps })
    expect(result.status).toBe('requires_reconciliation')
    expect(result.status).not.toBe('failed') // لا يُزعَم فشل قطعي
    expect(db.from).not.toHaveBeenCalled() // لا قراءة/كتابة من التنسيق في هذا المسار
  })
})

// ══════════════════════════════════════════════════════════════════
// ORCH-19..20: عزل المستأجرين / لا Order
// ══════════════════════════════════════════════════════════════════

describe('ORCH-19: عدم اتساق مطعم/فرع → رفض عبر فحص create_order الخادمي نفسه', () => {
  it('create_order يرفض (نفس آلية عزل المستأجرين الموجودة) → لا دفع', async () => {
    const db = makeDb({ rpcResults: [{ data: null, error: { message: 'branch is unavailable' } }] })
    const ps = makeFakePaymentService()
    const result = await initiatePaymentFirstCheckout(validInput(), { db, paymentService: ps })
    expect(result.status).toBe('rejected')
    expect(ps.startCharge).not.toHaveBeenCalled()
  })
})

describe('ORCH-20: لا Order حقيقي يُنشأ في أي سيناريو — كل استدعاء create_order بـp_dry_run=true فقط', () => {
  it('عبر كل السيناريوهات الناجحة/الفاشلة في هذا الملف، db.rpc لا يُستدعى إلا بـp_dry_run:true', async () => {
    const scenarios = [
      { db: makeDb({ rpcResults: [{ data: validDryRun(), error: null }] }), ps: makeFakePaymentService() },
      { db: makeDb({ rpcResults: [{ data: validDryRun({ price_changed: true }), error: null }] }), ps: makeFakePaymentService() },
      { db: makeDb({ rpcResults: [{ data: null, error: { message: 'x' } }] }), ps: makeFakePaymentService() },
    ]
    for (const { db, ps } of scenarios) {
      await initiatePaymentFirstCheckout(validInput(), { db, paymentService: ps })
      for (const call of db.rpc.mock.calls) {
        expect(call[1].p_dry_run).toBe(true)
      }
    }
  })
})

// ══════════════════════════════════════════════════════════════════
// ORCH-21: لا تغييرات على الـwebhook
// ══════════════════════════════════════════════════════════════════

describe('ORCH-21: لا اقتران جديد مع الـwebhook', () => {
  it('supabase/functions/payment-webhook/handler.js لا يستورد شيئاً من هذه المهمة', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.join(process.cwd(), 'supabase/functions/payment-webhook/handler.js'), 'utf8')
    expect(src).not.toMatch(/checkoutOrchestration|checkoutBinding|initiatePaymentFirstCheckout/)
  })
})

// ══════════════════════════════════════════════════════════════════
// ORCH-22..23: لا Moyasar حقيقي / لا تسريب أسرار
// ══════════════════════════════════════════════════════════════════

describe('ORCH-22: لا استدعاء Moyasar حقيقي في اختبارات الوحدة', () => {
  it('paymentService وهمية بالكامل — getAdapter الحقيقي لم يُستدعَ إطلاقاً', async () => {
    const db = makeDb({ rpcResults: [{ data: validDryRun(), error: null }] })
    const ps = makeFakePaymentService()
    await initiatePaymentFirstCheckout(validInput(), { db, paymentService: ps })
    expect(getAdapter).not.toHaveBeenCalled()
  })
})

describe('ORCH-23: لا تسريب أسرار في أي استجابة', () => {
  it('لا مفتاح API ولا service_role ولا حمولة raw كاملة للمزوّد', async () => {
    const db = makeDb({ rpcResults: [{ data: validDryRun(), error: null }] })
    const ps = makeFakePaymentService(async () => ({
      transactionId: 'tx_1', providerRef: 'pay_1', status: TransactionStatus.SUCCEEDED,
      redirectUrl: 'https://pay.example.com/x', idempotent: false,
    }))
    const result = await initiatePaymentFirstCheckout(validInput(), { db, paymentService: ps })
    const json = JSON.stringify(result)
    expect(json).not.toMatch(/apiKey|secret|service_role|PAYMENT_MOYASAR_SECRET_KEY/i)
    expect(result.raw).toBeUndefined()
  })
})

// ══════════════════════════════════════════════════════════════════
// INTEG-01 (PHASE 18) — تكامل حقيقي: paymentService الحقيقية، Moyasar وهمي بالكامل
// ══════════════════════════════════════════════════════════════════

describe('INTEG-01: checkoutInput → dry-run → snapshot → startCharge (paymentService حقيقية، Moyasar وهمي)', () => {
  it('يبني معاملة دفع بمبلغ/عملة/metadata.checkout/idempotencyKey صحيحة، بلا أي استدعاء شبكي', async () => {
    const fakeAdapter = {
      createCharge: vi.fn().mockResolvedValue({
        providerRef: 'pay_integration_1',
        status: TransactionStatus.INITIATED,
        redirectUrl: 'https://pay.example.com/integration',
        raw: { id: 'pay_integration_1' },
      }),
    }
    getAdapter.mockReturnValue(fakeAdapter)

    const db = makeDb({
      rpcResults: [{ data: validDryRun({ total: 20.0, subtotal: 17.39, tax: 2.61 }), error: null }],
      fromChains: [
        makeChain({ data: null, error: null }), // paymentService: فحص إتقان مسبق — لا شيء موجود
        makeChain({ data: { id: 'tx_integration_1' }, error: null }), // paymentService: INSERT
        makeChain({ data: null, error: null }), // paymentService: UPDATE بعد نجاح المزوّد
      ],
    })

    const result = await initiatePaymentFirstCheckout(
      validInput({ items: [{ product_id: PID, quantity: 2, options: [] }] }),
      { db, paymentService: realPaymentService }
    )

    expect(result.status).toBe('succeeded')
    expect(result.paymentTransactionId).toBe('tx_integration_1')
    expect(result.providerRef).toBe('pay_integration_1')
    expect(typeof result.idempotencyKey).toBe('string')
    expect(result.idempotencyKey.length).toBeGreaterThan(0)

    // المبلغ/العملة المُرسَلان إلى adapter.createCharge الحقيقي (عبر paymentService غير المُعدَّلة)
    expect(fakeAdapter.createCharge).toHaveBeenCalledTimes(1)
    const chargeCallInput = fakeAdapter.createCharge.mock.calls[0][0]
    expect(chargeCallInput.amount).toBe(20.0)

    // INSERT الفعلي داخل paymentService — التحقّق من metadata.checkout المُخزَّنة فعلياً
    const insertChain = db.from.mock.results[1].value
    const insertedRow = insertChain.insert.mock.calls[0][0]
    expect(insertedRow.amount).toBe(20.0)
    expect(insertedRow.currency).toBe('SAR')
    expect(insertedRow.metadata.checkout.total).toBe(20.0)
    expect(insertedRow.metadata.checkout.fingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect(insertedRow.idempotency_key).toBe(result.idempotencyKey)

    // لا Moyasar حقيقي — fetch العام (إن رُصِد) لم يُستدعَ إطلاقاً عبر هذا المسار
    expect(getAdapter).toHaveBeenCalledWith('moyasar')
  })
})
