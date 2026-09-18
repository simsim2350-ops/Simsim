-- SimSim — Phase 6, Migration 5.0 — ROLLBACK SCRIPT
-- Fully reverts phase6_migration5_0_dashboard_login_rate_limiting.sql: drops
-- both functions and both tables created by that migration. Touches nothing
-- else — no business data, no other table, no other function, no RLS
-- policy outside these two new tables.
--
-- menu-next/authStore.js's signIn() (Migration 5.0's frontend change) and
-- the dashboard-login-guard Edge Function must be reverted to their pre-
-- Migration-5.0 form BEFORE running this, or the frontend will call an
-- Edge Function whose underlying DB functions no longer exist, and every
-- login attempt will fail closed (per Migration 5.0's own fail-closed
-- design) instead of degrading gracefully.

begin;

drop function if exists public.record_dashboard_login_outcome(text, text, boolean);
drop function if exists public.check_dashboard_login_allowed(text, text);
drop table if exists public.dashboard_login_attempts;
drop table if exists public.dashboard_login_lockouts;

commit;
