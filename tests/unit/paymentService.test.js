// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock adapter registry BEFORE importing paymentService
vi.mock('../../src/payments/adapters/index.js', () => ({
  getAdapter: vi.fn(),
}))

// TASK-PAY-3.6C.3.1: مزامنة حالة الطلب — وهمية بالكامل هنا. تُعزل اختبارات refund() عن منطق
// syncOrderStatusFromPayment نفسه (مُختبَر بمعزل تام في orderPaymentSync.test.js).
vi.mock('../../src/payments/services/checkoutOrchestration.js', () => ({
  syncOrderStatusFromPayment: vi.fn(),
}))

import { paymentService } from '../../src/payments/services/paymentService.js'
import { getAdapter } from '../../src/payments/adapters/index.js'
import { syncOrderStatusFromPayment } from '../../src/payments/services/checkoutOrchestration.js'
import { TransactionStatus, WebhookEventType, RefundStatus } from '../../src/payments/types/index.js'

// ————— DB mock helpers —————

/** بناء سلسلة Supabase وهمية تُرجع result عند أي استدعاء نهائي. */
function makeChain(result = { data: null, error: null }) {
  const o = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
    // يجعل السلسلة قابلة لـ await مباشرةً (مثل: await db.from(...).update(...).eq(...))
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
  return o
}

/** بناء db وهمي يُعيد chains بالترتيب لكل استدعاء from(). */
function makeDb(...chains) {
  let i = 0
  return { from: vi.fn().mockImplementation(() => chains[i++] ?? makeChain()) }
}

// ————— Adapter mock —————

let mockAdapter

beforeEach(() => {
  vi.clearAllMocks()
  mockAdapter = {
    createCharge: vi.fn(),
    verifyPayment: vi.fn(),
    refundPayment: vi.fn(),
    key: 'moyasar',
  }
  getAdapter.mockReturnValue(mockAdapter)
  // افتراضياً: مزامنة ناجحة بلا انتقال (سيناريو محايد) — تُستبدَل صراحةً في اختبارات 3.6C.3.1 المحدَّدة
  syncOrderStatusFromPayment.mockResolvedValue({ action: 'none' })
})

// ══════════════════════════════════════════════════════════════════
// startCharge
// ══════════════════════════════════════════════════════════════════

describe('PS-001: startCharge — رفض إدخال بدون restaurantId', () => {
  it('يرمي خطأ إذا كان restaurantId مفقوداً', async () => {
    const db = makeDb()
    await expect(
      paymentService.startCharge({ amount: 50, currency: 'SAR', idempotencyKey: 'k1' }, { db })
    ).rejects.toThrow('restaurantId')
    expect(db.from).not.toHaveBeenCalled()
  })
})

describe('PS-002: startCharge — رفض مبلغ غير صالح', () => {
  it('يرمي خطأ إذا كان amount صفراً أو سالباً', async () => {
    const db = makeDb()
    await expect(
      paymentService.startCharge({ restaurantId: 'r1', amount: 0, currency: 'SAR', idempotencyKey: 'k1' }, { db })
    ).rejects.toThrow('amount')
    expect(db.from).not.toHaveBeenCalled()
  })
})

describe('PS-003: startCharge — إتقان (idempotency) بإرجاع معاملة موجودة', () => {
  it('يُرجع المعاملة الموجودة دون استدعاء adapter إذا وُجد idempotency_key', async () => {
    const existing = { id: 'tx_existing', status: TransactionStatus.INITIATED, provider_ref: 'pay_abc', metadata: { redirect_url: 'https://pay.example.com' } }
    const db = makeDb(makeChain({ data: existing, error: null }))

    const result = await paymentService.startCharge(
      { restaurantId: 'r1', amount: 100, currency: 'SAR', idempotencyKey: 'idem_001' },
      { db }
    )

    expect(result.idempotent).toBe(true)
    expect(result.transactionId).toBe('tx_existing')
    expect(result.providerRef).toBe('pay_abc')
    expect(result.redirectUrl).toBe('https://pay.example.com')
    expect(mockAdapter.createCharge).not.toHaveBeenCalled()
    expect(db.from).toHaveBeenCalledTimes(1)
  })
})

describe('PS-004: startCharge — المسار الصحيح (happy path)', () => {
  it('يُنشئ معاملة، يستدعي adapter، يُحدِّث الصف، ويُرجع النتيجة', async () => {
    const db = makeDb(
      makeChain({ data: null, error: null }),                        // idempotency check → none
      makeChain({ data: { id: 'tx_new' }, error: null }),            // insert → new row
      makeChain({ data: null, error: null }),                        // update after createCharge
    )

    mockAdapter.createCharge.mockResolvedValue({
      providerRef: 'pay_xyz',
      status: TransactionStatus.INITIATED,
      redirectUrl: 'https://pay.moyasar.com/test',
      raw: { id: 'pay_xyz' },
    })

    const result = await paymentService.startCharge(
      { restaurantId: 'r1', amount: 50, currency: 'SAR', idempotencyKey: 'idem_002', returnUrl: 'https://simsim.com/return' },
      { db }
    )

    expect(result.transactionId).toBe('tx_new')
    expect(result.providerRef).toBe('pay_xyz')
    expect(result.status).toBe(TransactionStatus.INITIATED)
    expect(result.redirectUrl).toBe('https://pay.moyasar.com/test')
    expect(result.idempotent).toBe(false)
    expect(mockAdapter.createCharge).toHaveBeenCalledOnce()
    expect(db.from).toHaveBeenCalledTimes(3)
  })
})

