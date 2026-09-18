// Phase 6 Migration 4 (RPC-002 closure): loyalty is no longer looked up by a
// client-supplied phone number directly against Supabase. It goes through
// the server-side /api/customer/loyalty route, which derives the phone from
// the caller's own validated simsim_customer_session cookie — never from
// anything this file sends. See app/api/customer/loyalty/handler.js.
export type LoyaltyInfo = {
  enabled: boolean
  balance: number
  reward_threshold: number | null
  reward_description: string | null
  tier_name: string | null
  tier_icon: string | null
  next_tier_name: string | null
  next_tier_min: number | null
  earned: number | null
  expiry_months: number | null
}

export async function getCustomerLoyalty(restaurantId: string): Promise<LoyaltyInfo | null> {
  try {
    const res = await fetch(`/api/customer/loyalty?restaurant_id=${encodeURIComponent(restaurantId)}`, {
      method: 'GET',
      credentials: 'include',
    })
    if (!res.ok) return null
    const body = await res.json()
    return (body?.loyalty as LoyaltyInfo | null) ?? null
  } catch {
    return null
  }
}

// Same localStorage key convention as production's useLoyalty.js /
// useCheckout.js (simsim_phone_<slug>) — reused verbatim so a returning
// customer's phone (and therefore loyalty lookup) isn't lost across visits.
export function phoneStorageKey(slug: string) {
  return `simsim_phone_${slug}`
}

export function getRememberedPhone(slug: string): string {
  try {
    return localStorage.getItem(phoneStorageKey(slug)) || ''
  } catch {
    return ''
  }
}

export function rememberPhone(slug: string, phone: string) {
  try {
    localStorage.setItem(phoneStorageKey(slug), phone)
  } catch {
    /* localStorage unavailable — non-fatal, loyalty just won't be remembered */
  }
}
