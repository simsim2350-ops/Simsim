-- ============================================================================
-- Phase 1 / خطوة 2 — مخطط دفتر النقاط (Loyalty Ledger)
-- ----------------------------------------------------------------------------
-- يُنشئ الأساس الدائم لنظام الولاء الجديد (يعكس ADR-2: من «حساب حيّ» إلى «دفتر»).
-- يُنشأ **فارغاً بلا أي تغيير سلوكي** — لا شيء يستدعي هذه الكائنات بعد:
--   • البذر التاريخي        → خطوة 3
--   • Trigger كسب النقاط     → خطوة 4 (لا لمس لجدول orders هنا)
--   • كتالوج المكافآت        → خطوة 5 (عمود reward_id جاهز بلا FK بعد)
--   • ربط الواجهة/الدوال     → خطوة 6
--
-- القرارات المعتمدة من المالك:
--   • هوية العميل = (restaurant_id + customer_phone)  ← الولاء مشترك بين الفروع (ADR-22)
--   • احتساب النقاط على صافي الأصناف                   ← يُطبَّق في خطوتي 3/4
--   • كل الكتابة عبر دوال SECURITY DEFINER فقط (لا كتابة مباشرة من العميل)
--
-- ⚠️ يُنفَّذ في Supabase بعد موافقة المالك على هذا النص (لم يُنفَّذ بعد).
-- ============================================================================

-- ── 1) جدول الحسابات: هوية ولاء العميل + رصيده المُخزَّن (denormalized) ─────────
create table if not exists public.loyalty_accounts (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references public.restaurants(id) on delete cascade,
  customer_phone    text not null,
  current_balance   int  not null default 0,   -- الرصيد الحالي (يُصان تلقائياً من الدفتر)
  lifetime_earned   int  not null default 0,   -- إجمالي المكتسب مدى الحياة (أساس المستويات — Phase 2)
  lifetime_redeemed int  not null default 0,   -- إجمالي المخصوم مدى الحياة
  tier              text,                       -- المستوى (يُملأ في Phase 2 — العمود جاهز)
  first_seen_at     timestamptz not null default now(),
  last_activity_at  timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (restaurant_id, customer_phone)
);

create index if not exists idx_loyalty_accounts_leaderboard
  on public.loyalty_accounts (restaurant_id, current_balance desc);

-- ── 2) دفتر النقاط: Append-Only — «كشف الحساب» ───────────────────────────────
create table if not exists public.loyalty_transactions (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  account_id     uuid not null references public.loyalty_accounts(id) on delete cascade,
  customer_phone text not null,
  type           text not null check (type in ('earn','redeem','adjust','expire')),
  points         int  not null,                 -- موجب = إضافة · سالب = خصم
  balance_after  int  not null,                 -- الرصيد بعد العملية (يُحسبه Trigger أدناه)
  reason         text,
  source         text not null default 'manual'
                 check (source in ('order','manual','reward','migration','expiry','adjust')),
  order_id       uuid references public.orders(id)   on delete set null,
  branch_id      uuid references public.branches(id) on delete set null,
  staff_id       uuid,                          -- المستخدم الذي سجّل الحركة (auth.uid) — null للنظام
  reward_id      uuid,                          -- المكافأة المستبدَلة — FK يُضاف في خطوة 5
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists idx_loyalty_tx_account   on public.loyalty_transactions (account_id, created_at desc);
create index if not exists idx_loyalty_tx_restaurant on public.loyalty_transactions (restaurant_id, created_at desc);
create index if not exists idx_loyalty_tx_order      on public.loyalty_transactions (order_id) where order_id is not null;

-- ── 3) صيانة الرصيد الذرّية (Triggers) ───────────────────────────────────────
-- BEFORE INSERT: يقفل صفّ الحساب، يحسب balance_after، يمنع الرصيد السالب.
create or replace function public.loyalty_tx_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current int;
begin
  -- قفل صفّ الحساب لتفادي التسابق (concurrent transactions)
  select current_balance into v_current
  from loyalty_accounts where id = new.account_id for update;

  if not found then
    raise exception 'loyalty account % not found', new.account_id;
  end if;

  new.balance_after := v_current + new.points;

  if new.balance_after < 0 then
    raise exception 'insufficient_points: balance % + % < 0', v_current, new.points
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- AFTER INSERT: يطبّق الحركة على مجاميع الحساب.
create or replace function public.loyalty_tx_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update loyalty_accounts set
    current_balance   = new.balance_after,
    lifetime_earned   = lifetime_earned   + (case when new.points > 0 then  new.points else 0 end),
    lifetime_redeemed = lifetime_redeemed + (case when new.points < 0 then -new.points else 0 end),
    last_activity_at  = new.created_at,
    updated_at        = now()
  where id = new.account_id;
  return null;
