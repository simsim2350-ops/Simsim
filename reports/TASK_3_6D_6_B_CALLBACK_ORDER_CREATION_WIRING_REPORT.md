# Task 3.6D.6-B — Wire Payment-First Order Creation into Callback Report

**Implementation task. `PaymentFirstCallbackLanding.jsx`, `createOrderFromSuccessfulPayment`, `payment-webhook`, the payment-status RPC, `payment-first-checkout`, `buildReturnUrl`, and the database schema are all unmodified. No new Edge Function or RPC created. No deployment. No commit/push/merge.**

---

# EXECUTIVE_SUMMARY

Built a new wrapper component, `PaymentFirstOrderCreation`, that sits between `PublicMenu.jsx` and the existing, **unmodified** `PaymentFirstCallbackLanding`. It renders `PaymentFirstCallbackLanding` unchanged while payment status is being verified, and — **only** when that component's own `onSucceeded` callback fires (i.e., only after the existing, approved `get_payment_status_by_idempotency_key` RPC reports `status === 'succeeded'`) — takes over the screen and calls the existing, unmodified `create-order-from-payment` Edge Function (`TASK-PAY-3.6D.6`) exactly once, using the same resumed payment idempotency key. `PublicMenu.jsx` now renders this wrapper instead of `PaymentFirstCallbackLanding` directly, and on a confirmed `order_created` result, appends the order to the existing `activeOrders` mechanism (`useActiveOrders`) — the same one the cash-payment flow already uses — so the pre-existing `OrdersScreen` and its own status-reconciliation polling pick it up with no new order-tracking system.

**A key design choice, made to satisfy two requirements that would otherwise conflict** (see `UX` and `STATE_MACHINE` below): `PaymentFirstCallbackLanding.jsx` itself was **not modified at all** — its own `SUCCEEDED` render branch and its full existing test suite (`PaymentFirstCallbackLanding.test.jsx`, 20 tests) remain completely untouched and still pass unmodified. The "don't show payment-succeeded as a dead end" requirement is satisfied entirely by the **new wrapper component**, which stops rendering `PaymentFirstCallbackLanding` the instant `onSucceeded` fires and shows its own "confirming your order" UI instead — so in production the customer is carried straight through, while the isolated component tests for the untouched `PaymentFirstCallbackLanding` keep testing exactly what they always tested.

**Result**: 1045/1045 tests passing (1009 baseline + 36 new, zero failures, zero weakened or removed assertions).

---

# EXACT_INTEGRATION_POINT

```
PublicMenu.jsx  (paymentCallbackActive gate — same position as before, unmoved)
  │  BEFORE: <PaymentFirstCallbackLanding slug branchId ... />
  │  AFTER:  <PaymentFirstOrderCreation slug branchId tableQrToken={rawTableQrToken}
  │             onOrderCreated={handlePaymentFirstOrderCreated} ... />
  ▼
PaymentFirstOrderCreation.jsx  (NEW — src/features/menu/PaymentFirstOrderCreation.jsx)
  │  phase === VERIFYING_PAYMENT (initial):
  │    renders <PaymentFirstCallbackLanding onSucceeded={handlePaymentSucceeded} ... />
  │    (the real, unmodified component — same RPC-based verification as before)
  │
  │  onSucceeded fires (state===SUCCEEDED, unchanged internal logic) ──▶ runCreateOrder()
  │    reads simsim_payfirst_customer_${resumedKey} (existing helper, unmodified)
  │    builds a minimal request body (buildOrderCreationRequest, pure function)
  │    calls createOrderFromPayment(body) → supabase.functions.invoke('create-order-from-payment', ...)
  ▼
create-order-from-payment Edge Function (TASK-PAY-3.6D.6, unmodified)
  ▼
createOrderFromSuccessfulPayment (unmodified) → create_order (unmodified) → orders
  ▲
  │  response.status mapped to a phase; on 'succeeded' → onOrderCreated(response) called
  ▼
PublicMenu.jsx: handlePaymentFirstOrderCreated(response)
  - appends a stub entry to activeOrders (existing useActiveOrders mechanism, unmodified)
  - setOrderPlaced(true) — existing mechanism, unmodified
  - navigates to the same URL with only `payment_callback` removed (branch/table preserved)
  ▼
OrdersScreen (existing, unmodified) — shown via the pre-existing orderPlaced && ordering gate,
  its own pre-existing reconcileActiveOrders() polling backfills real items/total/status shortly after
```

