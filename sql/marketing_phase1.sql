-- المرحلة 1 من صفحة اختيار الفرع التسويقية: بانرات العروض + الكوبونات
-- ⚠️ تُنفَّذ مرة واحدة في Supabase → SQL Editor

-- ===== بانرات العروض =====
create table if not exists public.banners (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  title         text not null,
  subtitle      text,
  image_url     text,
  cta_text      text not null default 'اطلب الآن',
  starts_at     timestamptz,
  ends_at       timestamptz,
  is_active     boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_banners_restaurant on public.banners(restaurant_id);

drop trigger if exists trg_banners_updated_at on public.banners;
create trigger trg_banners_updated_at
before update on public.banners
for each row execute function public.set_updated_at();

alter table public.banners enable row level security;

drop policy if exists "Public can read active banners" on public.banners;
create policy "Public can read active banners"
  on public.banners for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists "Owners manage their own banners" on public.banners;
create policy "Owners manage their own banners"
  on public.banners for all
  to authenticated
  using (restaurant_id in (select id from public.restaurants where owner_id = auth.uid()))
  with check (restaurant_id in (select id from public.restaurants where owner_id = auth.uid()));

-- ===== الكوبونات =====
create table if not exists public.coupons (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants(id) on delete cascade,
  code             text not null,
  discount_type    text not null default 'percent' check (discount_type in ('percent', 'fixed')),
  discount_value   numeric not null check (discount_value > 0),
  min_order_amount numeric not null default 0,
  expires_at       timestamptz,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (restaurant_id, code)
);

create index if not exists idx_coupons_restaurant on public.coupons(restaurant_id);

drop trigger if exists trg_coupons_updated_at on public.coupons;
create trigger trg_coupons_updated_at
before update on public.coupons
for each row execute function public.set_updated_at();

alter table public.coupons enable row level security;

-- قراءة عامة للكوبونات المفعّلة فقط (تُستخدم لعرضها في صفحة اختيار الفرع، والتحقق منها عند الدفع)
drop policy if exists "Public can read active coupons" on public.coupons;
create policy "Public can read active coupons"
  on public.coupons for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists "Owners manage their own coupons" on public.coupons;
create policy "Owners manage their own coupons"
  on public.coupons for all
  to authenticated
  using (restaurant_id in (select id from public.restaurants where owner_id = auth.uid()))
  with check (restaurant_id in (select id from public.restaurants where owner_id = auth.uid()));

-- ===== تسجيل الخصم على الطلب =====
alter table public.orders add column if not exists coupon_code text;
alter table public.orders add column if not exists discount_amount numeric not null default 0;
