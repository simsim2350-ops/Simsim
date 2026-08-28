// طبقة الخدمة (Service) — تنسيق محايد للمزوّد بين العقد والمُهايئات والبيانات.
// تستقبل كل دالة الكائن db مُحقوناً (Dependency Injection) من المستدعي (Edge Function) ولا تنشئه بنفسها.
// RLS: payment_transactions تتطلّب is_platform_admin() — يُمرَّر service_role في الإنتاج عبر Edge Function.

import { getAdapter } from '../adapters/index.js'
import { newIdempotencyKey, isTerminalStatus } from '../utils/index.js'
import { TransactionStatus, WebhookEventType } from '../types/index.js'
// TASK-PAY-3.6C.3.1: الخدمة الموجودة فعلاً (TASK-PAY-3.6C.2)، غير مُعدَّلة ولا مُكرَّرة هنا — تُستدعى
// فقط بعد نجاح تحديث status='refunded' محلياً (انظر تعليق refund() أدناه). ملاحظة معمارية: هذا يُنشئ
// استيراداً دائرياً مع checkoutOrchestration.js (التي تستورد paymentService بدورها) — آمن هنا لأن كلا
// الملفين يستخدمان استيراد الآخر فقط داخل أجسام الدوال (وقت الاستدعاء الفعلي)، لا في المستوى الأعلى
// وقت تحميل الوحدة؛ مُتحقَّق منه فعلياً عبر تشغيل مجموعة الاختبارات الكاملة (انظر تقرير 3.6C.3.1).
import { syncOrderStatusFromPayment } from './checkoutOrchestration.js'

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
   * طلب استرداد: التحقّق من الحالة/الملكية/المبلغ، حجز ذرّي لمحاولة الاسترداد (يمنع سباق تزامن
   * حقيقي)، ثم استدعاء adapter.refundPayment وتحديث قاعدة البيانات.
   *
   * TASK-PAY-3.6C.3.0 (تصليب الاسترداد — انظر reports/TASK_3_6C_REFUND_A_REFUND_ARCHITECTURE_AUDIT.md
   * وreports/TASK_3_6C_3_0_REFUND_HARDENING_IMPLEMENTATION_REPORT.md للتفصيل الكامل):
   *   1) عزل مستأجرين: restaurantId إلزامي الآن، ويجب أن يطابق payment_transactions.restaurant_id
   *      الفعلي — رسالة رفض عامة موحّدة لعدم الوجود ولعدم التبعية لنفس المطعم (نفس نمط
   *      sql/staging/staging_order_payment_reference.sql) لمنع تسريب معلومة عن معاملة مستأجر آخر.
   *   2) تحقّق مبلغ صريح: amount (استرداد جزئي) > 0 و<= المبلغ الأصلي. الاسترداد الجزئي المتراكم عبر
   *      أكثر من استدعاء ناجح غير ممكن أصلاً بالمعمارية الحالية — أول استدعاء ناجح ينقل الحالة إلى
   *      'refunded' (نهائية)، فيرفض أي استدعاء ثانٍ بواسطة فحص الحالة أدناه بصرف النظر عن المبلغ؛
   *      لذا فحص مبلغ واحد لكل استدعاء كافٍ فعلياً — لا حاجة لتتبّع تراكمي مُختلَق.
   *   3+4) حجز ذرّي حقيقي (Optimistic Concurrency عبر updated_at، بلا عمود/جدول/حالة دفع جديدة):
   *      UPDATE محروس بـstatus='succeeded' AND updated_at=<القيمة المقروءة> ينجح لمحاولة واحدة فقط من
   *      محاولتين متزامنتين — الثانية لا تجد صفاً مطابقاً (updated_at تغيّر فعلاً) فتُرفَض دون استدعاء
   *      المزوّد إطلاقاً. مفتاح الإتقان يُخزَّن ضمن الحجز؛ نفس المفتاح لاحقاً على حجز قائم ⇒ نفس
   *      المحاولة المنطقية (يُعاد بلا استدعاء مزوّد ثانٍ)؛ مفتاح مختلف على حجز قائم ⇒ رفض (محاولة أخرى
   *      قيد المعالجة بالفعل). فشل المزوّد بعد الحجز الناجح ⇒ الحجز يُلغى (best-effort) للسماح بمحاولة
   *      لاحقة؛ فشل الإلغاء نفسه حالة نادرة موثَّقة (لا يسمح بازدواج استرداد أبداً — فقط قد يمنع إعادة
   *      محاولة لاحقة حتى تُلغى الحالة يدوياً — فشل آمن مقصود، لا فشل غير آمن).
   *   5) عدم حراسة التحديث النهائي بعد نجاح المزوّد (G-5 مكافئ خاص بالاسترداد) موثَّق صراحةً في
   *      التقرير أعلاه ولم يُصلَح هنا عمداً — 3.6E المستقبلي مسؤول عن المطابقة الفعلية.
   *
   * لا مُستدعٍ حقيقي لهذه الدالة بعد (لا Admin UI، لا webhook، لا syncOrderStatusFromPayment) —
   * التصليب هنا شرط مسبق لأي ربط مستقبلي، وليس ربطاً بحد ذاته.
   *
   * @param {import('../types').RefundInput} input
   * @param {{ db: object }} ctx
   */
  async refund(input, { db }) {
    if (!input?.providerRef) throw new Error('refund: providerRef مطلوب')
    if (!input?.idempotencyKey) throw new Error('refund: idempotencyKey مطلوبة')
    if (!input?.restaurantId) throw new Error('refund: restaurantId مطلوب')

    const { data: tx, error } = await db
      .from('payment_transactions')
      .select('id, provider, status, amount, restaurant_id, metadata, updated_at')
      .eq('provider_ref', input.providerRef)
      .maybeSingle()

    if (error) throw new Error(`refund: خطأ في قراءة المعاملة — ${error.message}`)
    // TASK-PAY-3.6C.3.0 (Phase 1 — عزل المستأجرين): رسالة عامة موحّدة لعدم الوجود ولعدم التبعية لنفس
    // المطعم — لا نميّز بينهما في الرسالة، فلا نُسرِّب معلومة عن وجود معاملة تخصّ مستأجراً آخر.
    if (!tx || tx.restaurant_id !== input.restaurantId) {
      throw new Error(`refund: لا توجد معاملة بالمعرّف ${input.providerRef} تخصّ هذا المطعم`)
    }
    if (tx.status !== TransactionStatus.SUCCEEDED) {
      throw new Error(`refund: لا يمكن استرداد معاملة بحالة ${tx.status}`)
    }

    // TASK-PAY-3.6C.3.0 (Phase 2 — تحقّق المبلغ): استرداد جزئي فقط إن أُرسِل amount صراحةً؛ غيابه
    // يعني استرداداً كاملاً (سلوك موجود مُحافَظ عليه). لا نتحقق من تراكم استردادات جزئية متعددة لأن
    // المعمارية الحالية لا تسمح بأكثر من استدعاء ناجح واحد لكل معاملة أصلاً (انظر التعليق أعلاه).
    if (input.amount !== undefined && input.amount !== null) {
      if (!(input.amount > 0)) throw new Error('refund: amount يجب أن يكون أكبر من صفر')
      if (input.amount > tx.amount) throw new Error('refund: amount يتجاوز المبلغ الأصلي للمعاملة')
    }

    // TASK-PAY-3.6C.3.0 (Phase 3/4 — حجز ذرّي + مفتاح إتقان حقيقي الاستخدام)
    const existingClaim = tx.metadata?.refund_claim
    if (existingClaim) {
      if (existingClaim.idempotency_key === input.idempotencyKey) {
        // نفس مفتاح الإتقان لحجز قائم بالفعل — نفس المحاولة المنطقية، لا استدعاء مزوّد ثانٍ.
        // TASK-PAY-3.6C.3.1: status محلياً هنا لا يزال 'succeeded' (لم يلتزم 'refunded' بعد — المحاولة
        // الأصلية ما زالت قيد المعالجة) — لا مزامنة هنا إطلاقاً (القاعدة الصارمة: بعد الالتزام فقط).
        return {
          transactionId: tx.id,
          refundRef: existingClaim.refund_ref ?? null,
          status: tx.status,
          idempotent: true,
          orderSync: { action: 'none', reason: 'refund_already_in_progress' },
        }
      }
      throw new Error('refund: محاولة استرداد أخرى قيد المعالجة بالفعل لهذه المعاملة')
    }

    const claimedMetadata = {
      ...(tx.metadata ?? {}),
      refund_claim: { idempotency_key: input.idempotencyKey, claimed_at: new Date().toISOString() },
    }
    const { data: claimed, error: claimErr } = await db
      .from('payment_transactions')
      .update({ metadata: claimedMetadata, updated_at: new Date().toISOString() })
      .eq('id', tx.id)
      .eq('status', TransactionStatus.SUCCEEDED)
      .eq('updated_at', tx.updated_at) // شرط ذرّي حقيقي: ينجح فقط لمحاولة واحدة من محاولتين متزامنتين
      .select('id')
      .maybeSingle()

    if (claimErr || !claimed) {
      // لم يُستدعَ المزوّد إطلاقاً هنا — سباق تزامن حقيقي (محاولة أخرى سبقت هذه بالحجز) أو حالة تغيّرت.
      throw new Error('refund: تعذّر حجز محاولة الاسترداد (سباق تزامن أو تغيّر حالة المعاملة)')
    }

    const adapter = getAdapter(tx.provider)
    let refundResult
    try {
      refundResult = await adapter.refundPayment(input)
    } catch (err) {
      // فشل المزوّد بعد حجز ناجح — إلغاء الحجز (Best-Effort) للسماح بمحاولة لاحقة. فشل هذا الإلغاء
      // نفسه لا يُصلَح هنا (حالة نادرة موثَّقة — فشل آمن: يمنع محاولة لاحقة، لا يسمح أبداً بازدواج).
      try {
        await db
          .from('payment_transactions')
          .update({ metadata: tx.metadata ?? {}, updated_at: new Date().toISOString() })
          .eq('id', tx.id)
      } catch { /* موثَّق في تقرير 3.6C.3.0 — لا إصلاح تلقائي */ }
      throw err
    }

    await db
      .from('payment_transactions')
      .update({
        status: TransactionStatus.REFUNDED,
        raw: refundResult.raw ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tx.id)

    // TASK-PAY-3.6C.3.1: مزامنة حالة الطلب — فقط بعد أن التزم تحديث status='refunded' محلياً أعلاه
    // بنجاح (لا قبل ذلك إطلاقاً — لا مزامنة بناءً على مجرّد استجابة المزوّد أو نيّة الاسترداد). الاسترداد
    // نجح بالفعل عند هذه النقطة (المزوّد + التحديث المحلي كلاهما التزما) — فشل المزامنة لا يجب أن يجعل
    // استرداداً ناجحاً يبدو فاشلاً: لا نُعيد رمي الاستثناء، لا نُرجِع حالة الدفع، لا نستدعي المزوّد
    // ثانيةً، لا نُعلِّم الدفع فاشلاً. نُصنِّف فشل المزامنة ضمن orderSync بنفس اصطلاح
    // syncOrderStatusFromPayment نفسها (action:'unsupported') بدل اختلاق نظام أخطاء جديد.
    let orderSync
    try {
      orderSync = await syncOrderStatusFromPayment({ paymentTransactionId: tx.id }, { db })
    } catch (err) {
      orderSync = { action: 'unsupported', reason: 'sync_failed', message: err?.message ?? String(err) }
    }

    return {
      transactionId: tx.id,
      refundRef: refundResult.refundRef,
      status: refundResult.status,
      idempotent: false,
      orderSync,
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
