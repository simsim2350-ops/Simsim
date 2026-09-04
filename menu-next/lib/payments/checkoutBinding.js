// TASK-PAY-3.6A-1b.1 — تكامل السلة/الطلب مع الدفع (Cart/Checkout Integrity Binding).
// أداة نقيّة بالكامل: بلا اتصال قاعدة بيانات، بلا شبكة، بلا حالة، بلا عشوائية.
// الهدف: تمثيل "هوية السلة" (أي المنتجات/الكميات/الخيارات/الكوبون/المطعم/الفرع/نوع الطلب) بشكل
// حتمي (Deterministic) — وليس تمثيل السعر. السعر يبقى مصدر حقيقته الوحيد create_order الخادمي
// (TASK-PAY-3.6A-1). هذا الملف لا يُستدعى من أي مسار حي بعد (لا Payment Service، لا webhook).
//
// مرجع القرار المعماري الكامل: reports/TASK_3_6A_1B_CART_INTEGRITY_QUOTE_BINDING_AUDIT.md — Option C.
// البصمة (fingerprint) ليست بيانة اعتماد أمنية (Not a credential) — قيمة مقارنة هوية خادمية فقط،
// تُحسب وتُقارَن كلياً على الخادم، فلا حاجة لـHMAC أو مفتاح توقيع (القرار موثَّق في المرجع أعلاه).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ALLOWED_TYPES = new Set(['dine_in', 'takeaway', 'delivery'])
const MIN_QTY = 1
const MAX_QTY = 99 // TASK-PAY-3.6A-1a/order_payment_reference.sql: نفس نطاق create_order — لا نبتكر نطاقاً جديداً هنا
const MAX_ITEMS = 100 // نفس حد create_order (jsonb_array_length(p_items) <= 100)

function normalizeUuid(value, field) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new TypeError(`checkoutBinding: ${field} يجب أن يكون UUID صالحاً`)
  }
  return value.toLowerCase()
}

function normalizeType(value) {
  if (typeof value !== 'string' || !ALLOWED_TYPES.has(value)) {
    // TASK-PAY-3.6A-1b.1: لا تطبيع صامت لقيمة غير معروفة — فشل حتمي صريح (per الأمر الصريح)
    throw new TypeError('checkoutBinding: type يجب أن يكون واحداً من dine_in/takeaway/delivery')
  }
  return value
}

function normalizeQuantity(value) {
  if (typeof value !== 'number' || !Number.isInteger(value) || !Number.isFinite(value)) {
    throw new TypeError('checkoutBinding: quantity يجب أن يكون عدداً صحيحاً (integer)، لا نصاً ولا كسراً')
  }
  if (value < MIN_QTY || value > MAX_QTY) {
    throw new TypeError(`checkoutBinding: quantity يجب أن يكون بين ${MIN_QTY} و${MAX_QTY}`)
  }
  return value
}

// groupName:choiceName مُرتَّبة أبجدياً ثم مفصولة بـ| — نفس نمط useCart.js (addToCart/updateCartItem)
// الحالي حرفياً، مُعاد استخدامه هنا كما هو دون اختراع تهريب/escaping جديد لم يكن موجوداً هناك.
function buildOptionsKey(options) {
  if (options === undefined || options === null) return ''
  if (!Array.isArray(options)) {
    throw new TypeError('checkoutBinding: options يجب أن يكون مصفوفة إن وُجد')
  }
  const parts = options.map((opt) => {
    if (!opt || typeof opt !== 'object') {
      throw new TypeError('checkoutBinding: كل عنصر options يجب أن يكون كائناً')
    }
    const { groupName, choiceName } = opt
    if (typeof groupName !== 'string' || groupName.length === 0) {
      throw new TypeError('checkoutBinding: option.groupName مطلوب (نص غير فارغ)')
    }
    if (typeof choiceName !== 'string' || choiceName.length === 0) {
      throw new TypeError('checkoutBinding: option.choiceName مطلوب (نص غير فارغ)')
    }
    return `${groupName}:${choiceName}`
  })
  parts.sort()
  return parts.join('|')
}

function normalizeCouponCode(value) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') {
    throw new TypeError('checkoutBinding: coupon_code يجب أن يكون نصاً أو null')
  }
  // TASK-PAY-3.6A-1b.1: نفس تطبيع create_order حرفياً — upper(trim(p_coupon_code)), والفارغ يصبح null
  const normalized = value.trim().toUpperCase()
  return normalized.length === 0 ? null : normalized
}

