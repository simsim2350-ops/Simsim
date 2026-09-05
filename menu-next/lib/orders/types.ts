// The 5 status values are the real, database-enforced set (orders_status_check
// CHECK constraint, verified directly against the live schema in Phase 4E) —
// nothing here is invented or guessed.
export type OrderStatusValue = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled'

export type OrderStatusData = {
  id: string
  order_number: string
  status: OrderStatusValue
  cancelled_by: string | null
  items: Array<{ id: string; unavailable: boolean }>
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
