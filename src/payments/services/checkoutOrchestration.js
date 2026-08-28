// TASK-PAY-3.6A-2 — تنسيق "الدفع أولاً" (Payment-First Checkout Orchestration).
// يربط بين create_order(p_dry_run=true) وbuildCheckoutSnapshot/computeCheckoutFingerprint
// (TASK-PAY-3.6A-1a/1b.1/1b.2) وpaymentService.startCharge الموجودة فعلاً — دون تعديل أيٍّ منها.
// لا يُنشئ طلباً (Order) إطلاقاً — الاستدعاء الوحيد لـcreate_order هنا هو p_dry_run=true فقط.
// لا يُصلِح G-5 (انظر reports/TASK_3_6A_2A_PAYMENT_SERVICE_ARCHITECTURE_AUDIT.md) — يُصنِّف فقط
// حالة الغموض المحتملة ويُعيدها كقيمة استجابة، دون أي كتابة على قاعدة البيانات من هذه الطبقة.
//
// حدود الثقة (Trust Boundary): هذه الطبقة خادمية بالكامل. العميل قد يرسل محتوى السلة/نوع الطلب/
// الكوبون، لكن المبلغ الفعلي مصدره الوحيد dry-run الخادمي، والعملة سلطتها خادمية دائماً (SAR فقط
// حالياً — MoyasarAdapter نفسه يُرمِّز SAR)، وprovider_ref/الحالة لا يأتيان أبداً من العميل.

import { paymentService as defaultPaymentService } from './paymentService.js'
import { buildCheckoutSnapshot, computeCheckoutFingerprint } from '../checkoutBinding.js'
import { newIdempotencyKey } from '../utils/index.js'
import { TransactionStatus } from '../types/index.js'

const SUPPORTED_CURRENCY = 'SAR' // TASK-PAY-3.6A-2A: MoyasarAdapter.createCharge يُرمِّز SAR فعلياً؛ لا بنية متعددة عملات تُختلَق هنا
const RACE_CONSTRAINT_MARKER = 'uq_paytx_idempotency_key' // نفس اسم القيد الحيّ فعلياً على Production (TASK-PAY-3.6F)
const MOYASAR_ERROR_PREFIX = /^Moyasar (network error|error \d|server error)/
const START_CHARGE_PREFIX = 'startCharge:'
// TASK-PAY-3.6B: نفس نمط رسالة unique_violation على orders_payment_transaction_id_uidx —
// إما بنص القيد نفسه أو برسالة create_order الصريحة عند التقاطها (كلاهما يُغطَّى).
const ORDER_PAYMENT_RACE_MARKER = /orders_payment_transaction_id_uidx|payment reference already linked/

/**
 * يتحقّق من مفتاح إتقان دفع مُرسَل من المستدعي — نص غير فارغ فقط؛ لا نطاق/صيغة جديدة مُختلَقة.
 * @param {unknown} key
 * @returns {string|null} null إن لم يُرسَل شيء (يعني على المُستدعي توليد مفتاح جديد)
 */
function validatePaymentIdempotencyKey(key) {
  if (key === undefined || key === null) return null
  if (typeof key !== 'string' || key.trim().length === 0) {
    throw new TypeError('checkoutOrchestration: paymentIdempotencyKey يجب أن يكون نصاً غير فارغ')
  }
  return key
}

/** قراءة آمنة (بلا كتابة) لمعاملة دفع قائمة بنفس مفتاح الإتقان — لاسترداد سباق التزامن (PHASE 10). */
async function reReadByIdempotencyKey(db, restaurantId, idempotencyKey) {
  const { data, error } = await db
    .from('payment_transactions')
    .select('id, status, provider_ref, metadata')
    .eq('idempotency_key', idempotencyKey)
    .eq('restaurant_id', restaurantId)
    .maybeSingle()
  if (error || !data) return null
  return data
}

