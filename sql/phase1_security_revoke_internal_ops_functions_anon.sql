-- Phase 1 Security Hardening — confirmed risk fix
--
-- get_applied_migrations() (lists every applied migration filename +
-- timestamp from schema_migrations) and registry_drift_snapshot() (lists
-- every feature_flags key + type) were both callable by the anon role with
-- ZERO authentication. Grep across the entire application codebase
-- (src/, menu-next/, marketing-ssr/, supabase/) found no caller of either
-- function anywhere — they are internal ops/dev introspection tools, not
-- used by any product surface. Their anon EXECUTE grant served no product
-- purpose and let anyone anonymously enumerate internal migration
-- filenames (which in this codebase often describe past fixes/incidents by
-- name) and feature-flag keys — reconnaissance-grade information
-- disclosure. Revoked from anon; left reachable for authenticated (no
-- confirmed caller found there either, but not touched here — flagged in
-- the Phase 1 report as a recommendation for the owner to decide, since a
-- possible internal authenticated ops tool outside this repo cannot be
-- ruled out with certainty).
--
-- registry_drift_snapshot's anon grant was a normal per-role grant and the
-- revoke worked directly. get_applied_migrations, like admin_delete_plan
-- earlier in this audit, turned out to carry a blanket `=X/postgres`
-- PUBLIC grant instead — the anon-specific revoke was a no-op (anon
-- inherits via PUBLIC, was never granted directly) until corrected to
-- revoke from PUBLIC, with authenticated's own explicit grant re-affirmed
-- so its access is unchanged.

revoke execute on function public.get_applied_migrations() from anon;
revoke execute on function public.registry_drift_snapshot() from anon;

revoke execute on function public.get_applied_migrations() from public;
grant execute on function public.get_applied_migrations() to authenticated;
