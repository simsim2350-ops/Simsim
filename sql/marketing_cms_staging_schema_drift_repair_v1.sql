-- Marketing CMS — Staging schema drift repair v1
-- Scope: Staging only. Reconciles platform RBAC and fixes the legacy audit trigger role lookup.
-- Does not touch production objects or production data.

begin;

-- 1) Adopt the current RBAC source of truth: platform_roles.name via platform_admins.role_id.
create table if not exists public.platform_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  capabilities text[] not null default '{}',
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.platform_roles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'platform_roles' and policyname = 'proles_admin_select'
  ) then
    create policy proles_admin_select on public.platform_roles
      for select using (public.is_platform_admin());
  end if;
end;
$$;

insert into public.platform_roles (name, description, capabilities, is_system)
values ('super_admin', 'مالك المنصّة — كل الصلاحيات', array['*'], true)
on conflict (name) do nothing;
insert into public.platform_roles (name, description, capabilities, is_system)
values ('read_only', 'اطّلاع فقط بلا أي كتابة', array[]::text[], false)
on conflict (name) do nothing;

alter table public.platform_admins
  add column if not exists role_id uuid references public.platform_roles(id);

-- Migrate a legacy role value only where the legacy column still exists.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'platform_admins' and column_name = 'role'
  ) then
    execute $sql$
      update public.platform_admins a
      set role_id = r.id
      from public.platform_roles r
      where r.name = a.role and a.role_id is null
    $sql$;
  end if;
end;
$$;

update public.platform_admins
set role_id = (select id from public.platform_roles where name = 'super_admin')
where role_id is null;

alter table public.platform_admins
  alter column role_id set not null;

create or replace function public.platform_admin_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.name
  from public.platform_admins a
  join public.platform_roles r on r.id = a.role_id
  where a.user_id = auth.uid() and a.is_active = true
  limit 1;
$$;

create or replace function public.platform_admin_can(p_capability text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.platform_admins a
    left join public.platform_roles r on r.id = a.role_id
    where a.user_id = auth.uid() and a.is_active = true
      and (
        '*' = any(coalesce(r.capabilities, '{}'))
        or p_capability = any(coalesce(r.capabilities, '{}'))
        or p_capability = 'read'
      )
  );
$$;

-- 2) The audit trigger must resolve a role through the current RBAC function,
-- not through the removed legacy platform_admins.role column.
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

-- The legacy fields are no longer a source of truth after role_id has been populated.
alter table public.platform_admins drop column if exists role;
alter table public.platform_admins drop column if exists capabilities;

grant execute on function public.platform_admin_role() to authenticated;
grant execute on function public.platform_admin_can(text) to authenticated;

-- Reload PostgREST only after the corrected contracts and grants are committed.
notify pgrst, 'reload schema';

commit;
