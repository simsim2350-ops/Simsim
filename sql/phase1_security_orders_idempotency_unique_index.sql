-- Phase 1 Security Audit — applied, then found redundant and reverted.
-- Kept here only as an accurate historical record of what was run against
-- production. See phase1_security_drop_redundant_idempotency_index.sql.
--
-- What happened: this audit initially believed create_order()'s
-- idempotency-key guard (a plain SELECT-then-INSERT check) had no
-- database-level uniqueness behind it, and applied the index below to add
-- one. Live verification immediately after (a controlled test order,
-- documented in SIMSIM_PHASE_1_SECURITY_EXECUTION_REPORT.md §Tests
-- Executed) surfaced that a pre-existing global unique index —
-- orders_idempotency_key_uidx, unique on idempotency_key alone, WHERE NOT
-- NULL — already enforced this exact protection. It did not appear in the
-- earlier pg_constraint check because it is a bare CREATE UNIQUE INDEX, not
-- a table CONSTRAINT (pg_constraint only lists constraint-backed uniques).
--
-- The pre-existing global index is the strictly stronger guarantee (global
-- uniqueness implies per-restaurant uniqueness), so the restaurant-scoped
-- index below was redundant and was dropped in the follow-up migration.

create unique index if not exists orders_restaurant_idempotency_key_uidx
  on public.orders (restaurant_id, idempotency_key)
  where idempotency_key is not null;
