-- ========== M4.1: أساس الفوترة (Super Admin / Billing) — قيد المراجعة، لم يُنفَّذ بعد ==========
-- نموذج: اشتراك SaaS لكل مطعم (علامة)، تحصيل يدوي، السعر يُدخل يدوياً.
-- قابل للتوسّع للدفع الإلكتروني: البوابة مستقبلاً = قيمة method جديدة في payments + دالة webhook،
--   بلا تغيير أي جدول. الضريبة (ض.ق.م 15%) بمنطق ADR-1 (تُشتقّ للخلف من الإجمالي الشامل).
-- الأمان: RLS مفعّل؛ لا وصول مباشر للمستأجرين؛ الكتابة حصراً عبر دوال DEFINER (الخطوة 2).
-- قراءة المشرف فقط الآن (وصول المطعم لفواتيره = M4.2).

-- 1) اشتراك واحد لكل مطعم (الافتراض المعتمد: لكل علامة، لا لكل فرع)
create table if not exists public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  restaurant_id        uuid not null references restaurants(id) on delete cascade,
  plan_label           text not null default 'starter',
  amount               numeric(12,2) not null default 0 check (amount >= 0),  -- شامل ض.ق.م، يُدخل يدوياً
  billing_cycle        text not null default 'monthly' check (billing_cycle in ('monthly','yearly')),
  status               text not null default 'active' check (status in ('trialing','active','past_due','canceled')),
  current_period_start date,
  current_period_end   date,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (restaurant_id)
);

-- 2) فاتورة لكل دورة (الإجمالي يُدخله الأدمن شاملاً الضريبة؛ الصافي/الضريبة يُشتقّان)
create table if not exists public.invoices (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  subscription_id uuid references subscriptions(id) on delete set null,
  invoice_number bigint generated always as identity,        -- رقم تسلسلي للعرض
  total          numeric(12,2) not null check (total >= 0),   -- شامل ض.ق.م
  amount_net     numeric(12,2) not null,                      -- = round(total/1.15, 2)  (ADR-1)
  vat_amount     numeric(12,2) not null,                      -- = total - amount_net
  currency       text not null default 'SAR',
  status         text not null default 'open' check (status in ('draft','open','paid','void')),
  period_start   date,
  period_end     date,
  issued_at      timestamptz not null default now(),
  due_at         date,
  paid_at        timestamptz,
  notes          text,
  created_at     timestamptz not null default now()
);

-- 3) تسجيل الدفع (يدوي الآن؛ 'gateway' مُتاح مسبقاً كنقطة توسّع للدفع الإلكتروني)
create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references invoices(id) on delete cascade,
  method      text not null default 'manual' check (method in ('manual','bank_transfer','gateway')),
  reference   text,
  amount      numeric(12,2) not null check (amount >= 0),
  paid_at     timestamptz not null default now(),
  recorded_by uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

-- الفهارس
create index if not exists idx_invoices_restaurant on public.invoices (restaurant_id, issued_at desc);
create index if not exists idx_invoices_status     on public.invoices (status);
create index if not exists idx_payments_invoice    on public.payments (invoice_id);

-- updated_at التلقائي (يعيد استخدام الدالة القائمة set_updated_at)
drop trigger if exists trg_subscriptions_updated on public.subscriptions;
create trigger trg_subscriptions_updated before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- RLS: مفعّل على الثلاثة. قراءة للمشرفين فقط الآن؛ لا سياسات كتابة (الكتابة عبر دوال DEFINER — الخطوة 2).
alter table public.subscriptions enable row level security;
alter table public.invoices      enable row level security;
alter table public.payments      enable row level security;

create policy subs_admin_select on public.subscriptions for select using (public.is_platform_admin());
create policy inv_admin_select  on public.invoices      for select using (public.is_platform_admin());
create policy pay_admin_select  on public.payments      for select using (public.is_platform_admin());
