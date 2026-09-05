'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabaseBrowser } from '@/lib/supabase/client'
import { readActiveOrders, writeActiveOrders } from './activeOrders'
import type { StoredOrder } from './types'

// Faithful, simplified port of production's
// src/features/menu/hooks/useActiveOrders.js: localStorage-persisted order
// list, one realtime broadcast subscription per order that has an
// accessToken (channel `order-status:<id>:<token>`, same private-channel
// pattern already proven safe in OrderStatusView.tsx), plus a
// reconcile-on-focus fallback via the same get_orders_status_secure RPC.
//
// Deliberately simpler than production in one way: production's
// reconciliation runs on a tiered 5s/15s/30s polling timer that slows down
// once a broadcast is confirmed; this only reconciles on focus/visibility
// (the same, already-live pattern OrderStatusView.tsx uses for the single-
// order case) rather than adding a second, independent polling-timer
// mechanism — the broadcast channel is the primary mechanism either way, and
// this avoids two different reconciliation cadences existing side by side in
// this codebase for what is, from the customer's point of view, the same
// underlying feature.
export function useActiveOrders(slug: string) {
  const [orders, setOrders] = useState<StoredOrder[]>([])
  const [loaded, setLoaded] = useState(false)
  const channelsRef = useRef<Record<string, RealtimeChannel>>({})
  const ordersRef = useRef<StoredOrder[]>([])

  useEffect(() => {
    if (!slug) return
    setOrders(readActiveOrders(slug))
    setLoaded(true)
  }, [slug])

  useEffect(() => {
    ordersRef.current = orders
    if (!loaded) return
    writeActiveOrders(slug, orders)
  }, [orders, slug, loaded])

  // Subscribe to any order (in the current list) that doesn't have a channel
  // yet. Orders without an accessToken (should not normally happen — every
  // order created by this app carries one) simply never get a live channel
  // and rely solely on the reconcile-on-focus fallback below.
  useEffect(() => {
    const client = supabaseBrowser()
    if (!client) return
    orders.forEach((order) => {
      if (channelsRef.current[order.id] || !order.accessToken) return
      const channel = client
        .channel(`order-status:${order.id}:${order.accessToken}`, { config: { private: true } })
        .on('broadcast', { event: '*' }, (message) => {
          const p = message.payload as { order_id?: string; status?: StoredOrder['status']; cancelled_by?: string | null; items?: StoredOrder['items']; total?: number } | undefined
          if (!p || p.order_id !== order.id || !p.status) return
          setOrders((prev) => prev.map((o) => (o.id === order.id
            ? { ...o, status: p.status as StoredOrder['status'], cancelledBy: p.cancelled_by ?? o.cancelledBy, items: p.items ?? o.items, total: p.total ?? o.total }
            : o)))
        })
        .subscribe()
      channelsRef.current[order.id] = channel
    })

    // Drop channels for orders no longer in the list (shouldn't normally
    // happen — orders are only ever appended/updated, never removed — but
    // keeps this hook correct if that ever changes).
    Object.keys(channelsRef.current).forEach((id) => {
      if (!orders.some((o) => o.id === id)) {
        client.removeChannel(channelsRef.current[id])
        delete channelsRef.current[id]
      }
    })
  }, [orders])

  // Unsubscribe everything on unmount — the one place actually responsible
  // for preventing a leaked subscription when the customer navigates away.
  useEffect(() => {
    const client = supabaseBrowser()
    return () => {
      if (!client) return
      Object.values(channelsRef.current).forEach((ch) => client.removeChannel(ch))
      channelsRef.current = {}
    }
  }, [])

  const reconcile = useCallback(async () => {
    const client = supabaseBrowser()
    if (!client) return
    const pending = ordersRef.current.filter((o) => o.status !== 'completed' && o.status !== 'cancelled' && o.accessToken)
    if (pending.length === 0) return
    const { data, error } = await client.rpc('get_orders_status_secure', {
      p_orders: pending.map((o) => ({ id: o.id, access_token: o.accessToken })),
    } as never)
    if (error || !Array.isArray(data)) return
    const results = data as { id: string; status: StoredOrder['status']; cancelled_by: string | null; items: StoredOrder['items']; total: number }[]
    setOrders((prev) => prev.map((o) => {
      const fresh = results.find((r) => r.id === o.id)
      if (!fresh) return o
      return { ...o, status: fresh.status, cancelledBy: fresh.cancelled_by ?? o.cancelledBy, items: fresh.items ?? o.items, total: Number(fresh.total) || o.total }
    }))
  }, [])

  useEffect(() => {
    if (!loaded) return
    reconcile()
    const onFocus = () => { if (document.visibilityState === 'visible') reconcile() }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
    }
  }, [loaded, reconcile])

  // Same RPC and same "zero rows returned = not cancellable anymore"
  // semantics as production's cancelOrderByCustomer.
  const cancelOrderByCustomer = useCallback(async (order: StoredOrder): Promise<'cancelled' | 'failed'> => {
    const client = supabaseBrowser()
    if (!client || !order.accessToken) return 'failed'
    const result = await client.rpc('cancel_order_by_customer', {
      p_order_id: order.id,
      p_access_token: order.accessToken,
    } as never)
    const { data, error } = result as { data: unknown[] | null; error: { message: string } | null }
    const cancelled = !error && Array.isArray(data) && data.length > 0
    if (cancelled) {
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: 'cancelled', cancelledBy: 'customer' } : o)))
      return 'cancelled'
    }
    return 'failed'
  }, [])

  return { orders, loaded, cancelOrderByCustomer }
}
