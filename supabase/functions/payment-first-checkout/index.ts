// ============================================================
// Supabase Edge Function: payment-first-checkout
// نقطة الدخول الخادمية الوحيدة لتدفّق "الدفع أولاً" — تُستدعى من المتصفّح عبر
// supabase.functions.invoke('payment-first-checkout', { body }).
// ============================================================
// التدفّق:
//   POST (متصفّح، مفتاح anon) → حلّ المستأجر (QR أو slug) خادمياً → initiatePaymentFirstCheckout
//   (service_role) → استجابة آمنة موحَّدة (HTTP 200 لكل مُخرَج عمل معروف)
// ============================================================
// المتغيّرات المطلوبة في بيئة Edge Function:
//   SUPABASE_URL               — يُضبط تلقائياً بواسطة Supabase
//   SUPABASE_SERVICE_ROLE_KEY  — يُضبط تلقائياً بواسطة Supabase (سرّي — لا يُسجَّل، لا يُعاد للمتصفّح)
//   PUBLIC_APP_BASE_URL        — عنوان الواجهة الأمامية العلني (مثال: https://app.simsim.example)
//                                 يُستخدَم حصراً لبناء returnUrl خادمياً (TASK_3_6D_C §RETURN_URL)
// ============================================================
// المصادقة: التحقّق الافتراضي من JWT بوابة Supabase (مفتاح anon يكفي) — بلا verify_jwt=false،
// وبلا تسجيل دخول عميل جديد (TASK_3_6D_C §AUTHENTICATION). العميل يبقى مجهولاً كما هو الحال دائماً.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildHandler } from './handler.js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PUBLIC_APP_BASE_URL = Deno.env.get('PUBLIC_APP_BASE_URL') ?? ''

// عميل Supabase بصلاحية service_role — خادمي فقط، لا يصل هذا المفتاح إلى أي كود واجهة أمامية
// ولا إلى أي استجابة HTTP (نفس نمط payment-webhook/index.ts الموجود فعلاً، غير مُعدَّل).
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// معالج الطلبات — منطق بقي في handler.js لإمكانية الاختبار بدون Deno
const handle = buildHandler({ db, publicAppBaseUrl: PUBLIC_APP_BASE_URL })

Deno.serve(handle)