---

# STATE_MACHINE

`PaymentFirstOrderCreation` exports `OrderCreationPhase`:

| Phase | Meaning | UI |
|---|---|---|
| `verifying_payment` | `PaymentFirstCallbackLanding` owns the screen entirely (its own internal states: `resolving`/`pending`/`succeeded`/`failed`/`unknown`/`retryable_error`/`missing_key` — all unchanged) | Delegated entirely to `PaymentFirstCallbackLanding` |
| `creating_order` | `create-order-from-payment` call in flight | "تم استلام الدفع، جاري تأكيد طلبك..." (the exact phrase requested), spinner |
| `order_created` | `succeeded` response received (first creation **or** idempotent replay — same UI either way) | "تم تأكيد طلبك بنجاح" + order number |
| `order_creation_failed` | `not_found` / `pending` (race) / `validation_error` / `internal_error` response | Generic, safe, actionable message + "back to menu" |
| `retryable_error` | `retryable_error` response, or the underlying call itself failing | Generic message + "retry order confirmation" button |
| `requires_reconciliation` | `requires_reconciliation` response | Neutral message — no success or failure claim |

This is the exact set of names required by the approval message, except `idle`/`payment_pending`/`payment_failed`/`unknown` were deliberately **not** duplicated as new states here — those remain `PaymentFirstCallbackLanding`'s own existing, already-tested internal states (`CallbackState.PENDING`/`FAILED`/`UNKNOWN`/`IDLE`), reused as-is rather than re-implemented, since the wrapper only takes over **after** verification succeeds.

---

# PAYMENT_VERIFICATION_SEQUENCE

Exactly the sequence required, with no shortcut:

1. **Callback detected** — `paymentCallbackActive` gate in `PublicMenu.jsx` (unchanged condition, unmoved).
2. **Resume the authoritative key** — `PaymentFirstCallbackLanding`'s own `useResumedPaymentIdempotencyKey` (unchanged) reads `simsim_payidem_${slug}_${branchId}` from `localStorage` — never generates a new one.
3. **Resolve status via the existing RPC** — `PaymentFirstCallbackLanding`'s own `resolveStatus()` (unchanged) calls `get_payment_status_by_idempotency_key` with the **resumed** key, never the raw URL parameter.
4. **Only on `state === SUCCEEDED`** does `onSucceeded` fire — this is `PaymentFirstCallbackLanding`'s own pre-existing, unmodified `useEffect`. `PaymentFirstOrderCreation`'s `handlePaymentSucceeded` is the **only** thing wired to it, and it is the **only** call site in the entire codebase that invokes `runCreateOrder`.
5. `runCreateOrder` calls `create-order-from-payment` **exactly once** per activation (`attemptingRef` guard — see `CONCURRENCY`).
6. Order created or resolved.
7. Result displayed, `onOrderCreated` fired into `PublicMenu.jsx`.
8. **No payment is ever started again** — confirmed structurally: `PaymentFirstOrderCreation.jsx` does not import `startCheckout`, `initiatePaymentFirstCheckout`, `checkoutOrchestration`, or anything Moyasar-related (verified by a source-purity test, matching the same pattern already used for `PaymentFirstCallbackLanding.jsx` itself).

A payment that never reaches `succeeded` (stays `pending`, resolves to `failed`, `unknown`, or a `retryable_error` from the status RPC itself) **never** triggers `runCreateOrder` — verified by dedicated tests (see `TESTS`, scenarios 2/3/18/19).

---

# CUSTOMER_DATA_FLOW

Read via the existing, unmodified `readPaymentCustomerData(resumedKey)` (`TASK-PAY-3.6D.5-A.1`) — no new storage format, no new key. `buildOrderCreationRequest` (a pure function, fully unit-tested in isolation) constructs the request body:

