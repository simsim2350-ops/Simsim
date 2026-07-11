-- تخصيص البانرات/الكوبونات لفرع محدد (اختياري) — الخيار 3 من التصميم المعماري لصفحة اختيار الفرع
-- ⚠️ تُنفَّذ مرة واحدة في Supabase → SQL Editor (بعد marketing_phase1.sql)

alter table public.banners add column if not exists branch_id uuid references public.branches(id) on delete set null;
alter table public.coupons add column if not exists branch_id uuid references public.branches(id) on delete set null;

create index if not exists idx_banners_branch on public.banners(branch_id);
create index if not exists idx_coupons_branch on public.coupons(branch_id);

notify pgrst, 'reload schema';
