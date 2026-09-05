import type { Lang } from './types'

// Faithful port of src/features/menu/orderErrors.js — the real, production
// error-code-to-message map for create_order/create_order_from_table_qr.
// Not reinvented: some keys here (options, coupons) aren't reachable from
// menu-next's current flow (no options/coupon UI yet), kept anyway so the
// map stays a complete, accurate mirror of the RPC's real error surface
// rather than a partial guess.

const ERROR_MESSAGES: Record<string, { ar: string; en: string }> = {
  'invalid order type': { ar: 'نوع الطلب غير صالح', en: 'Invalid order type' },
  'invalid items payload': { ar: 'تعذّر قراءة أصناف الطلب، أعد فتح السلة وحاول مجدداً', en: 'Could not read cart items, reopen your cart and try again' },
  'invalid customer phone': { ar: 'رقم الجوال غير صحيح — تأكد أنه يبدأ بـ5 ومكوّن من 9 أرقام', en: 'Invalid phone number — must start with 5 and be 9 digits' },
  'restaurant is unavailable': { ar: 'المطعم غير متاح للطلب حالياً', en: 'This restaurant is unavailable right now' },
  'branch is unavailable': { ar: 'هذا الفرع غير متاح للطلب حالياً', en: 'This branch is unavailable right now' },
  'delivery is unavailable': { ar: 'التوصيل غير متاح لهذا الفرع', en: 'Delivery is unavailable for this branch' },
  'takeaway is unavailable': { ar: 'الاستلام غير متاح لهذا الفرع', en: 'Takeaway is unavailable for this branch' },
  'table number is required': { ar: 'يرجى اختيار رقم الطاولة', en: 'Please select a table number' },
  'delivery address is required': { ar: 'يرجى إدخال عنوان التوصيل', en: 'Please enter a delivery address' },
  'invalid product or quantity': { ar: 'كمية غير صالحة لأحد الأصناف — راجع سلتك', en: 'Invalid quantity for an item — check your cart' },
  'product is unavailable for this branch': { ar: 'أحد الأصناف لم يعد متاحاً — أزِله من السلة للمتابعة', en: 'An item is no longer available — remove it from your cart to continue' },
  'invalid product option': { ar: 'أحد الخيارات المختارة لم يعد متاحاً — أعد تعديل الصنف', en: 'A selected option is no longer available — edit the item' },
  'required product option is missing': { ar: 'صنف يحتاج اختيار مجموعة إجبارية — أعد تعديله', en: 'An item is missing a required choice — edit it' },
  'invalid or expired coupon': { ar: 'كود الكوبون غير صحيح أو منتهي الصلاحية', en: 'Coupon code is invalid or expired' },
  'coupon minimum order not met': { ar: 'الطلب أقل من الحد الأدنى لهذا الكوبون', en: "Your order is below this coupon's minimum" },
  'coupon usage limit reached': { ar: 'هذا الكوبون بلغ الحد الأقصى للاستخدام', en: 'This coupon has reached its usage limit' },
  'table qr is unavailable': { ar: 'رمز الطاولة غير متاح — امسح رمز QR مرة أخرى', en: 'Table QR is unavailable — scan the QR code again' },
}

const FALLBACK = { ar: 'تعذّر إتمام الطلب. لم يتم تأكيد الطلب — حاول مرة أخرى', en: 'Could not place the order. The order was not confirmed — try again' }

export function mapOrderError(message: string | null | undefined, lang: Lang): string {
  if (!message || typeof message !== 'string') return FALLBACK[lang]
  const key = Object.keys(ERROR_MESSAGES).find((k) => message.includes(k))
  return key ? ERROR_MESSAGES[key][lang] : FALLBACK[lang]
}

export const priceChangedMessage = { ar: 'تغيّرت الأسعار منذ إضافتها للسلة — راجع سلتك وحاول مرة أخرى', en: 'Prices changed since you added them — review your cart and try again' }
export const emptyCartMessage = { ar: 'سلتك فارغة', en: 'Your cart is empty' }
export const itemsUnavailableMessage = { ar: 'أحد الأصناف في سلتك لم يعد متاحاً — أعد فتح المنيو وحدّث سلتك', en: 'An item in your cart is no longer available — reopen the menu and update your cart' }
export const networkErrorMessage = { ar: 'تعذّر الاتصال بالخادم — تحقق من الإنترنت وحاول مرة أخرى', en: 'Could not reach the server — check your connection and try again' }