```
{
  paymentIdempotencyKey: resumedKey,
  customerPhone: customerData?.customerPhone,
  ...(customerData?.customerName && { customerName }),
  ...(customerData?.notes && { notes }),
  ...(customerData?.deliveryAddress && { deliveryAddress }),
  // exactly one of:
  ...(tableQrToken ? { table_qr_token: tableQrToken } : { restaurant_slug: slug, ...(customerData?.tableNumber && !isQr && { tableNumber }) }),
}
```

The record's contents are **never trusted as authorization** — they are forwarded as plain execution-only fields exactly as `create-order-from-payment`'s own approved contract expects; the Edge Function and `create_order` remain the sole validators. This matches the approved spec's `AUTHORITATIVE_VS_UNTRUSTED_DATA` classification and is unchanged by this task.

---

# QR_BEHAVIOR

`tableQrToken` is passed down from `PublicMenu.jsx` as `rawTableQrToken` — the **raw** `?table=` URL parameter, not the client-resolved `tableQr` state object. This is deliberate: the existing "QR-unavailable bypass during callback" (`TASK_3_6D_4_C.3`, unchanged) means `tableQr` can legitimately be `null` during a payment callback even for a valid token (client-side re-resolution isn't required to gate this flow); `create-order-from-payment` performs its **own independent** server-side QR resolution regardless of whether the client's own `resolve_table_qr` call succeeded.

When `tableQrToken` is present, `buildOrderCreationRequest` **never reads `customerData.tableNumber` at all** — the `tableNumber` key is structurally absent from the request body in that branch, regardless of what happens to be in `localStorage`. This was already true one layer up (`buildPaymentCustomerDataRecord` never stores `tableNumber` for QR dine-in in the first place, `TASK-PAY-3.6D.5-A.1`) — this task adds a **second, independent** enforcement of the same rule at the request-building layer, verified by a dedicated test that deliberately plants a forged `tableNumber` in a QR-context `customerData` object and asserts it never reaches the request body.

The QR-unavailable full-screen block (`rawTableQrToken && !tableQr && !paymentCallbackActive`) is **untouched** — its own bypass condition already excluded `paymentCallbackActive` before this task, and this task didn't need to touch it since `PaymentFirstOrderCreation` is only ever reached once that gate has already been passed.

---

# NON_QR_BEHAVIOR

`restaurant_slug` (the page's own `slug`) is sent — never a client-supplied `branch_id`. `branchId` is used **only** to resolve the local `simsim_payidem_${slug}_${branchId}` storage key (via the unchanged `useResumedPaymentIdempotencyKey`) — it is never read into the request body sent to `create-order-from-payment` (confirmed by a dedicated pure-function test: `body` never has a `branch_id`/`branchId` key, even when deliberately present in the fake `customerData` object passed to `buildOrderCreationRequest`). This matches the already-approved contract, which has no branch field at all — branch identity is derived exclusively from the server-side payment snapshot inside `createOrderFromSuccessfulPayment`, unchanged.

---

# ORDER_CREATION_REQUEST

Sent via `createOrderFromPayment` (new, `src/features/menu/paymentOrderCreationApi.js`) — a thin wrapper around `supabase.functions.invoke('create-order-from-payment', { body })`, mirroring the exact pattern already used by `createAdmin` in `src/admin/features/admins/adminsApi.js`. No transformation of the body — it is passed through exactly as built by `buildOrderCreationRequest`. Confirmed absent from every request, by dedicated tests, regardless of what a caller tries to smuggle into `customerData`: `paymentTransactionId`, `providerRef`, `amount`, `currency`, `items`, `branch_id`/`branchId`. `restaurant_id` was never a field this layer could produce in the first place (only `restaurant_slug`).

---

# RESPONSE_HANDLING

`createOrderFromPayment` normalizes `supabase.functions.invoke`'s `{data, error}` shape into a single `{status, ...}` object, matching `create-order-from-payment`'s own response contract exactly:
- 200 responses → `data` returned as-is (`succeeded`/`pending`/`not_found`/`retryable_error`/`requires_reconciliation`).
- 400 (`validation_error`) → the body is read via `error.context.json()` and its `status` extracted, so the client can show a `validation_error`-specific message rather than a generic one.
- 500 or any other/unreadable error → generalized `{status: 'internal_error'}`, **never** the raw exception or Postgres message (tested explicitly — a `postgres://secret-leak`-style message is confirmed to never appear in the returned object).

`PaymentFirstOrderCreation.runCreateOrder` then maps this to one of the six `OrderCreationPhase` values (see `STATE_MACHINE`).

---

# IDEMPOTENCY_BEHAVIOR

- **First call**: `succeeded`, `idempotent: false` → `order_created`, order stub added, cleanup runs.
- **Second/duplicate call with the same key** (double `onSucceeded`, double callback, a second tab): `create-order-from-payment` → `createOrderFromSuccessfulPayment`'s own pre-existing idempotency (app-level pre-check + DB unique index, both unchanged) returns the same order with `idempotent: true`. The wrapper treats this **identically** to a first-time success — same phase, same UI, same `onOrderCreated` call. No client-side distinction is made or needed (per the approval's explicit instruction: "The browser must treat `idempotent: true` as an already-successful order").
- **`attemptingRef`** is a **local, single-mount, best-effort debounce only** — it prevents this one component instance from firing two overlapping requests if `onSucceeded` somehow fires twice in the same mount. It is explicitly **not** the source of truth for cross-tab or cross-request idempotency — that remains entirely the DB unique index (`orders_payment_transaction_id_uidx`, unchanged), exactly as instructed ("DO NOT add client-side locks as the source of truth").
- `PublicMenu.jsx`'s own `handlePaymentFirstOrderCreated` additionally guards against a duplicate `activeOrders` entry for the same `orderId` (`prev.some(o => o.id === response.orderId)`) — a display-list deduplication, not a payment/order-creation safety mechanism.

---

# REFRESH_BEHAVIOR

On confirmed `order_created`, **both** of the following are cleared (see `CLEANUP`): the resumed payment-idempotency key (`simsim_payidem_${slug}_${branchId}`) and the customer-data record (`simsim_payfirst_customer_${resumedKey}`). This was a deliberate design choice to make a **later** revisit of the same stale `?payment_callback=...` URL completely safe: with the idempotency key gone, `useResumedPaymentIdempotencyKey` returns `null` and `PaymentFirstCallbackLanding` shows its own pre-existing, already-tested `MISSING_KEY` state — **no RPC call, no order-creation attempt at all**, not even an idempotent one. This avoids a subtler alternative bug that was identified and rejected during design: clearing only the customer-data record (but not the idempotency key) would have left a revisit hitting `create-order-from-payment` with a missing `customerPhone` (since the customer-data record is now gone), which would incorrectly surface as `order_creation_failed` for an order that had, in fact, already succeeded. Clearing both together avoids this failure mode entirely.

A refresh **while still in `creating_order`** (before any response arrives) causes a full remount: `phase` resets to `verifying_payment`, `PaymentFirstCallbackLanding` re-verifies (still `succeeded`, since payment status itself was never touched), `onSucceeded` fires again, `runCreateOrder` runs again with the same key — safe, because `createOrderFromSuccessfulPayment`'s own idempotency handles a genuinely-concurrent or repeated call correctly regardless of the browser's own in-flight state (verified conceptually by the same idempotency guarantees audited in `TASK_3_6D_6_A`/`3.6D.6`, not re-proven here since that logic is unmodified).

---

# ERROR_HANDLING

| Underlying status | Phase | Behavior |
|---|---|---|
| Payment `pending` (from the status RPC, unrelated to order creation) | *(stays in `verifying_payment`)* | `PaymentFirstCallbackLanding`'s own existing bounded polling — unmodified, untouched. |
| Payment `failed` | *(stays in `verifying_payment`)* | `PaymentFirstCallbackLanding`'s own existing safe failure UI — unmodified. |
| Payment `unknown` | *(stays in `verifying_payment`)* | `PaymentFirstCallbackLanding`'s own existing safe-recovery UI — unmodified. |
| Order-creation `retryable_error` | `retryable_error` | A "retry order confirmation" button calls `runCreateOrder()` again with the **same** resumed key — never regenerates one, never starts a payment. |
| Order-creation `requires_reconciliation` | `requires_reconciliation` | Neutral message only — never claims success, never claims failure. |
| Order-creation `validation_error` | `order_creation_failed` | Generic, customer-actionable message ("contact the restaurant") — no server internals exposed. |
| Order-creation `internal_error` (or the network call itself throwing) | `order_creation_failed` | Same generic message; customer-data record explicitly **preserved** (not cleared) for potential later recovery. |

No internal `reason` string, raw error message, or any field beyond the approved `create-order-from-payment` response contract is ever rendered.

---

# CLEANUP

Runs **only** inside the `succeeded` branch of `runCreateOrder`, **after** the response is received — never before, never speculatively, never during `creating_order`/`retryable_error`/`requires_reconciliation`/`order_creation_failed`:
```js
clearPaymentCustomerData(resumedKey)                                            // existing helper, unmodified
localStorage.removeItem(paymentIdempotencyStorageKey(slug, branchId))           // same convention as usePaymentIdempotencyKey.clearKey()
```
Verified by a dedicated test using the established `deferred()`-style pattern for this codebase (hold the mocked `createOrderFromPayment` promise pending, assert the customer-data record is still present in `localStorage` while awaiting, then resolve and assert it is cleared only afterward) — directly addressing the explicit instruction "do not clear data prematurely during pending/retryable states," and separately verified for both `validation_error`/`internal_error` outcomes (record confirmed still present afterward).

---

# SECURITY

- **No second payment attempt possible** — `PaymentFirstOrderCreation.jsx` imports nothing payment-initiation-related (source-purity test, mirroring `PaymentFirstCallbackLanding.test.jsx`'s own PFCL-09/PFCL-10 pattern).
- **No second idempotency key ever generated** — the file only imports the read-only `useResumedPaymentIdempotencyKey`, never the key-generating `usePaymentIdempotencyKey`, and never calls `crypto.randomUUID()` (source-purity test). Every `createOrderFromPayment` call across a retry sequence carries the identical `paymentIdempotencyKey` (verified directly in the retry test).
- **`paymentTransactionId`/`providerRef`/`amount`/`currency`/`items`/branch identifiers never appear in the request** — verified by dedicated pure-function tests (scenarios 9-13 in `TESTS`).
- **Order creation is gated exclusively on a server-verified `succeeded` status** — never on the mere presence of `payment_callback` in the URL (structurally guaranteed: `runCreateOrder` has exactly one call site, `PaymentFirstCallbackLanding`'s own `onSucceeded`, unmodified).
- **No client-side idempotency/locking is treated as authoritative** — `attemptingRef` is documented in-code as a same-mount debounce only; the DB unique index remains the real guarantee, unchanged from `TASK_3_6D_6_A`.
- **No raw server/database error text ever reaches the DOM** — verified in both `paymentOrderCreationApi.test.js` (a deliberately leak-shaped message is confirmed absent from the returned object) and `PaymentFirstOrderCreation.test.jsx` (the `internal_error`/`validation_error` UI branches only ever render the fixed, translated title/body strings).

---

# UX

On `succeeded`, the customer sees "تم استلام الدفع، جاري تأكيد طلبك..." (the exact phrase from the approval message) immediately, with no button to click — `runCreateOrder` starts automatically the instant `onSucceeded` fires. The customer is never shown a persistent "payment successful" screen as a dead end: **because `PaymentFirstOrderCreation` stops rendering `PaymentFirstCallbackLanding` the moment its phase leaves `verifying_payment`**, `PaymentFirstCallbackLanding`'s own internal `SUCCEEDED` branch (which still exists, unmodified, and is still fully tested in isolation) is not what the customer sees in the combined flow — the wrapper's own `creating_order` UI takes over in the same render pass that `onSucceeded` fires in. Once the order is confirmed, `PublicMenu.jsx` transitions straight into the existing `OrdersScreen` (via `setOrderPlaced(true)`) with no intermediate confirmation click required, matching the cash-payment flow's own existing UX pattern exactly.

---

# TESTS

**36 new tests**, all passing, across three new files:

1. **`tests/unit/PaymentFirstOrderCreation.test.jsx`** (23 tests) — `buildOrderCreationRequest` as a pure function (customer-data forwarding, QR/non-QR field selection, exclusion of every forbidden field) plus full integration tests rendering the real `PaymentFirstCallbackLanding` (via injected `db`) together with a mocked `createOrderFromPayment`, covering payment-succeeded-triggers-creation, payment-not-succeeded-never-triggers-creation, duplicate-callback debouncing, idempotent-response handling, storage cleanup timing (including the "preserved while pending" case via a held promise), retry-with-same-key, `requires_reconciliation`/`internal_error`/`validation_error` handling, and source-purity checks.
2. **`tests/unit/paymentOrderCreationApi.test.js`** (7 tests) — the `supabase.functions.invoke` wrapper: correct function name/body, success passthrough, `validation_error` extraction, `internal_error` generalization for both HTTP errors and thrown exceptions, and confirmed absence of raw error text.
3. **`tests/unit/PublicMenuOrderCreationWiring.test.jsx`** (6 tests) — `PublicMenu.jsx`'s own wiring: `tableQrToken` prop threading (QR present / non-QR absent), `activeOrders` stub-entry shape and de-duplication, `setOrderPlaced(true)`, and URL cleanup (`payment_callback` removed, `branch`/`table` preserved) via a `useNavigate` spy.

**Existing test files re-verified unmodified and still passing**: `tests/unit/PaymentFirstCallbackLanding.test.jsx` (20 tests, confirming `PaymentFirstCallbackLanding.jsx`'s own behavior is 100% unchanged) and `tests/unit/PublicMenuCallbackIntegration.test.jsx` (11 tests, confirming the gate's normal-menu/QR/multi-branch/takeover behavior — scenarios 24-27 from the approval's list — is unchanged, since these tests mock `PaymentFirstCallbackLanding` directly and it is reached identically through the new wrapper).

**Coverage against the 30 required scenarios**: 1-23 and 29-30 have dedicated new tests (see file descriptions above); 24-26 are covered by the pre-existing, re-verified `PublicMenuCallbackIntegration.test.jsx` (PMCB-08/09/10); 27 by PMCB-01; 28 (webhook race) is not independently re-tested at the client layer — it reduces entirely to "the wrapper treats `idempotent: true` as success," already covered by scenario 15's test, since a webhook-race-recovered response is indistinguishable from any other idempotent replay by the time it reaches the client.

---

# REGRESSION_RESULTS

```
Test Files  57 passed (57)
     Tests  1045 passed (1045)
```

Baseline before this task: **1009/1009**. New tests added: **36**. Total: **1045/1045**, zero failures, zero skipped, zero weakened or removed assertions anywhere in the existing suite (`PaymentFirstCallbackLanding.test.jsx` and `PublicMenuCallbackIntegration.test.jsx` re-run and confirmed byte-identical in behavior).

---

# FILES_MODIFIED

| File | Change |
|---|---|
| `src/pages/PublicMenu.jsx` | Import swapped from `PaymentFirstCallbackLanding` to the new `PaymentFirstOrderCreation`; the `paymentCallbackActive` gate now renders the wrapper (with a new `tableQrToken` prop and `onOrderCreated` handler) instead of the landing component directly; new `handlePaymentFirstOrderCreated` function added (appends to `activeOrders`, sets `orderPlaced`, cleans the URL). The gate's own position/condition and every other part of the file are unchanged. |
| `src/features/menu/i18n.js` | 9 new translation keys added (`pfOrderCreatingTitle`, `pfOrderCreatedTitle`, `pfOrderCreationFailedTitle`/`Body`, `pfOrderRetryableErrorTitle`, `pfOrderRetryAction`, `pfOrderRequiresReconciliationTitle`/`Body`) — additive only, no existing key touched. |

# FILES_CREATED

| File | Lines | Purpose |
|---|---|---|
| `src/features/menu/PaymentFirstOrderCreation.jsx` | 214 | The new wrapper component and its state machine, plus the pure `buildOrderCreationRequest` helper. |
| `src/features/menu/paymentOrderCreationApi.js` | 29 | Thin `supabase.functions.invoke('create-order-from-payment', ...)` wrapper. |
| `tests/unit/PaymentFirstOrderCreation.test.jsx` | 292 | 23 tests (see `TESTS`). |
| `tests/unit/paymentOrderCreationApi.test.js` | 68 | 7 tests (see `TESTS`). |
| `tests/unit/PublicMenuOrderCreationWiring.test.jsx` | 179 | 6 tests (see `TESTS`). |

**Not modified, confirmed by re-reading and by the unchanged existing test suites**: `src/features/menu/PaymentFirstCallbackLanding.jsx`, `src/payments/services/checkoutOrchestration.js` (`createOrderFromSuccessfulPayment`), `supabase/functions/payment-webhook/*`, `sql/payment_status_reads.sql`, `supabase/functions/payment-first-checkout/*` (including `buildReturnUrl`), any `sql/*.sql` file, `supabase/functions/create-order-from-payment/*`.

---

# GIT_STATUS

`git diff --stat` shows exactly two modified tracked files from this task (`src/pages/PublicMenu.jsx`, `src/features/menu/i18n.js`) on top of the same pre-existing modified-file baseline from earlier phases of this session; five new untracked files (the two source files and three test files above). No file under `supabase/functions/payment-webhook/`, `supabase/functions/payment-first-checkout/`, `supabase/functions/create-order-from-payment/`, `sql/`, or `src/payments/services/checkoutOrchestration.js` was touched. No `git add`, `git commit`, or `git push` was performed.

---

# DEPLOYMENT_STATUS

**Not deployed.** This is client-side application code (React component + a thin Edge Function caller) — there is nothing new to deploy to Supabase itself (the Edge Function it calls, `create-order-from-payment`, was already implemented but not deployed in `TASK-PAY-3.6D.6`, and remains not deployed). The frontend changes here have not been built/deployed to any hosting environment (Vercel or otherwise).

---

# BLOCKERS

None.

---

# KNOWN_RISKS

- **`create-order-from-payment` itself is still not deployed anywhere** (staging or production) — this wiring is code-complete and fully unit-tested against a mocked Edge Function, but has never been exercised against a real, deployed instance of it. End-to-end verification (real Supabase project, real deployed function, real Moyasar sandbox charge) has not been performed in this task and was not in its scope.
- **A very narrow revisit edge case remains**: if a customer bookmarks or otherwise re-visits the *exact* `payment_callback` URL **after** their idempotency key and customer-data record have already been cleared (post `order_created`) via some path other than the app's own redirect-away navigation (e.g., manually copying the URL before the in-app redirect fires, or a browser restoring an old tab state) — `PaymentFirstCallbackLanding` would show its pre-existing `MISSING_KEY` state (safe, no order-creation attempt, no error) rather than showing them their already-placed order. This is a strict improvement over the alternative design considered and rejected during this task (see `REFRESH_BEHAVIOR`), and is a pre-existing characteristic of `MISSING_KEY`'s own design from `TASK_3_6D_4`, not a new gap introduced here.
- **Display metadata (`tableNumber`/`orderType`) for a payment-first order in `OrdersScreen` is best-effort, not authoritative** — reconstructed client-side from `tableQr`/the customer-data record purely for display, since `create-order-from-payment`'s approved response contract deliberately does not return snapshot fields. `items`/`total`/real `status` are backfilled correctly within seconds by the pre-existing `reconcileActiveOrders()` polling (unmodified), but `orderType`/`tableNumber ` are not corrected by that mechanism if the initial best-effort guess is wrong — a purely cosmetic risk, not a correctness or security one.

---

# DEFERRED_WORK

- Deploying `create-order-from-payment` (staging first, per the established convention from prior payment-first tasks) and end-to-end verification against a real deployment.
- Final, richer order-confirmation UI beyond the existing `OrdersScreen` (this task explicitly reused the existing mechanism rather than building a new one, per its own instruction).
- 3.6D.6-C and any further phases — not started, per this task's own explicit "STOP after this task."
- The narrow stale-URL revisit edge case noted in `KNOWN_RISKS` — no action needed unless the owner decides it warrants further hardening.

---

# EXACT_NEXT_STEP

Per this task's own explicit instruction, no further action is taken. The logical next step (not started, not implied as approved) would be staging deployment and end-to-end verification of the full payment-first flow (checkout → Moyasar → callback → order creation → `OrdersScreen`) — but that requires its own new, explicit owner instruction, exactly as every deployment step in this arc has required one before proceeding.
