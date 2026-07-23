-- ========== أدوار المنصّة المرنة (RBAC) — الخطوة 1: قاعدة البيانات + الدوال — قيد المراجعة ==========
-- الأدوار تصبح بيانات (جدول platform_roles) يديرها super_admin: إنشاء/تعديل/حذف + تأشير الصلاحيات.
-- الصلاحيات: manage_restaurants · manage_billing · manage_admins · manage_roles (والقراءة متاحة لكل مشرف).
-- '*' = صلاحية شاملة (دور النظام super_admin). المشرف يُسنَد لدور واحد (role_id).

-- 1) جدول الأدوار
create table if not exists public.platform_roles (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  description  text,
  capabilities text[] not null default '{}',
  is_system    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.platform_roles enable row level security;
create policy proles_admin_select on public.platform_roles for select using (public.is_platform_admin());
drop trigger if exists trg_platform_roles_updated on public.platform_roles;
create trigger trg_platform_roles_updated before update on public.platform_roles
  for each row execute function public.set_updated_at();

-- 2) بذور: دور النظام super_admin (كل الصلاحيات '*'، محمي) + read_only كبداية جاهزة
insert into public.platform_roles(name, description, capabilities, is_system)
values ('super_admin','مالك المنصّة — كل الصلاحيات', array['*'], true)
on conflict (name) do nothing;
insert into public.platform_roles(name, description, capabilities, is_system)
values ('read_only','اطّلاع فقط بلا أي كتابة', array[]::text[], false)
on conflict (name) do nothing;

-- 3) ربط المشرفين بالأدوار + ترحيل الحالي بلا فقدان
alter table public.platform_admins add column if not exists role_id uuid references public.platform_roles(id);
update public.platform_admins a set role_id = r.id
  from public.platform_roles r where r.name = a.role and a.role_id is null;
update public.platform_admins set role_id = (select id from public.platform_roles where name='super_admin')
  where role_id is null;
alter table public.platform_admins alter column role_id set not null;

-- 4) إعادة كتابة دوال الهوية/الصلاحية لتقرأ من الأدوار (تحافظ على كل الدوال المبوّبة القائمة)
create or replace function public.platform_admin_role()
returns text language sql stable security definer set search_path = public as $$
  select r.name from platform_admins a join platform_roles r on r.id = a.role_id
  where a.user_id = auth.uid() and a.is_active = true limit 1;
$$;

create or replace function public.platform_admin_can(p_capability text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from platform_admins a
    left join platform_roles r on r.id = a.role_id
    where a.user_id = auth.uid() and a.is_active = true
      and ( '*' = any(coalesce(r.capabilities,'{}'))
         or p_capability = any(coalesce(r.capabilities,'{}'))
         or p_capability = 'read' )   -- كل مشرف فعّال يقرأ
  );
$$;

-- 5) أزل الأعمدة القديمة (مصدر حقيقة واحد: الدور) — بعد نقلها لـ role_id
alter table public.platform_admins drop column if exists role;
alter table public.platform_admins drop column if exists capabilities;

