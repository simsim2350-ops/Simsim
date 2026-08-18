import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'
import { computeBranchOpenStatus, effectiveDeliverySettings } from '../helpers'

// بيانات نموذج الطلب + إنشاء الطلب في قاعدة البيانات.
// طلب QR لا يرسل restaurant_id أو branch_id أو table_id من المتصفح؛ الخادم يستخرجها من token فقط.
export function useCheckout({ slug, restaurant, branch, cart, cartTotal, setCart, setCartOpen, setActiveOrders, setOrderPlaced, t, appliedCoupon, discountAmount = 0, removeCoupon, tableQr = null }) {
  const [tableNumber, setTableNumber] = useState('')
  const [orderType, setOrderType] = useState('dine_in') // dine_in | takeaway | delivery
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [orderNote, setOrderNote] = useState('')
  const [orderNumber, setOrderNumber] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const PHONE_STORAGE_KEY = `simsim_phone_${slug}`

  // رابط QR موثوق يثبت تجربة الطلب على الطاولة نفسها؛ لا توجد واجهة لتغييرها.
  useEffect(() => {
    if (!tableQr) return
    setTableNumber(tableQr.tableName)
    setOrderType('dine_in')
    setDeliveryAddress('')
  }, [tableQr?.token, tableQr?.tableName])

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
    const total = Math.max(0, cartTotal - discountAmount) + deliveryFee
    setSubmitting(true)

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

    const { data, error } = await request.single()
    if (error) {
      console.error('Order error:', error)
      toast.error(error.message || t('tErr'))
      setSubmitting(false)
      return
    }

    if (!data?.id || data.price_changed) {
      toast('تم تحديث السعر. راجع إجمالي السلة ثم حاول مرة أخرى.', { icon:'↻' })
      setSubmitting(false)
      return
    }

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

  return {
    tableNumber, setTableNumber, orderType, setOrderType,
    deliveryAddress, setDeliveryAddress, customerName, setCustomerName,
    customerPhone, setCustomerPhone, orderNote, setOrderNote,
    orderNumber, placeOrder, submitting,
  }
}