/**
 * ينسّق تدفّق "الدفع أولاً" الكامل: dry-run خادمي → لقطة/بصمة → payment_transactions عبر
 * paymentService.startCharge الموجودة (غير مُعدَّلة) → استجابة آمنة موحَّدة.
 *
 * لا يُنشئ Order أبداً. لا يستدعي Moyasar مباشرة (فقط عبر paymentService/adapter الموجودَين).
 * لا يعيد محاولة المزوّد تلقائياً. لا يُدرِج مفتاح إتقان جديداً تلقائياً عند كل استدعاء متكرّر لنفس
 * المحاولة — المستدعي مسؤول عن تمرير نفس paymentIdempotencyKey عبر إعادة المحاولات.
 *
 * @param {object} input
 * @param {string} input.restaurant_id
 * @param {string} input.branch_id
 * @param {'dine_in'|'takeaway'|'delivery'} input.type
 * @param {string} [input.table_number]
 * @param {string} [input.delivery_address]
 * @param {string} [input.customer_name]
 * @param {string} input.customer_phone
 * @param {string} [input.notes]
 * @param {Array<object>} input.items نفس صيغة p_items في create_order
 * @param {string|null} [input.coupon_code]
 * @param {number} [input.clientTotal] اختياري — يُمرَّر كـp_client_total لفحص price_changed فقط،
 *   لا يُستخدَم إطلاقاً كمبلغ دفع (المصدر الوحيد للمبلغ هو dry-run نفسه)
 * @param {string} [input.currency] إن أُرسِلت ويست SAR تُرفَض الطلبات صراحةً (PHASE 5)
 * @param {string} [input.paymentIdempotencyKey] مفتاح إتقان دفع من المستدعي؛ يُولَّد مرة واحدة هنا إن غاب
 * @param {string} [input.returnUrl]
 * @param {{db: object, paymentService?: object}} ctx
 * @returns {Promise<object>} استجابة تنسيق آمنة (انظر التوثيق في reports/TASK_3_6A_2_PAYMENT_FIRST_CHECKOUT_IMPLEMENTATION_REPORT.md)
 */
