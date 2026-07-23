-- ========== F1.1: سجلّات الأحداث (Event Ledgers) — التقاط التاريخ الذي لا يُستدرك ==========
-- جدولان Append-only (لا تعديل/حذف) + Triggers تلتقط كل تغيير تلقائياً + Backfill للقائم.
-- MRR المساهِم = الاشتراكات النشطة/المتأخّرة فقط (active/past_due)؛ الشهري=amount، السنوي=amount/12.
-- RLS: قراءة المشرف فقط؛ الكتابة حصراً عبر Triggers (DEFINER). idempotent (backfill بحارس NOT EXISTS).

-- دالة MRR المساهِم (قابلة للضبط)
create or replace function public._sub_mrr(p_amount numeric, p_cycle text, p_status text)
returns numeric language sql immutable set search_path = public as $$
  select case when p_status in ('active','past_due')
              then round(coalesce(p_amount,0) / case when p_cycle = 'yearly' then 12 else 1 end, 2)
              else 0 end;
$$;

-- 1) سجلّ أحداث الاشتراكات
create table if not exists public.subscription_events (
  id              bigint generated always as identity primary key,
  restaurant_id   uuid not null,
  subscription_id uuid,
  event_type      text not null,   -- created / plan_changed / status_changed / canceled / amount_changed
  old_plan_id     uuid, new_plan_id uuid,
  old_status      text, new_status text,
  mrr_before      numeric(12,2) not null default 0,
  mrr_after       numeric(12,2) not null default 0,
  mrr_delta       numeric(12,2) not null default 0,
  source          text not null default 'trigger',
  created_at      timestamptz not null default now()
);
create index if not exists idx_sub_events_rest on public.subscription_events (restaurant_id, created_at desc);
create index if not exists idx_sub_events_time on public.subscription_events (created_at);
alter table public.subscription_events enable row level security;
create policy sub_events_admin_select on public.subscription_events for select using (public.is_platform_admin());

-- 2) سجلّ أحداث الفواتير
create table if not exists public.invoice_events (
  id             bigint generated always as identity primary key,
  restaurant_id  uuid not null,
  invoice_id     uuid,
  event_type     text not null,   -- issued / paid / voided / status_changed
  amount         numeric(12,2),
  status_before  text, status_after text,
  source         text not null default 'trigger',
  created_at     timestamptz not null default now()
);
create index if not exists idx_inv_events_rest on public.invoice_events (restaurant_id, created_at desc);
create index if not exists idx_inv_events_time on public.invoice_events (created_at);
alter table public.invoice_events enable row level security;
create policy inv_events_admin_select on public.invoice_events for select using (public.is_platform_admin());

-- 3) Trigger أحداث الاشتراكات (DEFINER ليكتب مهما كان المُستدعي)
create or replace function public.trg_subscription_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_old numeric := 0; v_new numeric := 0; v_type text;
begin
  if TG_OP = 'INSERT' then
    v_new := public._sub_mrr(NEW.amount, NEW.billing_cycle, NEW.status);
    insert into subscription_events(restaurant_id, subscription_id, event_type, new_plan_id, new_status, mrr_before, mrr_after, mrr_delta)
    values (NEW.restaurant_id, NEW.id, 'created', NEW.plan_id, NEW.status, 0, v_new, v_new);
    return NEW;
  end if;
  -- UPDATE: سجّل فقط عند تغيّر ذي معنى
  if OLD.plan_id is distinct from NEW.plan_id or OLD.status is distinct from NEW.status
     or OLD.amount is distinct from NEW.amount or OLD.billing_cycle is distinct from NEW.billing_cycle then
    v_old := public._sub_mrr(OLD.amount, OLD.billing_cycle, OLD.status);
    v_new := public._sub_mrr(NEW.amount, NEW.billing_cycle, NEW.status);
    v_type := case
      when NEW.status = 'canceled' and OLD.status <> 'canceled' then 'canceled'
      when OLD.plan_id is distinct from NEW.plan_id then 'plan_changed'
      when OLD.status is distinct from NEW.status then 'status_changed'
      else 'amount_changed' end;
    insert into subscription_events(restaurant_id, subscription_id, event_type, old_plan_id, new_plan_id, old_status, new_status, mrr_before, mrr_after, mrr_delta)
    values (NEW.restaurant_id, NEW.id, v_type, OLD.plan_id, NEW.plan_id, OLD.status, NEW.status, v_old, v_new, v_new - v_old);
  end if;
  return NEW;
end; $$;
drop trigger if exists trg_subscriptions_events on public.subscriptions;
create trigger trg_subscriptions_events after insert or update on public.subscriptions
  for each row execute function public.trg_subscription_event();

-- 4) Trigger أحداث الفواتير
create or replace function public.trg_invoice_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_type text;
begin
  if TG_OP = 'INSERT' then
    insert into invoice_events(restaurant_id, invoice_id, event_type, amount, status_after)
    values (NEW.restaurant_id, NEW.id, 'issued', NEW.total, NEW.status);
    return NEW;
  end if;
  if OLD.status is distinct from NEW.status then
    v_type := case NEW.status when 'paid' then 'paid' when 'void' then 'voided' else 'status_changed' end;
    insert into invoice_events(restaurant_id, invoice_id, event_type, amount, status_before, status_after)
    values (NEW.restaurant_id, NEW.id, v_type, NEW.total, OLD.status, NEW.status);
  end if;
  return NEW;
end; $$;
drop trigger if exists trg_invoices_events on public.invoices;
create trigger trg_invoices_events after insert or update on public.invoices
  for each row execute function public.trg_invoice_event();

-- 5) Backfill للقائم (idempotent — يتخطّى لو سبق) بتواريخها الفعلية
insert into public.subscription_events(restaurant_id, subscription_id, event_type, new_plan_id, new_status, mrr_before, mrr_after, mrr_delta, source, created_at)
select s.restaurant_id, s.id, 'created', s.plan_id, s.status, 0,
       public._sub_mrr(s.amount, s.billing_cycle, s.status), public._sub_mrr(s.amount, s.billing_cycle, s.status),
       'backfill', coalesce(s.created_at, now())
from public.subscriptions s
where not exists (select 1 from public.subscription_events e where e.subscription_id = s.id);

insert into public.invoice_events(restaurant_id, invoice_id, event_type, amount, status_after, source, created_at)
select i.restaurant_id, i.id, 'issued', i.total, 'open', 'backfill', i.issued_at
from public.invoices i
where not exists (select 1 from public.invoice_events e where e.invoice_id = i.id and e.event_type = 'issued');

insert into public.invoice_events(restaurant_id, invoice_id, event_type, amount, status_before, status_after, source, created_at)
select i.restaurant_id, i.id, 'paid', i.total, 'open', 'paid', 'backfill', i.paid_at
from public.invoices i
where i.status = 'paid' and i.paid_at is not null
  and not exists (select 1 from public.invoice_events e where e.invoice_id = i.id and e.event_type = 'paid');