// مقارنة حتمية (lexicographic بالمعنى العملي): product_id ثم quantity ثم optionsKey — تُجنِّب أي
// إبهام في محاولة دمج الحقول في نص واحد للفرز فقط (لا حاجة لفاصل بين الحقول عند الفرز بمقارن مباشر).
function compareCanonicalItems(a, b) {
  if (a.product_id !== b.product_id) return a.product_id < b.product_id ? -1 : 1
  if (a.quantity !== b.quantity) return a.quantity - b.quantity
  if (a.optionsKey !== b.optionsKey) return a.optionsKey < b.optionsKey ? -1 : 1
  return 0
}

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length < 1) {
    throw new TypeError('checkoutBinding: items مطلوبة (مصفوفة غير فارغة)')
  }
  if (items.length > MAX_ITEMS) {
    throw new TypeError(`checkoutBinding: items لا يجوز أن تتجاوز ${MAX_ITEMS} عنصراً`)
  }
  // TASK-PAY-3.6A-1b.1: لا دمج لأسطر منتج مكرَّرة — كل سطر يبقى مُمثَّلاً على حدة (نفس سلوك create_order
  // الذي يُقيِّم كل عنصر مصفوفة على حدة دون تجميع)، فقط تُرتَّب المصفوفة بأكملها لتصبح غير حساسة للترتيب.
  const canonical = items.map((item) => {
    if (!item || typeof item !== 'object') {
      throw new TypeError('checkoutBinding: كل عنصر items يجب أن يكون كائناً')
    }
    return {
      product_id: normalizeUuid(item.product_id, 'items[].product_id'),
      quantity: normalizeQuantity(item.quantity),
      optionsKey: buildOptionsKey(item.options),
    }
  })
  canonical.sort(compareCanonicalItems)
  return canonical
}

/**
 * يبني التمثيل الأساسي الحتمي (Canonical Representation) لهوية السلة/الدفع من مُدخلات الطلب.
 * يفشل صراحة (يرمي TypeError) عند أي مُدخل غير سليم — لا إصلاح صامت لحقول سلامة الدفع.
 * لا يمثّل السعر إطلاقاً — subtotal/tax/delivery_fee/total/currency/p_client_total كلها خارج النطاق
 * عمداً؛ السعر مصدر حقيقته الوحيد create_order الخادمي.
 *
 * @param {object} input
 * @param {string} input.restaurant_id
 * @param {string} input.branch_id
 * @param {'dine_in'|'takeaway'|'delivery'} input.type
 * @param {Array<{product_id: string, quantity: number, options?: Array<{groupName: string, choiceName: string}>}>} input.items
 * @param {string|null} [input.coupon_code]
 * @returns {{restaurant_id: string, branch_id: string, type: string, items: Array<{product_id: string, quantity: number, optionsKey: string}>, coupon_code: string|null}}
 */
export function canonicalizeCheckout(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('checkoutBinding: input مطلوب (كائن)')
  }
  return {
    restaurant_id: normalizeUuid(input.restaurant_id, 'restaurant_id'),
    branch_id: normalizeUuid(input.branch_id, 'branch_id'),
    type: normalizeType(input.type),
    items: normalizeItems(input.items),
    coupon_code: normalizeCouponCode(input.coupon_code),
  }
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * يحسب بصمة SHA-256 حتمية (hex صغير الحروف) لهوية السلة/الدفع — وليست بيانة اعتماد أمنية.
 * قيمة مقارنة هوية خادمية فقط (تُحسب وتُقارَن كلياً على الخادم) — لا HMAC ولا مفتاح توقيع مطلوب،
 * طبقاً للقرار الموثَّق في reports/TASK_3_6A_1B_CART_INTEGRITY_QUOTE_BINDING_AUDIT.md.
 *
 * @param {object} input نفس شكل canonicalizeCheckout
 * @returns {Promise<string>} بصمة SHA-256 بترميز hex صغير الحروف (64 حرفاً)
 */
export async function computeCheckoutFingerprint(input) {
  const canonical = canonicalizeCheckout(input)
  // ترتيب مفاتيح ثابت صريح — لا اعتماد على سلوك ترتيب مفاتيح JavaScript الضمني بين تنفيذات مختلفة.
  const canonicalItems = canonical.items.map((i) => ({
    product_id: i.product_id,
    quantity: i.quantity,
    optionsKey: i.optionsKey,
  }))
  const orderedForHashing = {
    restaurant_id: canonical.restaurant_id,
    branch_id: canonical.branch_id,
    type: canonical.type,
    items: canonicalItems,
    coupon_code: canonical.coupon_code,
  }
  const json = JSON.stringify(orderedForHashing)
  const bytes = new TextEncoder().encode(json)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return toHex(digest)
}

