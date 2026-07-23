-- الإعلانات (Announcements) — المرحلة الأولى: الجدول + إدارة المنصّة فقط (بلا لمس لوحة المطعم).
-- استهداف: للكل أو بالخطة · نوع: info/warning/maintenance · نافذة زمنية اختيارية.
-- قراءة/كتابة إدارية مبوّبة (is_platform_admin / platform_admin_can('manage_announcements')) + Audit ذرّي.

create table if not exists public.announcements (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  body          text not null default '',
  type          text not null default 'info'  check (type in ('info','warning','maintenance')),
  target_scope  text not null default 'all'   check (target_scope in ('all','plan')),
  target_plans  text[] not null default '{}',
  is_active     boolean not null default true,
  starts_at     timestamptz,
  ends_at       timestamptz,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.announcements enable row level security;
drop policy if exists ann_admin_all on public.announcements;
create policy ann_admin_all on public.announcements for all
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create or replace function public.admin_list_announcements()
returns setof public.announcements
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  return query select * from public.announcements order by created_at desc;
end; $$;

create or replace function public.admin_upsert_announcement(
  p_id uuid, p_title text, p_body text, p_type text,
  p_target_scope text, p_target_plans text[], p_is_active boolean,
  p_starts_at timestamptz, p_ends_at timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_old jsonb;
begin
  if not public.platform_admin_can('manage_announcements') then raise exception 'forbidden'; end if;
  if coalesce(trim(p_title),'') = '' then raise exception 'title required'; end if;
  if p_id is null then
    insert into announcements(title, body, type, target_scope, target_plans, is_active, starts_at, ends_at, created_by)
    values (p_title, coalesce(p_body,''), coalesce(p_type,'info'), coalesce(p_target_scope,'all'),
            coalesce(p_target_plans,'{}'::text[]), coalesce(p_is_active,true), p_starts_at, p_ends_at, auth.uid())
    returning id into v_id;
    perform public.log_platform_action('announcement.create','announcement', v_id, null, jsonb_build_object('title',p_title,'type',p_type,'scope',p_target_scope));
  else
    select to_jsonb(a) into v_old from announcements a where a.id = p_id;
    if v_old is null then raise exception 'announcement not found'; end if;
    update announcements set
      title=p_title, body=coalesce(p_body,''), type=coalesce(p_type,'info'),
      target_scope=coalesce(p_target_scope,'all'), target_plans=coalesce(p_target_plans,'{}'::text[]),
      is_active=coalesce(p_is_active,true), starts_at=p_starts_at, ends_at=p_ends_at, updated_at=now()
      where id = p_id returning id into v_id;
    perform public.log_platform_action('announcement.update','announcement', v_id, v_old, jsonb_build_object('title',p_title,'type',p_type,'scope',p_target_scope));
  end if;
  return v_id;
end; $$;

create or replace function public.admin_delete_announcement(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.platform_admin_can('manage_announcements') then raise exception 'forbidden'; end if;
  if not exists(select 1 from announcements where id = p_id) then raise exception 'announcement not found'; end if;
  delete from announcements where id = p_id;
  perform public.log_platform_action('announcement.delete','announcement', p_id, jsonb_build_object('id',p_id), null);
  return true;
end; $$;

grant  execute on function public.admin_list_announcements()                                              to authenticated;
grant  execute on function public.admin_upsert_announcement(uuid,text,text,text,text,text[],boolean,timestamptz,timestamptz) to authenticated;
grant  execute on function public.admin_delete_announcement(uuid)                                         to authenticated;
revoke execute on function public.admin_list_announcements()                                              from public, anon;
revoke execute on function public.admin_upsert_announcement(uuid,text,text,text,text,text[],boolean,timestamptz,timestamptz) from public, anon;
revoke execute on function public.admin_delete_announcement(uuid)                                         from public, anon;
