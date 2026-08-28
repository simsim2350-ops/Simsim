# Task 3.6D.10 — Payment-First Checkout UI Integration Report

**Implementation task, closing the material gap identified in `TASK_3_6D_9`: `PaymentFirstCheckoutPanel` now has a real, live render path from the actual customer-facing cart. `payment-webhook`, the payment-status RPC, `createOrderFromSuccessfulPayment`, `create-order-from-payment`, the callback flow, order confirmation, database schema, and Moyasar server logic are all unmodified. No commit/push/merge/deploy.**

---

# EXECUTIVE_SUMMARY

Before this task, `PaymentFirstCheckoutPanel` (the UI that starts a payment-first checkout) was fully built and tested but rendered from nowhere in the live application — confirmed as the single most consequential finding of `TASK_3_6D_9`. This task closes that gap by determining, from the *existing* checkout architecture (`useCheckout.js` owns all order-form state; `CartDrawer.jsx` is the presentational component that renders that form and its confirm button; `PublicMenu.jsx` wires the two together), the correct integration point — and wiring it there, reusing every existing payment-first component and hook exactly as `TASK_3_6D_9` recommended, with zero modification to any of them.

The customer now sees a payment-method toggle ("نقداً/عند الاستلام" / "الدفع الإلكتروني") inside the real cart drawer. Selecting "card" and pressing the same confirm button freezes a snapshot of the current cart/form state and replaces the confirm button with `PaymentFirstCheckoutPanel` — which then runs its own already-built, already-tested flow (price check → price confirmation if needed → Moyasar redirect) unchanged. A new, small wrapper (`PaymentFirstCheckoutEntry`) handles what happens after the panel's own scope ends (redirect, failure, reconciliation), mirroring the exact pattern already established for the callback side (`PaymentFirstOrderCreation` wrapping `PaymentFirstCallbackLanding`). A new browser-side API wrapper (`paymentFirstCheckoutApi.js`) calls the already-deployed `payment-first-checkout` Edge Function via `supabase.functions.invoke`, mirroring `paymentOrderCreationApi.js` exactly — no second payment-first implementation was created anywhere.

**Result**: 1100/1100 tests passing (1054 baseline + 46 new, zero failures, zero weakened assertions). Cash checkout, QR ordering, multi-branch behavior, delivery, and takeaway are all confirmed unchanged by dedicated tests.

---

# EXACT_INTEGRATION_POINT

Determined by reading the existing architecture first, per instruction, rather than assuming:

```
useCheckout.js  (owns ALL order-form state: tableNumber, orderType, deliveryAddress,
                  customerName, customerPhone, orderNote — already existed, unmodified for
                  the cash path)
  │  NEW, additive only: paymentMethod/setPaymentMethod, paymentFirstCheckoutInput,
  │  startPaymentFirstCheckout(), cancelPaymentFirstCheckout()
  ▼
PublicMenu.jsx  (already destructures useCheckout()'s return and passes it to CartDrawer —
                  the new fields are added to that same existing destructure/prop-pass, no new
                  wiring pattern invented)
  ▼
CartDrawer.jsx  (already renders the order-form fields + the single confirm button — the
                  correct, existing place for a payment-method choice to live)
  │  NEW: a payment-method toggle; the confirm button's onClick now branches on paymentMethod
  │  (cash → placeOrder, unchanged; card → startPaymentFirstCheckout, new); once
  │  paymentFirstCheckoutInput is set, the confirm-button area is replaced entirely by:
  ▼
PaymentFirstCheckoutEntry.jsx  (NEW — thin wrapper, mirrors PaymentFirstOrderCreation's own
                  architecture exactly)
  ▼
PaymentFirstCheckoutPanel.jsx  (TASK-PAY-3.6D.3, UNMODIFIED) → PaymentFirstPriceConfirmation.jsx
  (UNMODIFIED) → usePaymentFirstCheckout.js (UNMODIFIED) → paymentFirstCheckoutApi.js (NEW,
  thin HTTP wrapper) → payment-first-checkout Edge Function (already deployed, UNMODIFIED)
  → Moyasar redirect URL → PaymentFirstCheckoutEntry navigates → existing
  PaymentFirstCallbackLanding flow (UNMODIFIED) takes over on return
```

