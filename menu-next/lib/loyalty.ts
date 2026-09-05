import { supabaseBrowser } from './supabase/client'

// Faithful port of src/features/menu/hooks/useLoyalty.js's data source — same
// RPC, same params, same "enabled" gate. Client-side (loyalty is looked up by
// phone number, which only exists in the browser, never server-rendered).
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

export async function getCustomerLoyalty(restaurantId: string, phone: string): Promise<LoyaltyInfo | null> {
  const client = supabaseBrowser()
  if (!client || !phone) return null
  const { data, error } = await client.rpc('get_customer_loyalty', { rest_id: restaurantId, phone } as never)
  if (error) return null
  const row = (Array.isArray(data) ? data[0] : data) as LoyaltyInfo | undefined
  return row && row.enabled ? row : null
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
