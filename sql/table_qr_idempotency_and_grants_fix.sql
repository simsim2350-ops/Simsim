-- Phase 6, Issue #3 (table-to-invoice) — documents two migrations already
-- applied live via the Supabase MCP connector (explicit approval obtained
-- first) to public.create_order_from_table_qr. This file is a record for
-- version control / future readers; it is idempotent (uses IF EXISTS /
-- CREATE OR REPLACE) so re-running it against the already-migrated database
-- is a no-op.
--
-- Context: create_order_from_table_qr already existed (see
-- sql/table_qr_system.sql) with a correctly-typed (uuid) 8-parameter overload
-- including p_idempotency_key, already threading it into the existing,
-- unmodified create_order() call — this overload was live but dormant (zero
-- callers anywhere in the codebase until this same task wired menu-next's
-- CheckoutForm.tsx to call it for QR-resolved dine-in orders). The only real
-- gap found and fixed here: that overload granted EXECUTE to PUBLIC (any
-- database role), inconsistent with every other function in
-- sql/table_qr_system.sql, which all explicitly revoke PUBLIC and grant only
-- anon/authenticated. Tightened to match — strictly more restrictive, cannot
-- break any caller (anon/authenticated retain access).
--
-- (A separate, incorrectly text-typed duplicate overload was briefly created
-- and immediately dropped again within this same task, before ever being
-- used by any caller — not represented here since it never became part of
-- the database's real, lasting state.)

revoke execute on function public.create_order_from_table_qr(uuid, jsonb, text, text, text, text, numeric, uuid) from public;
grant execute on function public.create_order_from_table_qr(uuid, jsonb, text, text, text, text, numeric, uuid) to anon, authenticated;
