-- ============================================================================
-- Analytics Core Layer — M1: Event Store + عقد المنتِج (ADR-42)
-- ============================================================================
-- ناقل أحداث عام (append-only) + قائمة أنواع مسموحة (حوكمة) + دالتا إدخال:
--   • emit_event()  — داخلية (منتجون داخل القاعدة: triggers/RPC). ليست لـanon.
--   • track_event() — آمنة لـanon (أحداث العميل فقط): allowlist + throttle + fail-open.
-- بلا أي مستهلك/تجميع هنا (يأتي في M3) وبلا أي منتِج فعلي (M2) — صفر تغيير سلوكي.
-- ضمان: الإدخال لا يكسر فعل المستخدم أبداً (كل الأخطاء تُبتلع → drop صامت، fail-open).
-- ============================================================================

-- 1) مخزن الأحداث (مهيّأ للتقسيم الشهري لاحقاً — لا قيد فريد يعبر التقسيم)
create table if not exists public.analytics_events (
  event_id      uuid primary key default gen_random_uuid(),
  occurred_at   timestamptz not null default now(),
  ingested_at   timestamptz not null default now(),
  scope         text not null check (scope in ('platform','restaurant','customer')),
  restaurant_id uuid,
  branch_id     uuid,
  actor_type    text not null default 'anon' check (actor_type in ('system','owner','staff','customer','anon')),
  session_id    text,
  event_type    text not null,
  entity_type   text,
  entity_id     text,
  props         jsonb not null default '{}',
  source_module text,
  dedupe_key    text
);
create index if not exists idx_ae_scope_type_time on public.analytics_events (scope, event_type, occurred_at desc);
create index if not exists idx_ae_restaurant_time on public.analytics_events (restaurant_id, occurred_at desc);
create unique index if not exists uq_ae_dedupe on public.analytics_events (dedupe_key) where dedupe_key is not null;

alter table public.analytics_events enable row level security;
-- القراءة: المشرف فقط الآن (قراءة المطعم/العميل تُضاف مع لوحاتها لاحقاً). الإدخال حصراً عبر الدوال DEFINER.
drop policy if exists ae_admin_select on public.analytics_events;
create policy ae_admin_select on public.analytics_events for select using (public.is_platform_admin());

-- 2) قائمة أنواع الأحداث المسموحة (حوكمة: منع أحداث عشوائية) — يديرها المشرف
create table if not exists public.analytics_event_types (
  event_type  text primary key,
  scope       text not null check (scope in ('platform','restaurant','customer')),
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.analytics_event_types enable row level security;
drop policy if exists aet_admin_all on public.analytics_event_types;
create policy aet_admin_all on public.analytics_event_types for all
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- بذر أنواع أحداث العميل الأولية (ينتجها M2) — idempotent
insert into public.analytics_event_types (event_type, scope, description) values
  ('qr.scanned',          'customer', 'مسح رمز QR لفتح المنيو'),
  ('menu.viewed',         'customer', 'فتح المنيو'),
  ('menu.product_viewed', 'customer', 'فتح نافذة تفاصيل منتج'),
  ('cart.item_added',     'customer', 'إضافة صنف للسلة'),
  ('cart.viewed',         'customer', 'فتح السلة'),
  ('checkout.started',    'customer', 'بدء إتمام الطلب'),
  ('order.placed',        'customer', 'إتمام الطلب')
on conflict (event_type) do nothing;

-- 3) الإدخال الداخلي (منتجون داخل القاعدة). fail-open: أي خطأ → null بلا كسر.
create or replace function public.emit_event(
  p_scope text, p_event_type text, p_restaurant_id uuid default null,
  p_branch_id uuid default null, p_actor_type text default 'system',
  p_session_id text default null, p_entity_type text default null,
  p_entity_id text default null, p_props jsonb default '{}',
  p_source_module text default null, p_dedupe_key text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  -- نوع غير مسجَّل/غير نشط → إسقاط صامت (حوكمة)
  if not exists (select 1 from analytics_event_types t where t.event_type = p_event_type and t.is_active) then
    return null;
  end if;
  insert into analytics_events(scope, event_type, restaurant_id, branch_id, actor_type,
    session_id, entity_type, entity_id, props, source_module, dedupe_key)
  values (p_scope, p_event_type, p_restaurant_id, p_branch_id, coalesce(p_actor_type,'system'),
    p_session_id, p_entity_type, p_entity_id, coalesce(p_props,'{}'::jsonb), p_source_module, p_dedupe_key)
  on conflict (dedupe_key) where dedupe_key is not null do nothing
  returning event_id into v_id;
  return v_id;
exception when others then
  return null; -- ضمان عدم الكسر: فشل التحليلات لا يعطّل المنتِج أبداً
end; $$;
revoke execute on function public.emit_event(text,text,uuid,uuid,text,text,text,text,jsonb,text,text) from public, anon, authenticated;

-- 4) إدخال أحداث العميل (آمن لـanon): customer-scope فقط + allowlist + throttle + fail-open
create or replace function public.track_event(
  p_event_type text, p_restaurant_id uuid, p_session_id text,
  p_branch_id uuid default null, p_entity_type text default null,
  p_entity_id text default null, p_props jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_session_id is null or p_session_id = '' then return; end if;
  -- نوع مسموح ونشط ومن نطاق العميل حصراً
  if not exists (select 1 from analytics_event_types t
                 where t.event_type = p_event_type and t.is_active and t.scope = 'customer') then
    return;
  end if;
  -- throttle خفيف: أقصى 240 حدثاً للجلسة/الدقيقة
  if (select count(*) from analytics_events e
      where e.session_id = p_session_id and e.occurred_at > now() - interval '1 minute') >= 240 then
    return;
  end if;
  -- سقف حجم props (منع إساءة)
  if pg_column_size(coalesce(p_props,'{}'::jsonb)) > 4096 then p_props := '{}'::jsonb; end if;
  perform emit_event('customer', p_event_type, p_restaurant_id, p_branch_id, 'customer',
    p_session_id, p_entity_type, p_entity_id, coalesce(p_props,'{}'::jsonb), 'menu', null);
exception when others then
  return; -- fail-open
end; $$;
revoke execute on function public.track_event(text,uuid,text,uuid,text,text,jsonb) from public;
grant  execute on function public.track_event(text,uuid,text,uuid,text,text,jsonb) to anon, authenticated;
