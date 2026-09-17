-- Phase 2 — PUBLIC EXECUTE hardening (Group C: Internal Analytics / Cron).
--
-- Independent global audit (SIMSIM_GLOBAL_PUBLIC_EXECUTE_AUDIT_REPORT.md)
-- followed by a second, narrower verification pass
-- (SIMSIM_PUBLIC_EXECUTE_REMEDIATION_PRECHECK_REPORT.md) found that all
-- five functions below carry an EXECUTE grant to PUBLIC, with zero live
-- application caller anywhere in the repository (menu-next/, src/,
-- marketing-ssr/, supabase/, print-agent/ — all searched, none found).
--
-- Confirmed dependency chain (read directly from production, including the
-- live pg_cron schedule, not just repository text):
--
--   cron.job (jobid=1, active=true, schedule '*/10 * * * *',
--             command: select public.refresh_platform_metrics();)
--     -> refresh_platform_metrics()
--          -> refresh_restaurant_stats()   -> _sub_mrr(...)
--          -> refresh_platform_daily_metrics()
--          -> refresh_analytics_rollups()
--
-- All five are owned by postgres. pg_cron jobs in this project run as the
-- role that scheduled them (postgres), and nested calls from within a
-- SECURITY DEFINER function inherit the owner's security context — so the
-- only role that ever actually executes this chain is postgres, which
-- already has EXECUTE unconditionally as owner regardless of any grant to
-- other roles. PUBLIC (like anon/authenticated/service_role) was never
-- exercised on this path; it exists only because PostgreSQL grants EXECUTE
-- to PUBLIC by default on function creation and nobody revoked it.
--
-- This migration removes ONLY the PUBLIC grant on these five functions.
-- Nothing else changes: not any function body, not any signature, not
-- SECURITY DEFINER, not search_path, not ownership, and NOT the existing
-- anon/authenticated/service_role grants. The cron schedule and command
-- (cron.job, jobid=1) are not touched by this migration in any way.

revoke execute on function public._sub_mrr(numeric, text, text) from public;

revoke execute on function public.refresh_analytics_rollups() from public;

revoke execute on function public.refresh_platform_daily_metrics() from public;

revoke execute on function public.refresh_platform_metrics() from public;

revoke execute on function public.refresh_restaurant_stats() from public;
