'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { t } from '@/lib/i18n'
import type { Lang } from '@/lib/types'
import { useCart } from '@/lib/cart/CartContext'
import { useActiveOrders } from '@/lib/orders/useActiveOrders'
import type { StoredOrder } from '@/lib/orders/types'
import { getCustomerLoyalty, getRememberedPhone, type LoyaltyInfo } from '@/lib/loyalty'
import { getReviewedIds, markReviewed, submitReview } from '@/lib/reviews'
import { buildWhatsAppOrderUrl } from '@/lib/whatsapp'
import { resolveReorder } from '@/lib/orders/reorder'
import { LoyaltyCard } from './LoyaltyCard'
import { BranchConflictModal } from './BranchConflictModal'

const IS_ACTIVE = (s: StoredOrder['status']) => s === 'pending' || s === 'preparing' || s === 'ready'

// Same 4 forward-progress steps as OrderStatusView.tsx's own TIMELINE_STEPS
// (that file's the real, single, existing order-tracking page — this is a
// compact inline echo of its timeline for the order card here, reusing the
// exact same .order-status__timeline/.order-status__step CSS classes so the
// two read as one consistent design language, not two timelines). 'cancelled'
// is deliberately not a step here either, same reasoning as that file.
const TIMELINE_STEPS: StoredOrder['status'][] = ['pending', 'preparing', 'ready', 'completed']

// Smart product summary for a past order's card (#6) — real order.items only
// (name/qty as actually stored with the order), never invented. Caps at 3
// named items before collapsing the rest into "+ N more", matching the
// brief's own two examples.
function summarizeItems(items: StoredOrder['items'], moreItemsText: (n: number) => string): string | null {
  const named = items.filter((i) => i.name)
  if (named.length === 0) return null
  const CAP = 3
  const shown = named.slice(0, CAP).map((i) => `${i.name} ×${i.qty || 1}`)
  const rest = named.length - shown.length
  return rest > 0 ? `${shown.join(' + ')} ${moreItemsText(rest)}` : shown.join(' + ')
}

