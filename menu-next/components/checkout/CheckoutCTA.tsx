import { t } from '@/lib/i18n'
import type { Lang } from '@/lib/types'

type Status = 'idle' | 'submitting' | 'success' | 'error' | 'verifying'

// Presentational only. Note: .checkout-form already reserved 100px of bottom
// padding (padding: 18px 16px 100px, pre-existing, unchanged) — this
// component is what that space was for: a fixed, safe-area-aware bottom bar
// instead of the button just sitting inline at the end of the scrolling
// form. type="submit" (unchanged) — clicking it still submits the same
// <form onSubmit={handleSubmit}> in CheckoutForm.tsx; no new click handler,
// no new submission path.
export function CheckoutCTA({
  status, openStatusOpen, total, currency, priceColor, lang, formatPrice,
}: {
  status: Status
  openStatusOpen: boolean
  total: number
  currency: string
  priceColor: string
  lang: Lang
  formatPrice: (n: number) => string
}) {
  const strings = t(lang)
  const disabled = !openStatusOpen || status === 'submitting'
  const label = status === 'submitting'
    ? strings.processing
    : status === 'error'
      ? strings.tryAgain
      : `${strings.reviewOrder} · ${formatPrice(total)} ${currency}`

  return (
    <div className="checkout-cta-bar">
      <button
        type="submit"
        className="checkout-form__submit"
        style={{ background: openStatusOpen ? priceColor : '#E5E7EB' }}
        disabled={disabled}
        aria-busy={status === 'submitting'}
      >
        {status === 'submitting' && <span className="checkout-cta-bar__spinner" aria-hidden="true" />}
        {label}
      </button>
    </div>
  )
}
