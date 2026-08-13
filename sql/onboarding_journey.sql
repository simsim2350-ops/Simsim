-- ============================================================================
-- رحلة الأونبوردنغ (Onboarding Journey) — تتبّع تقدّم إعداد المطعم + ضمان فرع رئيسي
-- طُبِّقت كهجرة: onboarding_columns_and_primary_branch_backfill
-- ----------------------------------------------------------------------------
-- السبب: منيو العميل يُقرأ عبر branch_id، لكن رحلة الإعداد كانت تُنشئ الأقسام/الأصناف
-- بـ restaurant_id فقط، وبعض المطاعم بلا فرع رئيسي إطلاقاً → المنيو لا يظهر.
-- هذا الملف يضمن: (أ) تتبّع خطوة الإعداد للاستئناف، (ب) وجود فرع رئيسي لكل مطعم.
-- ============================================================================

-- 1) أعمدة تتبّع الأونبوردنغ على restaurants
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_step text;

-- 2) اعتبار كل المطاعم الحالية «مكتملة» حتى لا تُعاد عليهم رحلة الإعداد
UPDATE public.restaurants
  SET onboarding_completed = true, onboarding_step = 'done'
  WHERE onboarding_completed = false;

-- 3) ضمان فرع رئيسي لكل مطعم بلا فرع (يعالج المطاعم اليتيمة) — idempotent
INSERT INTO public.branches (restaurant_id, is_primary, name, name_en, sort_order, is_active)
SELECT r.id, true, 'الفرع الرئيسي', 'Main Branch', 0, true
FROM public.restaurants r
WHERE NOT EXISTS (SELECT 1 FROM public.branches b WHERE b.restaurant_id = r.id);