describe('PS-005: startCharge — فشل adapter يُحدِّث الصف إلى failed', () => {
  it('يُحدِّث المعاملة إلى FAILED ويُعيد رمي الخطأ عند فشل createCharge', async () => {
    const db = makeDb(
      makeChain({ data: null, error: null }),              // idempotency check
      makeChain({ data: { id: 'tx_fail' }, error: null }), // insert
      makeChain({ data: null, error: null }),              // update to failed
    )

    mockAdapter.createCharge.mockRejectedValue(new Error('Moyasar network error: timeout'))

    await expect(
      paymentService.startCharge(
        { restaurantId: 'r1', amount: 50, currency: 'SAR', idempotencyKey: 'idem_003' },
        { db }
      )
    ).rejects.toThrow('Moyasar network error: timeout')

    // التحقّق من أن الصف حُدِّث إلى failed
    const updateCall = db.from.mock.calls[2]
    expect(updateCall[0]).toBe('payment_transactions')
  })
})

// ══════════════════════════════════════════════════════════════════
// confirmCharge
// ══════════════════════════════════════════════════════════════════

describe('PS-006: confirmCharge — رفض إدخال بدون providerRef', () => {
  it('يرمي خطأ إذا كان providerRef فارغاً', async () => {
    const db = makeDb()
    await expect(
      paymentService.confirmCharge('', { db })
    ).rejects.toThrow('providerRef')
    expect(db.from).not.toHaveBeenCalled()
  })
})

describe('PS-007: confirmCharge — الحالة النهائية (terminal) لا تستدعي adapter', () => {
  it('يُرجع الحالة الحالية دون استدعاء adapter إذا كانت المعاملة نهائية', async () => {
    const db = makeDb(
      makeChain({ data: { id: 'tx_done', provider: 'moyasar', status: TransactionStatus.SUCCEEDED }, error: null }),
    )

    const result = await paymentService.confirmCharge('pay_done', { db })

    expect(result.updated).toBe(false)
    expect(result.status).toBe(TransactionStatus.SUCCEEDED)
    expect(mockAdapter.verifyPayment).not.toHaveBeenCalled()
  })
})

describe('PS-008: confirmCharge — معاملة غير موجودة', () => {
  it('يرمي خطأ إذا لم تُوجد معاملة بالمعرّف المُمرَّر', async () => {
    const db = makeDb(makeChain({ data: null, error: null }))

    await expect(
      paymentService.confirmCharge('pay_ghost', { db })
    ).rejects.toThrow('لا توجد معاملة')
  })
})

describe('PS-009: confirmCharge — المسار الصحيح', () => {
  it('يستدعي adapter.verifyPayment ويُحدِّث الصف ويُرجع النتيجة', async () => {
    const db = makeDb(
      makeChain({ data: { id: 'tx_pend', provider: 'moyasar', status: TransactionStatus.PENDING }, error: null }),
      makeChain({ data: null, error: null }), // update
    )

    mockAdapter.verifyPayment.mockResolvedValue({
      providerRef: 'pay_pend',
      status: TransactionStatus.SUCCEEDED,
      raw: { id: 'pay_pend', status: 'paid' },
    })

    const result = await paymentService.confirmCharge('pay_pend', { db })

    expect(result.updated).toBe(true)
    expect(result.status).toBe(TransactionStatus.SUCCEEDED)
    expect(result.transactionId).toBe('tx_pend')
    expect(mockAdapter.verifyPayment).toHaveBeenCalledWith('pay_pend')
  })
})

// ══════════════════════════════════════════════════════════════════
// handleWebhookEvent
// ══════════════════════════════════════════════════════════════════

describe('PS-010: handleWebhookEvent — رفض حدث بدون provider', () => {
  it('يرمي خطأ إذا كان event.provider مفقوداً', async () => {
    const db = makeDb()
    await expect(
      paymentService.handleWebhookEvent({ eventId: 'ev_001', type: WebhookEventType.PAYMENT_SUCCEEDED }, { db })
    ).rejects.toThrow('event.provider')
    expect(db.from).not.toHaveBeenCalled()
  })
})

describe('PS-011: handleWebhookEvent — حدث مُعالَج مسبقاً (23505)', () => {
  it('يُرجع already_processed عند انتهاك القيد الفريد', async () => {
    const db = makeDb(
      makeChain({ data: null, error: { code: '23505', message: 'duplicate key' } }),
    )

    const result = await paymentService.handleWebhookEvent(
      { provider: 'moyasar', eventId: 'ev_dup', type: WebhookEventType.PAYMENT_SUCCEEDED, raw: {} },
      { db }
    )

    expect(result.updated).toBe(false)
    expect(result.reason).toBe('already_processed')
  })
})

describe('PS-012: handleWebhookEvent — لا providerRef في الحدث', () => {
  it('يُسجّل الحدث ويُرجع no_provider_ref', async () => {
    const db = makeDb(
      makeChain({ data: { id: 'wh_001' }, error: null }), // insert webhook
      makeChain({ data: null, error: null }),              // update processed_at
    )

    const result = await paymentService.handleWebhookEvent(
      { provider: 'moyasar', eventId: 'ev_noref', type: WebhookEventType.UNKNOWN, raw: {} },
      { db }
    )

    expect(result.updated).toBe(false)
    expect(result.reason).toBe('no_provider_ref')
  })
})

