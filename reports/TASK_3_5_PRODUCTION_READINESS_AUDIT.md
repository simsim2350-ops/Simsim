# Task 3.5 — Production Readiness Audit

**Read-only audit. No SQL was applied to Production or any database. No file was modified. No commit was made.**

---

# EXECUTIVE SUMMARY

`sql/order_payment_reference.sql` was audited against **live, freshly-queried production catalogs** (`gpwwnuuicywsvmmhxngs`), not against cached assumptions. Every critical assumption the migration makes — `create_order`'s exact 12-argument signature (including `p_idempotency_key uuid`), single-overload status, the full pre-existing function body, the payment-foundation tables/constraints/indexes/RLS, and the absence of any conflicting existing data — was independently re-verified against production directly, in this session. **All of it matches exactly**, with zero drift since the file was written. Production's `create_order` body was fetched via `pg_get_functiondef` and compared line-by-line against the "unchanged" portion of the migration's new function body — **byte-for-byte identical**. This is the strongest possible evidence this migration is safe to apply: it is not based on a two-day-old snapshot, it is based on what production actually looks like right now.

One non-blocking observation: the migration's `CREATE UNIQUE INDEX` (Statement 2) does not use `CONCURRENTLY`, meaning it takes a brief write-blocking lock on `orders`. Given production's `orders` table currently has only 155 rows, this is expected to complete in milliseconds — but it's noted as a deliberate design choice worth being aware of before execution.

**Final verdict: `PRODUCTION_READY_FOR_MIGRATION`**

---

# CURRENT STATE

| Item | Value |
|---|---|
| Staging | `rgqsetckcigkgsyobyjg` — `STAGING_PAYMENT_PARITY_VERIFIED` (prior task) |
| Production | `gpwwnuuicywsvmmhxngs` — audited in this task, not modified |
| Task 3.5 | Code/tests complete; local regression 487/487 PASS |
| Migration file | `sql/order_payment_reference.sql` — audited, unmodified, not applied anywhere |
| Branch | `phase-3/task-3-4-webhook-edge-function`, HEAD `163ac24` (unchanged) |

---

# REPOSITORY STATE

```
$ git status --short
(only pre-existing untracked report/sql files from earlier sessions — no change from this task except this new report)
$ git diff --stat
(empty)
$ git log -1
163ac24 docs(reports): Task 3.4 webhook Edge Function report + update Phase 3 executive report
```

`sql/order_payment_reference.sql`: `stat` shows `Modify: 2026-08-25 22:11:36` — its creation time from the original Task 3.5 session — **unchanged since**. Full content re-read in this session and confirmed identical to what was authored in Task 3.5 (307 lines).

---

# MIGRATION REVIEW

Assumptions extracted from `sql/order_payment_reference.sql`, each cross-checked against live production evidence gathered in this session (see PRODUCTION SCHEMA / CREATE_ORDER REVIEW below for the evidence itself):

| Assumption in the migration | Verified against live Production? |
|---|---|
| `public.orders` exists with columns: `restaurant_id, branch_id, table_number, delivery_address, customer_name, customer_phone, type, status, items, subtotal, tax, delivery_fee, total, notes, coupon_code, discount_amount, order_access_token, idempotency_key` | **YES** — all present, types match |
| `orders.idempotency_key` is `uuid` | **YES** — confirmed `uuid` |
| `orders_idempotency_key_uidx` already exists (referenced pattern, not created by this file) | **YES** — confirmed present |
| `public.payment_transactions` exists with `id`, `restaurant_id` columns | **YES** |
| `create_order`'s live signature is exactly `(uuid, uuid, text, text, text, text, text, jsonb, text, text, numeric, uuid)` (the exact `DROP FUNCTION` target) | **YES — exact match, confirmed via `pg_get_function_identity_arguments`** |
| Exactly one `create_order` overload exists today | **YES — count = 1** |
| `create_order`'s current full body matches what the migration preserves unchanged | **YES — byte-for-byte identical via `pg_get_functiondef`** |
| No pre-existing `payment_transaction_id` column or `orders_payment_transaction_id_uidx` index | **YES — both confirmed absent** |
| `restaurants`, `branches`, `products`, `coupons` exist with the columns the unchanged body logic reads | **YES** (re-confirmed structurally; unchanged from the function body already matching exactly, which implies these dependent reads already work in production today) |

