# Staging Schema Parity Audit — Repository vs Production vs Staging

## EXECUTIVE SUMMARY

This audit compares the order/payment-related schema across three sources: the SQL files tracked in this repository (`sql/`), the live **production** database (`gpwwnuuicywsvmmhxngs`), and the live **staging** database (`simsim-menu-staging` / `rgqsetckcigkgsyobyjg`). All access was read-only; nothing was created, altered, dropped, or written anywhere.

**Headline finding:** the repository's `sql/order_payment_reference.sql` (Task 3.5) is **correctly designed for production** — production's live `create_order` signature matches the migration's assumptions exactly, byte for byte. The migration is **not safe to apply to staging as-is**, because staging's schema has independently diverged from both the repository and production in several material ways, most importantly: `payment_transactions` (and the rest of the payment foundation) does not exist in staging at all, and staging's `create_order` has a different parameter type (`text` vs `uuid`) than what the migration's `DROP FUNCTION` targets.

**A second, unrelated but serious finding surfaced during this audit:** staging's `orders` table currently has an **open, unauthenticated INSERT policy** (`orders_insert_public`, `with_check: true`, role `public`) and an open UPDATE/cancel policy (`orders_cancel_public`). Production closed these exact two policies as a documented security fix (`sql/order_journey_hotfix.sql`, MIG-003/MIG-004, referencing incidents SEC-001/SEC-002) — staging never received that fix. This is a real, currently-live vulnerability in staging, discovered incidentally while investigating Task 3.5's applicability. Per this task's instructions, it is documented here only — **not fixed**.

---

## AUDIT OBJECTIVE

Determine, with evidence (not assumption), whether `simsim-menu-staging` can safely verify Task 3.5's migration, or whether staging needs parity work first, or whether a fresh sandbox should be created instead. Purely read-only; no fix, no migration, no schema change, of any kind, anywhere.

---

## ENVIRONMENTS

| Environment | ID | Confirmed via |
|---|---|---|
| Repository | `/data/data/com.termux/files/home/simsim`, branch `phase-3/task-3-4-webhook-edge-function`, HEAD `163ac24` | `git status`/`git log` (this session) |
| Production | `gpwwnuuicywsvmmhxngs` (project name `simsim`) | `sql/order_idempotency.sql` header comment explicitly names this ID as production; confirmed ACTIVE_HEALTHY via `list_projects` |
| Staging | `rgqsetckcigkgsyobyjg` (project name `simsim-menu-staging`) | Identified by matching ~70 migration names to features/reports already in this repo (e.g. `staging_billing_foundation_restore`, `marketing_cms_ssr_v1`) |
| (Excluded) | `fklbydlnmksyrcdsvhgo` (`madar`, INACTIVE) | Unrelated project — not queried at all in this or any prior task |

Connection method: Supabase MCP tool integration (a separate, already-authenticated channel — no credentials, keys, or connection strings were viewed or printed at any point in this session; confirmed by reviewing every tool call made).

---

## REPOSITORY BASELINE

Read directly in this session (all files in `sql/` touching orders/payments/`create_order`):