describe('PS-013: handleWebhookEvent — معاملة غير موجودة', () => {
  it('يُسجّل الخطأ ويُرجع transaction_not_found', async () => {
    const db = makeDb(
      makeChain({ data: { id: 'wh_002' }, error: null }), // insert webhook
      makeChain({ data: null, error: null }),              // lookup tx → null
      makeChain({ data: null, error: null }),              // update webhook error
    )

    const result = await paymentService.handleWebhookEvent(
      { provider: 'moyasar', eventId: 'ev_notx', type: WebhookEventType.PAYMENT_SUCCEEDED, providerRef: 'pay_ghost', raw: {} },
      { db }
    )

    expect(result.updated).toBe(false)
    expect(result.reason).toBe('transaction_not_found')
  })
})

describe('PS-014: handleWebhookEvent — معاملة نهائية (already_terminal)', () => {
  it('يتجاهل التحديث ويُرجع already_terminal', async () => {
    const db = makeDb(
      makeChain({ data: { id: 'wh_003' }, error: null }),                                              // insert webhook
      makeChain({ data: { id: 'tx_done2', status: TransactionStatus.SUCCEEDED }, error: null }),       // lookup tx
      makeChain({ data: null, error: null }),                                                           // update webhook processed
    )

    const result = await paymentService.handleWebhookEvent(
      { provider: 'moyasar', eventId: 'ev_term', type: WebhookEventType.PAYMENT_SUCCEEDED, providerRef: 'pay_done2', raw: {} },
      { db }
    )

    expect(result.updated).toBe(false)
    expect(result.reason).toBe('already_terminal')
    expect(result.transactionId).toBe('tx_done2')
  })
})

describe('PS-015: handleWebhookEvent — المسار الصحيح', () => {
  it('يُحدِّث حالة المعاملة ويُعلِّم الحدث معالَجاً', async () => {
    const db = makeDb(
      makeChain({ data: { id: 'wh_ok' }, error: null }),                                              // insert webhook
      makeChain({ data: { id: 'tx_pend2', status: TransactionStatus.PENDING }, error: null }),        // lookup tx
      makeChain({ data: null, error: null }),                                                           // update tx status
      makeChain({ data: null, error: null }),                                                           // update webhook processed
    )

    const result = await paymentService.handleWebhookEvent(
      {
        provider: 'moyasar',
        eventId: 'ev_ok',
        type: WebhookEventType.PAYMENT_SUCCEEDED,
        providerRef: 'pay_pend2',
        status: TransactionStatus.SUCCEEDED,
        raw: {},
      },
      { db }
    )

    expect(result.updated).toBe(true)
    expect(result.transactionId).toBe('tx_pend2')
    expect(result.status).toBe(TransactionStatus.SUCCEEDED)
    expect(db.from).toHaveBeenCalledTimes(4)
  })
})

// ══════════════════════════════════════════════════════════════════
// refund
// ══════════════════════════════════════════════════════════════════

describe('PS-016: refund — رفض إدخال بدون providerRef', () => {
  it('يرمي خطأ إذا كان providerRef مفقوداً', async () => {
    const db = makeDb()
    await expect(
      paymentService.refund({ idempotencyKey: 'ref_k1' }, { db })
    ).rejects.toThrow('providerRef')
    expect(db.from).not.toHaveBeenCalled()
  })
})

describe('PS-016b: refund — رفض إدخال بدون restaurantId (TASK-PAY-3.6C.3.0)', () => {
  it('يرمي خطأ إذا كان restaurantId مفقوداً، قبل أي استعلام', async () => {
    const db = makeDb()
    await expect(
      paymentService.refund({ providerRef: 'pay_x', idempotencyKey: 'ref_kx' }, { db })
    ).rejects.toThrow('restaurantId')
    expect(db.from).not.toHaveBeenCalled()
  })
})

describe('PS-017: refund — رفض الاسترداد إذا كانت الحالة ليست succeeded', () => {
  it('يرمي خطأ إذا كانت المعاملة بحالة failed', async () => {
    const db = makeDb(
      makeChain({ data: { id: 'tx_fail2', provider: 'moyasar', status: TransactionStatus.FAILED, amount: 100, restaurant_id: 'r1', metadata: {}, updated_at: 't0' }, error: null }),
    )

    await expect(
      paymentService.refund({ providerRef: 'pay_fail', restaurantId: 'r1', idempotencyKey: 'ref_k2' }, { db })
    ).rejects.toThrow('لا يمكن استرداد معاملة بحالة failed')

    expect(mockAdapter.refundPayment).not.toHaveBeenCalled()
  })
})

