-- ============================================================================
-- Phase 2 / P2.1ب-1 — إعادة تصنيف المستويات (loyalty_recompute_tiers)
-- ----------------------------------------------------------------------------
-- عند تعديل عتبات/حذف مستوى، يجب إعادة تصنيف كل الحسابات فوراً (وإلا لا يترقّى
-- العميل حتى يكسب مجدداً). تُستدعى من الواجهة بعد أي إضافة/تعديل/حذف مستوى.
--
-- الأمان: DEFINER + بوابة has_restaurant_access · لـ authenticated فقط.
-- ⚠️ يُنفَّذ في Supabase بعد موافقة المالك.
-- ============================================================================

create or replace function public.loyalty_recompute_tiers(p_restaurant_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if not has_restaurant_access(p_restaurant_id) then
    raise exception 'access_denied' using errcode = 'insufficient_privilege';
  end if;

  update loyalty_accounts a
    set tier_id = loyalty_compute_tier(p_restaurant_id, a.lifetime_earned),
        updated_at = now()
  where a.restaurant_id = p_restaurant_id
    and a.tier_id is distinct from loyalty_compute_tier(p_restaurant_id, a.lifetime_earned);

  get diagnostics n = row_count;
  return n;   -- عدد الحسابات التي تغيّر مستواها
end;
$$;

revoke all on function public.loyalty_recompute_tiers(uuid) from public, anon;
grant execute on function public.loyalty_recompute_tiers(uuid) to authenticated;