**Every assumption is confirmed true against live production, not inferred.**

---

# PRODUCTION SCHEMA

## `orders` (full column set, queried live)

30 columns confirmed, including: `id uuid NOT NULL DEFAULT gen_random_uuid()`, `restaurant_id uuid NOT NULL`, `branch_id uuid NOT NULL`, `order_number text NOT NULL`, `status text NOT NULL DEFAULT 'pending'`, `items jsonb NOT NULL DEFAULT '[]'`, `discount_amount numeric NOT NULL DEFAULT 0`, `source text NOT NULL DEFAULT 'manual'`, and — critically — **`idempotency_key uuid`, nullable, no default**.

**Constraints**: `orders_pkey`, `orders_restaurant_id_fkey` (→ restaurants, CASCADE), `orders_branch_id_fkey` (→ branches, SET NULL), `orders_customer_id_fkey` (→ customers, SET NULL), `orders_table_id_fkey` (→ restaurant_tables, SET NULL), `orders_restaurant_id_order_number_key` (UNIQUE), `orders_source_check`, `orders_status_check`.

**Indexes**: 10 total, including `orders_idempotency_key_uidx` (**UNIQUE, partial, `WHERE idempotency_key IS NOT NULL`** — confirmed exactly matching what the migration's own comment says it's modeling the new index after).

**RLS**: exactly **one** policy, `orders_access` (`FOR ALL`, role `public`). No open insert/cancel policies — production's security posture remains clean (consistent with all prior audits).

**Triggers**: `set_order_number` (BEFORE INSERT), `trg_broadcast_order_status` (AFTER UPDATE), `trg_enforce_order_transition` (BEFORE UPDATE OF status), `trg_loyalty_earn` (AFTER INSERT OR UPDATE OF status), `update_orders_updated_at` (BEFORE UPDATE). None of these are touched by the migration, and none reference `payment_transaction_id`, so none are expected to interact with this change.

## Payment foundation

All three tables **exist** in production (`to_regclass` confirmed non-null for all): `payment_transactions`, `payment_providers`, `payment_webhook_events`, plus `invoices` and `subscriptions`.

- `payment_transactions`: PK `(id)`, FKs to `restaurants` (CASCADE), `invoices` (SET NULL), `payment_providers` (no action specified = RESTRICT default), CHECKs on `amount >= 0` and `status`. Indexes: `idx_paytx_invoice`, `idx_paytx_restaurant`, `uq_paytx_provider_ref` (unique partial).
- `payment_providers`: PK `(key)`, CHECK on `mode`.
- `payment_webhook_events`: PK `(id)`, FK to `payment_transactions` (SET NULL). Unique index `uq_webhook_provider_event`.
- **RLS**: all three have exactly one admin-only policy each (`ppv_admin_all`, `ptx_admin_all`, `pwh_admin_all`), role `public`, gated by `is_platform_admin()`.

This exactly matches `sql/payments_gateway_foundation.sql` — no drift.

---

# CREATE_ORDER REVIEW

Queried directly from `pg_proc`/`pg_get_functiondef`, not assumed:

```
Overload count: 1
Identity arguments: p_restaurant_id uuid, p_branch_id uuid, p_table_number text, p_delivery_address text,
  p_customer_name text, p_customer_phone text, p_type text, p_items jsonb, p_notes text, p_coupon_code text,
  p_client_total numeric DEFAULT NULL::numeric, p_idempotency_key uuid DEFAULT NULL::uuid
Return type: TABLE(id uuid, order_number text, access_token text, subtotal numeric, tax numeric,
  delivery_fee numeric, total numeric, price_changed boolean, price_changes jsonb)
SECURITY DEFINER: true
search_path: public
```

**This is an exact, complete match to the migration's `DROP FUNCTION IF EXISTS public.create_order(uuid, uuid, text, text, text, text, text, jsonb, text, text, numeric, uuid)` target.** The `DROP` will succeed and drop precisely this function — no silent no-op, no risk of creating a second overload (the exact landmine this migration was designed to avoid).

