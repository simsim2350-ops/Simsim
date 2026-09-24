-- SimSim — Phase 6, Migration 8: Analytics/Customers/Dashboard RPC grants hardening.
--
-- Closes the LOW finding documented in SIMSIM_PRODUCTION_SECURITY_SIGN_OFF.md
-- (§5 Finding #3) and re-investigated in
-- SIMSIM_POST_MIGRATION7_LOW_FINDINGS_REMEDIATION_REPORT.md (Task 1):
-- get_analytics_summary, get_customers_insights, get_customers_summary, and
-- get_dashboard_summary carry an EXECUTE grant to PUBLIC and anon, in
-- addition to authenticated/postgres/service_role — wider than any live
-- caller requires.
--
-- ============================================================================
-- CALLER EVIDENCE (re-verified fresh in this task, not assumed):
--
--   get_analytics_summary   <- src/pages/Analytics.jsx:49  supabase.rpc(...)
--   get_dashboard_summary   <- src/pages/Dashboard.jsx:103 supabase.rpc(...)
--   get_customers_summary   <- src/pages/Customers.jsx:86  supabase.rpc(...)
--   get_customers_insights  <- src/pages/Customers.jsx:87  supabase.rpc(...)
--
-- All four routes (/analytics, /dashboard, /customers — src/App.jsx:245,248,253)
-- are wrapped in <ProtectedRoute><RequirePage ...> — unreachable without an
-- authenticated dashboard session. A repo-wide search (src/, menu-next/,
-- marketing-ssr/, supabase/functions/) found ZERO other callers — no
-- customer-facing (menu-next/marketing-ssr) code, no Edge Function, no other
-- RPC references any of these four names anywhere.
--
-- This matches, independently, the caller-matrix conclusion already reached
-- by SIMSIM_GLOBAL_PUBLIC_EXECUTE_AUDIT_REPORT.md (which classified these
-- four functions "REVIEW" — flagged, not yet actioned — with the identical
-- caller set: src/pages/Analytics.jsx, Customers.jsx, Dashboard.jsx,
-- "authenticated (restaurant staff)"). That audit's REMOVE-CANDIDATE batch
-- (has_feature, menu_branding, claim_next_print_job, _sub_mrr, and the four
-- refresh_* cron functions) was already remediated and applied to Production
-- via sql/phase2_public_execute_hardening_{capability,print_agent,
-- analytics_cron}.sql (see PR #418) — this migration is the equivalent
-- remediation for the four REVIEW-classified functions this task confirmed
-- have no anon-reachable path.
--
-- ============================================================================
-- WHY PUBLIC + anon SPECIFICALLY (not authenticated) IS REVOKED:
--
-- Each function's own internal authorization check
-- (has_restaurant_access(p_restaurant_id) AND
-- member_has_page_access(p_restaurant_id, '<page>')) already fails closed
-- for an anon caller (auth.uid() is null under that role, so both helper
-- functions return false and the function raises 'forbidden'). This means
-- the anon/PUBLIC grant was never exploitable — but per this project's own
-- established principle (reused verbatim from the prior public-execute-
-- hardening batch), an unused grant is removed as defense-in-depth
-- regardless of whether the internal check already covers it: a future
-- refactor of has_restaurant_access, or a copy-paste of one of these
-- functions without its guard clause, would otherwise have no grant-level
-- backstop.
--
-- ============================================================================
-- WHAT IS UNCHANGED:
--   - No function body, signature, SECURITY INVOKER/DEFINER, search_path,
--     or return type is touched.
--   - authenticated, postgres, and service_role grants are left exactly as
--     they are — this migration ONLY revokes PUBLIC and anon.
--   - No RLS policy, no other RPC, no Edge Function, no other table's
--     grants are touched.
-- ============================================================================

revoke execute on function public.get_analytics_summary(uuid, timestamptz, timestamptz, timestamptz, timestamptz, uuid) from public, anon;

revoke execute on function public.get_customers_insights(uuid) from public, anon;

revoke execute on function public.get_customers_summary(uuid) from public, anon;

revoke execute on function public.get_dashboard_summary(uuid, timestamptz, timestamptz) from public, anon;