`CartDrawer` was confirmed correct only after reading `useCheckout.js` (confirmed it already owns every field a `checkoutInput` needs) and `CartDrawer.jsx` (confirmed it already renders exactly one confirm button and one order-form, the natural place for a payment-method choice), per the task's own explicit instruction not to assume this without first understanding the architecture.

---

# FILES_CHANGED

| File | Change |
|---|---|
| `src/features/menu/hooks/useCheckout.js` | **Additive only.** New state (`paymentMethod`, `paymentFirstCheckoutInput`) and two new functions (`startPaymentFirstCheckout` — same defensive validation as `placeOrder`, builds a frozen snapshot instead of calling `create_order`; `cancelPaymentFirstCheckout`). Zero existing line changed. |
| `src/features/menu/CartDrawer.jsx` | New payment-method toggle section; confirm button's `onClick` branches on `paymentMethod`; when `paymentFirstCheckoutInput` is set, the confirm-button area is replaced by `PaymentFirstCheckoutEntry`. All new props have safe defaults (`paymentMethod='cash'`, `paymentFirstCheckoutInput=null`) so any caller unaware of them behaves exactly as before. |
| `src/pages/PublicMenu.jsx` | Destructures the 5 new `useCheckout()` return values (already-existing destructure statement, just extended) and passes them to `<CartDrawer>` (already-existing prop list, just extended) plus new `slug`/`branchId` props. |
| `src/features/menu/i18n.js` | 4 new translation keys, additive only. |
| `tests/unit/CartDrawer.test.jsx` | 11 new tests appended; 0 existing tests modified. |

**New files**: `src/features/menu/PaymentFirstCheckoutEntry.jsx`, `src/features/menu/paymentFirstCheckoutApi.js`, `tests/unit/PaymentFirstCheckoutEntry.test.jsx`, `tests/unit/paymentFirstCheckoutApi.test.js`, `tests/unit/useCheckoutPaymentFirst.test.js`, `tests/unit/PublicMenuPaymentFirstCheckoutWiring.test.jsx`.

**Confirmed unmodified** (re-checked via checksum-equivalent re-read before and after): `PaymentFirstCheckoutPanel.jsx`, `PaymentFirstPriceConfirmation.jsx`, `usePaymentFirstCheckout.js`, `usePaymentIdempotencyKey.js`, `paymentCustomerDataHelpers.js`, `checkoutOrchestration.js`, `checkoutBinding.js`, `payment-first-checkout` Edge Function, `payment-webhook`, `create-order-from-payment`, the payment-status RPC, database schema.

---

# BEFORE_AFTER_FLOW

**Before**: Cart → confirm button → `placeOrder()` → `create_order` RPC directly. No payment-first entry point existed anywhere reachable.

**After**: Cart → payment-method toggle (default "cash", unchanged behavior) → if "card" selected → confirm button → `startPaymentFirstCheckout()` (validates, freezes snapshot) → `PaymentFirstCheckoutEntry` renders `PaymentFirstCheckoutPanel` (unmodified) → price check → price confirmation if needed (unmodified `PaymentFirstPriceConfirmation`) → `usePaymentFirstCheckout` (unmodified) calls the new `paymentFirstCheckoutApi.js` wrapper → real `payment-first-checkout` Edge Function (already deployed, unmodified) → on success, `PaymentFirstCheckoutEntry` navigates to the Moyasar `redirectUrl` → existing, unmodified `PaymentFirstCallbackLanding`/`PaymentFirstOrderCreation` flow (built in `TASK_3_6D.4`-`3.6D.6-C`) takes over unchanged on return.

Cash: **Before = After, byte-identical code path** (`placeOrder()` untouched).

---

# UI_BEHAVIOR

