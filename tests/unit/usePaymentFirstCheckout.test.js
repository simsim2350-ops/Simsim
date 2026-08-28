// TASK-PAY-3.6D.1 — اختبارات usePaymentFirstCheckout (src/features/menu/hooks/usePaymentFirstCheckout.js)
// orchestrate مُحاقَنة/وهمية دائماً هنا — لا استدعاء حقيقي لـinitiatePaymentFirstCheckout، لا قاعدة
// بيانات حقيقية، لا Moyasar. منطق التنسيق نفسه مُختبَر بمعزل تام في checkoutOrchestration.test.js.
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePaymentFirstCheckout, CheckoutState } from '../../src/features/menu/hooks/usePaymentFirstCheckout.js'

const FAKE_DB = { rpc: vi.fn(), from: vi.fn() } // db وهمية بحتة — لا يُستدعى منها شيء فعلياً هنا

function validCheckoutInput(overrides = {}) {
  return {
    restaurant_id: 'r1', branch_id: 'b1', type: 'dine_in', customer_phone: '512345678',
    items: [{ product_id: 'p1', quantity: 1, options: [] }], coupon_code: null,
    ...overrides,
  }
}

// ══════════════════════════════════════════════════════════════════
// PFC-01: الحالة الأولية
// ══════════════════════════════════════════════════════════════════

describe('PFC-01: الحالة الأولية', () => {
  it('idle، بلا نتيجة، بلا خطأ، isLoading=false', () => {
    const { result } = renderHook(() => usePaymentFirstCheckout({ db: FAKE_DB }))
    expect(result.current.state).toBe(CheckoutState.IDLE)
    expect(result.current.result).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════
// PFC-02/03: تنسيق ناجح — بلا/مع إعادة توجيه
// ══════════════════════════════════════════════════════════════════

describe('PFC-02: تنسيق ناجح بلا إعادة توجيه', () => {
  it('state=succeeded', async () => {
    const orchestrate = vi.fn().mockResolvedValue({
      status: 'succeeded', paymentTransactionId: 'tx1', providerRef: 'pay1',
      paymentStatus: 'succeeded', redirectUrl: null, idempotencyKey: 'k1', idempotent: false,
    })
    const { result } = renderHook(() => usePaymentFirstCheckout({ db: FAKE_DB, orchestrate }))
    await act(async () => { await result.current.startCheckout(validCheckoutInput()) })
    expect(result.current.state).toBe(CheckoutState.SUCCEEDED)
    expect(result.current.result.paymentTransactionId).toBe('tx1')
    expect(result.current.isLoading).toBe(false)
  })
})

describe('PFC-03: نتيجة تتطلّب إعادة توجيه', () => {
  it('state=redirect_required، redirectUrl محفوظ في result', async () => {
    const orchestrate = vi.fn().mockResolvedValue({
      status: 'succeeded', paymentTransactionId: 'tx2', providerRef: 'pay2',
      paymentStatus: 'initiated', redirectUrl: 'https://pay.moyasar.example/x', idempotencyKey: 'k2', idempotent: false,
    })
    const { result } = renderHook(() => usePaymentFirstCheckout({ db: FAKE_DB, orchestrate }))
    await act(async () => { await result.current.startCheckout(validCheckoutInput()) })
    expect(result.current.state).toBe(CheckoutState.REDIRECT_REQUIRED)
    expect(result.current.result.redirectUrl).toBe('https://pay.moyasar.example/x')
  })
})

// ══════════════════════════════════════════════════════════════════
// PFC-04: تغيّر السعر
// ══════════════════════════════════════════════════════════════════

describe('PFC-04: price_changed', () => {
  it('state=price_changed، dryRun{subtotal,tax,delivery_fee,total} محفوظة كاملة', async () => {
    const orchestrate = vi.fn().mockResolvedValue({
      status: 'price_changed', idempotencyKey: 'k3',
      dryRun: { subtotal: 43.48, tax: 6.52, delivery_fee: 0, total: 50, price_changes: [{ client_total: 40, server_total: 50 }] },
    })
    const { result } = renderHook(() => usePaymentFirstCheckout({ db: FAKE_DB, orchestrate }))
    await act(async () => { await result.current.startCheckout(validCheckoutInput()) })
    expect(result.current.state).toBe(CheckoutState.PRICE_CHANGED)
    expect(result.current.result.dryRun).toEqual({ subtotal: 43.48, tax: 6.52, delivery_fee: 0, total: 50, price_changes: [{ client_total: 40, server_total: 50 }] })
  })
})

// ══════════════════════════════════════════════════════════════════
// PFC-05: فشل
// ══════════════════════════════════════════════════════════════════

describe('PFC-05: failed', () => {
  it('state=failed، reason/message محفوظان', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'failed', reason: 'provider_failed', message: 'Moyasar error 422: card declined', idempotencyKey: 'k4' })
    const { result } = renderHook(() => usePaymentFirstCheckout({ db: FAKE_DB, orchestrate }))
    await act(async () => { await result.current.startCheckout(validCheckoutInput()) })
    expect(result.current.state).toBe(CheckoutState.FAILED)
    expect(result.current.result.reason).toBe('provider_failed')
  })
})

// ══════════════════════════════════════════════════════════════════
// PFC-06: مطابقة لاحقة — يجب ألا تتحوّل إلى failed
// ══════════════════════════════════════════════════════════════════

describe('PFC-06: requires_reconciliation لا يتحوّل أبداً إلى failed', () => {
  it('state=requires_reconciliation بالضبط', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'requires_reconciliation', idempotencyKey: 'k5', message: 'ambiguous' })
    const { result } = renderHook(() => usePaymentFirstCheckout({ db: FAKE_DB, orchestrate }))
    await act(async () => { await result.current.startCheckout(validCheckoutInput()) })
    expect(result.current.state).toBe(CheckoutState.REQUIRES_RECONCILIATION)
    expect(result.current.state).not.toBe(CheckoutState.FAILED)
  })
})

