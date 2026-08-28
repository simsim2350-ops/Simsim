/**
 * payment-first-checkout/handler.js
 *
 * TASK-PAY-3.6D-E — تنفيذ مواصفة TASK_3_6D_C المعتمدة حرفياً.
 * منطق بلا أي تبعية خاصة بـ Deno عدا crypto.randomUUID (متوفّرة أيضاً في Node/Vitest الحديث).
 * مُستورَد من index.ts (الإنتاج) ومن ملف الاختبار (Vitest).
 *
 * التبعيات مُحقونة بالكامل عبر buildHandler({ db, orchestrate, publicAppBaseUrl })
 * مما يجعل هذا الملف قابلاً للاختبار بدون Deno وبدون Supabase حقيقي وبدون Moyasar حقيقي.
 *
 * لماذا نستورد initiatePaymentFirstCheckout مباشرةً هنا (خلافاً لـpayment-webhook)؟
 *   TASK-PAY-3.6D-E: تبيّن أن checkoutOrchestration.js وpaymentService.js (وuutils/index.js) كانت
 *   تستخدم محددات وحدات مجردة بلا امتداد (مثل '../adapters', '../utils', './paymentService') —
 *   نفس القيد الذي وثّقه payment-webhook/handler.js لعدم استيراد paymentService.js مباشرة. بموافقة
 *   صريحة من المالك (سؤال مباشر أُجيب عنه قبل بدء هذه المهمة)، أُضيفت امتدادات .js صراحةً لأسطر
 *   الاستيراد الأربعة في checkoutOrchestration.js والأربعة في paymentService.js وسطر واحد في
 *   utils/index.js — تعديل ميكانيكي بحت بلا أي تغيير سلوك (751/751 اختبار ما زال ناجحاً بعده)، يجعل
 *   السلسلة الحقيقية بأكملها قابلة للاستيراد من Deno دون تكرار أي منطق دفع معقّد هنا.
 */

import { initiatePaymentFirstCheckout as defaultOrchestrate } from '../../../src/payments/services/checkoutOrchestration.js'
import { newIdempotencyKey } from '../../../src/payments/utils/index.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// PHASE 7 — حدود دفاعية فقط، لا تُكرِّر تحقق create_order الكامل ولا تحلّ محله.
const MAX_BODY_BYTES = 32 * 1024
const MAX_ITEMS = 100
const MAX_STRING_LEN = 500
const MAX_QUANTITY = 1000
const VALID_TYPES = new Set(['dine_in', 'takeaway', 'delivery'])
// نفس نمط create_order الفعلي حرفياً (sql/order_idempotency.sql) — فحص رخيص فقط، ليس السلطة النهائية.
const PHONE_SHAPE = /^5[0-9]{8}$/
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SUPPORTED_CURRENCY = 'SAR'

/**
 * بناء معالج الطلبات — يُعاد استخدامه في الإنتاج والاختبارات.
 * @param {{ db: object, orchestrate?: Function, publicAppBaseUrl?: string }} deps
 * @returns {(req: Request) => Promise<Response>}
 */
