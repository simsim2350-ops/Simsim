'use client'

import { useEffect, useState } from 'react'
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
    const { matched, skippedCount } = await resolveReorder(order)
    setReorderingId(null)
    if (matched.length === 0) return
    matched.forEach(({ product, qty }) => {
      addToCart({ id: product.id, name: product.name, nameEn: product.name_en, price: product.price, imageUrl: product.image_url, emoji: product.emoji }, order.branchId!, restaurantName, [], qty)
    })
    void skippedCount
    router.push(`/menu/${slug}${isEn ? '?lang=en' : ''}`)
  }

  const statusLabel: Record<StoredOrder['status'], string> = {
    pending: strings.statusPending,
    preparing: strings.statusPreparing,
    ready: strings.statusReady,
    completed: strings.statusCompleted,
    cancelled: strings.statusCancelled,
  }

  const renderOrderCard = (order: StoredOrder, isActive: boolean) => {
    const waUrl = restaurantPhone ? buildWhatsAppOrderUrl(restaurantPhone, restaurantName, order.orderNumber, isEn) : null
    const needsReview = order.status === 'completed' && !reviewedIds.includes(order.id)
    const draft = drafts[order.id] || { rating: 0, comment: '' }

    return (
      <div key={order.id} className="my-orders__card">
        <div className="my-orders__card-row">
          <strong dir="ltr">{order.orderNumber}</strong>
          <span className={`my-orders__status my-orders__status--${order.status}`}>{statusLabel[order.status]}</span>
        </div>
        <div className="my-orders__card-row my-orders__card-row--muted">
          <span>{strings.orderSuccessTotal}</span>
          <span style={{ color: priceColor }}>{formatPrice(order.total)} {currency}</span>
        </div>

        {isActive && (
          <div className="my-orders__actions">
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
            {waUrl && <a href={waUrl} target="_blank" rel="noopener noreferrer" className="my-orders__wa-btn">💬 {strings.contactAboutOrder}</a>}
          </div>
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

      {loyalty && <LoyaltyCard loyalty={loyalty} brandColor={brandColor} lang={lang} />}

      {loaded && orders.length === 0 && (
        <div className="menu-empty">
          <span style={{ fontSize: '44px' }}>🧾</span>
          <h1>{strings.noOrdersYet}</h1>
          <Link href={`/menu/${slug}${isEn ? '?lang=en' : ''}`} className="checkout-back-link">{strings.browseMenu}</Link>
        </div>
      )}

      {activeList.length > 0 && (
        <>
          <div className="my-orders__section-title">{strings.activeNow}</div>
          {activeList.map((o) => renderOrderCard(o, true))}
        </>
      )}

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
