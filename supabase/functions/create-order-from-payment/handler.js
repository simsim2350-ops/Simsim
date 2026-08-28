/**
 * create-order-from-payment/handler.js
 *
 * TASK-PAY-3.6D.6 — تنفيذ مواصفة TASK_3_6D_6-A المعتمدة حرفياً (owner approval).
 * نقطة الدخول الخادمية الوحيدة التي تُشغِّل createOrderFromSuccessfulPayment (TASK-PAY-3.6B،
 * غير مُعدَّلة هنا إطلاقاً). المتصفّح لا يملك أبداً paymentTransactionId — فقط paymentIdempotencyKey
 * (نفس القيمة التي وُلِّدت قبل التحويل، TASK-PAY-3.6D.3، والمُعادة عبر معامل payment_callback في
 * عنوان العودة، TASK_3_6D_4_C.1/.2). هذا المعالج يحلّ paymentTransactionId خادمياً حصراً، ثم يستدعي
 * الدالة الموجودة دون أي تكرار لمنطقها (فحص البصمة/المبلغ/الحالة/الاستراد الآمن عند السباق).
 *
 * التبعيات مُحقونة بالكامل عبر buildHandler({ db, createOrder }) — قابل للاختبار بدون Deno وبدون
 * Supabase حقيقي، بنفس نمط payment-first-checkout/handler.js تماماً.
 *
 * حدود الثقة (Trust Boundary — TASK_3_6D_6_A §AUTHORITATIVE_VS_UNTRUSTED_DATA):
 *   - paymentTransactionId: يُحلّ هنا فقط من payment_transactions.idempotency_key؛ لا يُقرأ أبداً
 *     من جسم الطلب حتى لو أُرسِل.
 *   - المطعم/الحالة/المبلغ/العملة/لقطة السلة: من payment_transactions فقط (عبر الدالة الموجودة).
 *   - هاتف/اسم/طاولة/عنوان/ملاحظات العميل: تنفيذية بحتة، غير موثوقة، لا تؤثر على السعر/اللقطة/التفويض.
 *   - رقم الطاولة لمسار QR: يُحلّ من table_qr_token خادمياً فقط؛ أي tableNumber من جسم الطلب في هذا
 *     المسار يُتجاهَل كلياً (لا يُقرأ حتى)، مطابقةً صريحة لتعليمات الموافقة (TASK_3_6D_6-A §QR).
 */

import { createOrderFromSuccessfulPayment as defaultCreateOrder } from '../../../src/payments/services/checkoutOrchestration.js'
import { TransactionStatus } from '../../../src/payments/types/index.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// حدود دفاعية فقط — نفس قيم payment-first-checkout/handler.js حرفياً، للاتساق، لا اختراع حدّ جديد.
const MAX_BODY_BYTES = 32 * 1024
const MAX_STRING_LEN = 500
const PHONE_SHAPE = /^5[0-9]{8}$/
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * بناء معالج الطلبات — يُعاد استخدامه في الإنتاج والاختبارات.
 * @param {{ db: object, createOrder?: Function }} deps
 * @returns {(req: Request) => Promise<Response>}
 */
