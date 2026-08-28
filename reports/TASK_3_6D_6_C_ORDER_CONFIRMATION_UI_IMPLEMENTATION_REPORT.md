# Task 3.6D.6-C — Payment-First Order Confirmation Report

**Implementation task. `createOrderFromSuccessfulPayment`, `create-order-from-payment`, the payment-status RPC, `payment-webhook`, and the database schema are all unmodified. No new order API, no new payment flow, no new Edge Function. No deployment. No commit/push/merge. No 3.6D.7/3.6E work started.**

---

# EXECUTIVE_SUMMARY

`TASK-PAY-3.6D.6-B` already wired `PaymentFirstCallbackLanding`'s verified `succeeded` status to `create-order-from-payment`, and its `PaymentFirstOrderCreation.jsx` already had an `ORDER_CREATED` render branch. Auditing that branch against this task's requirement — **the customer must actually see and understand the confirmation** — surfaced a real, previously-undetected UX defect: `PublicMenu.jsx`'s `handlePaymentFirstOrderCreated` called `navigate(..., {replace: true})` **synchronously, in the same handler invocation** that the child component used to reach the `order_created` phase. Because React 18 batches this and React Router's own state update happens before the browser gets a chance to paint, the confirmation card **never actually became visible** — the customer would go straight from "confirming your order…" to `OrdersScreen` with no confirmation moment in between, even though the code technically "showed" the state for one (unpainted) render.

