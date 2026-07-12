-- إعادة بناء ميزة الفروع بمفهوم جديد: كل فرع كيان تشغيلي مستقل (منيو/طلبات/تقييمات خاصة به)
-- ⚠️ تُنفَّذ مرة واحدة في Supabase → SQL Editor، بعد نشر كود الواجهة المطابق
-- الفرع الأساسي (الحالي) يصبح صفاً حقيقياً في جدول branches (is_primary=true) بدل حالة استثناء

-- ===== 1) جدول الفروع =====
create table if not exists public.branches (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  is_primary    boolean not null default false,
  name          text not null,
  name_en       text,
  address       text,
  address_en    text,
  phone         text,
  maps_url      text,
  opening_hours jsonb,
  is_active     boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- فرع أساسي واحد فقط لكل مطعم
create unique index if not exists idx_branches_one_primary
  on public.branches (restaurant_id) where (is_primary);

create index if not exists idx_branches_restaurant on public.branches(restaurant_id);

drop trigger if exists trg_branches_updated_at on public.branches;
create trigger trg_branches_updated_at
before update on public.branches
for each row execute function public.set_updated_at();

alter table public.branches enable row level security;

drop policy if exists "Owners manage their own branches" on public.branches;
create policy "Owners manage their own branches"
  on public.branches for all
  to authenticated
  using (restaurant_id in (select id from public.restaurants where owner_id = auth.uid()))
  with check (restaurant_id in (select id from public.restaurants where owner_id = auth.uid()));

drop policy if exists "Staff can read branches" on public.branches;
create policy "Staff can read branches"
  on public.branches for select
  to authenticated
  using (has_restaurant_access(restaurant_id));

drop policy if exists "Public can read active branches" on public.branches;
create policy "Public can read active branches"
  on public.branches for select
  to anon, authenticated
  using (is_active = true);

-- ===== 2) إنشاء فرع أساسي لكل مطعم قائم، يرث بياناته الحالية بلا فقدان =====
insert into public.branches (restaurant_id, is_primary, name, name_en, address, address_en, phone, maps_url, opening_hours, is_active, sort_order)
select
  r.id, true,
  'الفرع الرئيسي', 'Main Branch',
  r.address, r.address_en, r.phone, r.maps_url, r.opening_hours,
  true, 0
from public.restaurants r
where not exists (select 1 from public.branches b where b.restaurant_id = r.id and b.is_primary);

-- ===== 3) ربط المنيو/الطلبات/التقييمات بالفرع (إجباري — كل صف ينتمي لفرع حقيقي) =====
alter table public.categories add column if not exists branch_id uuid references public.branches(id) on delete cascade;
alter table public.products   add column if not exists branch_id uuid references public.branches(id) on delete cascade;
alter table public.orders     add column if not exists branch_id uuid references public.branches(id) on delete set null;
alter table public.reviews    add column if not exists branch_id uuid references public.branches(id) on delete set null;

-- Backfill: كل صف موجود يُنسب لفرع مطعمه الأساسي
update public.categories c set branch_id = b.id
  from public.branches b where b.restaurant_id = c.restaurant_id and b.is_primary and c.branch_id is null;
update public.products p set branch_id = b.id
  from public.branches b where b.restaurant_id = p.restaurant_id and b.is_primary and p.branch_id is null;
update public.orders o set branch_id = b.id
  from public.branches b where b.restaurant_id = o.restaurant_id and b.is_primary and o.branch_id is null;
update public.reviews rv set branch_id = b.id
  from public.branches b where b.restaurant_id = rv.restaurant_id and b.is_primary and rv.branch_id is null;

-- المنيو والطلبات يجب أن يكون لها فرع دائماً (لا حالة "بلا فرع" بعد اليوم)
alter table public.categories alter column branch_id set not null;
alter table public.products   alter column branch_id set not null;
alter table public.orders     alter column branch_id set not null;
-- reviews: نُبقيها اختيارية احتياطاً (لو حُذف الفرع لاحقاً تبقى المراجعة موجودة بلا ربط، بدل أن تُحذف)

create index if not exists idx_categories_branch on public.categories(branch_id);
create index if not exists idx_products_branch   on public.products(branch_id);
create index if not exists idx_orders_branch     on public.orders(branch_id);
create index if not exists idx_reviews_branch    on public.reviews(branch_id);

-- ===== 4) بانرات/كوبونات: استهداف اختياري لفرع بعينه (null = تظهر في كل فروع المطعم) =====
alter table public.banners add column if not exists branch_id uuid references public.branches(id) on delete set null;
alter table public.coupons add column if not exists branch_id uuid references public.branches(id) on delete set null;
create index if not exists idx_banners_branch on public.banners(branch_id);
create index if not exists idx_coupons_branch on public.coupons(branch_id);

-- ===== 5) صلاحية الموظف بفرع واحد اختياري =====
alter table public.restaurant_members add column if not exists branch_scope text;

create or replace function public.member_branch_scope(p_restaurant_id uuid)
returns text
language sql
security definer
stable
as $$
  select branch_scope from public.restaurant_members
  where restaurant_id = p_restaurant_id and user_id = auth.uid() and is_active = true
  limit 1;
$$;

drop policy if exists orders_access on public.orders;
create policy orders_access on public.orders
  for all
  using (
    has_restaurant_access(restaurant_id) and (
      is_restaurant_owner(restaurant_id)
      or member_branch_scope(restaurant_id) is null
      or member_branch_scope(restaurant_id) = 'all'
      or branch_id::text = member_branch_scope(restaurant_id)
    )
  )
  with check (has_restaurant_access(restaurant_id));

notify pgrst, 'reload schema';
