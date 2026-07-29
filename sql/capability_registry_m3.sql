-- ============================================================================
-- Platform Capability Registry (PCR) — M3: ربط الباقات + قواعد الترقية (ADR-40)
-- ============================================================================
-- يملأ الفجوة الكبرى: plans.features كان نصّاً حرّاً فقط. الآن ربط حقيقي باقة↔قدرة.
--
-- ما يفعله:
--   1) plan_features (plan_id ↔ feature_key + is_included + value jsonb)
--   2) إدراج «طبقة الباقة» في feature_value: override ← الباقة ← الافتراضي
--   3) feature_upgrade_options(key) — أساس رسالة الترقية (M4)
--
-- التوافق الخلفي: بلا صفوف plan_features، طبقة الباقة تُرجع null → السلوك مطابق 100%
-- (has_feature وكل القيَم بلا تغيير حتى يُعرّف المالك ربط الباقات). محايد لنوع الباقة.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) plan_features — ربط القدرات بالباقات
--    is_included: هل القدرة ضمن الباقة (تفصل «ضمن الباقة» عن «قيمة الميزة» — ADR-40).
--    value jsonb: قيمة الحد/الوضع/الخيار للباقة (لنوع feature تُشتقّ من is_included).
-- ---------------------------------------------------------------------------
create table if not exists public.plan_features (
  plan_id     uuid not null references public.plans(id) on delete cascade,
  feature_key text not null references public.feature_flags(key) on delete cascade,
  is_included boolean not null default true,
  value       jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid,
  primary key (plan_id, feature_key)
);
create index if not exists idx_pf_feature on public.plan_features(feature_key);

drop trigger if exists trg_plan_features_updated on public.plan_features;
create trigger trg_plan_features_updated before update on public.plan_features
  for each row execute function public.set_updated_at();

alter table public.plan_features enable row level security;
drop policy if exists pf_admin on public.plan_features;
create policy pf_admin on public.plan_features for all
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 2) feature_value — إدراج طبقة الباقة في سلسلة الحسم
--    السلسلة: override المطعم ← قيمة الباقة (اشتراك المطعم النشط) ← الافتراضي العام.
--    الباقة النشطة = subscriptions.plan_id حيث status ∈ (active/trialing/past_due).
--    قاعدة is_included: feature → to_jsonb(is_included)؛ غيره → (included ? value : null).
--    بلا صفّ plan_features → لا مساهمة (null) → السلوك مطابق للسابق.
-- ---------------------------------------------------------------------------
create or replace function public.feature_value(p_restaurant_id uuid, p_key text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  f          record;
  o          record;
  pf         record;
  v_plan_id  uuid;
  v_default  jsonb;
  v_plan     jsonb;
  v_override jsonb;
begin
  select * into f from public.feature_flags where key = p_key;
  if not found then return null; end if;

  -- الافتراضي العام حسب النوع
  v_default := case when f.type = 'feature' then to_jsonb(f.enabled_global) else f.default_value end;

  -- طبقة الباقة (اشتراك المطعم النشط)
  select plan_id into v_plan_id from public.subscriptions
    where restaurant_id = p_restaurant_id
      and status in ('active','trialing','past_due')
    limit 1;
  if v_plan_id is not null then
    select * into pf from public.plan_features
      where plan_id = v_plan_id and feature_key = p_key;
    if found then
      v_plan := case
                  when f.type = 'feature' then to_jsonb(pf.is_included)
                  else (case when pf.is_included then pf.value else null end)
                end;
    end if;
  end if;

  -- طبقة override المطعم
  select * into o from public.restaurant_feature_overrides
    where key = p_key and restaurant_id = p_restaurant_id;
  if found then
    v_override := case when f.type = 'feature' then to_jsonb(o.enabled) else o.value end;
  end if;

  return coalesce(v_override, v_plan, v_default);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) feature_upgrade_options(key) — الباقات التي تمنح القدرة (أساس رسالة الترقية M4)
--    تُرجع الباقات المفعّلة التي تُضمّن القدرة، الأرخص أولاً. authenticated (جهة المطعم).
-- ---------------------------------------------------------------------------
create or replace function public.feature_upgrade_options(p_key text)
returns table (plan_id uuid, plan_name text, price numeric, billing_cycle text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.price, p.billing_cycle
  from public.plan_features pf
  join public.plans p on p.id = pf.plan_id
  where pf.feature_key = p_key and pf.is_included = true and p.is_active = true
  order by p.price asc, p.name asc;
$$;

-- ---------------------------------------------------------------------------
-- 4) الأذونات
-- ---------------------------------------------------------------------------
grant  execute on function public.feature_value(uuid, text)          to anon, authenticated;
grant  execute on function public.feature_upgrade_options(text)       to authenticated;
revoke execute on function public.feature_upgrade_options(text)       from public, anon;

-- ============================================================================
-- نهاية M3. لا بذر ربط باقات هنا (يُدار من لوحة الأدمن — M6 — أو بقرار منفصل).
-- ============================================================================