// TASK-PAY-3.6A-1b.2 — بناء لقطة الدفع (Checkout Snapshot Builder).

// يقبل رقماً JS أو نصاً رقمياً (نمط create_order/PostgREST القائم فعلاً — انظر
// useCheckout.js:87 الذي يكتب Number(data.total) بدل الوثوق بأنه رقم JS أصلاً) للتحقق فقط؛
// القيمة المُخزَّنة في اللقطة تبقى كما وردت حرفياً من dry-run (بلا أي تحويل/تقريب/حساب).
function assertServerNumeric(value, field) {
  if (value === undefined || value === null) {
    throw new TypeError(`buildCheckoutSnapshot: نتيجة dry-run لا تحتوي ${field}`)
  }
  const n = typeof value === 'number' ? value : (typeof value === 'string' ? Number(value) : NaN)
  if (!Number.isFinite(n)) {
    throw new TypeError(`buildCheckoutSnapshot: نتيجة dry-run لحقل ${field} ليست قيمة رقمية صالحة`)
  }
}

// currency: لا مصدر داخل نتيجة create_order (RETURNS TABLE لا يحتوي عمود currency) ولا داخل هذه
// الوحدة نفسها (لا تعتمد هذه الوحدة على مزوّد دفع بعينه — انظر تعليق الرأس). المصدر الآمن الموجود
// فعلياً هو نفس النمط الذي تفرضه paymentService.startCharge بالفعل على مستدعيها:
// "if (!input?.currency) throw new Error('startCharge: currency مطلوبة')" — أي أن العملة مُدخَل
// صريح إلزامي من طبقة التنسيق الخادمية المستدعية، وليست شيئاً تشتقّه أي دالة نقيّة داخلياً. هذه
// الدالة تتبع نفس السابقة المعمارية القائمة حرفياً بدل اختراع مصدر/ثابت عملة جديد.
function assertCurrency(currency) {
  if (typeof currency !== 'string' || currency.trim().length === 0) {
    throw new TypeError(
      'buildCheckoutSnapshot: currency مطلوبة كمُدخَل صريح من طبقة التنسيق الخادمية — لا تُشتقّ من نتيجة dry-run ولا من العميل'
    )
  }
  return currency
}

// quoted_at: البانية نقيّة عمداً (Option A من التدقيق) — بلا توليد وقت داخلي من أي نوع. المستدعي (طبقة
// التنسيق الخادمية) يمرّر الطابع الزمني صراحةً؛ يُتحقَّق هنا أنه ISO 8601 صالح ومطابق تماماً لنمط
// new Date().toISOString() المُستخدَم بالفعل في paymentService.js (updated_at) بدل اختراع صيغة جديدة.
function assertQuotedAt(quotedAt) {
  if (typeof quotedAt !== 'string') {
    throw new TypeError('buildCheckoutSnapshot: quoted_at يجب أن يكون نص طابع زمني صريحاً من المستدعي (بلا توليد داخلي للوقت)')
  }
  const parsed = new Date(quotedAt)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== quotedAt) {
    throw new TypeError('buildCheckoutSnapshot: quoted_at يجب أن يكون ISO 8601 صالحاً ومطابقاً لـ new Date().toISOString()')
  }
  return quotedAt
}

