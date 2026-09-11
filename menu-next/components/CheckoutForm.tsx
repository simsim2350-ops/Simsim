'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCart } from '@/lib/cart/CartContext'
import { t } from '@/lib/i18n'
import type { Lang, Table } from '@/lib/types'
import { vatBreakdown, computeCouponDiscount, type Coupon } from '@/lib/pricing'
import type { OpenStatus } from '@/lib/openStatus'
import { supabaseBrowser } from '@/lib/supabase/client'
import { mapOrderError, priceChangedMessage, itemsUnavailableMessage, networkErrorMessage } from '@/lib/orderErrors'
import { rememberPhone } from '@/lib/loyalty'
import { addActiveOrder } from '@/lib/orders/activeOrders'
import { OrderSummary } from './checkout/OrderSummary'
import { OrderTypeSelector } from './checkout/OrderTypeSelector'
import { TableSelector } from './checkout/TableSelector'
import { CustomerInfoForm } from './checkout/CustomerInfoForm'
import { VehicleInfoForm } from './checkout/VehicleInfoForm'
import { CouponInput } from './checkout/CouponInput'
import { PriceSummary } from './checkout/PriceSummary'
import { CheckoutCTA } from './checkout/CheckoutCTA'

type OrderType = 'dine_in' | 'takeaway' | 'delivery' | 'car_pickup'
// 'verifying' (Phase 3C.3) — only reachable when phoneVerificationEnabled is
// true AND /api/customer/checkout has just answered 401 (no valid session
// yet). Never reachable at all when the flag is false — the existing direct
// RPC path never returns this shape of response.
type Status = 'idle' | 'submitting' | 'success' | 'error' | 'verifying'

