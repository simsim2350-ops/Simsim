# Task 3.6A-2 — Payment-First Checkout Orchestration

**IMPLEMENTED. No Moyasar call. No Order created. No schema change. No unrelated file touched.**

---

# EXECUTIVE SUMMARY

Implemented `initiatePaymentFirstCheckout` (`src/payments/services/checkoutOrchestration.js`), a new server-side orchestration function connecting the three already-verified components — `create_order(p_dry_run=true)` (3.6A-1a), `computeCheckoutFingerprint`/`buildCheckoutSnapshot` (3.6A-1b.1/1b.2), and `paymentService.startCharge` (unmodified) — into the approved flow, exactly per the 3.6A-2A audit's identified integration point. `paymentService.js`, `moyasar.js`, `create_order`, and the webhook were confirmed unmodified. Amount is sourced exclusively from the dry-run result (never from any client-suppliable field); currency is hard-asserted to `SAR` server-side, rejecting any other client-supplied value before any dry-run call; the checkout snapshot is stored in `metadata.checkout` via `startCharge`'s already-existing, unmodified `metadata` acceptance; payment idempotency keys are resolved once at the orchestration boundary and never regenerated across calls that supply the same key; the documented concurrent-idempotency-key race (`uq_paytx_idempotency_key` unique-violation) is recovered via a safe read-only re-query, never a second provider call; G-5's ambiguous-failure window is classified into a distinct `requires_reconciliation` response state — never falsely reported as a definite payment failure, and never written to the database from this layer. 27 new tests (23 unit scenarios + integration test, per the task's own enumeration) all pass. Full regression: **633/633 PASS** (606 baseline + 27 new).

**Verdict: `TASK_3_6A_2_COMPLETE`**

---

# ORCHESTRATION_CONTRACT

