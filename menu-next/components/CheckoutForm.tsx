'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCart } from '@/lib/cart/CartContext'
import { t } from '@/lib/i18n'
import type { Lang } from '@/lib/types'
import { vatBreakdown } from '@/lib/pricing'
import type { OpenStatus } from '@/lib/openStatus'
import { supabaseBrowser } from '@/lib/supabase/client'
import { mapOrderError, priceChangedMessage, itemsUnavailableMessage, networkErrorMessage } from '@/lib/orderErrors'

type OrderType = 'dine_in' | 'takeaway' | 'delivery'
type Status = 'idle' | 'submitting' | 'success' | 'error'

// Client Component — reads the cart from CartContext and renders + submits
// the order form. Phase 4D connects this to the real, existing create_order
// RPC (SECURITY DEFINER, safe with the public anon key — verified in Phase
// 4C's schema audit). Field set, validation rules, RPC payload shape, and
// error mapping are all ported from src/features/menu/hooks/useCheckout.js
// and src/features/menu/orderErrors.js — not invented.
export function CheckoutForm({
  slug, restaurantId, branchId, branchName, restaurantName, currency, priceColor, lang,
  openStatus, deliveryEnabled, deliveryFee, takeawayEnabled, availableProductIds, resolvedTableName,
}: {
  slug: string
  restaurantId: string
  branchId: string
  branchName: string
  restaurantName: string
  currency: string
  priceColor: string
  lang: Lang
  openStatus: OpenStatus
  deliveryEnabled: boolean
  deliveryFee: number
  takeawayEnabled: boolean
  availableProductIds: string[]
  // Non-null only when a real, resolved table-QR token (?table=) is behind
  // this checkout — same server-verified contract as src/pages/PublicMenu.jsx's
  // own tableQr. When present, the order is locked to dine-in at this exact
  // table: the order-type picker and delivery/table inputs are not offered,
  // matching the legacy app's own behavior (a scanned table QR is not a
  // suggestion the customer can override).
  resolvedTableName: string | null
}) {
  const router = useRouter()
  const { items, count, subtotal, branchId: cartBranchId, idempotencyKey, clearCart } = useCart()
  const strings = t(lang)

  const [orderType, setOrderType] = useState<OrderType>('dine_in')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [tableNumber, setTableNumber] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [orderNote, setOrderNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState<string>('')

  // Synchronous guard against a double-click/double-tap submitting twice
  // before React re-renders the disabled button — the disabled attribute
  // alone is a render away, this ref is checked immediately.
  const submittingRef = useRef(false)

  const formatPrice = (n: number) => n.toLocaleString(lang === 'en' ? 'en-US' : 'ar-SA')

  if (count === 0) {
    return (
      <div className="menu-empty">
        <span style={{ fontSize: '44px' }}>🛒</span>
        <h1>{strings.cartEmpty}</h1>
        <p>{strings.cartEmptyBody}</p>
        <Link href={`/menu/${slug}`} className="checkout-back-link">{strings.browseMenu}</Link>
      </div>
    )
  }

  // Cart belongs to a different branch than this checkout page's branch —
  // can only happen from a manually-edited URL, since the cart sheet always
  // links to checkout with the cart's own branch. Blocked rather than guessed.
  if (cartBranchId && cartBranchId !== branchId) {
    return (
      <div className="menu-empty">
        <h1>{strings.branchConflictTitle}</h1>
        <Link href={`/menu/${slug}`} className="checkout-back-link">{strings.backToMenu}</Link>
      </div>
    )
  }

  const deliveryFeeApplied = orderType === 'delivery' ? deliveryFee : 0
  const total = subtotal + deliveryFeeApplied
  const { tax } = vatBreakdown(total - deliveryFeeApplied)

  const handlePhoneChange = (raw: string) => {
    let digits = raw.replace(/[^\d]/g, '')
    if (digits.startsWith('00966')) digits = digits.slice(5)
    else if (digits.startsWith('966')) digits = digits.slice(3)
    if (digits.startsWith('0')) digits = digits.slice(1)
    digits = digits.slice(0, 9)
    if (digits && digits[0] !== '5') return
    setCustomerPhone(digits)
  }

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    // A resolved table is already server-verified — nothing to validate for
    // order type/table/delivery in that case; the picker and those inputs
    // aren't even rendered (see JSX below).
    if (!resolvedTableName) {
      if (orderType === 'dine_in' && !tableNumber.trim()) next.tableNumber = strings.errRequired
      if (orderType === 'delivery' && !deliveryAddress.trim()) next.deliveryAddress = strings.errRequired
    }
    if (!customerPhone.trim()) next.customerPhone = strings.errRequired
    else if (!/^5\d{8}$/.test(customerPhone)) next.customerPhone = strings.errPhone
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Guard is claimed as the very first thing this handler does, before any
    // other logic — a second overlapping submit (double-tap, or a second
    // click event queued before this one finishes its synchronous prefix)
    // must see the flag already set. Reset in every early-return branch below
    // so a mere validation failure doesn't leave the form stuck disabled.
    if (submittingRef.current) return
    submittingRef.current = true

    if (!openStatus.open) { submittingRef.current = false; return }
    if (!validate()) { submittingRef.current = false; return }

    // Cart items must still belong to this branch's currently-available
    // product set — catches an item deleted/made unavailable since it was
    // added, mirroring production's own validateCartAgainstProducts check
    // (TASK-CART-003), without needing per-item UI badges (kept minimal,
    // per this phase's "don't redesign checkout" instruction).
    const availableSet = new Set(availableProductIds)
    if (items.some((i) => !availableSet.has(i.productId))) {
      submittingRef.current = false
      setStatus('error')
      setErrorMessage(itemsUnavailableMessage[lang])
      return
    }

    setStatus('submitting')
    setErrorMessage('')

    // options only ever carries {groupName, choiceName} — never a price.
    // create_order looks up the real choice price itself from the live
    // products.options row and rejects anything that doesn't match a real
    // choice, so there is nothing for the client to assert about price here.
    const rpcItems = items.map((i) => ({
      product_id: i.productId,
      quantity: i.qty,
      notes: '',
      options: i.selectedOptions.map((o) => ({ groupName: o.groupName, choiceName: o.choiceName })),
    }))

    const client = supabaseBrowser()
    if (!client) {
      submittingRef.current = false
      setStatus('error')
      setErrorMessage(networkErrorMessage[lang])
      return
    }

    // menu-next has no generated Supabase `Database` type (no codegen step in
    // this project), so the client's .rpc() falls back to a strict default
    // overload that rejects a second argument entirely. The `as any` here is
    // scoped to this one call's argument object only — it does not weaken
    // anything else, and the actual param names/shapes above are exactly
    // create_order's real signature, verified against the live schema in
    // Phase 4C, not guessed.
    const rpcArgs = {
      p_restaurant_id: restaurantId,
      p_branch_id: branchId,
      p_table_number: resolvedTableName ?? (orderType === 'dine_in' ? tableNumber.trim() : null),
      p_delivery_address: resolvedTableName ? null : (orderType === 'delivery' ? deliveryAddress.trim() : null),
      p_customer_name: customerName.trim() || null,
      p_customer_phone: customerPhone,
      p_type: resolvedTableName ? 'dine_in' : orderType,
      p_items: rpcItems,
      p_notes: orderNote.trim(),
      p_coupon_code: null,
      p_client_total: total,
      p_idempotency_key: idempotencyKey,
    }

    let result
    try {
      result = await client.rpc('create_order', rpcArgs as never).single()
    } catch {
      // Network exception (offline, DNS, etc.) — never shown as a raw error.
      submittingRef.current = false
      setStatus('error')
      setErrorMessage(networkErrorMessage[lang])
      return
    }

    const { data, error } = result as { data: { id: string; order_number: string; total: number; price_changed: boolean; access_token: string | null } | null; error: { message: string } | null }

    if (error) {
      // Full technical error stays in the dev console only — never shown to the customer.
      console.error('create_order error:', error)
      submittingRef.current = false
      setStatus('error')
      setErrorMessage(mapOrderError(error.message, lang))
      return
    }

    if (!data?.id || data.price_changed) {
      // create_order does not insert a row in this case (verified in Phase
      // 4C) — nothing was created, so the cart is correctly left untouched.
      submittingRef.current = false
      setStatus('error')
      setErrorMessage(priceChangedMessage[lang])
      return
    }

    // Real success — clear the cart only now, after create_order has
    // actually confirmed the row exists, then navigate to the dedicated
    // Order Status page (Phase 4F) — it re-fetches the order itself via the
    // safe get_orders_status_secure RPC using the id+access_token carried in
    // the URL, so it never depends on this component's state or the cart,
    // and stays fully functional on refresh / direct navigation later.
    clearCart()
    setStatus('success')
    const qs = new URLSearchParams({
      fresh: '1',
      branch: branchName,
      placedAt: new Date().toISOString(),
      ...(data.access_token ? { token: data.access_token } : {}),
      ...(lang === 'en' ? { lang: 'en' } : {}),
    })
    router.push(`/menu/${slug}/order/${data.id}?${qs.toString()}`)
  }

  return (
    <form className="checkout-form" onSubmit={handleSubmit}>
      <h1 className="checkout-form__title">{strings.checkoutTitle} — {restaurantName}</h1>

      <div className="checkout-form__items">
        {items.map((item) => {
          const name = lang === 'en' && item.nameEn ? item.nameEn : item.name
          const optsText = item.selectedOptions.map((o) => o.choiceName).filter(Boolean).join(lang === 'en' ? ', ' : '، ')
          return (
            <div key={item.cartKey} className="checkout-form__item-row-wrap">
              <div className="checkout-form__item-row">
                <span>{item.qty}× {name}</span>
                <span>{formatPrice(item.price * item.qty)} {currency}</span>
              </div>
              {optsText && <div className="checkout-form__item-options">{optsText}</div>}
            </div>
          )
        })}
      </div>

      {resolvedTableName ? (
        // A scanned, server-verified table QR locks the order to dine-in at
        // this exact table — no picker, no manual table entry, matching
        // src/pages/PublicMenu.jsx's own tableQr behavior.
        <div className="checkout-form__section">
          <label className="checkout-form__label">{strings.tableNumber}</label>
          <div className="checkout-form__input" aria-readonly="true">{resolvedTableName}</div>
        </div>
      ) : (
        <>
          <div className="checkout-form__section">
            <label className="checkout-form__label">{strings.orderType}</label>
            <div className="checkout-form__order-type-grid">
              <button type="button" className={`checkout-form__type-btn${orderType === 'dine_in' ? ' is-active' : ''}`} style={orderType === 'dine_in' ? { borderColor: priceColor, color: priceColor } : undefined} onClick={() => setOrderType('dine_in')}>{strings.orderTypeDineIn}</button>
              {takeawayEnabled && (
                <button type="button" className={`checkout-form__type-btn${orderType === 'takeaway' ? ' is-active' : ''}`} style={orderType === 'takeaway' ? { borderColor: priceColor, color: priceColor } : undefined} onClick={() => setOrderType('takeaway')}>{strings.orderTypeTakeaway}</button>
              )}
              {deliveryEnabled && (
                <button type="button" className={`checkout-form__type-btn${orderType === 'delivery' ? ' is-active' : ''}`} style={orderType === 'delivery' ? { borderColor: priceColor, color: priceColor } : undefined} onClick={() => setOrderType('delivery')}>{strings.orderTypeDelivery}</button>
              )}
            </div>
          </div>

          {orderType === 'dine_in' && (
            <div className="checkout-form__section">
              <label className="checkout-form__label" htmlFor="tableNumber">{strings.tableNumber} *</label>
              <input id="tableNumber" type="text" value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} placeholder={strings.tableNumberPh} className="checkout-form__input" />
              {errors.tableNumber && <span className="checkout-form__error">{errors.tableNumber}</span>}
            </div>
          )}

          {orderType === 'delivery' && (
            <div className="checkout-form__section">
              <label className="checkout-form__label" htmlFor="deliveryAddress">{strings.deliveryAddress} *</label>
              <textarea id="deliveryAddress" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder={strings.deliveryAddressPh} className="checkout-form__textarea" />
              {errors.deliveryAddress && <span className="checkout-form__error">{errors.deliveryAddress}</span>}
            </div>
          )}
        </>
      )}

      <div className="checkout-form__section">
        <label className="checkout-form__label" htmlFor="customerName">{strings.customerName}</label>
        <input id="customerName" type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder={strings.customerNamePh} className="checkout-form__input" />
      </div>

      <div className="checkout-form__section">
        <label className="checkout-form__label" htmlFor="customerPhone">{strings.customerPhone} *</label>
        <div className="checkout-form__phone-row">
          <span className="checkout-form__phone-prefix">+966</span>
          <input id="customerPhone" type="tel" value={customerPhone} onChange={(e) => handlePhoneChange(e.target.value)} placeholder={strings.customerPhonePh} className="checkout-form__input" />
        </div>
        {errors.customerPhone && <span className="checkout-form__error">{errors.customerPhone}</span>}
      </div>

      <div className="checkout-form__section">
        <label className="checkout-form__label" htmlFor="orderNote">{strings.orderNote}</label>
        <textarea id="orderNote" value={orderNote} onChange={(e) => setOrderNote(e.target.value.slice(0, 200))} placeholder={strings.orderNotePh} className="checkout-form__textarea" />
      </div>

      <div className="checkout-form__summary">
        <div className="checkout-form__summary-row checkout-form__summary-row--muted">
          <span>{strings.vatLine}</span><span>{formatPrice(subtotal)} {currency}</span>
        </div>
        <div className="checkout-form__summary-row checkout-form__summary-row--muted">
          <span>{strings.vatAmount}</span><span>{formatPrice(tax)} {currency}</span>
        </div>
        {orderType === 'delivery' && deliveryFeeApplied > 0 && (
          <div className="checkout-form__summary-row checkout-form__summary-row--muted">
            <span>{strings.deliveryFee}</span><span>{formatPrice(deliveryFeeApplied)} {currency}</span>
          </div>
        )}
        <div className="checkout-form__summary-row checkout-form__summary-row--total">
          <span>{strings.total}</span><span style={{ color: priceColor }}>{formatPrice(total)} {currency}</span>
        </div>
      </div>

      {!openStatus.open && (
        <div className="checkout-form__closed-banner">
          {strings.closedTitle}{openStatus.nextText ? ` — ${openStatus.nextText}` : ''}
        </div>
      )}

      {status === 'error' && (
        <div className="checkout-form__closed-banner" role="alert">
          <strong>{strings.orderErrorTitle}</strong><br />{errorMessage}
        </div>
      )}

      <button type="submit" className="checkout-form__submit" style={{ background: openStatus.open ? priceColor : '#E5E7EB' }} disabled={!openStatus.open || status === 'submitting'}>
        {status === 'submitting' ? strings.processing : status === 'error' ? strings.tryAgain : strings.reviewOrder}
      </button>
    </form>
  )
}