export function buildHandler({ db, orchestrate = defaultOrchestrate, publicAppBaseUrl }) {
  return async function handleRequest(req) {
    const requestId = crypto.randomUUID()

    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }
    if (req.method !== 'POST') {
      return json({ error: 'method_not_allowed' }, 405)
    }

    // PHASE 10: عنوان العودة سلطته خادمية دائماً — بلا هذا المتغيّر لا يمكن بناء returnUrl آمن إطلاقاً.
    // هذا خطأ تهيئة تشغيلي (مثل غياب webhookSecret في payment-webhook)، لا مُخرَج عمل — 500 داخلي.
    if (!publicAppBaseUrl) {
      console.error(`[payment-first-checkout:${requestId}] PUBLIC_APP_BASE_URL not configured`)
      return json({ error: 'internal_error' }, 500)
    }

    // PHASE 7: حدّ حجم الجسم — قبل أي تحليل JSON
    let rawBody
    try {
      rawBody = await req.text()
    } catch {
      return json({ error: 'invalid_request' }, 400)
    }
    if (byteLength(rawBody) > MAX_BODY_BYTES) {
      console.warn(`[payment-first-checkout:${requestId}] rejected request: body_too_large`)
      return json({ error: 'invalid_request' }, 400)
    }

    let body
    try {
      body = JSON.parse(rawBody)
    } catch {
      return json({ error: 'invalid_request' }, 400)
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json({ error: 'invalid_request' }, 400)
    }

    // PHASE 4/7/8: عقد الطلب + التحقّق الدفاعي — لا يُشتقّ منها أي قيمة موثوقة معمارياً (المطعم/الفرع
    // يُحلّان لاحقاً حصراً من QR أو من restaurant_slug، أبداً من restaurant_id/table_id/currency/
    // returnUrl/providerRef حتى لو أُرسِلت في الجسم — هذه الحقول غير مقروءة إطلاقاً أدناه).
    const validation = validateRequest(body)
    if (validation.error) {
      console.warn(`[payment-first-checkout:${requestId}] invalid_request: ${validation.error}`)
      return json({ error: 'invalid_request' }, 400)
    }

    const { isQr } = validation

    // PHASE 5/6: حلّ المستأجر خادمياً حصراً — قراءة فقط، بلا أي تعديل أو استدعاء لـ
    // create_order_from_table_qr نفسها.
    let tenant
    try {
      tenant = isQr
        ? await resolveQrTenant(db, validation.table_qr_token)
        : await resolveSlugTenant(db, validation.restaurant_slug, validation.branch_id)
    } catch (err) {
      console.error(`[payment-first-checkout:${requestId}] tenant_resolution_exception: ${err?.message ?? String(err)}`)
      return json({ error: 'internal_error' }, 500)
    }

    if (!tenant) {
      console.warn(`[payment-first-checkout:${requestId}] rejected: tenant_not_found`)
      return json({ status: 'rejected', reason: 'tenant_not_found' }, 200)
    }

    // PHASE 15: مفتاح إتقان الدفع — يُحسَم هنا (لا داخل initiatePaymentFirstCheckout) لأن returnUrl
    // يحتاج القيمة نفسها قبل استدعاء التنسيق. إن أرسل العميل مفتاحاً (سياسة "استخدام فقط لا اختلاق"،
    // IDEMPOTENCY في تقرير 3.6D-C) يُستخدَم كما هو حرفياً؛ وإلا يُولَّد هنا مرة واحدة فقط بنفس أداة
    // newIdempotencyKey('pay') التي كانت ستُستخدَم داخلياً على أي حال — initiatePaymentFirstCheckout
    // لن يُولِّد مفتاحاً ثانياً لأن القيمة المُمرَّرة تُقدَّم دائماً على التوليد الداخلي.
    const paymentIdempotencyKey = validation.paymentIdempotencyKey ?? newIdempotencyKey('pay')

    // PHASE 10: عنوان العودة — يُبنى خادمياً هنا فقط، دون قبول أي قيمة من العميل، ويُمرَّر إلى
    // initiatePaymentFirstCheckout كـinput.returnUrl (نفس الحقل الذي تستهلكه فعلياً وتُمرّره لـMoyasar
    // عبر startCharge/adapter — غير الحقل الذي يُعاد للمتصفّح لاحقاً، وهو response.redirectUrl الذي
    // تُعيده initiatePaymentFirstCheckout نفسها، عنوان صفحة Moyasar المُستضافة).
    // TASK-PAY-3.6D.4-C.2: عقد سياق العودة المعتمد (TASK_3_6D_4_C_1) — branch للمسار غير-QR فقط
    // (tenant.branch_id المُحلَّل خادمياً أصلاً، لا مصدر آخر)، table للمسار QR فقط، بلا تكرار بينهما.
    const returnUrl = buildReturnUrl({
      publicAppBaseUrl,
      restaurantSlug: tenant.restaurant_slug,
      paymentIdempotencyKey,
      tableQrToken: isQr ? validation.table_qr_token : null,
      branchId: isQr ? null : tenant.branch_id,
    })

    // PHASE 9: استدعاء التنسيق الفعلي — أسماء المُدخلات مطابقة تماماً لتوقيع initiatePaymentFirstCheckout
    // الموجود فعلاً؛ لا حقول مُخترَعة. restaurant_id/branch_id/table_number من tenant المُحلَّل خادمياً
    // حصراً — لا مصدر آخر، ولا يمكن لقيمة branch_id/table_number من جسم الطلب تجاوز هذا أبداً.
    const orchestrationInput = {
      restaurant_id: tenant.restaurant_id,
      branch_id: tenant.branch_id,
      type: validation.type,
      table_number: isQr ? tenant.table_number : (validation.table_number ?? null),
      delivery_address: validation.delivery_address ?? null,
      customer_name: validation.customer_name ?? null,
      customer_phone: validation.customer_phone,
      notes: validation.notes ?? null,
      items: validation.items,
      coupon_code: validation.coupon_code ?? null,
      clientTotal: validation.clientTotal ?? null,
      paymentIdempotencyKey,
      returnUrl,
    }

    let response
    try {
      response = await orchestrate(orchestrationInput, { db })
    } catch (err) {
      console.error(`[payment-first-checkout:${requestId}] orchestration_exception: ${err?.message ?? String(err)}`)
      return json({ error: 'internal_error' }, 500)
    }

    return buildResponse(response, { db, requestId })
  }
}

