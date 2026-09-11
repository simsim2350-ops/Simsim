'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { t } from '@/lib/i18n'
import type { Lang } from '@/lib/types'
import { useCart } from '@/lib/cart/CartContext'
import { supabaseBrowser } from '@/lib/supabase/client'
import { getOrderStatus } from '@/lib/orders/getOrderStatus'
import { mergeBroadcastItems, type OrderStatusData, type OrderStatusValue } from '@/lib/orders/types'
import { resolveReorder } from '@/lib/orders/reorder'
import { getReviewedIds, markReviewed, submitReview } from '@/lib/reviews'

// The 4 forward-progress steps, in order — 'cancelled' is deliberately not a
// step in this list (it's a terminal state that replaces the timeline, same
// treatment as production's own Orders.jsx, which keeps cancelled as its own
// separate column rather than a step in the pending→...→completed sequence).
const TIMELINE_STEPS: OrderStatusValue[] = ['pending', 'preparing', 'ready', 'completed']

export function OrderStatusView({
  orderId, accessToken, slug, restaurantName, branchName, branchId, placedAt,
  currency, priceColor, lang, isFresh,
}: {
  orderId: string
  accessToken: string
  slug: string
  restaurantName: string
  branchName: string | null
  // Additive (see CheckoutForm.tsx's own redirect) — only present for an
  // order placed after this change shipped; older links to this page simply
  // omit it, which the Reorder button below already treats as "not offered"
  // rather than guessing a branch.
  branchId?: string | null
  placedAt: string | null
  currency: string
  priceColor: string
  lang: Lang
  isFresh: boolean
}) {
  const strings = t(lang)
  const router = useRouter()
  const { addToCart } = useCart()
  const [data, setData] = useState<OrderStatusData | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [liveConnected, setLiveConnected] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)
  const [reviewed, setReviewed] = useState(false)
  const [reviewDraft, setReviewDraft] = useState<{ rating: number; comment: string }>({ rating: 0, comment: '' })
  const [submittingReview, setSubmittingReview] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [reorderFeedback, setReorderFeedback] = useState<{ text: string; ok: boolean } | null>(null)
  const mountedRef = useRef(true)
  const navigateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setReviewed(getReviewedIds(slug).includes(orderId)) }, [slug, orderId])
  useEffect(() => () => { if (navigateTimerRef.current) clearTimeout(navigateTimerRef.current) }, [])

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
        setData((prev) => (prev ? { ...prev, status: p.status as OrderStatusValue, cancelled_by: p.cancelled_by ?? prev.cancelled_by, items: mergeBroadcastItems(prev.items, p.items), updated_at: p.updated_at ?? prev.updated_at } : prev))
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

  // Reuses the exact same review flow MyOrdersView.tsx already has (same
  // submit_review RPC, same localStorage dedup) — no second rating system.
  const handleSubmitReview = async () => {
    if (reviewDraft.rating < 1) return
    setSubmittingReview(true)
    const ok = await submitReview(orderId, reviewDraft.rating, reviewDraft.comment)
    setSubmittingReview(false)
    if (ok) {
      markReviewed(slug, orderId)
      setReviewed(true)
    }
  }

  // Reuses the exact same resolveReorder() MyOrdersView.tsx already has (same
  // current-availability/price check, same branch scoping) — only offered
  // when this order's page actually has a branchId to check against (see the
  // prop comment above).
  const handleReorder = async () => {
    if (!branchId || !data) return
    setReordering(true)
    setReorderFeedback(null)
    const { matched, skippedCount } = await resolveReorder({ items: data.items, branchId })
    setReordering(false)
    if (matched.length === 0) {
      setReorderFeedback({ text: strings.reorderFailed, ok: false })
      return
    }
    matched.forEach(({ product, qty }) => {
      addToCart({ id: product.id, name: product.name, nameEn: product.name_en, price: product.price, imageUrl: product.image_url, emoji: product.emoji }, branchId, restaurantName, [], qty)
    })
    const text = skippedCount > 0 ? `${strings.reorderAdded} — ${strings.reorderUnavailableNote(skippedCount)}` : strings.reorderAdded
    setReorderFeedback({ text, ok: true })
    navigateTimerRef.current = setTimeout(() => router.push(`/menu/${slug}${lang === 'en' ? '?lang=en' : ''}`), 900)
  }

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
  const isActiveStatus = !isCancelled && !isCompleted
  const currentStepIndex = TIMELINE_STEPS.indexOf(data.status)
  const statusLabel = ({ pending: strings.statusPending, preparing: strings.statusPreparing, ready: strings.statusReady, completed: strings.statusCompleted, cancelled: strings.statusCancelled } as Record<OrderStatusValue, string>)[data.status]
  // Every description here maps 1:1 to a real, already-existing status value
  // (OrderStatusValue) — no new state was invented. A status this component
  // somehow doesn't recognize (should never happen — it's a DB CHECK
  // constraint) simply shows no description rather than a made-up one.
  const statusDescription = ({
    pending: strings.orderStatusDescPending,
    preparing: strings.orderStatusDescPreparing,
    ready: strings.orderStatusDescReady,
    completed: strings.orderStatusDescCompleted,
  } as Partial<Record<OrderStatusValue, string>>)[data.status]
  // Items missing a name (an older order predating the checkout fix that
  // started storing it, or genuinely incomplete data) are skipped rather
  // than rendered as "undefined" — never a fabricated name.
  const namedItems = data.items.filter((i): i is typeof i & { name: string } => Boolean(i.name))

  return (
    <div className="order-status">
      {isFresh && data.status === 'pending' && (
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
      </div>

      {/* "طلبك الآن" — the current status is the single most important thing
          on this page, so it gets its own prominent card ahead of the info
          card above, not just a small badge next to the order number. */}
      {!isCancelled && (
        <div className="order-status__current" style={{ borderInlineStartColor: priceColor }}>
          <div className="order-status__current-title">{strings.yourOrderNow}</div>
          <div className="order-status__current-label" style={{ color: priceColor }}>{statusLabel}</div>
          {statusDescription && <p className="order-status__current-desc">{statusDescription}</p>}
        </div>
      )}

      {isActiveStatus && (
        liveConnected ? (
          <div className="order-status__live">
            <span className="order-status__live-dot" />
            {strings.liveIndicator}
          </div>
        ) : (
          <div className="order-status__live order-status__live--reconnecting">
            <span className="order-status__live-dot order-status__live-dot--off" />
            {strings.reconnecting}
          </div>
        )
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

      {/* Order Summary — real order.items only (see namedItems above); never
          mock data. This is the same get_orders_status_secure row already
          loaded for everything above, not a second fetch. */}
      <div className="order-status__summary">
        <div className="order-status__summary-title">{strings.orderSummaryLabel}</div>
        {namedItems.length > 0 && (
          <div className="order-status__summary-list">
            {namedItems.map((item, i) => (
              <div key={`${item.id}-${i}`} className="order-status__summary-row">
                <span>{lang === 'en' && item.name_en ? item.name_en : item.name}</span>
                <span dir="ltr">×{item.qty || 1}</span>
              </div>
            ))}
          </div>
        )}
        <div className="order-status__row order-status__row--total">
          <span>{strings.orderSuccessTotal}</span>
          <strong style={{ color: priceColor }}>{formatPrice(data.total)} {currency}</strong>
        </div>
      </div>

      {isCompleted && (
        <div className="order-status__celebration">
          <div className="order-status__celebration-title">{strings.orderCompletedCelebration}</div>
          <p>{strings.completedBody}</p>

          {!reviewed && (
            <div className="order-status__review">
              <div className="order-status__review-prompt">{strings.howWasYourExperience}</div>
              <div className="my-orders__stars">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`my-orders__star${reviewDraft.rating >= n ? ' is-filled' : ''}`}
                    aria-label={`${n}`}
                    onClick={() => setReviewDraft((prev) => ({ ...prev, rating: n }))}
                  >★</button>
                ))}
              </div>
              <textarea
                className="my-orders__review-input"
                placeholder={strings.reviewCommentPh}
                value={reviewDraft.comment}
                onChange={(e) => setReviewDraft((prev) => ({ ...prev, comment: e.target.value }))}
              />
              <button type="button" className="my-orders__review-submit" style={{ background: priceColor }} disabled={reviewDraft.rating < 1 || submittingReview} onClick={handleSubmitReview}>
                {submittingReview ? strings.processing : strings.submitReview}
              </button>
            </div>
          )}

          {branchId && (
            <>
              <button type="button" className="order-status__reorder-btn" style={{ background: priceColor }} disabled={reordering} onClick={handleReorder}>
                {reordering ? strings.processing : strings.reorder}
              </button>
              {reorderFeedback && (
                <p className={`my-orders__reorder-feedback${reorderFeedback.ok ? '' : ' is-error'}`} role="status">{reorderFeedback.text}</p>
              )}
            </>
          )}
        </div>
      )}

      {lastUpdatedAt && (
        <div className="order-status__updated">{strings.lastUpdated}: {new Date(lastUpdatedAt).toLocaleTimeString(lang === 'en' ? 'en-US' : 'ar', { hour: '2-digit', minute: '2-digit' })}</div>
      )}

      <Link href={`/menu/${slug}`} className="checkout-back-link order-status__back">{strings.backToMenu}</Link>
    </div>
  )
}