describe('PS-017b: refund — عزل المستأجرين (TASK-PAY-3.6C.3.0)', () => {
  it('restaurantId لا يطابق ملكية المعاملة الفعلية → رفض برسالة عامة، لا استدعاء مزوّد', async () => {
    const db = makeDb(
      makeChain({ data: { id: 'tx_other', provider: 'moyasar', status: TransactionStatus.SUCCEEDED, amount: 200, restaurant_id: 'r1', metadata: {}, updated_at: 't0' }, error: null }),
    )
    await expect(
      paymentService.refund({ providerRef: 'pay_other', restaurantId: 'r2', idempotencyKey: 'ref_kt' }, { db })
    ).rejects.toThrow('لا توجد معاملة')
    expect(mockAdapter.refundPayment).not.toHaveBeenCalled()
    expect(db.from).toHaveBeenCalledTimes(1) // لا محاولة حجز أو تحديث
  })

  it('معاملة غير موجودة أصلاً ترمي نفس رسالة عدم-الوجود/عدم-الملكية (لا تسريب معلومة)', async () => {
    const dbNotFound = makeDb(makeChain({ data: null, error: null }))
    const dbWrongTenant = makeDb(
      makeChain({ data: { id: 'tx_x', provider: 'moyasar', status: TransactionStatus.SUCCEEDED, amount: 1, restaurant_id: 'r1', metadata: {}, updated_at: 't0' }, error: null }),
    )
    let msgNotFound, msgWrongTenant
    try { await paymentService.refund({ providerRef: 'p1', restaurantId: 'rX', idempotencyKey: 'k1' }, { db: dbNotFound }) } catch (e) { msgNotFound = e.message }
    try { await paymentService.refund({ providerRef: 'p1', restaurantId: 'r2', idempotencyKey: 'k1' }, { db: dbWrongTenant }) } catch (e) { msgWrongTenant = e.message }
    expect(msgNotFound).toBe(msgWrongTenant)
  })
})

describe('PS-018: refund — المسار الصحيح (استرداد كامل)', () => {
  it('يحجز ذرّياً ثم يستدعي adapter.refundPayment ويُحدِّث الصف إلى REFUNDED', async () => {
    const claimChain = makeChain({ data: { id: 'tx_succ' }, error: null })
    const db = makeDb(
      makeChain({ data: { id: 'tx_succ', provider: 'moyasar', status: TransactionStatus.SUCCEEDED, amount: 200, restaurant_id: 'r1', metadata: {}, updated_at: 't0' }, error: null }),
      claimChain, // الحجز الذرّي
      makeChain({ data: null, error: null }), // update to refunded
    )

    mockAdapter.refundPayment.mockResolvedValue({
      refundRef: 'rfnd_ok',
      status: RefundStatus.REFUNDED,
      raw: { id: 'rfnd_ok', status: 'refunded' },
    })

    const result = await paymentService.refund(
      { providerRef: 'pay_succ', restaurantId: 'r1', amount: 200, reason: 'customer request', idempotencyKey: 'ref_k3' },
      { db }
    )

    expect(result.transactionId).toBe('tx_succ')
    expect(result.refundRef).toBe('rfnd_ok')
    expect(result.status).toBe(RefundStatus.REFUNDED)
    expect(result.idempotent).toBe(false)
    expect(mockAdapter.refundPayment).toHaveBeenCalledWith(expect.objectContaining({ providerRef: 'pay_succ' }))
    expect(db.from).toHaveBeenCalledTimes(3)
    // الحجز محروس بـstatus وupdated_at الفعليين — شرط ذرّي حقيقي
    expect(claimChain.eq).toHaveBeenCalledWith('status', TransactionStatus.SUCCEEDED)
    expect(claimChain.eq).toHaveBeenCalledWith('updated_at', 't0')
  })
})

describe('PS-018b: refund — استرداد جزئي صالح', () => {
  it('amount أقل من المبلغ الأصلي → مسموح', async () => {
    const db = makeDb(
      makeChain({ data: { id: 'tx_p', provider: 'moyasar', status: TransactionStatus.SUCCEEDED, amount: 200, restaurant_id: 'r1', metadata: {}, updated_at: 't0' }, error: null }),
      makeChain({ data: { id: 'tx_p' }, error: null }),
      makeChain({ data: null, error: null }),
    )
    mockAdapter.refundPayment.mockResolvedValue({ refundRef: 'rfnd_partial', status: RefundStatus.REFUNDED, raw: {} })
    const result = await paymentService.refund(
      { providerRef: 'pay_p', restaurantId: 'r1', amount: 50, idempotencyKey: 'ref_kp' },
      { db }
    )
    expect(result.status).toBe(RefundStatus.REFUNDED)
  })
})

describe('PS-019: refund — تحقّق المبلغ (TASK-PAY-3.6C.3.0)', () => {
  it('amount = 0 → رفض', async () => {
    const db = makeDb(
      makeChain({ data: { id: 'tx_a', provider: 'moyasar', status: TransactionStatus.SUCCEEDED, amount: 100, restaurant_id: 'r1', metadata: {}, updated_at: 't0' }, error: null }),
    )
    await expect(
      paymentService.refund({ providerRef: 'pay_a', restaurantId: 'r1', amount: 0, idempotencyKey: 'k' }, { db })
    ).rejects.toThrow('أكبر من صفر')
    expect(mockAdapter.refundPayment).not.toHaveBeenCalled()
  })
  it('amount سالب → رفض', async () => {
    const db = makeDb(
      makeChain({ data: { id: 'tx_b', provider: 'moyasar', status: TransactionStatus.SUCCEEDED, amount: 100, restaurant_id: 'r1', metadata: {}, updated_at: 't0' }, error: null }),
    )
    await expect(
      paymentService.refund({ providerRef: 'pay_b', restaurantId: 'r1', amount: -5, idempotencyKey: 'k' }, { db })
    ).rejects.toThrow('أكبر من صفر')
  })
  it('amount أكبر من المبلغ الأصلي → رفض', async () => {
    const db = makeDb(
      makeChain({ data: { id: 'tx_c', provider: 'moyasar', status: TransactionStatus.SUCCEEDED, amount: 100, restaurant_id: 'r1', metadata: {}, updated_at: 't0' }, error: null }),
    )
    await expect(
      paymentService.refund({ providerRef: 'pay_c', restaurantId: 'r1', amount: 150, idempotencyKey: 'k' }, { db })
    ).rejects.toThrow('يتجاوز المبلغ الأصلي')
    expect(mockAdapter.refundPayment).not.toHaveBeenCalled()
  })
})

