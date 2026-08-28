# Task 3.6C.1 + 3.6C.2 — Payment → Order Sync Core

**IMPLEMENTED (3.6C.1, 3.6C.2). 3.6C.3 explicitly deferred. No webhook change. No refund wiring. No Order creation. No schema change.**

---

# EXECUTIVE SUMMARY

Implemented `decideOrderSyncAction` (a pure, three-way decision function) and `syncOrderStatusFromPayment` (the service function applying it), both appended to `src/payments/services/checkoutOrchestration.js` — extending the same module 3.6A-2/3.6B already own, no competing service layer created. Both use exclusively the five real order statuses (`pending/preparing/ready/completed/cancelled`) re-confirmed in the 3.6C-A audit — no `confirmed`/`out_for_delivery`/`delivered` invented anywhere. The service loads the payment transaction and its linked order strictly from their own database columns (never a client-supplied `restaurant_id`/`order_id`/`provider_ref`), enforces tenant isolation via an explicit `restaurant_id` equality check (RLS provides no protection under `service_role`), and — when a cancellation is warranted — issues a plain `UPDATE` that remains fully governed by the existing, unmodified `enforce_order_transition` trigger, gracefully classifying any `invalid_order_transition` rejection rather than treating it as an application failure. **`create_order` is never called anywhere in this task — neither dry-run nor real.** The webhook, `paymentService.refund`, `MoyasarAdapter`, and `create_order` are all confirmed unmodified. 51 new tests (the full required matrix + all 18 required 3.6C.2 scenarios) pass. Full regression: **703/703 PASS** (652 baseline + 51 new).

**Verdict: `TASK_3_6C_1_2_COMPLETE`**

---

# DECISION_FUNCTION

`decideOrderSyncAction(paymentStatus, orderStatus)` — pure, synchronous, no I/O, no state:

| Payment status | Order status | Result |
|---|---|---|
| `refunded` | `pending` / `preparing` / `ready` | `{action:'cancel'}` |
| `refunded` | `completed` | `{action:'unsupported', reason:'completed_order_no_valid_transition'}` |
| `refunded` | `cancelled` | `{action:'none'}` (already matches — idempotent) |
| `succeeded` / `pending` / `failed` / `cancelled` / `initiated` | any of the 5 | `{action:'none'}` — matches the 3.6C-A finding that order **creation itself** (3.6B) is the only sync a successful payment ever needs |
| Unknown payment status | any | `{action:'unsupported', reason:'unknown_payment_status'}` |
| Any (known) payment status | Unknown order status | `{action:'unsupported', reason:'unknown_order_status'}` |

**No new order status was added anywhere** — `'cancel'` is the only action that ever produces a database write, and it only ever targets the existing `'cancelled'` value.

---

# SYNC_SERVICE

`syncOrderStatusFromPayment({paymentTransactionId}, {db})` — the function's **only** input parameter is `paymentTransactionId`; there is no `restaurant_id`, `order_id`, `provider_ref`, or `paymentStatus` parameter anywhere in its signature, so none of those can be client-controlled even in principle (SYNC-17/18 additionally prove that injecting extra fields into `input` has zero effect — they are simply never read).

Sequence:
1. Load `payment_transactions` by `id` — `status`/`restaurant_id` read from the row itself. Not found → `{action:'none', reason:'payment_transaction_not_found'}` (SYNC-01).
2. Load the linked `orders` row via `payment_transaction_id = paymentTx.id` (the existing `orders_payment_transaction_id_uidx`, no new index). Not found → `{action:'none', reason:'order_not_found'}` — **no order is ever created here** (SYNC-02, SYNC-14).
3. Tenant check: `order.restaurant_id !== paymentTx.restaurant_id` → `{action:'none', reason:'tenant_mismatch'}`, no update attempted (SYNC-03).
4. `decideOrderSyncAction(paymentTx.status, order.status)` — the **single** decision source; not reimplemented inline.
5. Only if `action === 'cancel'`: `UPDATE orders SET status='cancelled' WHERE id=order.id AND restaurant_id=paymentTx.restaurant_id`.

---

# TENANT_ISOLATION

Confirmed, per the 3.6C-A audit's own finding, that RLS (`orders_access`) provides **no** protection for a `service_role`-driven caller. Enforcement here is **explicit and doubled**: (1) an application-level equality check (`order.restaurant_id !== paymentTx.restaurant_id`) before any decision is even made, and (2) the `UPDATE` itself is additionally scoped with `.eq('restaurant_id', paymentTx.restaurant_id)` — belt-and-suspenders, not a substitute for the trigger. Both restaurant identities used are read **exclusively from their own database columns** — never from a second, caller-suppliable value (SYNC-17/18).

