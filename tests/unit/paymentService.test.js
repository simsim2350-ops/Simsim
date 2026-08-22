// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock adapter registry BEFORE importing paymentService
vi.mock('../../src/payments/adapters/index.js', () => ({
  getAdapter: vi.fn(),
}))

import { paymentService } from '../../src/payments/services/paymentService.js'
import { getAdapter } from '../../src/payments/adapters/index.js'
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

describe('PS-017: refund — رفض الاسترداد إذا كانت الحالة ليست succeeded', () => {
  it('يرمي خطأ إذا كانت المعاملة بحالة failed', async () => {
    const db = makeDb(
      makeChain({ data: { id: 'tx_fail2', provider: 'moyasar', status: TransactionStatus.FAILED, amount: 100 }, error: null }),
    )

    await expect(
      paymentService.refund({ providerRef: 'pay_fail', idempotencyKey: 'ref_k2' }, { db })
    ).rejects.toThrow('لا يمكن استرداد معاملة بحالة failed')

    expect(mockAdapter.refundPayment).not.toHaveBeenCalled()
  })
})

describe('PS-018: refund — المسار الصحيح', () => {
  it('يستدعي adapter.refundPayment ويُحدِّث الصف إلى REFUNDED', async () => {
    const db = makeDb(
      makeChain({ data: { id: 'tx_succ', provider: 'moyasar', status: TransactionStatus.SUCCEEDED, amount: 200 }, error: null }),
      makeChain({ data: null, error: null }), // update to refunded
    )

    mockAdapter.refundPayment.mockResolvedValue({
      refundRef: 'rfnd_ok',
      status: RefundStatus.REFUNDED,
      raw: { id: 'rfnd_ok', status: 'refunded' },
    })

    const result = await paymentService.refund(
      { providerRef: 'pay_succ', amount: 200, reason: 'customer request', idempotencyKey: 'ref_k3' },
      { db }
    )

    expect(result.transactionId).toBe('tx_succ')
    expect(result.refundRef).toBe('rfnd_ok')
    expect(result.status).toBe(RefundStatus.REFUNDED)
    expect(mockAdapter.refundPayment).toHaveBeenCalledWith(expect.objectContaining({ providerRef: 'pay_succ' }))
    expect(db.from).toHaveBeenCalledTimes(2)
  })
})
