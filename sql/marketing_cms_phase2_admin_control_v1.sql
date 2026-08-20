-- ============================================================================
-- Simsim Marketing CMS — Phase 2 Admin Control (Staging first)
-- يوسّع نظام Phase 1 فقط. لا يلمس الجداول التجارية أو الطلبات أو المنيو أو Auth.
-- ============================================================================

begin;

-- 1) حالة الصفحة: soft archive يحافظ على الصفحات والإصدارات بدلاً من حذفها بالخطأ.
alter table public.marketing_pages
  add column if not exists lifecycle_status text not null default 'active',
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

alter table public.marketing_pages
  drop constraint if exists marketing_pages_lifecycle_status_check,
  add constraint marketing_pages_lifecycle_status_check
    check (lifecycle_status in ('active', 'archived'));

create index if not exists idx_marketing_pages_lifecycle_slug
  on public.marketing_pages (lifecycle_status, slug);

-- 2) سجل تدقيق دلالي: يبقى platform_audit_logs هو المصدر الوحيد للتدقيق.
create or replace function public.marketing_audit_event(
  p_action text,
  p_target_type text,
  p_target_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin required';
  end if;
  if p_action !~ '^marketing\.[a-z0-9_]+$' or length(p_action) > 120 then
    raise exception 'invalid marketing audit action';
  end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'audit metadata must be an object';
  end if;

  select role into v_role
  from public.platform_admins
  where user_id = auth.uid() and is_active = true
  limit 1;

  insert into public.platform_audit_logs (
    admin_user_id, role, action, target_type, target_id, old_value, new_value, metadata
  ) values (
    auth.uid(), v_role, p_action, p_target_type, p_target_id, null, null,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

-- 3) أدوات تحقق صغيرة مشتركة.
create or replace function public.marketing_assert_supported_section_type(p_type text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_type not in (
    'HERO','PROBLEM','BENEFITS','STEPS','MENU_PREVIEW','FEATURES','TRUST','PRICING','FAQ','CTA',
    'VIDEO','IMAGE_TEXT','TESTIMONIALS','STATS','LOGOS','COMPARISON','CONTACT'
  ) then
    raise exception 'unsupported marketing section type: %', p_type;
  end if;
end;
$$;

-- لا تُنشئ مسودة ثانية عند فتح المحرر: يعاد فتح المسودة القائمة حتى لا يضيع عمل المحرر.
create or replace function public.marketing_create_draft(
  p_page_id uuid,
  p_locale text default 'ar'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source_revision_id uuid;
  v_existing_draft_id uuid;
  v_new_revision_id uuid;
  v_next_number integer;
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin required';
  end if;
  if p_locale not in ('ar', 'en') then
    raise exception 'unsupported locale';
  end if;
  if not exists (
    select 1 from public.marketing_pages where id = p_page_id and lifecycle_status = 'active'
  ) then
    raise exception 'active marketing page not found';
  end if;

  select pl.draft_revision_id
  into v_existing_draft_id
  from public.marketing_page_locales pl
  join public.marketing_page_revisions r on r.id = pl.draft_revision_id
  where pl.page_id = p_page_id and pl.locale = p_locale and r.status = 'draft';

  if v_existing_draft_id is not null then
    return v_existing_draft_id;
  end if;

  select coalesce(pl.draft_revision_id, pl.published_revision_id)
  into v_source_revision_id
  from public.marketing_page_locales pl
  where pl.page_id = p_page_id and pl.locale = p_locale;

  if v_source_revision_id is null then
    raise exception 'no source revision exists for page % locale %', p_page_id, p_locale;
  end if;

  select coalesce(max(revision_number), 0) + 1 into v_next_number
  from public.marketing_page_revisions
  where page_id = p_page_id and locale = p_locale;

  insert into public.marketing_page_revisions (
    page_id, locale, revision_number, status, title, description, seo, created_by, updated_by
  )
  select page_id, locale, v_next_number, 'draft', title, description, seo, auth.uid(), auth.uid()
  from public.marketing_page_revisions
  where id = v_source_revision_id
  returning id into v_new_revision_id;

  insert into public.marketing_sections (
    revision_id, section_type, content, settings, analytics_id, sort_order, is_visible, created_by, updated_by
  )
  select v_new_revision_id, section_type, content, settings, analytics_id, sort_order, is_visible, auth.uid(), auth.uid()
  from public.marketing_sections
  where revision_id = v_source_revision_id;

  insert into public.marketing_page_locales (page_id, locale, draft_revision_id, created_by, updated_by)
  values (p_page_id, p_locale, v_new_revision_id, auth.uid(), auth.uid())
  on conflict (page_id, locale) do update
  set draft_revision_id = excluded.draft_revision_id, updated_by = auth.uid();

  perform public.marketing_audit_event(
    'marketing.draft_created', 'marketing_page_revision', v_new_revision_id,
    jsonb_build_object('page_id', p_page_id, 'locale', p_locale, 'source_revision_id', v_source_revision_id)
  );
  return v_new_revision_id;
end;
$$;

-- 4) إدارة الصفحات: create / duplicate / archive / restore / unpublish / guarded delete.
create or replace function public.admin_create_marketing_page(
  p_slug text,
  p_title text,
  p_locale text default 'ar',
  p_description text default null,
  p_seo jsonb default '{}'::jsonb,
  p_template text default 'marketing'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_page_id uuid;
  v_revision_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin required';
  end if;
  if lower(trim(coalesce(p_slug, ''))) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'slug format is invalid';
  end if;
  if p_locale not in ('ar', 'en') then
    raise exception 'unsupported locale';
  end if;
  if length(trim(coalesce(p_title, ''))) = 0 or length(p_title) > 160 then
    raise exception 'title must be between 1 and 160 characters';
  end if;
  if jsonb_typeof(coalesce(p_seo, '{}'::jsonb)) <> 'object' then
    raise exception 'seo must be an object';
  end if;

  insert into public.marketing_pages (slug, template, created_by, updated_by)
  values (lower(trim(p_slug)), coalesce(nullif(trim(p_template), ''), 'marketing'), auth.uid(), auth.uid())
  returning id into v_page_id;

  insert into public.marketing_page_revisions (
    page_id, locale, revision_number, status, title, description, seo, created_by, updated_by
  ) values (
    v_page_id, p_locale, 1, 'draft', trim(p_title), nullif(trim(coalesce(p_description, '')), ''),
    coalesce(p_seo, '{}'::jsonb), auth.uid(), auth.uid()
  ) returning id into v_revision_id;

  insert into public.marketing_page_locales (page_id, locale, draft_revision_id, created_by, updated_by)
  values (v_page_id, p_locale, v_revision_id, auth.uid(), auth.uid());

  perform public.marketing_audit_event(
    'marketing.page_created', 'marketing_page', v_page_id,
    jsonb_build_object('slug', lower(trim(p_slug)), 'locale', p_locale, 'revision_id', v_revision_id)
  );
  return jsonb_build_object('pageId', v_page_id, 'revisionId', v_revision_id, 'slug', lower(trim(p_slug)));
end;
$$;

create or replace function public.admin_duplicate_marketing_page(
  p_source_page_id uuid,
  p_target_slug text,
  p_locale text default 'ar'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source_revision_id uuid;
  v_page_id uuid;
  v_revision_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin required';
  end if;
  if lower(trim(coalesce(p_target_slug, ''))) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'slug format is invalid';
  end if;
  if p_locale not in ('ar', 'en') then
    raise exception 'unsupported locale';
  end if;

  select coalesce(pl.draft_revision_id, pl.published_revision_id)
  into v_source_revision_id
  from public.marketing_pages p
  join public.marketing_page_locales pl on pl.page_id = p.id and pl.locale = p_locale
  where p.id = p_source_page_id and p.lifecycle_status = 'active';

  if v_source_revision_id is null then
    raise exception 'source page locale has no revision';
  end if;

  insert into public.marketing_pages (slug, template, created_by, updated_by)
  select lower(trim(p_target_slug)), template, auth.uid(), auth.uid()
  from public.marketing_pages where id = p_source_page_id
  returning id into v_page_id;

  insert into public.marketing_page_revisions (
    page_id, locale, revision_number, status, title, description, seo, created_by, updated_by
  )
  select v_page_id, locale, 1, 'draft', title || ' (نسخة)', description, seo, auth.uid(), auth.uid()
  from public.marketing_page_revisions where id = v_source_revision_id
  returning id into v_revision_id;

  insert into public.marketing_sections (
    revision_id, section_type, content, settings, analytics_id, sort_order, is_visible, created_by, updated_by
  )
  select v_revision_id, section_type, content, settings, analytics_id, sort_order, is_visible, auth.uid(), auth.uid()
  from public.marketing_sections where revision_id = v_source_revision_id;

  insert into public.marketing_page_locales (page_id, locale, draft_revision_id, created_by, updated_by)
  values (v_page_id, p_locale, v_revision_id, auth.uid(), auth.uid());

  perform public.marketing_audit_event(
    'marketing.page_duplicated', 'marketing_page', v_page_id,
    jsonb_build_object('source_page_id', p_source_page_id, 'locale', p_locale, 'revision_id', v_revision_id)
  );
  return jsonb_build_object('pageId', v_page_id, 'revisionId', v_revision_id, 'slug', lower(trim(p_target_slug)));
end;
$$;

create or replace function public.admin_archive_marketing_page(p_page_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin required';
  end if;
  update public.marketing_pages
  set lifecycle_status = 'archived', archived_at = now(), archived_by = auth.uid(), updated_by = auth.uid()
  where id = p_page_id and lifecycle_status = 'active';
  if not found then
    raise exception 'active marketing page not found';
  end if;
  perform public.marketing_audit_event('marketing.page_archived', 'marketing_page', p_page_id, '{}'::jsonb);
end;
$$;

create or replace function public.admin_restore_marketing_page(p_page_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin required';
  end if;
  update public.marketing_pages
  set lifecycle_status = 'active', archived_at = null, archived_by = null, updated_by = auth.uid()
  where id = p_page_id and lifecycle_status = 'archived';
  if not found then
    raise exception 'archived marketing page not found';
  end if;
  perform public.marketing_audit_event('marketing.page_restored', 'marketing_page', p_page_id, '{}'::jsonb);
end;
$$;

create or replace function public.admin_unpublish_marketing_page(
  p_page_id uuid,
  p_locale text default 'ar'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_published_revision_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin required';
  end if;
  if p_locale not in ('ar', 'en') then
    raise exception 'unsupported locale';
  end if;
  select published_revision_id into v_published_revision_id
  from public.marketing_page_locales
  where page_id = p_page_id and locale = p_locale
  for update;
  if v_published_revision_id is null then
    raise exception 'page locale is not published';
  end if;

  update public.marketing_page_locales
  set published_revision_id = null, updated_by = auth.uid()
  where page_id = p_page_id and locale = p_locale;
  update public.marketing_page_revisions
  set status = 'archived', archived_at = now(), updated_by = auth.uid()
  where id = v_published_revision_id and status = 'published';

  perform public.marketing_audit_event(
    'marketing.page_unpublished', 'marketing_page', p_page_id,
    jsonb_build_object('locale', p_locale, 'revision_id', v_published_revision_id)
  );
end;
$$;

create or replace function public.admin_delete_marketing_page(p_page_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin required';
  end if;
  if exists (
    select 1 from public.marketing_page_locales
    where page_id = p_page_id and published_revision_id is not null
  ) then
    raise exception 'unpublish the page before permanent deletion; archive is available instead';
  end if;
  delete from public.marketing_pages where id = p_page_id;
  if not found then
    raise exception 'marketing page not found';
  end if;
  perform public.marketing_audit_event('marketing.page_deleted', 'marketing_page', p_page_id, '{}'::jsonb);
end;
$$;

-- 5) قائمة الصفحات، الإصدارات، وتحسين حفظ المسودة دون السماح بأنواع عشوائية.
create or replace function public.admin_list_marketing_pages(p_locale text default 'ar')
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when public.is_platform_admin() then coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'slug', p.slug,
    'template', p.template,
    'lifecycleStatus', p.lifecycle_status,
    'archivedAt', p.archived_at,
    'locale', pl.locale,
    'publishedRevisionId', pl.published_revision_id,
    'draftRevisionId', pl.draft_revision_id,
    'publishedTitle', published.title,
    'draftTitle', draft.title,
    'revisionCount', coalesce(revisions.revision_count, 0),
    'updatedAt', greatest(coalesce(p.updated_at, '-infinity'::timestamptz), coalesce(published.updated_at, '-infinity'::timestamptz), coalesce(draft.updated_at, '-infinity'::timestamptz))
  ) order by p.lifecycle_status, p.slug), '[]'::jsonb)
  else '[]'::jsonb end
  from public.marketing_pages p
  left join public.marketing_page_locales pl on pl.page_id = p.id and pl.locale = p_locale
  left join public.marketing_page_revisions published on published.id = pl.published_revision_id
  left join public.marketing_page_revisions draft on draft.id = pl.draft_revision_id
  left join lateral (
    select count(*)::integer as revision_count
    from public.marketing_page_revisions r where r.page_id = p.id and r.locale = p_locale
  ) revisions on true;
$$;

create or replace function public.admin_list_marketing_revisions(
  p_page_id uuid,
  p_locale text default 'ar'
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when public.is_platform_admin() then coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'revisionNumber', r.revision_number, 'status', r.status,
    'title', r.title, 'publishedAt', r.published_at, 'scheduledFor', r.scheduled_for,
    'archivedAt', r.archived_at, 'createdAt', r.created_at, 'updatedAt', r.updated_at
  ) order by r.revision_number desc), '[]'::jsonb) else '[]'::jsonb end
  from public.marketing_page_revisions r
  where r.page_id = p_page_id and r.locale = p_locale;
$$;

create or replace function public.admin_save_marketing_draft(
  p_revision_id uuid,
  p_title text,
  p_description text,
  p_seo jsonb,
  p_sections jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invalid_sections integer;
  v_page_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin required';
  end if;
  if length(trim(coalesce(p_title, ''))) = 0 or length(p_title) > 160 then
    raise exception 'title must be between 1 and 160 characters';
  end if;
  if p_description is not null and length(p_description) > 320 then
    raise exception 'description exceeds 320 characters';
  end if;
  if jsonb_typeof(p_seo) <> 'object' or jsonb_typeof(p_sections) <> 'array' then
    raise exception 'seo must be an object and sections must be an array';
  end if;
  if jsonb_array_length(p_sections) > 30 then
    raise exception 'page cannot contain more than 30 sections';
  end if;

  select count(*) into v_invalid_sections
  from jsonb_array_elements(p_sections) section
  where jsonb_typeof(section) <> 'object'
     or coalesce(section->>'type', '') not in (
       'HERO','PROBLEM','BENEFITS','STEPS','MENU_PREVIEW','FEATURES','TRUST','PRICING','FAQ','CTA',
       'VIDEO','IMAGE_TEXT','TESTIMONIALS','STATS','LOGOS','COMPARISON','CONTACT'
     )
     or jsonb_typeof(section->'content') <> 'object'
     or coalesce((section->>'sortOrder')::integer, -1) < 0
     or coalesce((section->>'isVisible')::boolean, true) is null;
  if v_invalid_sections > 0 then
    raise exception 'one or more sections are malformed or unsupported';
  end if;

  select page_id into v_page_id
  from public.marketing_page_revisions
  where id = p_revision_id and status = 'draft';
  if v_page_id is null then
    raise exception 'only draft revisions can be edited';
  end if;
  if not exists (select 1 from public.marketing_pages where id = v_page_id and lifecycle_status = 'active') then
    raise exception 'cannot edit an archived page';
  end if;

  update public.marketing_page_revisions
  set title = trim(p_title), description = nullif(trim(coalesce(p_description, '')), ''), seo = p_seo, updated_by = auth.uid()
  where id = p_revision_id;

  delete from public.marketing_sections where revision_id = p_revision_id;
  insert into public.marketing_sections (revision_id, section_type, content, settings, analytics_id, sort_order, is_visible, created_by, updated_by)
  select
    p_revision_id, section->>'type', section->'content', coalesce(section->'settings', '{}'::jsonb),
    nullif(section->>'analyticsId', ''), (section->>'sortOrder')::integer,
    coalesce((section->>'isVisible')::boolean, true), auth.uid(), auth.uid()
  from jsonb_array_elements(p_sections) section;

  perform public.marketing_audit_event(
    'marketing.draft_saved', 'marketing_page_revision', p_revision_id,
    jsonb_build_object('page_id', v_page_id, 'section_count', jsonb_array_length(p_sections))
  );
end;
$$;

-- 6) إعدادات عامة منفصلة حسب اللغة، بمراجعات ومسودات ونشر حقيقي.
create or replace function public.admin_open_marketing_settings_draft(p_locale text default 'ar')
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing_draft uuid;
  v_source_revision uuid;
  v_revision uuid;
  v_next_number integer;
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin required';
  end if;
  if p_locale not in ('ar', 'en') then
    raise exception 'unsupported locale';
  end if;

  insert into public.marketing_site_settings (locale, created_by, updated_by)
  values (p_locale, auth.uid(), auth.uid())
  on conflict (locale) do nothing;

  select s.draft_revision_id into v_existing_draft
  from public.marketing_site_settings s
  join public.marketing_site_settings_revisions r on r.id = s.draft_revision_id
  where s.locale = p_locale and r.status = 'draft';
  if v_existing_draft is not null then
    return v_existing_draft;
  end if;

  select coalesce(draft_revision_id, published_revision_id) into v_source_revision
  from public.marketing_site_settings where locale = p_locale;
  select coalesce(max(revision_number), 0) + 1 into v_next_number
  from public.marketing_site_settings_revisions where locale = p_locale;

  if v_source_revision is null then
    insert into public.marketing_site_settings_revisions (locale, revision_number, status, data, created_by, updated_by)
    values (p_locale, v_next_number, 'draft', '{}'::jsonb, auth.uid(), auth.uid())
    returning id into v_revision;
  else
    insert into public.marketing_site_settings_revisions (locale, revision_number, status, data, created_by, updated_by)
    select p_locale, v_next_number, 'draft', data, auth.uid(), auth.uid()
    from public.marketing_site_settings_revisions where id = v_source_revision
    returning id into v_revision;
  end if;

  update public.marketing_site_settings
  set draft_revision_id = v_revision, updated_by = auth.uid()
  where locale = p_locale;
  perform public.marketing_audit_event('marketing.settings_draft_created', 'marketing_site_settings_revision', v_revision, jsonb_build_object('locale', p_locale));
  return v_revision;
end;
$$;

create or replace function public.admin_get_marketing_settings(p_locale text default 'ar')
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when public.is_platform_admin() then (
    select jsonb_build_object(
      'id', r.id, 'locale', r.locale, 'revisionNumber', r.revision_number, 'status', r.status,
      'data', r.data, 'publishedAt', r.published_at, 'scheduledFor', r.scheduled_for, 'updatedAt', r.updated_at
    )
    from public.marketing_site_settings s
    join public.marketing_site_settings_revisions r
      on r.id = coalesce(s.draft_revision_id, s.published_revision_id)
    where s.locale = p_locale
  ) else null end;
$$;

create or replace function public.admin_save_marketing_settings_draft(
  p_revision_id uuid,
  p_data jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin required';
  end if;
  if jsonb_typeof(p_data) <> 'object' then
    raise exception 'settings data must be an object';
  end if;
  update public.marketing_site_settings_revisions
  set data = p_data, updated_by = auth.uid()
  where id = p_revision_id and status = 'draft';
  if not found then
    raise exception 'only draft settings revisions can be edited';
  end if;
  perform public.marketing_audit_event('marketing.settings_draft_saved', 'marketing_site_settings_revision', p_revision_id, '{}'::jsonb);
end;
$$;

create or replace function public.admin_publish_marketing_settings_revision(p_revision_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_locale text;
  v_old_published uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin required';
  end if;
  select locale into v_locale from public.marketing_site_settings_revisions
  where id = p_revision_id and status in ('draft', 'scheduled', 'published');
  if v_locale is null then
    raise exception 'settings revision is not publishable';
  end if;
  select published_revision_id into v_old_published
  from public.marketing_site_settings where locale = v_locale;
  if v_old_published is not null and v_old_published <> p_revision_id then
    update public.marketing_site_settings_revisions
    set status = 'archived', archived_at = now(), updated_by = auth.uid()
    where id = v_old_published;
  end if;
  update public.marketing_site_settings_revisions
  set status = 'published', published_at = now(), scheduled_for = null, archived_at = null, published_by = auth.uid(), updated_by = auth.uid()
  where id = p_revision_id;
  update public.marketing_site_settings
  set published_revision_id = p_revision_id, draft_revision_id = p_revision_id, updated_by = auth.uid()
  where locale = v_locale;
  perform public.marketing_audit_event('marketing.settings_published', 'marketing_site_settings_revision', p_revision_id, jsonb_build_object('locale', v_locale));
end;
$$;

-- 7) مكتبة الوسائط: لا يُستحدث bucket أو مصدر بيانات جديد؛ تمتد بيانات Phase 1 فقط.
create or replace function public.admin_list_marketing_media(
  p_query text default null,
  p_limit integer default 60,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when public.is_platform_admin() then coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'bucket', m.bucket, 'objectPath', m.object_path, 'mimeType', m.mime_type,
    'byteSize', m.byte_size, 'width', m.width, 'height', m.height, 'altText', m.alt_text,
    'caption', m.caption, 'metadata', m.metadata, 'createdAt', m.created_at, 'updatedAt', m.updated_at
  ) order by m.created_at desc), '[]'::jsonb) else '[]'::jsonb end
  from (
    select * from public.marketing_media
    where p_query is null or object_path ilike '%' || p_query || '%'
    order by created_at desc
    limit least(greatest(coalesce(p_limit, 60), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  ) m;
$$;

create or replace function public.admin_update_marketing_media(
  p_media_id uuid,
  p_alt_text jsonb default '{}'::jsonb,
  p_caption jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin required';
  end if;
  if jsonb_typeof(coalesce(p_alt_text, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_caption, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'media localized fields and metadata must be objects';
  end if;
  update public.marketing_media
  set alt_text = coalesce(p_alt_text, '{}'::jsonb), caption = coalesce(p_caption, '{}'::jsonb),
      metadata = coalesce(p_metadata, '{}'::jsonb), updated_by = auth.uid()
  where id = p_media_id;
  if not found then
    raise exception 'marketing media not found';
  end if;
  perform public.marketing_audit_event('marketing.media_updated', 'marketing_media', p_media_id, '{}'::jsonb);
end;
$$;

create or replace function public.admin_delete_marketing_media(p_media_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bucket text;
  v_object_path text;
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin required';
  end if;
  delete from public.marketing_media
  where id = p_media_id
  returning bucket, object_path into v_bucket, v_object_path;
  if v_bucket is null then
    raise exception 'marketing media not found';
  end if;
  perform public.marketing_audit_event('marketing.media_deleted', 'marketing_media', p_media_id, jsonb_build_object('bucket', v_bucket, 'object_path', v_object_path));
  return jsonb_build_object('bucket', v_bucket, 'objectPath', v_object_path);
end;
$$;

-- 8) نشر، استرجاع وPreview: الأحداث دلالية وSettings المنشورة تظهر داخل Preview بدل كائن فارغ.
create or replace function public.marketing_publish_revision(p_revision_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_page_id uuid;
  v_locale text;
  v_old_published_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin required';
  end if;
  select r.page_id, r.locale into v_page_id, v_locale
  from public.marketing_page_revisions r
  join public.marketing_pages p on p.id = r.page_id and p.lifecycle_status = 'active'
  where r.id = p_revision_id and r.status in ('draft', 'scheduled', 'published');
  if v_page_id is null then
    raise exception 'revision is not publishable';
  end if;

  select published_revision_id into v_old_published_id
  from public.marketing_page_locales
  where page_id = v_page_id and locale = v_locale;
  if v_old_published_id is not null and v_old_published_id <> p_revision_id then
    update public.marketing_page_revisions
    set status = 'archived', archived_at = now(), updated_by = auth.uid()
    where id = v_old_published_id;
  end if;
  update public.marketing_page_revisions
  set status = 'published', published_at = now(), scheduled_for = null, archived_at = null,
      published_by = auth.uid(), updated_by = auth.uid()
  where id = p_revision_id;
  insert into public.marketing_page_locales (page_id, locale, published_revision_id, draft_revision_id, created_by, updated_by)
  values (v_page_id, v_locale, p_revision_id, p_revision_id, auth.uid(), auth.uid())
  on conflict (page_id, locale) do update
  set published_revision_id = excluded.published_revision_id, draft_revision_id = excluded.draft_revision_id, updated_by = auth.uid();
  perform public.marketing_audit_event(
    'marketing.revision_published', 'marketing_page_revision', p_revision_id,
    jsonb_build_object('page_id', v_page_id, 'locale', v_locale, 'previous_revision_id', v_old_published_id)
  );
end;
$$;

create or replace function public.marketing_restore_revision(p_revision_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_page_id uuid;
  v_locale text;
  v_draft_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin required';
  end if;
  select r.page_id, r.locale into v_page_id, v_locale
  from public.marketing_page_revisions r
  join public.marketing_pages p on p.id = r.page_id and p.lifecycle_status = 'active'
  where r.id = p_revision_id;
  if v_page_id is null then
    raise exception 'revision not found on an active page';
  end if;
  update public.marketing_page_locales
  set draft_revision_id = p_revision_id, updated_by = auth.uid()
  where page_id = v_page_id and locale = v_locale;
  v_draft_id := public.marketing_create_draft(v_page_id, v_locale);
  perform public.marketing_audit_event(
    'marketing.revision_restored', 'marketing_page_revision', v_draft_id,
    jsonb_build_object('source_revision_id', p_revision_id, 'page_id', v_page_id, 'locale', v_locale)
  );
  return v_draft_id;
end;
$$;

-- Preview لا يقرأ إلا المراجعة المرتبطة بـToken مجزأ وصالح، والإعدادات المنشورة لنفس اللغة.
create or replace function public.marketing_preview_page(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with token as (
    select t.page_revision_id
    from public.marketing_preview_tokens t
    where t.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
      and t.expires_at > now()
      and t.page_revision_id is not null
    order by t.created_at desc
    limit 1
  ), page_revision as (
    select p.id as page_id, p.slug, r.id as revision_id, r.locale, r.title, r.description, r.seo, r.published_at
    from token t
    join public.marketing_page_revisions r on r.id = t.page_revision_id
    join public.marketing_pages p on p.id = r.page_id
    where p.lifecycle_status = 'active'
  ), site_settings as (
    select sr.data
    from public.marketing_site_settings s
    join public.marketing_site_settings_revisions sr on sr.id = s.published_revision_id
    join page_revision pr on pr.locale = s.locale
    where sr.status = 'published' and sr.published_at <= now()
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
    ), '[]'::jsonb)
  ) else null end;
$$;

create or replace function public.marketing_create_preview_token(
  p_revision_id uuid,
  p_ttl_minutes integer default 30
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_raw_token text;
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin required';
  end if;
  if p_ttl_minutes < 5 or p_ttl_minutes > 1440 then
    raise exception 'preview lifetime must be between 5 and 1440 minutes';
  end if;
  if not exists (
    select 1 from public.marketing_page_revisions r
    join public.marketing_pages p on p.id = r.page_id and p.lifecycle_status = 'active'
    where r.id = p_revision_id
  ) then
    raise exception 'revision not found on an active page';
  end if;
  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.marketing_preview_tokens (token_hash, page_revision_id, expires_at, created_by)
  values (encode(extensions.digest(v_raw_token, 'sha256'), 'hex'), p_revision_id, now() + make_interval(mins => p_ttl_minutes), auth.uid());
  perform public.marketing_audit_event('marketing.preview_generated', 'marketing_page_revision', p_revision_id, jsonb_build_object('ttl_minutes', p_ttl_minutes));
  return v_raw_token;
end;
$$;

-- 9) القراءة العامة: النسخ المنشورة والصفحات النشطة فقط؛ لا يوجد مسودة في أي مسار عام.
create or replace function public.marketing_public_page(
  p_slug text,
  p_locale text default 'ar'
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with page_revision as (
    select p.id as page_id, p.slug, r.id as revision_id, r.locale, r.title, r.description, r.seo,
           coalesce(r.published_at, r.scheduled_for) as published_at
    from public.marketing_pages p
    join public.marketing_page_locales pl on pl.page_id = p.id and pl.locale = p_locale
    join lateral (
      select r.*
      from public.marketing_page_revisions r
      where r.id = pl.published_revision_id
         or (r.page_id = p.id and r.locale = p_locale and r.status = 'scheduled' and r.scheduled_for <= now())
      order by case when r.status = 'scheduled' and r.scheduled_for <= now() then 0 else 1 end,
               r.scheduled_for desc nulls last
      limit 1
    ) r on true
    where p.slug = p_slug and p.lifecycle_status = 'active'
      and (r.status = 'published' or (r.status = 'scheduled' and r.scheduled_for <= now()))
  ), site_settings as (
    select sr.data
    from public.marketing_site_settings s
    join public.marketing_site_settings_revisions sr on sr.id = s.published_revision_id
    where s.locale = p_locale and sr.status = 'published' and sr.published_at <= now()
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

-- 10) صلاحيات دقيقة: لا التنفيذ العام لأي mutation، ولا تجاوز RLS عبر واجهات الإدارة.
revoke all on function public.marketing_audit_event(text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.marketing_assert_supported_section_type(text) from public, anon, authenticated;
revoke all on function public.admin_create_marketing_page(text, text, text, text, jsonb, text) from public, anon;
revoke all on function public.admin_duplicate_marketing_page(uuid, text, text) from public, anon;
revoke all on function public.admin_archive_marketing_page(uuid) from public, anon;
revoke all on function public.admin_restore_marketing_page(uuid) from public, anon;
revoke all on function public.admin_unpublish_marketing_page(uuid, text) from public, anon;
revoke all on function public.admin_delete_marketing_page(uuid) from public, anon;
revoke all on function public.admin_list_marketing_pages(text) from public, anon;
revoke all on function public.admin_list_marketing_revisions(uuid, text) from public, anon;
revoke all on function public.admin_save_marketing_draft(uuid, text, text, jsonb, jsonb) from public, anon;
revoke all on function public.admin_open_marketing_settings_draft(text) from public, anon;
revoke all on function public.admin_get_marketing_settings(text) from public, anon;
revoke all on function public.admin_save_marketing_settings_draft(uuid, jsonb) from public, anon;
revoke all on function public.admin_publish_marketing_settings_revision(uuid) from public, anon;
revoke all on function public.admin_list_marketing_media(text, integer, integer) from public, anon;
revoke all on function public.admin_update_marketing_media(uuid, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.admin_delete_marketing_media(uuid) from public, anon;
revoke all on function public.marketing_create_draft(uuid, text) from public, anon;
revoke all on function public.marketing_publish_revision(uuid) from public, anon;
revoke all on function public.marketing_restore_revision(uuid) from public, anon;
revoke all on function public.marketing_create_preview_token(uuid, integer) from public, anon;
revoke all on function public.marketing_preview_page(text) from public;
revoke all on function public.marketing_public_page(text, text) from public;

grant execute on function public.admin_create_marketing_page(text, text, text, text, jsonb, text) to authenticated;
grant execute on function public.admin_duplicate_marketing_page(uuid, text, text) to authenticated;
grant execute on function public.admin_archive_marketing_page(uuid) to authenticated;
grant execute on function public.admin_restore_marketing_page(uuid) to authenticated;
grant execute on function public.admin_unpublish_marketing_page(uuid, text) to authenticated;
grant execute on function public.admin_delete_marketing_page(uuid) to authenticated;
grant execute on function public.admin_list_marketing_pages(text) to authenticated;
grant execute on function public.admin_list_marketing_revisions(uuid, text) to authenticated;
grant execute on function public.admin_save_marketing_draft(uuid, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.admin_open_marketing_settings_draft(text) to authenticated;
grant execute on function public.admin_get_marketing_settings(text) to authenticated;
grant execute on function public.admin_save_marketing_settings_draft(uuid, jsonb) to authenticated;
grant execute on function public.admin_publish_marketing_settings_revision(uuid) to authenticated;
grant execute on function public.admin_list_marketing_media(text, integer, integer) to authenticated;
grant execute on function public.admin_update_marketing_media(uuid, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.admin_delete_marketing_media(uuid) to authenticated;
grant execute on function public.marketing_create_draft(uuid, text) to authenticated;
grant execute on function public.marketing_publish_revision(uuid) to authenticated;
grant execute on function public.marketing_restore_revision(uuid) to authenticated;
grant execute on function public.marketing_create_preview_token(uuid, integer) to authenticated;
grant execute on function public.marketing_preview_page(text) to anon, authenticated;
grant execute on function public.marketing_public_page(text, text) to anon, authenticated;

commit;
