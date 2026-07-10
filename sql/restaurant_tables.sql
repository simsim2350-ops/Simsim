-- إدارة الطاولات: جدول طاولات كل مطعم (Restaurant → Tables، One-to-Many)
-- يُستخدم في: لوحة التحكم (إدارة كاملة) + المنيو العام (قراءة الطاولات المفعّلة فقط لتعبئة قائمة اختيار رقم الطاولة)
-- ⚠️ تُنفَّذ مرة واحدة في Supabase → SQL Editor

create table if not exists public.restaurant_tables (
  id           uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_number text not null,
  status       text not null default 'active' check (status in ('active', 'inactive')),
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- منع تكرار نفس رقم الطاولة داخل نفس المطعم (مسموح تكراره بين مطاعم مختلفة)
  unique (restaurant_id, table_number)
);

create index if not exists idx_restaurant_tables_restaurant on public.restaurant_tables(restaurant_id);

-- تحديث updated_at تلقائياً مع كل تعديل
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_restaurant_tables_updated_at on public.restaurant_tables;
create trigger trg_restaurant_tables_updated_at
before update on public.restaurant_tables
for each row execute function public.set_updated_at();

alter table public.restaurant_tables enable row level security;

-- قراءة عامة (anon) للطاولات المفعّلة فقط — تستخدمها صفحة المنيو العامة بلا تسجيل دخول
drop policy if exists "Public can read active tables" on public.restaurant_tables;
create policy "Public can read active tables"
  on public.restaurant_tables for select
  to anon, authenticated
  using (status = 'active');

-- كل عمليات الإدارة (قراءة كاملة + إضافة + تعديل + حذف) مقصورة على مالك المطعم
drop policy if exists "Owners manage their own tables" on public.restaurant_tables;
create policy "Owners manage their own tables"
  on public.restaurant_tables for all
  to authenticated
  using (restaurant_id in (select id from public.restaurants where owner_id = auth.uid()))
  with check (restaurant_id in (select id from public.restaurants where owner_id = auth.uid()));