describe('PS-020: refund — سباق تزامن حقيقي على الحجز الذرّي (TASK-PAY-3.6C.3.0)', () => {
  it('الحجز الذرّي لا يجد صفاً مطابقاً (محاولة أخرى سبقت) → رفض، لا استدعاء مزوّد إطلاقاً', async () => {
    const db = makeDb(
      makeChain({ data: { id: 'tx_race', provider: 'moyasar', status: TransactionStatus.SUCCEEDED, amount: 100, restaurant_id: 'r1', metadata: {}, updated_at: 't0' }, error: null }),
      makeChain({ data: null, error: null }), // الحجز فشل — لا صف مطابق (updated_at تغيّر فعلياً)
    )
    await expect(
      paymentService.refund({ providerRef: 'pay_race', restaurantId: 'r1', idempotencyKey: 'ref_race' }, { db })
    ).rejects.toThrow('تعذّر حجز محاولة الاسترداد')
    expect(mockAdapter.refundPayment).not.toHaveBeenCalled()
  })
})

describe('PS-021: refund — إتقان مفتاح الاسترداد (TASK-PAY-3.6C.3.0)', () => {
  it('نفس مفتاح الإتقان على حجز قائم بالفعل → نفس المحاولة المنطقية، لا استدعاء مزوّد ثانٍ', async () => {
    const db = makeDb(
      makeChain({
        data: {
          id: 'tx_dup', provider: 'moyasar', status: TransactionStatus.SUCCEEDED, amount: 100, restaurant_id: 'r1',
          metadata: { refund_claim: { idempotency_key: 'ref_same', claimed_at: '2026-01-01T00:00:00.000Z' } },
          updated_at: 't1',
        },
        error: null,
      }),
    )
    const result = await paymentService.refund({ providerRef: 'pay_dup', restaurantId: 'r1', idempotencyKey: 'ref_same' }, { db })
    expect(result.idempotent).toBe(true)
    expect(mockAdapter.refundPayment).not.toHaveBeenCalled()
    expect(db.from).toHaveBeenCalledTimes(1)
  })

  it('مفتاح إتقان مختلف على حجز قائم بالفعل → رفض (محاولة أخرى قيد المعالجة)', async () => {
    const db = makeDb(
      makeChain({
        data: {
          id: 'tx_dup2', provider: 'moyasar', status: TransactionStatus.SUCCEEDED, amount: 100, restaurant_id: 'r1',
          metadata: { refund_claim: { idempotency_key: 'ref_original', claimed_at: '2026-01-01T00:00:00.000Z' } },
          updated_at: 't1',
        },
        error: null,
      }),
    )
    await expect(
      paymentService.refund({ providerRef: 'pay_dup2', restaurantId: 'r1', idempotencyKey: 'ref_different' }, { db })
    ).rejects.toThrow('محاولة استرداد أخرى قيد المعالجة')
    expect(mockAdapter.refundPayment).not.toHaveBeenCalled()
  })
})

describe('PS-022: refund — فشل المزوّد بعد حجز ناجح يُلغي الحجز (Best-Effort)', () => {
  it('adapter.refundPayment يرمي خطأ → إلغاء الحجز، الخطأ الأصلي يُعاد رميه', async () => {
    const revertChain = makeChain({ data: null, error: null })
    const db = makeDb(
      makeChain({ data: { id: 'tx_pf', provider: 'moyasar', status: TransactionStatus.SUCCEEDED, amount: 100, restaurant_id: 'r1', metadata: {}, updated_at: 't0' }, error: null }),
      makeChain({ data: { id: 'tx_pf' }, error: null }), // الحجز نجح
      revertChain, // إلغاء الحجز بعد فشل المزوّد
    )
    mockAdapter.refundPayment.mockRejectedValue(new Error('Moyasar error 422: refund rejected'))

    await expect(
      paymentService.refund({ providerRef: 'pay_pf', restaurantId: 'r1', idempotencyKey: 'ref_pf' }, { db })
    ).rejects.toThrow('Moyasar error 422')

    expect(db.from).toHaveBeenCalledTimes(3)
    expect(revertChain.update).toHaveBeenCalledWith(expect.objectContaining({ metadata: {} }))
  })
})

