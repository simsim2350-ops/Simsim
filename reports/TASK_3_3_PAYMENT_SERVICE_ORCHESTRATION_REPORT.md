# Task 3.3 — Payment Service Orchestration Report

**Date:** 2026-08-23
**Task:** 3.3 — Wire paymentService.js to MoyasarAdapter
**Branch:** `phase-3/task-3-3-payment-service`
**Commit:** `524bdda`
**PR:** #325
**CI Run:** 32599461981 — ✅ PASSED
**Status:** ✅ TASK 3.3 = COMPLETE

---

## Executive Summary

Task 3.3 replaces the 4 stub methods in `paymentService.js` (which previously threw "foundation only") with real payment-domain orchestration. The service accepts a dependency-injected `db` client in every method and routes all gateway-specific operations through the `PaymentAdapter` abstraction. 18 unit tests were added covering all methods and edge cases. All 454 tests pass in CI (up from 436 pre-existing). No application code outside `src/payments/services/paymentService.js` was modified. No production systems were touched. No Moyasar credentials were used.

**TASK 3.3 = COMPLETE**
**TASK 3.4 = NOT STARTED**
**TASK 3.5 = NOT STARTED**
**PRODUCTION PAYMENT FLOW = NOT ACTIVE — is_enabled remains false**

---

## Pre-Flight Repository State

| Item | State at Task 3.3 Start |
|------|------------------------|
| Branch | `phase-3/task-3-3-payment-service` (clean, created in prior session) |
| `src/payments/services/paymentService.js` | Stub — 4 methods throwing FOUNDATION_ONLY |
| `tests/unit/paymentService.test.js` | NOT YET CREATED |
| `sql/payment_transactions_idempotency_key_unique.sql` | NOT YET CREATED |
| Pre-existing tests | 436 tests / 33 files |
| MoyasarAdapter | COMPLETE (Task 3.2) |
| `paymentService` in browser bundle | NOT imported — confirmed by grep (zero results) |
| `payment_transactions` RLS | `is_platform_admin()` required — anon/browser client blocked |
| `idempotency_key` UNIQUE constraint | ABSENT — only text column, no DB-level deduplication |
| `payment_providers.moyasar.is_enabled` | false — unchanged |

---

## Critical Architecture Findings (Pre-Flight)

### RLS Constraint
`payment_transactions` enforces RLS with `for all using (public.is_platform_admin())`. This means:
- **Browser anon client CANNOT write** to this table — RLS blocks it
- The `db` client injected into paymentService MUST be a Supabase service_role client
- In production: Edge Function provides service_role; in tests: mock is injected
- This is correctly handled by the dependency injection pattern in this implementation

### Idempotency Key — No UNIQUE Constraint
The `idempotency_key` column exists as `text` with no UNIQUE index. This creates a TOCTOU race condition: two concurrent requests with the same key could both SELECT→NULL and both INSERT, creating duplicate charge attempts.

**Mitigation applied:**
1. Application-level idempotency check (SELECT before INSERT — best-effort)
2. Proposed migration `sql/payment_transactions_idempotency_key_unique.sql` created
3. Migration marked OWNER/DBA GATE — NOT applied to production in this task

### Browser Bundle Isolation
```
grep -r "paymentService\|src/payments" src/pages/ src/features/ src/components/ → 0 results
```
`src/payments/` is completely isolated from the browser SPA bundle. Safe.

---

## Implementation Scope

### Allowed — completed
- `src/payments/services/paymentService.js` — 4 methods with real orchestration
- `tests/unit/paymentService.test.js` — 18 unit tests
- `sql/payment_transactions_idempotency_key_unique.sql` — proposed migration (OWNER/DBA GATE)

### Not in scope — not touched
- Webhook Edge Function (Task 3.4)
- `create_order` RPC (Task 3.5)
- Payment UI
- DB schema / production SQL execution
- `payment_providers.is_enabled`
- Production credentials / secrets
- Any file outside `src/payments/services/`, `tests/unit/`, `sql/`

