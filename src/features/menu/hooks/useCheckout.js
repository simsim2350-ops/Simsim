import { useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'
import { computeBranchOpenStatus, effectiveDeliverySettings } from '../helpers'
import { buildOrderPayload, previewOrderTotal } from '../orderPayload'

// بيانات نموذج الطلب + إنشاء الطلب في قاعدة البيانات (ADR-1: الأسعار شاملة الضريبة، تُفكّ للخلف)
export function useCheckout({ slug, restaurant, branch, cart, cartTotal, setCart, setCartOpen, setActiveOrders, setOrderPlaced, t, appliedCoupon, discountAmount = 0, removeCoupon }) {
  const [tableNumber, setTableNumber] = useState('')
  const [orderType, setOrderType] = useState('dine_in') // dine_in | takeaway | delivery
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [orderNote, setOrderNote] = useState('') // ملاحظة عامة على الطلب كله (اختيارية)
  const [orderNumber, setOrderNumber] = useState('')
  const [submitting, setSubmitting] = useState(false) // أثناء إرسال الطلب — يمنع الضغط المكرّر
  const idempotencyRef = useRef({ fingerprint: null, key: null })

  // Place order
  const placeOrder = async () => {
    if (submitting) return // حارس: لا نرسل الطلب مرتين
    if (cart.length === 0) { toast.error(t('tCartEmpty')); return }
    // منع الطلب وقت الإغلاق حسب أوقات الفرع (كل فرع ساعاته المستقلة، والإغلاق المؤقت يتفوّق فوراً)
    const openStatus = computeBranchOpenStatus(branch)
    if (!openStatus.open) {
      toast.error(openStatus.nextText ? `${t('closedTitle')} — ${openStatus.nextText}` : t('tClosed'))
      return
    }
    if (orderType === 'dine_in' && !tableNumber.trim()) { toast.error(t('tEnterTable')); return }
    if (orderType === 'delivery' && !deliveryAddress.trim()) { toast.error(t('tEnterAddr')); return }
    if (!customerPhone.trim()) { toast.error(t('tEnterPhone')); return }
    // رقم الجوال السعودي: 9 أرقام تبدأ بـ5 (حقل السلة نفسه يمنع أي إدخال آخر أثناء الكتابة)
    if (!/^5\d{8}$/.test(customerPhone)) {
      toast.error(t('tBadPhone'))
      return
    }
    const cleanPhone = customerPhone

    // العميل يرسل معرفات المنتج والخيارات فقط؛ الأسعار والأسماء النهائية يعيد الخادم قراءتها وحسابها.
    const items = buildOrderPayload(cart)

    const previewDeliveryFee = orderType === 'delivery' ? (Number(effectiveDeliverySettings(branch, restaurant).fee) || 0) : 0
    const previewTotal = previewOrderTotal(cartTotal, discountAmount, previewDeliveryFee)
    const requestFingerprint = JSON.stringify({
      restaurantId: restaurant.id,
      branchId: branch?.id,
      tableNumber: orderType === 'dine_in' ? tableNumber : null,
      deliveryAddress: orderType === 'delivery' ? deliveryAddress.trim() : null,
      customerName: customerName.trim() || null,
      customerPhone: cleanPhone,
      orderType,
      items,
      notes: orderNote.trim(),
      couponCode: appliedCoupon?.code || null,
      clientTotal: previewTotal,
    })
    if (idempotencyRef.current.fingerprint !== requestFingerprint) {
      idempotencyRef.current = {
        fingerprint: requestFingerprint,
        key: crypto.randomUUID(),
      }
    }
    const idempotencyKey = idempotencyRef.current.key

    setSubmitting(true)
    // RPC server-authoritative: لا يثق في أسعار أو ضريبة أو خصم قادمة من المتصفح.
    const { data, error } = await supabase.rpc('create_order', {
      p_restaurant_id: restaurant.id,
      p_branch_id: branch?.id,
      p_table_number: orderType === 'dine_in' ? tableNumber : null,
      p_delivery_address: orderType === 'delivery' ? deliveryAddress.trim() : null,
      p_customer_name: customerName.trim() || null,
      p_customer_phone: cleanPhone,
      p_type: orderType,
      p_items: items,
      p_notes: orderNote.trim(),
      p_coupon_code: appliedCoupon?.code || null,
      p_client_total: previewTotal,
      p_idempotency_key: idempotencyKey,
    }).single()

    if (error) {
      console.error('Order error:', error)
      toast.error(error.message || t('tErr'))
      setSubmitting(false)
      return
    }

    if (data.price_changed) {
      setSubmitting(false)
      toast.error(t('priceChanged') || 'تغيرت أسعار بعض الأصناف، راجع السلة وحاول مرة أخرى')
      return
    }

    setOrderNumber(data.order_number)
    setOrderPlaced(true)
    setCart([])
    setCartOpen(false)
    setOrderNote('')
    setSubmitting(false)
    idempotencyRef.current = { fingerprint: null, key: null }
    removeCoupon?.()

    // إضافة الطلب الجديد فوق قائمة الطلبات النشطة (الأحدث أولاً) — الاشتراك في تحديثاته يحصل تلقائياً
    setActiveOrders(prev => [
      { id: data.id, orderNumber: data.order_number, accessToken: data.access_token, status: 'pending', items: cart, total: Number(data.total), tableNumber, orderType, deliveryAddress, createdAt: Date.now() },
      ...prev,
    ])
  }

  return {
    tableNumber, setTableNumber, orderType, setOrderType,
    deliveryAddress, setDeliveryAddress, customerName, setCustomerName,
    customerPhone, setCustomerPhone, orderNote, setOrderNote,
    orderNumber, placeOrder, submitting,
  }
}
