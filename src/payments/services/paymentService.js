// طبقة الخدمة (Service) — تنسيق محايد للمزوّد بين العقد والمُهايئات والبيانات.
// تستقبل كل دالة الكائن db مُحقوناً (Dependency Injection) من المستدعي (Edge Function) ولا تنشئه بنفسها.
// RLS: payment_transactions تتطلّب is_platform_admin() — يُمرَّر service_role في الإنتاج عبر Edge Function.

import { getAdapter } from '../adapters'
import { newIdempotencyKey, isTerminalStatus } from '../utils'
import { TransactionStatus, WebhookEventType } from '../types'

export const paymentService = {
  /**
   * بدء عملية دفع: إنشاء صف payment_transactions → استدعاء adapter.createCharge → تحديث الصف.
   * @param {import('../types').CreateChargeInput} input
   * @param {{ db: object }} ctx  — db هو Supabase client بصلاحية service_role
   */
  async startCharge(input, { db }) {
    if (!input?.restaurantId) throw new Error('startCharge: restaurantId مطلوب')
    if (!input?.amount || input.amount <= 0) throw new Error('startCharge: amount يجب أن يكون موجباً')
    if (!input?.currency) throw new Error('startCharge: currency مطلوبة')

    const provider = input.provider ?? 'moyasar'
    const idemKey = input.idempotencyKey ?? newIdempotencyKey('pay')
    const adapter = getAdapter(provider)

    // فحص الإتقان (best-effort) — لا يوجد قيد UNIQUE على idempotency_key بعد؛ انظر ملف الهجرة المقترح
    const { data: existing } = await db
      .from('payment_transactions')
      .select('id, status, provider_ref, metadata')
      .eq('idempotency_key', idemKey)
      .maybeSingle()

    if (existing) {
      return {
        transactionId: existing.id,
        providerRef: existing.provider_ref ?? null,
        status: existing.status,
        redirectUrl: existing.metadata?.redirect_url ?? null,
        idempotent: true,
      }
    }

    // إنشاء صف المعاملة بحالة initiated
    const { data: tx, error: insertErr } = await db
      .from('payment_transactions')
      .insert({
        restaurant_id: input.restaurantId,
        invoice_id: input.invoiceId ?? null,
        provider,
        status: TransactionStatus.INITIATED,
        amount: input.amount,
        currency: input.currency,
        idempotency_key: idemKey,
        metadata: input.metadata ?? {},
      })
      .select('id')
      .single()

    if (insertErr) throw new Error(`startCharge: فشل إنشاء المعاملة — ${insertErr.message}`)

    const txId = tx.id

    // استدعاء المُهايئ
    let chargeResult
    try {
      chargeResult = await adapter.createCharge({
        restaurantId: input.restaurantId,
        invoiceId: input.invoiceId,
        amount: input.amount,
        currency: input.currency,
        idempotencyKey: idemKey,
        returnUrl: input.returnUrl,
        metadata: input.metadata,
      })
    } catch (err) {
      await db
        .from('payment_transactions')
        .update({
          status: TransactionStatus.FAILED,
          failure_reason: err.message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', txId)
      throw err
    }

    const meta = { ...(input.metadata ?? {}) }
    if (chargeResult.redirectUrl) meta.redirect_url = chargeResult.redirectUrl

    await db
      .from('payment_transactions')
      .update({
        provider_ref: chargeResult.providerRef,
        status: chargeResult.status,
        raw: chargeResult.raw ?? null,
        metadata: meta,
        updated_at: new Date().toISOString(),
      })
      .eq('id', txId)

    return {
      transactionId: txId,
      providerRef: chargeResult.providerRef,
      status: chargeResult.status,
      redirectUrl: chargeResult.redirectUrl ?? null,
      idempotent: false,
    }
  },

  /**
   * تأكيد دفعة بعد عودة العميل: التحقّق من حالة المزوّد وتحديث قاعدة البيانات.
   * @param {string} providerRef
   * @param {{ db: object }} ctx
   */
  async confirmCharge(providerRef, { db }) {
    if (!providerRef) throw new Error('confirmCharge: providerRef مطلوب')

    const { data: tx, error } = await db
      .from('payment_transactions')
      .select('id, provider, status')
      .eq('provider_ref', providerRef)
      .maybeSingle()

    if (error) throw new Error(`confirmCharge: خطأ في قراءة المعاملة — ${error.message}`)
    if (!tx) throw new Error(`confirmCharge: لا توجد معاملة بالمعرّف ${providerRef}`)

    if (isTerminalStatus(tx.status)) {
      return { transactionId: tx.id, providerRef, status: tx.status, updated: false }
    }

    const adapter = getAdapter(tx.provider)
    const chargeResult = await adapter.verifyPayment(providerRef)

    await db
      .from('payment_transactions')
      .update({
        status: chargeResult.status,
        raw: chargeResult.raw ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tx.id)

    return { transactionId: tx.id, providerRef, status: chargeResult.status, updated: true }
  },

  /**
   * معالجة حدث Webhook: تسجيل الحدث (UNIQUE يمنع التكرار) وتحديث حالة المعاملة.
   * @param {import('../types').WebhookParseResult & { provider: string }} event
   * @param {{ db: object }} ctx
   */
  async handleWebhookEvent(event, { db }) {
    if (!event?.provider) throw new Error('handleWebhookEvent: event.provider مطلوب')
    if (!event?.eventId) throw new Error('handleWebhookEvent: event.eventId مطلوب')

    // إدراج حدث Webhook — القيد الفريد uq_webhook_provider_event يمنع المعالجة المكرّرة
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
      if (whErr.code === '23505') return { updated: false, reason: 'already_processed' }
      throw new Error(`handleWebhookEvent: خطأ تسجيل Webhook — ${whErr.message}`)
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
          process_error: `لا توجد معاملة لـ provider_ref=${event.providerRef}`,
          processed_at: new Date().toISOString(),
        })
        .eq('id', webhookId)
      return { updated: false, reason: 'transaction_not_found' }
    }

    if (isTerminalStatus(tx.status)) {
      await db
        .from('payment_webhook_events')
        .update({ transaction_id: tx.id, processed_at: new Date().toISOString() })
        .eq('id', webhookId)
      return { updated: false, reason: 'already_terminal', transactionId: tx.id }
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
  },

  /**
   * طلب استرداد: التحقّق من الحالة ثم استدعاء adapter.refundPayment وتحديث قاعدة البيانات.
   * @param {import('../types').RefundInput} input
   * @param {{ db: object }} ctx
   */
  async refund(input, { db }) {
    if (!input?.providerRef) throw new Error('refund: providerRef مطلوب')
    if (!input?.idempotencyKey) throw new Error('refund: idempotencyKey مطلوبة')

    const { data: tx, error } = await db
      .from('payment_transactions')
      .select('id, provider, status, amount')
      .eq('provider_ref', input.providerRef)
      .maybeSingle()

    if (error) throw new Error(`refund: خطأ في قراءة المعاملة — ${error.message}`)
    if (!tx) throw new Error(`refund: لا توجد معاملة بالمعرّف ${input.providerRef}`)
    if (tx.status !== TransactionStatus.SUCCEEDED) {
      throw new Error(`refund: لا يمكن استرداد معاملة بحالة ${tx.status}`)
    }

    const adapter = getAdapter(tx.provider)
    const refundResult = await adapter.refundPayment(input)

    await db
      .from('payment_transactions')
      .update({
        status: TransactionStatus.REFUNDED,
        raw: refundResult.raw ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tx.id)

    return {
      transactionId: tx.id,
      refundRef: refundResult.refundRef,
      status: refundResult.status,
    }
  },
}

/** تحويل نوع حدث Webhook المُوحَّد إلى حالة معاملة. */
function _eventTypeToStatus(eventType) {
  switch (eventType) {
    case WebhookEventType.PAYMENT_SUCCEEDED: return TransactionStatus.SUCCEEDED
    case WebhookEventType.PAYMENT_FAILED:    return TransactionStatus.FAILED
    case WebhookEventType.PAYMENT_CANCELLED: return TransactionStatus.CANCELLED
    case WebhookEventType.PAYMENT_PENDING:   return TransactionStatus.PENDING
    default:                                 return TransactionStatus.FAILED
  }
}
