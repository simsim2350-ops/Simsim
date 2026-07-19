-- عارض سجلّ تدقيق المنصّة (قراءة) — M3.3 (Super Admin)
-- SECURITY DEFINER مبوّبة بـ is_platform_admin(). نُفِّذ في Supabase ✅
create or replace function public.admin_list_audit_logs(p_limit int default 100)
returns table (id bigint, created_at timestamptz, admin_email text, role text, action text,
               target_type text, target_id uuid, old_value jsonb, new_value jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  return query
    select a.id, a.created_at, u.email::text, a.role, a.action, a.target_type, a.target_id, a.old_value, a.new_value
    from platform_audit_logs a
    left join auth.users u on u.id = a.admin_user_id
    order by a.created_at desc
    limit greatest(1, least(p_limit, 500));
end; $$;
grant execute on function public.admin_list_audit_logs(int) to authenticated;
revoke execute on function public.admin_list_audit_logs(int) from public, anon;
