import { toast } from 'react-hot-toast'

// فتح محادثة واتساب بخصوص طلب محدّد (رسالة للمطعم من شاشة طلباتي)
export function openWhatsAppAboutOrder({ restaurant, order, t }) {
  if (!restaurant?.phone) {
    toast.error(t('tNoContact'))
    return
  }
  const msg = `${t('waAboutOrder')} ${order.orderNumber} — ${restaurant.name}`
  const phone = restaurant.phone.replace(/[^\d]/g, '')
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')
}