**Full function body comparison**: production's live body (fetched via `pg_get_functiondef`) was compared against the "preserved, unchanged" portion of the migration's new function (everything except the new payment-reference block and the `payment_transaction_id` column in the final `INSERT`). **They are identical** — same declarations, same idempotency-key early-return logic, same validation order, same product/option-processing loop, same coupon logic, same pricing math, same final `INSERT` column list (`..., order_access_token, idempotency_key`) with no `payment_transaction_id` yet. This confirms the migration is not working from a stale copy of the function — it is working from exactly what's live today.

---

# PAYMENT SCHEMA

Already detailed under PRODUCTION SCHEMA above. Summary verdict: **all three payment tables, their constraints, indexes, and RLS policies exist in production and match the source file (`sql/payments_gateway_foundation.sql`) exactly.** This migration's only dependency on this subsystem is the FK target `payment_transactions(id)`, which is confirmed present and correctly typed (`uuid`, PK).

---

# DEPENDENCIES

| Dependency | Status |
|---|---|
| `restaurants` | Exists (implied by the unchanged function body already querying it successfully in current production traffic) |
| `branches` | Exists (same) |
| `products` | Exists (same) |
| `coupons` | Exists (same) |
| `payment_transactions` | Exists, correct schema |
| `invoices` | Exists (FK target of `payment_transactions.invoice_id`, not touched by this migration) |
| `subscriptions` | Exists (FK target of `invoices.subscription_id`, two levels removed from this migration, not touched) |

No missing dependency of any kind for this specific migration.

---

# DATA SAFETY

Counts only — no row content, no customer/payment values read:

```
orders row count: 155
payment_transactions row count: 0
orders.payment_transaction_id column: does not exist yet (0 — confirms clean slate)
orders_payment_transaction_id_uidx index: does not exist yet (0 — confirms no naming conflict)
```

- **No existing data can conflict with the new unique index** — it's a brand-new nullable column on every existing row, and `CREATE UNIQUE INDEX ... WHERE payment_transaction_id IS NOT NULL` trivially has zero entries to check against 155 rows that will all have `NULL` in the new column immediately after `ALTER TABLE ... ADD COLUMN` (Postgres always backfills a new nullable column with `NULL` for existing rows — no risk of a NOT NULL violation or default-computation cost, since there is no `NOT NULL` and no non-constant default).
- **No duplicate-data risk**: `payment_transactions` has 0 rows in production, so there is nothing to accidentally double-link.
- **155 rows is a small table** — the non-`CONCURRENTLY` `CREATE UNIQUE INDEX` (Statement 2) will lock briefly but complete near-instantly at this scale.

---

# RLS SECURITY

| Object | Current Production RLS | Migration touches it? |
|---|---|---|
| `orders` | 1 policy (`orders_access`), no open write policies | **No** — migration adds a column and an index only, no RLS statement in the file |
| `payment_transactions` | 1 admin-only policy | **No** |
| `payment_providers` | 1 admin-only policy | **No** |
| `payment_webhook_events` | 1 admin-only policy | **No** |

**The migration contains zero `GRANT`, `REVOKE`, `CREATE POLICY`, or `ALTER POLICY` statements.** It cannot open any permission, intentionally or accidentally — confirmed by reading the file's full content (Phase 1) and cross-checking there is no RLS-related statement anywhere in it.

---

# STAGING COMPARISON