export async function initiatePaymentFirstCheckout(input, { db, paymentService = defaultPaymentService } = {}) {
  if (!db) throw new TypeError('checkoutOrchestration: db مطلوب')
  if (!input || typeof input !== 'object') throw new TypeError('checkoutOrchestration: input مطلوب')

  // PHASE 5: العملة سلطتها خادمية دائماً — لا تُشتقّ من العميل، ولا يُسمح بأي قيمة غير SAR
  if (input.currency !== undefined && input.currency !== null && input.currency !== SUPPORTED_CURRENCY) {
    return {
      status: 'rejected',
      reason: 'unsupported_currency',
      message: `checkoutOrchestration: العملة المدعومة حالياً هي ${SUPPORTED_CURRENCY} فقط`,
    }
  }
  const currency = SUPPORTED_CURRENCY

  // PHASE 6: مفتاح إتقان الدفع — يُحلّ مرة واحدة هنا؛ لا يُترَك لـstartCharge يولّده داخلياً (حتى
  // لا يتغيّر عند كل إعادة محاولة من واجهة تستدعي هذه الدالة أكثر من مرة لنفس المحاولة).
  let idempotencyKey
  try {
    idempotencyKey = validatePaymentIdempotencyKey(input.paymentIdempotencyKey) ?? newIdempotencyKey('pay')
  } catch (err) {
    return { status: 'rejected', reason: 'invalid_idempotency_key', message: err.message }
  }

  // مُدخل تكامل السلة/الدفع الأساسي — نفس القيم حرفياً تُستخدَم أدناه لكلٍّ من استدعاء dry-run
  // ولاحقاً buildCheckoutSnapshot، دون إعادة قراءتها من input مرتين (PHASE 16: لا حمولة سلة ثانية).
  const checkoutInput = {
    restaurant_id: input.restaurant_id,
    branch_id: input.branch_id,
    type: input.type,
    items: input.items,
    coupon_code: input.coupon_code ?? null,
  }

  // PHASE 3 / PHASE 14: dry-run هو المصدر الوحيد للسعر، وهو أيضاً نقطة التحقق الخادمية الوحيدة من
  // ملكية المطعم/الفرع/المنتجات (create_order نفسه يرفض أي عدم اتساق بينها) — قبل أي التزام دفع.
  let dryRun
  try {
    const { data, error } = await db
      .rpc('create_order', {
        p_restaurant_id: checkoutInput.restaurant_id,
        p_branch_id: checkoutInput.branch_id,
        p_table_number: input.table_number ?? null,
        p_delivery_address: input.delivery_address ?? null,
        p_customer_name: input.customer_name ?? null,
        p_customer_phone: input.customer_phone,
        p_type: checkoutInput.type,
        p_items: checkoutInput.items,
        p_notes: input.notes ?? null,
        p_coupon_code: checkoutInput.coupon_code,
        p_client_total: input.clientTotal ?? null,
        p_dry_run: true, // PHASE 13: الاستدعاء الوحيد لـcreate_order في هذه الدالة بأكملها — دائماً true
      })
      .single()
    if (error) {
      return { status: 'rejected', reason: 'dry_run_failed', message: error.message, idempotencyKey }
    }
    dryRun = data
  } catch (err) {
    return { status: 'rejected', reason: 'dry_run_failed', message: err.message, idempotencyKey }
  }

  // PHASE 3: price_changed=true ⇒ لا دفع يبدأ — نُعيد استجابة تغيّر سعر آمنة بالأرقام الجديدة فقط.
  if (dryRun.price_changed) {
    return {
      status: 'price_changed',
      idempotencyKey,
      dryRun: {
        subtotal: dryRun.subtotal,
        tax: dryRun.tax,
        delivery_fee: dryRun.delivery_fee,
        total: dryRun.total,
        price_changes: dryRun.price_changes,
      },
    }
  }

  // PHASE 4: لقطة الدفع — من نفس مُدخل dry-run بالضبط، وبنتيجته الفعلية بلا أي إعادة حساب.
  const quotedAt = new Date().toISOString()
  let snapshot
  try {
    snapshot = await buildCheckoutSnapshot({ checkoutInput, dryRunResult: dryRun, currency, quotedAt })
  } catch (err) {
    return { status: 'rejected', reason: 'snapshot_failed', message: err.message, idempotencyKey }
  }

  // PHASE 15 / PHASE 16: تأكيدات دفاعية صريحة — بلا حساب، بلا تقريب. يجب ألا تُخفِق هذه أبداً إن كان
  // buildCheckoutSnapshot سليمة؛ وجودها هنا حارس انحدار (Regression Guard) لا بديل عن سلامة الباني.
  if (snapshot.total !== dryRun.total) {
    return { status: 'rejected', reason: 'amount_integrity_violation', idempotencyKey }
  }
  const expectedFingerprint = await computeCheckoutFingerprint(checkoutInput)
  if (snapshot.fingerprint !== expectedFingerprint) {
    return { status: 'rejected', reason: 'snapshot_integrity_violation', idempotencyKey }
  }

  // PHASE 7: استدعاء paymentService.startCharge الموجودة فعلاً — بلا أي تعديل عليها. المبلغ = إجمالي
  // dry-run حرفياً (بلا تحويل هللة — ذلك من مسؤولية MoyasarAdapter وحدها، PHASE 15).
  let chargeOutcome
  try {
    chargeOutcome = await paymentService.startCharge(
      {
        restaurantId: checkoutInput.restaurant_id,
        amount: dryRun.total,
        currency,
        idempotencyKey,
        metadata: { checkout: snapshot },
        returnUrl: input.returnUrl,
        provider: 'moyasar',
      },
      { db }
    )
  } catch (err) {
    const message = err?.message ?? String(err)

    // PHASE 10: سباق تزامن على نفس مفتاح إتقان جديد (INSERT يصطدم بـuq_paytx_idempotency_key بعد أن
    // فات فحص SELECT المسبق داخل startCharge). قراءة آمنة (بلا كتابة) بنفس المفتاح لاسترداد الصف —
    // لا استدعاء ثانٍ للمزوّد، ولا تعديل على paymentService.js.
    if (message.includes(RACE_CONSTRAINT_MARKER)) {
      const existing = await reReadByIdempotencyKey(db, checkoutInput.restaurant_id, idempotencyKey)
      if (existing) {
        return {
          status: 'succeeded',
          idempotencyKey,
          idempotent: true,
          paymentTransactionId: existing.id,
          providerRef: existing.provider_ref ?? null,
          paymentStatus: existing.status,
          redirectUrl: existing.metadata?.redirect_url ?? null,
        }
      }
      return { status: 'retryable_error', reason: 'idempotency_race_unrecovered', idempotencyKey }
    }

    // بادئة "startCharge:" — فشل تحقق مُدخل أو فشل INSERT (غير مرتبط بالسباق) — يحدث قبل أي اتصال
    // بالمزوّد إطلاقاً؛ لا غموض، لا صف أُنشئ (أو الصف الموجود فشل إنشاؤه بوضوح).
    if (message.startsWith(START_CHARGE_PREFIX)) {
      return { status: 'failed', reason: 'payment_initiation_failed', message, idempotencyKey }
    }

    // بادئة Moyasar الرسمية (network error / error NNN / server error) — فشل مزوّد نظيف يُمسَّك
    // ضمن try/catch الموجود فعلاً داخل startCharge؛ الصف مُعلَّم status=failed فعلاً هناك (PHASE 11).
    if (MOYASAR_ERROR_PREFIX.test(message)) {
      return { status: 'failed', reason: 'provider_failed', message, idempotencyKey }
    }

    // PHASE 12 (G-5): أي خطأ آخر لا يطابق أياً مما سبق لا يمكن صدوره إلا من التحديث الأخير غير
    // المحروس داخل startCharge (بعد نجاح استدعاء المزوّد) — غموض حقيقي: رُبما نجح الدفع فعلاً.
    // لا نزعم فشلاً قطعياً، لا نخترع حالة قاعدة بيانات جديدة، ولا نكتب شيئاً من هذه الطبقة إطلاقاً.
    // 3.6E (لم يُبنَ بعد) يبقى المسؤول عن المطابقة الفعلية.
    return { status: 'requires_reconciliation', idempotencyKey, message }
  }

  // PHASE 9: نجاح — سواء محاولة جديدة أو إعادة تشغيل مُتقِنة (idempotent) — نفس شكل الاستجابة، ودون
  // أي استدعاء إضافي للمزوّد أو تعديل على اللقطة المخزَّنة في الحالتين (سلوك startCharge نفسه، غير
  // مُعدَّل، هو ما يُقرِّر ذلك).
  return {
    status: 'succeeded',
    paymentTransactionId: chargeOutcome.transactionId,
    providerRef: chargeOutcome.providerRef,
    paymentStatus: chargeOutcome.status,
    redirectUrl: chargeOutcome.redirectUrl,
    idempotencyKey,
    idempotent: chargeOutcome.idempotent,
  }
}

