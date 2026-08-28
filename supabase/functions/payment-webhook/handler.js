/**
 * payment-webhook/handler.js
 *
 * منطق بقي الـ Webhook — خالٍ من أي تبعية خاصة بـ Deno.
 * مُستورَد من index.ts (الإنتاج) ومن ملف الاختبار (Vitest).
 *
 * لماذا لا نستورد paymentService مباشرةً؟
 *   paymentService.js يستخدم محددات الوحدات المجردة (bare specifiers) مثل '../adapters'
 *   دون امتداد .js ، وهذا غير مدعوم في Deno وقت التشغيل. لذا نُعيد تنفيذ منطق
 *   handleWebhookEvent هنا مباشرةً — وهو الحد الأدنى من التكرار الضروري بسبب حدود البيئة.
 *
 * التبعيات مُحقونة بالكامل عبر buildHandler({ webhookSecret, adapter, db })
 * مما يجعل هذا الملف قابلاً للاختبار بدون Deno وبدون Supabase حقيقي.
 */

const SIG_HEADER = 'x-moyasar-signature'
const PROVIDER = 'moyasar'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-moyasar-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * بناء معالج الطلبات — يُعاد استخدامه في الإنتاج والاختبارات.
 * @param {{ webhookSecret: string, adapter: object, db: object }} deps
 * @returns {(req: Request) => Promise<Response>}
 */
export function buildHandler({ webhookSecret, adapter, db }) {
  return async function handleRequest(req) {
    // preflight CORS
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    // POST فقط
    if (req.method !== 'POST') {
      return json({ error: 'Method Not Allowed' }, 405)
    }

    // قراءة الجسم الخام قبل أي معالجة (ضرورة للتحقّق من HMAC)
    let rawBody
    try {
      rawBody = await req.text()
    } catch {
      return json({ error: 'Failed to read request body' }, 400)
    }

    // التحقّق من وجود التوقيع
    const signature = req.headers.get(SIG_HEADER)
    if (!signature) {
      return json({ error: 'Missing webhook signature' }, 401)
    }

    // التحقّق من صحة التوقيع HMAC-SHA256 (ثابت الزمن عبر crypto.subtle.verify)
    if (!webhookSecret) {
      console.error('[payment-webhook] PAYMENT_MOYASAR_WEBHOOK_SECRET not configured')
      return json({ error: 'Webhook secret not configured' }, 500)
    }

    const signatureValid = await verifyHmacSha256(rawBody, signature, webhookSecret)
    if (!signatureValid) {
      return json({ error: 'Invalid webhook signature' }, 401)
    }

    // تحليل JSON
    let payload
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return json({ error: 'Malformed JSON body' }, 400)
    }

    // تحليل الحمولة عبر المُهايئ (يُوحِّد نوع الحدث)
    const headers = headersToObject(req.headers)
    const event = adapter.parseWebhook(payload, headers)

    // TASK-PAY-3.4-REMEDIATION: eventId هو payload.id الرسمي (معرّف الحدث)، منفصل عن data.id
    // (مرجع الدفعة). لا نختلق هوية بديلة (كانت سابقاً unknown_${Date.now()}) — حمولة بلا هوية حدث
    // صريحة تُرفَض بدل إدراجها بمفتاح إتقان مُلتبِس قد يتصادم مع أحداث أخرى بلا مبرر.
    if (!event.eventId) {
      return json({ error: 'Missing webhook event ID' }, 400)
    }

    // معالجة الحدث
    try {
      const result = await _handleWebhookEvent(
        { ...event, provider: PROVIDER },
        db
      )
      return json({ ok: true, ...result })
    } catch (err) {
      const msg = String(err?.message ?? err)
      // لا نكشف رسائل داخلية مفصّلة للمتصفّح/المزوّد
      console.error(`[payment-webhook] error: ${msg}`)
      return json({ error: 'Internal error processing webhook' }, 500)
    }
  }
}

/**
 * التحقّق من توقيع HMAC-SHA256 (ثابت الزمن باستخدام crypto.subtle.verify).
 * التوقيع بترميز HEX.
 * @param {string} body   الجسم الخام
 * @param {string} sig    التوقيع HEX المُستلَم
 * @param {string} secret المفتاح السرّي
 * @returns {Promise<boolean>}
 */
export async function verifyHmacSha256(body, sig, secret) {
  try {
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )
    const sigBytes = _hexToBytes(sig)
    if (!sigBytes) return false
    return await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(body))
  } catch {
    return false
  }
}