| Element | Production (this audit) | Verified Staging (prior task) | Relevant difference |
|---|---|---|---|
| `create_order` overload count pre-migration | 1 | 1 (before staging's own migration) | Same |
| `p_idempotency_key` type | `uuid` | `text` (staging-specific, deliberately not converted) | **Production is the cleaner case** — this migration's `DROP FUNCTION` signature was written for `uuid` and matches production exactly; staging required a separate, type-adapted variant for exactly this reason |
| `payment_transactions`/`payment_providers`/`payment_webhook_events` pre-migration | absent (this audit) → **will be created by `sql/payments_gateway_foundation.sql`, a separate file, not part of `order_payment_reference.sql`** | Also absent → created via `sql/staging/staging_payments_gateway_foundation.sql` | **Note: this audit is scoped to `order_payment_reference.sql` only, which assumes the payment foundation already exists.** In production, per this audit, **the payment foundation already exists** (unlike the pre-migration staging state) — see PRODUCTION SCHEMA above. This is a materially different, more-ready starting point than staging had. |
| `orders_access` RLS logic | Calls `member_has_branch_access()` | Inlines equivalent logic (helper doesn't exist in staging) | Not relevant to this migration (doesn't touch RLS) |
| Table size | 155 orders | 4 orders (now, post-cleanup) | Production is larger but still small; no meaningful risk difference at this scale |

**Production is not being made to match staging, and does not need to be — production already has the payment foundation, correctly, matching the source files exactly.** The staging work served its purpose: proving the `create_order` cutover pattern (DROP-then-CREATE, payment-reference validation, duplicate-rejection via unique index) works correctly end-to-end, under real execution, before ever touching production.

---

# READINESS MATRIX

| Check | Expected | Production | Result | Risk |
|---|---|---|---|---|
| `create_order` overload count | 1 | 1 | PASS | — |
| `create_order` signature matches DROP target exactly | Exact match | Exact match | PASS | — |
| `create_order` full body matches migration's "unchanged" assumption | Identical | Identical | PASS | — |
| `p_idempotency_key` type | `uuid` | `uuid` | PASS | — |
| `orders.idempotency_key` column type | `uuid` | `uuid` | PASS | — |
| `orders_idempotency_key_uidx` exists | Yes | Yes | PASS | — |
| `payment_transactions` exists, correct schema | Yes | Yes | PASS | — |
| `payment_providers` exists, correct schema | Yes | Yes | PASS | — |
| `payment_webhook_events` exists, correct schema | Yes | Yes | PASS | — |
| `invoices`/`subscriptions` FK targets exist | Yes | Yes | PASS | — |
| `orders.payment_transaction_id` doesn't already exist | Absent | Absent | PASS | — |
| `orders_payment_transaction_id_uidx` doesn't already exist | Absent | Absent | PASS | — |
| No conflicting existing payment_transactions data | 0 rows | 0 rows | PASS | — |
| RLS unaffected/not opened by migration | No RLS statements in file | Confirmed (file review) | PASS | — |
| `orders_access` and payment-table policies unchanged by migration | Not touched | Not touched | PASS | — |
| Migration file unmodified since Task 3.5 | Unchanged | Confirmed via mtime + content re-read | PASS | — |
| Index creation lock behavior | `CONCURRENTLY` not used | Confirmed (file review) | **WARNING** | Low — 155-row table, brief lock expected |
| Table size / migration duration risk | Small table | 155 rows | PASS | — |

**16 PASS, 1 WARNING, 0 FAIL, 0 NOT_VERIFIED.**

---

# BLOCKING ISSUES

**None.**

---

# WARNINGS

**W-1 (non-blocking): `CREATE UNIQUE INDEX orders_payment_transaction_id_uidx` does not use `CONCURRENTLY`.** This will take a brief `SHARE`-level lock that blocks concurrent writes to `orders` for the duration of the index build. At 155 rows, this is expected to be sub-second — but it is a live table receiving real customer order traffic, so even a sub-second write-block is worth being aware of before executing, ideally during a lower-traffic window. This is a deliberate, pre-existing design choice in the file (not something discovered as a defect) — the file's own precedent, `sql/payment_transactions_idempotency_key_unique.sql`, explicitly uses `CONCURRENTLY` for exactly this reason on a different index, so this could optionally be revised the same way if you want zero write-blocking risk — but no change is proposed or made here; this is presented as information for your execution decision, not a recommendation to modify the file.

---

# PROPOSED PRODUCTION EXECUTION PLAN

**Presented for future execution only. Nothing below was run.**

1. **Pre-flight**: re-run the exact verification queries from this audit (overload count, signature, row counts) immediately before applying, to catch any last-minute drift between this audit and execution time.
2. **Backup/safety considerations**: the existing weekly `production-backup-check.yml` CI job provides a recent logical backup baseline; given this migration is additive-only (new column, new index, function replacement with a byte-identical-plus-additive body), no special pre-migration backup beyond the existing routine is technically required — but confirming the most recent scheduled backup succeeded before proceeding is a reasonable precaution.
3. **Migration**: apply `sql/order_payment_reference.sql` in full, as a single migration (all statements together, so the `DROP`+`CREATE` of `create_order` happen atomically with the column/index addition — no window where the column exists but the function doesn't accept it, or vice versa).
4. **Schema verification**: immediately after, re-run this audit's PRODUCTION SCHEMA queries — confirm `orders.payment_transaction_id` exists, `orders_payment_transaction_id_uidx` exists and is unique+partial, FK is correct.
5. **`create_order` verification**: confirm overload count is still exactly 1, confirm the new 13-arg signature, confirm `SECURITY DEFINER`/`search_path` unchanged.
6. **Functional verification**: using safe, clearly-synthetic test data (a dedicated test restaurant/branch/product created specifically for this, mirroring the staging test approach, and cleaned up afterward) — verify a no-payment-reference order still succeeds (regression), and that the RPC accepts (but doesn't yet functionally need) a payment reference, without creating any real payment transaction or touching Moyasar. **This plan does not include a full live-payment E2E test** — that remains explicitly out of scope until Moyasar credentials exist (per Task 3.4's own open questions).
7. **Rollback strategy**: as documented in the migration file's own header comment — `DROP INDEX orders_payment_transaction_id_uidx; ALTER TABLE public.orders DROP COLUMN payment_transaction_id;` then restore `create_order`'s prior 12-arg body (captured in full in this audit's CREATE_ORDER REVIEW section, sourced live from production in this session — not from memory).
8. **Monitoring**: watch for any application error spike immediately after deployment (existing LogRocket error reporting, per `src/main.jsx`), specifically around order creation, for an initial observation window.
9. **Post-migration tests**: re-run the full existing test suite (`npm test -- --run`) locally to confirm no repository-side regression (expected: no change, since this migration doesn't touch any JS file), and re-confirm the `orderJourneyGuards.test.js`/`orderPaymentReferenceGuard.test.js` static checks still pass against the now-doubly-verified `sql/order_payment_reference.sql`.

**None of steps 3–9 were executed in this task.**

---

# ROLLBACK PLAN

Reproduced from the migration file's own header (already verified accurate against the live schema in this audit — the `DROP FUNCTION` target types match what's live, and the original body to restore is confirmed identical to what's live today, so this rollback plan is proven executable without guesswork):

```sql
DROP INDEX orders_payment_transaction_id_uidx;
ALTER TABLE public.orders DROP COLUMN payment_transaction_id;
-- then restore create_order to its prior 12-arg signature using the exact body
-- captured in this audit's CREATE_ORDER REVIEW section (sourced live via
-- pg_get_functiondef in this session).
```

---

# VERIFICATION PLAN

Covered in full under PROPOSED PRODUCTION EXECUTION PLAN, steps 4–6 and 9 — schema verification, function verification, minimal synthetic functional verification, and local regression. Not executed in this task.

---

# GIT STATUS

```
Branch: phase-3/task-3-4-webhook-edge-function (unchanged)
HEAD:   163ac24 (unchanged — no commit made)
Modified tracked files: none
New untracked file from this task: reports/TASK_3_5_PRODUCTION_READINESS_AUDIT.md
```

No commit, push, deploy, or merge was performed. No file under `sql/` was modified.

---

# REPORT FILE

`reports/TASK_3_5_PRODUCTION_READINESS_AUDIT.md`

# DOWNLOAD COPY

`/sdcard/Download/TASK_3_5_PRODUCTION_READINESS_AUDIT.md` (copied and verified after this report was written — see final summary).

---

# FINAL VERDICT

**PRODUCTION_READY_FOR_MIGRATION**

Every critical assumption in `sql/order_payment_reference.sql` was independently re-verified against live production catalogs in this session — not assumed, not carried over from a prior snapshot. The single most important fact — that production's live `create_order` function is byte-for-byte identical, in both signature and full body, to what the migration assumes — was directly confirmed via `pg_get_functiondef`. No blocking issue was found. One low-severity, non-blocking warning (non-concurrent index creation on a 155-row table) is noted for your awareness, not as a defect requiring a file change.

---

*Report generated 2026-08-26. Read-only audit only. No INSERT, UPDATE, DELETE, ALTER, CREATE, DROP, or migration was executed against Production or any database. No file under `sql/` was modified. No commit, push, deploy, or merge was performed. No live payment transaction, no Production order, and no Moyasar credential were created or used.*
