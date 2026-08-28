-- ════════════════════════════════════════════════════════════════════════════
-- OWNER/DBA GATE — لا تُطبَّق هذه الهجرة تلقائياً على أي بيئة.
-- يجب أن يوافق المالك على تنفيذها يدوياً على قاعدة الإنتاج.
-- ════════════════════════════════════════════════════════════════════════════
--
-- الهجرة: إضافة قيد UNIQUE على عمود idempotency_key في payment_transactions
--
-- المشكلة الحالية:
--   عمود idempotency_key موجود (text) لكن بدون قيد UNIQUE.
--   نتيجة: إذا أرسل العميل طلبَين متزامنَين بنفس idempotency_key (race condition)،
--   يمكن لكلاهما تخطّي الفحص التطبيقي (SELECT → NULL) وإنشاء صفَّين مزدوجَين.
--
-- الحل:
--   قيد UNIQUE مشروط (WHERE idempotency_key IS NOT NULL) يجعل قاعدة البيانات
--   هي الحَكَم الأخير — أي إدراج مكرّر ينتهي بخطأ 23505 الذي تعالجه الخدمة.
--
-- ملاحظات التطبيق:
--   • استخدام CREATE UNIQUE INDEX CONCURRENTLY لتجنّب قفل الجدول في الإنتاج.
--   • يستغرق CONCURRENTLY وقتاً أطول لكنه لا يؤثر على الكتابة/القراءة الجارية.
--   • يجب تنفيذه خارج أي transaction block (CONCURRENTLY لا يعمل داخل BEGIN/COMMIT).
--   • تطبيق مقترح: قبل تفعيل Task 3.4 (Edge Function) أو قبل تشغيل الدفع مباشرةً.
--
-- المتطلبات المسبقة:
--   • التأكّد من عدم وجود قيم مكرّرة في idempotency_key (التحقّق أدناه).
--   • تنفيذ بصلاحية superuser أو صاحب الجدول.
--
-- التحقّق من عدم وجود تكرارات (نفّذ أولاً):
-- SELECT idempotency_key, COUNT(*)
-- FROM public.payment_transactions
-- WHERE idempotency_key IS NOT NULL
-- GROUP BY idempotency_key
-- HAVING COUNT(*) > 1;
--
-- إذا كانت النتيجة فارغة → آمن للتطبيق.
-- ════════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  uq_paytx_idempotency_key
ON public.payment_transactions (idempotency_key)
WHERE idempotency_key IS NOT NULL;
