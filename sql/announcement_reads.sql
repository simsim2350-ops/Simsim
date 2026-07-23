-- الإعلانات — المرحلة 2: جهة المطعم. جدول حالة «مقروء» + دالتان يستدعيهما مستخدم المطعم.
-- أمان: الدالتان SECURITY DEFINER وتحلّان مطعم المتّصل خادمياً عبر auth.uid()
-- (مالك أو موظف فعّال) ولا تقبلان restaurant_id — فلا يرى أحد إعلانات مطعم آخر.

create table if not exists public.announcement_reads (
  restaurant_id   uuid not null references public.restaurants(id)   on delete cascade,
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (restaurant_id, announcement_id)
);
alter table public.announcement_reads enable row level security;
-- لا سياسات عامة: الوصول حصراً عبر الدوال أدناه (SECURITY DEFINER تتجاوز RLS).

-- إعلانات المطعم الفعّالة (ضمن النافذة الزمنية، المستهدِفة للكل أو لخطة المطعم) مع علم «مقروء».
create or replace function public.restaurant_announcements()
returns table (id uuid, title text, body text, type text, created_at timestamptz, read boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_rid uuid; v_plan text;
begin
  select r.id, r.subscription_plan into v_rid, v_plan from public.restaurants r where r.owner_id = auth.uid() limit 1;
  if v_rid is null then
    select r.id, r.subscription_plan into v_rid, v_plan
    from public.restaurant_members m join public.restaurants r on r.id = m.restaurant_id
    where m.user_id = auth.uid() and m.is_active limit 1;
  end if;
  if v_rid is null then return; end if;

  return query
    select a.id, a.title, a.body, a.type, a.created_at,
           exists(select 1 from public.announcement_reads ar where ar.announcement_id = a.id and ar.restaurant_id = v_rid) as read
    from public.announcements a
    where a.is_active
      and (a.starts_at is null or a.starts_at <= now())
      and (a.ends_at   is null or a.ends_at   >= now())
      and (a.target_scope = 'all' or v_plan = any(a.target_plans))
    order by a.created_at desc
    limit 50;
end; $$;

-- تعليم كل الإعلانات الظاهرة للمطعم كمقروءة (يُستدعى عند فتح الجرس). يُرجع عدد الجديد.
create or replace function public.mark_announcements_read()
returns integer language plpgsql security definer set search_path = public as $$
declare v_rid uuid; v_plan text; v_count integer;
begin
  select r.id, r.subscription_plan into v_rid, v_plan from public.restaurants r where r.owner_id = auth.uid() limit 1;
  if v_rid is null then
    select r.id, r.subscription_plan into v_rid, v_plan
    from public.restaurant_members m join public.restaurants r on r.id = m.restaurant_id
    where m.user_id = auth.uid() and m.is_active limit 1;
  end if;
  if v_rid is null then return 0; end if;

  insert into public.announcement_reads(restaurant_id, announcement_id)
  select v_rid, a.id from public.announcements a
  where a.is_active
    and (a.starts_at is null or a.starts_at <= now())
    and (a.ends_at   is null or a.ends_at   >= now())
    and (a.target_scope = 'all' or v_plan = any(a.target_plans))
  on conflict (restaurant_id, announcement_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

grant  execute on function public.restaurant_announcements()  to authenticated;
grant  execute on function public.mark_announcements_read()   to authenticated;
revoke execute on function public.restaurant_announcements()  from public, anon;
revoke execute on function public.mark_announcements_read()   from public, anon;
