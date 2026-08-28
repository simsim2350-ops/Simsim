// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import PaymentFirstCheckoutPanel from '../../src/features/menu/PaymentFirstCheckoutPanel'
import { CheckoutState } from '../../src/features/menu/hooks/usePaymentFirstCheckout'
import { paymentCustomerDataStorageKey, readPaymentCustomerData } from '../../src/features/menu/hooks/paymentCustomerDataHelpers'

const t = (key) => ({
  pfCheckingPrice: 'جارٍ التحقق من السعر النهائي…',
  pfProcessingPayment: 'جارٍ إعداد الدفع…',
  pfCannotProceedTitle: 'تعذّر إتمام الطلب',
  pfBackAction: 'رجوع',
  priceChangedTitle: 'تغيّر السعر منذ آخر مرة راجعت فيها السلة',
  priceChangedUpdateBtn: 'حدّث وتابع',
  totalVat: 'المجموع (شامل الضريبة)',
  vatLine: '· منها ض.ق.م 15%',
  deliveryFee: '🛵 رسوم التوصيل',
}[key] || key)

function deferred() {
  let resolve
  const promise = new Promise((res) => { resolve = res })
  return { promise, resolve }
}

const checkoutInput = {
  restaurant_id: 'r1', branch_id: 'b1', type: 'dine_in', customer_phone: '512345678',
  items: [{ product_id: 'p1', quantity: 1, options: [] }], coupon_code: null,
}

