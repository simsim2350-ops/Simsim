-- واجهة فهرسة عامة محدودة لصفحات CMS المنشورة فقط.
begin;

create or replace function public.marketing_public_pages(p_locale text default 'ar')
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', p.slug,
    'locale', r.locale,
    'publishedAt', coalesce(r.published_at, r.scheduled_for)
  ) order by p.slug), '[]'::jsonb)
  from public.marketing_pages p
  join public.marketing_page_locales pl on pl.page_id = p.id and pl.locale = p_locale
  join lateral (
    select revision.*
    from public.marketing_page_revisions revision
    where revision.id = pl.published_revision_id
       or (revision.page_id = p.id and revision.locale = p_locale and revision.status = 'scheduled' and revision.scheduled_for <= now())
    order by case when revision.status = 'scheduled' and revision.scheduled_for <= now() then 0 else 1 end,
             revision.scheduled_for desc nulls last
    limit 1
  ) r on true
  where p.lifecycle_status = 'active'
    and (r.status = 'published' or (r.status = 'scheduled' and r.scheduled_for <= now()));
$$;

revoke all on function public.marketing_public_pages(text) from public;
grant execute on function public.marketing_public_pages(text) to anon, authenticated;

commit;