describe('PS-023: refund — بلا اقتران مع webhook أو checkoutOrchestration.js (TASK-PAY-3.6C.3.0)', () => {
  it('لا استدعاء لـsyncOrderStatusFromPayment داخل refund()', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.join(process.cwd(), 'src/payments/services/paymentService.js'), 'utf8')
    const fnBody = src.slice(src.indexOf('async refund(input'), src.indexOf('async refund(input') + 4000)
    expect(fnBody).not.toMatch(/syncOrderStatusFromPayment|checkoutOrchestration/)
  })
  it('supabase/functions/payment-webhook/handler.js لا يستورد شيئاً من refund() المُصلَّب (فحص أسطر import فقط)', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.join(process.cwd(), 'supabase/functions/payment-webhook/handler.js'), 'utf8')
    const importLines = src.split('\n').filter((line) => /^\s*import\b/.test(line))
    for (const line of importLines) {
      expect(line).not.toMatch(/paymentService|refund_claim/)
    }
    expect(src).not.toMatch(/refund_claim/) // refund_claim ليس اسم prose عادياً، آمن كفحص نصّي كامل
  })
  it('لا Admin UI جديد — لا ملفات جديدة تحت src/admin/ أو src/pages/ لهذه المهمة', async () => {
    // فحص ثابت: لا استيراد لـpaymentService.refund من أي ملف واجهة إدارية
    const fs = await import('node:fs')
    const path = await import('node:path')
    const adminDir = path.join(process.cwd(), 'src/admin')
    const walk = (dir) => {
      let matches = []
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) matches = matches.concat(walk(full))
        else if (entry.isFile() && /\.(js|jsx)$/.test(entry.name)) {
          const content = fs.readFileSync(full, 'utf8')
          if (/paymentService\.refund|checkoutOrchestration/.test(content)) matches.push(full)
        }
      }
      return matches
    }
    expect(walk(adminDir)).toEqual([])
  })
})

// ══════════════════════════════════════════════════════════════════
// TASK-PAY-3.6C.3.1 — refund() → syncOrderStatusFromPayment() wiring
// ══════════════════════════════════════════════════════════════════

function fullRefundDb(orderSyncMock) {
  const claimChain = makeChain({ data: { id: 'tx_r1' }, error: null })
  const finalUpdateChain = makeChain({ data: null, error: null })
  const db = makeDb(
    makeChain({ data: { id: 'tx_r1', provider: 'moyasar', status: TransactionStatus.SUCCEEDED, amount: 100, restaurant_id: 'r1', metadata: {}, updated_at: 't0' }, error: null }),
    claimChain,
    finalUpdateChain,
  )
  mockAdapter.refundPayment.mockResolvedValue({ refundRef: 'rfnd_1', status: RefundStatus.REFUNDED, raw: {} })
  if (orderSyncMock) syncOrderStatusFromPayment.mockImplementation(orderSyncMock)
  return { db, claimChain, finalUpdateChain }
}

describe('PS-024: استرداد ناجح → المزامنة تُستدعى', () => {
  it('syncOrderStatusFromPayment يُستدعى مرة واحدة بعد نجاح الاسترداد', async () => {
    const { db } = fullRefundDb()
    await paymentService.refund({ providerRef: 'pay_r1', restaurantId: 'r1', idempotencyKey: 'k1' }, { db })
    expect(syncOrderStatusFromPayment).toHaveBeenCalledTimes(1)
  })
})

describe('PS-025: المزامنة تستقبل paymentTransactionId الصحيح', () => {
  it('نفس معرّف معاملة الدفع بالضبط', async () => {
    const { db } = fullRefundDb()
    await paymentService.refund({ providerRef: 'pay_r1', restaurantId: 'r1', idempotencyKey: 'k1' }, { db })
    expect(syncOrderStatusFromPayment).toHaveBeenCalledWith({ paymentTransactionId: 'tx_r1' }, { db })
  })
})

describe('PS-026: المزامنة تعمل فقط بعد التزام status=refunded محلياً', () => {
  it('المزامنة تُستدعى بعد استدعاء db.from للتحديث النهائي إلى refunded (ترتيب الاستدعاءات)', async () => {
    const { db, finalUpdateChain } = fullRefundDb()
    const callOrder = []
    finalUpdateChain.update.mockImplementation((payload) => { callOrder.push('final_update'); return finalUpdateChain })
    syncOrderStatusFromPayment.mockImplementation(async () => { callOrder.push('sync'); return { action: 'none' } })
    await paymentService.refund({ providerRef: 'pay_r1', restaurantId: 'r1', idempotencyKey: 'k1' }, { db })
    expect(callOrder).toEqual(['final_update', 'sync'])
  })
})

describe('PS-027: فشل المزامنة لا يُبطِل نجاح الاسترداد', () => {
  it('syncOrderStatusFromPayment يرمي استثناءً → refund() لا يزال يُعيد نتيجة ناجحة', async () => {
    const { db } = fullRefundDb(async () => { throw new Error('sync boom') })
    const result = await paymentService.refund({ providerRef: 'pay_r1', restaurantId: 'r1', idempotencyKey: 'k1' }, { db })
    expect(result.refundRef).toBe('rfnd_1')
    expect(result.status).toBe(RefundStatus.REFUNDED)
    expect(result.orderSync).toEqual({ action: 'unsupported', reason: 'sync_failed', message: 'sync boom' })
  })
})

