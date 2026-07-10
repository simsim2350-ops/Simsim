import { useState } from 'react'
import { toast } from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'
import { vatBreakdown } from '../../../lib/pricing'
import { computeOpenStatus } from '../helpers'

// بيانات نموذج الطلب + إنشاء الطلب في قاعدة البيانات (ADR-1: الأسعار شاملة الضريبة، تُفكّ للخلف)
export function useCheckout({ slug, restaurant, branch, cart, cartTotal, setCart, setCartOpen, setActiveOrders, setOrderPlaced, t }) {
  const [tableNumber, setTableNumber] = useState('')
  const [orderType, setOrderType] = useState('dine_in') // dine_in | takeaway | delivery
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [orderNote, setOrderNote] = useState('') // ملاحظة عامة على الطلب كله (اختيارية)
  const [orderNumber, setOrderNumber] = useState('')
  const [lastOrderSummary, setLastOrderSummary] = useState(null) // { items, total, tableNumber } للمشاركة عبر واتساب
  const [submitting, setSubmitting] = useState(false) // أثناء إرسال الطلب — يمنع الضغط المكرّر

  const PHONE_STORAGE_KEY = `simsim_phone_${slug}`       // آخر رقم جوال استخدمه الزبون (لعرض نقاطه)

  // Place order
  const placeOrder = async () => {
    if (submitting) return // حارس: لا نرسل الطلب مرتين
    if (cart.length === 0) { toast.error(t('tCartEmpty')); return }
    // منع الطلب وقت الإغلاق حسب أوقات الفرع/المطعم
    const openStatus = computeOpenStatus(branch?.opening_hours || restaurant.opening_hours)
    if (!openStatus.open) {
      toast.error(openStatus.nextText ? `${t('closedTitle')} — ${openStatus.nextText}` : t('tClosed'))
      return
    }
    if (orderType === 'dine_in' && !tableNumber.trim()) { toast.error(t('tEnterTable')); return }
    if (orderType === 'delivery' && !deliveryAddress.trim()) { toast.error(t('tEnterAddr')); return }
    if (!customerPhone.trim()) { toast.error(t('tEnterPhone')); return }
    const cleanPhone = customerPhone.replace(/[^\d]/g, '')
    if (cleanPhone.length < 8 || cleanPhone.length > 15) {
      toast.error(t('tBadPhone'))
      return
    }

    const items = cart.map(i => ({
      id: i.id, name: i.name, emoji: i.emoji, image_url: i.image_url,
      price: i.price, qty: i.qty, notes: i.note,
      selectedOptions: i.selectedOptions || [],
    }))

    const deliveryFee = orderType === 'delivery' ? (Number(restaurant.delivery_fee) || 0) : 0
    // الأسعار المعروضة شاملة ض.ق.م 15% — نفكّ الضريبة للخلف (lib/pricing)
    const { net, tax } = vatBreakdown(cartTotal)
    const total = cartTotal + deliveryFee

    setSubmitting(true)
    const { data, error } = await supabase.from('orders').insert({
      restaurant_id: restaurant.id,
      branch_id: branch?.id || null,
      table_number: orderType === 'dine_in' ? tableNumber : null,
      delivery_address: orderType === 'delivery' ? deliveryAddress.trim() : null,
      customer_name: customerName.trim() || null,
      customer_phone: cleanPhone,
      type: orderType,
      status: 'pending',
      items,
      subtotal: net,
      tax,
      delivery_fee: deliveryFee,
      total,
      notes: orderNote.trim(),
    }).select().single()

    if (error) {
      console.error('Order error:', error)
      toast.error(error.message || t('tErr'))
      setSubmitting(false)
      return
    }

    setOrderNumber(data.order_number)
    setLastOrderSummary({ items, total, tableNumber, orderType, deliveryAddress, orderNumber: data.order_number })
    try { localStorage.setItem(PHONE_STORAGE_KEY, cleanPhone) } catch { /* تجاهل */ }
    setOrderPlaced(true)
    setCart([])
    setCartOpen(false)
    setOrderNote('')
    setSubmitting(false)

    // إضافة الطلب الجديد فوق قائمة الطلبات النشطة (الأحدث أولاً) — الاشتراك في تحديثاته يحصل تلقائياً
    setActiveOrders(prev => [
      { id: data.id, orderNumber: data.order_number, status: 'pending', items, total, tableNumber, orderType, deliveryAddress, createdAt: Date.now() },
      ...prev,
    ])
  }

  return {
    tableNumber, setTableNumber, orderType, setOrderType,
    deliveryAddress, setDeliveryAddress, customerName, setCustomerName,
    customerPhone, setCustomerPhone, orderNote, setOrderNote,
    orderNumber, lastOrderSummary, placeOrder, submitting,
  }
}
