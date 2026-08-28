# Task 3.6D.6 — Payment-First Order Creation Edge Function Implementation Report

**Implementation of the new `create-order-from-payment` Edge Function only, per the owner-approved `TASK_3_6D_6_A_ORDER_CREATION_SECURITY_SPEC.md`. No wiring into `PaymentFirstCallbackLanding`. No order-confirmation UI. No deployment. No commit/push/merge.**

---

# IMPLEMENTATION_SUMMARY

Built a new Supabase Edge Function, `create-order-from-payment`, that is the sole intended caller of the existing, **unmodified** `createOrderFromSuccessfulPayment` (`src/payments/services/checkoutOrchestration.js:290`). The handler resolves `paymentTransactionId` server-side from a client-supplied `paymentIdempotencyKey`, checks the payment's status, resolves and verifies tenant context (QR or slug), and — only then — calls the existing orchestration function. The response is mapped to the exact, generalized contract approved in `TASK_3_6D_6_A`: `succeeded | pending | not_found | retryable_error | requires_reconciliation | validation_error | internal_error`, never exposing `providerRef`, `paymentTransactionId`, or raw error text.

Structure mirrors `payment-first-checkout` exactly: DI-friendly `handler.js` (`buildHandler({db, createOrder})`), thin `index.ts` (`service_role` client, `Deno.serve`), and a co-located `handler.test.js` (no real Deno/Supabase, fully mocked).

**Result**: 1009/1009 tests passing (959 baseline + 50 new, zero failures, zero skipped, zero weakened assertions).

---

# ARCHITECTURE

```
Browser (PaymentFirstCallbackLanding, not wired yet)
  │  POST { paymentIdempotencyKey, restaurant_slug | table_qr_token,
  │         customerPhone, customerName?, tableNumber?, deliveryAddress?, notes? }
  ▼
create-order-from-payment/handler.js  (buildHandler({db, createOrder}))
  │  PHASE 1: resolve payment_transactions by idempotency_key (server-side only)
  │  PHASE 2: check status === 'succeeded' (else → pending, generalized)
  │  PHASE 3: resolve tenant (QR: restaurant_tables → restaurants; slug: restaurants)
  │  PHASE 4: verify tenant.restaurant_id === paymentTx.restaurant_id (else → not_found)
  │  PHASE 5: resolve tableNumber — QR: server-resolved only; non-QR: client-declared pass-through
  │  PHASE 6: call createOrderFromSuccessfulPayment(...) — UNCHANGED, single call
  │  PHASE 7: map its response to the approved, generalized contract
  ▼
createOrderFromSuccessfulPayment (checkoutOrchestration.js, untouched)
  ▼
create_order RPC (untouched) → orders (orders_payment_transaction_id_uidx, untouched)
```

Consistent with the approved spec's `RECOMMENDED_ARCHITECTURE` (Option A) — no logic from `createOrderFromSuccessfulPayment` was duplicated; the handler is a thin, testable wrapper.

---

# FILES_CREATED