// #4 Realtime Multi-Order Tracking + #6 Post-Order Rating + #7 WhatsApp about
// order + #8 Reorder + #1 Loyalty — all ported here together because, in the
// old menu, they all lived in the same screen (OrdersScreen.jsx) and share
// the same underlying order list. OrderStatusView.tsx (the single, just-
// placed order confirmation page) is untouched — this is the separate,
// device-wide "My Orders" surface the old menu also kept separate.
export function MyOrdersView({
  slug, restaurantId, restaurantName, restaurantPhone, brandColor, priceColor, currency, lang,
}: {
  slug: string
  restaurantId: string
  restaurantName: string
  restaurantPhone: string | null
  brandColor: string
  priceColor: string
  currency: string
  lang: Lang
}) {
  const strings = t(lang)
  const isEn = lang === 'en'
  const router = useRouter()
  const { addToCart } = useCart()
  const { orders, loaded, cancelOrderByCustomer } = useActiveOrders(slug)
  const [loyalty, setLoyalty] = useState<LoyaltyInfo | null>(null)
  const [reviewedIds, setReviewedIds] = useState<string[]>([])
  const [drafts, setDrafts] = useState<Record<string, { rating: number; comment: string }>>({})
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [reorderingId, setReorderingId] = useState<string | null>(null)
  // Reorder feedback (#7) — a real result of resolveReorder() for that
  // specific order card, never a generic/blind "success". Cleared on the
  // next reorder attempt (any order) so a stale message can't linger.
  const [reorderFeedback, setReorderFeedback] = useState<{ orderId: string; text: string; ok: boolean } | null>(null)
  const navigateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (navigateTimerRef.current) clearTimeout(navigateTimerRef.current) }, [])

  useEffect(() => {
    setReviewedIds(getReviewedIds(slug))
    const phone = getRememberedPhone(slug)
    if (phone) getCustomerLoyalty(restaurantId, phone).then(setLoyalty)
  }, [slug, restaurantId])

  const formatPrice = (n: number) => n.toLocaleString(isEn ? 'en-US' : 'ar-SA')

  const activeList = orders.filter((o) => IS_ACTIVE(o.status))
  const pastList = orders
    .filter((o) => o.status === 'completed' || o.status === 'cancelled')
    .slice()
    .sort((a, b) => {
      const aNeeds = a.status === 'completed' && !reviewedIds.includes(a.id) ? 1 : 0
      const bNeeds = b.status === 'completed' && !reviewedIds.includes(b.id) ? 1 : 0
      return bNeeds - aNeeds
    })

  const handleSubmitReview = async (order: StoredOrder) => {
    const draft = drafts[order.id]
    if (!draft || draft.rating < 1) return
    setSubmittingId(order.id)
    const ok = await submitReview(order.id, draft.rating, draft.comment || '')
    setSubmittingId(null)
    if (ok) {
      markReviewed(slug, order.id)
      setReviewedIds((prev) => [...prev, order.id])
    }
  }

  const handleReorder = async (order: StoredOrder) => {
    setReorderingId(order.id)
    setReorderFeedback(null)
    const { matched, skippedCount } = await resolveReorder(order)
    setReorderingId(null)
    if (matched.length === 0) {
      setReorderFeedback({ orderId: order.id, text: strings.reorderFailed, ok: false })
      return
    }
    matched.forEach(({ product, qty }) => {
      addToCart({ id: product.id, name: product.name, nameEn: product.name_en, price: product.price, imageUrl: product.image_url, emoji: product.emoji }, order.branchId!, restaurantName, [], qty)
    })
    const text = skippedCount > 0 ? `${strings.reorderAdded} — ${strings.reorderUnavailableNote(skippedCount)}` : strings.reorderAdded
    setReorderFeedback({ orderId: order.id, text, ok: true })
    // A brief, real confirmation before leaving this page — long enough to
    // read, short enough not to feel stuck (matches AddToCartButton.tsx's
    // own ~900ms quick-add feedback window elsewhere in this app).
    navigateTimerRef.current = setTimeout(() => router.push(`/menu/${slug}${isEn ? '?lang=en' : ''}`), 900)
  }

  const statusLabel: Record<StoredOrder['status'], string> = {
    pending: strings.statusPending,
    preparing: strings.statusPreparing,
    ready: strings.statusReady,
    completed: strings.statusCompleted,
    cancelled: strings.statusCancelled,
  }

  // Links straight into the existing, single order-tracking/details page
  // (OrderStatusView, at /menu/[slug]/order/[orderId]) — no new details
  // screen. Only rendered when the order actually carries an accessToken:
  // without one, that page can't securely load the order at all (its RLS
  // requires it), so a button that led nowhere real would be worse than no
  // button — same "don't imply unsupported tracking" rule the brief itself
  // asks for.
  const statusHref = (order: StoredOrder) => {
    if (!order.accessToken) return null
    const params = new URLSearchParams({ token: order.accessToken })
    if (order.createdAt) params.set('placedAt', new Date(order.createdAt).toISOString())
    if (isEn) params.set('lang', 'en')
    return `/menu/${slug}/order/${order.id}?${params.toString()}`
  }

  const renderOrderCard = (order: StoredOrder, isActive: boolean) => {
    const waUrl = restaurantPhone ? buildWhatsAppOrderUrl(restaurantPhone, restaurantName, order.orderNumber, isEn) : null
    const needsReview = order.status === 'completed' && !reviewedIds.includes(order.id)
    const draft = drafts[order.id] || { rating: 0, comment: '' }
    const href = statusHref(order)
    const itemsSummary = !isActive ? summarizeItems(order.items, strings.moreItems) : null
    const feedback = reorderFeedback?.orderId === order.id ? reorderFeedback : null
    const currentStepIndex = TIMELINE_STEPS.indexOf(order.status)

    return (
      <div key={order.id} className={`my-orders__card${isActive ? ' my-orders__card--active' : ''}`} style={isActive ? { borderColor: priceColor } : undefined}>
        <div className="my-orders__card-row">
          <strong dir="ltr">{order.orderNumber}</strong>
          <span className={`my-orders__status my-orders__status--${order.status}`}>{statusLabel[order.status]}</span>
        </div>
        <div className="my-orders__card-row my-orders__card-row--muted">
          <span>{strings.orderSuccessTotal}</span>
          <span style={{ color: priceColor }}>{formatPrice(order.total)} {currency}</span>
        </div>

        {itemsSummary && <p className="my-orders__items-summary">{itemsSummary}</p>}

        {isActive && order.status !== 'cancelled' && currentStepIndex >= 0 && (
          <div className="order-status__timeline order-status__timeline--compact">
            {TIMELINE_STEPS.map((step, i) => {
              const reached = i <= currentStepIndex
              return (
                <div key={step} className={`order-status__step${reached ? ' is-reached' : ''}${i === currentStepIndex ? ' is-active' : ''}`}>
                  <div className="order-status__step-dot" style={reached ? { background: priceColor, borderColor: priceColor } : undefined} />
                  <div className="order-status__step-label">{statusLabel[step]}</div>
                </div>
              )
            })}
          </div>
        )}

        {isActive && (
          <div className="my-orders__actions">
            {href && <Link href={href} className="my-orders__track-btn" style={{ background: priceColor }}>📍 {strings.trackOrder}</Link>}
            {waUrl && <a href={waUrl} target="_blank" rel="noopener noreferrer" className="my-orders__wa-btn">💬 {strings.contactAboutOrder}</a>}
            {order.status === 'pending' && (
              <button type="button" className="my-orders__cancel-btn" onClick={() => cancelOrderByCustomer(order)}>{strings.cancelOrder}</button>
            )}
          </div>
        )}

        {!isActive && order.status !== 'cancelled' && (
          <div className="my-orders__actions">
            <button type="button" className="my-orders__reorder-btn" style={{ background: priceColor }} disabled={reorderingId === order.id} onClick={() => handleReorder(order)}>
              {reorderingId === order.id ? strings.processing : strings.reorder}
            </button>
            {href && <Link href={href} className="my-orders__details-btn">{strings.orderDetails}</Link>}
            {waUrl && <a href={waUrl} target="_blank" rel="noopener noreferrer" className="my-orders__wa-btn">💬 {strings.contactAboutOrder}</a>}
          </div>
        )}

        {!isActive && order.status === 'cancelled' && href && (
          <div className="my-orders__actions">
            <Link href={href} className="my-orders__details-btn">{strings.orderDetails}</Link>
          </div>
        )}

        {feedback && (
          <p className={`my-orders__reorder-feedback${feedback.ok ? '' : ' is-error'}`} role="status">{feedback.text}</p>
        )}

        {needsReview && (
          <div className="my-orders__review">
            <div className="my-orders__stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`my-orders__star${draft.rating >= n ? ' is-filled' : ''}`}
                  aria-label={`${n}`}
                  onClick={() => setDrafts((prev) => ({ ...prev, [order.id]: { ...draft, rating: n } }))}
                >★</button>
              ))}
            </div>
            <textarea
              className="my-orders__review-input"
              placeholder={strings.reviewCommentPh}
              value={draft.comment}
              onChange={(e) => setDrafts((prev) => ({ ...prev, [order.id]: { ...draft, comment: e.target.value } }))}
            />
            <button type="button" className="my-orders__review-submit" style={{ background: priceColor }} disabled={draft.rating < 1 || submittingId === order.id} onClick={() => handleSubmitReview(order)}>
              {submittingId === order.id ? strings.processing : strings.submitReview}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="my-orders">
      <div className="my-orders__header">
        <h1>{strings.myOrders}</h1>
        <Link href={`/menu/${slug}${isEn ? '?lang=en' : ''}`} className="checkout-back-link">{strings.browseMenu}</Link>
      </div>

      {loaded && orders.length === 0 && (
        <div className="menu-empty">
          <span style={{ fontSize: '44px' }}>🍽️</span>
          <h1>{strings.noOrdersYet}</h1>
          <p>{strings.noOrdersYetBody}</p>
          <Link href={`/menu/${slug}${isEn ? '?lang=en' : ''}`} className="checkout-back-link">{strings.browseMenu}</Link>
        </div>
      )}

      {/* Current order(s) first and most prominent — the page's whole point
          is answering "where's my order?" before anything else. */}
      {activeList.length > 0 && (
        <>
          <div className="my-orders__section-title">{strings.activeNow}</div>
          {activeList.map((o) => renderOrderCard(o, true))}
        </>
      )}

      {/* Loyalty next — after the current order, before history, per the
          brief's own page order. Deliberately smaller/quieter than the
          active-order card above it (see .loyalty-card's compacted sizing
          in globals.css) so it never competes with "where's my order". */}
      {loyalty && <LoyaltyCard loyalty={loyalty} brandColor={brandColor} lang={lang} />}

      {pastList.length > 0 && (
        <>
          <div className="my-orders__section-title">{strings.pastOrders}</div>
          {pastList.map((o) => renderOrderCard(o, false))}
        </>
      )}

      <BranchConflictModal lang={lang} />
    </div>
  )
}
