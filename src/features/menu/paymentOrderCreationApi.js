import { supabase } from '../../lib/supabase'

// TASK-PAY-3.6D.6-B — استدعاء متصفّح آمن لـcreate-order-from-payment (Edge Function موجودة فعلاً،
// TASK-PAY-3.6D.6، غير مُعدَّلة هنا إطلاقاً). غلاف رفيع فقط — يُطبِّع {data,error} من
// supabase.functions.invoke إلى شكل استجابة موحَّد دائماً {status,...}، بلا كشف أي رسالة خطأ خام
// (نفس نمط createAdmin في src/admin/features/admins/adminsApi.js). لا تحويل ولا إضافة حقول على
// input — يُمرَّر كما هو حرفياً كجسم الطلب (المُستدعي هو المسؤول عن بناء الحمولة الآمنة).
export async function createOrderFromPayment(input) {
  let response
  try {
    response = await supabase.functions.invoke('create-order-from-payment', { body: input })
  } catch {
    return { status: 'internal_error' }
  }
  const { data, error } = response ?? {}
  if (error) {
    // استجابات 400/500 تصل هنا كـFunctionsHttpError — نحاول قراءة الجسم لتمييز validation_error
    // فقط (لعرض رسالة قابلة للتصرّف)؛ أي فشل قراءة أو أي حالة أخرى ⇒ internal_error عام دائماً،
    // بلا كشف رسالة خام أبداً (نفس التزام create-order-from-payment/handler.js نفسه).
    if (error.context && typeof error.context.json === 'function') {
      try {
        const body = await error.context.json()
        if (body?.status === 'validation_error') return { status: 'validation_error' }
      } catch { /* تجاهل */ }
    }
    return { status: 'internal_error' }
  }
  return data ?? { status: 'internal_error' }
}