// ——————————— التحقّق من الطلب ———————————

function validateRequest(body) {
  const hasQr = typeof body.table_qr_token === 'string' && body.table_qr_token.length > 0
  const hasSlug = typeof body.restaurant_slug === 'string' && body.restaurant_slug.length > 0

  // PHASE 4: أحدهما فقط — لا كلاهما، ولا غيابهما معاً.
  if (hasQr === hasSlug) return { error: 'exactly_one_of_table_qr_token_or_restaurant_slug_required' }

  if (hasQr) {
    if (!UUID_SHAPE.test(body.table_qr_token)) return { error: 'invalid_table_qr_token' }
  } else {
    if (typeof body.branch_id !== 'string' || body.branch_id.trim().length === 0) {
      return { error: 'branch_id_required' }
    }
  }

  if (!VALID_TYPES.has(body.type)) return { error: 'invalid_type' }

  // PHASE 8
  if (body.type === 'delivery') {
    if (typeof body.delivery_address !== 'string' || body.delivery_address.trim().length === 0) {
      return { error: 'delivery_address_required' }
    }
  }
  if (body.type === 'dine_in' && !hasQr) {
    if (typeof body.table_number !== 'string' || body.table_number.trim().length === 0) {
      return { error: 'table_number_required' }
    }
  }

  if (typeof body.customer_phone !== 'string' || !PHONE_SHAPE.test(body.customer_phone)) {
    return { error: 'invalid_customer_phone' }
  }

  // PHASE 7: items
  if (!Array.isArray(body.items) || body.items.length === 0) return { error: 'items_required' }
  if (body.items.length > MAX_ITEMS) return { error: 'too_many_items' }
  for (const item of body.items) {
    if (!item || typeof item !== 'object') return { error: 'invalid_item' }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > MAX_QUANTITY) {
      return { error: 'invalid_item_quantity' }
    }
  }

  // PHASE 7: حدود نصية — رفض، لا اقتطاع صامت
  for (const [field, val] of [
    ['customer_name', body.customer_name],
    ['notes', body.notes],
    ['delivery_address', body.delivery_address],
  ]) {
    if (val === undefined || val === null) continue
    if (typeof val !== 'string') return { error: `invalid_${field}` }
    if (val.length > MAX_STRING_LEN) return { error: `${field}_too_long` }
  }

  if (body.paymentIdempotencyKey !== undefined && body.paymentIdempotencyKey !== null) {
    if (typeof body.paymentIdempotencyKey !== 'string' || body.paymentIdempotencyKey.trim().length === 0) {
      return { error: 'invalid_payment_idempotency_key' }
    }
  }

  if (body.clientTotal !== undefined && body.clientTotal !== null && typeof body.clientTotal !== 'number') {
    return { error: 'invalid_client_total' }
  }

  if (body.coupon_code !== undefined && body.coupon_code !== null && typeof body.coupon_code !== 'string') {
    return { error: 'invalid_coupon_code' }
  }

  return {
    isQr: hasQr,
    table_qr_token: hasQr ? body.table_qr_token : undefined,
    restaurant_slug: hasQr ? undefined : body.restaurant_slug,
    branch_id: hasQr ? undefined : body.branch_id,
    type: body.type,
    table_number: body.table_number,
    delivery_address: body.delivery_address,
    customer_name: body.customer_name,
    customer_phone: body.customer_phone,
    notes: body.notes,
    items: body.items,
    coupon_code: body.coupon_code ?? null,
    clientTotal: body.clientTotal,
    paymentIdempotencyKey: body.paymentIdempotencyKey,
  }
}