/**
 * يبني لقطة دفع (metadata.checkout) من مُدخل الطلب الأصلي + نتيجة create_order(p_dry_run=true)
 * الناجحة — بلا حساب سعر، بلا اتصال شبكة/قاعدة بيانات، بلا معلومات تعريف شخصية افتراضياً.
 *
 * حقول CLIENT_INPUT_SNAPSHOT (restaurant_id/branch_id/type/items/coupon_code) تُشتقّ حصراً من
 * canonicalizeCheckout (مصدر تطبيع واحد — لا يُعاد اختراعه هنا) — إلا items التي تحتفظ بصيغة
 * options الأصلية ({groupName, choiceName}) اللازمة لإعادة بناء create_order مستقبلاً (صيغة
 * optionsKey المُختزَلة في canonicalizeCheckout لا تصلح لهذا الغرض).
 *
 * حقول SERVER_COMPUTED (subtotal/tax/delivery_fee/total) تُنسَخ حرفياً من dryRunResult — بلا أي
 * حساب أو تقريب أو تحويل عملة. fingerprint يُشتقّ عبر computeCheckoutFingerprint (بلا تكرار منطق).
 *
 * ملاحظات:
 * - لا تُدرَج notes (غير ضرورية لنجاح create_order — القيمة تُقيَّم افتراضياً بسلسلة فارغة إن غابت
 *   — واستبعادها يقلّل نصاً حراً من العميل قد يحمل معلومات تعريف شخصية عرضية داخل جدول دفع).
 * - لا تُدرَج customer_name/customer_phone/delivery_address/table_number افتراضياً (سياسة الخصوصية
 *   المعتمدة في التدقيق — قرار مؤجَّل لعمل المطابقة/الاسترداد اللاحق، لا يُختلَق هنا).
 *
 * @param {object} params
 * @param {object} params.checkoutInput نفس شكل مُدخل canonicalizeCheckout/computeCheckoutFingerprint
 * @param {object} params.dryRunResult ناتج create_order(p_dry_run=true) الناجح — يجب أن يحوي
 *   subtotal/tax/delivery_fee/total رقمية صالحة (رقم JS أو نص رقمي، طبقاً لسلوك PostgREST القائم)
 * @param {string} params.currency مُدخَل صريح من طبقة التنسيق الخادمية (غير مُشتقّ من العميل)
 * @param {string} params.quotedAt طابع زمني ISO 8601 صريح من طبقة التنسيق الخادمية (new Date().toISOString())
 * @returns {Promise<object>} لقطة جاهزة لتخزينها في payment_transactions.metadata.checkout
 */
export async function buildCheckoutSnapshot({ checkoutInput, dryRunResult, currency, quotedAt } = {}) {
  if (!checkoutInput || typeof checkoutInput !== 'object') {
    throw new TypeError('buildCheckoutSnapshot: checkoutInput مطلوب (كائن)')
  }
  if (!dryRunResult || typeof dryRunResult !== 'object') {
    throw new TypeError('buildCheckoutSnapshot: dryRunResult مطلوب (كائن)')
  }

  // مصدر تطبيع واحد: نفس ما تستخدمه computeCheckoutFingerprint حرفياً — لا يُعاد بناؤه هنا.
  const canonical = canonicalizeCheckout(checkoutInput)
  const fingerprint = await computeCheckoutFingerprint(checkoutInput)

  assertServerNumeric(dryRunResult.subtotal, 'subtotal')
  assertServerNumeric(dryRunResult.tax, 'tax')
  assertServerNumeric(dryRunResult.delivery_fee, 'delivery_fee')
  assertServerNumeric(dryRunResult.total, 'total')

  const validCurrency = assertCurrency(currency)
  const validQuotedAt = assertQuotedAt(quotedAt)

  // صيغة إعادة البناء (product_id/quantity/options الأصلية) — مُشتقَّة من checkoutInput.items
  // الذي أثبتت canonicalizeCheckout أعلاه سلامته بالفعل (لولا ذلك لرمت استثناءً قبل هذا السطر).
  // مصفوفة/كائنات جديدة بالكامل (map/بناء كائن حرفي) — لا تعديل داخل المكان (in-place) لأي مصفوفة
  // أو كائن ينتمي لـcheckoutInput الأصلي.
  const items = checkoutInput.items.map((item) => ({
    product_id: item.product_id.toLowerCase(),
    quantity: item.quantity,
    options: Array.isArray(item.options)
      ? item.options.map((opt) => ({ groupName: opt.groupName, choiceName: opt.choiceName }))
      : [],
  }))

  return {
    restaurant_id: canonical.restaurant_id,
    branch_id: canonical.branch_id,
    type: canonical.type,
    items,
    coupon_code: canonical.coupon_code,
    // نسخ حرفي بلا أي حساب/تقريب/تحويل — التزاماً بفصل سلامة السعر (create_order) عن سلامة هوية
    // السلة (fingerprint) اللذين يجب ألا يندمجا في مفهوم واحد.
    subtotal: dryRunResult.subtotal,
    tax: dryRunResult.tax,
    delivery_fee: dryRunResult.delivery_fee,
    total: dryRunResult.total,
    currency: validCurrency,
    fingerprint,
    quoted_at: validQuotedAt,
  }
}
