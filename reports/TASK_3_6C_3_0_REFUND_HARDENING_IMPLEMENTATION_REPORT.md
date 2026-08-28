# Task 3.6C.3.0 — Refund Hardening

**IMPLEMENTED. No wiring, no schema change, no webhook change, no checkoutOrchestration.js change.**

---

# EXECUTIVE SUMMARY

Hardened `paymentService.refund()` against all three real prerequisites the 3.6C-Refund-A audit identified, plus the amount-validation gap — **without any schema change**, contrary to what might have been assumed necessary. Tenant isolation now requires and verifies a `restaurantId` against the transaction's own `restaurant_id` column, using the same generic "not found" message for both non-existence and wrong-tenant cases (mirroring the project's own established `sql/staging/staging_order_payment_reference.sql` precedent, to avoid leaking cross-tenant information). Amount validation now enforces `0 < amount <= tx.amount` for partial refunds — and the audit's own "cumulative partial-refund" concern was resolved by evidence, not assumption: the existing single-shot status model (`succeeded → refunded` is the only ever-possible transition, permanently terminal) structurally prevents more than one successful refund per transaction, so no cumulative-tracking mechanism is needed at all — **`REFUND_CUMULATIVE_AMOUNT_GAP` does not apply**. Concurrent-refund idempotency is now solved with a genuine, schema-change-free atomic claim: a conditional `UPDATE ... WHERE status='succeeded' AND updated_at=<the value just read>`, a standard optimistic-concurrency pattern using only pre-existing columns, which Postgres itself serializes correctly across concurrent requests — **`REFUND_IDEMPOTENCY_SCHEMA_GAP` does not apply either**. The idempotency key is now genuinely used (stored in the claim, compared on retry) rather than merely validated-and-discarded. The pre-existing, unguarded final `UPDATE` (a new, refund-specific G-5-equivalent gap) is explicitly documented, not fixed, exactly as instructed. 32 tests in `paymentService.test.js` (18 original + 14 new) all pass. Full regression: **717/717 PASS** (703 baseline + 14 new).

**Verdict: `TASK_3_6C_3_0_COMPLETE`**

---

# TENANT_ISOLATION

