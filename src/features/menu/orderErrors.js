// خريطة رموز أخطاء create_order/create_order_from_table_qr إلى رسائل عربية/إنجليزية (TASK-CHK-002).
// دالة خالصة — تُختبَر بلا شبكة. أي رسالة خادمية غير مُدرَجة هنا تأخذ الرسالة الاحتياطية العامة.

const ERROR_MESSAGES = {
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

// message: نص الخطأ الخام من Postgres (error.message من supabase-js)
export function mapOrderError(message) {
  if (!message || typeof message !== 'string') return FALLBACK
  const key = Object.keys(ERROR_MESSAGES).find(k => message.includes(k))
  return key ? ERROR_MESSAGES[key] : FALLBACK
}