/**
 * إنشاء توقيع HMAC-SHA256 (للاختبارات فقط — يُساعد على توليد توقيع صحيح).
 * @param {string} body
 * @param {string} secret
 * @returns {Promise<string>} HEX
 */
export async function signHmacSha256(body, secret) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ——————————— دوال داخلية ———————————

/**
 * معالجة حدث Webhook — منطق مكافئ لـ paymentService.handleWebhookEvent.
 * مُتكرَّر هنا لأنّ paymentService.js لا يمكن استيراده في Deno (bare specifiers).
 *
 * @param {{ provider: string, eventId: string, type: string, providerRef?: string, status?: string, raw?: unknown }} event
 * @param {object} db — Supabase client بصلاحية service_role
 */
async function _handleWebhookEvent(event, db) {
  // إدراج سجلّ الحدث — القيد الفريد uq_webhook_provider_event يمنع التكرار
  const { data: webhookRow, error: whErr } = await db
    .from('payment_webhook_events')
    .insert({
      provider: event.provider,
      event_id: event.eventId,
      event_type: event.type,
      payload: event.raw ?? {},
    })
    .select('id')
    .single()

  if (whErr) {
    // 23505 = انتهاك قيد UNIQUE → الحدث مُعالَج مسبقاً
    if (whErr.code === '23505') return { updated: false, reason: 'already_processed' }
    throw new Error(`Webhook insert failed: ${whErr.message}`)
  }

  const webhookId = webhookRow.id

  if (!event.providerRef) {
    await db
      .from('payment_webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('id', webhookId)
    return { updated: false, reason: 'no_provider_ref' }
  }

  const { data: tx } = await db
    .from('payment_transactions')
    .select('id, status')
    .eq('provider_ref', event.providerRef)
    .maybeSingle()

  if (!tx) {
    await db
      .from('payment_webhook_events')
      .update({
        process_error: `No transaction for provider_ref=${event.providerRef}`,
        processed_at: new Date().toISOString(),
      })
      .eq('id', webhookId)
    return { updated: false, reason: 'transaction_not_found' }
  }

  const TERMINAL = new Set(['succeeded', 'failed', 'cancelled', 'refunded'])
  if (TERMINAL.has(tx.status)) {
    await db
      .from('payment_webhook_events')
      .update({ transaction_id: tx.id, processed_at: new Date().toISOString() })
      .eq('id', webhookId)
    return { updated: false, reason: 'already_terminal', transactionId: tx.id }
  }

  // TASK-PAY-3.4-REMEDIATION: نوع موثَّق رسمياً (payment_refunded/voided/captured/verified) لكن بلا
  // منطق عمل مُحدَّد بعد. إن لم تُرفِق Moyasar حالة صريحة (data.status) لا نخترع تحويل حالة (لا نمرّر
  // لـ_eventTypeToStatus التي تُرجع FAILED افتراضياً — تحويل خاطئ لحدث كـpayment_captured مثلاً).
  // الحدث يُسجَّل ويُعلَّم مُعالَجاً كي لا يُعاد تسليمه، بلا تحديث حالة مُخمَّنة على payment_transactions.
  if (!event.status && event.type === 'recognized_unhandled') {
    await db
      .from('payment_webhook_events')
      .update({ transaction_id: tx.id, processed_at: new Date().toISOString() })
      .eq('id', webhookId)
    return { updated: false, reason: 'recognized_unhandled_event_type', transactionId: tx.id }
  }

  const newStatus = event.status ?? _eventTypeToStatus(event.type)

  await db
    .from('payment_transactions')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', tx.id)

  await db
    .from('payment_webhook_events')
    .update({ transaction_id: tx.id, processed_at: new Date().toISOString() })
    .eq('id', webhookId)

  return { updated: true, transactionId: tx.id, status: newStatus }
}

function _eventTypeToStatus(eventType) {
  switch (eventType) {
    case 'payment.succeeded': return 'succeeded'
    case 'payment.failed':    return 'failed'
    case 'payment.cancelled': return 'cancelled'
    case 'payment.pending':   return 'pending'
    default:                  return 'failed'
  }
}

function _hexToBytes(hex) {
  if (!hex || hex.length % 2 !== 0) return null
  try {
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) {
      const byte = parseInt(hex.slice(i, i + 2), 16)
      if (isNaN(byte)) return null
      bytes[i / 2] = byte
    }
    return bytes
  } catch {
    return null
  }
}

function headersToObject(headers) {
  const result = {}
  headers.forEach((value, key) => { result[key] = value })
  return result
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
