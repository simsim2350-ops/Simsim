import { supabase } from '../../lib/supabase'

// TASK-PAY-3.6D.10 — استدعاء متصفّح آمن لـ payment-first-checkout (Edge Function موجودة فعلاً،
// TASK-PAY-3.6D-E، غير مُعدَّلة هنا إطلاقاً). غلاف رفيع فقط، بنفس نمط paymentOrderCreationApi.js
// (create-order-from-payment) وadminsApi.js (createAdmin) حرفياً — لا تحويل منطقي، فقط تطبيع شكل
// {data,error} من supabase.functions.invoke إلى نفس عقد استجابة initiatePaymentFirstCheckout
// (usePaymentFirstCheckout.deriveState تستهلكه كما هو — الدالة الحقيقية غير مُعدَّلة أبداً، هذا
// الغلاف فقط يستبدل استدعاءها المباشر (يتطلّب service_role) باستدعاء شبكي آمن من متصفّح anon).
//
// حدود الثقة: restaurant_id لا يُقرأ أبداً من input هنا — فقط restaurant_slug (أو table_qr_token)
// وbranch_id (نفس عقد payment-first-checkout المعتمد فعلاً — المطعم يُحلّ خادمياً من slug/QR حصراً).
// paymentTransactionId/providerRef لا يُرسَلان أبداً (لا حقل لهما في هذا العقد أصلاً).
export async function initiatePaymentFirstCheckoutViaApi(input) {
  const body = {
    paymentIdempotencyKey: input.paymentIdempotencyKey,
    type: input.type,
    items: input.items,
    customer_phone: input.customer_phone,
  }
  if (input.customer_name) body.customer_name = input.customer_name
  if (input.notes) body.notes = input.notes
  if (input.coupon_code) body.coupon_code = input.coupon_code
  if (input.clientTotal !== undefined && input.clientTotal !== null) body.clientTotal = input.clientTotal
  if (input.delivery_address) body.delivery_address = input.delivery_address

  if (input.table_qr_token) {
    body.table_qr_token = input.table_qr_token
  } else {
    body.restaurant_slug = input.restaurant_slug
    body.branch_id = input.branch_id
    if (input.table_number) body.table_number = input.table_number
  }

  let response
  try {
    response = await supabase.functions.invoke('payment-first-checkout', { body })
  } catch {
    return { status: 'retryable_error', reason: 'network_exception' }
  }
  const { data, error } = response ?? {}
  if (error) {
    // استجابات 400/500 تصل هنا (FunctionsHttpError) — نميّز invalid_request فقط (رفض واضح)، أي
    // شيء آخر (بما فيه فشل قراءة الجسم) ⇒ retryable_error عام، بلا كشف رسالة خام أبداً.
    if (error.context && typeof error.context.json === 'function') {
      try {
        const errBody = await error.context.json()
        if (errBody?.error === 'invalid_request') return { status: 'rejected', reason: 'invalid_request' }
      } catch { /* تجاهل */ }
    }
    return { status: 'retryable_error', reason: 'internal_error' }
  }
  // استجابة 200 — نفس عقد initiatePaymentFirstCheckout حرفياً (status/dryRun/redirectUrl/reason) —
  // تُعاد كما هي، بلا أي تحويل (الدالة الحقيقية غير مُعدَّلة، الشكل مطابق تماماً أصلاً).
  return data ?? { status: 'retryable_error', reason: 'empty_response' }
}
