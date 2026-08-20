-- Marketing CMS scheduler v1
-- Scope: Supabase Staging only (`rgqsetckcigkgsyobyjg`).
-- Purpose: convert due marketing page revisions from `scheduled` to `published`,
-- update the page-locale pointer, archive the previous published revision, and
-- write an explicit platform audit record. No production objects are targeted.

begin;

create or replace function public.marketing_schedule_revision(
  p_revision_id uuid,
  p_scheduled_for timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_page_id uuid;
  v_locale text;
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin required';
  end if;
  if p_scheduled_for <= now() then
    raise exception 'scheduled publication must be in the future';
  end if;

  select r.page_id, r.locale into v_page_id, v_locale
  from public.marketing_page_revisions r
  join public.marketing_pages p on p.id = r.page_id and p.lifecycle_status = 'active'
  where r.id = p_revision_id and r.status = 'draft';
  if v_page_id is null then
    raise exception 'only draft revisions on active pages can be scheduled';
  end if;

  update public.marketing_page_revisions
  set status = 'scheduled', scheduled_for = p_scheduled_for, updated_by = auth.uid()
  where id = p_revision_id;

  perform public.marketing_audit_event(
    'marketing.revision_scheduled',
    'marketing_page_revision',
    p_revision_id,
    jsonb_build_object('page_id', v_page_id, 'locale', v_locale, 'scheduled_for', p_scheduled_for)
  );
end;
$$;

create or replace function public.marketing_publish_due_revisions()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_revision record;
  v_previous_revision_id uuid;
  v_actor_id uuid;
  v_published_ids uuid[] := array[]::uuid[];
begin
  for v_revision in
    select r.id, r.page_id, r.locale, r.created_by, r.updated_by, r.scheduled_for
    from public.marketing_page_revisions r
    join public.marketing_pages p on p.id = r.page_id and p.lifecycle_status = 'active'
    where r.status = 'scheduled' and r.scheduled_for <= now()
    order by r.scheduled_for asc, r.created_at asc
    for update of r skip locked
  loop
    select pl.published_revision_id
    into v_previous_revision_id
    from public.marketing_page_locales pl
    where pl.page_id = v_revision.page_id and pl.locale = v_revision.locale
    for update;

    if v_previous_revision_id is not null and v_previous_revision_id <> v_revision.id then
      update public.marketing_page_revisions
      set status = 'archived', archived_at = now()
      where id = v_previous_revision_id and status = 'published';
    end if;

    update public.marketing_page_revisions
    set status = 'published', published_at = now(), scheduled_for = null, archived_at = null
    where id = v_revision.id and status = 'scheduled';

    insert into public.marketing_page_locales (page_id, locale, published_revision_id, draft_revision_id, created_by, updated_by)
    values (
      v_revision.page_id,
      v_revision.locale,
      v_revision.id,
      v_revision.id,
      coalesce(v_revision.created_by, v_revision.updated_by),
      coalesce(v_revision.updated_by, v_revision.created_by)
    )
    on conflict (page_id, locale) do update
    set published_revision_id = excluded.published_revision_id,
        draft_revision_id = excluded.draft_revision_id;

    v_actor_id := coalesce(v_revision.updated_by, v_revision.created_by);
    if v_actor_id is not null then
      insert into public.platform_audit_logs (
        admin_user_id, role, action, target_type, target_id, old_value, new_value, metadata
      ) values (
        v_actor_id,
        'system_scheduler',
        'marketing.revision_scheduled_published',
        'marketing_page_revision',
        v_revision.id,
        null,
        jsonb_build_object('status', 'published', 'published_at', now()),
        jsonb_build_object(
          'page_id', v_revision.page_id,
          'locale', v_revision.locale,
          'scheduled_for', v_revision.scheduled_for,
          'previous_revision_id', v_previous_revision_id,
          'execution', 'pg_cron'
        )
      );
    end if;

    v_published_ids := array_append(v_published_ids, v_revision.id);
  end loop;

  return jsonb_build_object('published_revision_ids', coalesce(to_jsonb(v_published_ids), '[]'::jsonb));
end;
$$;

revoke all on function public.marketing_publish_due_revisions() from public, anon, authenticated;

create extension if not exists pg_cron;

do $$
declare
  v_job record;
begin
  for v_job in select jobid from cron.job where jobname = 'marketing-publish-due-revisions-staging' loop
    perform cron.unschedule(v_job.jobid);
  end loop;
  perform cron.schedule(
    'marketing-publish-due-revisions-staging',
    '* * * * *',
    'select public.marketing_publish_due_revisions();'
  );
end;
$$;

notify pgrst, 'reload schema';

commit;
