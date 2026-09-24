-- ============================================================================
-- Rollback for phase6_migration8_analytics_rpc_grants_hardening.sql
-- ----------------------------------------------------------------------------
-- Restores the PUBLIC and anon EXECUTE grants on get_analytics_summary,
-- get_customers_insights, get_customers_summary, and get_dashboard_summary
-- to their exact pre-Migration-8 state.
--
-- ⚠️ Restores the LOW finding documented in
-- SIMSIM_PRODUCTION_SECURITY_SIGN_OFF.md (§5 Finding #3) and
-- SIMSIM_POST_MIGRATION7_LOW_FINDINGS_REMEDIATION_REPORT.md (Task 1): these
-- four functions would once again be EXECUTE-able by PUBLIC/anon, wider than
-- any live caller requires (though not itself exploitable, since each
-- function's internal has_restaurant_access/member_has_page_access check
-- fails closed for an anon caller regardless of this grant). Use only for
-- verified rollback testing or an explicit owner-directed revert.
-- ============================================================================

grant execute on function public.get_analytics_summary(uuid, timestamptz, timestamptz, timestamptz, timestamptz, uuid) to public;

grant execute on function public.get_customers_insights(uuid) to public;

grant execute on function public.get_customers_summary(uuid) to public;

grant execute on function public.get_dashboard_summary(uuid, timestamptz, timestamptz) to public;