const defaultProps = {
  slug: 'koshary',
  branchId: 'branch-a',
  checkoutInput,
  db: {},
  t, isEn: false, brandColor: '#FF6A00',
  onOutcome: vi.fn(),
  onCancelled: vi.fn(),
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

afterEach(cleanup)

describe('PaymentFirstCheckoutPanel', () => {
  it('PFCP-01: يبدأ التحقّق تلقائياً عند التركيب — orchestrate تُستدعى مرة واحدة بمفتاح إتقان مُولَّد', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'rejected', reason: 'tenant_not_found' })
    render(<PaymentFirstCheckoutPanel {...defaultProps} orchestrate={orchestrate} />)
    await waitFor(() => expect(orchestrate).toHaveBeenCalledTimes(1))
    const [input] = orchestrate.mock.calls[0]
    expect(input.restaurant_id).toBe('r1')
    expect(typeof input.paymentIdempotencyKey).toBe('string')
    expect(input.paymentIdempotencyKey.length).toBeGreaterThan(0)
  })

  it('PFCP-02: أثناء الفحص الأول (قبل أي تأكيد) يعرض "جارٍ التحقق من السعر النهائي" — عبر PaymentFirstPriceConfirmation', async () => {
    const { promise } = deferred()
    const orchestrate = vi.fn().mockReturnValue(promise)
    render(<PaymentFirstCheckoutPanel {...defaultProps} orchestrate={orchestrate} />)
    await waitFor(() => expect(screen.getByText('جارٍ التحقق من السعر النهائي…')).toBeInTheDocument())
  })

  it('PFCP-03: PRICE_CHANGED يعرض السعر السلطوي؛ "حدّث وتابع" يعيد الاستدعاء بنفس مفتاح الإتقان وclientTotal=dryRun.total', async () => {
    const dryRun = { subtotal: 20, tax: 3, delivery_fee: 0, total: 23, price_changes: [{ client_total: 20, server_total: 23 }] }
    const orchestrate = vi.fn()
      .mockResolvedValueOnce({ status: 'price_changed', dryRun })
      .mockResolvedValueOnce({ status: 'succeeded', paymentTransactionId: 'tx1', providerRef: 'p1', paymentStatus: 'pending', redirectUrl: null })

    render(<PaymentFirstCheckoutPanel {...defaultProps} orchestrate={orchestrate} />)
    await waitFor(() => expect(screen.getByText('23.00 ﷼')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'حدّث وتابع' }))
    await waitFor(() => expect(orchestrate).toHaveBeenCalledTimes(2))

    const firstKey = orchestrate.mock.calls[0][0].paymentIdempotencyKey
    const secondCallInput = orchestrate.mock.calls[1][0]
    expect(secondCallInput.paymentIdempotencyKey).toBe(firstKey) // نفس المحاولة — لا مفتاح جديد
    expect(secondCallInput.clientTotal).toBe(23) // = dryRun.total حرفياً، بلا أي حساب في الواجهة
  })

  it('PFCP-04: بعد تأكيد السعر، أثناء بدء الدفع الفعلي يعرض مؤشراً منفصلاً "جارٍ إعداد الدفع" — لا نص فحص السعر', async () => {
    const dryRun = { subtotal: 20, tax: 3, delivery_fee: 0, total: 23, price_changes: [] }
    const { promise: secondPromise, resolve: resolveSecond } = deferred()
    const orchestrate = vi.fn()
      .mockResolvedValueOnce({ status: 'price_changed', dryRun })
      .mockReturnValueOnce(secondPromise)

    render(<PaymentFirstCheckoutPanel {...defaultProps} orchestrate={orchestrate} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'حدّث وتابع' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'حدّث وتابع' }))

    await waitFor(() => expect(screen.getByText('جارٍ إعداد الدفع…')).toBeInTheDocument())
    expect(screen.queryByText('جارٍ التحقق من السعر النهائي…')).not.toBeInTheDocument()

    resolveSecond({ status: 'succeeded', paymentTransactionId: 'tx1', providerRef: 'p1', paymentStatus: 'pending', redirectUrl: null })
    await waitFor(() => expect(defaultProps.onOutcome).toHaveBeenCalled())
  })

  it('PFCP-05: REJECTED يعرض رسالة الرفض ولا يعرض أي زر تأكيد', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'rejected', reason: 'tenant_not_found' })
    render(<PaymentFirstCheckoutPanel {...defaultProps} orchestrate={orchestrate} />)
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.queryByText('حدّث وتابع')).not.toBeInTheDocument()
  })

  it('PFCP-06: "رجوع" بعد REJECTED يمسح مفتاح الإتقان من localStorage ويستدعي onCancelled', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'rejected', reason: 'tenant_not_found' })
    const onCancelled = vi.fn()
    render(<PaymentFirstCheckoutPanel {...defaultProps} orchestrate={orchestrate} onCancelled={onCancelled} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'رجوع' })).toBeInTheDocument())

    expect(localStorage.getItem('simsim_payidem_koshary_branch-a')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'رجوع' }))
    expect(onCancelled).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('simsim_payidem_koshary_branch-a')).toBeNull()
  })

  it('PFCP-07: succeeded يمسح مفتاح الإتقان ويستدعي onOutcome بالحالة والنتيجة، بلا عرض واجهة داخل اللوحة نفسها', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'succeeded', paymentTransactionId: 'tx1', providerRef: 'p1', paymentStatus: 'pending', redirectUrl: null })
    const onOutcome = vi.fn()
    const { container } = render(<PaymentFirstCheckoutPanel {...defaultProps} orchestrate={orchestrate} onOutcome={onOutcome} />)
    await waitFor(() => expect(onOutcome).toHaveBeenCalledWith(CheckoutState.SUCCEEDED, expect.objectContaining({ status: 'succeeded' })))
    expect(container).toBeEmptyDOMElement()
    expect(localStorage.getItem('simsim_payidem_koshary_branch-a')).toBeNull()
  })

  it('PFCP-08: failed يمسح مفتاح الإتقان (نتيجة نهائية)', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'failed', reason: 'provider_failed' })
    render(<PaymentFirstCheckoutPanel {...defaultProps} orchestrate={orchestrate} />)
    await waitFor(() => expect(localStorage.getItem('simsim_payidem_koshary_branch-a')).toBeNull())
  })

  it('PFCP-09: requires_reconciliation يُبقي مفتاح الإتقان (ليست نتيجة نهائية — استئناف لاحق يحتاجه)', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'requires_reconciliation', paymentTransactionId: 'tx1' })
    const onOutcome = vi.fn()
    render(<PaymentFirstCheckoutPanel {...defaultProps} orchestrate={orchestrate} onOutcome={onOutcome} />)
    await waitFor(() => expect(onOutcome).toHaveBeenCalled())
    expect(localStorage.getItem('simsim_payidem_koshary_branch-a')).toBeTruthy()
  })

  it('PFCP-10: retryable_error يُبقي مفتاح الإتقان أيضاً', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'retryable_error', reason: 'idempotency_race_unrecovered' })
    const onOutcome = vi.fn()
    render(<PaymentFirstCheckoutPanel {...defaultProps} orchestrate={orchestrate} onOutcome={onOutcome} />)
    await waitFor(() => expect(onOutcome).toHaveBeenCalled())
    expect(localStorage.getItem('simsim_payidem_koshary_branch-a')).toBeTruthy()
  })

  it('PFCP-11: لا يستدعي orchestrate إلا مرة واحدة تلقائياً — لا محاولة دفع مكرَّرة عند إعادة الرسم', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'rejected', reason: 'tenant_not_found' })
    const { rerender } = render(<PaymentFirstCheckoutPanel {...defaultProps} orchestrate={orchestrate} />)
    await waitFor(() => expect(orchestrate).toHaveBeenCalledTimes(1))
    rerender(<PaymentFirstCheckoutPanel {...defaultProps} orchestrate={orchestrate} brandColor="#000000" />)
    expect(orchestrate).toHaveBeenCalledTimes(1)
  })

  it('PFCP-12: المكوّن لا يستورد supabase/paymentService ولا يستدعي Moyasar — عرض/تنسيق فقط عبر الـHook المحقون', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.join(process.cwd(), 'src/features/menu/PaymentFirstCheckoutPanel.jsx'), 'utf8')
    const importLines = src.split('\n').filter((l) => l.trim().startsWith('import'))
    expect(importLines.join('\n')).not.toMatch(/supabase|paymentService|moyasar/i)
  })

  // ══════════════════════════════════════════════════════════════════
  // TASK-PAY-3.6D.5-A.1 — سجلّ بيانات تنفيذ الطلب (TASK_3_6D_5_A_CUSTOMER_DATA_PERSISTENCE_SPEC.md)
  // ══════════════════════════════════════════════════════════════════

  function resolvedPaymentKey() {
    return localStorage.getItem('simsim_payidem_koshary_branch-a')
  }

  it('PFDATA-01: سجلّ بيانات التنفيذ يُكتَب قبل استدعاء orchestrate الأول — بمفتاح simsim_payfirst_customer_{key}', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'rejected', reason: 'tenant_not_found' })
    render(<PaymentFirstCheckoutPanel {...defaultProps} orchestrate={orchestrate} />)
    await waitFor(() => expect(orchestrate).toHaveBeenCalledTimes(1))
    const key = resolvedPaymentKey()
    expect(localStorage.getItem(paymentCustomerDataStorageKey(key))).toBeTruthy()
    const record = readPaymentCustomerData(key)
    expect(record.customerPhone).toBe('512345678')
  })

  it('PFDATA-09b: dine_in غير-QR (isQrCheckout غير مُمرَّرة/false) مع table_number يُدرجها في السجلّ', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'rejected', reason: 'tenant_not_found' })
    const input = { ...checkoutInput, table_number: '9' }
    render(<PaymentFirstCheckoutPanel {...defaultProps} checkoutInput={input} orchestrate={orchestrate} />)
    await waitFor(() => expect(orchestrate).toHaveBeenCalledTimes(1))
    const record = readPaymentCustomerData(resolvedPaymentKey())
    expect(record.tableNumber).toBe('9')
  })

  it('PFDATA-10b: dine_in عبر QR (isQrCheckout=true) لا يُدرج table_number حتى لو أُرسِلت في checkoutInput', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'rejected', reason: 'tenant_not_found' })
    const input = { ...checkoutInput, table_number: '9' }
    render(<PaymentFirstCheckoutPanel {...defaultProps} checkoutInput={input} isQrCheckout orchestrate={orchestrate} />)
    await waitFor(() => expect(orchestrate).toHaveBeenCalledTimes(1))
    const record = readPaymentCustomerData(resolvedPaymentKey())
    expect(record).not.toHaveProperty('tableNumber')
  })

  it('PFDATA-25: failed يمسح سجلّ بيانات التنفيذ أيضاً (نتيجة نهائية)', async () => {
    // نفس منطق الالتقاط المبكر أعلاه — clearKey() قد يُنفَّذ بحلول أول waitFor لو التُقِط المفتاح بعده
    const { promise, resolve } = deferred()
    const orchestrate = vi.fn().mockReturnValue(promise)
    render(<PaymentFirstCheckoutPanel {...defaultProps} orchestrate={orchestrate} />)
    await waitFor(() => expect(orchestrate).toHaveBeenCalledTimes(1))
    const key = resolvedPaymentKey()
    expect(key).toBeTruthy()
    resolve({ status: 'failed', reason: 'provider_failed' })
    await waitFor(() => expect(localStorage.getItem('simsim_payidem_koshary_branch-a')).toBeNull())
    expect(localStorage.getItem(paymentCustomerDataStorageKey(key))).toBeNull()
  })

  it('PFDATA-26: requires_reconciliation يُبقي سجلّ بيانات التنفيذ (ليست نتيجة نهائية)', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'requires_reconciliation', paymentTransactionId: 'tx1' })
    render(<PaymentFirstCheckoutPanel {...defaultProps} orchestrate={orchestrate} />)
    await waitFor(() => expect(orchestrate).toHaveBeenCalledTimes(1))
    const key = resolvedPaymentKey()
    await waitFor(() => expect(defaultProps.onOutcome).toHaveBeenCalled())
    expect(readPaymentCustomerData(key)).not.toBeNull()
  })

  it('PFDATA-27: retryable_error يُبقي سجلّ بيانات التنفيذ أيضاً', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'retryable_error', reason: 'idempotency_race_unrecovered' })
    render(<PaymentFirstCheckoutPanel {...defaultProps} orchestrate={orchestrate} />)
    await waitFor(() => expect(orchestrate).toHaveBeenCalledTimes(1))
    const key = resolvedPaymentKey()
    await waitFor(() => expect(defaultProps.onOutcome).toHaveBeenCalled())
    expect(readPaymentCustomerData(key)).not.toBeNull()
  })

  it('PFDATA — succeeded يُبقي سجلّ بيانات التنفيذ عمداً (لا يُمسَح هنا — تدفّق إنشاء الطلب المستقبلي يملك تنظيفه)', async () => {
    // مفتاح الإتقان (ومعه سجلّ بيانات التنفيذ) يُلتقَط أثناء تعليق orchestrate عمداً — بعد الحل الفعلي
    // قد يكون clearKey() الخاص بمفتاح الإتقان نفسه (PFCP-07، غير مُعدَّل هنا) قد نُفِّذ بالفعل، فالمفتاح
    // نفسه لن يُقرأ من localStorage بعدها؛ الالتقاط المبكر هنا هو الطريقة الوحيدة الحتمية لاختبار هذا.
    const { promise, resolve } = deferred()
    const orchestrate = vi.fn().mockReturnValue(promise)
    render(<PaymentFirstCheckoutPanel {...defaultProps} orchestrate={orchestrate} />)
    await waitFor(() => expect(orchestrate).toHaveBeenCalledTimes(1))
    const key = resolvedPaymentKey()
    expect(key).toBeTruthy()
    resolve({ status: 'succeeded', paymentTransactionId: 'tx1', providerRef: 'p1', paymentStatus: 'pending', redirectUrl: null })
    await waitFor(() => expect(defaultProps.onOutcome).toHaveBeenCalled())
    // مفتاح الإتقان نفسه يُمسَح (PFCP-07 — سلوك موجود غير مُعدَّل) لكن سجلّ بيانات التنفيذ يبقى قابلاً للقراءة بنفس قيمة المفتاح المُلتقَطة قبل مسحه
    expect(readPaymentCustomerData(key)).not.toBeNull()
    expect(readPaymentCustomerData(key).customerPhone).toBe('512345678')
  })

  it('PFDATA — "رجوع" بعد REJECTED يمسح سجلّ بيانات التنفيذ أيضاً، وليس فقط مفتاح الإتقان', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'rejected', reason: 'tenant_not_found' })
    const onCancelled = vi.fn()
    render(<PaymentFirstCheckoutPanel {...defaultProps} orchestrate={orchestrate} onCancelled={onCancelled} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'رجوع' })).toBeInTheDocument())
    const key = resolvedPaymentKey()
    expect(readPaymentCustomerData(key)).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'رجوع' }))
    expect(readPaymentCustomerData(key)).toBeNull()
  })

  it('PFDATA — لا paymentTransactionId ولا providerRef ولا حالة دفع ولا مبلغ في السجلّ المكتوب فعلياً من اللوحة', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'rejected', reason: 'tenant_not_found' })
    render(<PaymentFirstCheckoutPanel {...defaultProps} orchestrate={orchestrate} />)
    await waitFor(() => expect(orchestrate).toHaveBeenCalledTimes(1))
    const record = readPaymentCustomerData(resolvedPaymentKey())
    for (const forbidden of ['paymentTransactionId', 'providerRef', 'status', 'amount', 'branchId', 'restaurantId']) {
      expect(record).not.toHaveProperty(forbidden)
    }
  })
})
