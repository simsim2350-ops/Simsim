// TASK-PAY-3.6D.6-B — اختبارات paymentOrderCreationApi.js (غلاف supabase.functions.invoke رفيع).
import { describe, it, expect, vi, beforeEach } from 'vitest'

const invokeMock = vi.fn()
vi.mock('../../src/lib/supabase', () => ({
  supabase: { functions: { invoke: (...args) => invokeMock(...args) } },
}))

const { createOrderFromPayment } = await import('../../src/features/menu/paymentOrderCreationApi.js')

beforeEach(() => { vi.clearAllMocks() })

describe('createOrderFromPayment', () => {
  it('يستدعي supabase.functions.invoke بالاسم الصحيح والحمولة كما هي حرفياً', async () => {
    invokeMock.mockResolvedValue({ data: { status: 'succeeded', orderId: 'o1', orderNumber: 'ORD-1', accessToken: 'tok', idempotent: false }, error: null })
    const input = { paymentIdempotencyKey: 'pay_x', customerPhone: '512345678', restaurant_slug: 'koshary' }
    const result = await createOrderFromPayment(input)
    expect(invokeMock).toHaveBeenCalledWith('create-order-from-payment', { body: input })
    expect(result.status).toBe('succeeded')
    expect(result.orderId).toBe('o1')
  })

  it('استجابة ناجحة تُعاد كما هي حرفياً بلا تحويل', async () => {
    const data = { status: 'pending' }
    invokeMock.mockResolvedValue({ data, error: null })
    const result = await createOrderFromPayment({ paymentIdempotencyKey: 'pay_x' })
    expect(result).toEqual(data)
  })

  it('خطأ HTTP 400 (validation_error) يُستخرَج من جسم الخطأ إن أمكن', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', context: { json: async () => ({ status: 'validation_error' }) } },
    })
    const result = await createOrderFromPayment({ paymentIdempotencyKey: 'pay_x' })
    expect(result).toEqual({ status: 'validation_error' })
  })

  it('خطأ HTTP 500 يُعمَّم إلى internal_error بلا كشف رسالة خام', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: 'internal server exploded: secret leak', context: { json: async () => ({ error: 'internal_error' }) } },
    })
    const result = await createOrderFromPayment({ paymentIdempotencyKey: 'pay_x' })
    expect(result).toEqual({ status: 'internal_error' })
  })

  it('خطأ بلا context.json قابل للقراءة ⇒ internal_error عام، بلا انهيار', async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: 'network issue' } })
    const result = await createOrderFromPayment({ paymentIdempotencyKey: 'pay_x' })
    expect(result).toEqual({ status: 'internal_error' })
  })

  it('استثناء من invoke نفسها (رمي بدل رفض) ⇒ internal_error بلا انهيار', async () => {
    invokeMock.mockImplementation(() => { throw new Error('unexpected') })
    const result = await createOrderFromPayment({ paymentIdempotencyKey: 'pay_x' })
    expect(result).toEqual({ status: 'internal_error' })
  })

  it('لا رسالة خطأ خام تظهر أبداً في أي نتيجة', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: 'postgres://secret-leak', context: { json: async () => { throw new Error('bad json') } } },
    })
    const result = await createOrderFromPayment({ paymentIdempotencyKey: 'pay_x' })
    expect(JSON.stringify(result)).not.toContain('postgres://secret-leak')
  })
})
