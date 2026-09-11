'use client'

import { useState } from 'react'
import { t } from '@/lib/i18n'
import type { Lang } from '@/lib/types'
import type { Coupon } from '@/lib/pricing'

// Presentational only — the actual coupon lookup (applyCoupon) and all its
// business rules (branch match, expiry, min order, usage limit) stay in
// CheckoutForm.tsx exactly as before; this component only renders the
// collapsed/expanded/applied states and calls back. Starts collapsed so it
// never takes visible space until the customer opts in.
export function CouponInput({
  couponInput, setCouponInput, appliedCoupon, applyCoupon, removeCoupon, couponError, applyingCoupon, lang,
}: {
  couponInput: string
  setCouponInput: (value: string) => void
  appliedCoupon: Coupon | null
  applyCoupon: () => void
  removeCoupon: () => void
  couponError: string
  applyingCoupon: boolean
  lang: Lang
}) {
  const strings = t(lang)
  const [expanded, setExpanded] = useState(false)

  if (appliedCoupon) {
    return (
      <div className="checkout-form__section">
        <div className="checkout-form__coupon-applied">
          <span>✅ {appliedCoupon.code}</span>
          <button type="button" onClick={removeCoupon}>{strings.couponRemove}</button>
        </div>
      </div>
    )
  }

  if (!expanded) {
    return (
      <div className="checkout-form__section">
        <button type="button" className="checkout-coupon-toggle" onClick={() => setExpanded(true)}>
          <span>{strings.couponToggleLabel}</span>
          <span className="checkout-coupon-toggle__plus" aria-hidden="true">+</span>
        </button>
      </div>
    )
  }

  return (
    <div className="checkout-form__section">
      <label className="checkout-form__label" htmlFor="couponCode">{strings.couponLabel}</label>
      <div className="checkout-form__coupon-row">
        <input
          id="couponCode"
          type="text"
          value={couponInput}
          onChange={(e) => setCouponInput(e.target.value)}
          placeholder={strings.couponPh}
          className="checkout-form__input"
          autoFocus
        />
        <button type="button" onClick={applyCoupon} disabled={applyingCoupon || !couponInput.trim()} className="checkout-form__coupon-apply">
          {strings.couponApply}
        </button>
      </div>
      {couponError && <span className="checkout-form__error" role="alert">{couponError}</span>}
    </div>
  )
}