// ══════════════════════════════════════════════════════════════════
// TASK-PAY-3.6B — إنشاء الطلب الحقيقي بعد نجاح الدفع (Payment Success → Order Creation)
// ══════════════════════════════════════════════════════════════════
// الاستدعاء الوحيد في هذا الملف بأكمله لـcreate_order(p_dry_run=false) — يُنشئ Order حقيقياً،
// ولا يحدث إلا بعد التحقق الخادمي الكامل من: نجاح الدفع (من عمود status، لا من العميل)، تطابق
// اللقطة/البصمة المخزَّنة، وتطابق المبلغ المدفوع فعلياً مع إجمالي اللقطة. لا يُعاد حساب أي سعر هنا.

/** مقارنة رقمية مُتسامحة (رقم JS أو نص رقمي — نمط PostgREST القائم) — للمقارنة فقط، لا للتخزين. */
function numericEquals(a, b) {
  const na = typeof a === 'number' ? a : Number(a)
  const nb = typeof b === 'number' ? b : Number(b)
  return Number.isFinite(na) && Number.isFinite(nb) && na === nb
}

/** قراءة آمنة (بلا كتابة) لطلب قائم بنفس معرّف معاملة الدفع — استرداد سباق التزامن (PHASE 9/10-I). */
async function reReadOrderByPaymentTransactionId(db, paymentTransactionId) {
  const { data, error } = await db
    .from('orders')
    .select('id, order_number, order_access_token')
    .eq('payment_transaction_id', paymentTransactionId)
    .maybeSingle()
  if (error || !data) return null
  return data
}

/**
 * ينشئ الطلب الحقيقي (Order) من معاملة دفع ناجحة بالفعل — إعادة بناء كاملة من لقطة الدفع
 * المخزَّنة (payment_transactions.metadata.checkout)، لا من أي حمولة سلة جديدة من العميل.
 *
 * لا يقبل: منتج/كمية/خيارات/كوبون/مطعم/فرع/مبلغ جديداً من العميل — كلها من اللقطة المخزَّنة حصراً
 * (أو من عمود payment_transactions.restaurant_id للمطعم تحديداً — أقوى مصدر ثقة متاح). الحقول
 * الوحيدة التي يقبلها هذا الاستدعاء من السياق الحالي هي حقول التنفيذ البحتة (هاتف/طاولة/عنوان/اسم/
 * ملاحظات) التي create_order يتطلّبها أصلاً ولم تكن — عمداً — جزءاً من اللقطة (TASK-PAY-3.6A-1b.2:
 * سياسة تقليل المعلومات الشخصية). استرداد الطلب دون وجود متصفّح يبقى مسؤولية 3.6E المستقبلية.
 *
 * @param {object} input
 * @param {string} input.paymentTransactionId
 * @param {string} [input.expectedRestaurantId] فحص دفاعي اختياري فقط — المصدر الفعلي دائماً عمود
 *   payment_transactions.restaurant_id، لا هذا المُدخَل
 * @param {string} input.customerPhone مطلوب فعلياً من create_order نفسه
 * @param {string} [input.tableNumber]
 * @param {string} [input.deliveryAddress]
 * @param {string} [input.customerName]
 * @param {string} [input.notes]
 * @param {{db: object}} ctx
 * @returns {Promise<object>} استجابة آمنة موحَّدة (انظر تقرير TASK_3_6B)
 */