---

## Architecture

```
Customer Checkout UI
        ↓
  [Task 3.4 — future: Edge Function]
        ↓
  paymentService         ← implemented in Task 3.3 (this task)
  (args, { db })         ← dependency-injected Supabase service_role client
        ↓
  PaymentAdapter         ← abstract contract (src/payments/contracts/PaymentAdapter.js)
        ↓
  MoyasarAdapter         ← concrete (Task 3.2, src/payments/adapters/moyasar.js)
        ↓
  Moyasar REST API
```

**Gateway abstraction preserved:** paymentService contains zero Moyasar-specific code. All provider logic lives in MoyasarAdapter. Calling `getAdapter('tap')` would use a future TapAdapter without changing paymentService.

---

## paymentService.js Implementation

**File:** `src/payments/services/paymentService.js`

### Method Signatures

All 4 methods accept `(args, { db })` — the `db` parameter is the Supabase client provided by the caller (service_role in Edge Function, mock in tests).

| Method | Signature | Purpose |
|--------|-----------|---------|
| `startCharge` | `(input, { db })` | Idempotency check → insert initiated row → adapter.createCharge → update row |
| `confirmCharge` | `(providerRef, { db })` | Find tx → terminal guard → adapter.verifyPayment → update row |
| `handleWebhookEvent` | `(event, { db })` | Insert webhook (unique guard) → find tx → terminal guard → update tx → mark processed |
| `refund` | `(input, { db })` | Find tx → status guard → adapter.refundPayment → update to refunded |

### startCharge Flow

```
1. Validate input (restaurantId, amount > 0, currency required)
2. provider = input.provider ?? 'moyasar'
3. idemKey = input.idempotencyKey ?? newIdempotencyKey('pay')
4. SELECT payment_transactions WHERE idempotency_key = idemKey → if found: return idempotent result
5. INSERT payment_transactions {status: 'initiated', ...}
6. adapter.createCharge({...}) → if throws: UPDATE to FAILED, rethrow
7. UPDATE payment_transactions {provider_ref, status, raw, metadata.redirect_url}
8. Return {transactionId, providerRef, status, redirectUrl, idempotent: false}
```

### confirmCharge Flow

```
1. Validate providerRef
2. SELECT payment_transactions WHERE provider_ref = providerRef
3. If not found → throw
4. If isTerminalStatus(tx.status) → return {updated: false} (no adapter call)
5. adapter.verifyPayment(providerRef)
6. UPDATE payment_transactions {status, raw}
7. Return {transactionId, providerRef, status, updated: true}
```

### handleWebhookEvent Flow

```
1. Validate event.provider and event.eventId
2. INSERT payment_webhook_events (UNIQUE provider+event_id) → if 23505: return already_processed
3. If event.providerRef absent → mark processed, return no_provider_ref
4. SELECT payment_transactions WHERE provider_ref = event.providerRef
5. If not found → mark webhook error, return transaction_not_found
6. If isTerminalStatus(tx.status) → mark webhook processed with tx.id, return already_terminal
7. UPDATE payment_transactions {status = event.status ?? _eventTypeToStatus(event.type)}
8. UPDATE payment_webhook_events {transaction_id, processed_at}
9. Return {updated: true, transactionId, status}
```

### refund Flow

```
1. Validate providerRef and idempotencyKey
2. SELECT payment_transactions WHERE provider_ref = providerRef
3. If not found → throw
4. If tx.status !== 'succeeded' → throw (cannot refund non-succeeded)
5. adapter.refundPayment(input)
6. UPDATE payment_transactions {status: 'refunded', raw}
7. Return {transactionId, refundRef, status}
```

---

## Idempotency Analysis

### Current State (without migration)

| Layer | Mechanism | Coverage |
|-------|-----------|----------|
| Application | `SELECT idempotency_key` before INSERT | ✅ Handles sequential retries |
| Database | No UNIQUE constraint | ❌ Race condition window exists for concurrent requests |