export function buildHandler({ db, createOrder = defaultCreateOrder } = {}) {
  return async function handleRequest(req) {
    const requestId = crypto.randomUUID()

    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }
    if (req.method !== 'POST') {
      return json({ error: 'method_not_allowed' }, 405)
    }

    let rawBody
    try {
      rawBody = await req.text()
    } catch {
      return json({ status: 'validation_error' }, 400)
    }
    if (byteLength(rawBody) > MAX_BODY_BYTES) {
      console.warn(`[create-order-from-payment:${requestId}] rejected: body_too_large`)
      return json({ status: 'validation_error' }, 400)
    }

    let body
    try {
      body = JSON.parse(rawBody)
    } catch {
      return json({ status: 'validation_error' }, 400)
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json({ status: 'validation_error' }, 400)
    }

    // العميل لا يرسل أبداً: paymentTransactionId/providerRef/amount/currency/restaurant_id/branch_id/
    // items/coupon_code/type — لا تُقرأ أياً من هذه الحقول هنا حتى لو وُجدت في الجسم (نفس أسلوب
    // payment-first-checkout: عدم القراءة، لا رفض صريح لكل حقل زائد).
    const validation = validateRequest(body)
    if (validation.error) {
      console.warn(`[create-order-from-payment:${requestId}] invalid_request: ${validation.error}`)
      return json({ status: 'validation_error' }, 400)
    }

    const { isQr } = validation

    // PHASE 1: حلّ معاملة الدفع خادمياً حصراً من paymentIdempotencyKey — لا paymentTransactionId من
    // العميل إطلاقاً. مطابقة تامة فقط (نفس نمط get_payment_status_by_idempotency_key/
    // reReadByIdempotencyKey الموجودَين).
    let paymentTx
    try {
      const { data, error } = await db
        .from('payment_transactions')
        .select('id, restaurant_id, status')
        .eq('idempotency_key', validation.paymentIdempotencyKey)
        .maybeSingle()
      if (error) throw error
      paymentTx = data
    } catch (err) {
      console.error(`[create-order-from-payment:${requestId}] payment_lookup_exception: ${err?.message ?? String(err)}`)
      return json({ error: 'internal_error' }, 500)
    }

    if (!paymentTx) {
      console.warn(`[create-order-from-payment:${requestId}] not_found: no payment transaction for supplied key`)
      return json({ status: 'not_found' }, 200)
    }

    // PHASE 2: الحالة سلطتها عمود payment_transactions.status وحده — أي شيء غير succeeded يعني
    // "لم يكتمل بعد" من منظور العميل (لا فرق بين pending/failed هنا — تعميم متعمَّد، القرار 4 المعتمد).
    if (paymentTx.status !== TransactionStatus.SUCCEEDED) {
      console.log(`[create-order-from-payment:${requestId}] pending: paymentTransactionId=${paymentTx.id} status=${paymentTx.status}`)
      return json({ status: 'pending' }, 200)
    }

    // PHASE 3: حلّ المستأجر خادمياً — قراءة فقط. QR يُعيد أيضاً رقم الطاولة الحقيقي (المصدر الوحيد
    // المسموح لرقم الطاولة في هذا المسار — لا localStorage، لا جسم الطلب).
    let tenant
    try {
      tenant = isQr
        ? await resolveQrTenant(db, validation.table_qr_token)
        : await resolveSlugTenant(db, validation.restaurant_slug)
    } catch (err) {
      console.error(`[create-order-from-payment:${requestId}] tenant_resolution_exception: ${err?.message ?? String(err)}`)
      return json({ error: 'internal_error' }, 500)
    }

    if (!tenant) {
      console.warn(`[create-order-from-payment:${requestId}] not_found: tenant resolution failed`)
      return json({ status: 'not_found' }, 200)
    }

    // PHASE 4: تحقّق دفاعي — تعزيز مبكر رخيص لما تتحقّقه createOrderFromSuccessfulPayment أصلاً عبر
    // expectedRestaurantId (تعميم إلى not_found، لا كشف سبب الرفض الدقيق — القرار 4 المعتمد).
    if (tenant.restaurant_id !== paymentTx.restaurant_id) {
      console.warn(`[create-order-from-payment:${requestId}] not_found: tenant mismatch paymentTransactionId=${paymentTx.id}`)
      return json({ status: 'not_found' }, 200)
    }

    // PHASE 5: رقم الطاولة — QR: من tenant المُحلَّل خادمياً حصراً (تجاهل تام لأي قيمة من الجسم، حتى
    // لو أُرسِلت). غير-QR: من الجسم كما هو (حقل تنفيذي غير موثوق، create_order هو السلطة النهائية).
    const tableNumber = isQr ? (tenant.table_number ?? undefined) : validation.tableNumber

    // PHASE 6: الاستدعاء الوحيد لـcreateOrderFromSuccessfulPayment — بلا أي تكرار لمنطقها الداخلي.
    let result
    try {
      result = await createOrder(
        {
          paymentTransactionId: paymentTx.id,
          expectedRestaurantId: tenant.restaurant_id,
          customerPhone: validation.customerPhone,
          customerName: validation.customerName,
          tableNumber,
          deliveryAddress: validation.deliveryAddress,
          notes: validation.notes,
        },
        { db }
      )
    } catch (err) {
      console.error(`[create-order-from-payment:${requestId}] create_order_exception: ${err?.message ?? String(err)}`)
      return json({ error: 'internal_error' }, 500)
    }

    return buildResponse(result, { requestId })
  }
}