export async function createOrderFromSuccessfulPayment(input, { db } = {}) {
  if (!db) throw new TypeError('checkoutOrchestration: db مطلوب')
  if (!input?.paymentTransactionId) {
    throw new TypeError('checkoutOrchestration: paymentTransactionId مطلوب')
  }

  // PHASE 3: قراءة معاملة الدفع خادمياً — لا نثق بأي شيء من العميل حول حالتها أو ملكيتها.
  const { data: paymentTx, error: fetchErr } = await db
    .from('payment_transactions')
    .select('id, restaurant_id, amount, currency, status, metadata')
    .eq('id', input.paymentTransactionId)
    .maybeSingle()

  if (fetchErr || !paymentTx) {
    // PHASE 10-E
    return { status: 'rejected', reason: 'payment_transaction_not_found', paymentTransactionId: input.paymentTransactionId }
  }

  // PHASE 10-F: فحص دفاعي اختياري — إن حدَّد المستدعي مطعماً متوقَّعاً ولم يطابق عمود الملكية الفعلي.
  if (input.expectedRestaurantId && input.expectedRestaurantId !== paymentTx.restaurant_id) {
    return { status: 'rejected', reason: 'tenant_mismatch', paymentTransactionId: paymentTx.id }
  }

  // PHASE 2: تعريف نجاح الدفع = نفس TransactionStatus.SUCCEEDED الموجودة، من عمود status الخادمي
  // حصراً — لا حالة جديدة تُخترَع، ولا نثق بأي علم/حالة من العميل. PHASE 10-C/D: فشل أو معلَّق ⇒ رفض.
  if (paymentTx.status !== TransactionStatus.SUCCEEDED) {
    return {
      status: 'rejected',
      reason: 'payment_not_successful',
      paymentTransactionId: paymentTx.id,
      paymentStatus: paymentTx.status,
    }
  }

  // PHASE 9/10-B: تحقّق مسبق رخيص — إن كان هناك طلب مرتبط فعلاً بهذه المعاملة، يُعاد كما هو، بلا أي
  // إعادة تحقق من اللقطة/البصمة/المبلغ (الطلب موجود بالفعل وصحيح)، وبلا استدعاء create_order إطلاقاً.
  const existingOrder = await reReadOrderByPaymentTransactionId(db, paymentTx.id)
  if (existingOrder) {
    return {
      status: 'succeeded',
      orderId: existingOrder.id,
      orderNumber: existingOrder.order_number,
      accessToken: existingOrder.order_access_token,
      paymentTransactionId: paymentTx.id,
      idempotent: true,
    }
  }

  // PHASE 4: اللقطة المخزَّنة هي المصدر الوحيد الموثوق لمحتوى السلة — لا سلة جديدة من العميل هنا.
  const snapshot = paymentTx.metadata?.checkout
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.items)) {
    // PHASE 10-G
    return { status: 'rejected', reason: 'snapshot_missing', paymentTransactionId: paymentTx.id }
  }

  // PHASE 6: التحقّق من بصمة اللقطة عبر computeCheckoutFingerprint الموجودة — لا منطق بصمة مُكرَّر،
  // ولا بصمة من العميل تُقبَل أبداً (لا يوجد أصلاً مُدخَل بصمة في توقيع هذه الدالة).
  let expectedFingerprint
  try {
    expectedFingerprint = await computeCheckoutFingerprint({
      restaurant_id: snapshot.restaurant_id,
      branch_id: snapshot.branch_id,
      type: snapshot.type,
      items: snapshot.items,
      coupon_code: snapshot.coupon_code,
    })
  } catch (err) {
    // PHASE 10-G
    return { status: 'rejected', reason: 'snapshot_invalid', message: err.message, paymentTransactionId: paymentTx.id }
  }
  if (snapshot.fingerprint !== expectedFingerprint) {
    // PHASE 10-G
    return { status: 'rejected', reason: 'snapshot_fingerprint_mismatch', paymentTransactionId: paymentTx.id }
  }

  // PHASE 5: سلامة المبلغ — المبلغ المدفوع فعلياً (العمود) يجب أن يطابق إجمالي اللقطة تماماً. مقارنة
  // فقط (numericEquals) — لا حساب، لا تقريب، لا تصحيح صامت لأي طرف عند عدم التطابق.
  if (!numericEquals(paymentTx.amount, snapshot.total)) {
    // PHASE 10-H
    return { status: 'rejected', reason: 'amount_integrity_violation', paymentTransactionId: paymentTx.id }
  }

  // مطعم اللقطة يجب أن يطابق عمود ملكية معاملة الدفع نفسها — تناقض داخلي هنا يعني رفضاً آمناً، لا تصحيحاً.
  if (snapshot.restaurant_id !== paymentTx.restaurant_id) {
    return { status: 'rejected', reason: 'snapshot_restaurant_mismatch', paymentTransactionId: paymentTx.id }
  }

  // PHASE 7: create_order — الاستدعاء الحقيقي الوحيد بـp_dry_run=false في هذا الملف بأكمله.
  // p_restaurant_id من عمود payment_transactions.restaurant_id حصراً (أقوى ثقة)، لا من اللقطة ولا
  // من العميل. p_client_total = snapshot.total (المبلغ المدفوع فعلياً بالفعل، تحقَّقنا للتو من
  // تطابقه) — يُمرَّر لتفعيل فحص price_changed الموجود في create_order نفسه (PHASE 12)، وليس "مبلغاً
  // من العميل" بالمعنى الممنوع (هذا مصدره الخادم/قاعدة البيانات، لا طلب HTTP جديد من متصفّح).
  // p_idempotency_key = p_payment_transaction_id = نفس معرّف المعاملة — يجعل أي محاولة استدعاء ثانية
  // (سباق تزامن حقيقي تجاوز التحقّق المسبق أعلاه) تُعاد بأمان عبر آلية create_order الحالية نفسها،
  // بلا إنشاء Order مكرَّر (PHASE 9/10-I) — بلا أي هجرة أو قيد جديد؛ orders_payment_transaction_id_uidx
  // الموجود فعلياً هو الضمان الحقيقي.
  let orderResult
  try {
    const { data, error } = await db
      .rpc('create_order', {
        p_restaurant_id: paymentTx.restaurant_id,
        p_branch_id: snapshot.branch_id,
        p_table_number: input.tableNumber ?? null,
        p_delivery_address: input.deliveryAddress ?? null,
        p_customer_name: input.customerName ?? null,
        p_customer_phone: input.customerPhone,
        p_type: snapshot.type,
        p_items: snapshot.items,
        p_notes: input.notes ?? null,
        p_coupon_code: snapshot.coupon_code,
        p_client_total: snapshot.total,
        p_idempotency_key: paymentTx.id,
        p_payment_transaction_id: paymentTx.id,
        p_dry_run: false, // الاستدعاء الحقيقي الوحيد المسموح بـfalse في مهمة 3.6B فقط
      })
      .single()

    if (error) {
      const message = error.message ?? String(error)
      // PHASE 9/10-I: سباق تزامن حقيقي تجاوز التحقّق المسبق — استرداد آمن بلا Order مكرَّر.
      if (ORDER_PAYMENT_RACE_MARKER.test(message)) {
        const recovered = await reReadOrderByPaymentTransactionId(db, paymentTx.id)
        if (recovered) {
          return {
            status: 'succeeded',
            orderId: recovered.id,
            orderNumber: recovered.order_number,
            accessToken: recovered.order_access_token,
            paymentTransactionId: paymentTx.id,
            idempotent: true,
          }
        }
        return { status: 'retryable_error', reason: 'order_race_unrecovered', paymentTransactionId: paymentTx.id }
      }
      return { status: 'rejected', reason: 'create_order_failed', message, paymentTransactionId: paymentTx.id }
    }
    orderResult = data
  } catch (err) {
    return { status: 'rejected', reason: 'create_order_failed', message: err.message, paymentTransactionId: paymentTx.id }
  }

  // PHASE 12: price_changed=true (أو id فارغ) رغم p_dry_run=false ⇒ لم يُنشأ Order — السعر الحالي
  // اختلف عمّا دُفِع فعلاً. لا نزعم فشلاً قطعياً (الدفع نجح بالفعل) — حالة تتطلّب مطابقة لاحقة، بنفس
  // منطق G-5 الموثَّق مسبقاً (TASK-PAY-3.6A-2A) — غير مُصلَحة هنا، 3.6E المستقبلي مسؤول عنها.
  if (orderResult.price_changed || !orderResult.id) {
    return {
      status: 'price_drift_requires_reconciliation',
      paymentTransactionId: paymentTx.id,
      dryRun: {
        subtotal: orderResult.subtotal,
        tax: orderResult.tax,
        delivery_fee: orderResult.delivery_fee,
        total: orderResult.total,
      },
    }
  }

  // PHASE 10-A: إنشاء ناجح فعلي — أول مرة لهذه المعاملة.
  return {
    status: 'succeeded',
    orderId: orderResult.id,
    orderNumber: orderResult.order_number,
    accessToken: orderResult.access_token,
    paymentTransactionId: paymentTx.id,
    idempotent: false,
  }
}