**Race condition:** Two simultaneous requests with the same `idempotency_key` can both SELECT→NULL simultaneously, then both INSERT, creating two `payment_transactions` rows. This is the TOCTOU (Time Of Check To Time Of Use) window.

### Proposed Migration (OWNER/DBA GATE)

**File:** `sql/payment_transactions_idempotency_key_unique.sql`

```sql
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  uq_paytx_idempotency_key
ON public.payment_transactions (idempotency_key)
WHERE idempotency_key IS NOT NULL;
```

With this index, a concurrent duplicate INSERT would fail with PostgreSQL error code `23505`, which the service would need to handle (retry the SELECT to return the existing row). This constraint closes the race window entirely.

**Status:** NOT APPLIED TO PRODUCTION. Requires owner review and DBA execution.

**Pre-application verification query** (included in migration file):
```sql
SELECT idempotency_key, COUNT(*)
FROM public.payment_transactions
WHERE idempotency_key IS NOT NULL
GROUP BY idempotency_key HAVING COUNT(*) > 1;
```
If this returns no rows → safe to apply.

---

## Terminal Status Guard

The `isTerminalStatus` helper (from `src/payments/utils/index.js`) prevents invalid state transitions:

```js
const TERMINAL = new Set(['succeeded', 'failed', 'cancelled', 'refunded'])
```

Applied in:
- `confirmCharge` — skips `verifyPayment` call if already terminal
- `handleWebhookEvent` — skips transaction update if already terminal

This ensures a `succeeded` transaction cannot be flipped to `failed` by a late webhook.

---

## Security Review

| Check | Result |
|-------|--------|
| No real API keys in paymentService.js | ✅ CONFIRMED |
| No real API keys in test file | ✅ CONFIRMED — mocked adapter used |
| No `.env` file created | ✅ CONFIRMED |
| `db` client never created inside service | ✅ — always injected, never constructed |
| No browser anon key usage | ✅ — injection pattern prevents it |
| No Moyasar API calls in paymentService | ✅ — all via adapter abstraction |
| No secrets in migration file | ✅ CONFIRMED |
| No secrets in git diff | ✅ CONFIRMED (`grep -n "sk_live|SECRET_KEY\s*=" → NO MATCHES`) |
| `payment_providers.is_enabled` unchanged | ✅ — still false for moyasar |
| No production DB changes | ✅ — migration is proposed only |

---

## Dependency Injection Pattern

```js
// Caller (future Edge Function — Task 3.4):
import { createClient } from '@supabase/supabase-js'
const db = createClient(url, SERVICE_ROLE_KEY)
const result = await paymentService.startCharge(input, { db })

// Test:
const db = makeDb(makeChain({ data: tx, error: null }), ...)
const result = await paymentService.startCharge(input, { db })
```

The service never constructs its own Supabase client. This ensures:
1. Tests can inject mocks without monkey-patching globals
2. The service_role key stays in the Edge Function; it never leaks to this layer
3. The same service can be unit-tested without network access

---

## Tests Added

**File:** `tests/unit/paymentService.test.js`

Environment: `// @vitest-environment happy-dom`
Adapter mocking: `vi.mock('../../src/payments/adapters/index.js', ...)`
DB mocking: chainable Supabase-like object factory — no real DB calls
All tests: no real HTTP, no real DB, no real credentials

### DB Mock Pattern

```js
function makeChain(result = { data: null, error: null }) {
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
}
function makeDb(...chains) {
  let i = 0
  return { from: vi.fn().mockImplementation(() => chains[i++] ?? makeChain()) }
}
```

### Test Table

