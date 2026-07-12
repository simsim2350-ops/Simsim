-- حذف ميزة "الفروع المتعددة" بالكامل من قاعدة البيانات
-- ⚠️ لا رجعة بعد التنفيذ: أي بيانات فروع مُدخلة فعلياً (اسم/عنوان/ساعات/QR) تُفقد نهائياً
-- ⚠️ نفّذ هذا فقط بعد نشر كود الواجهة الذي يزيل كل استخدامات الفروع (هذا الفرع في git)

-- إزالة عمود ربط الفرع من الجداول التي تعتمد عليه
alter table public.orders   drop column if exists branch_id;
alter table public.reviews  drop column if exists branch_id;
alter table public.banners  drop column if exists branch_id;
alter table public.coupons  drop column if exists branch_id;

-- إزالة عمود تقييد صلاحية الموظف بفرع معيّن
alter table public.restaurant_members drop column if exists branch_scope;

-- حذف جدول الفروع نفسه (يُسقط تلقائياً أي index/policy مرتبطة به)
drop table if exists public.branches cascade;

notify pgrst, 'reload schema';
