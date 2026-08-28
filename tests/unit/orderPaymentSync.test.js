// TASK-PAY-3.6C.1/3.6C.2 — اختبارات decideOrderSyncAction وsyncOrderStatusFromPayment
// (src/payments/services/checkoutOrchestration.js). db وهمية بالكامل — بلا قاعدة بيانات حقيقية،
// بلا Moyasar، بلا webhook. 3.6C.3 (تكامل الاسترداد الفعلي) مؤجَّل عمداً — لا اختبار له هنا.
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { decideOrderSyncAction, syncOrderStatusFromPayment } from '../../src/payments/services/checkoutOrchestration.js'
import { TransactionStatus } from '../../src/payments/types/index.js'

const ORDER_STATUSES = ['pending', 'preparing', 'ready', 'completed', 'cancelled']
const NON_REFUND_PAYMENT_STATUSES = [
  TransactionStatus.INITIATED,
  TransactionStatus.PENDING,
  TransactionStatus.SUCCEEDED,
  TransactionStatus.FAILED,
  TransactionStatus.CANCELLED,
]

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
function makeDb({ fromChains = [] } = {}) {
  let fi = 0
  return { from: vi.fn().mockImplementation(() => fromChains[fi++] ?? makeChain()) }
}

const TX_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const RID = '11111111-1111-4111-8111-111111111111'
const RID_OTHER = '99999999-9999-4999-8999-999999999999'
const ORDER_ID = 'order-uuid-1'

beforeEach(() => vi.clearAllMocks())

// ══════════════════════════════════════════════════════════════════
// 3.6C.1 — decideOrderSyncAction (دالة نقيّة)
// ══════════════════════════════════════════════════════════════════

describe('SYNC-DECIDE: refunded + كل حالة طلب', () => {
  it('refunded + pending → cancel', () => {
    expect(decideOrderSyncAction(TransactionStatus.REFUNDED, 'pending')).toEqual({ action: 'cancel' })
  })
  it('refunded + preparing → cancel', () => {
    expect(decideOrderSyncAction(TransactionStatus.REFUNDED, 'preparing')).toEqual({ action: 'cancel' })
  })
  it('refunded + ready → cancel', () => {
    expect(decideOrderSyncAction(TransactionStatus.REFUNDED, 'ready')).toEqual({ action: 'cancel' })
  })
  it('refunded + completed → unsupported (لا انتقال صالح)', () => {
    const result = decideOrderSyncAction(TransactionStatus.REFUNDED, 'completed')
    expect(result.action).toBe('unsupported')
    expect(result.reason).toBeTruthy()
  })
  it('refunded + cancelled → none (إتقان — مُطابِق بالفعل)', () => {
    expect(decideOrderSyncAction(TransactionStatus.REFUNDED, 'cancelled')).toEqual({ action: 'none' })
  })
})

describe('SYNC-DECIDE: حالات دفع لا تتطلّب أي تغيير — none لكل حالة طلب', () => {
  it.each(NON_REFUND_PAYMENT_STATUSES.flatMap((ps) => ORDER_STATUSES.map((os) => [ps, os])))(
    '%s + %s → none',
    (paymentStatus, orderStatus) => {
      expect(decideOrderSyncAction(paymentStatus, orderStatus)).toEqual({ action: 'none' })
    }
  )
})

describe('SYNC-DECIDE: مُدخلات غير معروفة → unsupported', () => {
  it('حالة دفع غير معروفة', () => {
    const result = decideOrderSyncAction('totally_unknown_status', 'pending')
    expect(result.action).toBe('unsupported')
  })
  it('حالة طلب غير معروفة', () => {
    const result = decideOrderSyncAction(TransactionStatus.REFUNDED, 'totally_unknown_order_status')
    expect(result.action).toBe('unsupported')
  })
})

describe('SYNC-DECIDE: نقاء الدالة', () => {
  it('نفس المُدخل يُعيد نفس النتيجة دائماً، بلا حالة أو أثر جانبي', () => {
    for (let i = 0; i < 20; i++) {
      expect(decideOrderSyncAction(TransactionStatus.REFUNDED, 'preparing')).toEqual({ action: 'cancel' })
    }
  })
})

// ══════════════════════════════════════════════════════════════════
// 3.6C.2 — syncOrderStatusFromPayment
// ══════════════════════════════════════════════════════════════════

describe('SYNC-01: معاملة الدفع غير موجودة', () => {
  it('action=none، reason=payment_transaction_not_found', async () => {
    const db = makeDb({ fromChains: [makeChain({ data: null, error: null })] })
    const result = await syncOrderStatusFromPayment({ paymentTransactionId: TX_ID }, { db })
    expect(result.action).toBe('none')
    expect(result.reason).toBe('payment_transaction_not_found')
  })
})