| Test ID | Method | Description | Result |
|---------|--------|-------------|--------|
| PS-001 | startCharge | Throws if restaurantId missing | ✅ |
| PS-002 | startCharge | Throws if amount is 0 or negative | ✅ |
| PS-003 | startCharge | Idempotent return — existing tx found by idempotency_key | ✅ |
| PS-004 | startCharge | Happy path — insert, adapter.createCharge, update row, return | ✅ |
| PS-005 | startCharge | Adapter failure — updates row to FAILED, rethrows error | ✅ |
| PS-006 | confirmCharge | Throws if providerRef is empty | ✅ |
| PS-007 | confirmCharge | Terminal status — no adapter call, returns updated=false | ✅ |
| PS-008 | confirmCharge | Transaction not found — throws | ✅ |
| PS-009 | confirmCharge | Happy path — verifyPayment, update row, return updated=true | ✅ |
| PS-010 | handleWebhookEvent | Throws if event.provider missing | ✅ |
| PS-011 | handleWebhookEvent | 23505 unique violation → already_processed | ✅ |
| PS-012 | handleWebhookEvent | No providerRef → no_provider_ref | ✅ |
| PS-013 | handleWebhookEvent | Transaction not found → transaction_not_found | ✅ |
| PS-014 | handleWebhookEvent | Transaction terminal → already_terminal | ✅ |
| PS-015 | handleWebhookEvent | Happy path — update tx status, mark webhook processed | ✅ |
| PS-016 | refund | Throws if providerRef missing | ✅ |
| PS-017 | refund | Throws if tx status is not succeeded | ✅ |
| PS-018 | refund | Happy path — refundPayment, update to REFUNDED, return | ✅ |

**Total new tests: 18**

---

## CI Results

**CI Run:** 32599461981
**Branch:** `phase-3/task-3-3-payment-service`
**PR:** #325
**Trigger:** Pull Request

```
✓ tests/unit/paymentService.test.js   (18 tests, 31ms)

 Test Files  34 passed (34)
      Tests  454 passed (454)
```

All 18 new tests passed. All 436 pre-existing tests passed.

---

## Coverage Results

| Metric | Threshold | Measured | Status |
|--------|-----------|----------|--------|
| Statements | ≥60% | 67.13% | ✅ |
| Branches | ≥53% | 59.77% | ✅ |
| Functions | ≥45% | 52.35% | ✅ |
| Lines | ≥63% | 71.16% | ✅ |

All thresholds pass. Coverage improved across all metrics compared to Task 3.2 baseline.

---

## Regression Results

| Metric | Before Task 3.3 | After Task 3.3 | Delta |
|--------|-----------------|----------------|-------|
| Test files | 33 | 34 | +1 |
| Total tests | 436 | 454 | +18 |
| Failed tests | 0 | 0 | 0 |
| Build | PASS | PASS | — |
| Stmts coverage | ~65% | 67.13% | +~2% |
| Branch coverage | ~57% | 59.77% | +~3% |
| Funcs coverage | ~49% | 52.35% | +~3% |
| Lines coverage | ~68% | 71.16% | +~3% |

**Zero regressions.**

---

## Files Created

| File | Description |
|------|-------------|
| `tests/unit/paymentService.test.js` | 18 unit tests — 220 lines |
| `sql/payment_transactions_idempotency_key_unique.sql` | Proposed UNIQUE index migration (OWNER/DBA GATE) |
| `reports/TASK_3_3_PAYMENT_SERVICE_ORCHESTRATION_REPORT.md` | This report |

---

## Files Modified

| File | Change |
|------|--------|
| `src/payments/services/paymentService.js` | Replaced 4 stub methods with real orchestration (+246 lines) |

---

## Files Not Modified

| Category | Confirmation |
|----------|-------------|
| `src/payments/adapters/moyasar.js` | UNCHANGED |
| `src/payments/adapters/index.js` | UNCHANGED |
| `src/payments/contracts/PaymentAdapter.js` | UNCHANGED |
| `src/payments/types/index.js` | UNCHANGED |
| `src/payments/utils/index.js` | UNCHANGED |
| All `src/pages/**`, `src/features/**`, `src/components/**` | UNCHANGED |
| `package.json` / `package-lock.json` | UNCHANGED |
| `vite.config.js` | UNCHANGED |
| `vercel.json` | UNCHANGED |
| `.github/workflows/ci.yml` | UNCHANGED |
| All pre-existing `sql/*.sql` | UNCHANGED |
| `supabase/functions/**` | UNCHANGED |
| `PROJECT_STATE.md` | UNCHANGED |
| `payment_providers` table | UNCHANGED — moyasar is_enabled=false |

