# Task 3.6C.3.1 — Refund → Order Status Sync

**IMPLEMENTED. Wiring only — no webhook change, no UI, no reconciliation, no schema change.**

---

# EXECUTIVE SUMMARY

Wired the already-implemented, unmodified `syncOrderStatusFromPayment` (3.6C.2) into the already-hardened, now-further-extended `paymentService.refund()` (3.6C.3.0) — with exactly one new call, placed immediately after the existing final `UPDATE` that commits `status='refunded'` locally, never before it. The call is wrapped so its failure can never make a genuinely successful refund look unsuccessful: no re-thrown exception, no payment-status reversion, no second provider call, no false "failed" marking — a caught sync error is classified into the response's own `orderSync` field using `syncOrderStatusFromPayment`'s own existing `{action:'unsupported', reason:...}` convention, not a new error system. `decideOrderSyncAction` and `syncOrderStatusFromPayment` themselves were not modified in any way — confirmed by an unchanged file checksum, byte-identical to before this task and before 3.6C.3.0. This introduces a genuine, deliberate circular import between `paymentService.js` and `checkoutOrchestration.js` — evaluated as safe (both modules reference each other only inside function bodies, never at module top-level) and **empirically confirmed safe** by running the full test suite, including tests that exercise the real, unmocked module graph on both sides of the cycle. 19 new tests (covering all 21 required scenarios, several combined) pass. Full regression: **736/736 PASS** (717 baseline + 19 new).

**Verdict: `TASK_3_6C_3_1_COMPLETE`**

---

# REFUND_FLOW

Exactly the required sequence, confirmed by direct code reading and by `PS-026`'s explicit call-order assertion:

```
refund()
  → tenant validation (unchanged, 3.6C.3.0)
  → amount validation (unchanged, 3.6C.3.0)
  → atomic claim (unchanged, 3.6C.3.0)
  → adapter.refundPayment (Moyasar)
  → local UPDATE: status = 'refunded'   ← commits here
  → [NEW] syncOrderStatusFromPayment({paymentTransactionId: tx.id}, {db})
  → return { ...refund result, orderSync }
```

None of 3.6C.3.0's protections were touched, weakened, or reordered — the new call is purely additive, placed after everything that already existed.

---

# SYNC_INTEGRATION

**Import**: `import { syncOrderStatusFromPayment } from './checkoutOrchestration'` — the real, existing, unmodified 3.6C.2 function, not duplicated or re-implemented. **Call site**: immediately after the existing `await db.from('payment_transactions').update({status: REFUNDED, ...}).eq('id', tx.id)` statement — no earlier, confirmed by `PS-026` tracking actual call order via mock implementations (`['final_update', 'sync']`, never the reverse). **Signature used**: exactly `syncOrderStatusFromPayment({paymentTransactionId: tx.id}, {db})` — the function's real, existing contract, not a new or altered one (`PS-025` confirms the exact arguments).

**Circular import, addressed explicitly**: `checkoutOrchestration.js` already imports `paymentService` from `./paymentService` (since 3.6A-2); this task's new import creates the reverse edge, a genuine module cycle. This is safe under standard ES module semantics because **neither file ever reads the other's export at its own top level** — `checkoutOrchestration.js` only references `defaultPaymentService` inside function *default parameters* (evaluated at call time, not module-load time), and `paymentService.js` only calls `syncOrderStatusFromPayment` inside `refund()`'s own body (also call-time, long after both modules have finished loading). This is not merely asserted — **it is empirically verified**: the full regression suite includes tests that import the real (unmocked) versions of both files on both sides of the cycle (`checkoutOrchestration.test.js`'s `INTEG-01`, which imports the real `paymentService`; `orderFromPayment.test.js`/`orderPaymentSync.test.js`, which import the real `checkoutOrchestration.js`, itself now transitively loading the real `paymentService.js`) — all 736 tests pass, with no module-initialization error of any kind.

---

# ORDER_STATE_EFFECT

**`decideOrderSyncAction` and `syncOrderStatusFromPayment` were not modified** — confirmed by an MD5 checksum of `checkoutOrchestration.js` (`d9985af2966c02b1273c8bc1105da077`) identical to its state both before this task and before 3.6C.3.0. All of 3.6C.1/3.6C.2's existing behavior is preserved and simply *reached* for the first time by a real call site:

