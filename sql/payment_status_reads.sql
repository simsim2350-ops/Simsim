-- ════════════════════════════════════════════════════════════════════════════
-- OWNER GATE — لم تُطبَّق هذه الدالة بعد على أي بيئة (لا حتى staging).
-- يجب أن يوافق المالك على تطبيقها يدوياً (عبر أداة الهجرات المعتمدة) قبل أي استخدام فعلي.
-- ════════════════════════════════════════════════════════════════════════════
--
-- TASK-PAY-3.6D.4-B — تنفيذ المواصفة المعتمدة حرفياً في تقرير TASK_3_6D_4_A (القرار المعماري
-- والأمني الكامل، بما فيه مقارنة الخيارات الثلاثة ونموذج التهديد، موثَّق هناك — هذا الملف ينفّذ
-- العقد المعتمد فقط، بلا أي انحراف عنه).
--
-- get_payment_status_by_idempotency_key — قراءة آمنة بالرمز (مفتاح إتقان الدفع) لحالة معاملة دفع
-- واحدة فقط. تُطابق تماماً نمط get_orders_status_secure الموجود فعلاً وحيّاً على الإنتاج
-- (sql/order_status_reads.sql، يُستدعى مباشرة من src/features/menu/hooks/useActiveOrders.js عبر
-- supabase.rpc() بمفتاح anon، بلا أي Edge Function) — نفس الأسلوب المعماري حرفياً، بلا اختراع جديد:
-- SECURITY DEFINER ضيّقة، مطابقة تساوٍ تام فقط (بلا LIKE/ILIKE، بلا بحث جزئي)، بلا أثر جانبي.
--
-- صف واحد كحد أقصى: يضمنه القيد الفريد uq_paytx_idempotency_key الموجود فعلاً
-- (sql/payment_transactions_idempotency_key_unique.sql) — لا قيد جديد يُضاف أو يُعدَّل هنا.
--
-- الحقول المُعادة (فقط، بالاسم والترتيب المعتمدَين): status, amount, currency, updated_at.
-- محظور صراحة (قرار أمني موثَّق في TASK_3_6D_4_A §RESPONSE_SCHEMA): id (=paymentTransactionId)،
-- provider_ref، restaurant_id، invoice_id، metadata (تحتوي لقطة الطلب الكاملة — عناصر/ملاحظات)،
-- raw (حمولة Moyasar الخام)، failure_reason (يُحذَف كلياً هنا — لا يُخرَّط، بانتظار قرار مالك منفصل
-- إن أُريد كشفه لاحقاً بصيغة آمنة).
--
-- مفتاح غير موجود أو غير صالح ⇒ صف صفري بلا استثناء وبلا رسالة خطأ مميِّزة — بلا أي فرق سلوكي بين
-- "المفتاح غير موجود إطلاقاً" و"المفتاح صحيح الشكل لكن لا يطابق شيئاً" (مقاومة تعداد صريحة، بلا بحث
-- جزئي بأي شكل).
--
-- بلا كتابة، بلا أثر جانبي، بلا استدعاء Moyasar، بلا استدعاء confirmCharge() أو أي دالة أخرى —
-- قراءة صرفة من عمود واحد بمعيار تساوٍ واحد فقط. اللغة sql (لا plpgsql) عمداً: أبسط سطح تدقيق ممكن،
-- بلا أي إمكانية لـRAISE/تسجيل أو منطق شرطي مخفي — مطابقة لنمط كل دوال القراءة المماثلة في هذا الملف.
CREATE OR REPLACE FUNCTION public.get_payment_status_by_idempotency_key(p_idempotency_key text)
 RETURNS TABLE(status text, amount numeric, currency text, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select status, amount, currency, updated_at
    from public.payment_transactions
   where idempotency_key = p_idempotency_key
$function$;

-- TASK-PAY-3.6D.4-B.1: PostgreSQL يمنح EXECUTE لـPUBLIC افتراضياً لأي دالة جديدة ما لم يُسحَب صراحة —
-- سُحب هنا صراحةً ثم مُنح فقط لـanon/authenticated (نفس النطاق المعتمد بالضبط، بلا توسيع).
REVOKE ALL ON FUNCTION public.get_payment_status_by_idempotency_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_payment_status_by_idempotency_key(text) TO anon, authenticated;
