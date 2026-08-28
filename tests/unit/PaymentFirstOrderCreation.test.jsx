// @vitest-environment happy-dom
//
// TASK-PAY-3.6D.6-B — اختبارات PaymentFirstOrderCreation (يوصل PaymentFirstCallbackLanding الحقيقية
// [غير مموَّهة — نفس نمط اختباراتها الخاصة، عبر db المُحقَنة] بـ create-order-from-payment [مموَّهة
// عبر createOrderFromPayment المُحقَنة، غير مُستدعاة عبر شبكة حقيقية أبداً هنا]).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PaymentFirstOrderCreation, { buildOrderCreationRequest } from '../../src/features/menu/PaymentFirstOrderCreation'
import { persistPaymentCustomerData, paymentCustomerDataStorageKey } from '../../src/features/menu/hooks/paymentCustomerDataHelpers'
import { paymentIdempotencyStorageKey } from '../../src/features/menu/hooks/cartHelpers'

const t = (key) => ({
  pfCallbackResolving: 'جارٍ التحقق من حالة الدفع…',
  pfCallbackMissingKey: 'تعذّر العثور على محاولة الدفع',
  pfCallbackMissingKeyBody: 'لم نتمكن من ربط هذه الصفحة بمحاولة دفع',
  pfCallbackPendingTitle: 'دفعتك لا تزال قيد التأكيد',
  pfCallbackPendingBody: 'قد يستغرق هذا لحظات',
  pfCallbackSucceededTitle: 'تم تأكيد الدفع بنجاح',
  pfCallbackFailedTitle: 'تعذّر إتمام الدفع',
  pfCallbackUnknownTitle: 'لم يتم العثور على هذه المحاولة',
  pfCallbackRetryableErrorTitle: 'حدث خطأ تقني أثناء التحقق',
  pfCallbackRetryAction: 'إعادة التحقق',
  pfOrderCreatingTitle: 'تم استلام الدفع، جاري تأكيد طلبك...',
  pfOrderCreatedTitle: 'تم تأكيد طلبك',
  pfOrderCreationFailedTitle: "تعذّر تأكيد طلبك تلقائياً",
  pfOrderCreationFailedBody: 'دفعتك ناجحة ومحفوظة',
  pfOrderRetryableErrorTitle: 'حدث خطأ مؤقت أثناء تأكيد الطلب',
  pfOrderRetryAction: 'إعادة محاولة تأكيد الطلب',
  pfOrderRequiresReconciliationTitle: 'طلبك قيد المراجعة',
  pfOrderRequiresReconciliationBody: 'دفعتك مسجَّلة',
  pfOrderNumberPrefix: 'رقم الطلب:',
  pfOrderTableContextPrefix: 'طاولة رقم',
  pfOrderNextStepGuidance: 'يمكنك متابعة حالة طلبك من صفحة طلباتي',
  pfOrderViewAction: 'عرض طلبي',
  backToMenu: '← العودة للمنيو',
}[key] || key)

const SLUG = 'koshary'
const BRANCH_ID = 'branch-a'
const RESUMED_KEY = 'pay_resumed-key-123'
const IDEM_STORAGE_KEY = paymentIdempotencyStorageKey(SLUG, BRANCH_ID)

function succeededDb(overrides = {}) {
  return { rpc: vi.fn(() => Promise.resolve({ data: [{ status: 'succeeded', amount: 45.5, currency: 'SAR', updated_at: '2026-08-27T10:00:00Z', ...overrides }], error: null })) }
}
function pendingDb() {
  return { rpc: vi.fn(() => Promise.resolve({ data: [{ status: 'pending', amount: 45.5, currency: 'SAR', updated_at: '2026-08-27T10:00:00Z' }], error: null })) }
}
function failedDb() {
  return { rpc: vi.fn(() => Promise.resolve({ data: [{ status: 'failed', amount: 45.5, currency: 'SAR', updated_at: '2026-08-27T10:00:00Z' }], error: null })) }
}

function setResumedKey() {
  localStorage.setItem(IDEM_STORAGE_KEY, RESUMED_KEY)
}
function setCustomerData(fields) {
  persistPaymentCustomerData(RESUMED_KEY, { type: 'takeaway', customerPhone: '512345678', ...fields })
}

