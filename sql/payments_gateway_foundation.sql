-- أساس نظام الدفع (Payment Foundation) — بنية تحتية محايدة للمزوّد، خاملة تماماً.
-- لا تكامل، لا تحصيل، لا مفاتيح سرّية هنا (تعيش في بيئة Edge Function وقت البناء).
-- ثلاثة جداول: مزوّدون (سجل) · معاملات (دورة حياة المحاولة) · أحداث Webhook (بإتقان idempotency).

-- 1) سجل المزوّدين — جميعهم معطّلون افتراضياً؛ اختيار المزوّد لاحقاً قرار بالبيانات لا بالكود.
create table if not exists public.payment_providers (
  key          text primary key,                       -- manual / moyasar / tap / hyperpay / stripe
  display_name text not null,
  is_enabled   boolean not null default false,
  mode         text not null default 'test' check (mode in ('test','live')),
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 2) معاملات الدفع — دورة حياة محاولة دفع (وليست الفاتورة).
create table if not exists public.payment_transactions (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  invoice_id      uuid references public.invoices(id) on delete set null,
  provider        text not null references public.payment_providers(key),
  provider_ref    text,                                 -- معرّف المعاملة/الشحنة لدى المزوّد
  status          text not null default 'initiated'
                  check (status in ('initiated','pending','succeeded','failed','cancelled','refunded')),
  amount          numeric not null check (amount >= 0),
  currency        text not null default 'SAR',
  failure_reason  text,
  idempotency_key text,                                 -- إتقان إنشاء الشحنة من جهتنا
  metadata        jsonb not null default '{}'::jsonb,
  raw             jsonb,                                -- آخر حمولة من المزوّد (لقطة)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_paytx_restaurant on public.payment_transactions(restaurant_id, created_at desc);
create index if not exists idx_paytx_invoice    on public.payment_transactions(invoice_id);
create unique index if not exists uq_paytx_provider_ref on public.payment_transactions(provider, provider_ref) where provider_ref is not null;

-- 3) أحداث Webhook — كل نداء وارد من المزوّد يُسجَّل، مع فهرس فريد يمنع المعالجة المكرّرة.
create table if not exists public.payment_webhook_events (
  id             uuid primary key default gen_random_uuid(),
  provider       text not null,
  event_id       text not null,                         -- معرّف الحدث لدى المزوّد (Idempotency)
  event_type     text,
  transaction_id uuid references public.payment_transactions(id) on delete set null,
  payload        jsonb not null default '{}'::jsonb,
  received_at    timestamptz not null default now(),
  processed_at   timestamptz,
  process_error  text
);
create unique index if not exists uq_webhook_provider_event on public.payment_webhook_events(provider, event_id);

-- RLS: إدارة/قراءة للمشرف فقط في هذه المرحلة (الوصول التشغيلي لاحقاً عبر service_role في Edge Functions).
alter table public.payment_providers      enable row level security;
alter table public.payment_transactions   enable row level security;
alter table public.payment_webhook_events enable row level security;
drop policy if exists ppv_admin_all on public.payment_providers;
drop policy if exists ptx_admin_all on public.payment_transactions;
drop policy if exists pwh_admin_all on public.payment_webhook_events;
create policy ppv_admin_all on public.payment_providers      for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy ptx_admin_all on public.payment_transactions   for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy pwh_admin_all on public.payment_webhook_events for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- بذر المزوّدين (معطّلين) — لا يفعّل شيئاً.
insert into public.payment_providers(key, display_name, is_enabled, mode, sort_order) values
  ('manual',   'تحصيل يدوي', false, 'test', 0),
  ('moyasar',  'Moyasar',    false, 'test', 1),
  ('tap',      'Tap',        false, 'test', 2),
  ('hyperpay', 'HyperPay',   false, 'test', 3),
  ('stripe',   'Stripe',     false, 'test', 4)
on conflict (key) do nothing;
