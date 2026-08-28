// حارس ثابت (Offline) لـ TASK-PAY-3.5 — على نمط orderJourneyGuards.test.js القائم.
// الهدف: يفحص نص sql/order_payment_reference.sql مباشرة (بلا اتصال قاعدة بيانات حقيقي — غير متاح
// في بيئة التنفيذ الحالية) للتأكد من وجود كل خصائص الأمان/التوافق الخلفي المطلوبة نصياً، ومنع أي
// تراجع مستقبلي عنها بصمت. هذا لا يثبت السلوك الفعلي عند التشغيل — فقط أن النص يحتوي الضمانات
// المصمَّمة. التحقق الفعلي (استعلام حي) يتطلب قاعدة بيانات Supabase حقيقية وهو خارج نطاق هذا الحارس.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const sqlDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'sql')
const filePath = join(sqlDir, 'order_payment_reference.sql')
const text = readFileSync(filePath, 'utf8')
const stripped = text.replace(/--[^\n]*/g, '')

describe('TASK-PAY-3.5 — sql/order_payment_reference.sql: خصائص السلامة والتوافق الخلفي (نصي)', () => {
  it('يضيف عمود payment_transaction_id على orders بمرجع إلى payment_transactions', () => {
    expect(stripped).toMatch(
      /ALTER TABLE public\.orders\s+ADD COLUMN payment_transaction_id uuid REFERENCES public\.payment_transactions\(id\)/i,
    )
  })

  it('ينشئ فهرساً فريداً جزئياً يمنع ربط نفس مرجع الدفع بأكثر من طلب (الضمان الحقيقي ضد التكرار)', () => {
    expect(stripped).toMatch(
      /CREATE UNIQUE INDEX orders_payment_transaction_id_uidx\s+ON public\.orders \(payment_transaction_id\)\s+WHERE payment_transaction_id IS NOT NULL/i,
    )
  })

  it('يُسقط صراحةً توقيع create_order القديم (12 معامل) قبل الإنشاء — يمنع تكرار مشكلة الـOverload المزدوج', () => {
    expect(stripped).toMatch(
      /DROP FUNCTION IF EXISTS public\.create_order\(uuid, uuid, text, text, text, text, text, jsonb, text, text, numeric, uuid\)/i,
    )
  })

  it('التوقيع الجديد يحافظ على المعاملات الاثني عشر القديمة بنفس الترتيب + معامل ثالث عشر اختياري فقط', () => {
    const headerMatch = stripped.match(
      /CREATE OR REPLACE FUNCTION public\.create_order\(([\s\S]*?)\)\s*\n?\s*RETURNS TABLE/i,
    )
    expect(headerMatch, 'لم يُعثر على ترويسة create_order الجديدة').toBeTruthy()
    const params = headerMatch[1].split(',').map((p) => p.trim())
    expect(params).toHaveLength(13)
    expect(params[0]).toMatch(/^p_restaurant_id uuid$/)
    expect(params[10]).toMatch(/^p_client_total numeric DEFAULT NULL/)
    expect(params[11]).toMatch(/^p_idempotency_key uuid DEFAULT NULL/)
    // المعامل الجديد الوحيد — آخر واحد فقط، بقيمة افتراضية NULL (توافق خلفي: أي مستدعٍ حالي لا يرسله)
    expect(params[12]).toMatch(/^p_payment_transaction_id uuid DEFAULT NULL/)
  })

  it('RETURNS TABLE لم يتغيّر — نفس الأعمدة التسعة القديمة بنفس الأسماء والترتيب (لا كسر لعقد الإرجاع)', () => {
    expect(stripped).toMatch(
      /RETURNS TABLE\(id uuid, order_number text, access_token text, subtotal numeric, tax numeric, delivery_fee numeric, total numeric, price_changed boolean, price_changes jsonb\)/i,
    )
  })

  it('يتحقق من وجود مرجع الدفع وانتمائه لنفس المطعم قبل أي إدراج (عزل المستأجرين)', () => {
    expect(stripped).toMatch(/if p_payment_transaction_id is not null then/i)
    expect(stripped).toMatch(/v_payment_tx\.restaurant_id <> p_restaurant_id/i)
    expect(stripped).toMatch(/raise exception 'invalid payment reference'/i)
  })

  it('يلتقط unique_violation عند محاولة ربط مرجع دفع مُستخدَم مسبقاً ويُرجع رسالة صريحة بدل خطأ Postgres خام', () => {
    expect(stripped).toMatch(/exception\s*\n\s*when unique_violation then/i)
    expect(stripped).toMatch(/raise exception 'payment reference already linked to another order'/i)
  })

  it('عمود payment_transaction_id مُدرَج فعلياً في INSERT (القيمة تُخزَّن، لا تُفحص فقط)', () => {
    // القيم الفعلية تحتوي أقواساً متداخلة (nullif(trim(...))) فيصعب مطابقة القوس الختامي بتعبير نمطي
    // بسيط بأمان؛ بدلاً من ذلك نتحقق أن الكتلة الممتدة من "insert into public.orders" حتى "returning
    // orders.id" تحوي كلا الاسمين معاً — كافٍ لإثبات أن العمود والقيمة أُضيفا لنفس جملة الإدراج.
    const insertBlockMatch = stripped.match(/insert into public\.orders[\s\S]*?returning orders\.id/i)
    expect(insertBlockMatch, 'لم يُعثر على جملة INSERT...RETURNING').toBeTruthy()
    const block = insertBlockMatch[0]
    expect(block).toMatch(/payment_transaction_id/)
    expect(block).toMatch(/p_payment_transaction_id/)
  })

  it('لا يمس create_order_from_table_qr إطلاقاً (نطاق أدنى — استدعاؤها الموضعي بـ12 قيمة يبقى صالحاً تلقائياً)', () => {
    expect(stripped).not.toMatch(/create_order_from_table_qr/i)
  })

  it('يوثّق أن الملف غير مُطبَّق على أي قاعدة بيانات حية (لا يجوز الادّعاء بخلاف ذلك)', () => {
    expect(text).toMatch(/NOT APPLIED TO ANY DATABASE/)
  })
})
