// @vitest-environment happy-dom
//
// TASK-PAY-3.6D.10 — اختبارات الإضافات الجديدة فقط في useCheckout.js: paymentMethod،
// startPaymentFirstCheckout، cancelPaymentFirstCheckout. لا يعيد اختبار placeOrder/submitOrder/
// confirmPriceUpdate الموجودة أصلاً (غير مُعدَّلة هنا إطلاقاً — إعادة اختبارها هنا تكرار بلا فائدة).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const toastErrorMock = vi.fn()
vi.mock('react-hot-toast', () => ({ toast: { error: (...a) => toastErrorMock(...a) } }))
vi.mock('../../src/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

const { useCheckout } = await import('../../src/features/menu/hooks/useCheckout.js')

const t = (key) => key

function baseArgs(overrides = {}) {
  return {
    slug: 'koshary',
    restaurant: { id: 'rest-1' },
    branch: { id: 'branch-1', is_open: true },
    cart: [{ id: 'p1', qty: 2, note: '', selectedOptions: [] }],
    cartTotal: 45.5,
    setCart: vi.fn(), setCartOpen: vi.fn(), setActiveOrders: vi.fn(), setOrderPlaced: vi.fn(),
    t, isEn: false,
    appliedCoupon: null, discountAmount: 0, removeCoupon: vi.fn(),
    tableQr: null, idempotencyKey: 'idem-1',
    ...overrides,
  }
}

beforeEach(() => { vi.clearAllMocks() })

describe('useCheckout — payment-first additions (TASK-PAY-3.6D.10)', () => {
  it('paymentMethod يبدأ بـ"cash" افتراضياً', () => {
    const { result } = renderHook(() => useCheckout(baseArgs()))
    expect(result.current.paymentMethod).toBe('cash')
    expect(result.current.paymentFirstCheckoutInput).toBeNull()
  })

  it('سلة فارغة ⇒ رفض بدء الدفع أولاً، بلا لقطة', () => {
    const { result } = renderHook(() => useCheckout(baseArgs({ cart: [] })))
    act(() => { result.current.startPaymentFirstCheckout() })
    expect(result.current.paymentFirstCheckoutInput).toBeNull()
    expect(toastErrorMock).toHaveBeenCalled()
  })

  it('هاتف مفقود/غير صالح ⇒ رفض بدء الدفع أولاً', () => {
    const { result: r1 } = renderHook(() => useCheckout(baseArgs()))
    act(() => { r1.current.setCustomerPhone(''); })
    act(() => { r1.current.startPaymentFirstCheckout() })
    expect(r1.current.paymentFirstCheckoutInput).toBeNull()
  })

  it('غير-QR dine_in بلا رقم طاولة ⇒ رفض', () => {
    const { result } = renderHook(() => useCheckout(baseArgs()))
    act(() => { result.current.setCustomerPhone('512345678') })
    act(() => { result.current.setOrderType('dine_in') })
    act(() => { result.current.startPaymentFirstCheckout() })
    expect(result.current.paymentFirstCheckoutInput).toBeNull()
  })

  it('takeaway صالح ⇒ يبني لقطة صحيحة: restaurant_slug/branch_id، لا table_qr_token', () => {
    const { result } = renderHook(() => useCheckout(baseArgs()))
    act(() => {
      result.current.setCustomerPhone('512345678')
      result.current.setOrderType('takeaway')
    })
    act(() => { result.current.startPaymentFirstCheckout() })
    const snap = result.current.paymentFirstCheckoutInput
    expect(snap).not.toBeNull()
    expect(snap.type).toBe('takeaway')
    expect(snap.restaurant_slug).toBe('koshary')
    expect(snap.branch_id).toBe('branch-1')
    expect(snap.table_qr_token).toBeUndefined()
    expect(snap.customer_phone).toBe('512345678')
    expect(snap.items).toEqual([{ product_id: 'p1', quantity: 2, notes: '', options: [] }])
  })

  it('delivery صالح ⇒ يتضمّن delivery_address، لا table_number', () => {
    const { result } = renderHook(() => useCheckout(baseArgs()))
    act(() => {
      result.current.setCustomerPhone('512345678')
      result.current.setOrderType('delivery')
      result.current.setDeliveryAddress('حي النخيل')
    })
    act(() => { result.current.startPaymentFirstCheckout() })
    const snap = result.current.paymentFirstCheckoutInput
    expect(snap.type).toBe('delivery')
    expect(snap.delivery_address).toBe('حي النخيل')
    expect(snap.table_number).toBeUndefined()
  })

  it('dine_in غير-QR صالح ⇒ يتضمّن table_number', () => {
    const { result } = renderHook(() => useCheckout(baseArgs()))
    act(() => {
      result.current.setCustomerPhone('512345678')
      result.current.setOrderType('dine_in')
      result.current.setTableNumber('7')
    })
    act(() => { result.current.startPaymentFirstCheckout() })
    expect(result.current.paymentFirstCheckoutInput.table_number).toBe('7')
  })

  it('مسار QR: يبني table_qr_token من tableQr.token — لا restaurant_slug ولا branch_id ولا table_number', () => {
    const { result } = renderHook(() => useCheckout(baseArgs({ tableQr: { token: 'qr-token-1', tableName: '5', branchId: 'branch-qr' } })))
    act(() => { result.current.setCustomerPhone('512345678') })
    act(() => { result.current.startPaymentFirstCheckout() })
    const snap = result.current.paymentFirstCheckoutInput
    expect(snap.type).toBe('dine_in')
    expect(snap.table_qr_token).toBe('qr-token-1')
    expect(snap.restaurant_slug).toBeUndefined()
    expect(snap.branch_id).toBeUndefined()
    expect(snap.table_number).toBeUndefined()
  })

  it('paymentTransactionId/providerRef/amount/currency لا تظهر أبداً في اللقطة', () => {
    const { result } = renderHook(() => useCheckout(baseArgs()))
    act(() => {
      result.current.setCustomerPhone('512345678')
      result.current.setOrderType('takeaway')
    })
    act(() => { result.current.startPaymentFirstCheckout() })
    const snap = result.current.paymentFirstCheckoutInput
    expect(snap).not.toHaveProperty('paymentTransactionId')
    expect(snap).not.toHaveProperty('providerRef')
    expect(snap).not.toHaveProperty('amount')
    expect(snap).not.toHaveProperty('currency')
  })

  it('محاولة قائمة بالفعل ⇒ استدعاء ثانٍ لا يُغيِّر اللقطة (لا محاولة دفع ثانية)', () => {
    const { result } = renderHook(() => useCheckout(baseArgs()))
    act(() => {
      result.current.setCustomerPhone('512345678')
      result.current.setOrderType('takeaway')
    })
    act(() => { result.current.startPaymentFirstCheckout() })
    const first = result.current.paymentFirstCheckoutInput
    act(() => { result.current.setOrderNote('لاحقاً') }) // تغيير نموذج لاحق لا يجب أن يُعاد بناء اللقطة بسببه
    act(() => { result.current.startPaymentFirstCheckout() })
    expect(result.current.paymentFirstCheckoutInput).toBe(first) // نفس المرجع — لا إعادة بناء
  })

  it('cancelPaymentFirstCheckout يُعيد اللقطة إلى null', () => {
    const { result } = renderHook(() => useCheckout(baseArgs()))
    act(() => {
      result.current.setCustomerPhone('512345678')
      result.current.setOrderType('takeaway')
    })
    act(() => { result.current.startPaymentFirstCheckout() })
    expect(result.current.paymentFirstCheckoutInput).not.toBeNull()
    act(() => { result.current.cancelPaymentFirstCheckout() })
    expect(result.current.paymentFirstCheckoutInput).toBeNull()
  })

  it('multi-branch: branch_id في اللقطة يطابق branch.id المُمرَّر فعلياً (لا فرع افتراضي مُخترَع)', () => {
    const { result } = renderHook(() => useCheckout(baseArgs({ branch: { id: 'branch-secondary', is_open: true } })))
    act(() => {
      result.current.setCustomerPhone('512345678')
      result.current.setOrderType('takeaway')
    })
    act(() => { result.current.startPaymentFirstCheckout() })
    expect(result.current.paymentFirstCheckoutInput.branch_id).toBe('branch-secondary')
  })
})
