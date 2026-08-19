-- واجهة إدارة المحتوى لتطبيق Vite/Super Admin؛ تفويضها خادمي حتى مع واجهة عميل مخترقة.
begin;

create or replace function public.admin_list_marketing_pages(p_locale text default 'ar')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_platform_admin() then coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'slug', p.slug,
    'template', p.template,
    'locale', pl.locale,
    'publishedRevisionId', pl.published_revision_id,
    'draftRevisionId', pl.draft_revision_id,
    'publishedTitle', published.title,
    'draftTitle', draft.title,
    'updatedAt', greatest(coalesce(published.updated_at, '-infinity'::timestamptz), coalesce(draft.updated_at, '-infinity'::timestamptz))
  ) order by p.slug), '[]'::jsonb)
  else '[]'::jsonb end
  from public.marketing_pages p
  left join public.marketing_page_locales pl on pl.page_id = p.id and pl.locale = p_locale
  left join public.marketing_page_revisions published on published.id = pl.published_revision_id
  left join public.marketing_page_revisions draft on draft.id = pl.draft_revision_id;
$$;

create or replace function public.admin_get_marketing_revision(p_revision_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_platform_admin() then (
    select jsonb_build_object(
      'id', r.id, 'pageId', r.page_id, 'locale', r.locale, 'revisionNumber', r.revision_number,
      'status', r.status, 'title', r.title, 'description', r.description, 'seo', r.seo,
      'publishedAt', r.published_at, 'scheduledFor', r.scheduled_for, 'updatedAt', r.updated_at,
      'sections', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', s.id, 'type', s.section_type, 'content', s.content, 'settings', s.settings,
          'analyticsId', s.analytics_id, 'sortOrder', s.sort_order, 'isVisible', s.is_visible
        ) order by s.sort_order)
        from public.marketing_sections s
        where s.revision_id = r.id
      ), '[]'::jsonb)
    )
    from public.marketing_page_revisions r
    where r.id = p_revision_id
  ) else null end;
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
set search_path = public
as $$
declare
  invalid_sections integer;
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

  select count(*) into invalid_sections
  from jsonb_array_elements(p_sections) section
  where jsonb_typeof(section) <> 'object'
     or coalesce(section->>'type', '') not in ('HERO','PROBLEM','BENEFITS','STEPS','MENU_PREVIEW','FEATURES','TRUST','PRICING','FAQ','CTA')
     or jsonb_typeof(section->'content') <> 'object'
     or coalesce((section->>'sortOrder')::integer, -1) < 0;
  if invalid_sections > 0 then
    raise exception 'one or more sections are malformed or unsupported';
  end if;

  if not exists (select 1 from public.marketing_page_revisions where id = p_revision_id and status = 'draft') then
    raise exception 'only draft revisions can be edited';
  end if;

  update public.marketing_page_revisions
  set title = trim(p_title), description = nullif(trim(coalesce(p_description, '')), ''), seo = p_seo, updated_by = auth.uid()
  where id = p_revision_id;

  delete from public.marketing_sections where revision_id = p_revision_id;
  insert into public.marketing_sections (revision_id, section_type, content, settings, analytics_id, sort_order, is_visible, created_by, updated_by)
  select
    p_revision_id,
    section->>'type',
    section->'content',
    coalesce(section->'settings', '{}'::jsonb),
    nullif(section->>'analyticsId', ''),
    (section->>'sortOrder')::integer,
    coalesce((section->>'isVisible')::boolean, true),
    auth.uid(), auth.uid()
  from jsonb_array_elements(p_sections) section;
end;
$$;

revoke all on function public.admin_list_marketing_pages(text) from public, anon;
revoke all on function public.admin_get_marketing_revision(uuid) from public, anon;
revoke all on function public.admin_save_marketing_draft(uuid, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.admin_list_marketing_pages(text) to authenticated;
grant execute on function public.admin_get_marketing_revision(uuid) to authenticated;
grant execute on function public.admin_save_marketing_draft(uuid, text, text, jsonb, jsonb) to authenticated;

commit;
