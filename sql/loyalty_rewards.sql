-- ============================================================================
-- Phase 1 / خطوة 5 — كتالوج المكافآت (Loyalty Rewards)
-- ----------------------------------------------------------------------------
-- يستبدل «المكافأة النصية الواحدة» (loyalty_programs.reward_description) بكتالوج
-- مكافآت مُنظّم قابل للتوسّع. Phase 1 = النموذج + إدارة أساسية (إنشاء/عرض/تفعيل).
-- منطق الاستبدال بكامل الشروط (حد أدنى/استثناءات/فروع/حدود) = Phase 2 (عمود conditions جاهز).
--
-- ⚠️ يُنفَّذ في Supabase بعد موافقة المالك.
-- ============================================================================

-- ── 1) جدول الكتالوج ─────────────────────────────────────────────────────────
create table if not exists public.loyalty_rewards (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name          text not null,
  type          text not null check (type in
                  ('free_product','fixed_discount','percent_discount','free_delivery','coupon','gift')),
  points_cost   int  not null check (points_cost > 0),   -- النقاط المطلوبة للاستبدال
  value         numeric,                                  -- مبلغ الخصم / نسبته (حسب النوع)
  product_id    uuid references public.products(id) on delete set null,  -- للمنتج المجاني
  conditions    jsonb   not null default '{}'::jsonb,     -- Phase 2 (حد أدنى/استثناءات/فروع/حدود)
  is_active     boolean not null default true,
  sort_order    int     not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_loyalty_rewards_active
  on public.loyalty_rewards (restaurant_id, is_active, sort_order);

-- ── 2) ربط reward_id في الدفتر بالكتالوج (FK المؤجَّل من خطوة 2) ───────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'loyalty_transactions_reward_id_fkey'
  ) then
    alter table public.loyalty_transactions
      add constraint loyalty_transactions_reward_id_fkey
      foreign key (reward_id) references public.loyalty_rewards(id) on delete set null;
  end if;
end $$;

-- ── 3) RLS: إدارة كاملة لصاحب المطعم/الموظف المخوّل (نمط باقي جداول الولاء) ─────
alter table public.loyalty_rewards enable row level security;

create policy loyalty_rewards_access on public.loyalty_rewards
  for all using (has_restaurant_access(restaurant_id))
  with check (has_restaurant_access(restaurant_id));

-- ── 4) بذر المكافأة النصية الحالية كصفّ واحد (توافق خلفي — idempotent) ─────────
-- لا يمكن استنتاج النوع من نص حر، فتُبذَر كـ 'gift' عام؛ يعدّلها المالك لاحقاً.
insert into public.loyalty_rewards (restaurant_id, name, type, points_cost, is_active, sort_order)
select p.restaurant_id,
       coalesce(nullif(trim(p.reward_description), ''), 'مكافأة الولاء'),
       'gift',
       greatest(coalesce(p.reward_threshold, 100), 1),
       true,
       0
from public.loyalty_programs p
where not exists (
  select 1 from public.loyalty_rewards r where r.restaurant_id = p.restaurant_id
);
