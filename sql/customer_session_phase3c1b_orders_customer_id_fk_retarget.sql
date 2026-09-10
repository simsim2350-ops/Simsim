-- Phase 3C.1b — Retarget orders.customer_id FK from customers(id) to
-- customer_identities(id).
--
-- Per SIMSIM_ORDERS_CUSTOMER_ID_FK_DEPENDENCY_AUDIT_REPORT.md (Option A,
-- approved). Full dependency audit performed before this file was written:
-- orders.customer_id is 100% NULL across all production rows, customers
-- has 0 rows, and zero database objects (policies/views/triggers/other
-- functions) or application code reference either — this FK was the only
-- one in the entire schema still pointing at the legacy customers table;
-- every sibling customer_id FK (customer_sessions, restaurant_customers,
-- customer_phone_verifications) already points to customer_identities.
--
-- No data migration needed or performed (nothing to migrate — the column
-- is entirely NULL). No index change (none existed, none required). The
-- legacy customers table itself is not read, written, altered, or
-- dropped — only the one dangling reference into it is removed.

alter table public.orders
  drop constraint orders_customer_id_fkey;

alter table public.orders
  add constraint orders_customer_id_fkey
  foreign key (customer_id) references public.customer_identities(id)
  on delete set null;
