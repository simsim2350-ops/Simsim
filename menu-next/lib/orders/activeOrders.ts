import type { StoredOrder } from './types'

// Same localStorage key convention as production's
// src/features/menu/hooks/useActiveOrders.js (simsim_orders_<slug>) — reused
// verbatim, not a new key, so the record shape stays a drop-in match.
function storageKey(slug: string) {
  return `simsim_orders_${slug}`
}

const MAX_AGE_MS = 12 * 60 * 60 * 1000

export function readActiveOrders(slug: string): StoredOrder[] {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(slug)) || '[]')
    if (!Array.isArray(saved)) return []
    // Same 12h prune as production — avoids unbounded accumulation of old
    // completed/cancelled orders on a device that's never cleared.
    return (saved as StoredOrder[]).filter((o) => Date.now() - (o.createdAt || 0) < MAX_AGE_MS)
  } catch {
    return []
  }
}

export function writeActiveOrders(slug: string, orders: StoredOrder[]) {
  try {
    localStorage.setItem(storageKey(slug), JSON.stringify(orders))
  } catch {
    /* localStorage unavailable — non-fatal, tracking just won't persist */
  }
}

// Called once, right after create_order succeeds (CheckoutForm.tsx) — appends
// the new order to this device's list so it shows up on the My Orders page.
export function addActiveOrder(slug: string, order: StoredOrder) {
  const existing = readActiveOrders(slug)
  writeActiveOrders(slug, [...existing, order])
}