end;
$$;

drop trigger if exists trg_loyalty_tx_before on public.loyalty_transactions;
create trigger trg_loyalty_tx_before
  before insert on public.loyalty_transactions
  for each row execute function public.loyalty_tx_before_insert();

drop trigger if exists trg_loyalty_tx_after on public.loyalty_transactions;
create trigger trg_loyalty_tx_after
  after insert on public.loyalty_transactions
  for each row execute function public.loyalty_tx_after_insert();

-- ── 4) دوال الكتابة الداخلية (لا تُمنَح لأي دور عميل — تُستدعى من دوال/Triggers مبوّبة) ──
-- تضمن وجود الحساب وتُرجع معرّفه.
create or replace function public.loyalty_ensure_account(p_restaurant_id uuid, p_phone text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  insert into loyalty_accounts (restaurant_id, customer_phone)
  values (p_restaurant_id, p_phone)
  on conflict (restaurant_id, customer_phone) do nothing;

  select id into v_id from loyalty_accounts
  where restaurant_id = p_restaurant_id and customer_phone = p_phone;

  return v_id;
end;
$$;

-- نقطة الكتابة الوحيدة في الدفتر: تُنشئ الحساب لو لزم ثم تُدرج الحركة.
create or replace function public.loyalty_post(
  p_restaurant_id uuid,
  p_phone         text,
  p_type          text,
  p_points        int,
  p_reason        text  default null,
  p_source        text  default 'manual',
  p_order_id      uuid  default null,
  p_branch_id     uuid  default null,
  p_staff_id      uuid  default null,
  p_reward_id     uuid  default null,
  p_metadata      jsonb default '{}'::jsonb
)
returns public.loyalty_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_row loyalty_transactions;
begin
  v_account_id := loyalty_ensure_account(p_restaurant_id, p_phone);

  insert into loyalty_transactions(
    restaurant_id, account_id, customer_phone, type, points, balance_after,
    reason, source, order_id, branch_id, staff_id, reward_id, metadata
  ) values (
    p_restaurant_id, v_account_id, p_phone, p_type, p_points, 0,  -- balance_after يضبطه Trigger
    p_reason, p_source, p_order_id, p_branch_id, p_staff_id, p_reward_id, coalesce(p_metadata, '{}'::jsonb)
  ) returning * into v_row;

  return v_row;
end;
$$;

-- منع الاستدعاء المباشر من أي دور عميل (anon/authenticated): تُستدعى داخلياً فقط.
revoke all on function public.loyalty_ensure_account(uuid, text) from public;
revoke all on function public.loyalty_post(uuid, text, text, int, text, text, uuid, uuid, uuid, uuid, jsonb) from public;

-- ── 5) RLS: قراءة لصاحب المطعم/الموظف المخوّل · لا كتابة مباشرة · لا حذف/تعديل ──
alter table public.loyalty_accounts     enable row level security;
alter table public.loyalty_transactions enable row level security;

-- قراءة فقط (الكتابة حصراً عبر الدوال DEFINER أعلاه التي تتجاوز RLS).
create policy loyalty_accounts_read on public.loyalty_accounts
  for select using (has_restaurant_access(restaurant_id));

create policy loyalty_tx_read on public.loyalty_transactions
  for select using (has_restaurant_access(restaurant_id));
-- ملاحظة: لا سياسات INSERT/UPDATE/DELETE عمداً → الجدول append-only، والكتابة عبر الدوال فقط.