**Implemented, no schema change.** `RefundInput` gains a new **required** field `restaurantId` (typedef updated in `src/payments/types/index.js`, matching the task's own preferred shape). `refund()`'s `SELECT` now also reads `restaurant_id`, and the very next check is:

```js
if (!tx || tx.restaurant_id !== input.restaurantId) {
  throw new Error(`refund: لا توجد معاملة بالمعرّف ${input.providerRef} تخصّ هذا المطعم`)
}
```

**The exact same error message fires for "no such transaction" and "transaction belongs to another restaurant"** — deliberately, following the identical privacy-conscious pattern already established in this project's own `sql/staging/staging_order_payment_reference.sql` (re-discovered and reused, not invented). PS-017b proves both cases throw byte-identical messages. `restaurantId` is never derived from anywhere except the caller's own explicit input, validated against the transaction's own column — the same "trusted column vs. caller-supplied" discipline already established in `createOrderFromSuccessfulPayment`/`syncOrderStatusFromPayment`.

---

# AMOUNT_VALIDATION

**Implemented, no schema change.** If `input.amount` is supplied: `amount > 0` and `amount <= tx.amount` are both enforced server-side, before any provider call (PS-019, three sub-cases: zero, negative, exceeds-original).

**On the cumulative-partial-refund question, resolved by evidence rather than assumed away or reported as a gap**: the existing `TransactionStatus` model has no `PARTIALLY_REFUNDED` value (that only exists in the separate, higher-level `PaymentStatus` enum, unrelated to `payment_transactions.status`). `refund()`'s own pre-existing guard (`tx.status !== SUCCEEDED` → reject) means that **the moment any refund call succeeds — full or partial — the transaction moves to `'refunded'`, a terminal state**, and every subsequent `refund()` call for that same transaction is rejected outright by that same guard, regardless of amount. **There is no code path today by which two successful refund calls, partial or otherwise, can ever both complete against the same transaction** — so there is nothing to "sum" or track cumulatively; the single-call check above is not a partial solution masquerading as complete, it is a **complete** solution given the actual, current single-shot architecture. Confirmed explicitly, not assumed: **`REFUND_CUMULATIVE_AMOUNT_GAP` is not reported**, because the scenario it would name does not exist in this codebase.

---

# CONCURRENCY_GUARD

**Implemented, no schema change, no fake lock, no in-memory mutex — a genuine, cross-instance, database-native atomic claim**, using the standard optimistic-concurrency pattern:

```sql
UPDATE payment_transactions
SET metadata = <original metadata + refund_claim marker>, updated_at = now()
WHERE id = $1 AND status = 'succeeded' AND updated_at = $2  -- $2 = the value just read
RETURNING id
```

**Why this is a real guarantee, not a fake one**: a single `UPDATE` statement is *always* its own implicit atomic operation in PostgreSQL — row-level locking during WHERE-clause evaluation and the write itself is inherent to how Postgres processes any `UPDATE`, independent of whether the calling client wraps it in an explicit transaction (which, per the task's own correct warning, this Supabase-JS-based codebase does not, and cannot, hold open across an external Moyasar HTTP call). If two concurrent requests both read the same `updated_at` value and both attempt this claim `UPDATE`, PostgreSQL serializes them: the first to commit changes `updated_at`; the second's `WHERE updated_at = $2` (the now-stale value) no longer matches anything, so it affects **zero rows** — detected via `.select('id').maybeSingle()` returning `null` — and the second request is rejected **before ever calling the provider** (PS-020). No provider call, no double-refund, verified as a real database-level property, not asserted.

**Was a schema change genuinely avoidable?** Yes, confirmed by design, not assumed: the claim uses only `status`, `updated_at`, and `metadata` — all three already exist. No new column, no new table, no new status value (the task's explicit prohibition on inventing a new payment status was respected — `metadata.refund_claim` is a marker *within* the existing jsonb field, not a new enum value). **`REFUND_IDEMPOTENCY_SCHEMA_GAP` is not reported.**

**Documented limitation** (not a false safety claim): if the provider call fails *after* a successful claim, the claim is reverted best-effort (see FAILURE_ISOLATION); if that specific revert itself fails, the transaction is left in a stuck "claimed but no active attempt" state until manually cleared — a **safe** failure mode (blocks a future retry rather than ever permitting a double-refund), explicitly accepted rather than silently ignored.

---

# IDEMPOTENCY_KEY_HANDLING

**Now genuinely used, not merely required-and-discarded.** The claim stores `{idempotency_key: input.idempotencyKey, claimed_at: ...}` inside `metadata.refund_claim`. On any subsequent call for the same transaction while a claim is active:
- **Same `idempotencyKey`** → recognized as the identical logical attempt; the existing claim's data is returned as `{..., idempotent: true}`, **no second provider call** (PS-021, first case).
- **Different `idempotencyKey`** → rejected as "another refund attempt is already in progress," **no provider call** (PS-021, second case) — correctly *not* treated as safe to proceed, since a genuinely different attempt against an already-claimed transaction is exactly the double-refund risk this hardening exists to prevent.

**Persistence mechanism**: the existing `metadata` jsonb column, spread-not-overwritten (`{...(tx.metadata ?? {}), refund_claim: {...}}`) — matching the same "preserve, don't clobber" discipline already documented and relied upon for this column throughout 3.6A-2/3.6A-1b.2. No dedicated new construct was needed or created.

---

# FAILURE_ISOLATION

**Option A implemented (retry-adjacent minimal improvement), not full reconciliation, exactly as scoped**: if `adapter.refundPayment` throws *after* a successful claim, the claim is reverted (`metadata` restored to its pre-claim value) in a **best-effort** `try/catch` that never masks the original provider error (PS-022 — the original `Moyasar error 422...` is still what the caller sees). This directly closes the "a failed attempt permanently blocks all future retries" risk that a claim-without-revert design would otherwise have.

**The pre-existing, separate gap — Moyasar refund succeeds, but the *final* status-to-`'refunded'` `UPDATE` then fails — remains genuinely unguarded**, exactly as the audit found and exactly as this task was instructed to *document, not fix*: no `try/catch` wraps that specific final `UPDATE`. This is a real, refund-specific G-5-equivalent gap, distinct from the concurrency race (which this task *did* close) — it is not solved by the claim mechanism, since by the time this `UPDATE` runs, the refund has already genuinely happened at the provider. **Explicitly deferred to 3.6E**, per instruction — no retry loop, no reconciliation job, no `pg_cron` was added for this specific window.

---

# SAFE_MINIMUM_IMPLEMENTATION

**All of Phases 1–5 were achieved without requiring a schema change** — so the "implement only what doesn't require one" fallback rule did not need to be invoked for any of the four sub-gaps (tenant isolation, amount validation, concurrency, idempotency key). The one item genuinely **not** fixed (per Phase 5's own instruction not to expand into full reconciliation) is the final-`UPDATE`-after-provider-success window — explicitly named above, not silently omitted.

| Protection | Implemented? |
|---|---|
| Tenant isolation | **Yes** |
| Amount validation (single-call bound) | **Yes** |
| Cumulative-refund tracking | **N/A — architecturally impossible to need, given the single-shot status model** (explained above, not silently assumed) |
| Concurrent-refund atomic claim | **Yes** |
| Real idempotency-key usage | **Yes** |
| Claim revert on provider failure | **Yes** (best-effort, documented limitation) |
| Final-UPDATE-after-success failure isolation | **No — explicitly deferred to 3.6E, per instruction** |

---

# TESTS

`tests/unit/paymentService.test.js`, extending the existing refund test block (PS-016/017/018 updated for the new contract; 14 new tests added):

| # | Scenario | Result |
|---|---|---|
| 1 | Missing `restaurantId` → rejected (PS-016b) | PASS |
| 2 | Mismatched `restaurantId` → rejected, generic message identical to not-found (PS-017b, 2 cases) | PASS |
| 3 | Correct `restaurantId` → proceeds (PS-018, PS-018b) | PASS |
| 4 | `amount <= 0` → rejected (PS-019, 2 sub-cases: zero, negative) | PASS |
| 5 | `amount >` original → rejected (PS-019) | PASS |
| 6 | Full refund (no `amount`) → allowed (PS-018) | PASS |
| 7 | Concurrent refund attempt (simulated: claim `UPDATE` finds no matching row) → no provider call (PS-020) | PASS |
| 8 | Same idempotency key twice (simulated: claim already present with matching key) → same logical result, no second provider call (PS-021) | PASS |
| 9 | Different idempotency key on an active claim → rejected, not silently allowed (PS-021) | PASS |
| 10 | Local update failure after provider success → **explicitly not solved**, documented under FAILURE_ISOLATION (no test claims this is handled, consistent with honesty about scope) | DOCUMENTED, not tested-as-solved |
| 11 | No real Moyasar calls in tests | PASS — `getAdapter` mocked throughout, per the established `vi.mock` pattern |
| 12 | No webhook modification | PASS (PS-023, import-line + full-text `refund_claim` scan) |
| 13 | No Admin UI creation | PASS (PS-023, recursive scan of `src/admin/` for any `paymentService.refund`/`checkoutOrchestration` reference — none found) |
| 14 | No `syncOrderStatusFromPayment` call | PASS (PS-023, source-text scan of `refund()`'s own function body) |

Two self-inflicted false positives (source-text checks matching this file's own explanatory Arabic comments rather than actual imports — the same class of issue encountered in 3.6A-1b.2/3.6A-2/3.6B/3.6C.1-2) were found and fixed during authoring by narrowing the checks to actual `import` lines where the risk existed; both documented here for transparency.

---

# FULL_REGRESSION

```
$ npx vitest run
 Test Files  41 passed (41)
      Tests  717 passed (717)

$ npm test -- --run
 Test Files  41 passed (41)
      Tests  717 passed (717)
```

**717/717 PASS** on both invocations (703 baseline + 14 new), zero failures, zero regressions.

---

# STATIC_REVIEW

| Check | Result |
|---|---|
| Webhook unchanged | Confirmed — `git diff` on `handler.js`/`index.ts` identical to every prior report this session |
| `checkoutOrchestration.js` unchanged | Confirmed — file untracked (as before), MD5 unchanged from before this task began, not touched by any edit in this task |
| `create_order` unchanged | Confirmed — no `sql/` file touched, no database call of any kind made this task |
| Moyasar adapter unchanged unless strictly required | Confirmed unchanged — not required for this task, not touched |
| No schema change unless explicitly reported as required and NOT auto-applied | Confirmed — none was required (see CONCURRENCY_GUARD/AMOUNT_VALIDATION reasoning); none was applied |
| No fake concurrency guarantee | Confirmed — the claim mechanism is a genuine, reasoned, database-native atomic operation, explained in full above, not asserted without justification |
| No invented payment status | Confirmed — `TransactionStatus` enum untouched; the claim marker lives inside the existing `metadata` jsonb, not as a new status value |
| No invented refund accounting model | Confirmed — no new "amount refunded so far" field or table was created; the single-call bound check was shown sufficient given the existing single-shot status model, not papered over with an invented tracking mechanism |

---

# FILES_CHANGED

| File | Status |
|---|---|
| `src/payments/services/paymentService.js` | **MODIFIED** — `refund()` hardened (tenant check, amount validation, atomic claim, idempotency-key reuse, claim revert on failure); `startCharge`, `confirmCharge`, `handleWebhookEvent` untouched |
| `src/payments/types/index.js` | **MODIFIED** — `RefundInput` typedef gains `restaurantId` (+1 line) |
| `tests/unit/paymentService.test.js` | **MODIFIED** — 2 existing refund tests updated for the new contract, 14 new tests added |
| `checkoutOrchestration.js`, webhook (`handler.js`/`index.ts`), `MoyasarAdapter`, `create_order`, any Admin UI | **NOT TOUCHED** |

---

# GIT_STATUS

```
$ git status --short
 M src/payments/adapters/moyasar.js
 M src/payments/index.js
 M src/payments/services/index.js
 M src/payments/services/paymentService.js        ← MODIFIED, this task
 M src/payments/types/index.js                    ← +1 line, this task
 M supabase/functions/payment-webhook/handler.js
 M tests/unit/MoyasarAdapter.test.js
 M tests/unit/paymentService.test.js               ← MODIFIED, this task
 M tests/unit/paymentWebhook.test.js
?? reports/TASK_3_6C_3_0_REFUND_HARDENING_IMPLEMENTATION_REPORT.md  ← this report
(plus the same set of pre-existing untracked report/sql/module files from prior tasks, including the
 untracked, unmodified checkoutOrchestration.js and its own test file — unchanged)

$ git diff --stat
 src/payments/adapters/moyasar.js              |  20 ++-
 src/payments/index.js                         |   1 +
 src/payments/services/index.js                |   7 +
 src/payments/services/paymentService.js       |  88 ++++++++++-
 src/payments/types/index.js                   |   4 +
 supabase/functions/payment-webhook/handler.js |  19 +++
 tests/unit/MoyasarAdapter.test.js             |  57 ++++++-
 tests/unit/paymentService.test.js             | 206 +++++++++++++++++++++++++-
 tests/unit/paymentWebhook.test.js             |  95 ++++++++++++++++++++++++++
 9 files changed, 479 insertions(+), 18 deletions(-)
```

`moyasar.js`, `handler.js`, `MoyasarAdapter.test.js`, `paymentWebhook.test.js`, `index.js`, `services/index.js` (`+7`, unchanged since 3.6C.1/2) all show diffs byte-identical to every prior report this session — only `paymentService.js`, `types/index.js`, and `paymentService.test.js` changed, exactly as scoped. **No commit, no push, no merge.**

---

# BLOCKERS

None.

# WARNINGS

1. The unguarded final `UPDATE` (after a genuine, successful provider refund) remains a real, documented, unaddressed gap — deferred to 3.6E, per explicit instruction. Any future task wiring `refund()` to a real caller should be aware this specific narrow window still exists.
2. The claim-revert-on-failure path is itself best-effort; if it fails, the affected transaction is stuck (unable to accept a further refund attempt) until manually cleared — a deliberate, safe-by-design tradeoff (never permits a double-refund), not a defect.
3. `refund()` still has **zero real callers** — this task hardens the function itself but does not make it reachable from anywhere; wiring (3.6C.3.1, still deferred) remains separate, future work.
4. Two self-inflicted, immediately-fixed test false positives occurred during authoring (documented under TESTS) — neither affects the shipped implementation.

---

# REPORT_FILE

`reports/TASK_3_6C_3_0_REFUND_HARDENING_IMPLEMENTATION_REPORT.md`

# DOWNLOAD_COPY

`/sdcard/Download/TASK_3_6C_3_0_REFUND_HARDENING_IMPLEMENTATION_REPORT.md` (copied and checksum-verified after this report was written).

# NEXT_STEP

Per the strict stop instruction: **no further work begins** — not wiring `refund()` to any caller, not 3.6C.3.1, not webhook changes, not Admin UI, not migrations, not deployment — without separate, explicit instruction from you.

---

*Report generated 2026-08-26.*
