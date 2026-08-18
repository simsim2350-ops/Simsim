-- SimSim — Staff management SECURITY INVOKER hardening
-- ترقية لاحقة تقلل سطح SECURITY DEFINER وتغلق Trigger الداخلي أمام RPC المباشر.

begin;

alter function public.validate_member_branch_selection() security invoker;
alter function public.member_has_branch_access(uuid, uuid) security invoker;
alter function public.member_branch_scope(uuid) security invoker;

revoke all on function public.validate_member_branch_selection() from public, anon, authenticated, service_role;
revoke all on function public.member_has_branch_access(uuid, uuid) from public, anon;
revoke all on function public.member_branch_scope(uuid) from public, anon;

grant execute on function public.member_has_branch_access(uuid, uuid) to authenticated, service_role;
grant execute on function public.member_branch_scope(uuid) to authenticated, service_role;

commit;