A new toggle (`role`-consistent buttons, matching the existing order-type button styling exactly) appears in the cart drawer, above the financial summary, labeled "طريقة الدفع" with two options: "نقداً/عند الاستلام" (default, selected) and "الدفع الإلكتروني". Selecting "card" does not immediately do anything by itself — the customer still fills in the same order-type/customer-info/table-or-address fields as before, then presses the same, single "تأكيد الطلب" button. At that point the toggle disappears (payment-first mode is now active) and the entire confirm-button area is replaced by the payment-first flow's own UI (price check → optional price confirmation → "جارٍ إعداد الدفع…" → "جارٍ تحويلك لصفحة الدفع..."). Cancelling at any point before the actual charge attempt returns cleanly to the normal cart view (toggle and confirm button reappear, `paymentMethod` unchanged so the customer doesn't have to reselect it).

---

# STATE_MANAGEMENT

`PaymentFirstCheckoutEntry` introduces the requested state machine on top of the existing, unmodified `PaymentFirstCheckoutPanel`/`usePaymentFirstCheckout` internal states:

| Requested state | Where it lives |
|---|---|
| `idle` | `paymentMethod==='cash'`, or `paymentMethod==='card'` but `paymentFirstCheckoutInput===null` (toggle shown, button not yet pressed). |
| `checking` | `PaymentFirstCheckoutPanel`'s own `STARTING` (pre-confirm) — unmodified, renders `PaymentFirstPriceConfirmation`'s "جارٍ التحقق من السعر…" branch. |
| `price_confirmation` | `PaymentFirstCheckoutPanel`'s own `PRICE_CHANGED` — unmodified. |
| `creating_payment` | `PaymentFirstCheckoutPanel`'s own `STARTING` (post-confirm, `hasConfirmedOnce`) — unmodified, renders its existing "جارٍ إعداد الدفع…" branch. |
| `redirecting` | New — `PaymentFirstCheckoutEntry`'s `EntryPhase.REDIRECTING`, reached only via the panel's `onOutcome(REDIRECT_REQUIRED, ...)`. |
| `error` | New — `PaymentFirstCheckoutEntry`'s `EntryPhase.ERROR` (`FAILED`/`RETRYABLE_ERROR`) and a separate `EntryPhase.RECONCILIATION` (`REQUIRES_RECONCILIATION`, deliberately no retry affordance — mirrors `PaymentFirstOrderCreation`'s own established precedent for this exact state, since retrying a genuinely ambiguous payment outcome would be unsafe). |

**Double-submit prevention**: structural, not a flag check — once `paymentFirstCheckoutInput` is set, `CartDrawer` no longer renders the confirm button *at all* (replaced entirely by the entry component), so there is no button left to double-click. `PaymentFirstCheckoutPanel`'s own pre-existing `startedRef` guard additionally prevents its internal auto-start effect from re-firing. `PaymentFirstCheckoutEntry`'s own `redirectedRef` additionally guards against calling `navigateToPayment` more than once even if `onOutcome` were somehow invoked again for the same terminal state.

---

# PAYMENT_INITIATION

`startPaymentFirstCheckout()` (new, in `useCheckout.js`) runs the exact same defensive checks `placeOrder()` already runs (empty cart, branch-closed, table/address/phone requirements, phone shape) before building a **frozen** snapshot — matching requirement #9 ("use the existing cart snapshot"): the snapshot is built once, at button-press time, from `cart`/`cartTotal`/`orderType`/etc. exactly as they exist at that moment, using the identical items-mapping shape (`{product_id, quantity, notes, options}`) `placeOrder`/`confirmPriceUpdate` already use — no third copy of this mapping logic was introduced as a new *duplicate*; it was written once more, inline, specifically to avoid touching the existing functions at all (a deliberate, minimal-risk tradeoff, not an oversight).