// ——————————— التحقّق من الطلب ———————————

function validateRequest(body) {
  if (typeof body.paymentIdempotencyKey !== 'string' || body.paymentIdempotencyKey.trim().length === 0) {
    return { error: 'invalid_payment_idempotency_key' }
  }

  const hasQr = typeof body.table_qr_token === 'string' && body.table_qr_token.length > 0
  const hasSlug = typeof body.restaurant_slug === 'string' && body.restaurant_slug.length > 0
  // بالضبط واحد منهما — لا كلاهما، ولا غيابهما معاً (نفس قاعدة payment-first-checkout حرفياً).
  if (hasQr === hasSlug) return { error: 'exactly_one_of_table_qr_token_or_restaurant_slug_required' }
  if (hasQr && !UUID_SHAPE.test(body.table_qr_token)) return { error: 'invalid_table_qr_token' }

  if (typeof body.customerPhone !== 'string' || !PHONE_SHAPE.test(body.customerPhone)) {
    return { error: 'invalid_customer_phone' }
  }

  const stringFields = { customerName: body.customerName, notes: body.notes, deliveryAddress: body.deliveryAddress, tableNumber: body.tableNumber }
  for (const [field, val] of Object.entries(stringFields)) {
    if (val === undefined || val === null) continue
    if (typeof val !== 'string') return { error: `invalid_${field}` }
    if (val.length > MAX_STRING_LEN) return { error: `${field}_too_long` }
  }

  return {
    isQr: hasQr,
    paymentIdempotencyKey: body.paymentIdempotencyKey,
    table_qr_token: hasQr ? body.table_qr_token : undefined,
    restaurant_slug: hasQr ? undefined : body.restaurant_slug,
    customerPhone: body.customerPhone,
    customerName: nonEmpty(body.customerName),
    notes: nonEmpty(body.notes),
    deliveryAddress: nonEmpty(body.deliveryAddress),
    tableNumber: nonEmpty(body.tableNumber),
  }
}

