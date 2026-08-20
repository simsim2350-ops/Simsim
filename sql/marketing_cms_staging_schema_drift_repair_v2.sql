-- Marketing CMS — Staging schema drift repair v2
-- Scope: Staging only. Corrects the semantic Marketing audit helper that still
-- read the removed public.platform_admins.role column.
-- Does not touch production objects or production data.

begin;

create or replace function public.marketing_audit_event(
  p_action text,
  p_target_type text,
  p_target_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin required';
  end if;

  if p_action !~ '^marketing\.[a-z0-9_]+$' or length(p_action) > 120 then
    raise exception 'invalid marketing audit action';
  end if;

  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'audit metadata must be an object';
  end if;

  v_role := public.platform_admin_role();
  if v_role is null then
    raise exception 'platform admin role missing';
  end if;

  insert into public.platform_audit_logs (
    admin_user_id, role, action, target_type, target_id, old_value, new_value, metadata
  ) values (
    auth.uid(), v_role, p_action, p_target_type, p_target_id, null, null,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

notify pgrst, 'reload schema';

commit;
