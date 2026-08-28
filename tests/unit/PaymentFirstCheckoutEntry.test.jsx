// @vitest-environment happy-dom
//
// TASK-PAY-3.6D.10 — اختبارات PaymentFirstCheckoutEntry (يُغلِّف PaymentFirstCheckoutPanel الحقيقية
// [3.6D.3، غير مموَّهة — نفس نمط PaymentFirstOrderCreation.test.jsx] بـ orchestrate مموَّهة عند حدود
// الشبكة الوحيدة).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import PaymentFirstCheckoutEntry from '../../src/features/menu/PaymentFirstCheckoutEntry'

const t = (key) => ({
  pfCheckingPrice: 'جارٍ التحقق من السعر النهائي…',
  pfProcessingPayment: 'جارٍ إعداد الدفع…',
  pfCannotProceedTitle: 'تعذّر إتمام الطلب',
  pfBackAction: 'رجوع',
  priceChangedTitle: 'تغيّر السعر',
  priceChangedUpdateBtn: 'حدّث وتابع',
  totalVat: 'المجموع',
  vatLine: 'ض.ق.م',
  deliveryFee: 'رسوم التوصيل',
  pfRedirectingToPayment: 'جارٍ تحويلك لصفحة الدفع...',
  pfOrderRequiresReconciliationTitle: 'طلبك قيد المراجعة',
  pfOrderRequiresReconciliationBody: 'دفعتك مسجَّلة',
}[key] || key)

const SLUG = 'koshary'
const BRANCH_ID = 'branch-a'
const CHECKOUT_INPUT = {
  type: 'takeaway', items: [{ product_id: 'p1', quantity: 1 }],
  customer_phone: '512345678', restaurant_slug: SLUG, branch_id: BRANCH_ID, clientTotal: 45.5,
}

function renderEntry({ orchestrate, navigateToPayment, onCancel } = {}) {
  return render(
    <PaymentFirstCheckoutEntry
      slug={SLUG} branchId={BRANCH_ID} checkoutInput={CHECKOUT_INPUT}
      orchestrate={orchestrate} navigateToPayment={navigateToPayment} onCancel={onCancel}
      t={t} isEn={false} brandColor="#FF6A00"
    />
  )
}

beforeEach(() => { localStorage.clear(); vi.clearAllMocks() })
afterEach(cleanup)

describe('PaymentFirstCheckoutEntry', () => {
  it('succeeded مع redirectUrl ⇒ ينتقل مرة واحدة فقط عبر navigateToPayment، ويعرض حالة "جارٍ التحويل"', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'succeeded', redirectUrl: 'https://moyasar.example/checkout/abc' })
    const navigateToPayment = vi.fn()
    renderEntry({ orchestrate, navigateToPayment })
    await waitFor(() => expect(navigateToPayment).toHaveBeenCalledWith('https://moyasar.example/checkout/abc'))
    expect(navigateToPayment).toHaveBeenCalledTimes(1)
    expect(screen.getByText('جارٍ تحويلك لصفحة الدفع...')).toBeInTheDocument()
  })

  it('لا استدعاء ثانٍ لـ navigateToPayment حتى لو تكرّر onOutcome (حارس redirectedRef)', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'succeeded', redirectUrl: 'https://moyasar.example/x' })
    const navigateToPayment = vi.fn()
    renderEntry({ orchestrate, navigateToPayment })
    await waitFor(() => expect(navigateToPayment).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 20))
    expect(navigateToPayment).toHaveBeenCalledTimes(1)
  })

  it('price_changed ⇒ تعرض PaymentFirstPriceConfirmation الحقيقية مع السعر السلطوي', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'price_changed', dryRun: { subtotal: 40, tax: 6, delivery_fee: 0, total: 46 } })
    renderEntry({ orchestrate })
    await waitFor(() => expect(screen.getByText('تغيّر السعر')).toBeInTheDocument())
    expect(screen.getByText('46.00 ﷼')).toBeInTheDocument()
  })

  it('rejected ⇒ تعرض شاشة الرفض النهائي عبر اللوحة نفسها', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'rejected', reason: 'tenant_not_found' })
    renderEntry({ orchestrate })
    await waitFor(() => expect(screen.getByText('تعذّر إتمام الطلب')).toBeInTheDocument())
  })

  it('failed ⇒ رسالة خطأ عامة + زر رجوع يستدعي onCancel', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'failed', reason: 'provider_failed' })
    const onCancel = vi.fn()
    renderEntry({ orchestrate, onCancel })
    await waitFor(() => expect(screen.getByText('تعذّر إتمام الطلب')).toBeInTheDocument())
    fireEvent.click(screen.getByText('رجوع'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('retryable_error ⇒ نفس شاشة الخطأ العامة، زر رجوع متاح', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'retryable_error', reason: 'idempotency_race_unrecovered' })
    renderEntry({ orchestrate })
    await waitFor(() => expect(screen.getByText('تعذّر إتمام الطلب')).toBeInTheDocument())
    expect(screen.getByText('رجوع')).toBeInTheDocument()
  })

  it('requires_reconciliation ⇒ رسالة محايدة، بلا ادّعاء نجاح أو فشل، بلا زر إجراء', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'requires_reconciliation' })
    renderEntry({ orchestrate })
    await waitFor(() => expect(screen.getByText('طلبك قيد المراجعة')).toBeInTheDocument())
    expect(screen.queryByText('رجوع')).not.toBeInTheDocument()
    expect(screen.queryByText('تعذّر إتمام الطلب')).not.toBeInTheDocument()
  })

  it('الإلغاء من شاشة السعر (PaymentFirstPriceConfirmation.onCancel) يستدعي onCancel المُمرَّرة', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'price_changed', dryRun: { subtotal: 40, tax: 6, delivery_fee: 0, total: 46 } })
    const onCancel = vi.fn()
    renderEntry({ orchestrate, onCancel })
    await waitFor(() => expect(screen.getByText('تغيّر السعر')).toBeInTheDocument())
    fireEvent.click(screen.getByText('رجوع'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('لا استيراد/استدعاء مباشر لـ checkoutOrchestration أو Moyasar في هذا الملف', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.join(process.cwd(), 'src/features/menu/PaymentFirstCheckoutEntry.jsx'), 'utf8')
    const importLines = src.split('\n').filter((l) => l.trim().startsWith('import'))
    expect(importLines.join('\n')).not.toMatch(/checkoutOrchestration|moyasar/i)
  })
})
