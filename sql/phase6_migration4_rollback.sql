-- SimSim — Phase 6, Migration 4 — ROLLBACK SCRIPT
-- Restores get_customer_loyalty's pre-Migration-4 EXECUTE grants.
-- The function DEFINITION/signature/security mode were never changed by
-- Migration 4 — only grants. No CREATE OR REPLACE FUNCTION is needed here.

begin;

grant execute on function public.get_customer_loyalty(uuid, text) to public, anon, authenticated;

commit;
