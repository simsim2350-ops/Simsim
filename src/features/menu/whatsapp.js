import { toast } from 'react-hot-toast'

// بناء رسالة واتساب جاهزة بتفاصيل الطلب وفتحها على رقم المطعم
export function sendWhatsAppConfirmation({ restaurant, lastOrderSummary, isEn, t }) {
  if (!lastOrderSummary || !restaurant?.phone) {
    toast.error(t('tNoContact'))
    return
  }
  const greeting = restaurant.whatsapp_message?.trim() || `تفضل تأكيد طلبي من ${restaurant.name} 🍽️`
  const typeLabels = { dine_in:'محلي 🪑', takeaway:'سفري 🥡', delivery:'توصيل 🛵' }
  const locationLine = lastOrderSummary.orderType === 'delivery'
    ? `عنوان التوصيل: ${lastOrderSummary.deliveryAddress}`
    : lastOrderSummary.orderType === 'dine_in'
      ? `رقم الطاولة: ${lastOrderSummary.tableNumber}`
      : null
  const lines = [
    greeting,
    `رقم الطلب: ${lastOrderSummary.orderNumber}`,
    `نوع الطلب: ${typeLabels[lastOrderSummary.orderType] || lastOrderSummary.orderType}`,
    ...(locationLine ? [locationLine] : []),
    '',
    'الأصناف:',
    ...lastOrderSummary.items.map(i => {
      const optsText = (i.selectedOptions && i.selectedOptions.length > 0)
        ? ` (${i.selectedOptions.map(o => o.choiceName).join(isEn ? ', ' : '، ')})`
        : ''
      return `- ${i.name}${optsText} × ${i.qty} = ${(i.price * i.qty).toFixed(2)} ﷼`
    }),
    '',
    `الإجمالي: ${lastOrderSummary.total.toFixed(2)} ﷼`,
  ]
  const phone = restaurant.phone.replace(/[^\d]/g, '')
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`
  window.open(url, '_blank')
}

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

// فتح محادثة واتساب عامة للاستفسارات، بمعزل عن طلب فعلي (الزر العائم)
export function openWhatsAppContact({ restaurant, t }) {
  if (!restaurant?.phone) {
    toast.error(t('tNoContact'))
    return
  }
  const greeting = restaurant.whatsapp_message?.trim() || `مرحباً، لدي استفسار بخصوص ${restaurant.name} 👋`
  const phone = restaurant.phone.replace(/[^\d]/g, '')
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(greeting)}`
  window.open(url, '_blank')
}
