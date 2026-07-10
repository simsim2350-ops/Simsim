-- محرك الاقتراحات الذكي — المرحلة 1: قواعد يدوية (صنف ← أصناف مقترحة)
-- ⚠️ تُنفَّذ مرة واحدة في Supabase → SQL Editor

create table if not exists public.product_recommendations (
  id                     uuid primary key default gen_random_uuid(),
  restaurant_id          uuid not null references public.restaurants(id) on delete cascade,
  source_product_id      uuid not null references public.products(id) on delete cascade,
  recommended_product_id uuid not null references public.products(id) on delete cascade,
  priority               int  not null default 0,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (source_product_id, recommended_product_id),
  check (source_product_id != recommended_product_id)
);

create index if not exists idx_product_recommendations_source on public.product_recommendations(source_product_id);
create index if not exists idx_product_recommendations_restaurant on public.product_recommendations(restaurant_id);

-- إعدادات عامة على مستوى المطعم (تشغيل/إيقاف الميزة، وعدد الاقتراحات المعروضة للعميل)
alter table public.restaurants add column if not exists recommendations_enabled boolean not null default true;
alter table public.restaurants add column if not exists recommendations_count int not null default 4;

-- إعادة استخدام دالة تحديث updated_at الموجودة أصلاً (أُنشئت مع restaurant_tables)
drop trigger if exists trg_product_recommendations_updated_at on public.product_recommendations;
create trigger trg_product_recommendations_updated_at
before update on public.product_recommendations
for each row execute function public.set_updated_at();

alter table public.product_recommendations enable row level security;

-- قراءة عامة (anon) للقواعد المفعّلة فقط — تستخدمها صفحة المنيو العامة بلا تسجيل دخول
drop policy if exists "Public can read active recommendations" on public.product_recommendations;
create policy "Public can read active recommendations"
  on public.product_recommendations for select
  to anon, authenticated
  using (is_active = true);

-- كل عمليات الإدارة مقصورة على مالك المطعم
drop policy if exists "Owners manage their own recommendations" on public.product_recommendations;
create policy "Owners manage their own recommendations"
  on public.product_recommendations for all
  to authenticated
  using (restaurant_id in (select id from public.restaurants where owner_id = auth.uid()))
  with check (restaurant_id in (select id from public.restaurants where owner_id = auth.uid()));