describe('SYNC-02: لا طلب مرتبط بمعاملة الدفع', () => {
  it('action=none، reason=order_not_found — لا استدعاء create_order', async () => {
    const db = makeDb({
      fromChains: [
        makeChain({ data: { id: TX_ID, restaurant_id: RID, status: TransactionStatus.REFUNDED }, error: null }),
        makeChain({ data: null, error: null }),
      ],
    })
    const result = await syncOrderStatusFromPayment({ paymentTransactionId: TX_ID }, { db })
    expect(result.action).toBe('none')
    expect(result.reason).toBe('order_not_found')
  })
})

describe('SYNC-03: تناقض مطعم — لا تحديث', () => {
  it('action=none، reason=tenant_mismatch', async () => {
    const db = makeDb({
      fromChains: [
        makeChain({ data: { id: TX_ID, restaurant_id: RID, status: TransactionStatus.REFUNDED }, error: null }),
        makeChain({ data: { id: ORDER_ID, status: 'pending', restaurant_id: RID_OTHER }, error: null }),
      ],
    })
    const result = await syncOrderStatusFromPayment({ paymentTransactionId: TX_ID }, { db })
    expect(result.action).toBe('none')
    expect(result.reason).toBe('tenant_mismatch')
    expect(db.from).toHaveBeenCalledTimes(2) // لا محاولة تحديث ثالثة
  })
})

describe('SYNC-04/05/06: refunded + pending/preparing/ready → cancelled', () => {
  it.each(['pending', 'preparing', 'ready'])('refunded + %s → تحديث الطلب إلى cancelled', async (orderStatus) => {
    const updateChain = makeChain({ data: null, error: null })
    const db = makeDb({
      fromChains: [
        makeChain({ data: { id: TX_ID, restaurant_id: RID, status: TransactionStatus.REFUNDED }, error: null }),
        makeChain({ data: { id: ORDER_ID, status: orderStatus, restaurant_id: RID }, error: null }),
        updateChain,
      ],
    })
    const result = await syncOrderStatusFromPayment({ paymentTransactionId: TX_ID }, { db })
    expect(result.action).toBe('cancel')
    expect(result.orderId).toBe(ORDER_ID)
    expect(updateChain.update).toHaveBeenCalledWith({ status: 'cancelled' })
    expect(updateChain.eq).toHaveBeenCalledWith('id', ORDER_ID)
    expect(updateChain.eq).toHaveBeenCalledWith('restaurant_id', RID)
  })
})

describe('SYNC-07: refunded + completed → لا تحديث', () => {
  it('action=unsupported، لا استدعاء update', async () => {
    const db = makeDb({
      fromChains: [
        makeChain({ data: { id: TX_ID, restaurant_id: RID, status: TransactionStatus.REFUNDED }, error: null }),
        makeChain({ data: { id: ORDER_ID, status: 'completed', restaurant_id: RID }, error: null }),
      ],
    })
    const result = await syncOrderStatusFromPayment({ paymentTransactionId: TX_ID }, { db })
    expect(result.action).toBe('unsupported')
    expect(result.reason).toBe('completed_order_no_valid_transition')
    expect(db.from).toHaveBeenCalledTimes(2) // لا محاولة تحديث
  })
})

describe('SYNC-08: refunded + cancelled → لا-عملية (إتقان)', () => {
  it('action=none، لا استدعاء update', async () => {
    const db = makeDb({
      fromChains: [
        makeChain({ data: { id: TX_ID, restaurant_id: RID, status: TransactionStatus.REFUNDED }, error: null }),
        makeChain({ data: { id: ORDER_ID, status: 'cancelled', restaurant_id: RID }, error: null }),
      ],
    })
    const result = await syncOrderStatusFromPayment({ paymentTransactionId: TX_ID }, { db })
    expect(result.action).toBe('none')
    expect(db.from).toHaveBeenCalledTimes(2)
  })
})

describe('SYNC-09/10/11: succeeded/pending/failed → لا-عملية', () => {
  it.each([TransactionStatus.SUCCEEDED, TransactionStatus.PENDING, TransactionStatus.FAILED])(
    'دفع بحالة %s → action=none، لا تحديث',
    async (paymentStatus) => {
      const db = makeDb({
        fromChains: [
          makeChain({ data: { id: TX_ID, restaurant_id: RID, status: paymentStatus }, error: null }),
          makeChain({ data: { id: ORDER_ID, status: 'pending', restaurant_id: RID }, error: null }),
        ],
      })
      const result = await syncOrderStatusFromPayment({ paymentTransactionId: TX_ID }, { db })
      expect(result.action).toBe('none')
      expect(db.from).toHaveBeenCalledTimes(2)
    }
  )
})

