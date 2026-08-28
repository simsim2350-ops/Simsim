// ============================================================
// Supabase Edge Function: create-order-from-payment
// نقطة الدخول الخادمية الوحيدة لتشغيل createOrderFromSuccessfulPayment (TASK-PAY-3.6B، غير مُعدَّلة)
// من سياق متصفّح — تُستدعى من PaymentFirstCallbackLanding بعد أن يُظهر get_payment_status_by_
// idempotency_key حالة succeeded (لا يُستدعى هذا الملف بعد من أي واجهة أمامية — التوصيل مؤجَّل
// لمهمة لاحقة صراحةً، TASK_3_6D_6-A §IMPLEMENTATION_SEQUENCE).
// ============================================================
// التدفّق:
//   POST (متصفّح، مفتاح anon) → حلّ paymentTransactionId من paymentIdempotencyKey خادمياً → حلّ
//   المستأجر (QR أو slug) خادمياً → createOrderFromSuccessfulPayment (service_role) → استجابة آمنة
//   موحَّدة (HTTP 200 لكل مُخرَج عمل معروف، بلا providerRef ولا paymentTransactionId إطلاقاً)
// ============================================================
// المتغيّرات المطلوبة في بيئة Edge Function:
//   SUPABASE_URL               — يُضبط تلقائياً بواسطة Supabase
//   SUPABASE_SERVICE_ROLE_KEY  — يُضبط تلقائياً بواسطة Supabase (سرّي — لا يُسجَّل، لا يُعاد للمتصفّح)
// ============================================================
// المصادقة: التحقّق الافتراضي من JWT بوابة Supabase (مفتاح anon يكفي) — بلا verify_jwt=false،
// بلا تسجيل دخول عميل جديد. العميل يبقى مجهولاً كما هو الحال دائماً (نفس نمط payment-first-checkout).
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildHandler } from './handler.js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// عميل Supabase بصلاحية service_role — خادمي فقط، لا يصل هذا المفتاح إلى أي كود واجهة أمامية
// ولا إلى أي استجابة HTTP (نفس نمط payment-webhook/index.ts وpayment-first-checkout/index.ts).
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// معالج الطلبات — منطق بقي في handler.js لإمكانية الاختبار بدون Deno
const handle = buildHandler({ db })

Deno.serve(handle)