| Scenario | Result, passed through unmodified |
|---|---|
| `refunded` + `pending`/`preparing`/`ready` | `action:'cancel'` (`PS-029`–`031`) |
| `refunded` + `cancelled` | `action:'none'` (`PS-032`) |
| `refunded` + `completed` | `action:'unsupported'` — **no status change, no invented status** (`PS-033`, asserts the full, unaltered result object) |
| No linked order | `action:'none', reason:'order_not_found'` — refund itself remains successful (`PS-028`) |

`refund()` itself performs **zero** interpretation of these results beyond attaching them verbatim to `orderSync` — it never inspects `action` to decide anything about the refund's own success/failure, exactly as required.

---

# FAILURE_ISOLATION

**A caught `syncOrderStatusFromPayment` exception never propagates past the point the refund has already, genuinely succeeded**: `PS-027` proves that a thrown sync error still yields `refund()`'s normal successful return shape (`refundRef`, `status: REFUNDED`), with the failure surfaced only as `orderSync: {action:'unsupported', reason:'sync_failed', message}`. **No reversion of `payment_transactions.status`, no second call to Moyasar, no re-marking as failed** — none of these occur anywhere in the new code, confirmed by direct reading (the `catch` block only assigns `orderSync`, nothing else) and by the test asserting the refund's own fields remain fully populated and correct even when the sync throws.

**The pre-existing, separate, unguarded-final-update G-5-equivalent gap (documented in 3.6C.3.0, not solved there) remains correctly out of `syncOrderStatusFromPayment`'s reach**: `PS-041` confirms that if the *local status commit itself* fails (a promise rejection from the final `UPDATE`, simulating the already-documented gap), the exception propagates as before — and, critically, `syncOrderStatusFromPayment` is **never called** in that case, because the strict rule ("sync must not run before `status='refunded'` has successfully committed") is naturally satisfied by the sync call's position in the code, *after* that `await`, which never completes if the `UPDATE` itself throws.

---

# IDEMPOTENCY

