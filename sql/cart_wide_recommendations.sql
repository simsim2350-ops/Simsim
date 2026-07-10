-- محرك الاقتراحات الذكي — قائمة مستقلة لقسم "أكمل وجبتك" العام في السلة
-- (بمعزل تماماً عن قواعد الأصناف الفردية في product_recommendations، وعن is_featured)
-- ⚠️ تُنفَّذ مرة واحدة في Supabase → SQL Editor

create table if not exists public.cart_wide_recommendations (
  id           uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  product_id   uuid not null references public.products(id) on delete cascade,
  priority     int  not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (restaurant_id, product_id)
);

create index if not exists idx_cart_wide_recommendations_restaurant on public.cart_wide_recommendations(restaurant_id);

-- إعادة استخدام دالة تحديث updated_at الموجودة أصلاً
drop trigger if exists trg_cart_wide_recommendations_updated_at on public.cart_wide_recommendations;
create trigger trg_cart_wide_recommendations_updated_at
before update on public.cart_wide_recommendations
for each row execute function public.set_updated_at();

alter table public.cart_wide_recommendations enable row level security;

-- قراءة عامة (anon) للعناصر المفعّلة فقط — تستخدمها صفحة المنيو العامة بلا تسجيل دخول
drop policy if exists "Public can read active cart-wide recommendations" on public.cart_wide_recommendations;
create policy "Public can read active cart-wide recommendations"
  on public.cart_wide_recommendations for select
  to anon, authenticated
  using (is_active = true);

-- كل عمليات الإدارة مقصورة على مالك المطعم
drop policy if exists "Owners manage their own cart-wide recommendations" on public.cart_wide_recommendations;
create policy "Owners manage their own cart-wide recommendations"
  on public.cart_wide_recommendations for all
  to authenticated
  using (restaurant_id in (select id from public.restaurants where owner_id = auth.uid()))
  with check (restaurant_id in (select id from public.restaurants where owner_id = auth.uid()));
