// The 5 status values are the real, database-enforced set (orders_status_check
// CHECK constraint, verified directly against the live schema in Phase 4E) —
// nothing here is invented or guessed.
export type OrderStatusValue = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled'

// get_orders_status_secure returns orders.items verbatim (verified directly
// against the live schema/RPC definition) — a real row's items actually
// carry name/qty/price/emoji/selectedOptions, not just {id, unavailable}.
// The broadcast trigger (broadcast_order_status()) sends a stripped-down
// {id, unavailable}-only version of the same array on every live update —
// see mergeBroadcastItems() below, which is what keeps the rich fields from
// being wiped out the moment a live status change arrives.
export type OrderStatusData = {
  id: string
  order_number: string
  status: OrderStatusValue
  cancelled_by: string | null
  items: Array<{ id: string; name?: string; name_en?: string | null; qty?: number; unavailable: boolean }>
  total: number
  updated_at: string
}

// Persisted shape for the "My Orders" localStorage list — same field set as
// production's src/features/menu/hooks/useActiveOrders.js (id, orderNumber,
// status, items, total, tableNumber, createdAt, accessToken, cancelledBy),
// plus one additive field (branchId) this app needs for Reorder (#8) to know
// which branch's current product availability/prices to check against — an
// old-menu record without it (if ever read on a shared origin) simply omits
// it, which callers here already treat as optional.
export type StoredOrder = {
  id: string
  orderNumber: string
  status: OrderStatusValue
  items: Array<{ id: string; name?: string; qty?: number; unavailable?: boolean; notes?: string; selectedOptions?: unknown[] }>
  total: number
  tableNumber: string | null
  createdAt: number
  accessToken: string | null
  cancelledBy?: string | null
  branchId?: string
}

// A live broadcast (order-status:<id>:<token>) only ever carries a
// stripped-down {id, unavailable}[] items array (see broadcast_order_status()
// in the DB — it deliberately doesn't re-send name/qty/price over realtime).
// Replacing the previous, richer items array wholesale with that stripped
// one — `items: p.items ?? prev.items` — silently wiped out every item's
// name/qty the moment any live status update arrived, breaking any UI that
// shows what was actually ordered after the first realtime event. This
// merges by id instead: every existing field is kept, only `unavailable` is
// ever updated from a broadcast. Used by both OrderStatusView.tsx and
// useActiveOrders.ts, which share this exact same trigger/payload shape.
export function mergeBroadcastItems<T extends { id: string; unavailable?: boolean }>(
  previous: T[],
  incoming: Array<{ id: string; unavailable?: boolean }> | undefined,
): T[] {
  if (!incoming || incoming.length === 0) return previous
  const byId = new Map(incoming.map((i) => [i.id, i.unavailable]))
  return previous.map((item) => (byId.has(item.id) ? { ...item, unavailable: byId.get(item.id) } : item))
}
