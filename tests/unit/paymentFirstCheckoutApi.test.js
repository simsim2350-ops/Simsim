// TASK-PAY-3.6D.10 — اختبارات paymentFirstCheckoutApi.js (غلاف supabase.functions.invoke رفيع
// لـ payment-first-checkout — نفس نمط paymentOrderCreationApi.test.js حرفياً).
import { describe, it, expect, vi, beforeEach } from 'vitest'

const invokeMock = vi.fn()
vi.mock('../../src/lib/supabase', () => ({
  supabase: { functions: { invoke: (...args) => invokeMock(...args) } },
}))

const { initiatePaymentFirstCheckoutViaApi } = await import('../../src/features/menu/paymentFirstCheckoutApi.js')

beforeEach(() => { vi.clearAllMocks() })

const BASE_INPUT = {
  paymentIdempotencyKey: 'pay_x',
  type: 'takeaway',
  items: [{ product_id: 'p1', quantity: 1 }],
  customer_phone: '512345678',
  restaurant_slug: 'koshary',
  branch_id: 'branch-1',
}

describe('initiatePaymentFirstCheckoutViaApi', () => {
  it('يستدعي supabase.functions.invoke بالاسم الصحيح', async () => {
    invokeMock.mockResolvedValue({ data: { status: 'succeeded', redirectUrl: 'https://moyasar.example/x' }, error: null })
    await initiatePaymentFirstCheckoutViaApi(BASE_INPUT)
    expect(invokeMock).toHaveBeenCalledWith('payment-first-checkout', { body: expect.any(Object) })
  })

  it('مسار غير-QR: يُرسِل restaurant_slug وbranch_id — لا restaurant_id إطلاقاً', async () => {
    invokeMock.mockResolvedValue({ data: { status: 'rejected', reason: 'tenant_not_found' }, error: null })
    await initiatePaymentFirstCheckoutViaApi(BASE_INPUT)
    const [, { body }] = invokeMock.mock.calls[0]
    expect(body.restaurant_slug).toBe('koshary')
    expect(body.branch_id).toBe('branch-1')
    expect(body).not.toHaveProperty('restaurant_id')
    expect(body).not.toHaveProperty('table_qr_token')
  })

  it('مسار QR: يُرسِل table_qr_token فقط — لا restaurant_slug ولا branch_id ولا table_number', async () => {
    invokeMock.mockResolvedValue({ data: { status: 'rejected', reason: 'tenant_not_found' }, error: null })
    await initiatePaymentFirstCheckoutViaApi({ ...BASE_INPUT, table_qr_token: 'qr-token-1', restaurant_slug: undefined, branch_id: undefined, table_number: 'FORGED' })
    const [, { body }] = invokeMock.mock.calls[0]
    expect(body.table_qr_token).toBe('qr-token-1')
    expect(body).not.toHaveProperty('restaurant_slug')
    expect(body).not.toHaveProperty('branch_id')
    expect(body).not.toHaveProperty('table_number')
  })

  it('paymentTransactionId/providerRef لا يظهران أبداً في الحمولة حتى لو وُجدا في input', async () => {
    invokeMock.mockResolvedValue({ data: { status: 'rejected', reason: 'tenant_not_found' }, error: null })
    await initiatePaymentFirstCheckoutViaApi({ ...BASE_INPUT, paymentTransactionId: 'FORGED-TX', providerRef: 'FORGED-REF' })
    const [, { body }] = invokeMock.mock.calls[0]
    expect(body).not.toHaveProperty('paymentTransactionId')
    expect(body).not.toHaveProperty('providerRef')
  })

  it('استجابة ناجحة تُعاد كما هي حرفياً بلا تحويل (نفس عقد initiatePaymentFirstCheckout)', async () => {
    const data = { status: 'succeeded', redirectUrl: 'https://moyasar.example/checkout/abc', total: 45.5, currency: 'SAR', paymentIdempotencyKey: 'pay_x' }
    invokeMock.mockResolvedValue({ data, error: null })
    const result = await initiatePaymentFirstCheckoutViaApi(BASE_INPUT)
    expect(result).toEqual(data)
  })

  it('price_changed تُعاد كما هي', async () => {
    const data = { status: 'price_changed', dryRun: { subtotal: 10, tax: 1.5, delivery_fee: 0, total: 11.5 } }
    invokeMock.mockResolvedValue({ data, error: null })
    const result = await initiatePaymentFirstCheckoutViaApi(BASE_INPUT)
    expect(result).toEqual(data)
  })

  it('خطأ HTTP 400 (invalid_request) يُصنَّف كـ rejected بلا كشف تفصيل', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: 'non-2xx', context: { json: async () => ({ error: 'invalid_request' }) } },
    })
    const result = await initiatePaymentFirstCheckoutViaApi(BASE_INPUT)
    expect(result).toEqual({ status: 'rejected', reason: 'invalid_request' })
  })

  it('خطأ HTTP 500 يُعمَّم إلى retryable_error بلا كشف رسالة خام', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: 'internal server exploded: secret leak', context: { json: async () => ({ error: 'internal_error' }) } },
    })
    const result = await initiatePaymentFirstCheckoutViaApi(BASE_INPUT)
    expect(result).toEqual({ status: 'retryable_error', reason: 'internal_error' })
    expect(JSON.stringify(result)).not.toContain('secret leak')
  })

  it('استثناء من invoke نفسها (رمي بدل رفض) ⇒ retryable_error بلا انهيار', async () => {
    invokeMock.mockImplementation(() => { throw new Error('network down') })
    const result = await initiatePaymentFirstCheckoutViaApi(BASE_INPUT)
    expect(result).toEqual({ status: 'retryable_error', reason: 'network_exception' })
  })
})