describe('SYNC-12: استدعاء مكرَّر آمن (إتقان كامل)', () => {
  it('استدعاءان متتاليان — الأول يُلغي، الثاني لا يفعل شيئاً (الطلب أصبح cancelled فعلاً)', async () => {
    const updateChain = makeChain({ data: null, error: null })
    const db1 = makeDb({
      fromChains: [
        makeChain({ data: { id: TX_ID, restaurant_id: RID, status: TransactionStatus.REFUNDED }, error: null }),
        makeChain({ data: { id: ORDER_ID, status: 'pending', restaurant_id: RID }, error: null }),
        updateChain,
      ],
    })
    const first = await syncOrderStatusFromPayment({ paymentTransactionId: TX_ID }, { db: db1 })
    expect(first.action).toBe('cancel')

    // الاستدعاء الثاني: الطلب أصبح الآن cancelled فعلياً (نتيجة الاستدعاء الأول)
    const db2 = makeDb({
      fromChains: [
        makeChain({ data: { id: TX_ID, restaurant_id: RID, status: TransactionStatus.REFUNDED }, error: null }),
        makeChain({ data: { id: ORDER_ID, status: 'cancelled', restaurant_id: RID }, error: null }),
      ],
    })
    const second = await syncOrderStatusFromPayment({ paymentTransactionId: TX_ID }, { db: db2 })
    expect(second.action).toBe('none')
    expect(db2.from).toHaveBeenCalledTimes(2) // لا محاولة تحديث ثانية زائدة
  })
})

describe('SYNC-13: سباق تزامن حقيقي — invalid_order_transition يُصنَّف بأمان', () => {
  it('التحديث يُرفَض بواسطة enforce_order_transition → action=unsupported، لا فشل تطبيقي غير متوقَّع', async () => {
    const updateChain = makeChain({ data: null, error: { message: "invalid_order_transition: completed -> cancelled is not allowed" } })
    const db = makeDb({
      fromChains: [
        makeChain({ data: { id: TX_ID, restaurant_id: RID, status: TransactionStatus.REFUNDED }, error: null }),
        makeChain({ data: { id: ORDER_ID, status: 'pending', restaurant_id: RID }, error: null }), // pending وقت القراءة
        updateChain, // لكن تحرَّك الطلب فعلياً بين القراءة والتحديث (سباق) فرفضه المشغّل
      ],
    })
    const result = await syncOrderStatusFromPayment({ paymentTransactionId: TX_ID }, { db })
    expect(result.action).toBe('unsupported')
    expect(result.reason).toBe('invalid_order_transition')
    expect(result.message).toMatch(/invalid_order_transition/)
  })
})

describe('SYNC-14: لا استدعاء create_order إطلاقاً', () => {
  it('لا استدعاء db.rpc من هذه الدالة على الإطلاق (لا rpc في db الوهمية أصلاً)', async () => {
    const updateChain = makeChain({ data: null, error: null })
    const db = makeDb({
      fromChains: [
        makeChain({ data: { id: TX_ID, restaurant_id: RID, status: TransactionStatus.REFUNDED }, error: null }),
        makeChain({ data: { id: ORDER_ID, status: 'pending', restaurant_id: RID }, error: null }),
        updateChain,
      ],
    })
    await syncOrderStatusFromPayment({ paymentTransactionId: TX_ID }, { db })
    expect(db.rpc).toBeUndefined() // db الوهمية هنا لا تملك rpc أصلاً — إثبات عدم استدعائها إطلاقاً
  })
  it('فحص المصدر: لا create_order في جسم الدالة', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.join(process.cwd(), 'src/payments/services/checkoutOrchestration.js'), 'utf8')
    const fnBody = src.slice(src.indexOf('export async function syncOrderStatusFromPayment'))
    expect(fnBody).not.toMatch(/create_order/)
  })
})

describe('SYNC-15: لا استدعاء/تعديل webhook', () => {
  it('supabase/functions/payment-webhook/handler.js لا يستورد شيئاً من 3.6C', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.join(process.cwd(), 'supabase/functions/payment-webhook/handler.js'), 'utf8')
    expect(src).not.toMatch(/syncOrderStatusFromPayment|decideOrderSyncAction/)
  })
})

describe('SYNC-16: لا استدعاء paymentService.refund', () => {
  it('فحص المصدر: لا refund في جسم الدالة', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.join(process.cwd(), 'src/payments/services/checkoutOrchestration.js'), 'utf8')
    const fnBody = src.slice(src.indexOf('export async function syncOrderStatusFromPayment'))
    expect(fnBody).not.toMatch(/\.refund\(/)
  })
})

describe('SYNC-17/18: لا هوية مستأجر من العميل — المصدر الوحيد عمود معاملة الدفع', () => {
  it('حقن restaurant_id/order_id في input لا يؤثّر — لا يوجد أصلاً مُدخَل لهما في التوقيع', async () => {
    const updateChain = makeChain({ data: null, error: null })
    const db = makeDb({
      fromChains: [
        makeChain({ data: { id: TX_ID, restaurant_id: RID, status: TransactionStatus.REFUNDED }, error: null }),
        makeChain({ data: { id: ORDER_ID, status: 'pending', restaurant_id: RID }, error: null }),
        updateChain,
      ],
    })
    const result = await syncOrderStatusFromPayment(
      { paymentTransactionId: TX_ID, restaurant_id: RID_OTHER, order_id: 'INJECTED', provider_ref: 'INJECTED' },
      { db }
    )
    expect(result.action).toBe('cancel')
    // التحديث استخدم RID (عمود معاملة الدفع الفعلي)، لا RID_OTHER المحقون
    expect(updateChain.eq).toHaveBeenCalledWith('restaurant_id', RID)
  })
})
