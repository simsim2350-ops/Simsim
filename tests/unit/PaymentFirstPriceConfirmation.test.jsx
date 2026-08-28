// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import PaymentFirstPriceConfirmation from '../../src/features/menu/PaymentFirstPriceConfirmation'
import { CheckoutState } from '../../src/features/menu/hooks/usePaymentFirstCheckout'

const t = (key) => ({
  pfCheckingPrice: 'جارٍ التحقق من السعر النهائي…',
  pfCannotProceedTitle: 'تعذّر إتمام الطلب',
  pfBackAction: 'رجوع',
  priceChangedTitle: 'تغيّر السعر منذ آخر مرة راجعت فيها السلة',
  priceChangedUpdateBtn: 'حدّث وتابع',
  totalVat: 'المجموع (شامل الضريبة)',
  vatLine: '· منها ض.ق.م 15%',
  deliveryFee: '🛵 رسوم التوصيل',
}[key] || key)

const defaultProps = {
  state: CheckoutState.IDLE,
  result: null,
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
  t,
  isEn: false,
  brandColor: '#FF6A00',
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(cleanup)

describe('PaymentFirstPriceConfirmation', () => {
  it('PFC2-01: IDLE لا يعرض شيئاً (خارج نطاق هذا المكوّن)', () => {
    const { container } = render(<PaymentFirstPriceConfirmation {...defaultProps} state={CheckoutState.IDLE} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('PFC2-02: STARTING يعرض مؤشر تحقّق من السعر', () => {
    render(<PaymentFirstPriceConfirmation {...defaultProps} state={CheckoutState.STARTING} />)
    expect(screen.getByText('جارٍ التحقق من السعر النهائي…')).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('PFC2-03: PRICE_CHANGED بلا dryRun لا يعرض شيئاً (حارس دفاعي — لا سلطة سعرية خلفه)', () => {
    const { container } = render(<PaymentFirstPriceConfirmation {...defaultProps} state={CheckoutState.PRICE_CHANGED} result={{}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('PFC2-04: PRICE_CHANGED يعرض الإجمالي السلطوي من dryRun.total فقط، لا من أي مصدر آخر', () => {
    const result = {
      dryRun: {
        subtotal: 21, tax: 2, delivery_fee: 0, total: 23,
        price_changes: [{ client_total: 18, server_total: 23 }],
      },
    }
    render(<PaymentFirstPriceConfirmation {...defaultProps} state={CheckoutState.PRICE_CHANGED} result={result} />)
    expect(screen.getByText('23.00 ﷼')).toBeInTheDocument()
    expect(screen.getByText('18.00 ﷼')).toBeInTheDocument() // السياق فقط (client_total من رد الخادم نفسه)
  })

  it('PFC2-05: PRICE_CHANGED بلا price_changes[] يعرض الإجمالي الجديد فقط، بلا مقارنة "قديم"', () => {
    const result = { dryRun: { subtotal: 20, tax: 3, delivery_fee: 0, total: 23, price_changes: [] } }
    render(<PaymentFirstPriceConfirmation {...defaultProps} state={CheckoutState.PRICE_CHANGED} result={result} />)
    expect(screen.getByText('23.00 ﷼')).toBeInTheDocument()
    expect(screen.queryByText(/line-through/)).not.toBeInTheDocument()
  })

  it('PFC2-06: زر "حدّث وتابع" يستدعي onConfirm بكامل كائن dryRun كما هو', () => {
    const onConfirm = vi.fn()
    const dryRun = { subtotal: 20, tax: 3, delivery_fee: 0, total: 23, price_changes: [{ client_total: 20, server_total: 23 }] }
    render(<PaymentFirstPriceConfirmation {...defaultProps} state={CheckoutState.PRICE_CHANGED} result={{ dryRun }} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: 'حدّث وتابع' }))
    expect(onConfirm).toHaveBeenCalledWith(dryRun)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('PFC2-07: زر "رجوع" في PRICE_CHANGED يستدعي onCancel', () => {
    const onCancel = vi.fn()
    const dryRun = { subtotal: 20, tax: 3, delivery_fee: 0, total: 23, price_changes: [] }
    render(<PaymentFirstPriceConfirmation {...defaultProps} state={CheckoutState.PRICE_CHANGED} result={{ dryRun }} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'رجوع' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('PFC2-08: PRICE_CHANGED يعرض رسوم التوصيل فقط عندما تكون أكبر من صفر', () => {
    const withFee = { dryRun: { subtotal: 20, tax: 3, delivery_fee: 5, total: 28, price_changes: [] } }
    const { rerender } = render(<PaymentFirstPriceConfirmation {...defaultProps} state={CheckoutState.PRICE_CHANGED} result={withFee} />)
    expect(screen.getByText('🛵 رسوم التوصيل')).toBeInTheDocument()

    const noFee = { dryRun: { subtotal: 20, tax: 3, delivery_fee: 0, total: 23, price_changes: [] } }
    rerender(<PaymentFirstPriceConfirmation {...defaultProps} state={CheckoutState.PRICE_CHANGED} result={noFee} />)
    expect(screen.queryByText('🛵 رسوم التوصيل')).not.toBeInTheDocument()
  })

  it('PFC2-09: REJECTED يعرض رسالة مُترجَمة حسب reason، بلا زر تأكيد إطلاقاً', () => {
    render(<PaymentFirstPriceConfirmation {...defaultProps} state={CheckoutState.REJECTED} result={{ reason: 'tenant_not_found' }} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('تعذّر إتمام الطلب')).toBeInTheDocument()
    expect(screen.queryByText('حدّث وتابع')).not.toBeInTheDocument()
  })

  it('PFC2-10: زر "رجوع" في REJECTED يستدعي onCancel', () => {
    const onCancel = vi.fn()
    render(<PaymentFirstPriceConfirmation {...defaultProps} state={CheckoutState.REJECTED} result={{ reason: 'tenant_not_found' }} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'رجوع' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('PFC2-11: REJECTED مع reason=dry_run_failed يعرض رسالة create_order المُترجَمة الحقيقية', () => {
    render(<PaymentFirstPriceConfirmation {...defaultProps} state={CheckoutState.REJECTED} result={{ reason: 'dry_run_failed', message: 'invalid customer phone' }} />)
    expect(screen.getByText(/رقم الجوال/)).toBeInTheDocument()
  })

  it('PFC2-12: REJECTED بلا reason معروف يعرض رسالة fallback عامة بدل الانهيار', () => {
    render(<PaymentFirstPriceConfirmation {...defaultProps} state={CheckoutState.REJECTED} result={{}} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('PFC2-13: حالات لاحقة لبدء الدفع (SUCCEEDED) خارج نطاق هذا المكوّن — لا تعرض شيئاً', () => {
    const { container } = render(<PaymentFirstPriceConfirmation {...defaultProps} state={CheckoutState.SUCCEEDED} result={{ status: 'succeeded' }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('PFC2-14: حالات لاحقة لبدء الدفع (FAILED) خارج نطاق هذا المكوّن — لا تعرض شيئاً', () => {
    const { container } = render(<PaymentFirstPriceConfirmation {...defaultProps} state={CheckoutState.FAILED} result={{ status: 'failed' }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('PFC2-15: المكوّن لا يستورد supabase ولا usePaymentFirstCheckout كنداء مباشر — عرض بحت فقط', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/features/menu/PaymentFirstPriceConfirmation.jsx'),
      'utf8'
    )
    const importLines = src.split('\n').filter((l) => l.trim().startsWith('import'))
    expect(importLines.join('\n')).not.toMatch(/supabase|initiatePaymentFirstCheckout|paymentService/i)
  })
})