function renderWrapper({ url = '/menu/koshary?payment_callback=pay_resumed-key-123', db, createOrderFromPayment, tableQrToken, restaurantName, onOrderCreated, onViewOrder, onRecover } = {}) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <PaymentFirstOrderCreation
        slug={SLUG} branchId={BRANCH_ID} tableQrToken={tableQrToken} db={db} restaurantName={restaurantName}
        createOrderFromPayment={createOrderFromPayment}
        onOrderCreated={onOrderCreated} onViewOrder={onViewOrder} onRecover={onRecover}
        t={t} isEn={false} brandColor="#FF6A00"
      />
    </MemoryRouter>
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})
afterEach(cleanup)

// ══════════════════════════════════════════════════════════════════
// buildOrderCreationRequest — دالة نقيّة (5-13)
// ══════════════════════════════════════════════════════════════════
describe('buildOrderCreationRequest (pure)', () => {
  it('5. يُرسِل customerPhone/customerName/notes الصحيحة من سجلّ العميل', () => {
    const body = buildOrderCreationRequest({
      resumedKey: RESUMED_KEY, slug: SLUG, tableQrToken: null,
      customerData: { customerPhone: '512345678', customerName: 'أحمد', notes: 'بدون بصل' },
    })
    expect(body).toMatchObject({ paymentIdempotencyKey: RESUMED_KEY, customerPhone: '512345678', customerName: 'أحمد', notes: 'بدون بصل', restaurant_slug: SLUG })
  })

  it('6. مسار QR: لا يُرسِل tableNumber أبداً حتى لو وُجد في سجلّ العميل', () => {
    const body = buildOrderCreationRequest({
      resumedKey: RESUMED_KEY, slug: SLUG, tableQrToken: 'qr-token-1',
      customerData: { customerPhone: '512345678', tableNumber: 'FORGED-99' },
    })
    expect(body).not.toHaveProperty('tableNumber')
  })

  it('7. مسار QR: يُرسِل table_qr_token، لا restaurant_slug', () => {
    const body = buildOrderCreationRequest({
      resumedKey: RESUMED_KEY, slug: SLUG, tableQrToken: 'qr-token-1',
      customerData: { customerPhone: '512345678' },
    })
    expect(body.table_qr_token).toBe('qr-token-1')
    expect(body).not.toHaveProperty('restaurant_slug')
  })

  it('8. مسار غير-QR: يُرسِل restaurant_slug — لا branch_id إطلاقاً في أي مكان', () => {
    const body = buildOrderCreationRequest({
      resumedKey: RESUMED_KEY, slug: SLUG, tableQrToken: null,
      customerData: { customerPhone: '512345678', tableNumber: '7' },
    })
    expect(body.restaurant_slug).toBe(SLUG)
    expect(body.tableNumber).toBe('7')
    expect(body).not.toHaveProperty('branch_id')
    expect(body).not.toHaveProperty('branchId')
  })

  it('9. paymentTransactionId لا يظهر أبداً في الحمولة', () => {
    const body = buildOrderCreationRequest({ resumedKey: RESUMED_KEY, slug: SLUG, tableQrToken: null, customerData: { customerPhone: '512345678', paymentTransactionId: 'FORGED' } })
    expect(body).not.toHaveProperty('paymentTransactionId')
  })

  it('10. providerRef لا يظهر أبداً في الحمولة', () => {
    const body = buildOrderCreationRequest({ resumedKey: RESUMED_KEY, slug: SLUG, tableQrToken: null, customerData: { customerPhone: '512345678', providerRef: 'FORGED' } })
    expect(body).not.toHaveProperty('providerRef')
  })

  it('11. amount لا يظهر أبداً في الحمولة', () => {
    const body = buildOrderCreationRequest({ resumedKey: RESUMED_KEY, slug: SLUG, tableQrToken: null, customerData: { customerPhone: '512345678', amount: 999 } })
    expect(body).not.toHaveProperty('amount')
  })

  it('12. currency لا يظهر أبداً في الحمولة', () => {
    const body = buildOrderCreationRequest({ resumedKey: RESUMED_KEY, slug: SLUG, tableQrToken: null, customerData: { customerPhone: '512345678', currency: 'USD' } })
    expect(body).not.toHaveProperty('currency')
  })

  it('13. items لا تظهر أبداً في الحمولة', () => {
    const body = buildOrderCreationRequest({ resumedKey: RESUMED_KEY, slug: SLUG, tableQrToken: null, customerData: { customerPhone: '512345678', items: [{ product_id: 'p1' }] } })
    expect(body).not.toHaveProperty('items')
  })

  it('11b. عنوان التوصيل يُرسَل عند وجوده (كلا المسارين)', () => {
    const body = buildOrderCreationRequest({ resumedKey: RESUMED_KEY, slug: SLUG, tableQrToken: null, customerData: { customerPhone: '512345678', deliveryAddress: 'حي النخيل' } })
    expect(body.deliveryAddress).toBe('حي النخيل')
  })
})