`restaurant_id` is **never** included in the snapshot or sent anywhere — only `restaurant_slug` (the page's own `slug`) and, for non-QR, `branch_id` (the same value already sent by the existing cash flow, unchanged trust level) — matching `payment-first-checkout`'s own already-approved, already-deployed request contract exactly (requirement #16).

---

# IDEMPOTENCY

`usePaymentIdempotencyKey` (unmodified, from `TASK-PAY-3.6D.3`) is reused as-is inside `PaymentFirstCheckoutPanel` — no new key-generation logic was written anywhere in this task. The same key persists across the price-check call and the post-confirmation call (already-existing behavior); if the customer cancels and re-selects "card" later in the same browser session before the key would have been cleared, the same stored key is reused (read-or-generate-once semantics, unchanged). Requirement #12 ("existing idempotency-key generation must be reused") is satisfied by construction — no alternative was built.

---

# CUSTOMER_DATA

`persistPaymentCustomerData`/`clearPaymentCustomerData` (unmodified, from `TASK-PAY-3.6D.5-A.1`) continue to be called exclusively from inside `PaymentFirstCheckoutPanel` itself, unchanged — this task's new code never touches `localStorage` for customer data directly.

---

# QR

For a QR-scoped cart (`tableQr` present), `startPaymentFirstCheckout()` builds the snapshot with `table_qr_token: tableQr.token` and **omits** `restaurant_slug`/`branch_id`/`table_number` entirely (not merely leaves them empty — the fields are structurally absent), matching `payment-first-checkout`'s own exactly-one-of validation. `type` is forced to `'dine_in'` for QR, matching the existing cash-flow QR assumption. Verified by a dedicated test (`useCheckoutPaymentFirst.test.js`).

---

# DELIVERY

`orderType==='delivery'` produces a snapshot with `delivery_address` (trimmed) and no `table_number` — verified by a dedicated test. The existing delivery-fee/`deliveryEnabled` gating in `CartDrawer` is untouched.

---

# TAKEAWAY

`orderType==='takeaway'` produces a snapshot with neither `table_number` nor `delivery_address` — verified by a dedicated test. `takeawayEnabled` gating (existing, in `CartDrawer`'s order-type buttons) is untouched.

---

# MULTI_BRANCH

`branch_id` in the snapshot is always the actual, currently-resolved `branch?.id` — verified by a dedicated test using a non-default branch id. No default/fallback branch is invented anywhere in the new code.

---

# REGRESSION_TESTS

**46 new tests**, across 5 files (4 new, 1 extended):
1. `tests/unit/paymentFirstCheckoutApi.test.js` (9) — the new HTTP wrapper: correct function name, correct field mapping for QR/non-QR, `paymentTransactionId`/`providerRef` never forwarded, response passthrough, error generalization.
2. `tests/unit/PaymentFirstCheckoutEntry.test.jsx` (9) — the new wrapper's state machine: redirect-once guarantee, price-changed/rejected passthrough to the real (unmocked) `PaymentFirstCheckoutPanel`, failed/retryable-error/reconciliation handling, cancel wiring, source-purity.
3. `tests/unit/useCheckoutPaymentFirst.test.js` (12) — the new `useCheckout.js` functions in isolation: validation parity with `placeOrder`, correct snapshot shape for takeaway/delivery/dine-in/QR, no-second-attempt guard, cancel, multi-branch.
4. `tests/unit/CartDrawer.test.jsx` (+11) — the real integration: toggle appears, cash unchanged by default, card routes to the new handler, entry replaces the button when active, no double-submit surface, QR/non-QR `isQrCheckout` correctly threaded, full backward compatibility with callers unaware of the new props.
5. `tests/unit/PublicMenuPaymentFirstCheckoutWiring.test.jsx` (5) — `PublicMenu.jsx` correctly forwards `useCheckout()`'s new return values to `CartDrawer` unchanged, multi-branch `slug`/`branchId` threading, payment-callback gate unaffected.

**Mapped against the task's own 13-item list**: 1→CartDrawer test 1; 2→CartDrawer test 2/5 + PaymentFirstCheckoutEntry suite (real panel renders); 3→PaymentFirstCheckoutEntry price_changed test; 4→CartDrawer test 4 + PaymentFirstCheckoutEntry cancel test; 5→CartDrawer test 2/5; 6→CartDrawer test 6 + PaymentFirstCheckoutEntry redirect-once test; 7→CartDrawer cash-unchanged tests + PublicMenu wiring test; 8→useCheckoutPaymentFirst QR test + CartDrawer QR test; 9→useCheckoutPaymentFirst delivery test; 10→useCheckoutPaymentFirst takeaway test; 11→useCheckoutPaymentFirst/PublicMenu multi-branch tests; 12→re-ran `PaymentFirstCallbackLanding.test.jsx`/`PublicMenuCallbackIntegration.test.jsx`/`PublicMenuOrderCreationWiring.test.jsx` unmodified, still passing, confirmed unaffected; 13→re-ran `create-order-from-payment/handler.test.js`/`orderFromPayment.test.js` unmodified, still passing.

---

# TEST_COUNT

```
npx vitest run
```
```
Test Files  61 passed (61)
     Tests  1100 passed (1100)
```
Baseline before this task: **1054/1054**. New: **46**. Total: **1100/1100**, zero failures, zero skipped, zero weakened or removed assertions in any pre-existing test.

---

# GIT_STATUS

`git status --short`: **17** modified tracked files (14 pre-existing from earlier tasks + 3 newly modified this task: `CartDrawer.jsx`, `useCheckout.js`, `CartDrawer.test.jsx`), **145** untracked files (138 pre-existing + 7 new this task: `PaymentFirstCheckoutEntry.jsx`, `paymentFirstCheckoutApi.js`, 4 new test files, and this report). `i18n.js`/`PublicMenu.jsx` were already modified from earlier tasks and simply gained additional, additive changes this task. No `git add`, `commit`, or `push` was performed.

---

# DEPLOYMENT_STATUS

**Not deployed anywhere.** This is entirely client-side application code; the `payment-first-checkout` Edge Function it now actually calls was already deployed to staging in `TASK_3_6D_7_A` and is unmodified by this task. No frontend build was deployed. No production access of any kind occurred.

---

# REMAINING_EXTERNAL_MOYASAR_DEPENDENCY

Unchanged from `TASK_3_6D_7_A`/`3.6D.8`/`3.6D.9`: `PUBLIC_APP_BASE_URL`, `PAYMENT_MOYASAR_WEBHOOK_SECRET`, and `PAYMENT_MOYASAR_SECRET_KEY` remain `DEFERRED_EXTERNAL_CONFIGURATION` on staging. This task's own new code does not touch or depend on any of these directly, but the flow it now enables (`payment-first-checkout` actually being reachable end-to-end from the real cart) is still gated on them the same way it always was — this task closes the *UI wiring* gap, not the *external configuration* gap, which was never in its scope.

---

# RISKS

- **No live browser verification** that the new toggle/panel renders and behaves correctly in an actual rendered page (no browser-automation tool available, unchanged limitation from `TASK_3_6D_7`) — all verification here is via `happy-dom`-based component/integration tests, which is real and meaningful but not the same as a human or automated browser seeing the live page.
- **Mobile/visual layout of the new toggle** was not independently re-audited for touch-target sizing beyond matching the existing order-type button styling verbatim (same `padding`/`fontSize` values already used elsewhere in this exact file) — inherits whatever assessment `TASK_3_6D_9` already made of that pattern, not re-evaluated separately here.
- **`useCheckout.js` now has two parallel "start an order" entry points** (`placeOrder` for cash, `startPaymentFirstCheckout` for card) with intentionally duplicated validation/items-mapping logic (by design, to avoid touching the existing cash-path functions at all) — a small, contained, and deliberate duplication, consistent with the two other small, already-documented duplications noted in `TASK_3_6D_9`'s own audit (tenant-resolution helpers; webhook-handling logic).

---

# BLOCKERS

None specific to this task. The pre-existing `DEFERRED_EXTERNAL_CONFIGURATION` items (three secrets) remain the only thing standing between this now-fully-wired UI and an actual, live Moyasar checkout — unchanged, not addressed by this task, not in its scope.

---

# EXACT_NEXT_STEP

No further action taken, per this task's own "STOP after the report" instruction. With this gap closed, the payment-first arc's remaining path to a genuine live E2E is now exactly the same two items every prior report in this arc has already named: (1) the three external secrets, and (2) a way to drive a real browser (or the owner doing so manually) — both entirely unchanged and unaddressed by this task, both requiring their own explicit, separate authorization before being attempted.