-- 6) CRUD الأدوار (بوابة manage_roles + Audit؛ دور النظام محمي)
create or replace function public.admin_list_roles()
returns table (id uuid, name text, description text, capabilities text[], is_system boolean, admins_count int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  return query
    select r.id, r.name, r.description, r.capabilities, r.is_system,
           (select count(*) from platform_admins a where a.role_id = r.id)::int
    from platform_roles r order by r.is_system desc, r.name;
end; $$;

create or replace function public.admin_upsert_role(
  p_id uuid, p_name text, p_description text, p_capabilities text[]
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_old jsonb; v_sys boolean;
begin
  if not public.platform_admin_can('manage_roles') then raise exception 'forbidden'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'name required'; end if;
  if p_id is null then
    insert into platform_roles(name, description, capabilities)
    values (p_name, p_description, coalesce(p_capabilities,'{}')) returning id into v_id;
    perform public.log_platform_action('role.create','role',v_id,null,
      jsonb_build_object('name',p_name,'capabilities',to_jsonb(p_capabilities)));
  else
    select to_jsonb(r), r.is_system into v_old, v_sys from platform_roles r where r.id = p_id;
    if v_old is null then raise exception 'role not found'; end if;
    if v_sys then raise exception 'cannot modify a system role'; end if;
    update platform_roles set name=p_name, description=p_description, capabilities=coalesce(p_capabilities,'{}') where id=p_id;
    v_id := p_id;
    perform public.log_platform_action('role.update','role',v_id,v_old,
      jsonb_build_object('name',p_name,'capabilities',to_jsonb(p_capabilities)));
  end if;
  return v_id;
end; $$;

create or replace function public.admin_delete_role(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_sys boolean; v_name text; v_cnt int;
begin
  if not public.platform_admin_can('manage_roles') then raise exception 'forbidden'; end if;
  select is_system, name into v_sys, v_name from platform_roles where id = p_id;
  if not found then raise exception 'role not found'; end if;
  if v_sys then raise exception 'cannot delete a system role'; end if;
  select count(*) into v_cnt from platform_admins where role_id = p_id;
  if v_cnt > 0 then raise exception 'role assigned to % admin(s)', v_cnt; end if;
  delete from platform_roles where id = p_id;
  perform public.log_platform_action('role.delete','role',p_id, jsonb_build_object('name',v_name), null);
  return true;
end; $$;

-- 7) CRUD المشرفين (بوابة manage_admins + Audit؛ الإنشاء من الصفر عبر Edge Function — الخطوة 2)
create or replace function public.admin_list_platform_admins()
returns table (user_id uuid, email text, role_id uuid, role_name text, is_active boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  return query
    select a.user_id, u.email::text, a.role_id, r.name, a.is_active, a.created_at
    from platform_admins a
    left join platform_roles r on r.id = a.role_id
    left join auth.users u on u.id = a.user_id
    order by a.created_at;
end; $$;

create or replace function public.admin_update_admin(p_user_id uuid, p_role_id uuid, p_is_active boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_old jsonb;
begin
  if not public.platform_admin_can('manage_admins') then raise exception 'forbidden'; end if;
  select to_jsonb(a) into v_old from platform_admins a where a.user_id = p_user_id;
  if v_old is null then raise exception 'admin not found'; end if;
  if not exists(select 1 from platform_roles where id = p_role_id) then raise exception 'role not found'; end if;
  update platform_admins set role_id = p_role_id, is_active = coalesce(p_is_active, is_active) where user_id = p_user_id;
  if (select count(*) from platform_admins a join platform_roles r on r.id=a.role_id
      where a.is_active and '*' = any(r.capabilities)) = 0 then
    raise exception 'must keep at least one active super admin';  -- يمنع قفل النظام
  end if;
  perform public.log_platform_action('admin.update','admin',p_user_id,v_old,
    jsonb_build_object('role_id',p_role_id,'is_active',p_is_active));
  return true;
end; $$;

create or replace function public.admin_revoke_admin(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_old jsonb;
begin
  if not public.platform_admin_can('manage_admins') then raise exception 'forbidden'; end if;
  select to_jsonb(a) into v_old from platform_admins a where a.user_id = p_user_id;
  if v_old is null then raise exception 'admin not found'; end if;
  delete from platform_admins where user_id = p_user_id;
  if (select count(*) from platform_admins a join platform_roles r on r.id=a.role_id
      where a.is_active and '*' = any(r.capabilities)) = 0 then
    raise exception 'must keep at least one active super admin';
  end if;
  perform public.log_platform_action('admin.revoke','admin',p_user_id,v_old,null);
  return true;
end; $$;

-- 8) الأذونات
grant  execute on function public.admin_list_roles()                                to authenticated;
grant  execute on function public.admin_upsert_role(uuid,text,text,text[])           to authenticated;
grant  execute on function public.admin_delete_role(uuid)                            to authenticated;
grant  execute on function public.admin_list_platform_admins()                       to authenticated;
grant  execute on function public.admin_update_admin(uuid,uuid,boolean)              to authenticated;
grant  execute on function public.admin_revoke_admin(uuid)                           to authenticated;
revoke execute on function public.admin_list_roles()                                from public, anon;
revoke execute on function public.admin_upsert_role(uuid,text,text,text[])           from public, anon;
revoke execute on function public.admin_delete_role(uuid)                            from public, anon;
revoke execute on function public.admin_list_platform_admins()                       from public, anon;
revoke execute on function public.admin_update_admin(uuid,uuid,boolean)              from public, anon;
revoke execute on function public.admin_revoke_admin(uuid)                           from public, anon;