// ══════════════════════════════════════════════════════════════════
// السلوك التكاملي (1-4, 14-23)
// ══════════════════════════════════════════════════════════════════
describe('PaymentFirstOrderCreation — integration', () => {
  it('1/4. الدفع succeeded ⇒ يُستدعى create-order-from-payment ويظهر order_created', async () => {
    setResumedKey()
    setCustomerData({})
    const createOrderFromPayment = vi.fn().mockResolvedValue({ status: 'succeeded', orderId: 'order-1', orderNumber: 'ORD-0001', accessToken: 'tok-1', idempotent: false })
    renderWrapper({ db: succeededDb(), createOrderFromPayment })
    await waitFor(() => expect(screen.getByText('تم تأكيد طلبك')).toBeInTheDocument())
    expect(createOrderFromPayment).toHaveBeenCalledTimes(1)
    expect(createOrderFromPayment.mock.calls[0][0].paymentIdempotencyKey).toBe(RESUMED_KEY)
  })

  it('2/3/19. الدفع pending ⇒ لا يُستدعى create-order-from-payment أبداً', async () => {
    setResumedKey()
    setCustomerData({})
    const createOrderFromPayment = vi.fn()
    renderWrapper({ db: pendingDb(), createOrderFromPayment })
    await waitFor(() => expect(screen.getByText('دفعتك لا تزال قيد التأكيد')).toBeInTheDocument())
    expect(createOrderFromPayment).not.toHaveBeenCalled()
  })

  it('18. الدفع failed ⇒ لا يُستدعى create-order-from-payment أبداً، لا طلب يُنشأ', async () => {
    setResumedKey()
    setCustomerData({})
    const createOrderFromPayment = vi.fn()
    renderWrapper({ db: failedDb(), createOrderFromPayment })
    await waitFor(() => expect(screen.getByText('تعذّر إتمام الدفع')).toBeInTheDocument())
    expect(createOrderFromPayment).not.toHaveBeenCalled()
  })

  it('14. استدعاء onSucceeded مرّتين (نداء مزدوج) ⇒ create-order-from-payment مرة واحدة فقط', async () => {
    setResumedKey()
    setCustomerData({})
    // db.rpc يستمر بإرجاع succeeded على كل استدعاء — لو استُدعي onSucceeded أكثر من مرة داخلياً
    // (نظرياً عبر PaymentFirstCallbackLanding نفسها) attemptingRef يمنع محاولة ثانية طالما الأولى بدأت.
    const createOrderFromPayment = vi.fn(() => new Promise(() => {})) // لا يُحسم أبداً — يُبقي CREATING_ORDER
    renderWrapper({ db: succeededDb(), createOrderFromPayment })
    await waitFor(() => expect(createOrderFromPayment).toHaveBeenCalledTimes(1))
    // يبقى مستقراً على استدعاء واحد رغم إعادة عرض db.rpc نفس النتيجة عدة مرات محتملة
    await new Promise((r) => setTimeout(r, 20))
    expect(createOrderFromPayment).toHaveBeenCalledTimes(1)
  })

  it('15. idempotent:true يُعامَل كنجاح كامل — نفس شكل idempotent:false', async () => {
    setResumedKey()
    setCustomerData({})
    const onOrderCreated = vi.fn()
    const createOrderFromPayment = vi.fn().mockResolvedValue({ status: 'succeeded', orderId: 'order-1', orderNumber: 'ORD-0001', accessToken: 'tok-1', idempotent: true })
    renderWrapper({ db: succeededDb(), createOrderFromPayment, onOrderCreated })
    await waitFor(() => expect(screen.getByText('تم تأكيد طلبك')).toBeInTheDocument())
    expect(onOrderCreated).toHaveBeenCalledWith(expect.objectContaining({ status: 'succeeded', idempotent: true, orderId: 'order-1' }))
  })

  it('16. بعد order_created: كل من مفتاح الإتقان وسجلّ بيانات العميل يُمسحان من التخزين المحلي', async () => {
    setResumedKey()
    setCustomerData({})
    const createOrderFromPayment = vi.fn().mockResolvedValue({ status: 'succeeded', orderId: 'order-1', orderNumber: 'ORD-1', accessToken: 'tok-1', idempotent: false })
    renderWrapper({ db: succeededDb(), createOrderFromPayment })
    await waitFor(() => expect(screen.getByText('تم تأكيد طلبك')).toBeInTheDocument())
    expect(localStorage.getItem(IDEM_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(paymentCustomerDataStorageKey(RESUMED_KEY))).toBeNull()
  })

  it('17. إعادة محاولة إنشاء الطلب بعد retryable_error تستخدم نفس مفتاح الإتقان', async () => {
    setResumedKey()
    setCustomerData({})
    const createOrderFromPayment = vi.fn()
      .mockResolvedValueOnce({ status: 'retryable_error' })
      .mockResolvedValueOnce({ status: 'succeeded', orderId: 'order-1', orderNumber: 'ORD-1', accessToken: 'tok-1', idempotent: false })
    renderWrapper({ db: succeededDb(), createOrderFromPayment })
    const retryBtn = await screen.findByText('إعادة محاولة تأكيد الطلب')
    fireEvent.click(retryBtn)
    await waitFor(() => expect(createOrderFromPayment).toHaveBeenCalledTimes(2))
    expect(createOrderFromPayment.mock.calls[0][0].paymentIdempotencyKey).toBe(RESUMED_KEY)
    expect(createOrderFromPayment.mock.calls[1][0].paymentIdempotencyKey).toBe(RESUMED_KEY)
  })

  it('20. requires_reconciliation لا يظهر كنجاح طلب — رسالة محايدة فقط', async () => {
    setResumedKey()
    setCustomerData({})
    const onOrderCreated = vi.fn()
    const createOrderFromPayment = vi.fn().mockResolvedValue({ status: 'requires_reconciliation' })
    renderWrapper({ db: succeededDb(), createOrderFromPayment, onOrderCreated })
    await waitFor(() => expect(screen.getByText('طلبك قيد المراجعة')).toBeInTheDocument())
    expect(screen.queryByText('تم تأكيد طلبك')).not.toBeInTheDocument()
    expect(onOrderCreated).not.toHaveBeenCalled()
  })

  it('21/23. internal_error يُخفي التفاصيل الخام ويحافظ على سجلّ العميل', async () => {
    setResumedKey()
    setCustomerData({})
    const createOrderFromPayment = vi.fn().mockResolvedValue({ status: 'internal_error' })
    renderWrapper({ db: succeededDb(), createOrderFromPayment })
    await waitFor(() => expect(screen.getByText("تعذّر تأكيد طلبك تلقائياً")).toBeInTheDocument())
    expect(localStorage.getItem(paymentCustomerDataStorageKey(RESUMED_KEY))).not.toBeNull()
    expect(localStorage.getItem(IDEM_STORAGE_KEY)).not.toBeNull()
  })

  it('23b. validation_error أيضاً يحافظ على سجلّ العميل (لا إنشاء دفع ثانٍ، بيانات قابلة للاسترداد)', async () => {
    setResumedKey()
    setCustomerData({})
    const createOrderFromPayment = vi.fn().mockResolvedValue({ status: 'validation_error' })
    renderWrapper({ db: succeededDb(), createOrderFromPayment })
    await waitFor(() => expect(screen.getByText("تعذّر تأكيد طلبك تلقائياً")).toBeInTheDocument())
    expect(localStorage.getItem(paymentCustomerDataStorageKey(RESUMED_KEY))).not.toBeNull()
  })

  it('22. لا يُمسَح سجلّ بيانات العميل أثناء انتظار استجابة create-order-from-payment (قبل الحسم)', async () => {
    setResumedKey()
    setCustomerData({})
    let resolvePromise
    const createOrderFromPayment = vi.fn(() => new Promise((resolve) => { resolvePromise = resolve }))
    renderWrapper({ db: succeededDb(), createOrderFromPayment })
    await waitFor(() => expect(createOrderFromPayment).toHaveBeenCalled())
    // لا يزال معلَّقاً — السجلّ يجب أن يبقى كما هو
    expect(localStorage.getItem(paymentCustomerDataStorageKey(RESUMED_KEY))).not.toBeNull()
    resolvePromise({ status: 'succeeded', orderId: 'order-1', orderNumber: 'ORD-1', accessToken: 'tok-1', idempotent: false })
    await waitFor(() => expect(screen.getByText('تم تأكيد طلبك')).toBeInTheDocument())
    expect(localStorage.getItem(paymentCustomerDataStorageKey(RESUMED_KEY))).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════════
// TASK-PAY-3.6D.6-C — التأكيد النهائي الواضح للعميل (لا يظهر إلا بعد succeeded حقيقية من
// create-order-from-payment، ليس لمجرد نجاح الدفع؛ يبقى ظاهراً فعلياً بانتظار فعل صريح من العميل،
// لا انتقال صامت فوري يمنع رؤيته)
// ══════════════════════════════════════════════════════════════════
describe('PaymentFirstOrderCreation — final order confirmation (TASK-PAY-3.6D.6-C)', () => {
  it('يعرض رقم الطلب مسبوقاً بالتسمية الصحيحة، واسم المطعم إن وُجد، وإرشاد الخطوة التالية', async () => {
    setResumedKey()
    setCustomerData({})
    const createOrderFromPayment = vi.fn().mockResolvedValue({ status: 'succeeded', orderId: 'order-1', orderNumber: 'ORD-0042', accessToken: 'tok-1', idempotent: false })
    renderWrapper({ db: succeededDb(), createOrderFromPayment, restaurantName: 'مطعم كشري التحرير' })
    await waitFor(() => expect(screen.getByText('تم تأكيد طلبك')).toBeInTheDocument())
    expect(screen.getByText('مطعم كشري التحرير')).toBeInTheDocument()
    expect(screen.getByText('رقم الطلب: #ORD-0042')).toBeInTheDocument()
    expect(screen.getByText('يمكنك متابعة حالة طلبك من صفحة طلباتي')).toBeInTheDocument()
  })

  it('بلا restaurantName ⇒ لا يظهر اسم مطعم فارغ، بقية البطاقة تظهر طبيعياً', async () => {
    setResumedKey()
    setCustomerData({})
    const createOrderFromPayment = vi.fn().mockResolvedValue({ status: 'succeeded', orderId: 'order-1', orderNumber: 'ORD-1', accessToken: 'tok-1', idempotent: false })
    renderWrapper({ db: succeededDb(), createOrderFromPayment })
    await waitFor(() => expect(screen.getByText('تم تأكيد طلبك')).toBeInTheDocument())
    expect(screen.getByText('رقم الطلب: #ORD-1')).toBeInTheDocument()
  })

  it('غير-QR dine_in: رقم الطاولة (من سجلّ العميل) يظهر في بطاقة التأكيد كسياق عرضي فقط', async () => {
    setResumedKey()
    setCustomerData({ type: 'dine_in', tableNumber: '7' })
    const createOrderFromPayment = vi.fn().mockResolvedValue({ status: 'succeeded', orderId: 'order-1', orderNumber: 'ORD-1', accessToken: 'tok-1', idempotent: false })
    renderWrapper({ db: succeededDb(), createOrderFromPayment })
    await waitFor(() => expect(screen.getByText('تم تأكيد طلبك')).toBeInTheDocument())
    expect(screen.getByText('طاولة رقم 7')).toBeInTheDocument()
  })

  it('التأكيد يبقى ظاهراً فعلياً — لا ينتقل بصمت؛ زر "عرض طلبي" هو الفعل الصريح الوحيد للانتقال', async () => {
    setResumedKey()
    setCustomerData({})
    const onOrderCreated = vi.fn()
    const onViewOrder = vi.fn()
    const createOrderFromPayment = vi.fn().mockResolvedValue({ status: 'succeeded', orderId: 'order-1', orderNumber: 'ORD-1', accessToken: 'tok-1', idempotent: false })
    renderWrapper({ db: succeededDb(), createOrderFromPayment, onOrderCreated, onViewOrder })
    await waitFor(() => expect(screen.getByText('تم تأكيد طلبك')).toBeInTheDocument())
    // التسجيل (onOrderCreated) حدث فوراً — لكن الانتقال (onViewOrder) لم يُستدعَ بعد بلا فعل العميل
    expect(onOrderCreated).toHaveBeenCalledTimes(1)
    expect(onViewOrder).not.toHaveBeenCalled()
    // البطاقة لا تزال معروضة فعلياً في الـDOM بعد استقرار كل شيء — لم تُستبدَل بشيء آخر صامتاً
    expect(screen.getByText('تم تأكيد طلبك')).toBeInTheDocument()
    fireEvent.click(screen.getByText('عرض طلبي'))
    expect(onViewOrder).toHaveBeenCalledTimes(1)
    expect(onViewOrder).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'order-1', orderNumber: 'ORD-1', accessToken: 'tok-1' }))
  })

  it('idempotent:true يعرض نفس بطاقة التأكيد الكاملة (رقم الطلب/زر العرض) — نتيجة نهائية ناجحة أيضاً', async () => {
    setResumedKey()
    setCustomerData({})
    const onViewOrder = vi.fn()
    const createOrderFromPayment = vi.fn().mockResolvedValue({ status: 'succeeded', orderId: 'order-1', orderNumber: 'ORD-1', accessToken: 'tok-1', idempotent: true })
    renderWrapper({ db: succeededDb(), createOrderFromPayment, onViewOrder })
    await waitFor(() => expect(screen.getByText('تم تأكيد طلبك')).toBeInTheDocument())
    expect(screen.getByText('رقم الطلب: #ORD-1')).toBeInTheDocument()
    fireEvent.click(screen.getByText('عرض طلبي'))
    expect(onViewOrder).toHaveBeenCalledWith(expect.objectContaining({ idempotent: true }))
  })

  it('لا يُعرَض "تم تأكيد طلبك" لمجرد نجاح الدفع (قبل استلام رد create-order-from-payment)', async () => {
    setResumedKey()
    setCustomerData({})
    const createOrderFromPayment = vi.fn(() => new Promise(() => {})) // معلَّق للأبد — الدفع نجح لكن الطلب لم يُؤكَّد بعد
    renderWrapper({ db: succeededDb(), createOrderFromPayment })
    await waitFor(() => expect(createOrderFromPayment).toHaveBeenCalled())
    expect(screen.queryByText('تم تأكيد طلبك')).not.toBeInTheDocument()
    expect(screen.getByText('تم استلام الدفع، جاري تأكيد طلبك...')).toBeInTheDocument()
  })

  it('لا تُكشَف providerRef/paymentTransactionId في بطاقة التأكيد حتى لو وُجدتا في استجابة create-order-from-payment (دفاعي)', async () => {
    setResumedKey()
    setCustomerData({})
    const createOrderFromPayment = vi.fn().mockResolvedValue({
      status: 'succeeded', orderId: 'order-1', orderNumber: 'ORD-1', accessToken: 'tok-1', idempotent: false,
      providerRef: 'pay_leak_999', paymentTransactionId: 'internal-tx-leak',
    })
    const { container } = renderWrapper({ db: succeededDb(), createOrderFromPayment })
    await waitFor(() => expect(screen.getByText('تم تأكيد طلبك')).toBeInTheDocument())
    expect(container.textContent).not.toContain('pay_leak_999')
    expect(container.textContent).not.toContain('internal-tx-leak')
  })
})

// ══════════════════════════════════════════════════════════════════
// نقاء المصدر (29/30) — لا دفع ثانٍ، لا مفتاح إتقان جديد
// ══════════════════════════════════════════════════════════════════
describe('PaymentFirstOrderCreation — source purity', () => {
  it('29. لا استيراد/استدعاء لـstartCheckout أو initiatePaymentFirstCheckout أو checkoutOrchestration أو Moyasar', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.join(process.cwd(), 'src/features/menu/PaymentFirstOrderCreation.jsx'), 'utf8')
    const importLines = src.split('\n').filter((l) => l.trim().startsWith('import'))
    expect(importLines.join('\n')).not.toMatch(/startCheckout|initiatePaymentFirstCheckout|checkoutOrchestration|moyasar/i)
  })

  it('30. لا استيراد لـusePaymentIdempotencyKey (المولّدة) — القراءة فقط عبر useResumedPaymentIdempotencyKey', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.join(process.cwd(), 'src/features/menu/PaymentFirstOrderCreation.jsx'), 'utf8')
    const importLines = src.split('\n').filter((l) => l.trim().startsWith('import'))
    expect(importLines.join('\n')).not.toMatch(/(?<!useResumed)PaymentIdempotencyKey'/)
    expect(importLines.join('\n')).toMatch(/useResumedPaymentIdempotencyKey/)
    expect(src).not.toMatch(/crypto\.randomUUID/)
  })
})
