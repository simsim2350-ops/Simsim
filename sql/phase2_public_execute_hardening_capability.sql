-- Phase 2 — PUBLIC EXECUTE hardening (Group A: Capability functions).
--
-- Independent global audit (SIMSIM_GLOBAL_PUBLIC_EXECUTE_AUDIT_REPORT.md)
-- followed by a second, narrower verification pass
-- (SIMSIM_PUBLIC_EXECUTE_REMEDIATION_PRECHECK_REPORT.md) found that
-- public.has_feature(uuid, text) and public.menu_branding(uuid) both carry
-- an EXECUTE grant to PUBLIC — the default PostgreSQL behavior on function
-- creation, never explicitly revoked — in addition to the explicit
-- `anon, authenticated` grants they actually rely on:
--
--   sql/capability_registry_m1.sql:212 — grant execute on function
--     public.has_feature(uuid, text) to anon, authenticated;
--   sql/menu_branding.sql:64 — GRANT EXECUTE ON FUNCTION
--     public.menu_branding(uuid) TO anon, authenticated;
--
-- Caller evidence (re-verified in the precheck task, not assumed):
--   - has_feature: zero direct `.rpc('has_feature')` caller anywhere in the
--     repo. Called only from within other SECURITY DEFINER functions
--     (menu_capabilities, menu_branding, set_menu_branding_hidden), all
--     owned by postgres — nested calls from a DEFINER function execute in
--     the owner's security context, so anon/authenticated were never
--     actually exercised on this path either; PUBLIC was certainly not.
--   - menu_branding: live direct anon callers (menu-next/lib/data.ts,
--     src/features/menu/hooks/useMenuData.js) and live authenticated
--     callers (src/lib/brandingApi.js, staff dashboard) — both already
--     covered by the explicit grant above, independent of PUBLIC.
--
-- This migration removes ONLY the PUBLIC grant on these two functions.
-- Nothing else changes: not the function body, not the signature, not
-- SECURITY DEFINER, not search_path, not ownership, and NOT the existing
-- anon/authenticated/service_role grants (those are separate, independent
-- ACL entries — revoking PUBLIC does not touch them).

revoke execute on function public.has_feature(uuid, text) from public;

revoke execute on function public.menu_branding(uuid) from public;