| File | Lines | Purpose |
|---|---|---|
| `supabase/functions/create-order-from-payment/handler.js` | 316 | Request validation, server-side payment/tenant resolution, single call into `createOrderFromSuccessfulPayment`, response mapping. Fully dependency-injected (`buildHandler({db, createOrder})`). |
| `supabase/functions/create-order-from-payment/index.ts` | 36 | Deno entry point — `service_role` Supabase client (mirrors `payment-first-checkout/index.ts` exactly), `Deno.serve(buildHandler({db}))`. Not deployed. |
| `supabase/functions/create-order-from-payment/handler.test.js` | 513 | 50 tests, co-located (mirrors `payment-first-checkout/handler.test.js`'s own convention), fully mocked `db`/`createOrder`. |

# FILES_MODIFIED

**None.** No existing file was edited. `git diff --stat` against tracked files is byte-identical to the state immediately before this task began (verified — see `GIT_STATUS` below); the only additions are the three new files above and this report.

---

# REQUEST_CONTRACT (as implemented)

| Field | Required | Handling |
|---|---|---|
| `paymentIdempotencyKey` | Yes | Non-empty string; used only for an exact-match `payment_transactions.idempotency_key` lookup. |
| `restaurant_slug` **or** `table_qr_token` | Exactly one | Same exclusivity rule as `payment-first-checkout` (`hasQr === hasSlug` ⇒ reject). `table_qr_token` must match the same UUID shape already used by `payment-first-checkout`. |
| `customerPhone` | Yes | Must match `^5[0-9]{8}$` (same shape check as `payment-first-checkout`/`create_order`). Rejected outright if missing or malformed — not defaulted, not fabricated. |
| `customerName` / `notes` / `deliveryAddress` / `tableNumber` | Optional | Strings only if present, ≤500 chars (same `MAX_STRING_LEN` convention as `payment-first-checkout`) — rejected, not truncated, if oversized. Empty/whitespace-only treated as absent. |

**Never read from the request body, even if present** (validated by tests 21-25): `paymentTransactionId`, `providerRef`, `amount`, `currency`, `restaurant_id`, `branch_id`, `items`, `coupon_code`, `type`. `validateRequest` only extracts the named fields above — nothing else is ever passed through to `createOrder`.

---

# RESPONSE_CONTRACT (as implemented)

| `status` | HTTP | Fields returned | Source |
|---|---|---|---|
| `succeeded` | 200 | `orderId`, `orderNumber`, `accessToken`, `idempotent` | `createOrderFromSuccessfulPayment` returned `succeeded` — first creation or idempotent replay, same shape either way. |
| `pending` | 200 | — | Payment row not `succeeded` yet (pre-check), **or** the rare race where `createOrderFromSuccessfulPayment` itself returns `rejected/payment_not_successful` on its own fresh internal read. |
| `not_found` | 200 | — | No payment row for the key, **or** tenant resolution failed, **or** tenant mismatch (pre-check or the function's own `rejected/payment_transaction_not_found`/`tenant_mismatch`). |
| `retryable_error` | 200 | — | `createOrderFromSuccessfulPayment` returned `retryable_error` (`order_race_unrecovered`). |
| `requires_reconciliation` | 200 | — | `createOrderFromSuccessfulPayment` returned `price_drift_requires_reconciliation`. `dryRun`/`paymentTransactionId` are logged server-side only, never returned. |
| `validation_error` | 400 | `status: 'validation_error'` | Malformed request body — before any DB I/O. |
| `internal_error` | 500 | `error: 'internal_error'` | Genuine exceptions, **and** every remaining `rejected` reason (`snapshot_missing`, `snapshot_invalid`, `snapshot_fingerprint_mismatch`, `amount_integrity_violation`, `snapshot_restaurant_mismatch`, `create_order_failed`) — real integrity violations or `create_order` failures with no dedicated client-facing category in the approved contract; logged with `console.error` + `requestId` + the actual reason for server-side visibility, never exposed to the client. |

Never included, under any status: `providerRef`, `paymentTransactionId`, raw Postgres/JS error text, `payment_transactions.metadata`/`raw`.

---

# PAYMENT_RESOLUTION

Implemented exactly per the approved spec's `SERVER-SIDE PAYMENT RESOLUTION` section:
```js
const { data: paymentTx } = await db
  .from('payment_transactions')
  .select('id, restaurant_id, status')
  .eq('idempotency_key', validation.paymentIdempotencyKey)
  .maybeSingle()
```
`paymentTransactionId` is never read from the request body — `validateRequest` doesn't even have a field for it, so a client-supplied value (tested explicitly, scenario 3) has no code path to reach `createOrder` at all.

---

# TENANT_VALIDATION

Two small, independent (not imported, not shared) resolver functions were written directly in the new `handler.js` — `resolveQrTenant`/`resolveSlugTenant` — matching `payment-first-checkout/handler.js`'s own query pattern exactly (`restaurant_tables` → `restaurants` for QR; `restaurants` only for slug), but **not imported from that file**, since the approved scope was "create ONLY the new Edge Function" and touching `payment-first-checkout/handler.js` (e.g., to export these helpers) was outside that scope. This is a small, read-only duplication (~30 lines) of tenant-lookup queries only — not a duplication of any payment/order business logic.

`tenant.restaurant_id` is compared against `paymentTx.restaurant_id` (pre-check, generalized to `not_found` on mismatch) **and** separately passed as `expectedRestaurantId` into `createOrderFromSuccessfulPayment`, which performs its own independent comparison against the same column (defense-in-depth, both layers verified by tests: `COFP-7` for the pre-check, and the underlying function's own pre-existing test suite for its internal check — not re-tested here since that logic is unmodified).

---

# CUSTOMER_DATA_HANDLING

All of `customerPhone`/`customerName`/`deliveryAddress`/`notes` (and, for non-QR, `tableNumber`) are read directly from the request body — untrusted, execution-only, exactly as classified in the approved spec's `AUTHORITATIVE_VS_UNTRUSTED_DATA` table. The handler performs only cheap shape/length validation (phone format, string type, 500-char cap) — it does **not** re-validate business rules like "delivery requires an address," leaving that entirely to `create_order`'s own existing validation (unchanged), since the handler cannot know the order's `type` without first calling `createOrderFromSuccessfulPayment` (the snapshot, not the request, is the only source of `type`).

Per the approved contract: "if missing → safe validation/recovery result; if malformed → validation_error." Since this Edge Function has no access to `localStorage` itself (that's a browser-only concept — `simsim_payfirst_customer_${key}`, read by the browser and forwarded as request fields), "missing" and "malformed" collapse to the same server-side observation: an absent or invalid `customerPhone` in the request body → `validation_error` (tests 9, 10). No fabrication of a default value occurs at any point.

---

# QR_HANDLING

For `table_qr_token` requests, `tableNumber` is **always** taken from `resolveQrTenant`'s own DB-resolved `table.table_number` — the handler does not even read `body.tableNumber` into the value used for `createOrder` when `isQr` is true (`const tableNumber = isQr ? tenant.table_number : validation.tableNumber`). Verified explicitly by test 14: a forged `tableNumber` sent alongside a valid `table_qr_token` has zero effect on the value forwarded to `createOrderFromSuccessfulPayment`.

The QR table lookup itself (`restaurant_tables` filtered by `qr_token` + `qr_enabled=true` + `status='active'`) is the same active/enabled check already used by `payment-first-checkout`; an inactive/disabled/unknown QR token resolves to `null` and the whole request generalizes to `not_found` (tests `COFP-T01`–`T03`).

---

# ORDER_TYPE_HANDLING

The request contract does not carry an authoritative `type` field (forbidden per the approved spec — order type is never accepted from the client here). The handler is therefore intentionally type-agnostic: it forwards whichever of `tableNumber`/`deliveryAddress`/`customerName`/`notes` are present, and `create_order` (via the unmodified `createOrderFromSuccessfulPayment`, using `snapshot.type` from the payment's own stored checkout snapshot) remains the sole authority on which fields a given order actually requires. This matches the pattern already established for `initiatePaymentFirstCheckout`, which also does not gate execution fields by type before calling `create_order`.

---

# IDEMPOTENCY

No new idempotency mechanism was added — none was needed or permitted. The handler:
- Calls `createOrderFromSuccessfulPayment` exactly once per request (test 26).
- Passes through its `idempotent: true`/`false` flag verbatim in the `succeeded` response (tests 15, 16).
- Treats a race-recovered result exactly the same as a first-creation result — both map to the identical `succeeded` response shape (test 17), since the underlying function itself already guarantees this.

No in-memory locks, caches, or new tables were introduced, per the explicit prohibition in both the approved spec and this task's own instruction.

---

# CONCURRENCY

Unchanged from the audited behavior in `TASK_3_6D_6_A`: the DB-level unique index `orders_payment_transaction_id_uidx` remains the sole real concurrency guarantee. This Edge Function adds no new concurrency behavior of its own — it is a single-request-in, single-request-out wrapper with no shared in-process state between invocations (each `buildHandler` call receives a fresh `db`/`createOrder` in tests; in production, each Edge Function invocation is independent). Test 17 documents (not re-proves) that two independent calls, each mocked to reflect a winner/loser outcome from the underlying function, both surface as valid `succeeded` responses.

---

# SECURITY

- **`paymentTransactionId` never accepted from the client** — confirmed by test 3 (forged value has zero effect) and by the simple fact that `validateRequest` has no such field.
- **`amount`/`currency`/`restaurant_id`/`branch_id`/`items`/`coupon_code` never forwarded to `createOrder`** even when present in the body — confirmed individually by tests 21-24 (property-absence assertions on the actual call arguments) and test 25 (`restaurant_id` specifically cannot override the server-resolved `expectedRestaurantId`).
- **`providerRef`/`paymentTransactionId` never appear in any response**, even when the (mocked) underlying function's result object happens to carry them — confirmed by tests 19, 20, since `buildResponse` constructs the success object by explicitly naming four fields rather than spreading the result.
- **Raw errors never surfacing to the client** — confirmed by tests 18 (rejected `Error` message), `COFP-R05` (rejected reason's `message` field), and the generic 500 path for unmapped statuses (`COFP-R06`).
- **No `service_role`/secret leakage** — confirmed by `COFP-R07`.
- **No direct `db.rpc()` call from this handler** — all order-creation logic remains solely inside the unmodified `createOrderFromSuccessfulPayment`; confirmed by `COFP-R08`.
- **Source independence** — confirmed by tests 27/28 that `handler.js`'s import lines never reference `payment-webhook` or the payment-status RPC (`payment_status_reads`/`get_payment_status_by_idempotency_key`), matching the approved spec's requirement that this new function be the *only* new caller introduced, with the webhook and status RPC left completely untouched.

---

# LOGGING

Every branch logs with `[create-order-from-payment:${requestId}]` (mirrors `payment-first-checkout`'s exact prefix convention) at an appropriate level: `console.log` for expected outcomes (`pending`, `succeeded`), `console.warn` for rejections/not-found/retryable, `console.error` for genuine integrity violations, `create_order_failed`, and unmapped statuses/exceptions — always including the actual internal `reason` **server-side only**, never in the HTTP response. No `service_role` key, `providerRef`, payment secret, full customer PII payload, or raw `payment_transactions` metadata is ever logged — only IDs (`paymentTransactionId`, `orderId`) and status/reason strings, matching the existing logging posture of both `payment-first-checkout` and `payment-webhook`.

---

# TESTS

**50 new tests**, all passing, organized into four `describe` blocks in `supabase/functions/create-order-from-payment/handler.test.js`:

1. **Basics** (10 tests, `COFP-B*`) — HTTP method handling, malformed/oversized/exclusive-field-violation request bodies.
2. **Owner-required scenarios** (26 tests, numbered 1-26 plus a combined 27/28) — every one of the 28 scenarios listed in the approval message is covered; scenarios 27 and 28 ("payment webhook remains unchanged" / "payment status RPC remains unchanged") are addressed as a source-independence check here, with the actual non-regression proven by the full suite run below (their own existing test files, `paymentWebhook.test.js` and the payment-status RPC's guard tests, all still pass unchanged).
3. **Tenant resolution edge cases** (5 tests, `COFP-T*`) — QR/slug not-found, inactive, suspended.
4. **Full response contract** (8 tests, `COFP-R*`) — `retryable_error`, `requires_reconciliation`, each integrity-violation `rejected` reason, unmapped status, and the security/logging assertions (`service_role`, `db.rpc`).

All tests use the same dependency-injection pattern as `payment-first-checkout/handler.test.js` — `buildHandler({db, createOrder})`, `makeChain`/`makeDb` mocks, no real Deno/Supabase, no real `createOrderFromSuccessfulPayment` invocation (fully mocked at the boundary, matching the approved spec's own test-strategy recommendation of not re-proving the underlying function's already-tested logic here).

---

# REGRESSION_RESULTS

```
Test Files  54 passed (54)
     Tests  1009 passed (1009)
```

Baseline before this task: **959/959**. New tests added: **50**. Total: **1009/1009**, zero failures, zero skipped, zero weakened or removed assertions anywhere in the existing suite.

---

# GIT_STATUS

`git diff --stat` against tracked files is **identical** to the state before this task began (the same 14 pre-existing modified files from earlier phases of this session, none touched by this task). The only filesystem changes introduced by this task:

```
?? reports/TASK_3_6D_6_A_ORDER_CREATION_SECURITY_SPEC.md   (previous task, already existed)
?? supabase/functions/create-order-from-payment/            (new — this task)
?? reports/TASK_3_6D_6_ORDER_CREATION_EDGE_FUNCTION_IMPLEMENTATION_REPORT.md  (this report)
```

No file inside `supabase/functions/payment-webhook/`, `sql/`, `src/payments/services/checkoutOrchestration.js`, or `src/features/menu/PaymentFirstCallbackLanding.jsx` was modified. No `git add`, `git commit`, or `git push` was performed.

---

# BLOCKERS

None.

---

# RISKS

- **Not deployed anywhere** (staging or production) — this task's own explicit instruction ("Do NOT deploy staging until implementation tests pass" — tests now pass, but deployment itself was not authorized by this task and was not performed). The function exists only as local, tested source code.
- **Unwired** — `PaymentFirstCallbackLanding` does not call this endpoint yet; the payment-first flow's order-creation step remains non-functional end-to-end until a future, separate task wires it in, exactly as intended by this task's scope.
- **Tenant-resolver duplication** (documented above under `TENANT_VALIDATION`) — `resolveQrTenant`/`resolveSlugTenant` now exist in two places (`payment-first-checkout/handler.js` and this new `handler.js`) with intentionally near-identical query logic. This was a deliberate scope choice (avoid touching the sibling function's file), not an oversight — flagged here for owner awareness in case a future shared-helper refactor is ever wanted (not proposed or actioned here, per the "no unrequested refactors" project rule).
- **`rejected` reason generalization to `internal_error`** (snapshot/integrity violations, `create_order_failed`) means a legitimate, recoverable `create_order_failed` (e.g., a transient DB hiccup) currently surfaces identically to a genuine tampering signal — both as an opaque 500 to the client. This was an explicit, approved contract choice (no dedicated category exists for these in the approved response contract) and is not a defect, but worth the owner's awareness if client-side retry behavior for `create_order_failed` specifically is ever desired later.

---

# DEFERRED_WORK (explicitly out of this task's scope, per its own instructions)

- Wiring `create-order-from-payment` into `PaymentFirstCallbackLanding`'s success-detection point.
- Order-confirmation UI.
- Staging or production deployment.
- 3.6D.7 and 3.6E.
- Rate limiting (documented requirement only, per the approved spec — not blocking, per this task's own explicit instruction).
- Any refactor of the duplicated tenant-resolution helpers between the two Edge Functions.

---

# EXACT_NEXT_STEP

Per this task's own explicit "STOP after this implementation task": no further action is taken. The logical next task (not started, not implied as approved) would be wiring `create-order-from-payment` into `PaymentFirstCallbackLanding`'s existing success-detection point — but that requires its own new, explicit owner instruction, exactly as this task required one before it began.