function nonEmpty(val) {
  if (typeof val !== 'string') return undefined
  const trimmed = val.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

// ——————————— حلّ المستأجر (قراءة فقط) ———————————

/** يُطابق حرفياً معايير payment-first-checkout/handler.js's resolveQrTenant (استعلامان منفصلان، لا تكرار منطق). */
async function resolveQrTenant(db, qrToken) {
  const { data: table, error: tableErr } = await db
    .from('restaurant_tables')
    .select('id, table_number, restaurant_id, branch_id')
    .eq('qr_token', qrToken)
    .eq('qr_enabled', true)
    .eq('status', 'active')
    .maybeSingle()
  if (tableErr || !table) return null

  const { data: restaurant, error: restErr } = await db
    .from('restaurants')
    .select('id, is_active, platform_suspended')
    .eq('id', table.restaurant_id)
    .maybeSingle()
  if (restErr || !restaurant) return null
  if (!restaurant.is_active || restaurant.platform_suspended) return null

  return { restaurant_id: table.restaurant_id, branch_id: table.branch_id, table_number: table.table_number }
}

async function resolveSlugTenant(db, slug) {
  const { data: restaurant, error } = await db
    .from('restaurants')
    .select('id, is_active, platform_suspended')
    .eq('slug', slug)
    .maybeSingle()
  if (error || !restaurant) return null
  if (!restaurant.is_active || restaurant.platform_suspended) return null

  return { restaurant_id: restaurant.id }
}

// ——————————— بناء استجابة النتيجة ———————————

/**
 * PHASE 7 — يُحوِّل مُخرَج createOrderFromSuccessfulPayment (غير المُعدَّل) إلى عقد استجابة معتمَد.
 * لا providerRef، لا paymentTransactionId، لا metadata خام، لا رسائل خطأ خام، أبداً — في أي حالة.
 * تعميم صريح لأسباب rejected الداخلية (القرار 4 المعتمد — لا كشف تمييز دقيق يُمكِّن تعداد الدفعات).
 */
function buildResponse(result, { requestId }) {
  const status = result?.status

  switch (status) {
    case 'succeeded':
      console.log(`[create-order-from-payment:${requestId}] succeeded: orderId=${result.orderId} idempotent=${result.idempotent}`)
      return json(
        {
          status: 'succeeded',
          orderId: result.orderId,
          orderNumber: result.orderNumber,
          accessToken: result.accessToken,
          idempotent: result.idempotent,
        },
        200
      )

    case 'rejected': {
      // reason=payment_not_successful ⇒ نفس تعميم "pending" أعلاه (سباق نادر: تغيّرت الحالة بين
      // الفحص المسبق هنا والقراءة الداخلية الطازجة لـcreateOrderFromSuccessfulPayment).
      if (result.reason === 'payment_not_successful') {
        console.log(`[create-order-from-payment:${requestId}] pending (race): ${result.reason}`)
        return json({ status: 'pending' }, 200)
      }
      // payment_transaction_not_found / tenant_mismatch ⇒ نفس تعميم "not_found" أعلاه (سباق نادر أو
      // تناسق دفاعي إضافي — الفحوصات المسبقة هنا يُفترَض أن تمنعهما عادةً).
      if (result.reason === 'payment_transaction_not_found' || result.reason === 'tenant_mismatch') {
        console.warn(`[create-order-from-payment:${requestId}] not_found (race): ${result.reason}`)
        return json({ status: 'not_found' }, 200)
      }
      // بقية الأسباب (snapshot_missing/snapshot_invalid/snapshot_fingerprint_mismatch/
      // amount_integrity_violation/snapshot_restaurant_mismatch/create_order_failed) ⇒ انتهاكات
      // سلامة حقيقية أو فشل create_order غير متوقَّع — لا تصنيف عمل عادي لها في العقد المعتمد؛
      // تُسجَّل بمستوى error للانتباه البشري، وتُعاد كخطأ داخلي آمن دون كشف السبب أو أي رسالة خام.
      console.error(`[create-order-from-payment:${requestId}] internal_error (integrity/create_order): ${result.reason}`)
      return json({ error: 'internal_error' }, 500)
    }

    case 'retryable_error':
      console.warn(`[create-order-from-payment:${requestId}] retryable_error: ${result.reason}`)
      return json({ status: 'retryable_error' }, 200)

    case 'price_drift_requires_reconciliation':
      console.error(`[create-order-from-payment:${requestId}] requires_reconciliation: paymentTransactionId=${result.paymentTransactionId ?? 'unknown'}`)
      return json({ status: 'requires_reconciliation' }, 200)

    default:
      console.error(`[create-order-from-payment:${requestId}] unexpected_status: ${String(status)}`)
      return json({ error: 'internal_error' }, 500)
  }
}

// ——————————— أدوات مساعدة ———————————

function byteLength(str) {
  return new TextEncoder().encode(str).length
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
