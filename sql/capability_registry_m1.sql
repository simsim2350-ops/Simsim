-- ============================================================================
-- Platform Capability Registry (PCR) — M1: الأساس في قاعدة البيانات
-- ADR-40 · توسعة feature_flags القائمة (لا نظام موازٍ) — توافق خلفي 100%.
--
-- ما يفعله هذا الملف:
--   1) feature_categories                     (الفئات)
--   2) توسعة feature_flags                     (الكتالوج المُنمَّط الكامل)
--   3) feature_dependencies                    (التبعيات + dependency_type)
--   4) توسعة restaurant_feature_overrides      (value jsonb + audit)
--   5) feature_value / effective_features      (الحلّال الموحّد المُنمَّط)
--   6) إعادة تغليف has_feature                 (سلوك مطابق للقديم تماماً)
--
-- مبادئ الأمان: كل الدوال DEFINER + search_path=public. لا مساس بـ RLS المستأجرين.
-- التوافق الخلفي: enabled_global و enabled تبقيان القيمتين المعتمدتين لنوع feature.
-- الطبقات المؤجّلة (تُضاف لاحقاً بلا كسر): plan_features (M3) بين override والافتراضي.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) الفئات (Categories)
-- ---------------------------------------------------------------------------
create table if not exists public.feature_categories (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),  -- snake_case إلزامي
  name        text not null,
  name_en     text,
  description text,
  icon        text,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid
);
drop trigger if exists trg_feature_categories_updated on public.feature_categories;
create trigger trg_feature_categories_updated before update on public.feature_categories
  for each row execute function public.set_updated_at();

alter table public.feature_categories enable row level security;
drop policy if exists fcat_admin on public.feature_categories;
create policy fcat_admin on public.feature_categories for all
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 2) توسعة الكتالوج: feature_flags (الاسم الفيزيائي يبقى — ADR-40)
--    كل الأعمدة إضافية بقيَم افتراضية آمنة؛ الصفوف القائمة ترث type='feature'،
--    scope='restaurant', lifecycle='active', runtime='enabled', version=1
--    فيبقى has_feature مطابقاً 100% (enabled_global يبقى مصدر feature-default).
-- ---------------------------------------------------------------------------
alter table public.feature_flags
  add column if not exists name                 text,
  add column if not exists category_id          uuid references public.feature_categories(id) on delete set null,
  add column if not exists module               text,
  add column if not exists parent_key           text references public.feature_flags(key) on delete set null,
  add column if not exists kind                 text,      -- page/tab/card/button/modal/form/table/report/chart/action/api/webhook/integration/ai/mobile/pos/delivery/payment
  add column if not exists type                 text not null default 'feature'
      check (type in ('feature','limit','option','mode')),
  add column if not exists scope                text not null default 'restaurant'
      check (scope in ('platform','restaurant','user')),
  add column if not exists default_value        jsonb,     -- الافتراضي لأنواع limit/option/mode (feature يبقى على enabled_global)
  add column if not exists allowed_values       jsonb,     -- لأنواع mode (المجموعة المسموحة)
  add column if not exists metric               text,      -- لأنواع limit (products/branches/users/storage_mb/api_calls/ai_tokens...)
  add column if not exists unit                 text,      -- لأنواع limit (count/mb/seconds/tokens...)
  add column if not exists lifecycle_status     text not null default 'active'
      check (lifecycle_status in ('draft','active','deprecated','archived')),
  add column if not exists runtime_status       text not null default 'enabled'
      check (runtime_status in ('enabled','disabled','beta','preview')),
  add column if not exists version              int  not null default 1,
  add column if not exists compatibility_version text,
  add column if not exists supersedes           text references public.feature_flags(key) on delete set null,
  add column if not exists deprecated           boolean not null default false,
  add column if not exists icon                 text,
  add column if not exists upgrade_message      text,
  add column if not exists sort_order           int  not null default 0,
  add column if not exists tags                 text[] not null default '{}',
  add column if not exists required_permissions text[] not null default '{}',
  add column if not exists updated_at           timestamptz not null default now(),
  add column if not exists created_by           uuid,
  add column if not exists updated_by           uuid;

-- قيد التسمية snake_case على المفتاح (يُطبَّق على الصفوف القائمة والجديدة).
-- ملاحظة: مفاتيح feature_flags الحالية يجب أن تكون snake_case أصلاً (تُراجَع قبل التنفيذ).
alter table public.feature_flags drop constraint if exists ff_key_snake_case;
alter table public.feature_flags add constraint ff_key_snake_case
  check (key ~ '^[a-z][a-z0-9_]*(@[0-9]+)?$');   -- يسمح بلاحقة الإصدار مثل online_orders@2

drop trigger if exists trg_feature_flags_updated on public.feature_flags;
create trigger trg_feature_flags_updated before update on public.feature_flags
  for each row execute function public.set_updated_at();

create index if not exists idx_ff_category  on public.feature_flags(category_id);
create index if not exists idx_ff_parent    on public.feature_flags(parent_key);
create index if not exists idx_ff_module    on public.feature_flags(module);

