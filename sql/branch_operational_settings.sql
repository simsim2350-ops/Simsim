-- إعدادات تشغيلية إضافية لكل فرع: توصيل (وراثة اختيارية) + استلام + إغلاق مؤقت فوري
-- ⚠️ تُنفَّذ مرة واحدة في Supabase → SQL Editor، بعد نشر كود الواجهة المطابق

-- توصيل: قيمة null تعني "يرث إعداد المطعم"، وأي قيمة أخرى تكون تخصيصاً مستقلاً للفرع
alter table public.branches add column if not exists delivery_enabled boolean;
alter table public.branches add column if not exists delivery_fee numeric;

-- استلام: خاصية جديدة كلياً على مستوى الفرع فقط، مفعّلة افتراضياً
alter table public.branches add column if not exists takeaway_enabled boolean not null default true;

-- إغلاق مؤقت فوري (يختلف عن is_active الدائم وعن جدول opening_hours الأسبوعي)
alter table public.branches add column if not exists is_paused boolean not null default false;

notify pgrst, 'reload schema';
