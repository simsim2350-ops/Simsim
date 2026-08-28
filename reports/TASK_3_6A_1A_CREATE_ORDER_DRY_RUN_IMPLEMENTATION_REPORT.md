# Task 3.6A-1a — create_order Dry-Run Pricing

**Applied to Staging only. Production NOT touched — awaiting explicit approval per instruction.**

---

# EXECUTIVE SUMMARY

Added `p_dry_run boolean DEFAULT false` to `create_order` (Option D from the Task 3.6A-1 architecture audit), reusing the existing pricing code path literally, with a single early-return branch inserted after all pricing calculations and before any persistent mutation. **IMPLEMENTED and STAGING-VERIFIED.** 17 representative dry-run scenarios plus a same-transaction real-path parity control were run against Staging (`rgqsetckcigkgsyobyjg`), all inside a rolled-back transaction: dry-run totals matched the real `create_order` total exactly (6.00 == 6.00) for identical inputs; zero orders, zero coupon usage-count changes, and zero payment-transaction rows resulted from any of the 17 dry-run calls; two additional targeted tests confirmed a dry-run call never leaks a real, pre-existing order's id even when it reuses that order's exact idempotency key, while a non-dry-run call with the same reused key still correctly short-circuits to the real order (backward compatibility preserved). Full regression: **527/527 PASS**. Production migration file is written and ready but **not applied** — this report ends with an explicit approval request per the task's own instruction to stop before Production.

