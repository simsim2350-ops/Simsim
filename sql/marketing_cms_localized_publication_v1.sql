-- يجعل حالة النشر مرتبطة بالصفحة واللغة بدل مؤشر عالمي واحد في marketing_pages.
begin;

create table if not exists public.marketing_page_locales (
  page_id uuid not null references public.marketing_pages(id) on delete cascade,
  locale text not null check (locale in ('ar', 'en')),
  published_revision_id uuid references public.marketing_page_revisions(id) on delete set null,
  draft_revision_id uuid references public.marketing_page_revisions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  primary key (page_id, locale)
);

-- نقل مؤشرات المحتوى المنشور الحالية إلى صف اللغة العربية دون تغيير البيانات.
insert into public.marketing_page_locales (page_id, locale, published_revision_id, draft_revision_id)
select id, 'ar', published_revision_id, draft_revision_id
from public.marketing_pages
where published_revision_id is not null or draft_revision_id is not null
on conflict (page_id, locale) do update
set published_revision_id = coalesce(excluded.published_revision_id, marketing_page_locales.published_revision_id),
    draft_revision_id = coalesce(excluded.draft_revision_id, marketing_page_locales.draft_revision_id);

create index if not exists idx_marketing_page_locales_published
  on public.marketing_page_locales (locale, published_revision_id)
  where published_revision_id is not null;

-- حماية لغة/صفحة: تضمن أن المراجعة المؤشرة تنتمي إلى نفس الصفحة واللغة.
create or replace function public.marketing_validate_page_locale_pointer()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.published_revision_id is not null and not exists (
    select 1 from public.marketing_page_revisions r
    where r.id = new.published_revision_id and r.page_id = new.page_id and r.locale = new.locale
  ) then
    raise exception 'published revision must belong to the same page and locale';
  end if;

  if new.draft_revision_id is not null and not exists (
    select 1 from public.marketing_page_revisions r
    where r.id = new.draft_revision_id and r.page_id = new.page_id and r.locale = new.locale
  ) then
    raise exception 'draft revision must belong to the same page and locale';
  end if;

  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_marketing_page_locales_validate on public.marketing_page_locales;
create trigger trg_marketing_page_locales_validate
before insert or update on public.marketing_page_locales
for each row execute function public.marketing_validate_page_locale_pointer();

drop trigger if exists trg_marketing_page_locales_audit on public.marketing_page_locales;
create trigger trg_marketing_page_locales_audit
after insert or update or delete on public.marketing_page_locales
for each row execute function public.marketing_write_audit();

alter table public.marketing_page_locales enable row level security;
drop policy if exists marketing_page_locales_platform_admin_all on public.marketing_page_locales;
create policy marketing_page_locales_platform_admin_all on public.marketing_page_locales
for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

-- تستبدل دالة القراءة العامة المؤشر العالمي بمؤشر الصفحة/اللغة.
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
    join public.marketing_page_locales pl on pl.page_id = p.id and pl.locale = p_locale
    join public.marketing_page_revisions r on r.id = pl.published_revision_id
    where p.slug = p_slug
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

revoke all on function public.marketing_validate_page_locale_pointer() from public, anon, authenticated;
revoke all on function public.marketing_public_page(text, text) from public;
grant execute on function public.marketing_public_page(text, text) to anon, authenticated;

commit;
