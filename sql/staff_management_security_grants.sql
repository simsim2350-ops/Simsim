-- SimSim — Staff management security grants
-- تمنع استدعاء دوال نطاق الفرع SECURITY DEFINER من زوار anon.
-- سياسات RLS تستمر في استخدامها للمستخدمين authenticated فقط.

begin;

revoke all on function public.member_has_branch_access(uuid, uuid) from public, anon;
revoke all on function public.member_branch_scope(uuid) from public, anon;

grant execute on function public.member_has_branch_access(uuid, uuid) to authenticated, service_role;
grant execute on function public.member_branch_scope(uuid) to authenticated, service_role;

commit;