---

## Git Diff Summary

```
src/payments/services/paymentService.js    | 275 +++++++++++++++++++++++++---- (modified)
tests/unit/paymentService.test.js          | 220 ++++++++++++++++++++++++++++ (new)
sql/payment_transactions_idempotency_key_unique.sql | 37 ++++++ (new)
```

3 files changed, 657 insertions(+), 29 deletions(-)

---

## Git Status

```
On branch phase-3/task-3-3-payment-service
Your branch is up to date with 'origin/phase-3/task-3-3-payment-service'.
```

All implementation files committed and pushed. Untracked files are pre-existing reports unrelated to this task.

---

## Production Deployment Status

```
PRODUCTION DEPLOYMENT: NONE
VERCEL:                UNCHANGED (preview only — no production change)
SUPABASE:              UNCHANGED
DATABASE:              UNCHANGED
payment_providers:     moyasar row still is_enabled=false (unchanged)
payment_transactions:  no UNIQUE constraint added (migration is proposed only)
```

---

## Sandbox / Live Testing Status

```
SANDBOX TESTING: BLOCKED — sandbox credentials not yet obtained
LIVE TESTING:    BLOCKED — live credentials not yet obtained

All tests use mocked HTTP and mocked DB. No real Moyasar API calls.
No real Supabase DB calls. This is expected and correct for Task 3.3.

To unblock end-to-end testing:
1. Owner creates Moyasar developer account
2. Owner obtains sandbox API key
3. Owner sets PAYMENT_MOYASAR_SECRET_KEY in Edge Function env
4. Owner applies proposed migration (sql/payment_transactions_idempotency_key_unique.sql)
5. Task 3.4 (Edge Function) is implemented and deployed
6. Manual sandbox payment test performed
```

---

## Known Limitations

| # | Limitation | When Resolved |
|---|-----------|---------------|
| L-1 | No webhook Edge Function — `handleWebhookEvent` exists but nothing calls it from outside | Task 3.4 |
| L-2 | `create_order` RPC has no payment reference column | Task 3.5 |
| L-3 | Idempotency race window exists without DB UNIQUE constraint | Owner applies proposed migration before Task 3.4 go-live |
| L-4 | No sandbox testing — credentials not yet obtained | Owner action |
| L-5 | `is_enabled=false` — payment flow unreachable until owner enables Moyasar | Owner action |
| L-6 | No payment UI — customer checkout flow is incomplete | Future phase (owner to confirm scope) |

---

## OWNER/DBA ACTION REQUIRED

**Before Task 3.4 or enabling live payments:**

1. Review `sql/payment_transactions_idempotency_key_unique.sql`
2. Run duplicate-check query:
   ```sql
   SELECT idempotency_key, COUNT(*)
   FROM public.payment_transactions
   WHERE idempotency_key IS NOT NULL
   GROUP BY idempotency_key HAVING COUNT(*) > 1;
   ```
3. If no duplicates: apply the migration via Supabase dashboard or SQL editor
4. Confirm index `uq_paytx_idempotency_key` appears in database schema

---

## Next Task

**Task 3.4 — Webhook Edge Function**

Scope: Create Supabase Edge Function that:
1. Receives POST from Moyasar webhook
2. Validates HMAC signature (security requirement from ADR-003)
3. Parses payload via `adapter.parseWebhook(payload, headers)`
4. Calls `paymentService.handleWebhookEvent(event, { db })` with service_role db
5. Returns 200 regardless of processing outcome (webhook retry protection)

**TASK 3.4 = NOT STARTED. Awaiting explicit owner approval.**

---

*Report generated: 2026-08-23*
*TASK 3.3 = COMPLETE*