-- ---------------------------------------------------------------------------
-- 3) التبعيات (Dependencies) — required / optional / conflicts
-- ---------------------------------------------------------------------------
create table if not exists public.feature_dependencies (
  id              uuid primary key default gen_random_uuid(),
  feature_key     text not null references public.feature_flags(key) on delete cascade,
  depends_on_key  text not null references public.feature_flags(key) on delete cascade,
  dependency_type text not null default 'required'
      check (dependency_type in ('required','optional','conflicts')),
  created_at      timestamptz not null default now(),
  created_by      uuid,
  unique (feature_key, depends_on_key, dependency_type),
  check (feature_key <> depends_on_key)          -- لا تعتمد الميزة على نفسها
);
create index if not exists idx_fdep_feature on public.feature_dependencies(feature_key);
create index if not exists idx_fdep_dep     on public.feature_dependencies(depends_on_key);

alter table public.feature_dependencies enable row level security;
drop policy if exists fdep_admin on public.feature_dependencies;
create policy fdep_admin on public.feature_dependencies for all
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 4) توسعة override لكل مطعم: value jsonb (لأنواع limit/option/mode) + audit
--    enabled (boolean) يبقى مصدر override لنوع feature — توافق خلفي.
-- ---------------------------------------------------------------------------
alter table public.restaurant_feature_overrides
  add column if not exists value      jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid;

-- enabled كان NOT NULL؛ نجعله NULLable حتى تُستخدَم value وحدها لأنواع غير feature.
alter table public.restaurant_feature_overrides alter column enabled drop not null;

drop trigger if exists trg_rfo_updated on public.restaurant_feature_overrides;
create trigger trg_rfo_updated before update on public.restaurant_feature_overrides
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5) الحلّال الموحّد المُنمَّط: feature_value(restaurant, key) → jsonb
--    سلسلة الحسم: override المطعم ← [قيمة الباقة: تُضاف في M3] ← الافتراضي العام.
--    النوع feature: يُقرأ من enabled/enabled_global (توافق خلفي). غيره: value/default_value.
-- ---------------------------------------------------------------------------
create or replace function public.feature_value(p_restaurant_id uuid, p_key text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  f record;
  o record;
  v_default  jsonb;
  v_override jsonb;
begin
  select * into f from public.feature_flags where key = p_key;
  if not found then return null; end if;

  -- الافتراضي العام حسب النوع
  v_default := case when f.type = 'feature' then to_jsonb(f.enabled_global) else f.default_value end;

  -- override لكل مطعم
  select * into o from public.restaurant_feature_overrides
    where key = p_key and restaurant_id = p_restaurant_id;
  if found then
    v_override := case when f.type = 'feature' then to_jsonb(o.enabled) else o.value end;
  else
    v_override := null;
  end if;

  -- M3: تُدرج قيمة الباقة هنا بين v_override و v_default عبر coalesce.
  return coalesce(v_override, v_default);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) إعادة تغليف has_feature — سلوك مطابق للقديم تماماً (مُثبَت رياضياً):
--    قديم = coalesce(override.enabled, enabled_global, false)
--    جديد = (feature_value == true)  ⇔  نفس النتيجة لكل الحالات (override/عام/غير موجود).
--    التوقيع يبقى كما هو، والمنح لـ anon/authenticated يبقى (منيو الزبون يستخدمه).
-- ---------------------------------------------------------------------------
create or replace function public.has_feature(p_restaurant_id uuid, p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.feature_value(p_restaurant_id, p_key) = to_jsonb(true), false);
$$;

-- ---------------------------------------------------------------------------
-- 7) effective_features(restaurant) → jsonb — تحميل واحد لكل القدرات وقيَمها
--    يُستدعى من authStore عند الدخول (نمط ADR-13: صفر استعلام أثناء التفاعل).
--    مبوّب: has_restaurant_access (المالك/الموظف) أو مشرف المنصّة. المؤرشفة تُستبعَد.
-- ---------------------------------------------------------------------------
create or replace function public.effective_features(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.has_restaurant_access(p_restaurant_id) or public.is_platform_admin()) then
    raise exception 'access denied';
  end if;
  return (
    select coalesce(jsonb_object_agg(f.key, jsonb_build_object(
      'value',            public.feature_value(p_restaurant_id, f.key),
      'type',             f.type,
      'scope',            f.scope,
      'kind',             f.kind,
      'parent_key',       f.parent_key,
      'lifecycle_status', f.lifecycle_status,
      'runtime_status',   f.runtime_status,
      'name',             f.name,
      'upgrade_message',  f.upgrade_message
    )), '{}'::jsonb)
    from public.feature_flags f
    where f.lifecycle_status <> 'archived'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) الأذونات (Grants) — بنفس نمط has_feature القائم
-- ---------------------------------------------------------------------------
grant  execute on function public.feature_value(uuid, text)      to anon, authenticated;
grant  execute on function public.has_feature(uuid, text)        to anon, authenticated;
grant  execute on function public.effective_features(uuid)       to authenticated;
revoke execute on function public.effective_features(uuid)       from anon;

-- ============================================================================
-- نهاية M1. لا بذر للكتالوج هنا (ذلك M2 عبر Manifest + حارس CI).
-- ============================================================================
