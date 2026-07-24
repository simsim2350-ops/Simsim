-- ============================================================================
-- توثيق: جداول برنامج الولاء (loyalty_programs + loyalty_redemptions)
-- ----------------------------------------------------------------------------
-- ⚠️ هذا الملف يوثّق كائنات **منشورة بالفعل** في Supabase (أُعيد بناؤه من قاعدة
--    البيانات الحيّة بتاريخ 2026-07-24 — كان مفقوداً من المستودع).
--    كل العبارات تستخدم IF NOT EXISTS فلا تُغيّر شيئاً عند إعادة التشغيل.
-- المرجع: PROJECT_STATE §3 [ADR-2] · Phase 1 / خطوة 1 (توثيق الكائنات الغائبة)
-- ============================================================================

-- ── برنامج الولاء: صف واحد لكل مطعم (المفتاح الأساسي = restaurant_id) ──────────
create table if not exists public.loyalty_programs (
  restaurant_id      uuid primary key references public.restaurants(id),
  enabled            boolean          default false,
  earn_rate          numeric          default 1,        -- نقاط لكل 1 ﷼
  reward_threshold   integer          default 100,      -- النقاط المطلوبة للمكافأة
  reward_description text             default 'خصم 10 ﷼ على طلبك القادم',
  updated_at         timestamptz      default now()
);

alter table public.loyalty_programs enable row level security;

-- وصول صاحب المطعم/الموظف المخوّل (كل العمليات)
create policy loyalty_access on public.loyalty_programs
  for all using (has_restaurant_access(restaurant_id))
  with check (has_restaurant_access(restaurant_id));

-- قراءة عامة (يحتاجها منيو الزبون لمعرفة أن البرنامج مفعّل + إعداداته)
create policy loyalty_read_public on public.loyalty_programs
  for select using (true);


-- ── سجل استبدال المكافآت: صف لكل عملية استبدال ───────────────────────────────
create table if not exists public.loyalty_redemptions (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id),
  customer_phone text not null,
  points         integer not null,     -- النقاط المخصومة في هذا الاستبدال
  note           text,                 -- وصف المكافأة وقت الاستبدال
  created_at     timestamptz default now()
);

create index if not exists idx_redemptions_phone
  on public.loyalty_redemptions (restaurant_id, customer_phone);

alter table public.loyalty_redemptions enable row level security;

create policy redemptions_access on public.loyalty_redemptions
  for all using (has_restaurant_access(restaurant_id))
  with check (has_restaurant_access(restaurant_id));
