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
