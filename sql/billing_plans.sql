-- ========== M4.1: الباقات (Plans) — إضافة على billing_foundation — قيد المراجعة، لم يُنفَّذ بعد ==========
-- الأدمن يُنشئ الباقات يدوياً ويسعّرها: كل باقة = اسم + دورة (شهرية/سنوية) + سعر واحد.
-- الاسم والسعر قابلان للتعديل دائماً (مرونة). المطعم يُشترك في باقة، والسعر الفعلي يبقى
-- قابلاً للتعديل على مستوى الاشتراك (subscriptions.amount) لسعر خاص عند الحاجة.

-- 1) جدول الباقات (يُنشئها الأدمن يدوياً)
create table if not exists public.plans (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                                          -- قابل للتعديل
  billing_cycle text not null check (billing_cycle in ('monthly','yearly')),
  price         numeric(12,2) not null default 0 check (price >= 0),    -- شامل ض.ق.م، قابل للتعديل
  features      text,                                                   -- مزايا للعرض (اختياري)
  is_active     boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists trg_plans_updated on public.plans;
create trigger trg_plans_updated before update on public.plans
  for each row execute function public.set_updated_at();

-- RLS: قراءة للمشرف فقط الآن (عرض الباقات للمطعم = M4.2). الكتابة عبر دوال DEFINER (الخطوة 2).
alter table public.plans enable row level security;
create policy plans_admin_select on public.plans for select using (public.is_platform_admin());

-- 2) ربط الاشتراك بالباقة (الجدول موجود وفارغ — إضافة آمنة بلا فقدان بيانات)
--    plan_id = الباقة المختارة؛ amount يبقى السعر الفعلي (يبدأ من سعر الباقة، قابل للتعديل)؛
--    plan_label يبقى لقطة لاسم الباقة وقت الاشتراك (حفظ التاريخ لو تغيّر الاسم لاحقاً).
alter table public.subscriptions
  add column if not exists plan_id uuid references plans(id) on delete set null;
