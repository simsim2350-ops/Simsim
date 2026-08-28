# Task 3.5 — Sandbox/Staging Live Verification

## TASK

Attempt real, live verification of Task 3.5's migration (`sql/order_payment_reference.sql`) against an authorized Supabase Sandbox/Staging database — **not** production, **not** applied blindly. Per instruction, this task stops before Task 3.6 either way; it does not implement anything new.

---

## ENVIRONMENT

- Project root: `/data/data/com.termux/files/home/simsim`
- Branch: `phase-3/task-3-4-webhook-edge-function`, HEAD `163ac24` (unchanged throughout this task)
- Connection method: the **Supabase MCP tool integration** available in this session (`mcp__claude_ai_Supabase__*`) — this is a separate, authenticated channel from the shell environment. Confirmed the shell itself has **no** Supabase-related environment variables, no `.env` file, and no Supabase CLI installed in the main app (checked by name only, no values printed):
  ```
  $ env | grep -iE "supabase|postgres|database_url|pg_" | cut -d= -f1
  (empty)
  $ which supabase
  (not found)
  ```
- No secrets, keys, passwords, or connection strings were viewed, requested, or printed at any point in this task. Only project metadata (names, IDs, table/column/function names, row counts, migration names) was read.

---

## DATABASE TARGET

`mcp__claude_ai_Supabase__list_projects` returned **3** projects on this account. I identified each before touching anything:

| Project | ID | Status | Determination |
|---|---|---|---|
| `simsim` | `gpwwnuuicywsvmmhxngs` | ACTIVE_HEALTHY | **PRODUCTION** — confirmed by this repo's own `sql/order_idempotency.sql` header comment, which explicitly states it was "نُفِّذ فعلياً على قاعدة الإنتاج gpwwnuuicywsvmmhxngs" (actually executed on the production database gpwwnuuicywsvmmhxngs). **Not touched — no read or write.** |
| `madar` | `fklbydlnmksyrcdsvhgo` | INACTIVE | Unrelated project (different name, different product). **Not touched, not queried at all.** |
| `simsim-menu-staging` | `rgqsetckcigkgsyobyjg` | ACTIVE_HEALTHY | Identified as the intended staging/sandbox target — confirmed via `list_migrations`, whose ~70 migration names (`staging_core_schema`, `staging_billing_foundation_restore`, `marketing_cms_ssr_v1`, `marketing_cms_phase2_admin_control_v1`, etc.) correspond directly to features and `sql/`/`reports/` files already present in this repository. **This is the only project any read or write was attempted against.** |

**Chosen target: `rgqsetckcigkgsyobyjg` (`simsim-menu-staging`).**

---

## INITIAL STATE

Read-only inspection performed **before** any decision to apply anything:

1. `list_tables` on `rgqsetckcigkgsyobyjg` (public schema) returned 40 tables, including `orders` (4 rows), `restaurants` (2 rows), `branches` (2 rows), `products` (2 rows), `coupons` (2 rows) — **but no `payment_transactions`, `payment_providers`, or `payment_webhook_events` table at all.**
2. `list_migrations` on the same project returned 70 applied migrations — **none named or resembling `payments_gateway_foundation`, `order_idempotency`, `order_journey_hotfix`, or `order_state_machine`.** This confirms staging's migration history diverged from what's tracked in this repo's `sql/` directory for the order/payment domain specifically (migrations like `staging_create_order_alias` and `staging_menu_production_hardening_idempotency` ×3 suggest an independent, staging-specific patch history for `create_order`, not a mirror of production's `sql/` files).
3. Direct, read-only introspection of the **live** function signature (via `pg_proc`/`pg_get_function_identity_arguments`, not by trusting any file in this repo):
   ```sql
   select p.proname, pg_get_function_identity_arguments(p.oid) as args, pg_get_function_result(p.oid) as returns
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('create_order', 'create_order_from_table_qr');
   ```
   Result: **exactly one** `create_order` overload exists (good — no pre-existing overload ambiguity there), with arguments:
   ```
   p_restaurant_id uuid, p_branch_id uuid, p_table_number text, p_delivery_address text,
   p_customer_name text, p_customer_phone text, p_type text, p_items jsonb, p_notes text,
   p_coupon_code text, p_client_total numeric, p_idempotency_key text
   ```
   **`create_order_from_table_qr` was not returned at all.** A follow-up query for any function with `order` or `qr` in its name confirmed it does not exist in staging under any name.

---

## MIGRATION STATUS

**`sql/order_payment_reference.sql` was NOT applied to staging, and was NOT modified.** I read its content (already known from Task 3.5) but did not touch the file, per instruction. Two independent, confirmed reasons this migration cannot be safely applied to `rgqsetckcigkgsyobyjg` as-is:

1. **Missing prerequisite table.** The migration's `ALTER TABLE public.orders ADD COLUMN payment_transaction_id uuid REFERENCES public.payment_transactions(id) ...` requires `public.payment_transactions` to exist. It does not exist in staging. Applying the migration as written would fail immediately at this statement with an undefined-table error.
2. **Function-signature divergence makes the DROP/CREATE cutover unsafe.** The migration's `DROP FUNCTION IF EXISTS public.create_order(uuid, uuid, text, text, text, text, text, jsonb, text, text, numeric, uuid);` targets a signature whose 12th parameter is `p_idempotency_key uuid`. Staging's actual live `create_order` has a 12th parameter of `p_idempotency_key text` — a different type. Because `DROP FUNCTION IF EXISTS` matches by exact signature, it would silently do nothing (no error, no effect) against staging's real function. The subsequent `CREATE OR REPLACE FUNCTION public.create_order(...)` (with `p_idempotency_key uuid` and a 13th param appended) would then be treated by Postgres as a **new, additional overload** next to staging's existing `text`-typed one — creating exactly the dangerous duplicate-overload situation this migration was specifically designed to avoid (see Task 3.5's report for why that's dangerous: it previously happened by accident in this project's history and had to be manually corrected).

Applying the migration in this state would therefore either (a) fail outright on the missing table, or — if that FK were hypothetically stripped first — (b) succeed in a way that leaves staging with two live, differently-typed `create_order` overloads, which is worse than not applying it at all.

**I stopped here rather than improvising a fix**, because: (a) the task instructions explicitly said not to modify the migration before verifying its content, and I found a reason it *shouldn't* be applied as-is rather than a reason to silently adapt it; (b) bringing staging's payment schema to parity with production (i.e., also applying `sql/payments_gateway_foundation.sql`, and reconciling the `p_idempotency_key` type divergence) is materially more work and more risk than what was authorized for this task, and is exactly the kind of scope expansion the project's standing rules require separate, explicit approval for.

---

## SCHEMA VERIFICATION

| Check | Result |
|---|---|
| `orders.payment_transaction_id` exists | **NOT APPLICABLE — migration not applied.** Column does not exist (confirmed absent from the pre-migration `orders` table). |
| FK to `payment_transactions(id)` | **NOT APPLICABLE — `payment_transactions` table itself does not exist in staging at all.** |
| `orders_payment_transaction_id_uidx` exists | **NOT APPLICABLE — not created (migration not applied).** |
| Index is UNIQUE + partial (allows NULL, blocks duplicate non-null) | **NOT VERIFIED — nothing to verify, index does not exist.** |

---

## FUNCTION VERIFICATION

| Check | Result |
|---|---|
| New `create_order` signature present with `p_payment_transaction_id uuid DEFAULT NULL` | **NOT PRESENT — migration not applied.** Live staging signature still ends in `p_client_total numeric, p_idempotency_key text` (12 params), confirmed via direct `pg_proc` introspection above. |
| No old overloads of `create_order` remain | **Currently true (only one overload exists today)** — but this check is about the *post-migration* state, which was never reached. Flagging explicitly: applying the migration as-is would have **created** a second overload rather than preventing one, for the type-mismatch reason explained above. |

---

## TEST SCENARIOS

**None of the 8 requested functional scenarios (no-reference order, valid reference, nonexistent reference, cross-restaurant reference, duplicate reference, rollback, idempotency, QR-order path) were executed against staging.** Running them would require the new `p_payment_transaction_id` parameter and the `payment_transactions` table to actually exist there first, and neither does. Executing calls against functions/columns that don't exist would not test anything real — I did not fabricate results for any of them.

---

## ACTUAL RESULTS

No functional test was run. The only actions taken against `rgqsetckcigkgsyobyjg` were four read-only operations: `list_tables`, `list_migrations`, and two `execute_sql` calls that queried `pg_proc`/`pg_namespace` (system catalogs) — no `INSERT`, `UPDATE`, `DELETE`, or `DDL` statement was ever sent.

---

## ROLLBACK VERIFICATION

**NOT VERIFIED.** No order was created, so there is nothing to roll back and nothing to verify.

---

## IDEMPOTENCY VERIFICATION

**NOT VERIFIED.** Not attempted, for the same reason.

---

## QR ORDER VERIFICATION

**NOT VERIFIED**, and additionally: `create_order_from_table_qr` does not exist under that name anywhere in staging's `public` schema (confirmed via direct `pg_proc` query, not assumed). Whatever staging's QR-ordering mechanism actually is (the migration name `staging_create_order_alias` suggests it may be structured differently there), it was not investigated further — that was out of scope for this verification task and is a separate, pre-existing fact about staging unrelated to anything Task 3.5 changed.

---

## SECURITY

- No secret, API key, password, or connection string was requested, viewed, or printed at any point — confirmed by reviewing every tool call made in this task (`list_projects`, `list_tables`, `list_migrations`, two `execute_sql` reads against system catalogs only).
- Production (`gpwwnuuicywsvmmhxngs`) was never queried or touched, read or write, at any point.
- The unrelated `madar` project (`fklbydlnmksyrcdsvhgo`) was never queried.
- No DDL or DML was executed against any database in this task.

---

## CLEANUP

**Nothing to clean up.** No test data was created in any database — the migration was never applied, so no order, no payment transaction, and no test row of any kind exists anywhere as a result of this task.

---

## LOCAL TESTS

Run live in this session, after the sandbox investigation above and independent of it:

```
$ npm test -- --run
 Test Files  36 passed (36)
      Tests  487 passed (487)
```

Identical to the result already recorded at the end of Task 3.5 — no code changed between that report and this one, so this is a confirmation, not a new baseline.

---

## GIT STATUS

```
$ git status --short
?? (37 pre-existing untracked report files, unrelated to this task)
?? sql/order_payment_reference.sql            (from Task 3.5, unchanged)
?? src/lib/orderPaymentReferenceGuard.test.js  (from Task 3.5, unchanged)
?? reports/TASK_3_5_CREATE_ORDER_PAYMENT_REFERENCE_REPORT.md  (from Task 3.5)
?? reports/TASK_3_5_SANDBOX_VERIFICATION_REPORT.md  (this report, new)

$ git diff --stat
(empty — no tracked file was modified)
```

No commit, push, deploy, or merge was performed. Branch and HEAD unchanged (`phase-3/task-3-4-webhook-edge-function`, `163ac24`).

---

## BLOCKERS

1. **`payment_transactions` table does not exist in the `simsim-menu-staging` database.** The migration's foreign key depends on it. Applying `sql/payments_gateway_foundation.sql` (or an equivalent) to staging first would be a prerequisite — and that is a separate, materially larger action requiring its own explicit authorization, not something I did unilaterally under this task's scope.
2. **Staging's live `create_order` has a `p_idempotency_key text` parameter, not `uuid` as production and this repo's `sql/order_idempotency.sql` (and therefore my Task 3.5 migration) assume.** This means staging's schema has diverged from what's tracked in this repository's `sql/` directory for this function. Applying my migration's `DROP FUNCTION IF EXISTS`/`CREATE OR REPLACE` pair as-is would not cleanly cut over — it would create a second, duplicate `create_order` overload in staging, which is a worse outcome than not applying it.
3. **`create_order_from_table_qr` does not exist in staging under that name.** Whatever staging uses for QR-based ordering is structured differently from production/`sql/`. This wasn't investigated further (out of scope for verifying Task 3.5), but it means the "QR order verification" requirement in this task cannot be satisfied against this environment as it stands today.

None of these are things I could resolve within this task's authorized scope (verify + optionally apply *this one migration file*, unmodified). All three require either a decision from you about how to proceed, or separate, explicitly-authorized work to bring staging to parity with production first.

---

## FINAL VERDICT

**BLOCKED**

A real, authenticated connection to a legitimate staging database **does** exist and was used for read-only verification. However, applying `sql/order_payment_reference.sql` to it was not safe to do as-is, for two independently-confirmed, concrete reasons (missing `payment_transactions` table; a type mismatch on `create_order`'s existing `p_idempotency_key` parameter that would produce a dangerous duplicate function overload rather than a clean replacement). No functional test scenario was executed, because none could be executed meaningfully without first resolving those two issues. No claim of PASS is made for anything that wasn't actually run.

---

## REPORT FILE

`reports/TASK_3_5_SANDBOX_VERIFICATION_REPORT.md`

## DOWNLOAD COPY

`/sdcard/Download/TASK_3_5_SANDBOX_VERIFICATION_REPORT.md` (copied and verified after this report was written — see final summary).

---

## NEXT STEP

This needs your decision before anything further happens here — I did not proceed past investigation. The two realistic paths:

1. **Bring staging to parity first** (apply `sql/payments_gateway_foundation.sql` to staging, and separately reconcile the `p_idempotency_key text` vs `uuid` divergence on `create_order` — this second part needs care, since it affects a function staging is presumably already using), *then* retry this same verification. This is real, additional, separately-scoped work — not something to do silently as part of "just applying the existing migration."
2. **Accept that this specific staging project cannot verify Task 3.5 today**, and decide whether a different verification path makes sense (e.g., a fresh sandbox branch, or verification deferred until staging parity work is scheduled).

Per your instruction, no move to Task 3.6, no commit, no push, no deploy, no merge — none of that was done or attempted.

---

*Report generated 2026-08-25. No functional test claimed as PASS was actually run against a live database. No migration was applied to any database. Production and the unrelated `madar` project were never touched.*
