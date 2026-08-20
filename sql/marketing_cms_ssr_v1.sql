-- ============================================================================
-- Simsim Marketing CMS + SSR — v1
-- نطاق: الموقع التسويقي فقط. لا يلمس جداول المطاعم أو الطلبات أو المنيو.
-- ============================================================================

begin;

-- 1) صفحات ثابتة الهوية ومراجعاتها القابلة للنشر.
create table if not exists public.marketing_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  template text not null default 'marketing',
  published_revision_id uuid,
  draft_revision_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint marketing_pages_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table if not exists public.marketing_page_revisions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.marketing_pages(id) on delete cascade,
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  revision_number integer not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'scheduled', 'archived')),
  title text not null,
  description text,
  seo jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  scheduled_for timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  constraint marketing_revisions_unique_number unique (page_id, locale, revision_number),
  constraint marketing_revisions_schedule check (
    (status = 'scheduled' and scheduled_for is not null)
    or (status <> 'scheduled')
  )
);

alter table public.marketing_pages
  drop constraint if exists marketing_pages_published_revision_fkey,
  add constraint marketing_pages_published_revision_fkey
    foreign key (published_revision_id) references public.marketing_page_revisions(id) on delete set null,
  drop constraint if exists marketing_pages_draft_revision_fkey,
  add constraint marketing_pages_draft_revision_fkey
    foreign key (draft_revision_id) references public.marketing_page_revisions(id) on delete set null;

create table if not exists public.marketing_sections (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.marketing_page_revisions(id) on delete cascade,
  section_type text not null,
  content jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  analytics_id text,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint marketing_sections_type_format check (section_type ~ '^[A-Z][A-Z0-9_]{1,62}$'),
  constraint marketing_sections_analytics_id_format check (analytics_id is null or analytics_id ~ '^[a-z][a-z0-9-]{2,62}$'),
  constraint marketing_sections_unique_sort unique (revision_id, sort_order)
);

-- 2) إعدادات عامة ذات مسودة ونسخة منشورة، مستقلة لكل لغة.
create table if not exists public.marketing_site_settings (
  locale text primary key check (locale in ('ar', 'en')),
  published_revision_id uuid,
  draft_revision_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.marketing_site_settings_revisions (
  id uuid primary key default gen_random_uuid(),
  locale text not null references public.marketing_site_settings(locale) on delete cascade,
  revision_number integer not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'scheduled', 'archived')),
  data jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  scheduled_for timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  constraint marketing_settings_revisions_unique_number unique (locale, revision_number),
  constraint marketing_settings_revisions_schedule check (
    (status = 'scheduled' and scheduled_for is not null)
    or (status <> 'scheduled')
  )
);

alter table public.marketing_site_settings
  drop constraint if exists marketing_settings_published_revision_fkey,
  add constraint marketing_settings_published_revision_fkey
    foreign key (published_revision_id) references public.marketing_site_settings_revisions(id) on delete set null,
  drop constraint if exists marketing_settings_draft_revision_fkey,
  add constraint marketing_settings_draft_revision_fkey
    foreign key (draft_revision_id) references public.marketing_site_settings_revisions(id) on delete set null;

-- 3) مكتبة وسائط وPreview tokens لا تُعرض للعامة عبر Data API.
create table if not exists public.marketing_media (
  id uuid primary key default gen_random_uuid(),
  bucket text not null default 'marketing-media',
  object_path text not null,
  mime_type text not null,
  byte_size bigint,
  width integer,
  height integer,
  alt_text jsonb not null default '{}'::jsonb,
  caption jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint marketing_media_object_unique unique (bucket, object_path),
  constraint marketing_media_dimensions check ((width is null or width > 0) and (height is null or height > 0)),
  constraint marketing_media_size check (byte_size is null or byte_size >= 0)
);

create table if not exists public.marketing_preview_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  page_revision_id uuid references public.marketing_page_revisions(id) on delete cascade,
  settings_revision_id uuid references public.marketing_site_settings_revisions(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint marketing_preview_target check (num_nonnulls(page_revision_id, settings_revision_id) = 1),
  constraint marketing_preview_future_expiry check (expires_at > created_at)
);

-- 4) فهارس مسار القراءة العامة ومسارات لوحة الإدارة.
create index if not exists idx_marketing_revisions_published
  on public.marketing_page_revisions (page_id, locale, published_at desc)
  where status = 'published';
create index if not exists idx_marketing_revisions_scheduled
  on public.marketing_page_revisions (scheduled_for)
  where status = 'scheduled';
create index if not exists idx_marketing_sections_revision_order
  on public.marketing_sections (revision_id, sort_order);
create index if not exists idx_marketing_settings_revisions_published
  on public.marketing_site_settings_revisions (locale, published_at desc)
  where status = 'published';
create index if not exists idx_marketing_preview_tokens_expiry
  on public.marketing_preview_tokens (expires_at);
create index if not exists idx_marketing_media_created
  on public.marketing_media (created_at desc);

-- 5) تحديث timestamps وسجل تغييرات المحتوى داخل سجل المنصة القائم.
create or replace function public.marketing_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.marketing_write_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  target uuid;
  old_row jsonb;
  new_row jsonb;
