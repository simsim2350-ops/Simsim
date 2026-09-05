// Faithful TypeScript port of src/lib/pricing.js (the production Main app's
// single source of truth for VAT math, per its own ADR-1 comment). Same
// constant, same formula — not reinvented. Prices are VAT-inclusive; VAT is
// unwound from the total: net = gross / 1.15, tax = gross - net.

export const VAT_RATE = 0.15

export function vatBreakdown(gross: number): { gross: number; net: number; tax: number } {
  const g = Math.max(0, Number(gross) || 0)
  const net = g / (1 + VAT_RATE)
  return { gross: g, net, tax: g - net }
}

// Faithful port of src/lib/pricing.js's computeCouponDiscount — same formula,
// same rounding, same max_discount_amount cap, same "never exceed the
// subtotal itself" clamp. This is the exact function create_order's own
// server-side discount calculation mirrors (verified against the live RPC
// body in the Security Audit phase), so client and server never disagree.
export type Coupon = {
  code: string
  discount_type: 'percent' | 'fixed'
  discount_value: number
  max_discount_amount: number | null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function computeCouponDiscount(coupon: Coupon | null, subtotalGross: number): number {
  if (!coupon) return 0
  const gross = Math.max(0, Number(subtotalGross) || 0)
  const value = Number(coupon.discount_value) || 0
  let discount = coupon.discount_type === 'percent' ? round2((gross * value) / 100) : Math.max(0, value)
  if (coupon.max_discount_amount != null) {
    discount = Math.min(discount, Number(coupon.max_discount_amount))
  }
  return Math.min(discount, gross)
}
