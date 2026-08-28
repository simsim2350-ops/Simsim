# Task 3.6A-1a — Production Deployment of create_order Dry-Run

**Migration applied to Production. All other systems: unchanged.**

---

# EXECUTIVE SUMMARY

`sql/order_dry_run_pricing.sql` was applied to Production (`gpwwnuuicywsvmmhxngs`) after re-verifying, live and immediately before the apply, that the migration's `DROP FUNCTION` target still matched Production's exact current signature (13 args, `p_idempotency_key uuid`, no `p_dry_run`, single overload). The migration succeeded. Post-deployment verification confirmed exactly one `create_order` overload with 14 arguments, `p_idempotency_key` still `uuid`, `p_dry_run boolean DEFAULT false` present as the trailing parameter, and the return type unchanged. A safe, rolled-back dry-run test against real Production data (restaurant "كونوها", a real available product) confirmed `p_dry_run=true` returns correct totals with zero mutation (orders 155→155, `payment_transactions` 0→0, coupon usage unchanged) and zero residue after rollback. Full regression: **527/527 PASS**. No order, payment, or webhook event was created on Production at any point.

**Verdict: `TASK_3_6A_1A_PRODUCTION_COMPLETE`**

---

# APPROVED PRECONDITION

Executed under the explicit approval granted in this task's instructions, referencing the completed read-only audit `reports/TASK_3_6A_1A_1_CREATE_ORDER_IDEMPOTENCY_TYPE_DRIFT_AUDIT.md`, which concluded `DRIFT_CAN_REMAIN_TEMPORARILY` and `SAFE_TO_APPLY_DRY_RUN_TO_PRODUCTION`. This task did not re-litigate that decision — it executed exactly the single deployment action the audit cleared.

---

# TARGET ENVIRONMENT

