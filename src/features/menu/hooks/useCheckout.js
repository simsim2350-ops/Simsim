import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'
import { computeBranchOpenStatus, effectiveDeliverySettings } from '../helpers'
import { withTimeout, isTimeoutError } from '../../../lib/asyncTimeout'
import { mapOrderError } from '../orderErrors'

const CREATE_ORDER_TIMEOUT_MS = 15_000

// بيانات نموذج الطلب + إنشاء الطلب في قاعدة البيانات.
// طلب QR لا يرسل restaurant_id أو branch_id أو table_id من المتصفح؛ الخادم يستخرجها من token فقط.
export function useCheckout({ slug, restaurant, branch, cart, cartTotal, setCart, setCartOpen, setActiveOrders, setOrderPlaced, t, isEn, appliedCoupon, discountAmount = 0, removeCoupon, tableQr = null }) {
  const [tableNumber, setTableNumber] = useState('')
  const [orderType, setOrderType] = useState('dine_in') // dine_in | takeaway | delivery
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [orderNote, setOrderNote] = useState('')
  const [orderNumber, setOrderNumber] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // TASK-CHK-004: رد price_changed من الخادم — يحمل الإجمالي الصحيح بانتظار تأكيد الزبون صراحة
  // قبل إعادة الإرسال (لا نعيد الإرسال تلقائياً بسعر مختلف بلا علم الزبون)
  const [priceChangeInfo, setPriceChangeInfo] = useState(null) // { oldTotal, newTotal } | null

  const PHONE_STORAGE_KEY = `simsim_phone_${slug}`

  // رابط QR موثوق يثبت تجربة الطلب على الطاولة نفسها؛ لا توجد واجهة لتغييرها.
  useEffect(() => {
    if (!tableQr) return
    setTableNumber(tableQr.tableName)
    setOrderType('dine_in')
    setDeliveryAddress('')
  }, [tableQr?.token, tableQr?.tableName])

  // ينفّذ استدعاء create_order فعلياً؛ clientTotalOverride تُستخدم فقط عند تأكيد سعر مُحدَّث (TASK-CHK-004)
  const submitOrder = async (items, deliveryFee, clientTotalOverride) => {
    const total = clientTotalOverride ?? (Math.max(0, cartTotal - discountAmount) + deliveryFee)

    const request = tableQr
      ? supabase.rpc('create_order_from_table_qr', {
        p_qr_token: tableQr.token,
        p_items: items,
        p_customer_name: customerName.trim() || null,
        p_customer_phone: customerPhone,
        p_notes: orderNote.trim(),
        p_coupon_code: appliedCoupon?.code || null,
        p_client_total: total,
      })
      : supabase.rpc('create_order', {
        p_restaurant_id: restaurant.id,
        p_branch_id: branch?.id,
        p_table_number: orderType === 'dine_in' ? tableNumber : null,
        p_delivery_address: orderType === 'delivery' ? deliveryAddress.trim() : null,
        p_customer_name: customerName.trim() || null,
        p_customer_phone: customerPhone,
        p_type: orderType,
        p_items: items,
        p_notes: orderNote.trim(),
        p_coupon_code: appliedCoupon?.code || null,
        p_client_total: total,
      })

    let result
    try {
      result = await withTimeout(request.single(), { operation: 'create_order', timeoutMs: CREATE_ORDER_TIMEOUT_MS })
    } catch (err) {
      // لم يُنشأ أي طلب هنا (price_changed=true لا تُدرِج صفاً، وأي خطأ آخر يمنع الإدخال) — الرسالة تنصّ صراحة على ذلك
      if (isTimeoutError(err)) toast.error(t('tOrderTimeout'))
      else toast.error(t('tErr'))
      setSubmitting(false)
      return
    }
    const { data, error } = result

    if (error) {
      console.error('Order error:', error)
      const msg = mapOrderError(error.message)
      toast.error(isEn ? msg.en : msg.ar)
      setSubmitting(false)
      return
    }

    if (!data?.id || data.price_changed) {
      // صفر طلب أُنشئ (VERIFIED في create_order) — نعرض الفرق صراحة بدل توست عابر يترك السلة في طريق مسدود
      setPriceChangeInfo({ oldTotal: total, newTotal: Number(data.total) })
      setSubmitting(false)
      return
    }

    setPriceChangeInfo(null)
    setOrderNumber(data.order_number)
    try { localStorage.setItem(PHONE_STORAGE_KEY, customerPhone) } catch { /* تجاهل */ }
    setOrderPlaced(true)
    setCart([])
    setCartOpen(false)
    setOrderNote('')
    setSubmitting(false)
    removeCoupon?.()

    setActiveOrders(prev => [
      {
        id: data.id,
        orderNumber: data.order_number,
        accessToken: data.access_token || null,
        status: 'pending',
        items: cart,
        total: Number(data.total ?? total),
        tableNumber: tableQr?.tableName || (orderType === 'dine_in' ? tableNumber : null),
        orderType: tableQr ? 'dine_in' : orderType,
        source: tableQr ? 'qr' : 'manual',
        deliveryAddress: tableQr ? null : deliveryAddress,
      },
      ...prev,
    ])
  }

  const placeOrder = async () => {
    if (submitting) return
    if (cart.length === 0) { toast.error(t('tCartEmpty')); return }
    const openStatus = computeBranchOpenStatus(branch)
    if (!openStatus.open) {
      toast.error(openStatus.nextText ? `${t('closedTitle')} — ${openStatus.nextText}` : t('tClosed'))
      return
    }
    if (!tableQr && orderType === 'dine_in' && !tableNumber.trim()) { toast.error(t('tEnterTable')); return }
    if (!tableQr && orderType === 'delivery' && !deliveryAddress.trim()) { toast.error(t('tEnterAddr')); return }
    if (!customerPhone.trim()) { toast.error(t('tEnterPhone')); return }
    if (!/^5\d{8}$/.test(customerPhone)) { toast.error(t('tBadPhone')); return }

    const items = cart.map(i => ({
      product_id: i.id,
      quantity: i.qty,
      notes: i.note || '',
      options: (i.selectedOptions || []).map(o => ({ groupName: o.groupName, choiceName: o.choiceName })),
    }))

    const deliveryFee = !tableQr && orderType === 'delivery' ? (Number(effectiveDeliverySettings(branch, restaurant).fee) || 0) : 0
    setPriceChangeInfo(null)
    setSubmitting(true)
    await submitOrder(items, deliveryFee)
  }

  // TASK-CHK-004: الزبون يقبل السعر الذي أعاده الخادم صراحة ويعيد الإرسال بنفس أصناف السلة
  const confirmPriceUpdate = async () => {
    if (!priceChangeInfo || submitting) return
    const items = cart.map(i => ({
      product_id: i.id,
      quantity: i.qty,
      notes: i.note || '',
      options: (i.selectedOptions || []).map(o => ({ groupName: o.groupName, choiceName: o.choiceName })),
    }))
    setSubmitting(true)
    await submitOrder(items, 0, priceChangeInfo.newTotal)
  }

  return {
    tableNumber, setTableNumber, orderType, setOrderType,
    deliveryAddress, setDeliveryAddress, customerName, setCustomerName,
    customerPhone, setCustomerPhone, orderNote, setOrderNote,
    orderNumber, placeOrder, submitting,
    priceChangeInfo, confirmPriceUpdate,
  }
}
