-- ============================================================================
-- حذف باقة (Admin) — admin_delete_plan — محميّ
-- ----------------------------------------------------------------------------
-- يُمنع حذف باقة مرتبطة بأي اشتراك (حفظ تاريخ الفوترة). يحذف قدرات الباقة
-- (plan_features) أولاً ثم الباقة. حارس الصلاحية: platform_admin_can('manage_billing').
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_delete_plan(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare v_name text; v_subs int;
begin
  if not public.platform_admin_can('manage_billing') then raise exception 'forbidden'; end if;
  select name into v_name from plans where id = p_id;
  if not found then raise exception 'plan not found'; end if;
  select count(*) into v_subs from subscriptions where plan_id = p_id;
  if v_subs > 0 then
    raise exception 'لا يمكن حذف باقة مرتبطة بـ% اشتراك — عطّلها أو انقل مطاعمها أولاً', v_subs;
  end if;
  delete from plan_features where plan_id = p_id;
  delete from plans where id = p_id;
  perform public.log_platform_action('plan.delete','plan',p_id, jsonb_build_object('name',v_name), null);
  return true;
end; $$;
