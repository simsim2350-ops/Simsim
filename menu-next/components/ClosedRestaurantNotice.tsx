import type { OpenStatus } from '@/lib/openStatus'
import { t } from '@/lib/i18n'
import type { Lang } from '@/lib/types'

// Shown right below the Hero the moment a customer lands on a closed
// restaurant's menu. As of this round's fix, it is the ONLY content shown
// below the Hero while closed — page.tsx no longer renders the category
// nav/highlight rails/products/cart/checkout entry points at all in that
// state (not merely hidden underneath: not rendered), so there is no path
// left to Product Details or Add to Cart while closed. CheckoutForm.tsx's
// own pre-existing closed-state submit guard is untouched either way — this
// component is additive, not a replacement for that defense-in-depth. A
// Server Component (no client state needed for a plain, permanent notice).
//
// Reuses existing i18n copy (closedTitle, already the exact required
// Arabic string) and the real, already-computed openStatus.nextText — never
// an invented time. If the restaurant is open, or open-status is unknown
// (no hours configured — computeOpenStatus's own "no data = treat as
// open" rule), this renders nothing at all. The Hero's own compact
// "مغلق الآن" status badge still shows as before, but no longer repeats
// this same next-opening text (see RestaurantHeader.tsx's hoursDetail) —
// this notice is now the single place that text appears.
export function ClosedRestaurantNotice({ openStatus, lang }: { openStatus: OpenStatus; lang: Lang }) {
  if (openStatus.open) return null
  const strings = t(lang)

  return (
    <div className="closed-notice" role="status">
      <span className="closed-notice__icon" aria-hidden>🕐</span>
      <div>
        <div className="closed-notice__title">{strings.closedTitle}</div>
        {openStatus.nextText && <div className="closed-notice__body">{openStatus.nextText}</div>}
      </div>
    </div>
  )
}