begin
  if actor_id is null then
    return coalesce(new, old);
  end if;

  actor_role := public.platform_admin_role();

  if actor_role is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    old_row := to_jsonb(old);
    new_row := null;
  else
    old_row := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
    new_row := to_jsonb(new);
  end if;

  -- بعض كيانات CMS (مثل marketing_site_settings) تستخدم مفتاحًا نصيًا؛
  -- سجل المنصة يقبل target_id من نوع UUID، لذا لا نكتب إلا المعرفات UUID الصالحة.
  target := nullif(coalesce(new_row ->> 'id', old_row ->> 'id'), '')::uuid;

  insert into public.platform_audit_logs (
    admin_user_id, role, action, target_type, target_id, old_value, new_value, metadata
  ) values (
    actor_id, actor_role, 'marketing.' || lower(tg_op), tg_table_name, target, old_row, new_row,
    jsonb_build_object('schema', tg_table_schema)
  );

  return coalesce(new, old);
end;
$$;

-- لا تسجّل Preview token كي لا يتوسع سجل التدقيق ببيانات صلاحيات مؤقتة.
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'marketing_pages',
    'marketing_page_revisions',
    'marketing_sections',
    'marketing_site_settings',
    'marketing_site_settings_revisions',
    'marketing_media'
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || tbl || '_updated_at', tbl);
    execute format('create trigger %I before update on public.%I for each row execute function public.marketing_set_updated_at()', 'trg_' || tbl || '_updated_at', tbl);
    execute format('drop trigger if exists %I on public.%I', 'trg_' || tbl || '_audit', tbl);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.marketing_write_audit()', 'trg_' || tbl || '_audit', tbl);
  end loop;
end;
$$;

-- 6) RLS: لا وصول مباشر لبيانات CMS إلا للمشرف النشط. القراءة العامة تتم عبر RPCs أدناه فقط.
alter table public.marketing_pages enable row level security;
alter table public.marketing_page_revisions enable row level security;
alter table public.marketing_sections enable row level security;
alter table public.marketing_site_settings enable row level security;
alter table public.marketing_site_settings_revisions enable row level security;
alter table public.marketing_media enable row level security;
alter table public.marketing_preview_tokens enable row level security;

do $$
declare
  tbl text;
  policy_name text;
begin
  foreach tbl in array array[
    'marketing_pages',
    'marketing_page_revisions',
    'marketing_sections',
    'marketing_site_settings',
    'marketing_site_settings_revisions',
    'marketing_media',
    'marketing_preview_tokens'
  ] loop
    policy_name := tbl || '_platform_admin_all';
    execute format('drop policy if exists %I on public.%I', policy_name, tbl);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin())',
      policy_name, tbl
    );
  end loop;
end;
$$;

-- 7) واجهة بيانات عامة محدودة: تعرض النسخة المنشورة فقط، بلا مسودات أو تاريخ تعديلات.
create or replace function public.marketing_public_page(
  p_slug text,
  p_locale text default 'ar'
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with page_revision as (
    select p.id as page_id, p.slug, r.id as revision_id, r.locale, r.title, r.description, r.seo, r.published_at
    from public.marketing_pages p
    join public.marketing_page_revisions r on r.id = p.published_revision_id
    where p.slug = p_slug
      and r.locale = p_locale
      and r.status = 'published'
      and r.published_at <= now()
  ), site_settings as (
    select sr.data
    from public.marketing_site_settings s
    join public.marketing_site_settings_revisions sr on sr.id = s.published_revision_id
    where s.locale = p_locale
      and sr.status = 'published'
      and sr.published_at <= now()
    limit 1
  )
  select case when exists (select 1 from page_revision) then jsonb_build_object(
    'page', (select jsonb_build_object(
      'id', page_id, 'slug', slug, 'revisionId', revision_id, 'locale', locale,
      'title', title, 'description', description, 'seo', seo, 'publishedAt', published_at
    ) from page_revision),
    'settings', coalesce((select data from site_settings), '{}'::jsonb),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'type', s.section_type, 'content', s.content, 'settings', s.settings,
        'analyticsId', s.analytics_id, 'sortOrder', s.sort_order, 'isVisible', s.is_visible
      ) order by s.sort_order)
      from public.marketing_sections s
      join page_revision r on r.revision_id = s.revision_id
      where s.is_visible = true
    ), '[]'::jsonb)
  ) else null end;
$$;

create or replace function public.marketing_public_plans(p_locale text default 'ar')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'billingCycle', p.billing_cycle,
    'price', p.price,
    'sortOrder', p.sort_order,
    'features', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', pf.feature_key,
        'name', coalesce(ff.name, pf.feature_key),
        'included', pf.is_included,
        'value', pf.value
      ) order by pf.feature_key)
      from public.plan_features pf
      left join public.feature_flags ff on ff.key = pf.feature_key
      where pf.plan_id = p.id and pf.is_included = true
    ), '[]'::jsonb)
  ) order by p.sort_order, p.name), '[]'::jsonb)
  from public.plans p
  where p.is_active = true;
$$;

revoke all on function public.marketing_public_page(text, text) from public;
revoke all on function public.marketing_public_plans(text) from public;
grant execute on function public.marketing_public_page(text, text) to anon, authenticated;
grant execute on function public.marketing_public_plans(text) to anon, authenticated;

-- دوال داخلية للمشغلات فقط؛ لا يجب أن تصل إليها واجهة RPC مطلقًا.
revoke all on function public.marketing_set_updated_at() from public, anon, authenticated;
revoke all on function public.marketing_write_audit() from public, anon, authenticated;

commit;