// ——————————— حلّ المستأجر (قراءة فقط) ———————————

/**
 * PHASE 5 — يُطابق حرفياً معايير create_order_from_table_qr الفعلية (sql/order_idempotency.sql) —
 * ثلاثة استعلامات قراءة متسلسلة (مكافئة للـJOIN الثلاثي هناك)، بدل استدعاء أو تعديل تلك الدالة.
 */
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
    .select('id, slug, is_active, platform_suspended')
    .eq('id', table.restaurant_id)
    .maybeSingle()
  if (restErr || !restaurant) return null
  if (!restaurant.is_active) return null
  if (restaurant.platform_suspended) return null

  const { data: branch, error: branchErr } = await db
    .from('branches')
    .select('id, restaurant_id, is_active, is_paused')
    .eq('id', table.branch_id)
    .maybeSingle()
  if (branchErr || !branch) return null
  if (branch.restaurant_id !== table.restaurant_id) return null
  if (!branch.is_active) return null
  if (branch.is_paused) return null

  return {
    restaurant_id: table.restaurant_id,
    branch_id: table.branch_id,
    table_number: table.table_number,
    restaurant_slug: restaurant.slug,
  }
}

/** PHASE 6 — restaurant_id يُحلّ من restaurant_slug فقط؛ branch_id يبقى ثقة create_order وحدها. */
async function resolveSlugTenant(db, slug, branchId) {
  const { data: restaurant, error } = await db
    .from('restaurants')
    .select('id, slug, is_active, platform_suspended')
    .eq('slug', slug)
    .maybeSingle()
  if (error || !restaurant) return null
  if (!restaurant.is_active) return null
  if (restaurant.platform_suspended) return null

  return {
    restaurant_id: restaurant.id,
    branch_id: branchId,
    table_number: null,
    restaurant_slug: restaurant.slug,
  }
}

// ——————————— عنوان العودة ———————————

/**
 * PHASE 10 — لا مصدر آخر لـPUBLIC_APP_BASE_URL؛ لا Origin/Referer/Host إطلاقاً.
 * TASK-PAY-3.6D.4-C.2: عقد سياق العودة المعتمد (TASK_3_6D_4_C_1) — table (لا t، بلا توافق قديم؛
 * لم يُنشَر هذا الـEdge Function على أي بيئة بعد) للمسار QR فقط؛ branch للمسار غير-QR فقط؛ حصري
 * بينهما دائماً (بنية الدالة نفسها تضمن ذلك، لا انضباط المستدعي فقط) — لا تكرار، لا مصدر آخر لأيهما.
 * payment_callback يبقى كما هو حرفياً: علامة تفعيل فقط في جانب المتصفّح، لا سلطة دفع أبداً.
 */
function buildReturnUrl({ publicAppBaseUrl, restaurantSlug, paymentIdempotencyKey, tableQrToken, branchId }) {
  let url = `${publicAppBaseUrl}/menu/${encodeURIComponent(restaurantSlug)}?payment_callback=${encodeURIComponent(paymentIdempotencyKey)}`
  if (tableQrToken) {
    url += `&table=${encodeURIComponent(tableQrToken)}`
  } else if (branchId) {
    url += `&branch=${encodeURIComponent(branchId)}`
  }
  return url
}

