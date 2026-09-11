import { t } from '@/lib/i18n'
import type { Lang } from '@/lib/types'

export type OrderType = 'dine_in' | 'takeaway' | 'delivery' | 'car_pickup'

// Presentational only — receives the current value and every available
// type's enabled flag as props, calls onChange with the picked type. No
// state, no validation, no submission logic lives here; CheckoutForm.tsx
// keeps all of that exactly as before (Checkout Redesign — UI/structure
// only, per the task's own scope lock).
export function OrderTypeSelector({
  value, onChange, lang, priceColor, takeawayEnabled, deliveryEnabled, carPickupEnabled,
}: {
  value: OrderType
  onChange: (next: OrderType) => void
  lang: Lang
  priceColor: string
  takeawayEnabled: boolean
  deliveryEnabled: boolean
  carPickupEnabled: boolean
}) {
  const strings = t(lang)

  const options: { type: OrderType; icon: string; name: string; desc: string; enabled: boolean }[] = [
    { type: 'dine_in', icon: '🍽️', name: strings.orderTypeDineIn, desc: strings.orderTypeDineInDesc, enabled: true },
    { type: 'takeaway', icon: '🥡', name: strings.orderTypeTakeaway, desc: strings.orderTypeTakeawayDesc, enabled: takeawayEnabled },
    { type: 'delivery', icon: '🛵', name: strings.orderTypeDelivery, desc: strings.orderTypeDeliveryDesc, enabled: deliveryEnabled },
    { type: 'car_pickup', icon: '🚗', name: strings.orderTypeCarPickup, desc: strings.orderTypeCarPickupDesc, enabled: carPickupEnabled },
  ]

  return (
    <div className="checkout-form__order-type-grid">
      {options.filter((o) => o.enabled).map((o) => {
        const active = value === o.type
        return (
          <button
            key={o.type}
            type="button"
            className={`checkout-type-card${active ? ' is-active' : ''}`}
            style={active ? { borderColor: priceColor, background: `${priceColor}0D` } : undefined}
            onClick={() => onChange(o.type)}
            aria-pressed={active}
            aria-label={o.name}
          >
            {active && <span className="checkout-type-card__check" style={{ background: priceColor }}>✓</span>}
            <span className="checkout-type-card__icon">{o.icon}</span>
            <span className="checkout-type-card__name" style={active ? { color: priceColor } : undefined}>{o.name}</span>
            <span className="checkout-type-card__desc">{o.desc}</span>
          </button>
        )
      })}
    </div>
  )
}
