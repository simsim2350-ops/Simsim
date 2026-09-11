import { t } from '@/lib/i18n'
import type { Lang } from '@/lib/types'

// Presentational only — every value here is computed once in CheckoutForm.tsx
// (vatBreakdown/computeCouponDiscount, the exact same functions create_order
// itself uses server-side) and passed straight through; this component never
// recomputes a price. Row order here (subtotal -> tax -> discount -> delivery
// fee -> total) is a display-only reordering of the same values the previous
// layout already showed — no figure changed, no figure added.
export function PriceSummary({
  subtotal, tax, discountAmount, deliveryFeeApplied, showDeliveryFee, total, currency, priceColor, lang, formatPrice,
}: {
  subtotal: number
  tax: number
  discountAmount: number
  deliveryFeeApplied: number
  showDeliveryFee: boolean
  total: number
  currency: string
  priceColor: string
  lang: Lang
  formatPrice: (n: number) => string
}) {
  const strings = t(lang)
  return (
    <div className="checkout-form__summary">
      <div className="checkout-form__summary-row checkout-form__summary-row--muted">
        <span>{strings.vatLine}</span><span>{formatPrice(subtotal)} {currency}</span>
      </div>
      <div className="checkout-form__summary-row checkout-form__summary-row--muted">
        <span>{strings.vatAmount}</span><span>{formatPrice(tax)} {currency}</span>
      </div>
      {discountAmount > 0 && (
        <div className="checkout-form__summary-row checkout-form__summary-row--muted checkout-form__summary-row--discount">
          <span>{strings.discountLabel}</span><span>-{formatPrice(discountAmount)} {currency}</span>
        </div>
      )}
      {showDeliveryFee && deliveryFeeApplied > 0 && (
        <div className="checkout-form__summary-row checkout-form__summary-row--muted">
          <span>{strings.deliveryFee}</span><span>{formatPrice(deliveryFeeApplied)} {currency}</span>
        </div>
      )}
      <div className="checkout-form__summary-row checkout-form__summary-row--total">
        <span>{strings.total}</span><span style={{ color: priceColor }}>{formatPrice(total)} {currency}</span>
      </div>
    </div>
  )
}