---

# ORDER_LOOKUP

`orders.payment_transaction_id = paymentTransactionId`, using the **already-existing** `orders_payment_transaction_id_uidx` unique partial index (re-confirmed live in 3.6A-2A/3.6C-A, not re-verified again in this read-only-adjacent implementation task since no schema could have changed between then and now without a migration this task didn't run). **No new index was created.** If no order exists, the function returns cleanly (`order_not_found`) — it **never** calls `create_order`, confirmed both by direct test assertion (SYNC-14, checking the fake `db` object literally has no `.rpc` method available to call) and by a source-text scan of the function body for the literal string `create_order` (also SYNC-14).

---

# REFUND_MATRIX

Exhaustively tested, matching the 3.6C-A audit's `SYNC_TRIGGER_MATRIX` exactly:

| Payment | Order | Action |
|---|---|---|
| refunded | pending | cancel |
| refunded | preparing | cancel |
| refunded | ready | cancel |
| refunded | completed | unsupported |
| refunded | cancelled | none |
| succeeded / pending / failed / cancelled / initiated | any of the 5 | none (25 combinations, all tested) |

---

# COMPLETED_ORDER

**Exactly as specified — no status change, no invented status, no forced cancellation, no trigger modification.** `refunded + completed` → `{action:'unsupported', reason:'completed_order_no_valid_transition'}`, and the service function **never issues an `UPDATE`** for this case (SYNC-07 confirms zero additional `db.from` calls beyond the two reads). This remains, exactly as the audit concluded, a financial/business-visibility concern for later work, not an order-state-machine transition — nothing in this implementation attempts to solve it further.

---

# IDEMPOTENCY

A second call for an order already `cancelled` (whether because a prior sync call already ran, or for any other reason) → `decideOrderSyncAction` returns `{action:'none'}` before any `UPDATE` is attempted (SYNC-08, and SYNC-12's explicit two-call sequence: first call cancels, second call — reading the now-`cancelled` order — performs zero additional writes). No new idempotency mechanism was created; this falls directly out of reading the order's *current* status before deciding, which was already required for the decision itself.

---

# RACE_HANDLING

**No locking introduced, exactly as instructed** — `enforce_order_transition` remains the sole, final authority. If a concurrent staff action moves the order into a state incompatible with cancellation between this function's `SELECT` and its `UPDATE`, the trigger rejects the `UPDATE` with `invalid_order_transition`, which is caught and returned as `{action:'unsupported', reason:'invalid_order_transition', message}` — **not** an unhandled exception, **not** a generic `500`-style failure (SYNC-13). The trigger itself is never bypassed, never modified, and `service_role` privileges are used only to *read and write the row*, never to circumvent the transition rule the trigger enforces.

---

# TESTS

**3.6C.1** (`tests/unit/orderPaymentSync.test.js`, `describe('SYNC-DECIDE: ...')`): all 5 `refunded`+order-status combinations, all 25 non-refund-payment-status × order-status combinations (`it.each`), 2 unknown-input cases, and a purity check (20 repeated identical calls, byte-identical results, no side effects) — **32 test cases**, all passing.

**3.6C.2**, all 18 required scenarios (`SYNC-01`–`SYNC-18`, with SYNC-04/05/06 and SYNC-09/10/11 each covering 3 sub-cases via `it.each`):

| # | Scenario | Result |
|---|---|---|
| 1 | Payment transaction not found | PASS |
| 2 | Order not found | PASS |
| 3 | Tenant mismatch | PASS |
| 4–6 | `refunded` + pending/preparing/ready → cancelled | PASS |
| 7 | `refunded` + completed → no update | PASS |
| 8 | `refunded` + cancelled → no-op | PASS |
| 9–11 | succeeded/pending/failed → no-op | PASS |
| 12 | Duplicate call → safe (second call is a true no-op) | PASS |
| 13 | `invalid_order_transition` → safely classified | PASS |
| 14 | No `create_order` call | PASS |
| 15 | No webhook call/coupling | PASS |
| 16 | No `paymentService.refund` call | PASS |
| 17 | No client-controlled tenant identity | PASS |
| 18 | Payment transaction is the sole source of tenant identity | PASS |

---

# FULL_REGRESSION

```
$ npx vitest run
 Test Files  41 passed (41)
      Tests  703 passed (703)

$ npm test -- --run
 Test Files  41 passed (41)
      Tests  703 passed (703)
```

**703/703 PASS** on both invocations (652 baseline + 51 new: 32 decision-function tests + 19 service tests, matching the 18 required scenarios with SYNC-04–06 and SYNC-09–11 each split into `it.each` sub-cases), zero failures, zero regressions.

---

# FILES_CHANGED

| File | Status |
|---|---|
| `src/payments/services/checkoutOrchestration.js` | **EXTENDED** — `decideOrderSyncAction` + `syncOrderStatusFromPayment` added; `initiatePaymentFirstCheckout` (3.6A-2) and `createOrderFromSuccessfulPayment` (3.6B) untouched |
| `tests/unit/orderPaymentSync.test.js` | **NEW** — 51 tests |
| `src/payments/services/index.js` | **MODIFIED** — export list extended to include the two new names |
| `create_order`, `paymentService.js`, `moyasar.js`, webhook (`handler.js`/`index.ts`), `enforce_order_transition` trigger | **NOT TOUCHED** |

---

# GIT_STATUS

```
$ git status --short
 M src/payments/adapters/moyasar.js
 M src/payments/index.js
 M src/payments/services/index.js                 ← export list extended, this task
 M src/payments/types/index.js
 M supabase/functions/payment-webhook/handler.js
 M tests/unit/MoyasarAdapter.test.js
 M tests/unit/paymentWebhook.test.js
?? src/payments/services/checkoutOrchestration.js  ← extended this task (decideOrderSyncAction + syncOrderStatusFromPayment added)
?? tests/unit/orderPaymentSync.test.js              ← NEW, this task
?? reports/TASK_3_6C_1_2_PAYMENT_ORDER_SYNC_CORE_IMPLEMENTATION_REPORT.md  ← this report
(plus the same set of pre-existing untracked report/sql/module files from prior tasks — unchanged)

$ git diff --stat
 src/payments/adapters/moyasar.js              | 20 +++++-
 src/payments/index.js                         |  1 +
 src/payments/services/index.js                |  7 ++
 src/payments/types/index.js                   |  3 +
 supabase/functions/payment-webhook/handler.js | 19 ++++++
 tests/unit/MoyasarAdapter.test.js             | 57 ++++++++++++++--
 tests/unit/paymentWebhook.test.js             | 95 +++++++++++++++++++++++++++
 7 files changed, 195 insertions(+), 7 deletions(-)
```

`services/index.js`'s diff grew from `+1` to `+7` this task (the export list was reformatted to a multi-line block to add the two new names) — its own, intentional change; every other tracked file's diff is byte-identical to every prior report this session. **No commit, no push, no merge.**

---

# DEFERRED_3_6C_3

**Explicitly not implemented, as instructed.** Refund-triggered wiring — i.e., anything that would cause `syncOrderStatusFromPayment` to actually be *called* when a real refund happens — remains fully out of scope: the webhook was not touched (its terminal-status guard, which currently prevents `payment_transactions.status` from ever reaching `'refunded'` via the webhook path, is unchanged), and `paymentService.refund()` was not touched or given any new caller. `syncOrderStatusFromPayment` exists today as correct, fully-tested, **but uncalled** service code — exactly the same "built, verified, not yet wired to a live entrypoint" status every other piece of this payment-first arc (3.6A-2, 3.6B) currently has.

---

# BLOCKERS

None for this task's own scope. The 3.6C-A audit's own surfaced prerequisite (an owner decision on how refund status updates should actually reach `payment_transactions` — webhook terminal-guard carve-out vs. hooking into `paymentService.refund()`) remains open and still gates 3.6C.3 specifically, unaffected by this task.

# WARNINGS

None new. The same class of note already documented for 3.6A-2/3.6B applies here too: the `invalid_order_transition` classification depends on the trigger's current, unmodified exception message text (`'invalid_order_transition: ...'`) — a deliberate, evidence-based coupling given the "don't modify the trigger" constraint, not a defect.

---

# REPORT_FILE

`reports/TASK_3_6C_1_2_PAYMENT_ORDER_SYNC_CORE_IMPLEMENTATION_REPORT.md`

# DOWNLOAD_COPY

`/sdcard/Download/TASK_3_6C_1_2_PAYMENT_ORDER_SYNC_CORE_IMPLEMENTATION_REPORT.md` (copied and checksum-verified after this report was written).

# NEXT_STEP

Per the strict stop instruction: **no further work begins** — not 3.6C.3, not 3.6D, not 3.6E, not 3.6G, no webhook modification, no refund wiring, no checkout UI, no reconciliation, no deploy — without separate, explicit instruction from you.

---

*Report generated 2026-08-26.*