**Duplicate refund (in-flight, same idempotency key) → no sync call at all**, confirmed by `PS-034/035`: while `existingClaim.idempotency_key === input.idempotencyKey` (the original attempt hasn't committed `status='refunded'` yet), the early-return path now explicitly returns `orderSync: {action:'none', reason:'refund_already_in_progress'}` **without calling `syncOrderStatusFromPayment`** — correctly respecting the strict rule, since the local status hasn't committed at that point. This is the only code path where a "repeated call" is reachable *before* full completion (3.6C.3.0's own guard means any call *after* a refund has fully completed instead throws outright, unchanged, out of this task's scope to alter).

**All of 3.6C.3.0's pre-existing protections remain fully intact and are re-verified after the wiring, not merely assumed**: tenant isolation (`PS-036`), amount validation (`PS-037`), the atomic concurrency claim (`PS-038`), and idempotency-key mismatch rejection (`PS-039`) are each re-tested to confirm they still reject **before** `syncOrderStatusFromPayment` is ever called — none of these paths call it.

---

# TENANT_ISOLATION

**No new tenant source was introduced.** `syncOrderStatusFromPayment` continues to derive tenant identity exclusively from `payment_transactions.restaurant_id`, exactly as it already did (3.6C.2, unmodified) — the call site in `refund()` passes only `{paymentTransactionId: tx.id}`, never a `restaurantId` or any other tenant-adjacent value, so `syncOrderStatusFromPayment` has no way to receive one even if it wanted to. `refund()`'s own, now-hardened `restaurantId` validation (3.6C.3.0) remains fully in place and unchanged — re-confirmed by `PS-036` to still correctly reject a mismatched tenant *before* reaching any sync logic.

---

# TEST_MATRIX

All 21 required scenarios (several combined into single tests where they share one code path), `tests/unit/paymentService.test.js`, `PS-024`–`PS-043`:

| # | Scenario | Result |
|---|---|---|
| 1 | Successful refund → sync called | PASS (`PS-024`) |
| 2 | Sync receives correct `paymentTransactionId` | PASS (`PS-025`) |
| 3 | Sync runs only after local status commits (`refunded`) | PASS (`PS-026`, explicit call-order assertion) |
| 4 | Sync failure does not invalidate successful refund | PASS (`PS-027`) |
| 5 | `order_not_found` does not invalidate refund | PASS (`PS-028`) |
| 6–8 | pending/preparing/ready → cancelled | PASS (`PS-029`–`031`) |
| 9 | cancelled → no-op | PASS (`PS-032`) |
| 10 | completed → unsupported/no status change | PASS (`PS-033`) |
| 11–12 | Duplicate refund → no second provider call, no duplicate sync | PASS (`PS-034/035`, combined — same code path) |
| 13 | Tenant isolation preserved | PASS (`PS-036`) |
| 14 | Amount validation preserved | PASS (`PS-037`) |
| 15 | Atomic claim preserved | PASS (`PS-038`) |
| 16 | Idempotency key preserved | PASS (`PS-039`) |
| 17 | Failed provider → sync NOT called | PASS (`PS-040`) |
| 18 | Provider success + local status update failure → sync NOT called | PASS (`PS-041`) |
| 19 | No webhook modification | PASS (`PS-042`) |
| 20 | No `create_order` call | PASS (`PS-042`, same test, source-scoped to `refund()`'s own body) |
| 21 | No real Moyasar calls | PASS (`PS-043`, and implicitly by every other test's use of the mocked adapter) |

`syncOrderStatusFromPayment` is mocked via `vi.mock('../../src/payments/services/checkoutOrchestration.js', () => ({syncOrderStatusFromPayment: vi.fn()}))`, matching the exact existing convention already used for `getAdapter` in the same file — no new mocking pattern was invented.

---

# FULL_REGRESSION

```
$ npx vitest run
 Test Files  41 passed (41)
      Tests  736 passed (736)

$ npm test -- --run
 Test Files  41 passed (41)
      Tests  736 passed (736)
```

**736/736 PASS** on both invocations (717 baseline + 19 new), zero failures, zero regressions — including, critically, every test that exercises the real (unmocked) `paymentService.js` ↔ `checkoutOrchestration.js` module cycle.

---

# STATIC_REVIEW

| Check | Result |
|---|---|
| `paymentService` refund hardening (3.6C.3.0) preserved | Confirmed — every protection re-tested and still passing (`PS-036`–`039`) |
| Sync service (`syncOrderStatusFromPayment`) unchanged | Confirmed — checksum-identical file |
| Decision function (`decideOrderSyncAction`) unchanged | Confirmed — same file, same checksum |
| Webhook unchanged | Confirmed — `git diff` on `handler.js`/`index.ts` identical to every prior report this session |
| Moyasar adapter unchanged | Confirmed — not touched |
| `create_order` unchanged | Confirmed — no `sql/` file touched, no database call made this task |
| No schema changes | Confirmed |
| No new payment status | Confirmed — `TransactionStatus` untouched |
| No new Order status | Confirmed — `decideOrderSyncAction`'s untouched 5-value model still governs, `unsupported` still means "no change," not a new status |
| No UI | Confirmed — nothing under `src/admin/`, `src/pages/`, or any new endpoint file was created or touched |
| No reconciliation | Confirmed — no retry job, `pg_cron`, or background worker added |
| No real provider calls | Confirmed — `getAdapter`/`refundPayment` mocked throughout |

---

# FILES_CHANGED

**THIS TASK'S CHANGES**:

| File | Change |
|---|---|
| `src/payments/services/paymentService.js` | Added one new import (`syncOrderStatusFromPayment`), one new call after the final refund `UPDATE`, and an `orderSync` field on both the fresh-success and in-flight-idempotent-replay return paths |
| `tests/unit/paymentService.test.js` | Added `vi.mock` for `checkoutOrchestration.js`, a default `beforeEach` mock return value, and 19 new tests (`PS-024`–`PS-043`) |

**PRE-EXISTING MODIFICATIONS (from earlier tasks this session, untouched by this task)**:

- `src/payments/adapters/moyasar.js`, `src/payments/index.js`, `src/payments/services/index.js`, `src/payments/types/index.js` (the `+4` here is 3.6C.3.0's `restaurantId` typedef addition, not new this task), `supabase/functions/payment-webhook/handler.js`, `tests/unit/MoyasarAdapter.test.js`, `tests/unit/paymentWebhook.test.js` — all diff-identical to the prior report (3.6C.3.0).
- `src/payments/services/checkoutOrchestration.js` and its own test files (`checkoutOrchestration.test.js`, `orderFromPayment.test.js`, `orderPaymentSync.test.js`) — untracked, unmodified, checksum-verified identical to before this task.

---

# GIT_STATUS

```
$ git status --short
 M src/payments/adapters/moyasar.js
 M src/payments/index.js
 M src/payments/services/index.js
 M src/payments/services/paymentService.js        ← THIS TASK
 M src/payments/types/index.js
 M supabase/functions/payment-webhook/handler.js
 M tests/unit/MoyasarAdapter.test.js
 M tests/unit/paymentService.test.js               ← THIS TASK
 M tests/unit/paymentWebhook.test.js
?? reports/TASK_3_6C_3_1_REFUND_ORDER_SYNC_IMPLEMENTATION_REPORT.md  ← this report
(plus the same set of pre-existing untracked report/sql/module files from prior tasks, including the
 untracked, unmodified checkoutOrchestration.js and its own test files — unchanged)

$ git diff --stat
 src/payments/adapters/moyasar.js              |  20 +-
 src/payments/index.js                         |   1 +
 src/payments/services/index.js                |   7 +
 src/payments/services/paymentService.js       | 116 ++++++-      ← grew from 88, this task's own delta
 src/payments/types/index.js                   |   4 +
 supabase/functions/payment-webhook/handler.js |  19 ++
 tests/unit/MoyasarAdapter.test.js             |  57 +++-
 tests/unit/paymentService.test.js             | 436 +++++++++++++++++++++++++-   ← grew from 206
 tests/unit/paymentWebhook.test.js             |  95 ++++++
 9 files changed, 737 insertions(+), 18 deletions(-)
```

Every file other than `paymentService.js` and `paymentService.test.js` shows a diff byte-identical to the 3.6C.3.0 report. **No commit, no push, no merge.**

---

# DEFERRED

Exactly as instructed: **3.6C.3.2** (any webhook-side refund handling, terminal-guard carve-out, `RECOGNIZED_UNHANDLED` re-routing — still gated on real Moyasar traffic verification, G-6), **3.6D**, **3.6E** (the refund-specific G-5-equivalent gap remains unfixed, per 3.6C.3.0's own explicit deferral, unaffected by this task), **3.6G**, any refund-initiation UI (Admin/Super Admin/customer-facing/HTTP endpoint) — none of these were started.

---

# BLOCKERS

None.

# WARNINGS

1. The deliberate circular import between `paymentService.js` and `checkoutOrchestration.js` is architecturally sound (verified both by reasoning and by empirical full-suite execution) but is a real structural fact about this module pair going forward — any future refactor of either file's top-level code (e.g., adding a top-level side effect that reads the other's export before both finish loading) would need to preserve the "only reference the cycle inside function bodies" discipline this task relies on.
2. `refund()` itself still has **zero real callers** — this task makes the sync reachable *if and when* `refund()` is ever invoked, but does not itself provide that invocation (no UI, no endpoint — correctly out of scope, per instruction).
3. The pre-existing, documented final-`UPDATE`-failure gap (3.6C.3.0) is unaffected by this task, exactly as intended — `syncOrderStatusFromPayment` correctly never runs in that failure window, since the code never reaches it.

---

# REPORT_FILE

`reports/TASK_3_6C_3_1_REFUND_ORDER_SYNC_IMPLEMENTATION_REPORT.md`

# DOWNLOAD_COPY

`/sdcard/Download/TASK_3_6C_3_1_REFUND_ORDER_SYNC_IMPLEMENTATION_REPORT.md` (copied and checksum-verified after this report was written).

# NEXT_STEP

Per the strict stop instruction: **no further work begins** — not 3.6C.3.2, not 3.6D, not 3.6E, not 3.6G, no webhook modification, no refund UI, no reconciliation, no deployment — without separate, explicit instruction from you.

---

*Report generated 2026-08-26.*
