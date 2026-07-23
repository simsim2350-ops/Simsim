-- F5: عارض سجلّ التدقيق — بحث/فلترة بالإجراء/ترقيم خادمي + قائمة الإجراءات المتاحة.
-- SECURITY DEFINER مبوّبة بـ is_platform_admin(). يُرجع old_value/new_value لعرض Diff في الواجهة.
drop function if exists public.admin_list_audit_logs(int);

create or replace function public.admin_list_audit_logs(
  p_search text default null, p_action text default null, p_limit int default 50, p_offset int default 0)
returns table (id bigint, created_at timestamptz, admin_email text, role text, action text,
               target_type text, target_id uuid, old_value jsonb, new_value jsonb, total_count bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_limit  int := least(greatest(coalesce(p_limit,50),1),200);
  v_offset int := greatest(coalesce(p_offset,0),0);
  v_search text := nullif(trim(coalesce(p_search,'')),'');
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  return query
    select a.id, a.created_at, u.email::text, a.role, a.action, a.target_type, a.target_id, a.old_value, a.new_value,
           count(*) over()
    from platform_audit_logs a
    left join auth.users u on u.id = a.admin_user_id
    where (p_action is null or a.action = p_action)
      and (v_search is null or a.action ilike '%'||v_search||'%' or u.email ilike '%'||v_search||'%' or a.target_type ilike '%'||v_search||'%')
    order by a.created_at desc
    limit v_limit offset v_offset;
end; $$;
grant  execute on function public.admin_list_audit_logs(text,text,int,int) to authenticated;
revoke execute on function public.admin_list_audit_logs(text,text,int,int) from public, anon;

create or replace function public.admin_audit_actions()
returns text[] language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  return array(select distinct action from platform_audit_logs order by action);
end; $$;
grant  execute on function public.admin_audit_actions() to authenticated;
revoke execute on function public.admin_audit_actions() from public, anon;