**Verdict: `TASK_3_6A_1A_COMPLETE_WITH_WARNINGS`** (one warning: a schema-drift finding unrelated to this task's own correctness — see WARNINGS).

---

# OBJECTIVE

Add a dry-run capability to `create_order` so the future Payment-First Checkout Service can obtain the authoritative server-calculated total before a Payment Transaction is created — without extracting the pricing engine, without a `quote_order` RPC, without a quote table, without touching Moyasar, the webhook, or any payment-service code. Exactly as scoped; nothing beyond it was built.

---

# CURRENT FUNCTION SIGNATURE

Verified live (not assumed from the SQL file) via `pg_get_function_identity_arguments`, before any change:

| Environment | Live signature (before this task) |
|---|---|
| Production (`gpwwnuuicywsvmmhxngs`) | `create_order(uuid, uuid, text, text, text, text, text, jsonb, text, text, numeric, uuid, uuid)` — `p_idempotency_key uuid` |
| Staging (`rgqsetckcigkgsyobyjg`) | `create_order(uuid, uuid, text, text, text, text, text, jsonb, text, text, numeric, text, uuid)` — `p_idempotency_key text` |

**Finding, confirmed live**: Staging's `p_idempotency_key` is `text`; Production's is `uuid`. This drift pre-dates this task (it originates from Task 3.5's staging variant, which intentionally preserved Staging's own pre-existing inline-validated `text` idempotency key rather than replacing it with Production's `uuid` type). This task did not introduce it and does not touch it — it only adds `p_dry_run` on top of whichever type each environment already has. Logged under WARNINGS.

Both environments confirmed to have exactly **one** `create_order` overload before this task began (`SELECT count(*) FROM pg_proc ... WHERE proname='create_order'` → `1` on both).

---

# NEW FUNCTION SIGNATURE

| Environment | New signature (after this task) |
|---|---|
| Staging (**applied**) | `create_order(uuid, uuid, text, text, text, text, text, jsonb, text, text, numeric, text, uuid, boolean)` — `p_dry_run boolean DEFAULT false` appended as parameter 14 |
| Production (**written, not applied**) | `create_order(uuid, uuid, text, text, text, text, text, jsonb, text, text, numeric, uuid, uuid, boolean)` — same addition, `p_idempotency_key` stays `uuid` |

`RETURNS TABLE(...)` — **unchanged**, same 9 columns, same names, same order, on both environments.

Confirmed on Staging after the migration: exactly **one** overload exists (`overload_count: 1`) — clean DROP+CREATE cutover, no ambiguous overload left live.

---

# MIGRATION

Two files created (both new; neither pre-existing file was modified):

- `sql/order_dry_run_pricing.sql` — Production-targeted. `DROP FUNCTION IF EXISTS public.create_order(uuid, uuid, text, text, text, text, text, jsonb, text, text, numeric, uuid, uuid)` (the exact live 13-arg Production signature, confirmed before writing) followed by `CREATE OR REPLACE FUNCTION` with the 14-arg signature. **Not applied to Production.**
- `sql/staging/staging_order_dry_run_pricing.sql` — Staging-targeted, following the established staging-guard convention (`DO $guard$ ... end $guard$` pre-flight block checking `p_idempotency_key text`, presence of `p_payment_transaction_id`, and absence of `p_dry_run` already, aborting otherwise). `DROP FUNCTION IF EXISTS public.create_order(uuid, uuid, text, text, text, text, text, jsonb, text, text, numeric, text, uuid)` (the exact live 13-arg Staging signature) followed by `CREATE OR REPLACE FUNCTION` with the 14-arg signature preserving Staging's own body shape (mandatory `text` idempotency key with inline length validation, `v_coupon_found` boolean instead of Production's `v_coupon_id`). **Applied to Staging via `apply_migration` — succeeded, `{"success":true}`.**

Both files are pure additions to the `sql/` tree — no pre-existing SQL file's content changed by this task.

---

# DRY_RUN_BEHAVIOR

**IMPLEMENTED.** Exactly three literal changes were made to the function body relative to the prior version (both environments, same three changes, adapted to each body's existing shape):

1. **New parameter**: `p_dry_run boolean DEFAULT false` — 14th parameter, default preserves existing behavior for every current caller.
2. **Idempotency short-circuit gains `and not p_dry_run`**: the existing "same idempotency key ⇒ return the previously-created order" lookup is skipped when `p_dry_run = true`. **Design decision, not in the original instruction text — recorded and justified below (RETURN_CONTRACT section).**
3. **One new `IF p_dry_run THEN ... RETURN` branch**, inserted immediately after the existing `price_changed` early-return block and immediately before the coupon `usage_count` UPDATE — i.e., after every pricing calculation, before every persistent mutation, exactly as instructed.

No pricing formula (discount/tax/delivery/options) was duplicated, rewritten, or touched. The coupon `FOR UPDATE` row lock, the restaurant/branch/product/option validation, and the `p_payment_transaction_id` validation are all byte-for-byte unchanged.

---

# PRICING_LOGIC

**Unchanged, verbatim.** Every calculation statement (product/option price lookup, subtotal accumulation, coupon discount math, VAT backing-out, delivery fee) is the exact same code that ran before this task, in the exact same order. The dry-run branch does not compute anything itself — it only returns variables (`v_net`, `v_tax`, `v_delivery_fee`, `v_total`, `v_price_changes`) that were already computed by the pre-existing code above it.

---

# COUPON_BEHAVIOR

**VERIFIED, not merely reasoned about.** On Staging, inside a rolled-back transaction:
- Three dry-run scenarios (`04_percent_coupon`, `05_fixed_coupon`, `06_capped_discount`) each referenced a coupon with `usage_count = 0`.
- A fourth dry-run scenario (`14_coupon_usage_limit`) referenced a coupon already at its usage limit (`usage_count = usage_limit = 1`, not expired) and correctly raised `coupon usage limit reached` — proving the limit check itself is unaffected by dry-run.
- Sum of `usage_count` across all restaurant coupons: **3 before all 17 dry-run calls, 3 after** — unchanged. Had any of the three coupon-discount dry-run scenarios incremented usage, the sum would have risen to 6. It did not.
- The `FOR UPDATE` row lock is acquired and released within the same single-statement RPC transaction exactly as before — dry-run does not hold it any longer or differently, since dry-run and real paths both execute inside the same one PL/pgSQL invocation and the lock is scoped to that invocation's transaction, not to any new construct introduced here.

---

# RETURN_CONTRACT

**No `RETURN_CONTRACT_GAP`.** The existing `RETURNS TABLE(id, order_number, access_token, subtotal, tax, delivery_fee, total, price_changed, price_changes)` already had everything needed: `id`/`order_number`/`access_token` return `NULL` (the same convention the pre-existing `price_changed` branch already used), `subtotal`/`tax`/`delivery_fee`/`total` carry the computed quote, `price_changed`/`price_changes` are reused as-is (`false`/`[]` on a clean dry-run quote; `true`/populated if a stale `p_client_total` was also passed — see AMOUNT_INTEGRITY). Currency is implicit SAR throughout the schema, unchanged, not part of this return contract, consistent with every other pricing path in this codebase.

**Design decision beyond the literal instruction text** (flagged explicitly, since the instructions did not anticipate this interaction): the existing idempotency short-circuit, if left untouched, would return a **real, pre-existing** order's `id`/`order_number`/`access_token` when a dry-run call happens to reuse an idempotency key already attached to a real order — which would violate "do not return a fake order ID... no order was created" in spirit (it's not fake, but it's a real order the *dry-run call itself* did not create, and returning it under a `p_dry_run=true` response is misleading). Fixed with a one-token change (`and not p_dry_run`) rather than a redesign. **Verified live**: dry-run with a reused real idempotency key returns `id=null, order_number=null, total=6.00` (freshly computed); a non-dry-run call with the same key (no `p_dry_run` argument at all, exercising the exact pre-existing caller pattern) still correctly returns the real order (`id=301cd74a-431f-4c6d-8f28-1e3bc23f1fd6, order_number=STG-41`) — proving both the new safety property and full backward compatibility in the same test pair.

---

# AMOUNT_INTEGRITY

**Verified, not assumed.** In one single rolled-back Staging transaction, scenario `01_simple_product` (`p_dry_run=true`) and scenario `18_REAL_parity_control` (`p_dry_run=false`, identical restaurant/branch/items/coupon/type inputs) were run back-to-back against identical database state:

| | `total` |
|---|---|
| Dry-run (#1) | **6.00** |
| Real, non-dry-run (#18) | **6.00** |

**`DRY_RUN_TOTAL == REAL_CREATE_ORDER_SERVER_TOTAL` confirmed exactly**, because both paths execute the identical pricing statements up to the branch point — the dry-run branch cannot diverge from the real path's total by construction, not merely by testing luck.

`p_client_total` interaction (scenario `15_price_mismatch`): passing `p_client_total := 999.99` together with `p_dry_run := true` triggered the **pre-existing, unmodified** `price_changed` branch first (it runs before the new dry-run branch in source order) — returned `total=6.00` (the true server total, never the client's number), `price_changed=true`, `price_changes=[{"client_total":999.99,"server_total":6}]`, and — critically — `id=null` (no mutation), exactly the same non-mutating shape as a normal dry-run success. `p_client_total` was never made authoritative at any point; the server total is always what's returned and always what would be charged.

---

# NO_SIDE_EFFECTS

**Proven with before/after counts inside the same rolled-back transaction**, not just checked once at the very end:

| | Before the 17 dry-run calls | After the 17 dry-run calls (before rollback) |
|---|---|---|
| `orders` | 4 | 4 |
| `payment_transactions` | 0 | 0 |
| sum(`coupons.usage_count`) | 3 | 3 |

(A count of 5 appeared only after the deliberate, separate, non-dry-run scenario #18 — the parity control — confirming the counting methodology itself is sound: it *does* detect a real mutation when one genuinely occurs, and it detected *zero* mutation from any of the 17 dry-run calls.)

After the whole test transaction was rolled back, Staging was independently re-queried and confirmed at its exact original baseline: `orders=4, products=2, coupons=3, payment_tx=0, branch delivery_enabled=false` — no residue from any test fixture (temporary products, temporary coupons, temporary delivery-fee override) remains on Staging.

---

# STAGING_VERIFICATION

Function existence and signature: **confirmed** (`overload_count=1`, full argument list matches the new 14-param signature).

All 17 requested scenarios executed, each in its own exception-caught block so one failure couldn't abort the batch — every result independently recorded:

| # | Scenario | Result |
|---|---|---|
| 1 | Simple product | OK — total 6.00 |
| 2 | Multiple products | OK — total 20.00 |
| 3 | Product options (required group) | OK — total 25.00 |
| 4 | Percent coupon (10%) | OK — total 5.40 |
| 5 | Fixed coupon (5) | OK — total 1.00 |
| 6 | Capped discount (50% capped to 3) | OK — total 9.00 |
| 7 | Delivery | OK — total 21.00 (delivery_fee 15) |
| 8 | Takeaway | OK — total 6.00 |
| 9 | Dine-in (qty 3) | OK — total 18.00 |
| 10 | Invalid product | ERROR — `product is unavailable for this branch` (correctly rejected) |
| 11 | Unavailable product | ERROR — `product is unavailable for this branch` (correctly rejected) |
| 12 | Invalid coupon | ERROR — `invalid or expired coupon` |
| 13 | Expired coupon (real pre-existing Staging data) | ERROR — `invalid or expired coupon` |
| 14 | Coupon usage limit reached (fresh, unexpired) | ERROR — `coupon usage limit reached` |
| 15 | Price mismatch (`p_client_total` tampered) | OK — `price_changed=true`, server total returned, no mutation |
| 16 | Empty cart | ERROR — `invalid items payload` |
| 17 | Invalid quantity (0) | ERROR — `invalid product or quantity` |

Every "OK" row: `ret_id = null`, no order created. Every "ERROR" row: raised and caught before reaching any mutation statement (all validation happens before the coupon-lock/pricing/insert section). For every successful dry-run: correct totals (hand-verified against the known formula for each scenario), zero order rows, zero coupon mutation, zero payment-transaction mutation — all confirmed above.

---

# PARITY_VERIFICATION

Performed **live**, not deferred: scenario 18 (`p_dry_run=false`) ran in the exact same transaction, against the exact same unmodified database state, with input identical to scenario 1 — `total` matched exactly (6.00 = 6.00). No unnecessary orders were left on Production or Staging (the real order created by scenario 18 was rolled back along with everything else). Real-path behavioral verification **was** safely performed — no blocker to report here.

---

# TEST_RESULTS

```
$ npx vitest run src/lib/orderJourneyGuards.test.js src/lib/orderPaymentReferenceGuard.test.js src/lib/pricing.test.js
 Test Files  3 passed (3)
      Tests  72 passed (72)
```

(Note: `tests/unit/orderJourneyGuards.test.js`, as literally named in the task instructions, does not exist in this repository — the actual file is `src/lib/orderJourneyGuards.test.js`. Located and run at its real path, along with the directly-relevant `orderPaymentReferenceGuard.test.js` — a static, offline guard test asserting `sql/order_payment_reference.sql`'s exact textual safety properties — and `pricing.test.js`.)

`orderPaymentReferenceGuard.test.js` targets `sql/order_payment_reference.sql` specifically, which this task did not modify — it passed unchanged, confirming this task's new files did not disturb it.

---

# FULL_REGRESSION

```
$ npx vitest run
 Test Files  37 passed (37)
      Tests  527 passed (527)
   Duration  56.81s
```

**527/527 PASS**, executed and observed directly (not claimed without execution). Baseline in the task instructions stated 526/526 — the current repository total is 527 (one additional test exists from a task completed earlier in this session, unrelated to this one); the important fact, independently confirmed, is **zero failures, zero regressions**.

---

# SECURITY

Static review, each point checked against the actual new SQL text and the live staging verification above:

| Check | Result |
|---|---|
| No client price becomes authoritative | Confirmed — `v_total` is always server-computed; the dry-run branch returns only server-computed variables |
| `p_client_total` remains advisory | Confirmed — untouched `price_changed` comparison logic, verified live in scenario 15 |
| `p_dry_run` defaults `false` | Confirmed in both migration files' signatures |
| Existing callers remain unchanged | Confirmed — full 527/527 regression pass + live backward-compatibility test (reused idempotency key, no `p_dry_run` argument, still returns the real order) |
| No order creation during dry-run | Confirmed — 17/17 dry-run scenarios, `ret_id=null`, order count unchanged |
| No coupon consumption during dry-run | Confirmed — `usage_count` sum unchanged across all dry-run calls |
| No payment transaction creation | Confirmed — `payment_transactions` count unchanged throughout |
| No Moyasar calls | Confirmed by inspection — this is a pure SQL/PL-pgSQL change; no network-capable code exists in `create_order` |
| No secret leakage | Confirmed — no new returned field, no credential/key referenced anywhere in either migration file |
| No RLS weakening | Confirmed — no RLS policy referenced or touched by either migration file |
| `SECURITY DEFINER` behavior unchanged except the new controlled parameter | Confirmed — identical `LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'` header on both environments, only the parameter list changed |

---

# ITEM_SUBSTITUTION_RESIDUAL_RISK

**Not solved in this task, as instructed.** Recorded per the audit's Phase 15 finding: a customer could theoretically obtain a dry-run quote for cart A, then submit cart B to the real `create_order` call, where cart B coincidentally totals the same amount as cart A's quote. Because `create_order` verifies **amount**, not **item-list identity**, against whatever was actually paid, this specific narrow scenario would not be caught by the amount-matching mechanism alone. No cart hashing, no quote persistence, and no mitigation of any kind was introduced in this task — this is carried forward exactly as the architecture audit left it, as a separate, later design decision.

---

# PRODUCTION_STATUS

**NOT APPLIED.** Per the explicit instruction ("DO NOT deploy to Production automatically... STOP before applying Production and report the exact command/approval needed"), and per this project's own permanent Rule 1 (no change without prior owner approval), Production was not touched in any way — read-only signature verification only (`SELECT pg_get_function_identity_arguments(...)`), zero writes.

**Production deployment plan, ready pending your approval:**

- **File**: `sql/order_dry_run_pricing.sql` (already written, in this task, unapplied)
- **Preconditions verified**: Production's live `create_order` signature is exactly `create_order(uuid, uuid, text, text, text, text, text, jsonb, text, text, numeric, uuid, uuid)` (confirmed live, matches the file's `DROP FUNCTION IF EXISTS` clause exactly) — one overload, no ambiguity.
- **Exact action, if approved**: apply `sql/order_dry_run_pricing.sql` to project `gpwwnuuicywsvmmhxngs` via `execute_sql` or `apply_migration` (either is safe here — no `CONCURRENTLY` clause is involved, unlike the earlier idempotency-index migration).
- **Expected result**: identical in kind to what was just verified on Staging — one `create_order` overload, 14 parameters, `p_dry_run` defaulting to `false`, zero change to any existing caller's behavior.
- **Rollback if needed**: `DROP FUNCTION public.create_order(uuid, uuid, text, text, text, text, text, jsonb, text, text, numeric, uuid, uuid, boolean); ` then recreate the prior 13-arg signature from `sql/order_payment_reference.sql` (unmodified, still the authoritative record of that exact prior body).

**Awaiting your explicit go-ahead before this is applied to Production.**

---

# GIT_STATUS

```
$ git status --short
 M src/payments/adapters/moyasar.js
 M src/payments/types/index.js
 M supabase/functions/payment-webhook/handler.js
 M tests/unit/MoyasarAdapter.test.js
 M tests/unit/paymentWebhook.test.js
?? sql/order_dry_run_pricing.sql                      ← NEW, this task
?? sql/staging/                                        ← NEW, this task (staging_order_dry_run_pricing.sql; staging_order_payment_reference.sql and staging_payments_gateway_foundation.sql pre-existing from earlier tasks, also untracked)
?? reports/TASK_3_6A_1A_CREATE_ORDER_DRY_RUN_IMPLEMENTATION_REPORT.md  ← NEW, this report
(plus the same set of pre-existing untracked report files from prior tasks — unchanged, not touched by this task)

$ git diff --stat
 src/payments/adapters/moyasar.js              | 20 +++++-
 src/payments/types/index.js                   |  3 +
 supabase/functions/payment-webhook/handler.js | 19 ++++++
 tests/unit/MoyasarAdapter.test.js             | 57 ++++++++++++++--
 tests/unit/paymentWebhook.test.js             | 95 +++++++++++++++++++++++++++
 5 files changed, 187 insertions(+), 7 deletions(-)   ← IDENTICAL to every prior task this session — these 5 files were not touched by this task
```

**No commit, no push, no merge.** Only the two new SQL files and this report were added.

---

# FILES_CHANGED

| File | Status | Note |
|---|---|---|
| `sql/order_dry_run_pricing.sql` | **NEW** | Production-targeted migration, written, not applied |
| `sql/staging/staging_order_dry_run_pricing.sql` | **NEW** | Staging-targeted migration, applied and verified |
| `reports/TASK_3_6A_1A_CREATE_ORDER_DRY_RUN_IMPLEMENTATION_REPORT.md` | **NEW** | This report |
| Staging database (`rgqsetckcigkgsyobyjg`) | **MODIFIED** | `create_order` function replaced with the 14-param dry-run-capable version (intentional, permanent on Staging) |
| Production database (`gpwwnuuicywsvmmhxngs`) | **UNCHANGED** | Read-only signature check only |
| Everything else | **UNCHANGED** | No other file, table, RLS policy, Edge Function, or Moyasar configuration touched |

---

# BLOCKERS

None. Staging verification, parity verification, and full regression all completed successfully with no obstacle encountered.

# WARNINGS

1. **Staging/Production `p_idempotency_key` type drift** (`text` vs. `uuid`) — pre-existing, not introduced by this task, not corrected by this task (correcting it was out of scope and would itself be a schema change requiring separate approval). Both migration files in this task correctly preserve each environment's existing type, so this task did not make the drift worse, but it remains a standing fact worth the owner's awareness for any future task that assumes signature parity between environments.
2. This report's "REPORT" instruction requested `npx vitest run tests/unit/orderJourneyGuards.test.js` verbatim; that exact path does not exist in this repository. The real file (`src/lib/orderJourneyGuards.test.js`) was located and run instead, along with the directly relevant `orderPaymentReferenceGuard.test.js`. Flagging this explicitly rather than silently substituting.

---

# REPORT_FILE

`reports/TASK_3_6A_1A_CREATE_ORDER_DRY_RUN_IMPLEMENTATION_REPORT.md`

# DOWNLOAD_COPY

`/sdcard/Download/TASK_3_6A_1A_CREATE_ORDER_DRY_RUN_IMPLEMENTATION_REPORT.md` (copied and checksum-verified after this report was written).

# NEXT_STEP

Awaiting your explicit approval to apply `sql/order_dry_run_pricing.sql` to Production (`gpwwnuuicywsvmmhxngs`). No further work (3.6A-1b, 3.6B–3.6G, Payment Service, Moyasar sandbox, item-substitution mitigation) begins without separate explicit instruction, per the task's strict stop list.

---

*Report generated 2026-08-26.*
