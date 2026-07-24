-- ============================================================================
-- Phase 2 / P2.1أ — مستويات العضوية (Loyalty Tiers) — الطرف الخلفي
-- ----------------------------------------------------------------------------
-- مستويات يديرها المالك، المقياس = lifetime_earned (تصاعدي فقط، لا ينزل).
-- مزية لكل مستوى: مضاعف كسب (earn_multiplier) — يُبذَر ×1 (خامل) فلا يتغيّر
-- أي كسب حتى يرفعه المالك من الواجهة. صفر تغيير سلوكي مرئي في هذه الخطوة.
--
-- القرارات المعتمدة: D1=lifetime_earned · D2=جدول يديره المالك+بذر الخمسة · D3=مضاعف.
-- ⚠️ يُنفَّذ في Supabase بعد موافقة المالك.
-- ============================================================================

-- 1) جدول المستويات (يديره المالك)
create table if not exists public.loyalty_tiers (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  name            text not null,
  min_points      int  not null default 0 check (min_points >= 0),  -- عتبة lifetime_earned
  earn_multiplier numeric not null default 1 check (earn_multiplier > 0),
  color           text,
  icon            text,
  sort_order      int  not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (restaurant_id, name)
);

create index if not exists idx_loyalty_tiers_lookup
  on public.loyalty_tiers (restaurant_id, min_points desc);

alter table public.loyalty_tiers enable row level security;

create policy loyalty_tiers_access on public.loyalty_tiers
  for all using (has_restaurant_access(restaurant_id))
  with check (has_restaurant_access(restaurant_id));

-- 2) بذر المستويات الخمسة الافتراضية (idempotent — لكل مطعم له برنامج ولاء وبلا مستويات)
insert into public.loyalty_tiers (restaurant_id, name, min_points, earn_multiplier, color, icon, sort_order)
select p.restaurant_id, v.name, v.min_points, 1, v.color, v.icon, v.sort_order
from public.loyalty_programs p
cross join (values
  ('برونزي',   0,    '#CD7F32', '🥉', 1),
  ('فضّي',    200,   '#9CA3AF', '🥈', 2),
  ('ذهبي',    500,   '#F59E0B', '🥇', 3),
  ('بلاتيني', 1000,  '#60A5FA', '💎', 4),
  ('VIP',     2000,  '#7C3AED', '👑', 5)
) as v(name, min_points, color, icon, sort_order)
where not exists (select 1 from public.loyalty_tiers t where t.restaurant_id = p.restaurant_id);

-- 3) ربط الحساب بالمستوى (نستبدل عمود tier text الخامل بـ tier_id)
alter table public.loyalty_accounts drop column if exists tier;
alter table public.loyalty_accounts add column if not exists tier_id uuid
  references public.loyalty_tiers(id) on delete set null;

-- 4) دالة حساب المستوى: أعلى مستوى عتبته ≤ النقاط المكتسبة
create or replace function public.loyalty_compute_tier(p_restaurant_id uuid, p_lifetime_earned int)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from loyalty_tiers
  where restaurant_id = p_restaurant_id
    and min_points <= coalesce(p_lifetime_earned, 0)
  order by min_points desc
  limit 1;
$$;

-- دالة داخلية بحتة (تُستدعى من Triggers فقط) — تُمنع عن أدوار العميل
revoke all on function public.loyalty_compute_tier(uuid, int) from public, anon, authenticated;

-- 5) تحديث Trigger صيانة الرصيد ليحسب المستوى مع كل تغيّر في lifetime_earned
create or replace function public.loyalty_tx_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_lifetime int;
begin
  select lifetime_earned + (case when new.points > 0 then new.points else 0 end)
    into v_new_lifetime
  from loyalty_accounts where id = new.account_id;

  update loyalty_accounts set
    current_balance   = new.balance_after,
    lifetime_earned   = v_new_lifetime,
    lifetime_redeemed = lifetime_redeemed + (case when new.points < 0 then -new.points else 0 end),
    last_activity_at  = new.created_at,
    tier_id           = loyalty_compute_tier(new.restaurant_id, v_new_lifetime),
    updated_at        = now()
  where id = new.account_id;
  return null;
end;
$$;

-- 6) تحديث Trigger الكسب ليطبّق مضاعف مستوى العميل (قبل هذا الطلب)
create or replace function public.loyalty_on_order_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rate      numeric;
  v_enabled   boolean;
  v_mult      numeric;
  v_net       numeric;
  v_pts       int;
  v_order_net int;
  v_balance   int;
  v_reverse   int;
begin
  begin
    select earn_rate, enabled into v_rate, v_enabled
    from loyalty_programs where restaurant_id = new.restaurant_id;

    if not found or not v_enabled then return null; end if;
    if new.customer_phone is null or new.customer_phone = '' then return null; end if;

    select coalesce(sum(points), 0) into v_order_net
    from loyalty_transactions where order_id = new.id and source = 'order';

    if new.status = 'completed'
       and (tg_op = 'INSERT' or coalesce(old.status,'') <> 'completed')
       and v_order_net <= 0 then

      -- مضاعف مستوى العميل الحالي (قبل هذا الطلب) — افتراضه 1 لو لا حساب/لا مستوى
      select coalesce(t.earn_multiplier, 1) into v_mult
      from loyalty_accounts a
      left join loyalty_tiers t on t.id = a.tier_id
      where a.restaurant_id = new.restaurant_id and a.customer_phone = new.customer_phone;
      v_mult := coalesce(v_mult, 1);

      v_net := (new.total - coalesce(new.delivery_fee, 0)) / 1.15;
      v_pts := floor(greatest(v_net, 0) * v_rate * v_mult);
      if v_pts > 0 then
        perform loyalty_post(new.restaurant_id, new.customer_phone, 'earn', v_pts,
          'كسب من طلب مكتمل', 'order', new.id, new.branch_id);
      end if;

    elsif tg_op = 'UPDATE'
       and coalesce(old.status,'') = 'completed'
       and new.status <> 'completed'
       and v_order_net > 0 then

      select coalesce(current_balance, 0) into v_balance
      from loyalty_accounts
      where restaurant_id = new.restaurant_id and customer_phone = new.customer_phone;

      v_reverse := least(v_order_net, coalesce(v_balance, 0));
      if v_reverse > 0 then
        perform loyalty_post(new.restaurant_id, new.customer_phone, 'adjust', -v_reverse,
          'عكس نقاط طلب أُلغي بعد اكتماله', 'order', new.id, new.branch_id);
      end if;
    end if;

    if new.customer_name is not null and btrim(new.customer_name) <> '' then
      update loyalty_accounts
        set customer_name = new.customer_name, updated_at = now()
      where restaurant_id = new.restaurant_id
        and customer_phone = new.customer_phone
        and customer_name is distinct from new.customer_name;
    end if;

    return null;
  exception when others then
    raise warning 'loyalty_on_order_completed error (order %): %', new.id, sqlerrm;
    return null;
  end;
end;
$$;

-- 7) بذرة مستويات الحسابات الحالية (لمرة واحدة)
update public.loyalty_accounts a
set tier_id = loyalty_compute_tier(a.restaurant_id, a.lifetime_earned),
    updated_at = now()
where a.tier_id is null;