// ══════════════════════════════════════════════════════════════════
// TASK-PAY-3.6C.1/3.6C.2 — مزامنة حالة الطلب من حالة الدفع (Payment → Order Status Sync)
// ══════════════════════════════════════════════════════════════════
// 3.6C.1: دالة نقيّة بالكامل — قرار واحد فقط، بلا اتصال قاعدة بيانات.
// 3.6C.2: خدمة تُحمِّل معاملة الدفع/الطلب فعلياً وتُطبِّق القرار — بلا استدعاء create_order إطلاقاً،
// بلا تعديل webhook، بلا استدعاء paymentService.refund. تكامل الاسترداد الفعلي (3.6C.3) مؤجَّل عمداً.
//
// الحالات الخمس الفعلية الوحيدة لحالة الطلب (مُتحقَّق منها حيّاً في تدقيق TASK_3_6C_A، لا افتراضاً):
// pending, preparing, ready, completed, cancelled — لا confirmed، لا out_for_delivery، لا delivered.

const ORDER_STATUSES = Object.freeze(['pending', 'preparing', 'ready', 'completed', 'cancelled'])
const REFUND_CANCELLABLE_ORDER_STATUSES = new Set(['pending', 'preparing', 'ready'])
const PAYMENT_STATUSES = new Set(Object.values(TransactionStatus))
// TASK-PAY-3.6B: نفس نمط رسالة enforce_order_transition الموجودة فعلياً (sql/order_state_machine.sql)
const INVALID_TRANSITION_MARKER = 'invalid_order_transition'

