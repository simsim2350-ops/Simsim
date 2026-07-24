-- ============================================================================
-- توثيق: جدول التقييمات (reviews)
-- ----------------------------------------------------------------------------
-- ⚠️ هذا الملف يوثّق كائناً **منشوراً بالفعل** في Supabase (أُعيد بناؤه من قاعدة
--    البيانات الحيّة بتاريخ 2026-07-24 — كان مفقوداً من المستودع).
--    كل العبارات تستخدم IF NOT EXISTS فلا تُغيّر شيئاً عند إعادة التشغيل.
-- المرجع: PROJECT_STATE §3 [ADR-9] · Phase 1 / خطوة 1 (توثيق الكائنات الغائبة)
--
-- ✅ [ADR-37/خطوة 7] سُدّت الثغرة: أُزيلت سياسة `reviews_insert_public` المفتوحة،
--    وصار الإدراج حصراً عبر دالة `submit_review` (DEFINER) التي تتحقّق أن الطلب
--    موجود/مكتمل/غير مُقيَّم وتشتقّ الهوية منه. انظر sql/submit_review.sql.
--    أُضيفت أعمدة reply/reply_at/status خاملة (جاهزة لـPhase 2) + قيد فريد لكل طلب.
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
  branch_id      uuid references public.branches(id),
  reply          text,          -- [ADR-37/خطوة 7] خامل — جاهز لـPhase 2 (الرد على التقييم)
  reply_at       timestamptz,   -- خامل
  status         text           -- خامل — جاهز لـPhase 2 (إدارة الشكاوى)
);

create index if not exists idx_reviews_branch
  on public.reviews (branch_id);

create index if not exists idx_reviews_restaurant
  on public.reviews (restaurant_id, created_at desc);

-- [ADR-37/خطوة 7] تقييم واحد لكل طلب
create unique index if not exists uq_reviews_order_id
  on public.reviews (order_id) where order_id is not null;

alter table public.reviews enable row level security;

-- وصول صاحب المطعم/الموظف المخوّل (كل العمليات)
create policy reviews_access on public.reviews
  for all using (has_restaurant_access(restaurant_id))
  with check (has_restaurant_access(restaurant_id));

-- ملاحظة: لا سياسة INSERT عامة — الإدراج حصراً عبر submit_review (DEFINER).
-- سياسة reviews_insert_public القديمة (with check true) أُزيلت في خطوة 7.