| File | What it defines |
|---|---|
| `sql/table_qr_system.sql` | Original QR system: `restaurant_tables` gains `branch_id`/`qr_token`/`qr_enabled`; `orders` gains `table_id`/`table_name`/`source` + `orders_source_check`; **creates** `orders_insert_public` policy (`WITH CHECK (table_id IS NULL AND source = 'manual')`) and defines the original 7-arg `create_order_from_table_qr`. |
| `sql/order_journey_hotfix.sql` (ADR-44, "PHASE 1 Hotfix") | Fixes a `create_order` coupon-variable bug (MIG-001); fixes `broadcast_order_status` to use `realtime.send` instead of nonexistent `realtime.broadcast` (MIG-002); **`DROP POLICY orders_cancel_public` + `REVOKE INSERT,UPDATE,DELETE ON orders FROM anon`** (MIG-003, closing SEC-001); **`DROP POLICY orders_insert_public`** (MIG-004, closing SEC-002 — explicitly documents that this policy "كانت تسمح بإدخال طلبات مزوَّرة", i.e. allowed forging arbitrary orders). |
| `sql/order_idempotency.sql` (ADR-47, "PHASE 4/TASK-ORD-002") | Current live `create_order`: 12 params ending `p_client_total numeric DEFAULT NULL, p_idempotency_key uuid DEFAULT NULL`; adds `orders.idempotency_key uuid` + `orders_idempotency_key_uidx` (unique, partial, global). Also updates `create_order_from_table_qr` to 8 params (adds `p_idempotency_key`). Header comment explicitly documents the overload landmine (superseded 11/7-arg versions had to be dropped separately) and explicitly names `gpwwnuuicywsvmmhxngs` as the production database this was executed on. |
| `sql/order_number_atomic.sql` (ADR-47, "TASK-ORD-003") | Adds `orders_restaurant_id_order_number_key UNIQUE (restaurant_id, order_number)`; replaces `generate_order_number()` to use `pg_advisory_xact_lock` + `max()+1` instead of `COUNT(*)+1` (race-condition fix). This is a trigger function, fired by a `BEFORE INSERT` trigger (not shown in this file, but confirmed live in production — see below). |
| `sql/order_state_machine.sql` (ADR-50, "PHASE 5") | Adds `orders_status_check` CHECK constraint + `enforce_order_transition()` trigger function + `trg_enforce_order_transition` (BEFORE UPDATE OF status). |
| `sql/payments_gateway_foundation.sql` (ADR-34) | Creates `payment_providers`, `payment_transactions`, `payment_webhook_events` — all RLS-enabled, admin-only policies (`is_platform_admin()`). Seeds 5 disabled providers. |
| `sql/payment_transactions_idempotency_key_unique.sql` | **Explicitly marked "OWNER/DBA GATE — لا تُطبَّق هذه الهجرة تلقائياً"** (not to be auto-applied). Proposes `uq_paytx_idempotency_key` unique partial index. Not yet applied anywhere per this audit. |
| `sql/order_payment_reference.sql` (Task 3.5, this session's prior work) | Adds `orders.payment_transaction_id` + FK to `payment_transactions(id)` + `orders_payment_transaction_id_uidx` (unique, partial); `DROP FUNCTION` + `CREATE OR REPLACE` cutover of `create_order` to 13 params (adds `p_payment_transaction_id uuid DEFAULT NULL`). Explicitly not applied anywhere — written and statically tested only. |
| `sql/billing_foundation.sql` | Creates `subscriptions`, `invoices`, `payments` (platform/SaaS billing — restaurant paying SimSim, unrelated to customer order payment). `invoices.subscription_id` FK confirms this scope. |

I did not assume any of the above reflects live state — every claim below about production/staging was independently re-verified against the live catalogs, not inferred from these files.

---

## PRODUCTION BASELINE

All read live via `pg_proc`, `pg_policies`, `pg_indexes`, `pg_constraint`, `pg_trigger`, and `list_tables(verbose=true)` against `gpwwnuuicywsvmmhxngs`, in this session.

- **`create_order`**: exactly **one** overload exists. Arguments: `p_restaurant_id uuid, p_branch_id uuid, p_table_number text, p_delivery_address text, p_customer_name text, p_customer_phone text, p_type text, p_items jsonb, p_notes text, p_coupon_code text, p_client_total numeric, p_idempotency_key uuid`. `security_definer=true`, `config=["search_path=public"]`. **This matches `sql/order_idempotency.sql` and the Task 3.5 migration's `DROP FUNCTION` target signature exactly, including the `uuid` type on the last parameter.**
- **`create_order_from_table_qr`**: exactly one overload, 8 params ending `p_client_total numeric, p_idempotency_key uuid`, `security_definer=true`, `search_path=""`. Matches `sql/order_idempotency.sql`.
- **`orders`** table: 29 columns including `idempotency_key uuid`, `table_id`/`table_name`/`source` (QR support present), no `payment_transaction_id` yet (expected — Task 3.5 not applied). `status` has CHECK constraint `orders_status_check` (5 values). `source` has CHECK `orders_source_check`.
- **Triggers on `orders`**: `set_order_number` (BEFORE INSERT → `generate_order_number()`), `trg_broadcast_order_status` (AFTER UPDATE), `trg_enforce_order_transition` (BEFORE UPDATE OF status — the state-machine guard), `trg_loyalty_earn`, `update_orders_updated_at`.
- **Indexes on `orders`**: includes `orders_idempotency_key_uidx` (unique, partial, global on `idempotency_key`), `orders_restaurant_id_order_number_key` (unique on `restaurant_id, order_number`), `orders_order_access_token_uidx`, plus several non-unique lookup indexes. **No `orders_payment_transaction_id_uidx`** (expected — Task 3.5 not applied).
- **RLS policies on `orders`**: exactly **one** — `orders_access` (`FOR ALL`, role `public`, `has_restaurant_access(restaurant_id) AND member_has_branch_access(restaurant_id, branch_id)`). **No `orders_insert_public` or `orders_cancel_public`** — confirms `sql/order_journey_hotfix.sql`'s MIG-003/MIG-004 closures are live and effective in production.
- **`payment_transactions` / `payment_providers` / `payment_webhook_events`**: all three exist, schema matches `sql/payments_gateway_foundation.sql` exactly (columns, CHECK constraints, FKs — `payment_transactions_invoice_id_fkey → invoices`, `payment_transactions_provider_fkey → payment_providers(key)`, `payment_webhook_events_transaction_id_fkey → payment_transactions`). RLS: each has exactly one `*_admin_all` policy (admin-only). Indexes match the file (`uq_paytx_provider_ref`, `uq_webhook_provider_event`, etc.). **`uq_paytx_idempotency_key` does not exist** — confirms the OWNER/DBA-gated migration is still pending, consistent with the Task 3.3/3.4 reports.
- **Migration history** (`list_migrations`, 106 entries): includes `payments_gateway_foundation`, `mig_001_fix_create_order_coupon_var`, `mig_002_fix_broadcast_order_status`, `mig_003_close_orders_cancel_public`, `mig_004_close_orders_insert_public`, `mig_005_order_idempotency_column`, `mig_005_create_order_idempotent`, `mig_005_create_order_from_qr_idempotent`, `mig_005_fix_drop_stale_create_order_overloads`, `mig_007_orders_status_check_not_null`, `mig_008_enforce_order_transition`, `mig_009_order_number_atomic`, `table_qr_system`, `000_schema_migrations_table`. This is a clean, complete history matching the repository's `sql/` files for this domain — **no unexplained divergence found between the repository and production** for anything Task 3.5 touches.

**Conclusion: production is in the exact state the repository's `sql/` files (and therefore the Task 3.5 migration) assume.**

---

## STAGING BASELINE

All read live via the same catalog queries against `rgqsetckcigkgsyobyjg`, in this session.

- **`create_order`**: exactly one overload (no pre-existing duplicate-overload problem). Arguments: `p_restaurant_id uuid, p_branch_id uuid, p_table_number text, p_delivery_address text, p_customer_name text, p_customer_phone text, p_type text, p_items jsonb, p_notes text, p_coupon_code text, p_client_total numeric, p_idempotency_key text`. **Last parameter is `text`, not `uuid`.**
- **`create_order_from_table_qr`**: **does not exist under this name.** A follow-up query for any function containing `order` or `qr` in its name found: `broadcast_order_status`, `broadcast_restaurant_orders`, `can_read_guest_order_status`, `can_read_order_status`, `cancel_order_by_customer`, `create_order`, `get_orders_status_secure`, `loyalty_on_order_completed`, `marketing_reorder_sections`. No QR-order-creation function exists under any name.
- **`orders`** table: 27 columns. Has `idempotency_key text` (not `uuid`). **Does not have `table_id`, `table_name`, or `source`** — the entire QR-ordering column set from `sql/table_qr_system.sql` is absent. `order_number` has a staging-specific column `DEFAULT ('STG-'::text || nextval('staging_order_number_seq'))` — a different mechanism entirely from production's trigger-based numbering. `status` has **no CHECK constraint** (`pg_constraint` query returned zero rows for `orders_status_check` or `orders_source_check` — only `orders_branch_id_fkey`, `orders_restaurant_id_fkey`).
- **Triggers on `orders`**: `trg_broadcast_order_status` (different condition: `AFTER UPDATE OF status, cancelled_by, updated_at`, vs production's unconditional `AFTER UPDATE`), `trg_broadcast_restaurant_orders` (not present on production's `orders` table trigger list at all), `trg_loyalty_earn` (matches production), `trg_staging_orders_updated_at` (staging-renamed equivalent of `update_orders_updated_at`). **No `set_order_number` trigger** (consistent with the column-default numbering approach). **No `trg_enforce_order_transition`** — the state-machine trigger from `sql/order_state_machine.sql` was never applied to staging.
- **Indexes on `orders`**: `idx_staging_orders_branch`, `orders_order_access_token_uidx`, `orders_pkey`, and `orders_restaurant_idempotency_key_uq` — a unique index on **`(restaurant_id, idempotency_key)`**, not on `idempotency_key` alone as in production. This means staging enforces idempotency-key uniqueness **per restaurant**, while production enforces it **globally**. **No `orders_restaurant_id_order_number_key`** — staging has no uniqueness guarantee on order numbers at all (relies entirely on the sequence-backed default not colliding, which is a different and weaker guarantee than production's explicit unique constraint).
- **RLS policies on `orders`**: **three** policies exist:
  1. `orders_access` (`FOR ALL`, role `public`) — logic is written differently from production (inlines `is_restaurant_owner(...)` / `member_branch_scope(...)` checks rather than calling a `member_has_branch_access(...)` helper), suggesting either an older implementation or a different helper-function set in staging. Not identical logic to production, though intent appears similar.
  2. **`orders_cancel_public`** (`FOR UPDATE`, role `public`, `qual: status = 'pending'`, `with_check: status = 'cancelled'`) — **this is the exact policy production closed via MIG-003.**
  3. **`orders_insert_public`** (`FOR INSERT`, role `public`, `with_check: true`) — **this is the exact policy production closed via MIG-004, and it is unconditionally open (`with_check: true`, not even the original `table_id IS NULL AND source = 'manual'` restriction from `table_qr_system.sql`'s original version).**
- **`payment_transactions` / `payment_providers` / `payment_webhook_events`**: **none of the three exist.** Confirmed twice — once via `list_tables`, once implicitly via `list_migrations` showing no `payments_gateway_foundation`-equivalent migration in staging's history.
- **`invoices`**: exists, schema identical to production (billing/subscription infra appears to have been restored to staging — migration name `staging_billing_foundation_restore` seen in staging's migration list).
- **Migration history** (`list_migrations`, ~70 entries): named independently of the repository's `sql/` files (e.g. `staging_create_order_alias`, `staging_menu_production_hardening_idempotency` ×3, `staging_schema_parity_safe_foundation`, `staging_rls_parity_baseline_v3`) — this is a **separate, staging-specific migration lineage**, not a replay of `sql/`'s files. Several migration names literally suggest prior, partial attempts at reconciling staging with production ("parity", "hardening", "restore") — this divergence audit is not the first time this gap has been worked on.

---

## TABLE PARITY

| Table | Repository (`sql/`) | Production | Staging | Status |
|---|---|---|---|---|
| `orders` | Defined (base + QR + idempotency + payment-ref columns across multiple files) | Present, full column set | Present, **missing** `table_id`/`table_name`/`source`/QR columns | STAGING_DIVERGED |
| `payment_transactions` | `payments_gateway_foundation.sql` | Present, matches file | **Absent** | STAGING_MISSING |
| `payment_providers` | `payments_gateway_foundation.sql` | Present, matches file | **Absent** | STAGING_MISSING |
| `payment_webhook_events` | `payments_gateway_foundation.sql` | Present, matches file | **Absent** | STAGING_MISSING |
| `invoices` | `billing_foundation.sql` | Present | Present, identical schema | MATCH |
| `restaurant_tables` (QR) | `table_qr_system.sql` | Present, with `qr_token`/`qr_enabled`/`branch_id` | **Absent entirely** | STAGING_MISSING |

---

## ORDERS PARITY

| Aspect | Repository intent | Production (live) | Staging (live) | Status |
|---|---|---|---|---|
| `idempotency_key` type | `uuid` (`order_idempotency.sql`) | `uuid` | `text` | STAGING_DIVERGED |
| `idempotency_key` uniqueness | Global, partial unique (`orders_idempotency_key_uidx`) | Matches | Per-restaurant composite (`orders_restaurant_idempotency_key_uq` on `(restaurant_id, idempotency_key)`) | STAGING_DIVERGED |
| `order_number` generation | Trigger-based (`generate_order_number()`, advisory lock + max()+1) | Matches | Column `DEFAULT` with `'STG-'` prefix + dedicated sequence | STAGING_DIVERGED |
| `order_number` uniqueness | `UNIQUE (restaurant_id, order_number)` | Present | **Absent** | STAGING_DIVERGED |
| `status` CHECK constraint | `orders_status_check` (`order_state_machine.sql`) | Present | **Absent** | STAGING_DIVERGED |
| `enforce_order_transition` trigger | Present (`order_state_machine.sql`) | Present | **Absent** | STAGING_DIVERGED |
| QR columns (`table_id`/`table_name`/`source`) | Present (`table_qr_system.sql`) | Present | **Absent** | STAGING_MISSING |
| `payment_transaction_id` column | Proposed (`order_payment_reference.sql`, Task 3.5) | Not yet applied | Not present | REPOSITORY_ONLY (not applied anywhere yet — expected) |
| `orders_insert_public` policy | Created then explicitly **closed** (`table_qr_system.sql` → `order_journey_hotfix.sql` MIG-004) | Absent (closed) | **Present, unconditionally open** | STAGING_DIVERGED — **security regression** |
| `orders_cancel_public` policy | Created then explicitly **closed** (MIG-003) | Absent (closed) | **Present, open to any pending order** | STAGING_DIVERGED — **security regression** |

---

## CREATE_ORDER PARITY

| Aspect | Repository | Production | Staging | Status |
|---|---|---|---|---|
| Overload count | 1 (after historical cleanup) | **1** | **1** | MATCH (no pre-existing duplicate-overload risk in either) |
| Parameter count | 12 | 12 | 12 | MATCH |
| `p_idempotency_key` type | `uuid` | `uuid` | **`text`** | STAGING_DIVERGED |
| `security definer` | true | true | (not independently re-queried for staging in this pass, but staging's own report from the prior verification task confirmed identical `SECURITY DEFINER` framing) | MATCH (assumed from prior verification, not re-checked this pass) |
| `search_path` config | `public` | `public` | Not re-queried this pass | UNKNOWN (not re-verified in this specific audit pass — was implicitly consistent in the earlier sandbox-verification task) |

**This single type mismatch (`p_idempotency_key uuid` vs `text`) is the exact reason Task 3.5's `DROP FUNCTION IF EXISTS public.create_order(..., uuid)` would silently no-op against staging, then create a dangerous second overload instead of cleanly replacing the function — as already identified in the prior sandbox-verification task, and now confirmed here with full column-level evidence for *why* the divergence exists (staging's `orders.idempotency_key` column itself is `text`, so its `create_order` was necessarily written to match).**

---

## QR ORDER PARITY

| Aspect | Repository | Production | Staging | Status |
|---|---|---|---|---|
| `create_order_from_table_qr` function | Defined | Present, 8 params | **Absent** | STAGING_MISSING |
| `restaurant_tables` table (with `qr_token` etc.) | Defined | Present | **Absent** | STAGING_MISSING |
| `orders.table_id`/`table_name`/`source` | Defined | Present | **Absent** | STAGING_MISSING |

**Staging has no QR-ordering capability at all today** — this is not a partial divergence, it's a fully absent subsystem. Task 3.5 deliberately did not touch `create_order_from_table_qr`, so this finding doesn't block Task 3.5 itself, but it does mean the "QR order verification" scenario requested for sandbox testing cannot be performed against staging in its current state, independent of Task 3.5.

---

## PAYMENT SCHEMA PARITY

| Aspect | Repository | Production | Staging | Status |
|---|---|---|---|---|
| `payment_providers` table | Defined, seeded 5 disabled providers | Present, 5 rows | **Absent** | STAGING_MISSING |
| `payment_transactions` table | Defined | Present, 0 rows (no live transactions) | **Absent** | STAGING_MISSING |
| `payment_webhook_events` table | Defined | Present, 0 rows | **Absent** | STAGING_MISSING |
| `uq_paytx_provider_ref` unique index | Defined | Present | N/A (table absent) | STAGING_MISSING |
| `uq_webhook_provider_event` unique index | Defined | Present | N/A (table absent) | STAGING_MISSING |
| `uq_paytx_idempotency_key` unique index | Proposed, **OWNER/DBA-gated, explicitly not auto-applied** | **Not applied** | N/A (table absent) | REPOSITORY_ONLY (correctly still pending everywhere, per its own file header) |
| Admin-only RLS on all 3 payment tables | Defined | Present, matches | N/A (tables absent) | STAGING_MISSING |

---

## BILLING PARITY

Not the focus of this audit, checked only for context since `payment_transactions.invoice_id` references it. `invoices` schema matches exactly between production and staging (both have the full column set from `billing_foundation.sql`). Staging's migration history includes `staging_billing_foundation_restore`, `staging_billing_plans_restore2`, consistent with billing infrastructure having been separately restored to staging at some point. No further billing-specific divergence was investigated (out of scope for Task 3.5 impact).

---

## MIGRATION HISTORY COMPARISON

- **Production**: 106 migrations, named consistently with the repository's `sql/` files for the order/payment domain (`payments_gateway_foundation`, `mig_001`–`mig_009`, `table_qr_system`, etc.) — a coherent, traceable lineage matching what's in `sql/`.
- **Staging**: ~70 migrations, almost entirely under a **separate naming convention** (`staging_*` prefixes, plus some shared names like `marketing_cms_ssr_v1` for subsystems that *were* kept in parity). For the order/payment/QR domain specifically, staging's lineage is independent: `staging_create_order_alias`, `staging_menu_production_hardening_idempotency` (applied three times — suggesting iterative fixes), `staging_order_status_realtime_*` (three related migrations). **No migration in staging's history corresponds to `payments_gateway_foundation`, `table_qr_system`, or `order_state_machine`.**

This confirms staging was built as an independently-evolved environment for a subset of functionality (matches its literal name, "simsim-**menu**-staging" — menu/ordering-focused, not a full production mirror), rather than a strict replay of every `sql/` file.

---

## INDEX / CONSTRAINT PARITY

Already itemized in detail in **ORDERS PARITY** and **PAYMENT SCHEMA PARITY** above. Summary: production's index/constraint set on `orders` is a strict superset of staging's, plus staging has one index production doesn't (`orders_restaurant_idempotency_key_uq`, staging's own composite variant, functionally different from — not additive to — production's `orders_idempotency_key_uidx`).

---

## RLS / SECURITY PARITY

This is the most consequential section of this audit.

| Table | Production policies | Staging policies | Status |
|---|---|---|---|
| `orders` | `orders_access` only | `orders_access` (different implementation) **+ `orders_cancel_public` + `orders_insert_public`** | **STAGING_DIVERGED — security regression** |
| `payment_providers` | `ppv_admin_all` | N/A (table absent) | STAGING_MISSING |
| `payment_transactions` | `ptx_admin_all` | N/A (table absent) | STAGING_MISSING |
| `payment_webhook_events` | `pwh_admin_all` | N/A (table absent) | STAGING_MISSING |

**Finding, stated plainly:** staging's `orders` table currently allows any unauthenticated request (role `public`, which includes `anon`) to `INSERT` an arbitrary row (`with_check: true` — no restriction whatsoever) and to `UPDATE` any `pending` order to `cancelled` (`orders_cancel_public`). Production closed both of these exact policies as documented, deliberate security fixes (`sql/order_journey_hotfix.sql` MIG-003 "إغلاق ثغرة الإلغاء الجماعي المجهول" / MIG-004 "إغلاق ثغرة الإدخال المباشر... كانت تسمح بإدخال طلبات مزوَّرة"). Staging never received these fixes and is, as of this audit, in the same vulnerable state production was in before that historical fix.

**Per this task's explicit instructions, this is documented only. Nothing was fixed, changed, or reported to any other system. This is presented to you as a finding requiring a separate decision, not something I acted on.**

---

## FUNCTION PARITY

| Function | Production | Staging | Status |
|---|---|---|---|
| `create_order` | 1 overload, `p_idempotency_key uuid`, matches repo | 1 overload, `p_idempotency_key text` | STAGING_DIVERGED |
| `create_order_from_table_qr` | Present, 8 params | **Absent** | STAGING_MISSING |
| `generate_order_number` | Present (trigger fn) | Not queried directly (column-default mechanism used instead — functionally superseded in staging) | STAGING_DIVERGED (different mechanism entirely) |
| `enforce_order_transition` | Present, wired via trigger | Not present (no such trigger found) | STAGING_MISSING |
| `broadcast_order_status` | Present, unconditional `AFTER UPDATE` trigger | Present, conditional `AFTER UPDATE OF status, cancelled_by, updated_at` trigger | STAGING_DIVERGED (narrower trigger condition) |

---

## STAGING SCHEMA DRIFT — Summary

Staging is best understood as a **purpose-built environment for menu/marketing-CMS-related feature work** (its name, its migration history, and its table set — full marketing CMS tables, full billing/loyalty tables, but no payment gateway and no QR-ordering — all point the same direction), not a full mirror of production. Its `orders`/`create_order` subsystem was independently maintained to *approximately* the same functional level as an early point in production's history (idempotency added, but with different types/uniqueness scope; no state-machine enforcement; no QR support; and critically, two security-closing migrations from production were never carried over).

---

## TASK 3.5 IMPACT

1. **What prevents applying `sql/order_payment_reference.sql` to staging today:**
   - Its `ALTER TABLE ... REFERENCES public.payment_transactions(id)` would fail immediately — that table doesn't exist in staging.
   - Even if that FK were removed, its `DROP FUNCTION IF EXISTS public.create_order(..., uuid)` would not match staging's actual function (last param is `text`), so it would silently no-op, and the subsequent `CREATE OR REPLACE` would create a second, duplicate `create_order` overload rather than cleanly replacing the existing one.

2. **Prerequisites to apply it safely to staging:**
   - Apply (or equivalent-restore) `sql/payments_gateway_foundation.sql` to staging first.
   - Resolve the `idempotency_key` type mismatch — either by changing my migration's `DROP FUNCTION` target to match staging's actual `text`-typed signature (a staging-specific variant of the migration), or by first migrating staging's own `create_order`/`orders.idempotency_key` to `uuid` to match production (a materially larger, separate change with its own risk).
   - Neither of these was authorized or attempted in this audit.

3. **Is the current migration appropriate for Production?** **Yes.** Every assumption it makes (12-arg `create_order` with `p_idempotency_key uuid`, single existing overload, `payment_transactions` table present with the expected schema) is independently confirmed true in production, evidenced above. Nothing in this audit suggests the migration itself needs to change for a production application.

4. **Does staging need a separate migration?** If staging is to be used for this verification, yes — a staging-specific variant would be needed (at minimum, targeting `text` instead of `uuid` for the dropped signature, and preceded by the payment foundation tables). This audit does not recommend which path to take; it only establishes that "apply the same file" is not viable as-is.

5. **Is a fresh sandbox (mirroring production) preferable?** This audit surfaces the option but does not decide it — see Recommended Options below.

6. **Does Task 3.5's own code/SQL need to change based on this audit?** **No changes were made, and none are recommended against production usage.** The migration remains correctly designed for its actual target (production). Whether a *separate* staging-specific copy should ever be authored is a decision for you, not something this audit resolves.

---

## BLOCKERS

1. `payment_transactions`/`payment_providers`/`payment_webhook_events` absent from staging.
2. `create_order.p_idempotency_key` type mismatch (`text` in staging vs `uuid` in production/repository) makes the migration's DROP/CREATE cutover unsafe against staging.
3. `create_order_from_table_qr` and its supporting `restaurant_tables` QR columns absent from staging — blocks the QR-order verification scenario entirely, independent of Task 3.5.
4. (Separate, non-Task-3.5 finding) staging's `orders_insert_public`/`orders_cancel_public` open policies — not a blocker for Task 3.5 specifically, but a live security concern discovered during this audit that you should be aware of regardless of what's decided about staging parity.

---

## RISK ASSESSMENT

| Option | Risk |
|---|---|
| Apply Task 3.5's existing migration to staging unmodified | **High — would fail on the missing table, or (if that were patched) silently create a duplicate `create_order` overload.** Not recommended under any circumstance without first resolving blockers 1–2. |
| Bring staging to full parity with production (payments + idempotency-key type + state machine + QR) | Medium effort, medium risk — touches staging's live `create_order`/`orders` schema, which staging's own app/tests may depend on in their current (divergent) form; needs careful sequencing and its own review, not something to do as a side effect of verifying Task 3.5. |
| Create a fresh sandbox seeded directly from production's schema | Lower schema-divergence risk (starts identical to production), but is new operational surface (a new Supabase project) and doesn't fix the underlying staging-drift problem for other domains still using `simsim-menu-staging`. |
| Defer live verification, rely on the static guard tests + manual script already produced for Task 3.5 | No infrastructure risk; leaves the DB-runtime scenarios formally unverified until a suitable environment exists. |

---

## RECOMMENDED OPTIONS

Presented as options, not a decision — per your standing instruction, the choice is yours:

- **A.** Do targeted parity work on `simsim-menu-staging` scoped *only* to what Task 3.5 needs (apply payments foundation + reconcile the one type mismatch), leaving the rest of staging's intentional divergence (QR absence, etc.) untouched.
- **B.** Create a new, dedicated sandbox Supabase project cloned/seeded from production's actual schema, used specifically for payment-flow verification going forward.
- **C.** Accept `simsim-menu-staging` as unsuitable for this specific verification and rely on the static/manual verification already documented in Task 3.5's report, applying the migration to production directly under your own supervision when ready (with the DROP/CREATE step run inside an explicit transaction you can inspect before committing, as this repo's own convention already recommends for risky changes).
- Separately from all of the above: **the open `orders_insert_public`/`orders_cancel_public` policies on staging warrant their own decision** — whether to close them now (mirroring production's historical fix) regardless of what's decided about Task 3.5.

---

## RECOMMENDED NEXT STEP

Decide between the options above. Nothing further was done in this session pending that decision — no move to Task 3.6, no fix applied anywhere.

---

## GIT STATUS

```
Branch: phase-3/task-3-4-webhook-edge-function (unchanged)
HEAD:   163ac24 (unchanged — no commit made)
Modified tracked files: none
New untracked file from this task: reports/STAGING_SCHEMA_PARITY_AUDIT_REPORT.md
(all other untracked files are pre-existing from earlier sessions, unrelated to this task)
```

No commit, push, deploy, or merge was performed.

---

## REPORT FILE

`reports/STAGING_SCHEMA_PARITY_AUDIT_REPORT.md`

## DOWNLOAD COPY

`/sdcard/Download/STAGING_SCHEMA_PARITY_AUDIT_REPORT.md` (copied and verified after this report was written).

---

## FINAL RECOMMENDATION

**B. STAGING_REQUIRES_PARITY_WORK**

Evidence: a real, authenticated staging environment exists and is reachable, so this is not "insufficient data" or "no environment." But it cannot verify Task 3.5 today — three concrete, independently-confirmed gaps (missing payment tables, a type mismatch on `create_order`'s existing parameter, and an entirely absent QR subsystem) stand between its current state and what the migration assumes. This is not a judgment that a brand-new sandbox is necessarily better (Option C is a legitimate alternative), but the evidence specifically shows *staging as it exists needs parity work* before it can do what was asked of it — it does not show that verification is impossible in principle (ruling out D), nor that staging is already sufficient (ruling out A).

---

*Report generated 2026-08-25. No INSERT, UPDATE, DELETE, ALTER, CREATE, DROP, TRUNCATE, or migration was executed against any database in this task. Production and staging were both read-only queried; the unrelated `madar` project was never touched. No secret, key, password, or connection string was viewed or printed.*
