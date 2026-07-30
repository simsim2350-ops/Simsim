-- ============================================================================
-- Platform Capability Registry (PCR) — دالة لقطة الانحراف (Drift Snapshot) — ADR-40
-- ============================================================================
-- تكشف (key, type) فقط من feature_flags لفحص انحراف قاعدة البيانات عن الـManifest
-- في CI (scripts/checkRegistryDrift.mjs). بيانات غير حسّاسة إطلاقاً — لا قيَم ولا
-- تخصيصات ولا ربط باقات — لذا تُمنح لـanon (المفتاح publishable علني أصلاً).
-- SECURITY DEFINER لتجاوز سياسة RLS (ff_admin) القارئة للمشرفين فقط، مع كشف
-- العمودين غير الحسّاسين حصراً.
-- ============================================================================
create or replace function public.registry_drift_snapshot()
returns table (key text, type text)
language sql stable security definer set search_path = public
as $$ select key, type from public.feature_flags order by key $$;

revoke execute on function public.registry_drift_snapshot() from public;
grant execute on function public.registry_drift_snapshot() to anon, authenticated;
