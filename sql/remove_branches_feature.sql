-- حذف ميزة "الفروع المتعددة" بالكامل من قاعدة البيانات
-- ⚠️ لا رجعة بعد التنفيذ: أي بيانات فروع مُدخلة فعلياً (اسم/عنوان/ساعات/QR) تُفقد نهائياً
-- ⚠️ نفّذ هذا فقط بعد نشر كود الواجهة الذي يزيل كل استخدامات الفروع (هذا الفرع في git)

-- سياسة orders_access الحالية تعتمد على branch_id (العمود) وmember_branch_scope() (الدالة
-- التي تقرأ branch_scope) — يجب استبدالها ببديل بلا فرع قبل حذف الأعمدة، وإلا تفشل العملية.
-- banners/coupons/reviews لا تعتمد سياساتها على الفرع إطلاقاً (تحقّقنا من pg_policies) — آمنة كما هي.

drop policy if exists orders_access on public.orders;

create policy orders_access on public.orders
  for all
  using (has_restaurant_access(restaurant_id))
  with check (has_restaurant_access(restaurant_id));

drop function if exists public.member_branch_scope(uuid);

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
