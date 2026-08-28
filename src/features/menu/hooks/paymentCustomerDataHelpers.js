// TASK-PAY-3.6D.5-A.1 — تخزين حقول تنفيذ الطلب (هاتف/طاولة/عنوان/اسم/ملاحظة) عبر جولة التحويل إلى
// صفحة المزوّد والعودة (مواصفة معتمدة: TASK_3_6D_5_A_CUSTOMER_DATA_PERSISTENCE_SPEC.md). دوال نقيّة
// بالكامل + أدوات I/O رفيعة لـlocalStorage فقط — بلا أي حالة React هنا (الـHooks في ملف منفصل).
//
// حظر صريح ومتعمَّد (موافقة المالك): لا paymentTransactionId، لا providerRef، لا حالة دفع، لا مبلغ
// سلطوي، لا restaurant_id، لا branch_id، لا محتوى سلة، لا أسرار — كل هذه إما متاحة خادمياً بالفعل
// (عبر لقطة payment_transactions.metadata.checkout) أو ممنوعة صراحة من الوصول للمتصفّح أصلاً.

export const PAYMENT_CUSTOMER_DATA_VERSION = 1
export const PAYMENT_CUSTOMER_DATA_TTL_MS = 2 * 60 * 60 * 1000 // ساعتان — شبكة أمان فقط، لا الآلية الأساسية للتنظيف (التنظيف الأساسي: استدعاءات clearKey() الصريحة الموجودة فعلاً)
const MAX_FIELD_LEN = 500 // نفس الحد الأقصى المُطبَّق فعلياً في create_order (sql/order_idempotency.sql) وpayment-first-checkout (TASK_3_6D_E) — للاتساق، لا لاختراع حد جديد

/** مفتاح تخزين سجلّ بيانات التنفيذ — مُقترَن بقيمة مفتاح إتقان الدفع نفسه، لا بـslug/branchId. */
export function paymentCustomerDataStorageKey(paymentIdempotencyKey) {
  return `simsim_payfirst_customer_${paymentIdempotencyKey}`
}

// اقتطاع دفاعي فقط (نفس حد create_order) — لا رفض، لا اختراع قاعدة تحقّق جديدة تتعارض مع create_order
// نفسها (التحقّق السلطوي يبقى هناك دائماً، غير مُكرَّر ولا مُضعَّف هنا).
function truncate(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.length > MAX_FIELD_LEN ? trimmed.slice(0, MAX_FIELD_LEN) : trimmed
}

/**
 * يبني سجلّ بيانات التنفيذ المعتمد — يُدرج فقط الحقول ذات الصلة بنوع الطلب فعلياً (لا حقول زائدة
 * بلا داعٍ): tableNumber فقط لـdine_in غير-QR (QR تُستعاد من resolve_table_qr — TASK_3_6D_4_C_1/2،
 * لا تُخزَّن هنا إطلاقاً)؛ deliveryAddress فقط لـdelivery؛ customerName/notes متى وُجدا فقط.
 * @param {{type: string, isQrCheckout?: boolean, customerPhone: string, customerName?: string,
 *   tableNumber?: string, deliveryAddress?: string, notes?: string, now?: number}} input
 */
export function buildPaymentCustomerDataRecord({
  type, isQrCheckout = false, customerPhone, customerName, tableNumber, deliveryAddress, notes, now = Date.now(),
}) {
  const record = {
    version: PAYMENT_CUSTOMER_DATA_VERSION,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + PAYMENT_CUSTOMER_DATA_TTL_MS).toISOString(),
    customerPhone: typeof customerPhone === 'string' ? customerPhone.trim() : '',
  }

  const name = truncate(customerName)
  if (name) record.customerName = name

  const notesTrunc = truncate(notes)
  if (notesTrunc) record.notes = notesTrunc

  // dine_in + QR: tableNumber لا تُخزَّن أبداً — مُستعادة من رمز QR نفسه عند العودة، لا من هذا السجلّ.
  if (type === 'dine_in' && !isQrCheckout) {
    const tn = truncate(tableNumber)
    if (tn) record.tableNumber = tn
  }

  if (type === 'delivery') {
    const addr = truncate(deliveryAddress)
    if (addr) record.deliveryAddress = addr
  }

  return record
}

/**
 * يحلّل نصاً خاماً من localStorage إلى سجلّ صالح، أو null — دالة نقيّة (بلا I/O)، تُختبَر بمعزل تام.
 * غياب/JSON تالف/إصدار غير مدعوم/انتهاء الصلاحية ⇒ null دائماً، بلا استثناء يُرمى.
 */
export function parseStoredPaymentCustomerData(raw, now = Date.now()) {
  if (!raw) return null
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  if (parsed.version !== PAYMENT_CUSTOMER_DATA_VERSION) return null
  const expiresAtMs = Date.parse(parsed.expiresAt)
  if (!Number.isFinite(expiresAtMs) || now >= expiresAtMs) return null
  if (typeof parsed.customerPhone !== 'string') return null
  return parsed
}

/**
 * يكتب السجلّ — يُستدعى فقط قبل بدء تحويل Moyasar، بنفس مفتاح إتقان الدفع المُستخدَم للمحاولة.
 * customerPhone حقل إلزامي دائماً (create_order نفسها تتطلّبه) — غيابه/فراغه يمنع الكتابة كلياً بدل
 * تخزين سجلّ ناقص لا معنى له لاحقاً؛ لا نخترع قيمة افتراضية، ولا نُسقِط بقية الحقول بصمت.
 */
export function persistPaymentCustomerData(paymentIdempotencyKey, fields) {
  if (!paymentIdempotencyKey) return
  if (typeof fields?.customerPhone !== 'string' || fields.customerPhone.trim().length === 0) return
  try {
    const record = buildPaymentCustomerDataRecord(fields)
    localStorage.setItem(paymentCustomerDataStorageKey(paymentIdempotencyKey), JSON.stringify(record))
  } catch { /* تجاهل — التخزين المحلي غير متاح أو ممتلئ؛ لا نُفشل تدفّق الدفع لأجل هذا */ }
}

/** يمسح السجلّ — يُستدعى عند فشل نهائي أو إلغاء صريح فقط (ليس عند النجاح — تدفّق إنشاء الطلب المستقبلي يملك التنظيف النهائي). */
export function clearPaymentCustomerData(paymentIdempotencyKey) {
  if (!paymentIdempotencyKey) return
  try {
    localStorage.removeItem(paymentCustomerDataStorageKey(paymentIdempotencyKey))
  } catch { /* تجاهل */ }
}

/**
 * يقرأ السجلّ (قراءة كسولة عند الطلب — لا مؤقّت خلفي، لا مسح دوري). سجلّ تالف/منتهي الصلاحية/إصدار
 * غير مدعوم يُنظَّف فوراً من التخزين (تنظيف، لا كتابة بيانات جديدة إطلاقاً — القراءة لا تُولِّد شيئاً).
 */
export function readPaymentCustomerData(paymentIdempotencyKey, now = Date.now()) {
  if (!paymentIdempotencyKey) return null
  const storageKey = paymentCustomerDataStorageKey(paymentIdempotencyKey)
  let raw
  try {
    raw = localStorage.getItem(storageKey)
  } catch {
    return null
  }
  const record = parseStoredPaymentCustomerData(raw, now)
  if (!record && raw) {
    try { localStorage.removeItem(storageKey) } catch { /* تجاهل */ }
  }
  return record
}