This task fixes that by **splitting registration from navigation**: `onOrderCreated` now only registers the order into the existing `activeOrders` tracking (safe, idempotent, immediate — so the order isn't lost even if the customer closes the tab) — it **no longer navigates**. A **new, separate `onViewOrder` callback**, wired to an explicit "عرض طلبي" (View my order) button on the confirmation card, is the only thing that now performs the navigation into `OrdersScreen`. The confirmation card itself was also enriched with the order number (explicit "رقم الطلب:" label), the restaurant name (optional, from existing `restaurant.name`), table/delivery context (optional, display-only), and next-step guidance text — matching every element this task's UI requirements list.

**No new component or API was created.** `PaymentFirstOrderCreation.jsx` (from `TASK-PAY-3.6D.6-B`) is the "smallest necessary adapter" already required by this task's own framing, and `OrdersScreen` (unmodified) remains the actual order-confirmation mechanism — this task only makes the existing adapter's success screen real and its handoff explicit.

**Result**: 1054/1054 tests passing (1045 baseline + 9 net new, zero failures, zero weakened assertions).

---

# EXACT_INTEGRATION_POINT

Unchanged from `TASK-PAY-3.6D.6-B` — `PublicMenu.jsx`'s `paymentCallbackActive` gate still renders `PaymentFirstOrderCreation`. What changed is **what happens after `order_created`**:

```
PaymentFirstOrderCreation (phase: order_created)
  │  renders the confirmation card immediately — NOT swapped away automatically
  │  calls onOrderCreated(enriched) once, immediately (registers the order, no navigation)
  │
  │  customer sees: "تم تأكيد طلبك" / restaurant name / "رقم الطلب: #123" / table or
  │  delivery context / next-step guidance / an "عرض طلبي" button
  │
  │  customer clicks "عرض طلبي" ──▶ onViewOrder(orderResult)
  ▼
PublicMenu.jsx: handleViewPaymentFirstOrder()
  - removes only `payment_callback` from the URL (branch/table preserved), navigate(replace: true)
  ▼
paymentCallbackActive becomes false ⇒ falls through to the existing
orderPlaced && ordering gate ⇒ OrdersScreen (unmodified, already showing the registered order)
```

---

# STATE_FLOW

The `OrderCreationPhase` enum from `TASK-PAY-3.6D.6-B` is unchanged (`verifying_payment` → `creating_order` → `order_created` / `order_creation_failed` / `retryable_error` / `requires_reconciliation`). What changed is **what phase `order_created` renders and when the customer leaves it**:

| Before (3.6D.6-B) | After (3.6D.6-C) |
|---|---|
| `onOrderCreated` fired → parent immediately registered the order **and** navigated away in the same call | `onOrderCreated` fires → parent **only** registers the order (`setActiveOrders`/`setOrderPlaced`) |
| Confirmation card technically existed but was never actually painted before the route changed | Confirmation card is the last thing rendered by `PaymentFirstOrderCreation` and **stays visible** until the customer acts |
| No explicit customer action | A new `onViewOrder` prop, wired to a visible "عرض طلبي" button, is the **only** thing that triggers the transition into `OrdersScreen` |

"Never show 'Order confirmed' merely because payment succeeded" remains structurally guaranteed exactly as in `3.6D.6-B`: the `order_created` phase is only ever reached from `create-order-from-payment`'s own `succeeded` response (real `orderId`/`orderNumber`/`accessToken`), never from `PaymentFirstCallbackLanding`'s payment-only `SUCCEEDED` state — unchanged, re-verified by the existing regression suite for that guarantee.

---

# REQUEST_RESPONSE_FLOW

Unchanged from `TASK-PAY-3.6D.6-B` — this task did not touch `buildOrderCreationRequest`, `paymentOrderCreationApi.js`, or any part of the actual `create-order-from-payment` call. The only change relevant to the response is that the **enriched** response object (already built in `3.6D.6-B` — `{...response, tableNumber, deliveryAddress}`) is now also kept in component state (`orderResult`) and used for **display** in the confirmation card, in addition to being passed to `onOrderCreated`. `idempotent: true` and `idempotent: false` produce byte-identical rendering — both are "your order is confirmed," per this task's explicit instruction that `idempotent: true` is equally a valid final success.

---

# QR_BEHAVIOR

Unchanged. `tableQrToken` resolution and the rule that `tableNumber` is never read from `localStorage` for a QR request remain exactly as built in `3.6D.6-B`. The confirmation card now optionally shows the table context (`orderResult.tableNumber`) as **display-only** text when present — for a QR order, this value comes from the Edge Function's own server-side resolution (surfaced back into the enriched object only for display, never re-sent anywhere) rather than from `localStorage`, consistent with the existing rule.

---

# NON_QR_BEHAVIOR

Unchanged. `restaurant_slug`-based tenant resolution and the rule that no `branch_id` is ever sent remain exactly as built in `3.6D.6-B`.

---

# CUSTOMER_DATA_HANDLING

Unchanged — still read once via the existing `readPaymentCustomerData(resumedKey)` inside `runCreateOrder`, still never trusted as authorization. The only new use of this data is **cosmetic**: the already-read `customerData.tableNumber`/`deliveryAddress` (already captured into the enriched response object in `3.6D.6-B`) are now actually rendered on the confirmation card instead of only being passed silently to `onOrderCreated`.

---

# IDEMPOTENCY

Unchanged mechanism; **clarified in the UI**: both `idempotent: true` (a re-verified/race-recovered existing order) and `idempotent: false` (a first-time creation) render the identical confirmation card — order number, restaurant name, guidance, "View my order" button — with no visual distinction, matching this task's explicit instruction that both are "a successful final result." Verified by a dedicated test asserting the full card (including the button, wired with the correct `orderId`) renders identically for an `idempotent: true` response.

---

# ERROR_RETRY_BEHAVIOR

Unchanged from `3.6D.6-B` — `retryable_error` still retries with the exact same resumed payment idempotency key (never a new one, never a new payment); `requires_reconciliation`/`order_creation_failed` still show only generic, safe messages. This task did not alter any of that logic, only the `order_created` success path.

---

# CLEANUP

Unchanged in **timing** (still happens only inside the `succeeded` branch, after the response is received, before anything is shown to the customer) and in **what** is cleared (`simsim_payfirst_customer_${resumedKey}` and `simsim_payidem_${slug}_${branchId}`, exactly as in `3.6D.6-B`). This task did not move cleanup to depend on the customer clicking "View my order" — cleanup is about the *payment attempt* being resolved (which it is, the instant `succeeded` is received), not about the *UI transition* the customer chooses to make afterward. The existing `3.6D.6-B` tests proving cleanup timing (not premature, preserved on failure) were re-verified unchanged and still pass.

---

# SECURITY

No change to the security posture established in `3.6D.6-B`. Newly re-confirmed by a dedicated test in this task: even if a (mocked) `create-order-from-payment` response were to carry `providerRef`/`paymentTransactionId` (which the real, unmodified Edge Function never does), the confirmation card's rendered text never contains them — the card only ever reads `orderResult.orderNumber`/`.tableNumber`/`.deliveryAddress` by name, never spreads or dumps the raw response object into the DOM.

---

# UX

Directly addresses every requirement in this task's own list:
1. **Payment succeeded** — implicit; the customer never reaches this screen otherwise.
2. **The order was actually created** — "تم تأكيد طلبك" only ever renders after a real `succeeded` response with a real `orderId`.
3. **The order number is available** — "رقم الطلب: #{orderNumber}", explicitly labeled.
4. **What to do next** — a fixed guidance line ("يمكنك متابعة حالة طلبك من صفحة طلباتي") plus the "عرض طلبي" button as the obvious next action.

Optional elements implemented: restaurant name (`restaurant.name`, already used elsewhere in the app, e.g. `MenuHeader.jsx`) and table/delivery-address context. No sensitive payment or provider information is ever displayed — the card's data source is limited to `orderId`/`orderNumber`/`accessToken`/`idempotent` plus the two display-only fields already carried over from `3.6D.6-B`.

---

# TESTS

**9 net new tests** (6 added, 2 replaced with corrected assertions, 2 removed as no-longer-applicable) across the two files already established in `3.6D.6-B`:

**`tests/unit/PaymentFirstOrderCreation.test.jsx`** — new `describe('PaymentFirstOrderCreation — final order confirmation (TASK-PAY-3.6D.6-C)')` block (6 tests):
- order number label + restaurant name + next-step guidance all render together.
- confirmation renders correctly with no `restaurantName` supplied (optional field).
- table context renders for a non-QR dine-in order's persisted table number.
- **the confirmation card actually stays in the DOM** after settling — `onOrderCreated` fires but `onViewOrder` does not, until the customer explicitly clicks "عرض طلبي" (this is the test that would have failed against the pre-3.6D.6-C behavior, since the old code had no `onViewOrder` separation to click at all).
- `idempotent: true` renders the identical full card, including a working "View my order" button.
- the confirmation UI never appears while the create-order-from-payment call is still pending (still shows "جاري تأكيد طلبك...").
- `providerRef`/`paymentTransactionId`, even if present on a (mocked) response, never appear in the card's rendered text.

Existing `pfOrderCreatedTitle` text updated from "تم تأكيد طلبك بنجاح" to the exact phrase requested in this task, "تم تأكيد طلبك" — all 6 pre-existing `3.6D.6-B` assertions referencing that string were updated to match (not weakened — same assertions, corrected literal text), and all still pass.

**`tests/unit/PublicMenuOrderCreationWiring.test.jsx`** — updated for the new two-callback split:
- new test: `onOrderCreated` alone never triggers navigation (replaces the old, now-incorrect assumption that it did).
- two existing navigation tests (non-QR and QR URL-cleanup) updated to trigger via the new `onViewOrder` simulated button instead of `onOrderCreated`'s.
- new test: `restaurant?.name` is correctly threaded through as the `restaurantName` prop.

**Existing test files re-verified unmodified and passing**: `PaymentFirstCallbackLanding.test.jsx`, `PublicMenuCallbackIntegration.test.jsx`, `paymentOrderCreationApi.test.js` — none needed changes for this task.

---

# REGRESSION_RESULTS

```
Test Files  57 passed (57)
     Tests  1054 passed (1054)
```

Baseline before this task: **1045/1045**. Net new: **9**. Total: **1054/1054**, zero failures, zero skipped. (One transient run hit the known, pre-existing, unrelated vitest tooling flake — `Projects "" and "" have different 'maxWorkers'...` — resolved by an immediate identical retry, as has been the established, documented pattern throughout this session; not a real failure.)

---

# FILES_MODIFIED

| File | Change |
|---|---|
| `src/features/menu/PaymentFirstOrderCreation.jsx` | `order_created` branch enriched (restaurant name, order-number label, table/delivery context, next-step guidance, "View my order" button calling a new `onViewOrder` prop); `onOrderCreated` still fires immediately for registration, no longer implicitly relies on the caller navigating away in the same tick. |
| `src/pages/PublicMenu.jsx` | `handlePaymentFirstOrderCreated` no longer navigates — it only registers the order. New `handleViewPaymentFirstOrder` function (URL cleanup + navigate) wired to the new `onViewOrder` prop. `restaurant?.name` now passed as `restaurantName`. |
| `src/features/menu/i18n.js` | `pfOrderCreatedTitle` text changed to the exact requested phrase ("تم تأكيد طلبك"); 4 new keys added (`pfOrderNumberPrefix`, `pfOrderTableContextPrefix`, `pfOrderNextStepGuidance`, `pfOrderViewAction`) — additive except for the one intentional text change. |
| `tests/unit/PaymentFirstOrderCreation.test.jsx` | New confirmation-UI test block; existing text-matching assertions updated to the new phrase; `t` mock and `renderWrapper` extended with the new keys/props. |
| `tests/unit/PublicMenuOrderCreationWiring.test.jsx` | Stub component split into two buttons (`onOrderCreated`/`onViewOrder`); navigation tests re-targeted to the new button; new no-navigation-on-registration and `restaurantName`-threading tests added. |

**Not modified**: `src/features/menu/PaymentFirstCallbackLanding.jsx`, `src/payments/services/checkoutOrchestration.js`, `supabase/functions/create-order-from-payment/*`, `supabase/functions/payment-webhook/*`, `sql/payment_status_reads.sql`, any `sql/*.sql` file, `src/features/menu/paymentOrderCreationApi.js`, `src/features/menu/OrdersScreen.jsx`, `src/features/menu/hooks/useActiveOrders.js`.

---

# GIT_STATUS

`git diff --stat` shows the same two tracked files as `3.6D.6-B` (`src/pages/PublicMenu.jsx`, `src/features/menu/i18n.js`) with further changes on top, plus the pre-existing modified-file baseline from earlier phases of this session (unchanged). No new untracked files were created this task — all changes landed in the five files `3.6D.6-B` already created/modified. No file under `supabase/functions/`, `sql/`, or `src/payments/` was touched. No `git add`, `git commit`, or `git push` was performed.

---

# DEPLOYMENT_STATUS

**Not deployed.** Client-side application code only — no Edge Function or schema change in this task. `create-order-from-payment` itself remains undeployed (unchanged from `3.6D.6`/`3.6D.6-B`'s own reports).

---

# BLOCKERS

None.

---

# KNOWN_RISKS

- **No end-to-end (real browser, real deployment) verification of the confirmation card's visibility fix** — the defect this task fixes (card never actually painting) was identified through code reasoning about React 18 batching plus a targeted test that would have caught the old behavior; it was not independently reproduced in a real browser before the fix, since nothing in this arc has been deployed yet.
- **`OrdersScreen`'s own display of a freshly-registered payment-first order still depends on `reconcileActiveOrders()`'s pre-existing polling** (unchanged from `3.6D.6-B`) to backfill real `items`/`total`/`status` — for the first ~1.5 seconds after clicking "View my order," the order may show as a bare stub (`status: 'pending'`, no items) before that reconciliation call resolves. This is pre-existing behavior from `3.6D.6-B`, not newly introduced, and not addressed by this task's scope (which explicitly forbids redesigning `OrdersScreen`).

---

# DEFERRED_WORK

- Deploying `create-order-from-payment` and end-to-end verification of the full flow, including the fixed confirmation-card visibility, in a real browser.
- Any richer order-confirmation experience beyond reusing `OrdersScreen` (this task's own instruction: "Do NOT redesign the entire OrdersScreen").
- 3.6D.7 and 3.6E — not started, per this task's own explicit scope boundary.

---

# EXACT_NEXT_STEP

No further action taken, per standing practice in this arc (every implementation task in this session has stopped for explicit new instruction before proceeding). The logical next step — staging deployment and real end-to-end verification of checkout → Moyasar → callback → order creation → visible confirmation → `OrdersScreen` — requires its own explicit owner instruction, as this task did not authorize deployment.
