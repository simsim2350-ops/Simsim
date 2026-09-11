'use client'

import { useState } from 'react'
import { t } from '@/lib/i18n'
import type { Lang } from '@/lib/types'
import type { CartItem } from '@/lib/cart/types'

// Presentational only — reads the exact same cart items CheckoutForm.tsx
// already reads from CartContext (passed down as a prop, not re-fetched here)
// and only changes how many of them are shown before a "view all" expansion.
// No cart data, price, or quantity is computed or altered in this file.
//
// Collapsed: first COLLAPSED_COUNT lines inline (matches the previous
// .checkout-form__items block exactly, same classes, so nothing that reads
// .checkout-form__item-row breaks). Full list only appears in a bottom sheet,
// reusing the app's own established sheet pattern (handle/header/close/body
// — same shape as .options-modal / .cart-sheet, not invented).
const COLLAPSED_COUNT = 3

export function OrderSummary({
  items, lang, currency, formatPrice,
}: {
  items: CartItem[]
  lang: Lang
  currency: string
  formatPrice: (n: number) => string
}) {
  const strings = t(lang)
  const [open, setOpen] = useState(false)
  const visible = items.slice(0, COLLAPSED_COUNT)
  const hiddenCount = items.length - visible.length

  const renderLine = (item: CartItem) => {
    const name = lang === 'en' && item.nameEn ? item.nameEn : item.name
    const optsText = item.selectedOptions.map((o) => o.choiceName).filter(Boolean).join(lang === 'en' ? ', ' : '، ')
    return (
      <div key={item.cartKey} className="checkout-form__item-row-wrap">
        <div className="checkout-form__item-row">
          <span>{item.qty}× {name}</span>
          <span>{formatPrice(item.price * item.qty)} {currency}</span>
        </div>
        {optsText && <div className="checkout-form__item-options">{optsText}</div>}
      </div>
    )
  }

  return (
    <div className="checkout-form__section">
      <div className="checkout-order-summary__header">
        <span className="checkout-form__label" style={{ marginBottom: 0 }}>{strings.orderSummaryLabel}</span>
        <span className="checkout-order-summary__count">{strings.itemsCount(items.length)}</span>
      </div>
      <div className="checkout-form__items">
        {visible.map(renderLine)}
        {hiddenCount > 0 && (
          <button type="button" className="checkout-order-summary__view-all" onClick={() => setOpen(true)}>
            {strings.viewAllItems}
          </button>
        )}
      </div>

      {open && (
        <div className="checkout-order-sheet-overlay" onClick={() => setOpen(false)} role="dialog" aria-modal="true">
          <div className="checkout-order-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="checkout-order-sheet__handle" />
            <div className="checkout-order-sheet__header">
              <h3>{strings.orderItemsSheetTitle}</h3>
              <button type="button" className="checkout-order-sheet__close" onClick={() => setOpen(false)} aria-label="close">✕</button>
            </div>
            <div className="checkout-order-sheet__body">
              {items.map(renderLine)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