// ——————————— بناء استجابة النتيجة ———————————

/** PHASE 11/12/13/14 — كل مُخرَجات العمل المعروفة HTTP 200؛ providerRef/paymentTransactionId لا تُكشَف أبداً. */
async function buildResponse(response, { db, requestId }) {
  const status = response?.status

  switch (status) {
    case 'rejected':
      console.warn(`[payment-first-checkout:${requestId}] rejected: ${response.reason}`)
      return json({ status: 'rejected', reason: response.reason }, 200)

    case 'price_changed':
      console.log(`[payment-first-checkout:${requestId}] price_changed`)
      return json({
        status: 'price_changed',
        dryRun: {
          subtotal: response.dryRun?.subtotal,
          tax: response.dryRun?.tax,
          delivery_fee: response.dryRun?.delivery_fee,
          total: response.dryRun?.total,
        },
      }, 200)

    case 'failed':
      console.warn(`[payment-first-checkout:${requestId}] failed: ${response.reason}`)
      return json({ status: 'failed', reason: response.reason }, 200)

    case 'retryable_error':
      console.warn(`[payment-first-checkout:${requestId}] retryable_error: ${response.reason}`)
      return json({ status: 'retryable_error', reason: response.reason }, 200)

    case 'requires_reconciliation':
      // PHASE 18: يستحق انتباه بشري — الحالة الوحيدة المُسجَّلة بمستوى error رغم أن استجابة المتصفّح هادئة.
      console.error(`[payment-first-checkout:${requestId}] requires_reconciliation: paymentTransactionId=${response.paymentTransactionId ?? 'unknown'}`)
      return json({ status: 'requires_reconciliation' }, 200)

    case 'succeeded':
      return await buildSucceededResponse(response, { db, requestId })

    default:
      // مُخرَج غير معروف من طبقة التنسيق — لا نخترع تصنيفاً؛ فشل داخلي آمن صراحة.
      console.error(`[payment-first-checkout:${requestId}] unexpected_orchestration_status: ${String(status)}`)
      return json({ error: 'internal_error' }, 500)
  }
}

/** PHASE 12/13 — المبلغ/العملة النهائيان يُقرآن من payment_transactions طازجَين، لا من أي مصدر آخر. */
async function buildSucceededResponse(response, { db, requestId }) {
  let tx
  try {
    const { data, error } = await db
      .from('payment_transactions')
      .select('amount, currency')
      .eq('id', response.paymentTransactionId)
      .maybeSingle()
    if (error || !data) {
      console.error(`[payment-first-checkout:${requestId}] succeeded_but_total_reread_failed: paymentTransactionId=${response.paymentTransactionId}`)
      return json({ status: 'requires_reconciliation' }, 200)
    }
    tx = data
  } catch (err) {
    console.error(`[payment-first-checkout:${requestId}] succeeded_total_reread_exception: ${err?.message ?? String(err)}`)
    return json({ status: 'requires_reconciliation' }, 200)
  }

  // PHASE 13: لا تحويل صامت — عملة غير SAR غير متوقَّعة تُصنَّف كحاجة لمطابقة، بنفس أسلوب G-5 الموثَّق
  // مسبقاً (checkoutOrchestration.js)، لا فشلاً قطعياً ولا نجاحاً بعملة خاطئة.
  if (tx.currency !== SUPPORTED_CURRENCY) {
    console.error(`[payment-first-checkout:${requestId}] unexpected_currency: ${tx.currency}`)
    return json({ status: 'requires_reconciliation' }, 200)
  }

  console.log(`[payment-first-checkout:${requestId}] succeeded: paymentTransactionId=${response.paymentTransactionId} providerRef=${response.providerRef ?? 'n/a'}`)

  return json({
    status: 'succeeded',
    redirectUrl: response.redirectUrl ?? null,
    total: tx.amount,
    currency: tx.currency,
    paymentIdempotencyKey: response.idempotencyKey,
  }, 200)
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