// ══════════════════════════════════════════════════════════════════
// PFC-07: استثناء خلفي غير متوقَّع
// ══════════════════════════════════════════════════════════════════

describe('PFC-07: orchestrate يرمي استثناءً', () => {
  it('state=failed، error.reason=unexpected_exception، لا رسالة خام مباشرة كنتيجة أساسية', async () => {
    const orchestrate = vi.fn().mockRejectedValue(new Error('network exploded'))
    const { result } = renderHook(() => usePaymentFirstCheckout({ db: FAKE_DB, orchestrate }))
    await act(async () => { await result.current.startCheckout(validCheckoutInput()) })
    expect(result.current.state).toBe(CheckoutState.FAILED)
    expect(result.current.error).toEqual({ reason: 'unexpected_exception', internalMessage: 'network exploded' })
    expect(result.current.result).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════════
// PFC-08: إعادة الضبط
// ══════════════════════════════════════════════════════════════════

describe('PFC-08: reset()', () => {
  it('يعيد الحالة إلى idle، يمسح result/error', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'failed', reason: 'provider_failed', idempotencyKey: 'k6' })
    const { result } = renderHook(() => usePaymentFirstCheckout({ db: FAKE_DB, orchestrate }))
    await act(async () => { await result.current.startCheckout(validCheckoutInput()) })
    expect(result.current.state).toBe(CheckoutState.FAILED)
    act(() => { result.current.reset() })
    expect(result.current.state).toBe(CheckoutState.IDLE)
    expect(result.current.result).toBeNull()
    expect(result.current.error).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════════
// PFC-09: مفتاح إتقان مُرسَل من المستدعي يُمرَّر دون تغيير
// ══════════════════════════════════════════════════════════════════

describe('PFC-09: paymentIdempotencyKey من المستدعي يُمرَّر كما هو', () => {
  it('نفس القيمة بالضبط تصل إلى orchestrate، بلا توليد جديد', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'succeeded', paymentTransactionId: 't', providerRef: 'p', paymentStatus: 'succeeded', redirectUrl: null, idempotencyKey: 'CALLER_KEY_123', idempotent: false })
    const { result } = renderHook(() => usePaymentFirstCheckout({ db: FAKE_DB, orchestrate }))
    const input = validCheckoutInput({ paymentIdempotencyKey: 'CALLER_KEY_123' })
    await act(async () => { await result.current.startCheckout(input) })
    expect(orchestrate).toHaveBeenCalledWith(
      expect.objectContaining({ paymentIdempotencyKey: 'CALLER_KEY_123' }),
      { db: FAKE_DB }
    )
  })

  it('استدعاءان متتاليان بنفس checkoutInput (نفس المفتاح) → المفتاح لا يتغيّر بين الاستدعاءين', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'failed', reason: 'provider_failed', idempotencyKey: 'STABLE_KEY' })
    const { result } = renderHook(() => usePaymentFirstCheckout({ db: FAKE_DB, orchestrate }))
    const input = validCheckoutInput({ paymentIdempotencyKey: 'STABLE_KEY' })
    await act(async () => { await result.current.startCheckout(input) })
    await act(async () => { await result.current.startCheckout(input) })
    expect(orchestrate.mock.calls[0][0].paymentIdempotencyKey).toBe('STABLE_KEY')
    expect(orchestrate.mock.calls[1][0].paymentIdempotencyKey).toBe('STABLE_KEY')
  })
})

