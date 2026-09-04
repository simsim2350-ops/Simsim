import { supabaseBrowser } from '@/lib/supabase/client'
import type { OrderStatusData } from './types'

// The one safe, existing, already-proven customer-facing read for order
// status: get_orders_status_secure(p_orders jsonb) — SECURITY DEFINER,
// verified directly against the live schema in Phase 4F. It validates the
// access_token server-side and returns only status-tracking fields (no
// customer PII beyond what the caller already has) — this is the real
// contract production's own src/features/menu/hooks/useActiveOrders.js
// already uses, not a new one invented for menu-next. No table is ever
// selected directly (orders' own RLS is staff-only — this RPC is the only
// safe path for a customer, by design, and this code respects that).
export async function getOrderStatus(orderId: string, accessToken: string): Promise<OrderStatusData | null> {
  const client = supabaseBrowser()
  if (!client) return null
  const result = await client.rpc('get_orders_status_secure', {
    p_orders: [{ id: orderId, access_token: accessToken }],
  } as never)
  const { data, error } = result as { data: OrderStatusData[] | null; error: { message: string } | null }
  if (error || !Array.isArray(data) || data.length === 0) return null
  return data[0]
}