// Client Component — reads the cart from CartContext and renders + submits
// the order form. Phase 4D connects this to the real, existing create_order
// RPC (SECURITY DEFINER, safe with the public anon key — verified in Phase
// 4C's schema audit). Field set, validation rules, RPC payload shape, and
// error mapping are all ported from src/features/menu/hooks/useCheckout.js
// and src/features/menu/orderErrors.js — not invented.
export function CheckoutForm({
  slug, restaurantId, branchId, branchName, restaurantName, currency, priceColor, lang,
  openStatus, deliveryEnabled, deliveryFee, takeawayEnabled, carPickupEnabled, carPickupInfoLabel, carPickupInfoRequired, availableProductIds, resolvedTableName, resolvedTableToken,
  branchTables, phoneVerificationEnabled,
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
  // Car Pickup (Phase 2) — same conditional-render contract as
  // takeawayEnabled/deliveryEnabled: false hides the option entirely, true
  // shows it. info_label is the restaurant's own prompt text for the one
  // free-text field this order type collects (falls back to a generic
  // default string when the restaurant hasn't set one); info_required only
  // matters while carPickupEnabled is true.
  carPickupEnabled: boolean
  carPickupInfoLabel: string | null
  carPickupInfoRequired: boolean
  availableProductIds: string[]
  // Non-null only when a real, resolved table-QR token (?table=) is behind
  // this checkout — same server-verified contract as src/pages/PublicMenu.jsx's
  // own tableQr. When present, the order is locked to dine-in at this exact
  // table: the order-type picker and delivery/table inputs are not offered,
  // matching the legacy app's own behavior (a scanned table QR is not a
  // suggestion the customer can override).
  resolvedTableName: string | null
  // The raw QR token itself (Phase 6, #3 table-to-invoice) — when present,
  // submission calls create_order_from_table_qr instead of generic
  // create_order, so the resulting order row gets a real table_id/source='qr'
  // (create_order itself is untouched either way; this RPC re-verifies the
  // token server-side and calls create_order internally). Non-dine-in and
  // manual-table orders are completely unaffected — they never had this
  // token and keep calling generic create_order exactly as before.
  resolvedTableToken: string | null
  // Section 1B: this branch's own real, active tables (empty when arriving
  // via a resolved table QR, or when the branch has no tables configured at
  // all) — server-fetched via get_branch_tables_for_menu, never hardcoded.
  // When non-empty, dine-in shows a dropdown of real table ids instead of a
  // free-text field; when empty, falls back to the original free-text input
  // exactly as before (a restaurant that hasn't set up the table system must
  // keep working unchanged).
  branchTables: Table[]
  // Phase 3C.3 — resolved server-side via the existing Feature Registry
  // (feature_value, restaurant-override → plan → global-default chain,
  // platform-admin-controlled, never a restaurant self-toggle). false is
  // today's global default: when false, every line below this comment that
  // mentions phoneVerificationEnabled is dead code — submission takes the
  // exact same direct-RPC path this file already used before this phase.
  phoneVerificationEnabled: boolean
}) {
  const router = useRouter()
  const { items, count, subtotal, branchId: cartBranchId, idempotencyKey, clearCart } = useCart()
  const strings = t(lang)

  const [orderType, setOrderType] = useState<OrderType>('dine_in')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [tableNumber, setTableNumber] = useState('')
  const [tableId, setTableId] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [carInfo, setCarInfo] = useState('')
  const [orderNote, setOrderNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState<string>('')

  // Coupons (#2) — client-side preview only, same fields/rules as
  // src/features/menu/hooks/useCoupon.js. The real, authoritative validation
  // already happens server-side inside create_order (unchanged) — this is
  // purely a UX preview so the customer sees the discount before submitting.
  const [couponInput, setCouponInput] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null)
  const [couponError, setCouponError] = useState('')
  const [applyingCoupon, setApplyingCoupon] = useState(false)

  // Phase 3C.3 — only ever set/read when phoneVerificationEnabled is true.
  // otpCode/otpError back the small inline verification step that appears
  // in place of the submit button after /api/customer/checkout answers 401
  // (no valid session yet) — never shown, never touched, when the flag is
  // false. sendingOtp guards the resend button the same way submittingRef
  // guards the main submit button.
  const [otpCode, setOtpCode] = useState('')
  const [otpError, setOtpError] = useState('')
  const [sendingOtp, setSendingOtp] = useState(false)

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
  const discountAmount = computeCouponDiscount(appliedCoupon, subtotal)
  const total = subtotal - discountAmount + deliveryFeeApplied
  const { tax } = vatBreakdown(subtotal - discountAmount)

  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase()
    if (!code) return
    setCouponError('')
    setApplyingCoupon(true)
    try {
      const client = supabaseBrowser()
      if (!client) { setCouponError(strings.couponInvalid); return }
      const { data } = await client
        .from('coupons')
        .select('id, code, discount_type, discount_value, max_discount_amount, branch_id, expires_at, min_order_amount, usage_limit, usage_count')
        .eq('restaurant_id', restaurantId)
        .eq('code', code)
        .eq('is_active', true)
        .maybeSingle()
      const coupon = data as (Coupon & { branch_id: string | null; expires_at: string | null; min_order_amount: number | null; usage_limit: number | null; usage_count: number | null }) | null
      if (!coupon) { setCouponError(strings.couponInvalid); return }
      if (coupon.branch_id && coupon.branch_id !== branchId) { setCouponError(strings.couponWrongBranch); return }
      if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) { setCouponError(strings.couponExpired); return }
      if (coupon.min_order_amount && subtotal < coupon.min_order_amount) { setCouponError(strings.couponMinOrder(coupon.min_order_amount)); return }
      if (coupon.usage_limit != null && (coupon.usage_count ?? 0) >= coupon.usage_limit) { setCouponError(strings.couponUsageLimit); return }
      setAppliedCoupon(coupon)
    } finally {
      setApplyingCoupon(false)
    }
  }

  const removeCoupon = () => {
    setAppliedCoupon(null)
    setCouponInput('')
    setCouponError('')
  }

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
      if (orderType === 'dine_in') {
        if (branchTables.length > 0) {
          if (!tableId) next.tableNumber = strings.errRequired
        } else if (!tableNumber.trim()) {
          next.tableNumber = strings.errRequired
        }
      }
      if (orderType === 'delivery' && !deliveryAddress.trim()) next.deliveryAddress = strings.errRequired
      // Car Pickup (Phase 2): only blocks submission when THIS branch marked
      // its one info field required — optional stays optional, matching the
      // task's own point 7 exactly ("Required يمنع الإرسال، Optional يسمح").
      if (orderType === 'car_pickup' && carPickupInfoRequired && !carInfo.trim()) next.carInfo = strings.errRequired
    }
    if (!customerPhone.trim()) next.customerPhone = strings.errRequired
    else if (!/^5\d{8}$/.test(customerPhone)) next.customerPhone = strings.errPhone
    setErrors(next)
    return Object.keys(next).length === 0
  }

  // Shared by both the phoneVerificationEnabled=false path (client.rpc
  // result) and the =true path (fetch('/api/customer/checkout') result,
  // both immediate and post-OTP-retry) — exactly today's existing
  // success/error handling, unmodified, just no longer duplicated.
  type OrderResult = { id: string; order_number: string; total: number; price_changed: boolean; access_token: string | null }
  const finishSubmission = (
    data: OrderResult | null,
    error: { message: string } | null,
    finishedRpcArgs: typeof rpcArgsRef.current,
    finishedRpcItems: typeof rpcItemsRef.current,
  ) => {
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
    // Loyalty (#1) is looked up by phone on a later visit — remember it the
    // same way production does (simsim_phone_<slug>). #4/#8 (My Orders /
    // Reorder) need this order added to the device's tracked list the moment
    // it's confirmed real by create_order, not before.
    rememberPhone(slug, customerPhone)
    addActiveOrder(slug, {
      id: data.id,
      orderNumber: data.order_number,
      status: 'pending',
      // finishedRpcItems is items.map(...) (buildRpcItems) — same order, same
      // length, one entry per cart line — so items[idx] is exactly that
      // line's own rich CartItem (name/price), never a productId lookup that
      // could pick the wrong line when the same product appears twice with
      // different options. Stored so My Orders / this order's own summary
      // can show real product names without a second fetch.
      items: finishedRpcItems!.map((i, idx) => ({ id: i.product_id, qty: i.quantity, unavailable: false, name: items[idx]?.name, name_en: items[idx]?.nameEn })),
      total: data.total,
      tableNumber: finishedRpcArgs!.p_table_number,
      createdAt: Date.now(),
      accessToken: data.access_token,
      branchId,
    })
    const qs = new URLSearchParams({
      fresh: '1',
      branch: branchName,
      placedAt: new Date().toISOString(),
      // Additive only — the order-status page's own get_orders_status_secure
      // RPC never returns branch_id, so this is the one safe way for that
      // page to reuse the existing Reorder function (which needs it) without
      // a backend/RPC change.
      branchId,
      ...(data.access_token ? { token: data.access_token } : {}),
      ...(lang === 'en' ? { lang: 'en' } : {}),
    })
    router.push(`/menu/${slug}/order/${data.id}?${qs.toString()}`)
  }

  // Phase 3C.3 — only ever populated/read when phoneVerificationEnabled is
  // true. Holds exactly the same request shape the direct-RPC path already
  // built, so the post-OTP-verification retry resubmits the identical order
  // without rebuilding or re-validating anything — nothing about the order
  // changed, only the auth state.
  const pendingCheckoutRef = useRef<{ body: Record<string, unknown>; isQr: boolean } | null>(null)
  const rpcArgsRef = useRef<ReturnType<typeof buildRpcArgs> | null>(null)
  const rpcItemsRef = useRef<ReturnType<typeof buildRpcItems> | null>(null)

  function buildRpcItems() {
    // options only ever carries {groupName, choiceName} — never a price.
    // create_order looks up the real choice price itself from the live
    // products.options row and rejects anything that doesn't match a real
    // choice, so there is nothing for the client to assert about price here.
    return items.map((i) => ({
      product_id: i.productId,
      quantity: i.qty,
      notes: '',
      options: i.selectedOptions.map((o) => ({ groupName: o.groupName, choiceName: o.choiceName })),
    }))
  }

  function buildRpcArgs(rpcItems: ReturnType<typeof buildRpcItems>) {
    // Section 1B: when the branch has real tables, the dropdown's selected
    // tableId is the source of truth — create_order re-validates it belongs
    // to this exact restaurant+branch and derives the authoritative
    // table_number itself, so the client-sent p_table_number is only a
    // legacy/no-tables-configured fallback, never trusted over p_table_id.
    const selectedTable = branchTables.find((tb) => tb.id === tableId)
    return {
      p_restaurant_id: restaurantId,
      p_branch_id: branchId,
      p_table_number: resolvedTableName ?? (orderType === 'dine_in' ? (selectedTable?.table_number ?? tableNumber.trim()) : null),
      p_delivery_address: resolvedTableName ? null : (orderType === 'delivery' ? deliveryAddress.trim() : null),
      p_customer_name: customerName.trim() || null,
      p_customer_phone: customerPhone,
      p_type: resolvedTableName ? 'dine_in' : orderType,
      p_items: rpcItems,
      p_notes: orderNote.trim(),
      p_coupon_code: appliedCoupon?.code ?? null,
      p_client_total: total,
      p_idempotency_key: idempotencyKey,
      p_table_id: resolvedTableName ? null : (orderType === 'dine_in' ? (selectedTable?.id ?? null) : null),
      // Car Pickup (Phase 2): only ever sent for this exact order type — every
      // other type keeps sending null, byte-for-byte the same call it made
      // before this field existed. create_order (Phase 1) itself already
      // forces car_info to NULL server-side for any type other than
      // car_pickup regardless of what's sent, so this is belt-and-suspenders,
      // not the actual security boundary.
      p_car_info: orderType === 'car_pickup' ? (carInfo.trim() || null) : null,
    }
  }

  // Phase 3C.3 — the ONLY place this file ever calls the new server-side
  // boundary. Always same-origin (relative URL), so the browser attaches
  // the HttpOnly session cookie automatically — nothing here can read or
  // set it. Returns a 4th field, `unauthorized`, distinct from `error`: a
  // 401 is not a create_order failure, it's "no valid session yet," which
  // the caller handles by starting the OTP step, never by showing an error.
  async function submitViaCheckoutApi(body: Record<string, unknown>): Promise<{ data: OrderResult | null; error: { message: string } | null; unauthorized: boolean }> {
    let res: Response
    try {
      res = await fetch('/api/customer/checkout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {
      return { data: null, error: { message: 'network_error' }, unauthorized: false }
    }
    if (res.status === 401) {
      return { data: null, error: null, unauthorized: true }
    }
    let payload: unknown = null
    try {
      payload = await res.json()
    } catch {
      return { data: null, error: { message: 'network_error' }, unauthorized: false }
    }
    if (!res.ok) {
      const message = payload && typeof payload === 'object' && 'error' in payload ? String((payload as { error: unknown }).error) : 'internal_error'
      return { data: null, error: { message }, unauthorized: false }
    }
    return { data: payload as OrderResult, error: null, unauthorized: false }
  }

  // Phase 3C.3 — reuses the EXISTING, UNMODIFIED send-phone-otp Edge
  // Function via the same anon-key browser client already used elsewhere in
  // this file (coupons, direct RPC calls) — no new call mechanism. A
  // {status:'rejected'} response (Phase 2.1's IP-abuse layer) is treated
  // identically to {status:'sent'} on purpose: the backend deliberately
  // makes these indistinguishable to avoid leaking an abuse-detection
  // signal, and this UI must not undo that by reacting differently.
  async function sendOtp(): Promise<boolean> {
    const client = supabaseBrowser()
    if (!client) return false
    try {
      const { data, error } = await client.functions.invoke('send-phone-otp', { body: { phone: customerPhone } })
      if (error) return false
      const status = data && typeof data === 'object' ? (data as { status?: string }).status : null
      return status === 'sent' || status === 'rejected'
    } catch {
      return false
    }
  }

  const startVerification = async () => {
    setStatus('verifying')
    setOtpError('')
    setOtpCode('')
    setSendingOtp(true)
    const ok = await sendOtp()
    setSendingOtp(false)
    if (!ok) {
      setStatus('error')
      submittingRef.current = false
      setErrorMessage(strings.otpErrorSendFailed)
    }
  }

  const handleResendOtp = async () => {
    if (sendingOtp) return
    setOtpError('')
    setSendingOtp(true)
    const ok = await sendOtp()
    setSendingOtp(false)
    if (!ok) setOtpError(strings.otpErrorSendFailed)
  }

  // Phase 3C.3 — the ONLY place this file ever calls the existing, unmodified
  // verify-otp Route Handler. On success, the browser now holds the session
  // cookie (set by that endpoint's own Set-Cookie response header — this
  // code never sees or touches the token itself), so the ORIGINAL pending
  // order is resubmitted automatically via the same submitViaCheckoutApi()
  // — no re-validation, no rebuilt payload, just a retry now that a session
  // exists.
  const handleOtpVerify = async () => {
    if (!/^[0-9]{6}$/.test(otpCode)) { setOtpError(strings.otpErrorInvalid); return }
    setOtpError('')
    setStatus('submitting')
    let res: Response
    try {
      res = await fetch('/api/customer/verify-otp', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: customerPhone, code: otpCode }),
      })
    } catch {
      setStatus('verifying')
      setOtpError(strings.otpErrorGeneric)
      return
    }
    let payload: { verified?: boolean } | null = null
    try {
      payload = await res.json()
    } catch {
      payload = null
    }
    if (!res.ok || !payload?.verified) {
      setStatus('verifying')
      setOtpError(strings.otpErrorInvalid)
      return
    }

    const pending = pendingCheckoutRef.current
    if (!pending) {
      // Should not be reachable — verification only ever starts after a
      // pending checkout body was stored. Fail safely rather than guess.
      submittingRef.current = false
      setStatus('error')
      setErrorMessage(networkErrorMessage[lang])
      return
    }
    const { data, error } = await submitViaCheckoutApi(pending.body)
    if (error) {
      finishSubmission(null, error, rpcArgsRef.current, rpcItemsRef.current)
      return
    }
    // A second 401 here (session created moments ago, then immediately
    // invalid) is treated as a generic error rather than looping back into
    // another OTP round — same fail-safe posture as the "no pending" branch
    // above, never a silent retry loop.
    finishSubmission(data, null, rpcArgsRef.current, rpcItemsRef.current)
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

    const rpcItems = buildRpcItems()
    const rpcArgs = buildRpcArgs(rpcItems)
    rpcArgsRef.current = rpcArgs
    rpcItemsRef.current = rpcItems

    // Phase 3C.3 — the ONLY branch point this phase adds. When the flag is
    // false (today's global default), execution never reaches the fetch
    // path below at all — this half is byte-for-byte the same direct-RPC
    // call this file already made before this phase existed.
    if (!phoneVerificationEnabled) {
      const client = supabaseBrowser()
      if (!client) {
        submittingRef.current = false
        setStatus('error')
        setErrorMessage(networkErrorMessage[lang])
        return
      }
      let result
      try {
        // #3 table-to-invoice: a resolved QR token calls the dedicated
        // create_order_from_table_qr RPC (re-verifies the token server-side,
        // resolves restaurant/branch/table itself — never from the client —
        // then calls the same unmodified create_order internally and stamps
        // the resulting order with the real table_id/source='qr'). Everything
        // else (delivery, takeaway, manual dine-in with a typed table number)
        // is untouched and still calls generic create_order exactly as before.
        result = resolvedTableToken
          ? await client.rpc('create_order_from_table_qr', {
              p_qr_token: resolvedTableToken,
              p_items: rpcItems,
              p_customer_name: rpcArgs.p_customer_name,
              p_customer_phone: rpcArgs.p_customer_phone,
              p_notes: rpcArgs.p_notes,
              p_coupon_code: rpcArgs.p_coupon_code,
              p_client_total: rpcArgs.p_client_total,
              p_idempotency_key: idempotencyKey,
            } as never).single()
          : await client.rpc('create_order', rpcArgs as never).single()
      } catch {
        // Network exception (offline, DNS, etc.) — never shown as a raw error.
        submittingRef.current = false
        setStatus('error')
        setErrorMessage(networkErrorMessage[lang])
        return
      }
      const { data, error } = result as { data: OrderResult | null; error: { message: string } | null }
      finishSubmission(data, error, rpcArgs, rpcItems)
      return
    }

    // Phase 3C.3 — session-aware path. Same field names/shapes as rpcArgs
    // above (the Route Handler was built to accept exactly this shape) —
    // the only difference is customer_id is never part of this body at all;
    // the server derives it from the session cookie, never from here.
    const checkoutBody: Record<string, unknown> = resolvedTableToken
      ? {
          p_qr_token: resolvedTableToken,
          p_items: rpcItems,
          p_customer_name: rpcArgs.p_customer_name,
          p_customer_phone: rpcArgs.p_customer_phone,
          p_notes: rpcArgs.p_notes,
          p_coupon_code: rpcArgs.p_coupon_code,
          p_client_total: rpcArgs.p_client_total,
          p_idempotency_key: idempotencyKey,
        }
      : rpcArgs
    pendingCheckoutRef.current = { body: checkoutBody, isQr: Boolean(resolvedTableToken) }

    const { data, error, unauthorized } = await submitViaCheckoutApi(checkoutBody)
    if (unauthorized) {
      await startVerification()
      return
    }
    finishSubmission(data, error, rpcArgs, rpcItems)
  }

  return (
    <form className="checkout-form" onSubmit={handleSubmit} style={{ '--checkout-focus-color': priceColor } as React.CSSProperties}>
      <div className="checkout-form__header">
        <h1 className="checkout-form__title">{strings.checkoutTitle}</h1>
        <p className="checkout-form__subtitle">{restaurantName}{branchName ? ` — ${branchName}` : ''}</p>
      </div>

      <OrderSummary items={items} lang={lang} currency={currency} formatPrice={formatPrice} />

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
            <OrderTypeSelector
              value={orderType}
              onChange={setOrderType}
              lang={lang}
              priceColor={priceColor}
              takeawayEnabled={takeawayEnabled}
              deliveryEnabled={deliveryEnabled}
              carPickupEnabled={carPickupEnabled}
            />
          </div>

          {orderType === 'dine_in' && (
            <TableSelector
              branchTables={branchTables}
              tableId={tableId}
              onTableIdChange={setTableId}
              tableNumber={tableNumber}
              onTableNumberChange={setTableNumber}
              error={errors.tableNumber}
              lang={lang}
            />
          )}

          {orderType === 'delivery' && (
            <div className="checkout-form__section">
              <label className="checkout-form__label" htmlFor="deliveryAddress">{strings.deliveryAddress} *</label>
              <textarea id="deliveryAddress" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder={strings.deliveryAddressPh} className="checkout-form__textarea" />
              {errors.deliveryAddress && <span className="checkout-form__error">{errors.deliveryAddress}</span>}
            </div>
          )}

          {orderType === 'car_pickup' && (
            <VehicleInfoForm
              value={carInfo}
              onChange={setCarInfo}
              label={carPickupInfoLabel}
              required={carPickupInfoRequired}
              error={errors.carInfo}
              lang={lang}
            />
          )}
        </>
      )}

      <CustomerInfoForm
        customerName={customerName}
        onNameChange={setCustomerName}
        customerPhone={customerPhone}
        onPhoneChange={handlePhoneChange}
        phoneError={errors.customerPhone}
        orderNote={orderNote}
        onNoteChange={setOrderNote}
        lang={lang}
      />

      <CouponInput
        couponInput={couponInput}
        setCouponInput={setCouponInput}
        appliedCoupon={appliedCoupon}
        applyCoupon={applyCoupon}
        removeCoupon={removeCoupon}
        couponError={couponError}
        applyingCoupon={applyingCoupon}
        lang={lang}
      />

      <PriceSummary
        subtotal={subtotal}
        tax={tax}
        discountAmount={discountAmount}
        deliveryFeeApplied={deliveryFeeApplied}
        showDeliveryFee={orderType === 'delivery'}
        total={total}
        currency={currency}
        priceColor={priceColor}
        lang={lang}
        formatPrice={formatPrice}
      />

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

      {/* Phase 3C.3 — only reachable when phoneVerificationEnabled is true
          AND the checkout attempt above answered 401. Replaces the submit
          button entirely while active; the cart/summary above stays visible
          and unchanged so the customer isn't confused about losing their
          order. Left exactly as it was — same DOM shape, same classes, same
          handlers — since this Checkout Redesign task is UI/structure only
          and this flow is already independently verified security-sensitive
          business logic, not touched here. */}
      {status === 'verifying' ? (
        <div className="checkout-form__section" role="alert">
          <p className="checkout-form__label">{strings.otpVerifyTitle}</p>
          <p>{strings.otpVerifyBody}</p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
            placeholder={strings.otpCodePh}
            className="checkout-form__input"
          />
          {otpError && <span className="checkout-form__error">{otpError}</span>}
          <button
            type="button"
            className="checkout-form__submit"
            style={{ background: priceColor }}
            disabled={otpCode.length !== 6}
            onClick={handleOtpVerify}
          >
            {strings.otpVerifyButton}
          </button>
          <button type="button" className="checkout-form__coupon-apply" disabled={sendingOtp} onClick={handleResendOtp}>
            {strings.otpResend}
          </button>
        </div>
      ) : (
        <CheckoutCTA
          status={status}
          openStatusOpen={openStatus.open}
          total={total}
          currency={currency}
          priceColor={priceColor}
          lang={lang}
          formatPrice={formatPrice}
        />
      )}
    </form>
  )
}
