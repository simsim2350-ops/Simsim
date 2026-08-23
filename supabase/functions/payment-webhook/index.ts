// ============================================================
// Supabase Edge Function: payment-webhook
// تستقبل إشعارات Webhook من مزوّد الدفع Moyasar.
// ============================================================
// التدفّق:
//   POST (Moyasar) → التحقّق من HMAC → تحليل الحمولة → تحديث payment_transactions
// ============================================================
// المتغيّرات المطلوبة في بيئة Edge Function:
//   SUPABASE_URL                    — يُضبط تلقائياً بواسطة Supabase
//   SUPABASE_SERVICE_ROLE_KEY       — يُضبط تلقائياً بواسطة Supabase
//   PAYMENT_MOYASAR_SECRET_KEY      — مفتاح API الخاص بـ Moyasar (سرّي)
//   PAYMENT_MOYASAR_WEBHOOK_SECRET  — مفتاح توقيع Webhook الخاص بـ Moyasar (سرّي)
// ============================================================
// الأمان:
//   - يُوحَّد PAYMENT_MOYASAR_WEBHOOK_SECRET لتوليد HMAC-SHA256 فقط (لا يُسجَّل أبداً)
//   - يُوحَّد SUPABASE_SERVICE_ROLE_KEY لإنشاء عميل Supabase فقط (لا يُسجَّل أبداً)
//   - لا يُكشف أي مفتاح سرّي في ردود HTTP
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { MoyasarAdapter } from '../../../src/payments/adapters/moyasar.js'
import { buildHandler } from './handler.js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const MOYASAR_API_KEY = Deno.env.get('PAYMENT_MOYASAR_SECRET_KEY') ?? null
const WEBHOOK_SECRET = Deno.env.get('PAYMENT_MOYASAR_WEBHOOK_SECRET') ?? ''

// مُهايئ Moyasar — يُستخدم parseWebhook فقط (لا يحتاج API key لتحليل الإشعار)
const adapter = new MoyasarAdapter(MOYASAR_API_KEY)

// عميل Supabase بصلاحية service_role — يتجاوز RLS (ضرورة لكتابة payment_transactions)
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// معالج الطلبات — منطق بقي في handler.js لإمكانية الاختبار
const handle = buildHandler({ webhookSecret: WEBHOOK_SECRET, adapter, db })

Deno.serve(handle)
