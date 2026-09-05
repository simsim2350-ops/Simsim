// Faithful port of src/features/menu/whatsapp.js — same message shape, same
// phone-digit-stripping, same wa.me link. No mock data: restaurantPhone and
// orderNumber must both come from real, already-fetched restaurant/order data.
export function buildWhatsAppOrderUrl(restaurantPhone: string, restaurantName: string, orderNumber: string, isEn: boolean): string | null {
  if (!restaurantPhone) return null
  const label = isEn ? 'About my order' : 'بخصوص طلبي'
  const msg = `${label} ${orderNumber} — ${restaurantName}`
  const phone = restaurantPhone.replace(/[^\d]/g, '')
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
}
