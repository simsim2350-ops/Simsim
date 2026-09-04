'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { t } from '@/lib/i18n'
import type { Lang } from '@/lib/types'
import { supabaseBrowser } from '@/lib/supabase/client'
import { getOrderStatus } from '@/lib/orders/getOrderStatus'
import type { OrderStatusData, OrderStatusValue } from '@/lib/orders/types'

// The 4 forward-progress steps, in order — 'cancelled' is deliberately not a
// step in this list (it's a terminal state that replaces the timeline, same
// treatment as production's own Orders.jsx, which keeps cancelled as its own
// separate column rather than a step in the pending→...→completed sequence).
const TIMELINE_STEPS: OrderStatusValue[] = ['pending', 'preparing', 'ready', 'completed']

export function OrderStatusView({
  orderId, accessToken, slug, restaurantName, branchName, placedAt,
  currency, priceColor, lang, isFresh,
}: {
  orderId: string
  accessToken: string
  slug: string
  restaurantName: string
  branchName: string | null
  placedAt: string | null
  currency: string
  priceColor: string
  lang: Lang
  isFresh: boolean
}) {
  const strings = t(lang)
  const [data, setData] = useState<OrderStatusData | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [liveConnected, setLiveConnected] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)
  const mountedRef = useRef(true)

  const load = useCallback(async () => {
    const result = await getOrderStatus(orderId, accessToken)
    if (!mountedRef.current) return
    if (!result) {
      setLoadState('error')
      return
    }
    setData(result)
    setLoadState('loaded')
    setLastUpdatedAt(Date.now())
  }, [orderId, accessToken])

  // Initial safe read — the one thing this page always does, regardless of
  // whether realtime is available. Refresh-safe and works on direct
  // navigation, since it only needs orderId+accessToken from the URL.
  useEffect(() => {
    mountedRef.current = true
    load()
    return () => { mountedRef.current = false }
  }, [load])

  // Live updates via the existing, already-safe private broadcast channel
  // (order-status:<id>:<token>) — verified directly against the live schema
  // in Phase 4F: gated by a realtime.messages RLS policy that only allows
  // reading a topic if the token in it matches the order's real
  // order_access_token (can_read_order_status()). No service-role, no new
  // channel pattern — this is the same mechanism production's own
  // useActiveOrders.js already uses for the same purpose.
  //
  // One correction vs. that file: its listener reads `payload.payload?.record`,
  // but the actual trigger (broadcast_order_status(), read directly from the
  // live database for this phase) sends the changed fields flat, with no
  // `record` key — { order_id, status, cancelled_by, items, updated_at }.
  // This implementation reads the real shape rather than copying that
  // mismatch; noted in this phase's report as an observation about Main,
  // not something this phase modifies there.
  useEffect(() => {
    const client = supabaseBrowser()
    if (!client) return
    const channel = client
      .channel(`order-status:${orderId}:${accessToken}`, { config: { private: true } })
      .on('broadcast', { event: '*' }, (message) => {
        const p = message.payload as { order_id?: string; status?: OrderStatusValue; cancelled_by?: string | null; items?: OrderStatusData['items']; updated_at?: string } | undefined
        if (!p || p.order_id !== orderId || !p.status) return
        setData((prev) => (prev ? { ...prev, status: p.status as OrderStatusValue, cancelled_by: p.cancelled_by ?? prev.cancelled_by, items: p.items ?? prev.items, updated_at: p.updated_at ?? prev.updated_at } : prev))
        setLastUpdatedAt(Date.now())
      })
      .subscribe((status) => setLiveConnected(status === 'SUBSCRIBED'))

    return () => { client.removeChannel(channel) }
  }, [orderId, accessToken])

  // Reconcile fallback — not aggressive polling: only re-reads when the tab
  // regains focus/visibility (covers a missed broadcast after the phone was
  // locked or the tab was backgrounded), same principle as production's
  // reconcile-on-focus, without its repeating-timer tiers (kept minimal for
  // this phase, since the broadcast channel above is the primary mechanism).
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
    }
  }, [load])

  const formatPrice = (n: number) => n.toLocaleString(lang === 'en' ? 'en-US' : 'ar-SA')

  if (loadState === 'loading') {
    return (
      <div className="menu-empty" role="status" aria-live="polite">
        <div className="order-status-spinner" />
        <p>{strings.orderLoadingTitle}</p>
      </div>
    )
  }

  if (loadState === 'error' || !data) {
    return (
      <div className="menu-empty">
        <h1>{strings.orderErrorLoadTitle}</h1>
        <p>{strings.orderErrorLoadBody}</p>
        <Link href={`/menu/${slug}`} className="checkout-back-link">{strings.backToMenu}</Link>
      </div>
    )
  }

  const isCancelled = data.status === 'cancelled'
  const isCompleted = data.status === 'completed'
  const currentStepIndex = TIMELINE_STEPS.indexOf(data.status)

  return (
    <div className="order-status">
      {isFresh && !isCancelled && (
        <div className="order-status__success-banner">
          <div className="order-status__success-icon">✅</div>
          <h1>{strings.orderSuccessTitle}</h1>
        </div>
      )}

      <div className="order-status__card">
        <div className="order-status__row">
          <span>{strings.orderSuccessNumber}</span>
          <strong dir="ltr">{data.order_number}</strong>
        </div>
        <div className="order-status__row">
          <span>{strings.orderRestaurant}</span>
          <strong>{restaurantName}</strong>
        </div>
        {branchName && (
          <div className="order-status__row">
            <span>{strings.orderBranch}</span>
            <strong>{branchName}</strong>
          </div>
        )}
        {placedAt && (
          <div className="order-status__row">
            <span>{strings.orderPlacedAt}</span>
            <strong>{new Date(placedAt).toLocaleTimeString(lang === 'en' ? 'en-US' : 'ar', { hour: '2-digit', minute: '2-digit' })}</strong>
          </div>
        )}
        <div className="order-status__row order-status__row--total">
          <span>{strings.orderSuccessTotal}</span>
          <strong style={{ color: priceColor }}>{formatPrice(data.total)} {currency}</strong>
        </div>
      </div>

      {liveConnected && (
        <div className="order-status__live">
          <span className="order-status__live-dot" />
          {strings.liveIndicator}
        </div>
      )}

      {isCancelled ? (
        <div className="order-status__cancelled">
          <div className="order-status__cancelled-icon">🚫</div>
          <div className="order-status__cancelled-label">{strings.statusCancelled}</div>
          <p>{data.cancelled_by === 'customer' ? strings.cancelledByCustomer : strings.cancelledByRestaurant}</p>
          <p>{strings.cancelledBody}</p>
        </div>
      ) : (
        <div className="order-status__timeline">
          {TIMELINE_STEPS.map((step, i) => {
            const label = ({ pending: strings.statusPending, preparing: strings.statusPreparing, ready: strings.statusReady, completed: strings.statusCompleted, cancelled: strings.statusCancelled } as Record<OrderStatusValue, string>)[step]
            const reached = i <= currentStepIndex
            const active = i === currentStepIndex
            return (
              <div key={step} className={`order-status__step${reached ? ' is-reached' : ''}${active ? ' is-active' : ''}`}>
                <div className="order-status__step-dot" style={reached ? { background: priceColor, borderColor: priceColor } : undefined} />
                <div className="order-status__step-label">{label}</div>
              </div>
            )
          })}
        </div>
      )}

      {isCompleted && <p className="order-status__completed-note">{strings.completedBody}</p>}

      {lastUpdatedAt && (
        <div className="order-status__updated">{strings.lastUpdated}: {new Date(lastUpdatedAt).toLocaleTimeString(lang === 'en' ? 'en-US' : 'ar', { hour: '2-digit', minute: '2-digit' })}</div>
      )}

      <Link href={`/menu/${slug}`} className="checkout-back-link order-status__back">{strings.backToMenu}</Link>
    </div>
  )
}
