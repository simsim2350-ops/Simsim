-- ════════════════════════════════════════════════════════════════════════════
-- STAGING ONLY (rgqsetckcigkgsyobyjg / simsim-menu-staging) — لا يُطبَّق على الإنتاج بأي حال.
-- التطبيق على الإنتاج يبقى حصراً عبر sql/payment_transactions_idempotency_key_unique.sql الموجود
-- فعلاً هناك — هذا ملف مختلف تماماً، خاص بسد فجوة تكافؤ staging فقط.
-- ════════════════════════════════════════════════════════════════════════════
--
-- TASK-PAY-3.6D.4-B.1 — سد فجوة تكافؤ مخطّط اكتُشفت أثناء التحقق الحيّ في TASK_3_6D_4_B (تقرير
-- STAGING_VERIFICATION، قسم WARNINGS بند 1): الإنتاج يملك uq_paytx_idempotency_key فعلياً، بينما
-- staging لا يملكها إطلاقاً — لم تُنشأ ضمن هجرة staging_payments_gateway_foundation السابقة
-- (STAGING_TARGETED_PAYMENT_PARITY_EXECUTION_REPORT.md)، رغم أن باقي أساس الدفع طُبِّق بالكامل هناك.
--
-- التعريف أدناه مطابق حرفياً لتعريف الإنتاج الحيّ الفعلي (تحقُّق مباشر عبر pg_indexes على
-- gpwwnuuicywsvmmhxngs قبل كتابة هذا الملف، لا افتراضاً من sql/payment_transactions_idempotency_key_unique.sql
-- وحده):
--   CREATE UNIQUE INDEX uq_paytx_idempotency_key ON public.payment_transactions
--     USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL)
-- — نفس الاسم، نفس الجدول، نفس العمود، نفس شرط WHERE الجزئي، بلا أي انحراف.
--
-- CONCURRENTLY: نفس اختيار الإنتاج نفسه (تفادي قفل الجدول) — staging جدولها فارغ حالياً (0 صف،
-- مُتحقَّق منه في TASK_3_6D_4_B) فالمخاطرة عملياً معدومة، لكن نتّبع نفس الانضباط بلا استثناء.
-- IF NOT EXISTS: يجعل إعادة تشغيل هذا الملف آمنة بلا تأثير لو طُبِّق مسبقاً.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  uq_paytx_idempotency_key
ON public.payment_transactions (idempotency_key)
WHERE idempotency_key IS NOT NULL;
