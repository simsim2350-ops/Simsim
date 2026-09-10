-- Car Pickup — Phase 2 addition: car_pickup_info_required.
-- ⚠️ تُنفَّذ مرة واحدة في Supabase → SQL Editor / migration tool.
--
-- Phase 1 (sql/car_pickup_phase1.sql) أضاف car_pickup_enabled/car_pickup_info_label
-- على branches وorders.car_info — بدون car_pickup_info_required عمداً (لا واجهة
-- كانت تستخدمه وقتها). الآن في Phase 2، Branches.jsx (لوحة المطعم) وCheckoutForm.tsx
-- (تطبيق العميل) يستخدمانه فعلياً، فأصبحت إضافته مبرَّرة معماريًا.
--
-- نفس نمط car_pickup_enabled بالضبط (boolean عادي على branches، Branch-level،
-- بلا وراثة من المطعم) — لا JSONB، لا جدول جديد، لا تغيير في RLS (لا داعي: نفس
-- القراءة/الكتابة الموجودة على بقية أعمدة branches تكفي).
--
-- الإنفاذ الفعلي لهذا العلم (منع إرسال الطلب بدون car_info عند required=true)
-- يتم بالكامل من طرف العميل (CheckoutForm.tsx) — قرار مُبرَّر في تقرير تنفيذ
-- Phase 2 (قسم "Required/Optional Decision"): عدم وجود car_info ليس ثغرة أمنية
-- (لا يكشف بيانات، لا يتجاوز صلاحية) بل قرار UX بحت، فلا حاجة لتكرار الفحص داخل
-- create_order RPC — الحماية الأمنية الحقيقية (car_pickup_enabled) بقيت كما هي
-- في Phase 1 دون أي تعديل هنا.

alter table public.branches add column if not exists car_pickup_info_required boolean not null default false;

notify pgrst, 'reload schema';