/**
 * قرار مزامنة نقيّ واحد: هل يجب أن يتغيّر حالة الطلب استجابة لحالة الدفع؟ بلا اتصال قاعدة بيانات،
 * بلا حالة، بلا عشوائية. لا يبتكر أي حالة طلب جديدة — فقط 'cancelled' من بين الخمس الموجودة فعلاً.
 *
 * @param {string} paymentStatus أحد قيم TransactionStatus
 * @param {string} orderStatus أحد قيم ORDER_STATUSES الفعلية الخمس
 * @returns {{action: 'cancel'|'none'|'unsupported', reason?: string}}
 */
export function decideOrderSyncAction(paymentStatus, orderStatus) {
  if (!ORDER_STATUSES.includes(orderStatus)) {
    return { action: 'unsupported', reason: 'unknown_order_status' }
  }
  if (!PAYMENT_STATUSES.has(paymentStatus)) {
    return { action: 'unsupported', reason: 'unknown_payment_status' }
  }

  // TASK-PAY-3.6C-A: نجاح/تعليق/فشل/إلغاء الدفع لا يتطلّب أي تغيير على حالة الطلب — 3.6B نفسها هي
  // المزامنة الوحيدة اللازمة لحالة "نجح الدفع" (الطلب يُنشأ pending فقط بعد التحقّق من النجاح أصلاً).
  if (paymentStatus !== TransactionStatus.REFUNDED) {
    return { action: 'none' }
  }

  // من هنا فصاعداً: paymentStatus === 'refunded'
  if (orderStatus === 'cancelled') {
    return { action: 'none' } // مُطابِق بالفعل — لا حاجة لتحديث زائد (إتقان)
  }
  if (REFUND_CANCELLABLE_ORDER_STATUSES.has(orderStatus)) {
    return { action: 'cancel' }
  }
  // orderStatus === 'completed' هنا حصراً (الحالة الوحيدة المتبقية من ORDER_STATUSES الخمس)
  return { action: 'unsupported', reason: 'completed_order_no_valid_transition' }
}

