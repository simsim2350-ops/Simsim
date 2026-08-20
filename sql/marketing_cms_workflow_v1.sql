-- سير عمل مسودة/نشر/جدولة/معاينة للموقع التسويقي.
begin;

create or replace function public.marketing_create_draft(
  p_page_id uuid,
  p_locale text default 'ar'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  source_revision_id uuid;
  new_revision_id uuid;
  next_number integer;
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin required';
  end if;

  select coalesce(pl.draft_revision_id, pl.published_revision_id)
  into source_revision_id
  from public.marketing_page_locales pl
  where pl.page_id = p_page_id and pl.locale = p_locale;

  if source_revision_id is null then
    raise exception 'no source revision exists for page % locale %', p_page_id, p_locale;
  end if;

  select coalesce(max(revision_number), 0) + 1 into next_number
  from public.marketing_page_revisions
  where page_id = p_page_id and locale = p_locale;

  insert into public.marketing_page_revisions (
    page_id, locale, revision_number, status, title, description, seo, created_by, updated_by
  )
  select page_id, locale, next_number, 'draft', title, description, seo, auth.uid(), auth.uid()
  from public.marketing_page_revisions
  where id = source_revision_id
  returning id into new_revision_id;

  insert into public.marketing_sections (
    revision_id, section_type, content, settings, analytics_id, sort_order, is_visible, created_by, updated_by
  )
  select new_revision_id, section_type, content, settings, analytics_id, sort_order, is_visible, auth.uid(), auth.uid()
  from public.marketing_sections
  where revision_id = source_revision_id;

  insert into public.marketing_page_locales (page_id, locale, draft_revision_id, created_by, updated_by)
  values (p_page_id, p_locale, new_revision_id, auth.uid(), auth.uid())
  on conflict (page_id, locale) do update
  set draft_revision_id = excluded.draft_revision_id, updated_by = auth.uid();

  return new_revision_id;
end;
$$;

create or replace function public.marketing_publish_revision(
  p_revision_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page_id uuid;
  v_locale text;
  old_published_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin required';
  end if;

  select page_id, locale into v_page_id, v_locale
  from public.marketing_page_revisions
  where id = p_revision_id and status in ('draft', 'scheduled', 'published');

  if v_page_id is null then
    raise exception 'revision is not publishable';
  end if;

  select published_revision_id into old_published_id
  from public.marketing_page_locales
  where page_id = v_page_id and locale = v_locale;

  if old_published_id is not null and old_published_id <> p_revision_id then
    update public.marketing_page_revisions
    set status = 'archived', archived_at = now(), updated_by = auth.uid()
    where id = old_published_id;
  end if;

  update public.marketing_page_revisions
  set status = 'published', published_at = now(), scheduled_for = null, archived_at = null, published_by = auth.uid(), updated_by = auth.uid()
  where id = p_revision_id;

  insert into public.marketing_page_locales (page_id, locale, published_revision_id, draft_revision_id, created_by, updated_by)
  values (v_page_id, v_locale, p_revision_id, p_revision_id, auth.uid(), auth.uid())
  on conflict (page_id, locale) do update
  set published_revision_id = excluded.published_revision_id,
      draft_revision_id = excluded.draft_revision_id,
      updated_by = auth.uid();
end;
$$;

create or replace function public.marketing_schedule_revision(
  p_revision_id uuid,
  p_scheduled_for timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin required';
  end if;
  if p_scheduled_for <= now() then
    raise exception 'scheduled publication must be in the future';
  end if;

  update public.marketing_page_revisions
  set status = 'scheduled', scheduled_for = p_scheduled_for, updated_by = auth.uid()
  where id = p_revision_id and status = 'draft';

  if not found then
    raise exception 'only draft revisions can be scheduled';
  end if;
end;
$$;

create or replace function public.marketing_restore_revision(
  p_revision_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page_id uuid;
  v_locale text;
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin required';
  end if;

  select page_id, locale into v_page_id, v_locale
  from public.marketing_page_revisions
  where id = p_revision_id;

  if v_page_id is null then
    raise exception 'revision not found';
  end if;

  update public.marketing_page_locales
  set draft_revision_id = p_revision_id, updated_by = auth.uid()
  where page_id = v_page_id and locale = v_locale;

  return public.marketing_create_draft(v_page_id, v_locale);
end;
$$;

create or replace function public.marketing_reorder_sections(
  p_revision_id uuid,
  p_section_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin required';
  end if;

  if (select count(*) from public.marketing_sections where revision_id = p_revision_id) <> coalesce(array_length(p_section_ids, 1), 0) then
    raise exception 'section list must contain every section exactly once';
  end if;

  if exists (
    select 1
    from unnest(p_section_ids) with ordinality ids(id, position)
    left join public.marketing_sections s on s.id = ids.id and s.revision_id = p_revision_id
    where s.id is null
  ) then
    raise exception 'section list includes a section outside the revision';
  end if;

  update public.marketing_sections s
  set sort_order = ordered.position - 1, updated_by = auth.uid()
  from unnest(p_section_ids) with ordinality ordered(id, position)
  where s.id = ordered.id and s.revision_id = p_revision_id;
end;
$$;

create or replace function public.marketing_create_preview_token(
  p_revision_id uuid,
  p_ttl_minutes integer default 30
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_token text;
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin required';
  end if;
  if p_ttl_minutes < 5 or p_ttl_minutes > 1440 then
    raise exception 'preview lifetime must be between 5 and 1440 minutes';
  end if;
  if not exists (select 1 from public.marketing_page_revisions where id = p_revision_id) then
    raise exception 'revision not found';
  end if;

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.marketing_preview_tokens (token_hash, page_revision_id, expires_at, created_by)
  values (encode(extensions.digest(raw_token, 'sha256'), 'hex'), p_revision_id, now() + make_interval(mins => p_ttl_minutes), auth.uid());
  return raw_token;
end;
$$;

-- تعرض المراجعة المجدولة تلقائياً بعد موعدها من دون عملية خلفية أو إعادة بناء كامل.
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
    select p.id as page_id, p.slug, r.id as revision_id, r.locale, r.title, r.description, r.seo, coalesce(r.published_at, r.scheduled_for) as published_at
    from public.marketing_pages p
    join public.marketing_page_locales pl on pl.page_id = p.id and pl.locale = p_locale
    join lateral (
      select r.*
      from public.marketing_page_revisions r
      where r.id = pl.published_revision_id
         or (r.page_id = p.id and r.locale = p_locale and r.status = 'scheduled' and r.scheduled_for <= now())
      order by case when r.status = 'scheduled' and r.scheduled_for <= now() then 0 else 1 end, r.scheduled_for desc nulls last
      limit 1
    ) r on true
    where p.slug = p_slug
      and (r.status = 'published' or (r.status = 'scheduled' and r.scheduled_for <= now()))
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

-- Route Handler يقرأ Token المعاينة فقط عندما يطابق التجزئة ولم تنته صلاحيته.
create or replace function public.marketing_preview_page(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with token as (
    select t.page_revision_id
    from public.marketing_preview_tokens t
    where t.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
      and t.expires_at > now()
    order by t.created_at desc
    limit 1
  ), page_revision as (
    select p.id as page_id, p.slug, r.id as revision_id, r.locale, r.title, r.description, r.seo, r.published_at
    from token t
    join public.marketing_page_revisions r on r.id = t.page_revision_id
    join public.marketing_pages p on p.id = r.page_id
  )
  select case when exists (select 1 from page_revision) then jsonb_build_object(
    'page', (select jsonb_build_object(
      'id', page_id, 'slug', slug, 'revisionId', revision_id, 'locale', locale,
      'title', title, 'description', description, 'seo', seo, 'publishedAt', published_at
    ) from page_revision),
    'settings', '{}'::jsonb,
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

-- لا تترك دوال الإدارة أو المشغلات متاحة للعامة.
revoke all on function public.marketing_create_draft(uuid, text) from public, anon;
revoke all on function public.marketing_publish_revision(uuid) from public, anon;
revoke all on function public.marketing_schedule_revision(uuid, timestamptz) from public, anon;
revoke all on function public.marketing_restore_revision(uuid) from public, anon;
revoke all on function public.marketing_reorder_sections(uuid, uuid[]) from public, anon;
revoke all on function public.marketing_create_preview_token(uuid, integer) from public, anon;
revoke all on function public.marketing_preview_page(text) from public;
revoke all on function public.marketing_public_page(text, text) from public;
grant execute on function public.marketing_create_draft(uuid, text) to authenticated;
grant execute on function public.marketing_publish_revision(uuid) to authenticated;
grant execute on function public.marketing_schedule_revision(uuid, timestamptz) to authenticated;
grant execute on function public.marketing_restore_revision(uuid) to authenticated;
grant execute on function public.marketing_reorder_sections(uuid, uuid[]) to authenticated;
grant execute on function public.marketing_create_preview_token(uuid, integer) to authenticated;
grant execute on function public.marketing_preview_page(text) to anon, authenticated;
grant execute on function public.marketing_public_page(text, text) to anon, authenticated;

commit;
