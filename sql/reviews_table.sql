-- ============================================================================
-- توثيق: جدول التقييمات (reviews)
-- ----------------------------------------------------------------------------
-- ⚠️ هذا الملف يوثّق كائناً **منشوراً بالفعل** في Supabase (أُعيد بناؤه من قاعدة
--    البيانات الحيّة بتاريخ 2026-07-24 — كان مفقوداً من المستودع).
--    كل العبارات تستخدم IF NOT EXISTS فلا تُغيّر شيئاً عند إعادة التشغيل.
-- المرجع: PROJECT_STATE §3 [ADR-9] · Phase 1 / خطوة 1 (توثيق الكائنات الغائبة)
--
-- 🔴 ملاحظة أمنية موثّقة (ستُعالَج في Phase 1 / خطوة 7):
--    السياسة `reviews_insert_public` تسمح بإدراج أي تقييم من عميل anon بلا أي
--    تحقّق خادمي أن الطلب حقيقي/مكتمل/يخص هذا الجوال → تزوير/إغراق ممكن.
--    البديل المخطّط: دالة `submit_review` (SECURITY DEFINER) تتحقق ثم تُدرج،
--    ثم استبدال هذه السياسة المفتوحة.
-- ============================================================================

create table if not exists public.reviews (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id),
  order_id       uuid references public.orders(id),
  customer_name  text,
  customer_phone text,
  rating         integer not null check (rating >= 1 and rating <= 5),
  comment        text,
  is_read        boolean default false,
  created_at     timestamptz default now(),
  branch_id      uuid references public.branches(id)
);

create index if not exists idx_reviews_branch
  on public.reviews (branch_id);

create index if not exists idx_reviews_restaurant
  on public.reviews (restaurant_id, created_at desc);

alter table public.reviews enable row level security;

-- وصول صاحب المطعم/الموظف المخوّل (كل العمليات)
create policy reviews_access on public.reviews
  for all using (has_restaurant_access(restaurant_id))
  with check (has_restaurant_access(restaurant_id));

-- 🔴 إدراج عام بلا تحقّق (ثغرة موثّقة — تُستبدل في خطوة 7)
create policy reviews_insert_public on public.reviews
  for insert with check (true);