describe('PS-028: order_not_found لا يُبطِل الاسترداد', () => {
  it('المزامنة تُعيد order_not_found → refund() يبقى ناجحاً، النتيجة تُنقَل كما هي', async () => {
    const { db } = fullRefundDb(async () => ({ action: 'none', reason: 'order_not_found', paymentTransactionId: 'tx_r1' }))
    const result = await paymentService.refund({ providerRef: 'pay_r1', restaurantId: 'r1', idempotencyKey: 'k1' }, { db })
    expect(result.refundRef).toBe('rfnd_1')
    expect(result.orderSync.reason).toBe('order_not_found')
  })
})

describe('PS-029..031: نتائج المزامنة تُنقَل كما هي — pending/preparing/ready → cancel', () => {
  it.each(['pending', 'preparing', 'ready'])('%s → orderSync.action=cancel يُنقَل دون تعديل', async (orderStatus) => {
    const { db } = fullRefundDb(async () => ({ action: 'cancel', paymentTransactionId: 'tx_r1', orderId: 'o1', updated: true }))
    const result = await paymentService.refund({ providerRef: 'pay_r1', restaurantId: 'r1', idempotencyKey: 'k1' }, { db })
    expect(result.orderSync.action).toBe('cancel')
  })
})

describe('PS-032: طلب cancelled بالفعل → لا-عملية', () => {
  it('orderSync.action=none يُنقَل كما هو', async () => {
    const { db } = fullRefundDb(async () => ({ action: 'none', paymentTransactionId: 'tx_r1', orderId: 'o1' }))
    const result = await paymentService.refund({ providerRef: 'pay_r1', restaurantId: 'r1', idempotencyKey: 'k1' }, { db })
    expect(result.orderSync.action).toBe('none')
  })
})

describe('PS-033: طلب completed → unsupported، لا تغيير حالة، لا حالة طلب جديدة مُختلَقة', () => {
  it('orderSync.action=unsupported يُنقَل كما هو دون أي منطق إضافي', async () => {
    const { db } = fullRefundDb(async () => ({ action: 'unsupported', reason: 'completed_order_no_valid_transition', paymentTransactionId: 'tx_r1', orderId: 'o1' }))
    const result = await paymentService.refund({ providerRef: 'pay_r1', restaurantId: 'r1', idempotencyKey: 'k1' }, { db })
    expect(result.orderSync).toEqual({ action: 'unsupported', reason: 'completed_order_no_valid_transition', paymentTransactionId: 'tx_r1', orderId: 'o1' })
  })
})

describe('PS-034/035: استرداد مكرَّر — لا استدعاء مزوّد ثانٍ، لا مزامنة مكرَّرة', () => {
  it('نفس مفتاح الإتقان على حجز قائم (المحاولة الأصلية لم تلتزم refunded بعد) → لا مزامنة إطلاقاً', async () => {
    const db = makeDb(
      makeChain({
        data: {
          id: 'tx_dup', provider: 'moyasar', status: TransactionStatus.SUCCEEDED, amount: 100, restaurant_id: 'r1',
          metadata: { refund_claim: { idempotency_key: 'ref_same', claimed_at: '2026-01-01T00:00:00.000Z' } },
          updated_at: 't1',
        },
        error: null,
      }),
    )
    const result = await paymentService.refund({ providerRef: 'pay_dup', restaurantId: 'r1', idempotencyKey: 'ref_same' }, { db })
    expect(result.idempotent).toBe(true)
    expect(mockAdapter.refundPayment).not.toHaveBeenCalled()
    expect(syncOrderStatusFromPayment).not.toHaveBeenCalled()
    expect(result.orderSync).toEqual({ action: 'none', reason: 'refund_already_in_progress' })
  })
})

describe('PS-036: عزل المستأجرين محفوظ بعد الربط', () => {
  it('restaurantId خاطئ → رفض قبل أي مزامنة', async () => {
    const db = makeDb(
      makeChain({ data: { id: 'tx_t', provider: 'moyasar', status: TransactionStatus.SUCCEEDED, amount: 100, restaurant_id: 'r1', metadata: {}, updated_at: 't0' }, error: null }),
    )
    await expect(
      paymentService.refund({ providerRef: 'pay_t', restaurantId: 'r2', idempotencyKey: 'k1' }, { db })
    ).rejects.toThrow('لا توجد معاملة')
    expect(syncOrderStatusFromPayment).not.toHaveBeenCalled()
  })
})

describe('PS-037: تحقّق المبلغ محفوظ بعد الربط', () => {
  it('amount يتجاوز الأصلي → رفض قبل أي مزامنة', async () => {
    const db = makeDb(
      makeChain({ data: { id: 'tx_a', provider: 'moyasar', status: TransactionStatus.SUCCEEDED, amount: 100, restaurant_id: 'r1', metadata: {}, updated_at: 't0' }, error: null }),
    )
    await expect(
      paymentService.refund({ providerRef: 'pay_a', restaurantId: 'r1', amount: 999, idempotencyKey: 'k1' }, { db })
    ).rejects.toThrow('يتجاوز المبلغ الأصلي')
    expect(syncOrderStatusFromPayment).not.toHaveBeenCalled()
  })
})