/**
 * يزامن حالة الطلب المرتبط بمعاملة دفع بعد تغيّر حالتها — حصراً استرداد على طلب لم يكتمل بعد،
 * طبقاً لـdecideOrderSyncAction. لا يُنشئ طلباً أبداً (لا create_order إطلاقاً، لا dry-run ولا حقيقي)،
 * ولا يستدعي paymentService.refund، ولا يعدّل webhook. حالة الدفع تُقرأ من العمود الفعلي حصراً —
 * لا يوجد مُدخَل paymentStatus/restaurant_id/order_id في توقيع هذه الدالة أصلاً؛ لا شيء من ذلك
 * يمكن أن يأتي من عميل حتى لو حاول.
 *
 * @param {object} input
 * @param {string} input.paymentTransactionId
 * @param {{db: object}} ctx
 * @returns {Promise<object>} {action, reason?, paymentTransactionId, orderId?, ...}
 */
export async function syncOrderStatusFromPayment(input, { db } = {}) {
  if (!db) throw new TypeError('checkoutOrchestration: db مطلوب')
  if (!input?.paymentTransactionId) {
    throw new TypeError('checkoutOrchestration: paymentTransactionId مطلوب')
  }

  // تحميل معاملة الدفع خادمياً — status/restaurant_id من العمود الفعلي حصراً، لا من أي مُدخَل عميل.
  const { data: paymentTx, error: fetchErr } = await db
    .from('payment_transactions')
    .select('id, restaurant_id, status')
    .eq('id', input.paymentTransactionId)
    .maybeSingle()

  if (fetchErr || !paymentTx) {
    return { action: 'none', reason: 'payment_transaction_not_found', paymentTransactionId: input.paymentTransactionId }
  }

  // البحث عن الطلب المرتبط عبر orders_payment_transaction_id_uidx الموجود فعلاً — لا فهرس جديد.
  const { data: order, error: orderErr } = await db
    .from('orders')
    .select('id, status, restaurant_id')
    .eq('payment_transaction_id', paymentTx.id)
    .maybeSingle()

  if (orderErr || !order) {
    // TASK-PAY-3.6B/3.6E يبقيان المسؤولَين عن إنشاء/استرداد الطلب — هذه الدالة لا تُنشئ طلباً أبداً.
    return { action: 'none', reason: 'order_not_found', paymentTransactionId: paymentTx.id }
  }

  // عزل المستأجرين: RLS لا تحمي استدعاءً بصلاحية service_role — فحص صريح إلزامي، من عمودي الملكية
  // الفعليين فقط على كلا الصفّين، لا من أي هوية مستأجر ثانية يُفترَض تمريرها من مستدعٍ.
  if (order.restaurant_id !== paymentTx.restaurant_id) {
    return { action: 'none', reason: 'tenant_mismatch', paymentTransactionId: paymentTx.id, orderId: order.id }
  }

  const decision = decideOrderSyncAction(paymentTx.status, order.status)

  if (decision.action !== 'cancel') {
    return {
      ...decision,
      paymentTransactionId: paymentTx.id,
      orderId: order.id,
      orderStatus: order.status,
      paymentStatus: paymentTx.status,
    }
  }

  // فقط action==='cancel' يصل هنا. التحديث محروس بـrestaurant_id أيضاً (دفاع تطبيقي إضافي، وليس
  // بديلاً عن enforce_order_transition الذي يبقى الحارس الوحيد والنهائي لصحّة الانتقال نفسه — لا
  // نتجاوزه بامتيازات service_role ولا نعدّله بأي شكل).
  const { error: updateErr } = await db
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('id', order.id)
    .eq('restaurant_id', paymentTx.restaurant_id)

  if (updateErr) {
    const message = updateErr.message ?? String(updateErr)
    // TASK-PAY-3.6C.2: سباق تزامن حقيقي — تحرّك طاقم العمل حالة الطلب بين القراءة والتحديث هنا
    // (مثلاً إلى completed) فرفضها enforce_order_transition. تصنيف آمن، لا فشل تطبيقي غير متوقَّع.
    if (message.includes(INVALID_TRANSITION_MARKER)) {
      return {
        action: 'unsupported',
        reason: 'invalid_order_transition',
        message,
        paymentTransactionId: paymentTx.id,
        orderId: order.id,
      }
    }
    return { action: 'unsupported', reason: 'update_failed', message, paymentTransactionId: paymentTx.id, orderId: order.id }
  }

  return { action: 'cancel', paymentTransactionId: paymentTx.id, orderId: order.id, updated: true }
}

export const checkoutOrchestration = {
  initiatePaymentFirstCheckout,
  createOrderFromSuccessfulPayment,
  decideOrderSyncAction,
  syncOrderStatusFromPayment,
}