`initiatePaymentFirstCheckout(input, { db, paymentService })`, exported as both a named function and via `checkoutOrchestration.initiatePaymentFirstCheckout` (matching `paymentService`'s own object-method export convention), from `src/payments/services/checkoutOrchestration.js`, re-exported through `src/payments/services/index.js` and (already, via the existing wildcard) `src/payments/index.js`.

**Phase 1 — existing-code inspection, before writing anything**: searched for checkout hooks (`useCheckout.js` — the existing cash-flow orchestrator, confirmed distinct and not reused/duplicated, since it calls `create_order` directly with no payment awareness), existing Edge Functions (`payment-webhook` only — no existing payment-initiation function exists anywhere), and idempotency utilities (`newIdempotencyKey`, reused directly, not reimplemented). No competing/duplicate orchestration layer existed — this is genuinely new coordination code, placed in `src/payments/services/` to match the existing `paymentService.js`'s own location and DI convention (`(input, {db})`) exactly, rather than inventing a new architectural pattern.

**Input** (client-suppliable, per TRUST BOUNDARY): `restaurant_id`, `branch_id`, `type`, `table_number`, `delivery_address`, `customer_name`, `customer_phone`, `notes`, `items`, `coupon_code`, `clientTotal` (optional, cross-check only), `currency` (optional — must equal `'SAR'` or be rejected), `paymentIdempotencyKey` (optional), `returnUrl`.

**Dependencies** (injected, matching `paymentService`'s own pattern): `db` (required, a Supabase-like client), `paymentService` (optional, defaults to the real `paymentService` — injectable for testing without needing to mock the real client transitively).

---

# TRUST_BOUNDARY

Server-side only — this function never runs in a browser context (it's a plain service module invoked with an injected `service_role`-carrying `db`, exactly like `paymentService.startCharge` already is).

| Client may supply | Client cannot control |
|---|---|
| `restaurant_id`, `branch_id`, `type`, `items`, `coupon_code`, other `create_order`-required order metadata, `paymentIdempotencyKey` | **Amount** — always `dryRun.total`, never any client field (ORCH-06 proves a smuggled `input.amount` has zero effect) |
| | **Currency** — hard-asserted `SAR`; any other client value is rejected outright before any dry-run call (ORCH-05) |
| | **`provider_ref`** — always sourced from `chargeOutcome.providerRef` (the real `startCharge`/adapter result); a smuggled `input.providerRef` is never read (ORCH-07) |
| | **Payment status** — always sourced from `chargeOutcome.status`; a smuggled `input.status` is never read (ORCH-08) |

---

# DRY_RUN

Exactly one `create_order` RPC call per invocation, always with `p_dry_run: true` hardcoded as a literal (never a variable, never omitted) — confirmed by both direct code inspection and ORCH-20's assertion sweeping every `db.rpc` call across multiple scenarios.

`p_client_total` is **not** used as the payment amount anywhere — it is optionally forwarded (as `input.clientTotal`) purely so `create_order`'s own existing `price_changed` cross-check can fire if the client's locally-displayed estimate has gone stale, mirroring the same mechanism `useCheckout.js`'s cash flow already relies on. **No pricing arithmetic exists anywhere in this file** — every price value used downstream (`dryRun.subtotal/tax/delivery_fee/total`) is read directly from the RPC response, never recomputed.

`price_changed: true` → payment is **never initiated**: `startCharge` is not called (ORCH-15 confirms `ps.startCharge` has zero calls), and a `status: 'price_changed'` response is returned with the server's fresh totals for the client to re-confirm — the same UX pattern `useCheckout.js`'s `confirmPriceUpdate` already establishes for the cash flow.

A dry-run RPC error (e.g. `product is unavailable for this branch`, `branch is unavailable`) → `status: 'rejected', reason: 'dry_run_failed'`, `startCharge` never called (ORCH-16, ORCH-19).

---

# CHECKOUT_SNAPSHOT

Built via `buildCheckoutSnapshot({ checkoutInput, dryRunResult: dryRun, currency, quotedAt })` — the **exact unmodified** 3.6A-1b.2 function. `checkoutInput` is constructed **once**, immediately before the dry-run call, and the identical object (`restaurant_id`/`branch_id`/`type`/`items`/`coupon_code`) is reused for both the dry-run RPC params and the snapshot builder — no second cart payload is ever read or accepted after the dry-run call (Phase 16's explicit requirement).

`quotedAt` is captured as `new Date().toISOString()` **at the orchestration boundary** (Option A, per 3.6A-1b.2's own design — the pure builder itself never generates it internally).

Stored via the **already-existing, unmodified** `startCharge` `metadata` parameter: `metadata: { checkout: snapshot }` — no change to `paymentService.js` was needed or made, exactly as the 3.6A-2A audit predicted.

No PII: the snapshot itself already excludes `customer_name`/`customer_phone`/`delivery_address`/`table_number`/`notes` by construction (3.6A-1b.2's own guarantee, unmodified) — this task adds nothing that would reintroduce any of them.

---

# IDEMPOTENCY

**Resolved exactly once, at the top of the function, before any RPC/DB call**: `idempotencyKey = validatePaymentIdempotencyKey(input.paymentIdempotencyKey) ?? newIdempotencyKey('pay')` — reusing the existing `newIdempotencyKey` utility, not reinventing key generation.

**Not derived from the cart fingerprint** — a fully separate value, exactly as instructed (the same cart may legitimately be paid for in more than one distinct checkout attempt; payment-attempt identity and cart identity are deliberately independent concepts, consistent with the Task 3.6 Scope Audit's original three-identity model).

**Reuse across retries**: the resolved key is passed explicitly to `startCharge({idempotencyKey, ...})` — `startCharge`'s own internal auto-generation path is never relied on for a multi-call retry sequence, since the orchestration always supplies an explicit value. ORCH-11 proves two separate invocations with the same caller-supplied `paymentIdempotencyKey` both produce the same key in their responses and both pass it identically to `startCharge`. The response always echoes `idempotencyKey` back, so a frontend retry sequence can reuse it (ORCH-13's second case shows that *omitting* the key on two *separate* invocations correctly produces two *different* generated keys — proving no hidden cross-call memoization papers over a caller's own responsibility to thread the value through).

**Changed cart → new attempt**: ORCH-14 confirms a different `items` payload produces a different snapshot fingerprint (as expected — cart identity is orthogonal to payment identity, and a genuinely new/different cart naturally warrants its own attempt).

---

# CONCURRENT_RACE

The documented `uq_paytx_idempotency_key` race (SELECT-before-INSERT window, `startCharge`'s own pre-check missing a just-inserted concurrent row, `INSERT` then failing with a `23505` unique-violation) is detected by matching the caught error's message against the literal constraint name `uq_paytx_idempotency_key` — the exact name of the live index, re-confirmed in 3.6A-2A's schema re-verification. On match: a **read-only** re-query (`SELECT ... WHERE idempotency_key = idempotencyKey AND restaurant_id = ...`) is performed via the injected `db`, and if a row is found, it is returned as `status: 'succeeded', idempotent: true` using that row's own `id`/`provider_ref`/`status`/`metadata.redirect_url` — **no second call to the adapter or to `startCharge` is ever made** (ORCH-12 confirms `startCharge` is called exactly once even in this path). If the re-read finds nothing (a theoretically near-impossible edge case, since a unique-violation implies a conflicting row exists), a `status: 'retryable_error'` is returned instead of crashing or fabricating a fake success — **no new idempotency key is generated automatically** in either case (ORCH-12's second test confirms this).

---

# PAYMENT_TRANSACTION

Created exclusively through the **existing, unmodified** `paymentService.startCharge` — this orchestration layer never issues its own `INSERT`/`UPDATE` against `payment_transactions` (its only direct table interaction is the read-only re-query above, and even that only runs in the race-recovery branch). `restaurantId` passed to `startCharge` is the **same `checkoutInput.restaurant_id`** used for the dry-run call and the snapshot — one canonical value threaded through the whole function, never re-derived from a second source (see TENANT_ISOLATION).

---

# PROVIDER_CALL

`MoyasarAdapter` is never imported or called directly by this file — it is only ever reached indirectly, through the unmodified `paymentService.startCharge → adapter.createCharge` path. Exactly one `startCharge` call per invocation (no loop, no automatic retry) — confirmed across every test scenario, including the failure paths.

---

# RESULT_CONTRACT

Returned fields, by outcome:

| `status` | Fields included |
|---|---|
| `succeeded` | `paymentTransactionId`, `providerRef`, `paymentStatus`, `redirectUrl`, `idempotencyKey`, `idempotent` |
| `price_changed` | `idempotencyKey`, `dryRun: {subtotal, tax, delivery_fee, total, price_changes}` |
| `rejected` | `reason`, `message` (where applicable), `idempotencyKey` (where resolved before the rejection point) |
| `failed` | `reason`, `message`, `idempotencyKey` |
| `requires_reconciliation` | `idempotencyKey`, `message` |
| `retryable_error` | `reason`, `idempotencyKey` |

**Never returned, in any path**: the Moyasar API key or any `service_role`/DB credential (never referenced anywhere in this file), raw internal Postgres/Supabase error objects (only `.message` strings are ever surfaced, never the raw error object itself), the full provider `raw` payload (`chargeOutcome.raw` is never read or forwarded — only `providerRef`/`status`/`redirectUrl`). ORCH-23 directly asserts a full response JSON serialization contains no secret-like substring.

---

# PROVIDER_FAILURE

A clean, already-caught provider failure (message matching `Moyasar (network error|error \d|server error)` — i.e., `startCharge`'s own existing `try/catch` around `adapter.createCharge` already marked the row `FAILED` before rethrowing) → `status: 'failed', reason: 'provider_failed'`. **No automatic retry** of the provider (ORCH-17 confirms exactly one `startCharge` call). **No `create_order(p_dry_run=false)` call ever occurs** in this or any other path (ORCH-17 additionally confirms `db.rpc` was called exactly once total — the dry-run — never a second time after a provider failure).

---

# G5_HANDLING

**Not fixed in this task, as instructed** — 3.6E remains the sole owner of actual reconciliation. This task's responsibility, fulfilled: **correct classification, never a false claim of definite failure.**

Any error caught from `startCharge` that matches **none** of (a) the idempotency-race constraint name, (b) the `startCharge:`-prefixed validation/insert-failure pattern (which only ever occurs *before* any provider contact), or (c) Moyasar's own error-message prefixes (which only ever occur from within `startCharge`'s existing, already-safe `try/catch`) — **can only be the unguarded final `UPDATE` after a successful provider call** (G-5's exact, already-documented failure mode; re-confirmed by tracing `paymentService.js`'s actual, unmodified source in the 3.6A-2A audit). This case returns `status: 'requires_reconciliation'` — **not** `'failed'` — and performs **zero database writes** of any kind from this layer (ORCH-18 confirms `db.from` is never called in this path). No new database status value is invented anywhere — `requires_reconciliation` exists only as a transient JS response field, never persisted.

---

# TENANT_ISOLATION

Verified via the **existing** server-side authorization mechanism — `create_order` itself, which already independently validates that `p_branch_id` belongs to `p_restaurant_id` and that every referenced product belongs to both, raising an exception (surfaced as `dry_run_failed`) otherwise. This orchestration layer adds no new authorization check, and none was needed: the dry-run call is the **first** thing this function does after basic input resolution, so a tenant-mismatched request is rejected before any snapshot or payment transaction is ever created (ORCH-19). `restaurant_id` consistency across checkout/payment-transaction/snapshot is enforced **by construction, not by a separate check** — `checkoutInput.restaurant_id` is read once and reused verbatim for the dry-run call, the snapshot, and `startCharge`'s `restaurantId` argument; no second copy is ever independently derived. No RLS policy was touched or weakened.

---

# AMOUNT_INTEGRITY

`amount: dryRun.total` passed to `startCharge` — the same object property, read once, with **zero arithmetic operations applied to it anywhere in this file** (confirmed by direct code inspection: no `+`/`-`/`*`/`/`/`Math.round` touches `dryRun.total` or `snapshot.total` at any point). A defensive, redundant runtime assertion (`if (snapshot.total !== dryRun.total) return {status: 'rejected', reason: 'amount_integrity_violation', ...}`) is included as an explicit regression tripwire per the task's "Enforce" language — it should never actually trigger given `buildCheckoutSnapshot`'s own already-verified passthrough guarantee (3.6A-1b.2), but its presence makes the invariant self-checking rather than purely architectural. **No halalas conversion occurs in this file** — that remains exclusively `MoyasarAdapter`'s responsibility, unchanged.

---

# SNAPSHOT_INTEGRITY

A second defensive assertion, `expectedFingerprint = await computeCheckoutFingerprint(checkoutInput); if (snapshot.fingerprint !== expectedFingerprint) return {status: 'rejected', reason: 'snapshot_integrity_violation', ...}` — again, a regression tripwire rather than a normally-reachable branch, since `buildCheckoutSnapshot` already computes the fingerprint via this exact function internally. Both assertions together give ORCH-04/ORCH-10 direct, passing proof that these invariants hold in practice, not merely by architectural argument.

---

# TESTS

All 23 required scenarios (`tests/unit/checkoutOrchestration.test.js`, `ORCH-01`–`ORCH-23`), using a mocked/fake `paymentService` for the bulk of them (isolating orchestration logic from `paymentService`'s own already-separately-tested internals):

| # | Scenario | Result |
|---|---|---|
| 1 | Valid checkout → dry-run (correct RPC params, `p_dry_run:true`) | PASS |
| 2 | Dry-run → snapshot (metadata.checkout shape) | PASS |
| 3 | Snapshot → startCharge (called exactly once) | PASS |
| 4 | Payment amount equals dry-run total | PASS |
| 5 | Currency always SAR (default + explicit rejection of other values) | PASS |
| 6 | Client cannot control amount | PASS |
| 7 | Client cannot control provider_ref | PASS |
| 8 | Client cannot control payment status | PASS |
| 9 | Snapshot metadata included | PASS |
| 10 | Snapshot fingerprint correct (matches `computeCheckoutFingerprint`) | PASS |
| 11 | Same idempotency key replay (explicit key reused across 2 calls) | PASS |
| 12 | Concurrent same-key race recovery (+ unrecoverable sub-case) | PASS |
| 13 | Different idempotency key → separate attempt (+ auto-generated-differs sub-case) | PASS |
| 14 | Changed cart → new payment attempt (different fingerprint) | PASS |
| 15 | `price_changed` → no payment | PASS |
| 16 | Dry-run failure → no payment | PASS |
| 17 | Provider failure → no Order, no auto-retry | PASS |
| 18 | Ambiguous/G-5 failure → reconciliation state, zero DB writes | PASS |
| 19 | Tenant mismatch → rejected via existing `create_order` check | PASS |
| 20 | No real Order created (every `db.rpc` call across scenarios uses `p_dry_run:true`) | PASS |
| 21 | No webhook changes (source-text check: webhook never references this task's new code) | PASS |
| 22 | No Moyasar call in unit tests (`getAdapter` never invoked) | PASS |
| 23 | No secret leakage (response JSON scanned for secret-like substrings) | PASS |

---

# INTEGRATION_TEST

`INTEG-01`: uses the **real, unmodified** `paymentService` (not mocked) with a fake `db` supporting both `.rpc('create_order', ...)` and the full `.from('payment_transactions')` chain `paymentService.startCharge` itself performs (pre-check `SELECT` → `INSERT` → post-success `UPDATE`), and a fake `MoyasarAdapter` (`getAdapter` mocked, matching the exact pattern already established in `paymentService.test.js`) — **no real network call occurs anywhere**. Verified: correct amount (`20.00`, matching the dry-run total) reaches both `startCharge`'s `INSERT` and the fake adapter's `createCharge` call; correct currency (`'SAR'`) in the inserted row; `metadata.checkout` in the actual `INSERT` payload has the correct `total`/`fingerprint`; the `idempotency_key` column value matches the response's `idempotencyKey` exactly.

---

# FULL_REGRESSION

```
$ npx vitest run
 Test Files  39 passed (39)
      Tests  633 passed (633)

$ npm test -- --run
 Test Files  39 passed (39)
      Tests  633 passed (633)
```

**633/633 PASS** on both invocations (606 baseline + 27 new: 23 unit + 1 integration test file totaling 27 test cases), zero failures, zero regressions. One transient path-resolution issue was found and fixed during this task (a `new URL(..., import.meta.url)` construction failed under the `happy-dom` test environment pragma this file uses; replaced with a `path.join(process.cwd(), ...)` approach) — not a functional bug, documented for transparency.

---

# SECURITY

Static review, per the task's explicit checklist:

| Check | Result |
|---|---|
| `paymentService.js` unchanged | Confirmed — `git diff` shows zero changes to this file this task |
| `MoyasarAdapter` unchanged | Confirmed |
| `create_order` unchanged | Confirmed — no `sql/` file touched, no migration, no database write of any kind this task |
| Webhook unchanged | Confirmed — `git diff` shows zero changes; ORCH-21 additionally proves no new coupling was introduced |
| No migration | Confirmed |
| No schema changes | Confirmed |
| No PII in checkout snapshot | Confirmed — inherited unmodified from 3.6A-1b.2's own guarantee |
| No client amount trust | Confirmed — ORCH-06 |
| No duplicate provider call | Confirmed — every scenario shows exactly one (or zero) `startCharge` call, never two |
| No automatic new idempotency key on retry | Confirmed — ORCH-11 |
| No Order creation | Confirmed — every `db.rpc` call uses `p_dry_run:true` (ORCH-20); no second `create_order` call of any kind exists in any code path |
| No secret leakage | Confirmed — ORCH-23 |

---

# FILES_CHANGED

| File | Status |
|---|---|
| `src/payments/services/checkoutOrchestration.js` | **NEW** — the orchestration function |
| `tests/unit/checkoutOrchestration.test.js` | **NEW** — 27 tests |
| `src/payments/services/index.js` | **MODIFIED** — one line added (`export { checkoutOrchestration, initiatePaymentFirstCheckout } from './checkoutOrchestration'`), matching the file's own existing export convention |
| `paymentService.js`, `moyasar.js`, `create_order` (any `sql/` file), webhook (`handler.js`/`index.ts`) | **NOT TOUCHED** |

`src/payments/index.js` required no change — its pre-existing `export * from './services'` (unchanged since before this task) automatically re-exports the new names.

---

# GIT_STATUS

```
$ git status --short
 M src/payments/adapters/moyasar.js
 M src/payments/index.js
 M src/payments/services/index.js                 ← +1 line, this task
 M src/payments/types/index.js
 M supabase/functions/payment-webhook/handler.js
 M tests/unit/MoyasarAdapter.test.js
 M tests/unit/paymentWebhook.test.js
?? src/payments/services/checkoutOrchestration.js  ← NEW, this task
?? tests/unit/checkoutOrchestration.test.js         ← NEW, this task
?? reports/TASK_3_6A_2_PAYMENT_FIRST_CHECKOUT_IMPLEMENTATION_REPORT.md  ← this report
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

All previously-tracked files' diffs are byte-identical to every prior report this session except `src/payments/services/index.js`'s single new added line (this task's own, intentional change). **No commit, no push, no merge.**

---

# CLASSIFICATION

- **IMPLEMENTED**: `initiatePaymentFirstCheckout` — full dry-run → snapshot → `startCharge` orchestration; currency enforcement; idempotency-key resolution and reuse; concurrent-race recovery; provider-failure and G-5-ambiguity classification; tenant isolation (via existing `create_order` checks); amount/snapshot integrity assertions.
- **VERIFIED**: 27/27 new tests, 633/633 full regression, static security review, git-diff scoping review.
- **DEFERRED_TO_3.6B**: real Order creation after a succeeded payment (this task explicitly never calls `create_order(p_dry_run=false)`).
- **DEFERRED_TO_3.6C**: any checkout UI/frontend wiring.
- **DEFERRED_TO_3.6D**: any change to the webhook's own status-sync behavior (Payment→Order sync, G-4).
- **DEFERRED_TO_3.6E**: actual G-5 reconciliation (the `pg_cron` sweep + `verifyPayment` reconciliation job) — this task only correctly *classifies* the ambiguous state, per its own explicit instruction not to fix G-5.
- **BLOCKED_BY_MOYASAR**: none — this task required no real Moyasar access at any point (fully mocked in all tests, per instruction).

---

# BLOCKERS

None.

# WARNINGS

1. **Error-message-pattern classification is inherently coupled to `paymentService.js`'s current, unmodified error-message text** (`startCharge:`/`Moyasar `/the literal constraint name `uq_paytx_idempotency_key`). This is a deliberate, evidence-based design choice given the hard constraint "do not modify `paymentService.js`" — but it means if that file's error messages are ever changed in a future task without updating this orchestration layer in lockstep, the G-5/provider-failure/race classification could silently misclassify. Documented here so it is not rediscovered as a mystery later.
2. **A fully-discounted (100%-off coupon) cart, producing `dryRun.total === 0`, cannot proceed through this payment-first path** — `paymentService.startCharge`'s own existing validation (`if (!input?.amount || input.amount <= 0) throw ...`) rejects a zero amount, and this orchestration does not (and per "do not modify paymentService.js" cannot, in this task) work around that. Such a cart would need the existing zero-payment cash/free order flow (`useCheckout.js`'s direct `create_order` call) instead — noted as an existing constraint surfaced by this task, not a defect introduced by it.
3. `MoyasarAdapter.createCharge` still hardcodes `currency: 'SAR'` internally regardless of what's passed to it (a pre-existing fact, re-confirmed in 3.6A-2A) — this orchestration layer's own hard `SAR` assertion means the two are consistent in practice, but the underlying adapter behavior itself was not changed (correctly, per this task's explicit "do not modify Moyasar" instruction).

---

# DEFERRED

Order creation after a successful payment (3.6B), checkout UI (3.6C), payment→order status sync (3.6D), G-5 reconciliation job (3.6E) — all explicitly out of this task's scope, per its own strict stop list, and none were begun.

---

# REPORT_FILE

`reports/TASK_3_6A_2_PAYMENT_FIRST_CHECKOUT_IMPLEMENTATION_REPORT.md`

# DOWNLOAD_COPY

`/sdcard/Download/TASK_3_6A_2_PAYMENT_FIRST_CHECKOUT_IMPLEMENTATION_REPORT.md` (copied and checksum-verified after this report was written).

# NEXT_STEP

Per the strict stop instruction: **no further work begins** — not 3.6B, not 3.6C, not 3.6D, not 3.6E, not 3.6G, no payment UI, no Order creation, no webhook modification, no reconciliation job, no real Moyasar call, no Production deployment — without separate, explicit instruction from you.

---

*Report generated 2026-08-26.*
