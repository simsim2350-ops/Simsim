-- Phase 1 Security Audit — drops the index added by
-- phase1_security_orders_idempotency_unique_index.sql, found redundant
-- moments after being applied: a pre-existing global unique index
-- (orders_idempotency_key_uidx, unique on idempotency_key alone, WHERE NOT
-- NULL) already enforced this exact protection and is strictly stronger
-- (global uniqueness implies per-restaurant uniqueness). See
-- SIMSIM_PHASE_1_SECURITY_EXECUTION_REPORT.md for the full account.

drop index if exists public.orders_restaurant_idempotency_key_uidx;