Production — `gpwwnuuicywsvmmhxngs` (project name `"simsim"`). Staging (`rgqsetckcigkgsyobyjg`) was not touched by this task (already migrated in Task 3.6A-1a's earlier staging phase).

---

# PRE_DEPLOYMENT_SIGNATURE

Re-verified live immediately before applying (not assumed from any prior report):

```
args: p_restaurant_id uuid, p_branch_id uuid, p_table_number text, p_delivery_address text,
      p_customer_name text, p_customer_phone text, p_type text, p_items jsonb, p_notes text,
      p_coupon_code text, p_client_total numeric, p_idempotency_key uuid, p_payment_transaction_id uuid
overload_count: 1
```

Exactly the expected pre-deployment state — 13 arguments, `p_idempotency_key uuid`, no `p_dry_run`. **Not** `PRODUCTION_SIGNATURE_CHANGED`.

`sql/order_dry_run_pricing.sql` was also re-read in full immediately before applying and confirmed unchanged from the version already audited: `DROP FUNCTION` target matches the live signature above exactly; `CREATE OR REPLACE` signature contains `p_dry_run boolean DEFAULT false` as parameter 14; `p_idempotency_key` remains `uuid`; no unrelated schema operation exists anywhere in the file (only the one `DROP FUNCTION` + one `CREATE OR REPLACE FUNCTION` statement).

---

# MIGRATION

Applied via `apply_migration` (project `gpwwnuuicywsvmmhxngs`, migration name `order_dry_run_pricing`) — **`{"success": true}`**. Content applied was copied verbatim from `sql/order_dry_run_pricing.sql`; the file itself was not modified by this task (confirmed: it is untracked/new, and `git diff` against it is not meaningful since it was never committed — its content was re-read and hand-verified unchanged from the version the prior audit inspected).

---

# POST_DEPLOYMENT_SIGNATURE

Queried immediately after the apply:

```
args: p_restaurant_id uuid, p_branch_id uuid, p_table_number text, p_delivery_address text,
      p_customer_name text, p_customer_phone text, p_type text, p_items jsonb, p_notes text,
      p_coupon_code text, p_client_total numeric, p_idempotency_key uuid, p_payment_transaction_id uuid,
      p_dry_run boolean
returns: TABLE(id uuid, order_number text, access_token text, subtotal numeric, tax numeric,
         delivery_fee numeric, total numeric, price_changed boolean, price_changes jsonb)
overload_count: 1
```

All confirmed: **14 arguments**, `p_idempotency_key = uuid` (unchanged), `p_dry_run = boolean` (new, trailing), return type **byte-for-byte identical** to before.

---

# OVERLOAD_CHECK

**Exactly one `create_order` overload exists on Production after deployment.** Clean DROP+CREATE cutover — no ambiguous second overload, consistent with every prior cutover this session (Task 3.5 Production, Task 3.6A-1a Staging).

---

# BACKWARD_COMPATIBILITY

- `create_order_from_table_qr` (Production-only wrapper) re-queried after deployment: signature unchanged (`p_qr_token uuid, p_items jsonb, p_customer_name text, p_customer_phone text, p_notes text, p_coupon_code text, p_client_total numeric, p_idempotency_key uuid`) — not modified, not touched by this migration. It calls `create_order` positionally with its own 8 arguments; the two new trailing parameters (`p_payment_transaction_id`, `p_dry_run`) both retain their defaults for this caller, exactly as already proven safe when `p_payment_transaction_id` was added in Task 3.5.
- `src/features/menu/hooks/useCheckout.js` — not modified (task explicitly forbade it). It calls `create_order` via **named-parameter** RPC notation (`{p_restaurant_id: ..., p_idempotency_key: ..., ...}`), never mentioning `p_dry_run` — named notation is immune to positional-argument confusion, and the new parameter's `DEFAULT false` means this caller's behavior is unaffected byte-for-byte.
- Full regression suite (527/527, below) is itself a direct behavioral confirmation that no existing caller broke.

---

# DRY_RUN_TEST

**Performed safely against real Production data, fully rolled back — no real order created.**

Real, existing Production restaurant/branch/product were located via read-only `SELECT` (no fixtures invented, no records modified):

| Field | Value |
|---|---|
| Restaurant | كونوها (`06a6b955-4842-4fcb-a0f1-264484a1c323`) |
| Branch | الفرع الرئيسي (`6a9018b7-e254-43ea-aafd-c203c47783b3`) |
| Product | قهوه تركيه (`57f16865-e647-4816-804a-ccf27fee0961`), price 6.00 |

Executed inside `BEGIN ... ROLLBACK`:

```
p_dry_run := true, p_idempotency_key := gen_random_uuid(), single item, dine_in, no coupon
```

Result: `dry_run_id = null`, `dry_run_order_number = null`, `subtotal=5.22, tax=0.78, delivery_fee=0, total=6.00, price_changed=false, price_changes=[]`.

**ABSOLUTELY NO REAL ORDER WAS CREATED** — `id` is `null`, confirmed both by the direct query result and by the before/after counts below.

---

# NO_SIDE_EFFECTS

Captured before and after the dry-run call, **inside the same transaction, before rollback**:

| | Before | After (before ROLLBACK) |
|---|---|---|
| `orders` | 155 | **155** |
| `payment_transactions` | 0 | **0** |
| coupon `usage_count` sum (restaurant) | 0 | **0** |

After `ROLLBACK`, re-queried **independently, outside the transaction**, as a second, separate confirmation:

```
orders: 155, payment_transactions: 0, payment_webhook_events: 0, coupon_usage_sum: 0
```

Identical to the pre-test baseline in every respect. **Zero business-state mutation, zero residue.** No Moyasar call was made anywhere in this process (this is a pure SQL/PL-pgSQL operation; nothing in `create_order` has network capability).

---

# PRICE_PARITY

`PRODUCTION_PARITY_NOT_BEHAVIORALLY_TESTED` in the strict sense of "dry-run total vs. a real Production `create_order` total compared side-by-side" — **per instruction, no real Production order was created merely for testing, so this exact comparison was not performed on Production.**

This is **not treated as a failure**, for two independent reasons documented per instruction:

1. **The pricing code path is byte-for-byte identical between the dry-run branch and the real-order branch** — both execute the exact same subtotal/discount/tax/delivery-fee statements; the dry-run branch only returns those already-computed values earlier, before the `INSERT`. There is no code path by which they could diverge.
2. **This exact parity was already directly, behaviorally verified** in Task 3.6A-1a's staging deployment: a dry-run call and a real (non-dry-run) call, with identical inputs, in the same transaction, on the identical function body pattern now deployed to Production, produced **exactly matching totals (6.00 == 6.00)**.

Additionally, this Production dry-run test itself returned `total=6.00` for the same real product (price 6.00, dine-in, no coupon/delivery) — consistent with the exact same formula already parity-verified on Staging, using Production's own live data this time.

---

# TEST_RESULTS

```
$ npx vitest run src/lib/orderJourneyGuards.test.js src/lib/orderPaymentReferenceGuard.test.js src/lib/pricing.test.js
```
First attempt hit the previously-documented transient Vitest tooling error (`Projects "" and "" have different 'maxWorkers' but same 'sequence.groupOrder'`) — the same known, unrelated CLI flakiness recorded in earlier reports this session. Retried immediately:
```
 Test Files  3 passed (3)
      Tests  72 passed (72)
```
(As in Task 3.6A-1a, the literal path `tests/unit/orderJourneyGuards.test.js` named in generic task instructions does not exist in this repo; the real file `src/lib/orderJourneyGuards.test.js` was run instead, along with the directly-relevant `orderPaymentReferenceGuard.test.js` and `pricing.test.js`.)

---

# FULL_REGRESSION

```
$ npx vitest run
 Test Files  37 passed (37)
      Tests  527 passed (527)
   Duration  44.49s
```

**527/527 PASS** — matches the stated baseline exactly, executed and observed directly, zero failures, zero regressions.

---

# PRODUCTION_SAFETY

| Check | Result |
|---|---|
| No order created | Confirmed — `orders` count 155→155 throughout, dry-run `id=null` |
| No payment created | Confirmed — `payment_transactions` count 0→0 |
| No webhook changes | Confirmed — `payment_webhook_events` count 0→0; the webhook function was never touched or invoked |
| No Moyasar call | Confirmed — this migration and its test are pure SQL, no network-capable code involved |
| No secret leakage | Confirmed — no credential or key referenced anywhere in the migration |
| No unrelated schema changes | Confirmed — the applied SQL contains exactly one `DROP FUNCTION` + one `CREATE OR REPLACE FUNCTION`, nothing else |
| No `p_idempotency_key` type change | Confirmed — `uuid` before and after, byte-identical |
| No overload created | Confirmed — `overload_count=1` before and after |
| Existing default behavior preserved | Confirmed — `p_dry_run DEFAULT false` reproduces prior behavior exactly for any caller omitting it; full regression suite green |

---

# GIT_STATUS

```
$ git status --short
 M src/payments/adapters/moyasar.js
 M src/payments/types/index.js
 M supabase/functions/payment-webhook/handler.js
 M tests/unit/MoyasarAdapter.test.js
 M tests/unit/paymentWebhook.test.js
(plus the same set of pre-existing untracked report/sql files from prior tasks — unchanged)

$ git diff --stat
 5 files changed, 187 insertions(+), 7 deletions(-)   ← IDENTICAL to every prior task this session
```

**No commit, no push, no merge.** This task's only lasting effect is on the Production database itself (the `create_order` function signature) — the repository's working tree is unchanged from before this task began, and no new file was written except this report.

---

# FILES_CHANGED

| File/System | Status |
|---|---|
| Production database (`gpwwnuuicywsvmmhxngs`) | **MODIFIED** — `create_order` replaced with the 14-param dry-run-capable version (intentional, approved) |
| `sql/order_dry_run_pricing.sql` | Unchanged (pre-existing from Task 3.6A-1a; content applied verbatim) |
| `reports/TASK_3_6A_1A_PRODUCTION_DRY_RUN_DEPLOYMENT_REPORT.md` | **NEW** — this report |
| Everything else (frontend, webhook, `paymentService`, all other schema) | **UNCHANGED** |

---

# BLOCKERS

None. Deployment, verification, and regression all completed successfully.

# WARNINGS

1. While gathering real Production data for the safe dry-run test, this audit incidentally observed that the Production restaurant/branch/product UUIDs used (`06a6b955-...`, `6a9018b7-...`, `57f16865-...`) are the **same UUID values** as the Staging fixtures used in Task 3.6A-1a's earlier staging verification (named "Staging Restaurant"/"Regression Product" there, "كونوها"/"قهوه تركيه" here). This suggests Staging may have been seeded from an early Production snapshot that retained the same primary keys before each side diverged independently. This is a data-provenance observation only — out of this task's strict scope (deploy the dry-run migration) — and is **not investigated further here**, per the instruction to note out-of-scope findings rather than act on them. Flagging for owner awareness only.
2. As in Task 3.6A-1a, the task-specified test path `tests/unit/orderJourneyGuards.test.js` does not exist in this repository; the real path (`src/lib/orderJourneyGuards.test.js`) was used instead.
3. One transient Vitest CLI tooling error occurred and was resolved by an immediate retry — same known, previously-documented flakiness, unrelated to this migration.

---

# REPORT_FILE

`reports/TASK_3_6A_1A_PRODUCTION_DRY_RUN_DEPLOYMENT_REPORT.md`

# DOWNLOAD_COPY

`/sdcard/Download/TASK_3_6A_1A_PRODUCTION_DRY_RUN_DEPLOYMENT_REPORT.md` (copied and checksum-verified after this report was written).

# NEXT STEP

Task 3.6A-1a (staging + Production deployment of `create_order` dry-run pricing) is now fully complete on both environments. Per the explicit stop instruction: **no further work begins** — not 3.6A-1b, not the Payment Service, not 3.6B through 3.6G — without separate, explicit instruction from you.

---

*Report generated 2026-08-26.*