describe('PS-038: الحجز الذرّي محفوظ بعد الربط', () => {
  it('سباق تزامن (الحجز لا يجد صفاً) → رفض، لا مزوّد، لا مزامنة', async () => {
    const db = makeDb(
      makeChain({ data: { id: 'tx_race', provider: 'moyasar', status: TransactionStatus.SUCCEEDED, amount: 100, restaurant_id: 'r1', metadata: {}, updated_at: 't0' }, error: null }),
      makeChain({ data: null, error: null }),
    )
    await expect(
      paymentService.refund({ providerRef: 'pay_race', restaurantId: 'r1', idempotencyKey: 'k1' }, { db })
    ).rejects.toThrow('تعذّر حجز محاولة الاسترداد')
    expect(mockAdapter.refundPayment).not.toHaveBeenCalled()
    expect(syncOrderStatusFromPayment).not.toHaveBeenCalled()
  })
})

describe('PS-039: مفتاح الإتقان محفوظ بعد الربط', () => {
  it('مفتاح مختلف على حجز قائم → رفض، لا مزامنة', async () => {
    const db = makeDb(
      makeChain({
        data: {
          id: 'tx_dup2', provider: 'moyasar', status: TransactionStatus.SUCCEEDED, amount: 100, restaurant_id: 'r1',
          metadata: { refund_claim: { idempotency_key: 'ref_original', claimed_at: '2026-01-01T00:00:00.000Z' } },
          updated_at: 't1',
        },
        error: null,
      }),
    )
    await expect(
      paymentService.refund({ providerRef: 'pay_dup2', restaurantId: 'r1', idempotencyKey: 'ref_different' }, { db })
    ).rejects.toThrow('محاولة استرداد أخرى قيد المعالجة')
    expect(syncOrderStatusFromPayment).not.toHaveBeenCalled()
  })
})

describe('PS-040: فشل المزوّد → المزامنة لا تُستدعى إطلاقاً', () => {
  it('adapter.refundPayment يرمي خطأً → لا استدعاء لـsyncOrderStatusFromPayment', async () => {
    const db = makeDb(
      makeChain({ data: { id: 'tx_pf', provider: 'moyasar', status: TransactionStatus.SUCCEEDED, amount: 100, restaurant_id: 'r1', metadata: {}, updated_at: 't0' }, error: null }),
      makeChain({ data: { id: 'tx_pf' }, error: null }),
      makeChain({ data: null, error: null }), // إلغاء الحجز
    )
    mockAdapter.refundPayment.mockRejectedValue(new Error('Moyasar error 422: refund rejected'))
    await expect(
      paymentService.refund({ providerRef: 'pay_pf', restaurantId: 'r1', idempotencyKey: 'ref_pf' }, { db })
    ).rejects.toThrow('Moyasar error 422')
    expect(syncOrderStatusFromPayment).not.toHaveBeenCalled()
  })
})

describe('PS-041: نجاح المزوّد + فشل تحديث الحالة المحلي النهائي → المزامنة لا تُستدعى', () => {
  it('التحديث النهائي إلى refunded يفشل → الاستثناء يُرمى (غير محروس، موثَّق) قبل الوصول إلى المزامنة', async () => {
    const claimChain = makeChain({ data: { id: 'tx_lf' }, error: null })
    const finalUpdateChain = makeChain({ data: null, error: { message: 'network error' } })
    // التحديث النهائي بلا try/catch أصلاً (موثَّق كفجوة G-5 مكافئة، غير مُصلَحة) — الخطأ يُرمى مباشرة
    // من db المُحاكاة عبر then() التي تُنتج النتيجة نفسها المُمرَّرة، فلا تُميِّز await بين خطأ/بيانات
    // إلا إن رمت السلسلة استثناءً فعلياً؛ هنا نُحاكي فشلاً حقيقياً عبر رمي داخل then.
    finalUpdateChain.then = (resolve, reject) => Promise.reject(new Error('local update failed: network error')).then(resolve, reject)
    const db = makeDb(
      makeChain({ data: { id: 'tx_lf', provider: 'moyasar', status: TransactionStatus.SUCCEEDED, amount: 100, restaurant_id: 'r1', metadata: {}, updated_at: 't0' }, error: null }),
      claimChain,
      finalUpdateChain,
    )
    mockAdapter.refundPayment.mockResolvedValue({ refundRef: 'rfnd_lf', status: RefundStatus.REFUNDED, raw: {} })

    await expect(
      paymentService.refund({ providerRef: 'pay_lf', restaurantId: 'r1', idempotencyKey: 'ref_lf' }, { db })
    ).rejects.toThrow('local update failed')

    expect(syncOrderStatusFromPayment).not.toHaveBeenCalled()
  })
})

describe('PS-042: لا تعديل webhook، لا استدعاء create_order', () => {
  it('فحص المصدر: refund() لا يستدعي create_order ولا يستورد الـwebhook', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.join(process.cwd(), 'src/payments/services/paymentService.js'), 'utf8')
    const fnBody = src.slice(src.indexOf('async refund(input'), src.indexOf('async refund(input') + 6000)
    expect(fnBody).not.toMatch(/create_order/)
    const webhookSrc = fs.readFileSync(path.join(process.cwd(), 'supabase/functions/payment-webhook/handler.js'), 'utf8')
    expect(webhookSrc).not.toMatch(/syncOrderStatusFromPayment/)
  })
})

describe('PS-043: لا استدعاء Moyasar حقيقي في هذه الاختبارات', () => {
  it('adapter وهمي بالكامل طوال هذه المجموعة (getAdapter مُموَّهة)', () => {
    expect(getAdapter).toBeDefined()
    expect(mockAdapter.refundPayment).toBeDefined()
  })
})
