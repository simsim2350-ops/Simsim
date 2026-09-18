-- SimSim — Phase 6, Migration 4.1 — ROLLBACK SCRIPT
-- Fully reverts phase6_migration4_1_loyalty_rate_limiting.sql: drops the
-- rate-limit function and its backing table. Safe to run — nothing else in
-- the codebase references either object except
-- menu-next/app/api/customer/loyalty/handler.js, which must be reverted to
-- its pre-4.1 form (drop the Step 0 rate-limit block and the ipHash.js
-- import) BEFORE running this, or every request to that route will start
-- failing with "function does not exist" instead of degrading gracefully.

begin;

drop function if exists public.check_and_log_loyalty_rate(text, integer, integer);
drop table if exists public.loyalty_lookup_rate_log;

commit;
