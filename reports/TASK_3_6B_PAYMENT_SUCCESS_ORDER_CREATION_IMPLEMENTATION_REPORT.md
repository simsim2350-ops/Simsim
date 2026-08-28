# Task 3.6B — Payment Success → Order Creation

**IMPLEMENTED. No Moyasar call. No schema change. No webhook change. No unrelated file touched.**

---

# EXECUTIVE SUMMARY

Implemented `createOrderFromSuccessfulPayment` (appended to `src/payments/services/checkoutOrchestration.js`, extending 3.6A-2's existing service — no new competing layer created), the second half of the Payment-First flow: given a `paymentTransactionId`, it authoritatively re-verifies payment success from the `status` column (never a client flag), reconstructs the order's price/cart-identity fields **exclusively** from the stored `payment_transactions.metadata.checkout` snapshot (never a new client-submitted cart), re-validates that snapshot's fingerprint via the existing, unmodified `computeCheckoutFingerprint`, confirms `payment_transactions.amount` exactly equals the snapshot's `total`, and only then calls the existing `create_order` RPC with `p_dry_run=false` — the **only** such call anywhere in this task, anywhere in the whole payment-first arc so far. The order is linked via `create_order`'s **already-existing** `p_payment_transaction_id` parameter (confirmed — no contract gap, no `ORDER_PAYMENT_REFERENCE_CONTRACT_GAP`). Idempotency against replay/duplicate-order-creation is achieved through the **already-existing** `orders_payment_transaction_id_uidx` unique index (re-verified live in 3.6A-2A), reinforced by reusing the payment transaction's own id as `p_idempotency_key` and by an explicit pre-check read — **no migration was needed or created.** `create_order`, `paymentService.js`, `MoyasarAdapter`, and the webhook are all confirmed unchanged. 19 new tests (17 required scenarios + 1 split sub-case + the integration test) all pass. Full regression: **652/652 PASS** (633 baseline + 19 new).

**Verdict: `TASK_3_6B_COMPLETE`**

---

# EXISTING_CONTRACTS

Re-inspected before writing any code, per Phase 1's explicit instruction — nothing assumed:

- **`create_order` RPC**: live Production signature re-confirmed unchanged since 3.6A-1a's deployment — 14 args including `p_payment_transaction_id uuid DEFAULT NULL` (Task 3.5) and `p_dry_run boolean DEFAULT false` (3.6A-1a). Validates `p_payment_transaction_id` exists and belongs to `p_restaurant_id` before use; on a unique-violation of `orders_payment_transaction_id_uidx`, raises `'payment reference already linked to another order'`.
- **`orders` schema**: `payment_transaction_id uuid REFERENCES payment_transactions(id) ON DELETE SET NULL`, with `orders_payment_transaction_id_uidx` — a **unique partial index**, `WHERE payment_transaction_id IS NOT NULL` — already live (Task 3.5, re-confirmed in 3.6A-2A).
- **`payment_transactions` schema**: unchanged since 3.6A-2A's own re-verification (this task re-confirmed nothing has changed — no new migration ran between that audit and this task).
- **`useCheckout.js`**: confirmed to be the separate, unmodified cash-flow order-creation path — not touched, not reused, not duplicated by this task's new code.
- **3.6A-2 orchestration (`initiatePaymentFirstCheckout`)**: re-read in full, confirmed **unchanged** by this task — `createOrderFromSuccessfulPayment` is a new, separate function in the same file, sharing only imports (`computeCheckoutFingerprint`, `TransactionStatus`), never calling or being called by `initiatePaymentFirstCheckout`.
- **`paymentService.js`**: re-read, confirmed **not imported or called anywhere** in the new function — this task's own code never triggers a second payment attempt (Test OFP-11 directly proves this via source inspection).
- **Existing tests**: `checkoutOrchestration.test.js`'s `makeChain`/`makeDb` mocking pattern reused verbatim for this task's own test file, for consistency with the established convention rather than inventing a new one.

---

# PAYMENT_SUCCESS_DEFINITION

**`TransactionStatus.SUCCEEDED` (`'succeeded'`)** — the existing enum value, unchanged, already the value the webhook/`paymentService` write on a genuine successful charge. **No new database status was invented.** The check reads `payment_transactions.status` **live from the database** (`db.from('payment_transactions').select(...).eq('id', ...)`), never from any client-supplied field — the function's own input signature doesn't even accept a `status`/`paymentResult` parameter at all, structurally preventing a client flag from ever being consulted (OFP-05 proves both `pending` and `failed` stored statuses correctly block order creation).

---

# PAYMENT_TRANSACTION_OWNERSHIP

The row is fetched by `paymentTransactionId` alone; its `restaurant_id` **column** (not any client-supplied value) becomes the sole authoritative restaurant identity for the rest of the function — used as `p_restaurant_id` in the eventual `create_order` call (OFP-15 proves this directly: a bogus `expectedRestaurantId` still results in the column's real value being used). An **optional** `expectedRestaurantId` input allows a defense-in-depth assertion (if the caller has its own expectation and it disagrees with the actual owning restaurant, reject immediately, before touching the snapshot at all — OFP-07) — but this is never the source of truth, only an extra check.

**Amount and checkout-snapshot ownership** are verified as part of AMOUNT_INTEGRITY/SNAPSHOT_VALIDATION below — together these satisfy Phase 3's full requirement ("belongs to the authenticated/authorized restaurant, the correct payment attempt, the expected amount, the expected checkout snapshot/fingerprint").

---

# SNAPSHOT_VALIDATION

`payment_transactions.metadata.checkout` (3.6A-1b.2's output, unmodified) is read as the **sole** source for `restaurant_id`, `branch_id`, `type`, `items`, `coupon_code` — no second cart payload is accepted from the client at any point; the function's input signature has no `items`/`coupon_code`/`restaurant_id`/`branch_id`/`type` parameter at all, so there is structurally nothing for a client to override even if it tried (OFP-16 confirms injecting an unrelated `fingerprint` field into the input has zero effect, since no such field is ever read). Missing or malformed `metadata.checkout` (absent, not an object, or `items` not an array) → `status: 'rejected', reason: 'snapshot_missing'`.

A `snapshot.restaurant_id !== paymentTx.restaurant_id` internal-consistency check is also enforced (a defensive tripwire — should never actually fire given the snapshot's own construction guarantees from 3.6A-2, but present per the task's emphasis on not trusting anything blindly).

---

# AMOUNT_INTEGRITY

`payment_transactions.amount` (the column recording what was **actually charged**) is compared against `snapshot.total` using a tolerant-but-non-mutating `numericEquals` helper (accepts either a JS number or a numeric string on **both** sides — the same real-world PostgREST-numeric-serialization consideration already handled in 3.6A-1b.2's `assertServerNumeric`, since these two values are read from a genuine `numeric` column and a `jsonb`-embedded value respectively, which can legitimately differ in JS type even when numerically identical) — **comparison only, never used to derive or store a new value**. A mismatch → `status: 'rejected', reason: 'amount_integrity_violation'`, **before** any `create_order` call (OFP-03). No arithmetic is performed on either value anywhere in this function.

---

# FINGERPRINT_VALIDATION

`computeCheckoutFingerprint` — the **exact, unmodified** 3.6A-1b.1 function — is called with the snapshot's own `restaurant_id`/`branch_id`/`type`/`items`/`coupon_code`, and the result is compared against `snapshot.fingerprint`. No fingerprint logic is duplicated. **No client-supplied fingerprint is ever accepted as authoritative** — the function's input signature has no fingerprint parameter at all (OFP-16 confirms an injected one is simply never read). A mismatch → `status: 'rejected', reason: 'snapshot_fingerprint_mismatch'`, order creation does not proceed (OFP-04).

---

# CREATE_ORDER_INTEGRATION

The **only** `create_order(p_dry_run=false)` call in this entire task (and, per 3.6A-1a/2's own scoping, the first one anywhere in this whole implementation arc). Parameters:

| Param | Source |
|---|---|
| `p_restaurant_id` | `paymentTx.restaurant_id` (column — strongest trust) |
| `p_branch_id`, `p_type`, `p_items`, `p_coupon_code` | The verified `snapshot` |
| `p_client_total` | `snapshot.total` — **not** a new client-supplied value; the already-verified paid amount, passed to activate `create_order`'s own existing `price_changed` safety net (see COUPON_BEHAVIOR) |
| `p_table_number`, `p_delivery_address`, `p_customer_name`, `p_customer_phone`, `p_notes` | The caller's **current** request context — fulfillment-only fields `create_order` requires that were deliberately excluded from the snapshot (3.6A-1b.2's own PII-minimization decision); never used for restaurant/branch/item/coupon selection |
| `p_idempotency_key`, `p_payment_transaction_id` | Both = `paymentTx.id` (see IDEMPOTENCY) |
| `p_dry_run` | `false` — hardcoded literal, the only occurrence in this task |

No pricing/order business logic is reimplemented in JavaScript anywhere — `create_order`'s existing validations (product/branch/coupon/option checks, phone format, fulfillment-field requirements by type) all run exactly as before, unmodified.

---

# PAYMENT_TRANSACTION_ID_LINKAGE

**No contract gap — `create_order` already accepts `p_payment_transaction_id` (Task 3.5).** Used directly (OFP-02 confirms the exact value passed and returned matches). `ORDER_PAYMENT_REFERENCE_CONTRACT_GAP` does **not** apply to this task.

---

# IDEMPOTENCY

Two layers, both reusing **already-existing** database mechanisms — no migration created:

1. **Explicit pre-check**: before touching the snapshot at all, `SELECT id, order_number, order_access_token FROM orders WHERE payment_transaction_id = paymentTx.id` — if found, the existing order is returned immediately (`idempotent: true`), with **zero** further validation and **zero** `create_order` calls (OFP-08). This mirrors `paymentService.startCharge`'s own established SELECT-before-INSERT pattern, for consistency.
2. **`orders_payment_transaction_id_uidx`** (already-existing, re-verified live in 3.6A-2A) — the actual database-level guarantee. If a genuine concurrency race slips past the pre-check (two calls both see "no existing order" before either commits), `create_order`'s `INSERT` raises a unique-violation, caught here (message-pattern matched against the constraint name / `create_order`'s own raised message), followed by a safe re-read — returning the winning order as `idempotent: true`, **never** a second order (OFP-09).

`p_idempotency_key = paymentTx.id` is additionally passed to `create_order`, giving a **third**, independent layer via `create_order`'s own pre-existing idempotency short-circuit — belt-and-suspenders, not a new mechanism.

---

# REPLAY_BEHAVIOR

All 9 specified cases, verified by test:

| Case | Behavior | Test |
|---|---|---|
| A. Succeeded + no order | Order created | OFP-01 |
| B. Succeeded + order exists | Existing order returned, `idempotent:true` | OFP-08 |
| C. Failed + no order | Rejected, no order | OFP-05 |
| D. Pending + no order | Rejected, no order | OFP-05 |
| E. Transaction not found | Rejected | OFP-06 |
| F. Wrong-restaurant expectation | Rejected | OFP-07 |
| G. Invalid snapshot | Rejected (missing / fingerprint mismatch) | OFP-04 |
| H. Amount mismatch | Rejected | OFP-03 |
| I. Duplicate `create_order` race | Existing order safely returned, no duplicate | OFP-09 |

---

# ATOMICITY

`create_order` remains the sole atomic unit — its own `INSERT ... EXCEPTION WHEN unique_violation` block (Task 3.5, unmodified) is what actually enforces "at most one order per payment transaction" at the database level; this task's JS-level pre-check is a performance/UX optimization layered on top, not a substitute for it. **No new transaction abstraction was introduced** — confirmed sufficient for this task's idempotency requirement precisely because `orders_payment_transaction_id_uidx` already exists and is already proven (3.6A-2A) to correctly reject a second insert under the same reference. No gap was found requiring escalation.

---

# COUPON_BEHAVIOR

Traced exactly per Phase 12's question: **can coupon/price re-validation cause `create_order` to fail or produce a different total after payment already succeeded?** **Yes — and this is not solved here, exactly as instructed.** `create_order`'s own existing coupon re-check (validity, expiry, usage limit, `FOR UPDATE` lock) and price recomputation run unconditionally on every real call, including this one. If either has drifted since the payment succeeded, `create_order` returns `price_changed: true` (or, for a genuinely invalid/expired coupon, raises an exception) — **no order is created**, and this function returns `status: 'price_drift_requires_reconciliation'` (or a `create_order_failed` rejection for the exception case) — **never** `'failed'`, since the payment itself did succeed; this is a distinct, G-5-adjacent state requiring separate reconciliation (3.6E, not built, exactly as the task instructed not to solve here). Confirmed by OFP-10: `create_order` returning `price_changed: true` with no exception produces this exact classification, not a false claim of definite failure.

---

# RESULT_CONTRACT

| `status` | Fields |
|---|---|
| `succeeded` | `orderId`, `orderNumber`, `accessToken`, `paymentTransactionId`, `idempotent` |
| `rejected` | `reason`, `message` (where applicable), `paymentTransactionId` (where resolved) |
| `price_drift_requires_reconciliation` | `paymentTransactionId`, `dryRun: {subtotal, tax, delivery_fee, total}` |
| `retryable_error` | `reason`, `paymentTransactionId` |

**Never returned**: raw Postgres/Supabase error objects (only `.message` strings surfaced), provider secrets or credentials (never referenced anywhere in this function), the raw `create_order` items/pricing payload beyond the specific fields listed above.

---

# TESTS

All 17 required scenarios, `tests/unit/orderFromPayment.test.js` (`OFP-01`–`OFP-17`):

| # | Scenario | Result |
|---|---|---|
| 1 | Successful payment → Order created | PASS |
| 2 | Order created with correct `payment_transaction_id` | PASS |
| 3 | Amount mismatch → Order NOT created | PASS |
| 4 | Snapshot fingerprint invalid → Order NOT created | PASS |
| 5 | Payment not successful (pending + failed sub-cases) → Order NOT created | PASS |
| 6 | Payment transaction not found → rejected | PASS |
| 7 | Tenant mismatch → rejected | PASS |
| 8 | Already-existing Order for same payment → same Order returned, no duplicate | PASS |
| 9 | Concurrent duplicate execution → only one Order (DB-guarantee-based race recovery) | PASS |
| 10 | Coupon/price mismatch after payment → Order NOT created, safe reconciliation state | PASS |
| 11 | No second payment attempt triggered (`startCharge` never referenced) | PASS |
| 12 | No Moyasar call (no adapter import, checked via import-line-only scan to avoid false positives on explanatory comments) | PASS |
| 13 | No webhook modification required (source-text check) | PASS |
| 14 | Client cannot control amount (`p_client_total` always `snapshot.total`, regardless of injected fields) | PASS |
| 15 | Client cannot control payment_transaction_id ownership (`p_restaurant_id` always the column value) | PASS |
| 16 | Client-supplied fingerprint is ignored (no such input exists) | PASS |
| 17 | No PII required beyond what `create_order` already requires (`customerPhone` alone, with `tableNumber`, suffices) | PASS |

---

# INTEGRATION_TEST

`INTEG-01`: a fully synthetic chain — a fake succeeded `payment_transactions` row with a real, correctly-computed snapshot/fingerprint → `createOrderFromSuccessfulPayment` → a fake `create_order` RPC response → verifies the exact returned `{orderId, orderNumber, accessToken, paymentTransactionId, idempotent}` shape and every RPC parameter sent (`p_payment_transaction_id`, `p_restaurant_id`, `p_branch_id`, `p_items`, `p_client_total`, `p_dry_run:false`). **No real database, no real Moyasar call** — fake `db` only, per instruction.

---

# FULL_REGRESSION

```
$ npx vitest run
 Test Files  40 passed (40)
      Tests  652 passed (652)

$ npm test -- --run
 Test Files  40 passed (40)
      Tests  652 passed (652)
```

**652/652 PASS** on both invocations (633 baseline + 19 new), zero failures, zero regressions. One transient, previously-documented Vitest tooling flake (`different 'maxWorkers'...`) occurred once and was resolved by an immediate retry — unrelated to this task's code. Two self-inflicted test false-positives were found and fixed during authoring (a syntax error from an inline `await import(...)` expression not supported by the current parser under this test file's environment pragma, and a purity-check regex matching this file's own explanatory Arabic comments about `MoyasarAdapter` rather than an actual import) — both documented here for transparency, neither indicating a defect in the implementation itself.

---

# STATIC_REVIEW

| Check | Result |
|---|---|
| `create_order` unchanged unless justified | Confirmed unchanged — no `sql/` file touched, no migration |
| `paymentService` unchanged unless justified | Confirmed unchanged |
| `MoyasarAdapter` unchanged unless justified | Confirmed unchanged |
| Webhook unchanged | Confirmed unchanged |
| No PII leakage | Confirmed — result contract excludes it; input only accepts what `create_order` itself already requires |
| No duplicate Order logic in JS | Confirmed — `create_order` remains the sole pricing/order-creation authority |
| No duplicate pricing logic in JS | Confirmed — zero arithmetic on any price field anywhere in this function |
| No client-trusted amount | Confirmed — `p_client_total` always `snapshot.total`, never a fresh client value |
| No client-trusted fingerprint | Confirmed — no such input exists |
| No schema change unless explicitly required and reported | Confirmed — none required; `ORDER_PAYMENT_REFERENCE_CONTRACT_GAP` does not apply |

---

# GIT_STATUS

```
$ git status --short
 M src/payments/adapters/moyasar.js
 M src/payments/index.js
 M src/payments/services/index.js                 ← content updated this task (still net +1 line vs. committed baseline)
 M src/payments/types/index.js
 M supabase/functions/payment-webhook/handler.js
 M tests/unit/MoyasarAdapter.test.js
 M tests/unit/paymentWebhook.test.js
?? src/payments/services/checkoutOrchestration.js  ← extended this task (createOrderFromSuccessfulPayment added)
?? tests/unit/orderFromPayment.test.js              ← NEW, this task
?? reports/TASK_3_6B_PAYMENT_SUCCESS_ORDER_CREATION_IMPLEMENTATION_REPORT.md  ← this report
(plus the same set of pre-existing untracked report/sql/module files from prior tasks — unchanged)

$ git diff --stat
 src/payments/adapters/moyasar.js              | 20 +++++-
 src/payments/index.js                         |  1 +
 src/payments/services/index.js                |  1 +
 src/payments/types/index.js                   |  3 +
 supabase/functions/payment-webhook/handler.js | 19 ++++++
 tests/unit/MoyasarAdapter.test.js             | 57 ++++++++++++++--
 tests/unit/paymentWebhook.test.js             | 95 +++++++++++++++++++++++++++
 7 files changed, 189 insertions(+), 7 deletions(-)
```

All previously-tracked files' diffs are byte-identical to every prior report this session — `services/index.js`'s single line was already counted as "+1" from 3.6A-2 and remains "+1" against the committed baseline (its *content* changed to add the new export, but since the line itself was never committed, git's diff against the last commit still shows it as one added line). `checkoutOrchestration.js` and its test file remain untracked, as established since 3.6A-2. **No commit, no push, no merge.**

---

# FILES_CHANGED

| File | Status |
|---|---|
| `src/payments/services/checkoutOrchestration.js` | **EXTENDED** — `createOrderFromSuccessfulPayment` + 2 small private helpers added; `initiatePaymentFirstCheckout` (3.6A-2) untouched |
| `tests/unit/orderFromPayment.test.js` | **NEW** — 19 tests |
| `src/payments/services/index.js` | **MODIFIED** — export list updated to include `createOrderFromSuccessfulPayment` |
| `create_order`, `paymentService.js`, `moyasar.js`, webhook | **NOT TOUCHED** |

---

# BLOCKERS

None.

# WARNINGS

1. Same class of note as 3.6A-2: the concurrency-race detection (`ORDER_PAYMENT_RACE_MARKER`) depends on `create_order`'s own current exception message text (`'payment reference already linked to another order'`) and/or the live constraint name — both re-verified this task, but a future change to either without updating this classifier in lockstep could cause a genuine race to be misclassified as a generic failure instead of being gracefully recovered.
2. Order creation via this path still requires `customerPhone` (and, depending on `type`, `tableNumber`/`deliveryAddress`) to be supplied **at the moment this function is called** — consistent with `create_order`'s own unchanged requirements, but this means a scenario where the browser disappears **before** this function is ever invoked (no fresh request arrives with these fulfillment fields) is **not** covered by this task — that remains explicitly 3.6E/reconciliation territory, as already flagged in the 3.6A-1B architecture audit's own PRIVACY section.
3. Two self-inflicted, immediately-fixed test-authoring issues occurred during this task (documented under FULL_REGRESSION) — neither affects the shipped implementation.

---

# REPORT_FILE

`reports/TASK_3_6B_PAYMENT_SUCCESS_ORDER_CREATION_IMPLEMENTATION_REPORT.md`

# DOWNLOAD_COPY

`/sdcard/Download/TASK_3_6B_PAYMENT_SUCCESS_ORDER_CREATION_IMPLEMENTATION_REPORT.md` (copied and checksum-verified after this report was written).

# NEXT_STEP

Per the strict stop instruction: **no further work begins** — not 3.6C, not 3.6D, not 3.6E, not 3.6G — without separate, explicit instruction from you.

---

*Report generated 2026-08-26.*