// ══════════════════════════════════════════════════════════════════
// PFC-10..12: فحوصات مصدر ثابتة — لا create_order، لا paymentService مباشرة، لا Moyasar
// ══════════════════════════════════════════════════════════════════

describe('PFC-10/11/12: لا استدعاء مباشر لـcreate_order أو paymentService أو Moyasar', () => {
  it('فحص أسطر import: الاستيراد الوحيد من طبقة الدفع هو initiatePaymentFirstCheckout', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.join(process.cwd(), 'src/features/menu/hooks/usePaymentFirstCheckout.js'), 'utf8')
    const importLines = src.split('\n').filter((line) => /^\s*import\b/.test(line))
    const paymentImportLines = importLines.filter((line) => line.includes('payments/services'))
    expect(paymentImportLines).toHaveLength(1)
    expect(paymentImportLines[0]).toMatch(/initiatePaymentFirstCheckout/)
    expect(paymentImportLines[0]).not.toMatch(/paymentService|startCharge/)
  })
  it('لا استدعاء db.rpc(\'create_order\'...) ولا موجّه Moyasar داخل هذا الملف', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.join(process.cwd(), 'src/features/menu/hooks/usePaymentFirstCheckout.js'), 'utf8')
    expect(src).not.toMatch(/create_order/)
    const importLines = src.split('\n').filter((line) => /^\s*import\b/.test(line))
    for (const line of importLines) expect(line).not.toMatch(/moyasar/i)
  })
})

// ══════════════════════════════════════════════════════════════════
// PFC-13/14: السلطة الخادمية للمبلغ — لا حساب سعر عميل
// ══════════════════════════════════════════════════════════════════

describe('PFC-13: المبلغ الرسمي يأتي من نتيجة الخلفية فقط', () => {
  it('total يظهر فقط ضمن result.dryRun (price_changed) من استجابة orchestrate، لا من أي حساب محلي', async () => {
    const orchestrate = vi.fn().mockResolvedValue({
      status: 'price_changed', idempotencyKey: 'k7',
      dryRun: { subtotal: 8.7, tax: 1.3, delivery_fee: 0, total: 10, price_changes: [] },
    })
    const { result } = renderHook(() => usePaymentFirstCheckout({ db: FAKE_DB, orchestrate }))
    await act(async () => { await result.current.startCheckout(validCheckoutInput()) })
    expect(result.current.result.dryRun.total).toBe(10)
  })
})

describe('PFC-14: لا حساب سعر جانب العميل يُستخدَم للدفع', () => {
  it('فحص مصدر: لا cartTotal/discountAmount/deliveryFee في هذا الملف إطلاقاً', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.join(process.cwd(), 'src/features/menu/hooks/usePaymentFirstCheckout.js'), 'utf8')
    expect(src).not.toMatch(/cartTotal|discountAmount|deliveryFee/)
  })
  it('checkoutInput يُمرَّر إلى orchestrate كما هو حرفياً — بلا حقول مُضافة أو مُحوَّلة', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'failed', reason: 'provider_failed', idempotencyKey: 'k8' })
    const { result } = renderHook(() => usePaymentFirstCheckout({ db: FAKE_DB, orchestrate }))
    const input = validCheckoutInput({ clientTotal: 999 }) // حقل موجود في العقد الفعلي، استشاري فقط
    await act(async () => { await result.current.startCheckout(input) })
    expect(orchestrate).toHaveBeenCalledWith(input, { db: FAKE_DB })
  })
})
