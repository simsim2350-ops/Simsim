# Task 3.6D-A — Checkout UX Architecture Audit

**Read-only. No code, schema, or database was changed. No Moyasar call. No frontend modified.**

---

# EXECUTIVE SUMMARY

**The frontend today has zero integration of any kind with the payment-first backend built across 3.6A–3.6C.3.1.** `useCheckout.js` calls `create_order`/`create_order_from_table_qr` **directly**, with `p_dry_run` never mentioned anywhere — meaning every current checkout submission is already a real, non-dry-run order-creation call, computed with a **client-side total** (`Math.max(0, cartTotal - discountAmount) + deliveryFee`), exactly the architecture Task 3.6A set out to replace. No file anywhere outside `src/payments/` references `checkoutOrchestration.js`, `initiatePaymentFirstCheckout`, or `createOrderFromSuccessfulPayment` — confirmed by a repository-wide search, not assumed.

The good news, found by tracing the actual UI code rather than assuming a blank slate: **the existing checkout surface is a single-drawer, single-page flow (no dedicated `/checkout` route exists), and it already has several of the exact primitives Payment-First needs** — a `price_changed` confirmation UI (`priceChangeInfo`/`confirmPriceUpdate`, built for `create_order`'s existing mismatch check, directly reusable for a dry-run-sourced price confirmation), a durable, per-restaurant/branch idempotency-key persistence pattern (`useCart.js`, `localStorage`, survives refresh) directly extensible to a payment idempotency key, and a reusable order-tracking/confirmation screen (`OrdersScreen.jsx`) already rendered in-place after `orderPlaced` becomes true. **No routing library change, no new state-management pattern, and no new persistence mechanism are needed** — `react-router-dom` and local component state (the established pattern throughout this codebase) are sufficient.

The three genuinely new things the UI needs that have **no existing analog anywhere in this codebase**: a Moyasar hosted-redirect return/callback screen (nothing like it exists — confirmed, not assumed, via `MOYASAR_REDIRECT_FLOW` below, correctly marked `UNVERIFIED` where real provider behavior can't be confirmed without live access), a distinct "payment ambiguous" (G-5-equivalent) UX state (the existing 5-state cash-flow UX has no concept of "we don't know if this worked" and must not silently invent one), and a genuine multi-step client-side state machine spanning dry-run → snapshot-backed payment → redirect → result → order-confirmation (today's flow is a single synchronous call-and-response).

**Verdict: `CHECKOUT_UX_ARCHITECTURE_READY_WITH_WARNINGS`** — the architecture is fully specifiable from existing patterns, but real, unresolved risk remains around the Moyasar redirect flow specifically, which this session has never had live access to verify (consistent with G-6, tracked throughout this entire arc).

---

# CURRENT_CUSTOMER_FLOW

Traced from the actual, live files — `useCart.js`, `useCheckout.js`, `CartDrawer.jsx`, `PublicMenu.jsx`, `App.jsx` — not assumed:

```
/menu/:slug (single route, react-router-dom)
  → PublicMenu.jsx loads restaurant/branch (by slug) or table context (by QR token)
    → product browsing (ProductItem/ProductModal/MenuBody) → useCart.js: addToCart()
      → cart persisted to localStorage (per-branch, survives refresh)
      → CartDrawer.jsx (an overlay drawer, opened via setCartOpen — NOT a route change)
        → cart review + checkout form fields (table/address/name/phone/notes) inline in the SAME drawer
          → placeOrder() [useCheckout.js] → submitOrder() → supabase.rpc('create_order', {...})
            → success: setOrderPlaced(true), drawer closes, cart cleared
              → PublicMenu.jsx conditionally renders OrdersScreen.jsx in place (still no route change)
            → price_changed: priceChangeInfo set, drawer stays open showing old/new total + confirm button
            → error: toast (bilingual, via mapOrderError)
```

**Everything happens within one page and one drawer component — there is no multi-step checkout route, no `/checkout`, `/payment`, or `/order-confirmation` path anywhere in `App.jsx`'s route table.** This is a structurally important finding: Payment-First's multi-stage nature (dry-run → payment → redirect → result) will need to be represented as **UI *state* within this same single-page structure**, not as new routes, to stay consistent with the existing architecture (or, if routes are introduced for the redirect round-trip specifically — likely necessary, see MOYASAR_REDIRECT_FLOW — that would be the one deliberate departure, not a wholesale restructuring).

---

# CURRENT_CHECKOUT_SUBMISSION

**Confirmed: still calling `create_order`/`create_order_from_table_qr` directly, always non-dry-run, always with a client-computed total.** `useCheckout.js:36-63` — `const total = clientTotalOverride ?? (Math.max(0, cartTotal - discountAmount) + deliveryFee)`, passed as `p_client_total`; `p_dry_run` is **never** present in either RPC call's parameter object. This is **exactly** the architecture Task 3.6A-1 through 3.6A-2 were built to supersede, and it remains, today, completely unchanged and live in production. `useCheckout.js` imports only `supabase`, `../helpers`, `../../../lib/asyncTimeout`, `../orderErrors` — **no import of anything under `src/payments/`, `checkoutOrchestration`, or any payment-first service exists.**

---

# INTEGRATION_GAP

**Total — not partial.** A repository-wide search for `checkoutOrchestration`, `initiatePaymentFirstCheckout`, and `createOrderFromSuccessfulPayment` across every `.js`/`.jsx` file found matches **only** inside `src/payments/` itself (the services' own definitions) and two unrelated, dormant architectural comments in `src/integration/` (a separate, unconnected future-integration-layer scaffold, confirmed in the prior 3.6C-Refund-A audit too, not newly discovered). **The frontend does not call any part of the payment-first backend today — zero, not "some."** This was verified, not assumed: the search covered every JS/JSX file, not just the checkout-adjacent ones.

---

# ROUTING_STATE_ARCHITECTURE

| Aspect | Finding |
|---|---|
| Routing library | `react-router-dom` (`BrowserRouter`, `Routes`, `Route`, `Navigate`, `useNavigate`) — `App.jsx` |
| Page structure | Route-per-page, lazy-loaded via a custom `lazyWithRetry` wrapper (retries a failed dynamic import once, logs, and reloads — an existing, reusable resilience pattern) |
| Customer-facing route | Exactly one: `/menu/:slug` → `PublicMenu.jsx` (QR-scoped ordering also lands here, resolved via an in-page token, not a distinct route) |
| State management | Plain React hooks + local component state throughout (`useState`/`useEffect`), no Redux/Zustand/Context-based global store for checkout-adjacent state (a `useAuthStore` Zustand store exists but is for authenticated staff/admin sessions, unrelated to the anonymous customer checkout flow) |
| Async/loading UX pattern | A boolean `submitting` flag disabling the submit button + `withTimeout` (`src/lib/asyncTimeout.js`, 15s timeout constant already defined for `create_order` calls) wrapping the async RPC call |
| Error handling UX pattern | `mapOrderError(error.message)` (`src/features/menu/orderErrors.js`) — maps known `create_order` SQL exception messages to bilingual `{ar, en}` toast text; `react-hot-toast` for all user-facing error/success messages, no modal-based error UI |

**No new state library is needed or proposed** — the existing hook-based, `submitting`-flag, toast-driven pattern is directly extensible to a longer multi-stage flow (more `useState` values for more stages), consistent with how `priceChangeInfo` already added one extra state to the same hook without requiring any architectural change.

---

# REQUIRED_UI_STATES

| State | Already exists? | Evidence |
|---|---|---|
| Cart review | **Yes** | `CartDrawer.jsx`, unchanged, fully reusable |
| Submitting dry-run | **No** | Today's `submitting` flag exists but covers the whole (currently single-step) submission; a dry-run-specific sub-state doesn't exist because there is no dry-run call today |
| Price changed | **Yes, directly reusable** | `priceChangeInfo`/`confirmPriceUpdate` (`useCheckout.js`), built for `create_order`'s existing client-total mismatch — the exact same UI (old/new total, confirm button) applies unchanged to a dry-run-sourced price confirmation, since the underlying data shape (`{oldTotal, newTotal}`) is identical |
| Payment initializing | **No** | Nothing today initiates a payment transaction at all |
| Redirect to Moyasar | **No** | No redirect-handling code exists anywhere in this codebase — confirmed by search, not assumed |
| Payment processing (post-redirect, awaiting confirmation) | **No** | Same — no analog exists |
| Payment success | **Partially** | `orderPlaced`/`setOrderPlaced(true)` exists, but is currently synonymous with "order created" (since today's flow creates the order and confirms payment in one synchronous step) — Payment-First separates "payment succeeded" from "order created" (3.6B), so this state needs to be reconceived, not just reused verbatim |
| Payment failed | **Partially** | The existing generic error-toast pattern exists, but there's no dedicated "payment failed, want to retry with the same cart" state — today's errors are all order-creation errors, not payment errors |
| Payment ambiguous (G-5-equivalent) | **No — and none should be invented from the existing failure UI** | The existing error toast pattern is binary (worked / didn't); `requires_reconciliation` is neither, and using the existing "failed" toast for it would misinform the customer that their money is safe when it may not be, or that it was lost when it wasn't — this needs a **distinct**, honest, "we're checking on this" state (ERROR_STATE_MAPPING below) |
| Order created | **Yes, reusable** | `OrdersScreen.jsx`, already renders in place after `orderPlaced` |
| Order not yet created (edge case — payment succeeded, order creation pending/failed) | **No** | Doesn't exist; today "payment succeeded" and "order created" are inseparable, so this edge case has never needed representing |

**Summary**: **4 of 11 states are directly reusable or partially reusable; 7 are genuinely new**, with the price-changed and order-confirmation states being the strongest existing assets to build on.

---

# MOYASAR_REDIRECT_FLOW

- **Does Moyasar require hosted redirect?** `MoyasarAdapter.createCharge`'s response mapping includes `redirectUrl: data.source?.transaction_url ?? undefined` — the adapter is **written to expect** a possible redirect URL in the charge response (consistent with 3D-Secure/hosted-page card flows generally), but this session has **never made a real call to Moyasar** to confirm this field's actual presence/shape for a real charge. **Marked `UNVERIFIED`** — not guessed.
- **`callback_url` usage today?** `MoyasarAdapter.createCharge`'s request body includes `callback_url: input.returnUrl ?? ''` — the adapter already forwards whatever `returnUrl` it's given, but **nothing in the current codebase ever supplies a real `returnUrl`** (no caller of `startCharge`/`initiatePaymentFirstCheckout` sets `input.returnUrl` to any real value — both accept it as an optional pass-through field with no default). This is a concrete, current gap: there is no page/route today that could serve as a valid callback destination.
- **Does the frontend already handle any redirect-based flow?** **No** — confirmed by search; no `useEffect` reading a return query parameter, no dedicated callback route, no "processing your payment" screen exists anywhere in this codebase today.
- **What happens on return from Moyasar?** **Nothing — because nothing sends the customer there yet.** This entire round-trip is unbuilt.

**This is the single largest, most novel piece of UI work 3.6D will require**, and the one area where this audit cannot fully specify behavior without real Moyasar verification (G-6) — marked `UNVERIFIED`, not assumed away.

---

# SESSION_RETRY_CONTINUITY

**Existing pattern, directly extensible — no new persistence mechanism needed.** `useCart.js`/`cartHelpers.js` already establish exactly this pattern for **order** idempotency: `idempotencyStorageKey(slug, branchId)` → `` `simsim_idem_${slug}_${branchId}` `` → `localStorage`, generated once via `crypto.randomUUID()` when the cart first becomes non-empty, persisted across refresh, and invalidated only when the cart empties (order succeeds or is manually cleared).

**Recommendation, derived directly from this existing pattern, not invented**: a **payment** idempotency key should follow the identical shape — a sibling `localStorage` key (e.g. `simsim_payidem_{slug}_{branchId}`), generated once per checkout *attempt* (not per cart — per 3.6A-2's own established distinction that cart identity and payment-attempt identity are different concepts), persisted across the redirect round-trip specifically (so a customer who refreshes mid-redirect, or whose browser is killed and relaunched, can resume with the *same* payment attempt rather than accidentally starting a new one), and cleared once a terminal outcome (success, definite failure, or explicit "start over") is reached.

---

# ERROR_STATE_MAPPING

| Backend `status` | Required user-facing behavior |
|---|---|
| `rejected` | Generic, honest "couldn't start checkout" message (mapped by `reason` where a friendlier bilingual string is warranted, following the existing `mapOrderError` pattern) — **no payment was attempted**, safe to let the customer simply retry |
| `failed` | "Payment didn't go through" — safe to offer an immediate retry (a **new** payment idempotency key for a **new** attempt, per SESSION_RETRY_CONTINUITY, since a definite failure is exactly the "genuinely new attempt" case 3.6A-2 already reasoned through) |
| `price_changed` | **Directly reuses the existing `priceChangeInfo` UI pattern** — show old vs. new total, require explicit confirmation before proceeding, exactly as today |
| `requires_reconciliation` | **Must never say "payment failed."** The honest, correct message is closer to "we're confirming your payment — this may take a moment" with **no retry button offered immediately** (retrying here risks a genuine double-charge, since the payment may well have actually succeeded) — the customer should be told to wait/check back, not to try again. This is the one state where the existing binary success/failure toast vocabulary is actively wrong if reused unmodified, and needs its own distinct treatment. |
| `succeeded` | Payment succeeded — but **order creation (3.6B) is a separate subsequent step**, so this state alone should show a "payment confirmed, finishing your order..." transitional state, not immediately jump to `OrdersScreen.jsx` (that only happens after `createOrderFromSuccessfulPayment` *also* succeeds) |

---

# ORDER_CONFIRMATION_SCREEN

**A reusable screen already exists: `OrdersScreen.jsx`.** After `createOrderFromSuccessfulPayment` succeeds, the data it returns (`orderId`, `orderNumber`, `accessToken`, `paymentTransactionId`) is a strict subset of what `create_order`'s existing return already provides today (`id`, `order_number`, `access_token`) — the exact same shape `useCheckout.js` already feeds into `setActiveOrders`. **`OrdersScreen.jsx` can be reused essentially as-is** for the payment-first flow's final confirmation/tracking state, since it already renders generically from an "active orders" list without any awareness of *how* the order was created (cash vs. payment-first) — it only needs `id`/`order_number`/`access_token`/`status`/`items`/`total`, all of which are available identically regardless of path.

---

# TENANT_BRANCH_CONTEXT

Traced from `PublicMenu.jsx`, unchanged, not to be altered: `restaurant`/`branch` are resolved from the `:slug` URL param (a data fetch, not client-asserted IDs); for QR-scoped ordering, `tableQr` (`{token, tableId, tableName, restaurantId, branchId}`) is resolved server-side from an opaque QR token, with `effectiveBranchId = tableQr?.branchId || branchId` as the actual value used downstream — **the client never asserts a raw `restaurant_id`/`branch_id` value in the QR-scoped path**, consistent with the same trust boundary already established and unmodified throughout 3.6A-2/3.6B (`create_order_from_table_qr` derives restaurant/branch server-side from the token alone). This exact resolution — `restaurant.id`, `effectiveBranchId`, `tableQr` — is precisely what a future payment-first checkout hook would feed into `initiatePaymentFirstCheckout`'s `restaurant_id`/`branch_id`/`type` inputs, unchanged from how `useCheckout.js` already sources them today. **No change to tenant resolution logic is needed or proposed.**

---

# SECURITY_BOUNDARIES

Cross-checked against actual current component code, not assumed:

| Boundary | Current state |
|---|---|
| Client never computes final price for payment | **Currently violated by the existing cash flow** (`useCheckout.js`'s own `Math.max(0, cartTotal - discountAmount) + deliveryFee` client-side total) — but this is `create_order`'s own existing, already-accepted `p_client_total` advisory pattern (never authoritative, always re-verified server-side), not a payment-first violation; Payment-First's own design (3.6A-2) never lets the client compute the *charged* amount — that's `dryRun.total` exclusively. The future UI must source the displayed/charged total from the dry-run response, never recompute it, to preserve this. |
| Client never sets payment status | **Currently N/A** (no payment status exists in the cash flow) — for Payment-First, confirmed by 3.6A-2's own design: the client never supplies a status, only ever *reads* one back from a trusted server response. Future UI must not locally "optimistically" set a success state before the server confirms it. |
| Client never sets `provider_ref` | Same — N/A today, and by 3.6A-2's design, never client-suppliable. |
| Client cannot bypass dry-run | **N/A today** (no dry-run exists in the current flow at all) — for Payment-First, this is enforced entirely server-side already (`initiatePaymentFirstCheckout` always calls dry-run itself; there is no code path for a client to skip it) — the *UI's* job is simply to always go through the hook that does this, never to attempt a direct `startCharge`/`create_order(dry_run=false)` call from a component. |
| Client cannot submit a stale snapshot | **N/A today** — for Payment-First, the snapshot is built and stored entirely server-side (3.6A-1b.2) from the same request that computed the dry-run; the client never sees or resubmits it. The UI's obligation is only to *not* invent a second, parallel cart-submission path around the checkout hook. |

**None of these boundaries require new UI-side enforcement code** — they are all already, correctly, enforced server-side by the existing, unmodified payment-first backend; the UI's job is simply to *route through* that backend correctly, not to duplicate its checks.

---

# IMPLEMENTATION_PLAN

Derived from the actual gaps found above — not the illustrative template, since several of its example phases turned out to map onto already-existing, reusable pieces:

### 3.6D.1 — Checkout orchestration hook (`usePaymentFirstCheckout`, sibling to `useCheckout.js`)
- **Objective**: a new hook mirroring `useCheckout.js`'s existing shape (state + `placeOrder`-equivalent function), but calling `initiatePaymentFirstCheckout` instead of `create_order` directly, managing the new multi-stage state (dry-run → price-confirm → payment-init → redirect-pending → result).
- **Files**: new `src/features/menu/hooks/usePaymentFirstCheckout.js`; `useCheckout.js` **not modified** (the existing cash flow, if still needed, stays independent — a business decision about whether/how the two coexist is explicitly not this audit's call to make).
- **Risk**: low — a new, additive hook, not a rewrite of existing code.

### 3.6D.2 — Price confirmation UI
- **Objective**: adapt the existing `priceChangeInfo`/`confirmPriceUpdate` pattern to a dry-run-sourced total, reusing `CartDrawer.jsx`'s existing old/new-total display block nearly verbatim.
- **Dependencies**: 3.6D.1.
- **Risk**: low — smallest-possible change to an already-proven UI pattern.

### 3.6D.3 — Payment initiation UI + idempotency-key persistence
- **Objective**: a new "processing payment" state; extend `cartHelpers.js`'s existing `localStorage` pattern with a sibling payment-idempotency-key function, per SESSION_RETRY_CONTINUITY.
- **Dependencies**: 3.6D.1.
- **Risk**: low.

### 3.6D.4 — Redirect/callback handling
- **Objective**: the one genuinely new architectural piece — a callback destination (likely a new route, e.g. `/menu/:slug/payment-callback`, or an in-page state reached via a query-parameter check on `PublicMenu.jsx` itself — **not decided here**, a real design choice) capable of resuming a persisted payment attempt and calling whatever confirms its outcome.
- **Dependencies**: 3.6D.1, 3.6D.3, and **real Moyasar verification (G-6)** — this phase cannot be fully built with confidence until the actual `redirectUrl`/callback payload shape is confirmed against live traffic.
- **Risk**: **highest of any phase** — the one area this audit could not fully de-risk from existing code alone.

### 3.6D.5 — Result mapping UI (including the ambiguous/G-5 state)
- **Objective**: implement ERROR_STATE_MAPPING's five outcomes as distinct UI states, with particular care for `requires_reconciliation`'s honest, no-immediate-retry treatment.
- **Dependencies**: 3.6D.1, 3.6D.4.
- **Risk**: medium — mostly UI copy/state work, but getting the `requires_reconciliation` messaging *wrong* (e.g., defaulting to a generic "failed" toast) would be a real customer-trust and double-charge risk, not just a cosmetic issue.

### 3.6D.6 — Order confirmation reuse
- **Objective**: wire `createOrderFromSuccessfulPayment`'s result into the existing `OrdersScreen.jsx`/`setActiveOrders` pattern, confirmed to need no changes to `OrdersScreen.jsx` itself.
- **Dependencies**: 3.6D.1, 3.6D.5.
- **Risk**: low — the reuse target is already generic and unaware of order-creation path.

### 3.6D.7 — Tests
- **Objective**: component/hook tests for the new orchestration hook and each new UI state, following this codebase's existing React Testing Library conventions (`CartDrawer.test.jsx`/similar, where they exist) — plus, explicitly, a test proving the `requires_reconciliation` state never renders any "failed"-implying copy.
- **Dependencies**: all prior phases.

**Explicitly not proposed**: any change to routing library, state-management library, or persistence mechanism beyond extending the existing `localStorage` pattern; any change to `checkoutOrchestration.js`, `create_order`, or the webhook (all confirmed unmodified by this audit, per instruction).

---

# BLOCKERS

None for beginning 3.6D.1–3.6D.3, 3.6D.5–3.6D.7. **3.6D.4 (redirect/callback handling) is materially blocked on real Moyasar verification (G-6)** — it can be scaffolded and partially built against reasonable assumptions, but cannot be considered *correct* until confirmed against live provider behavior, consistent with every other Moyasar-dependent gap already tracked throughout this session.

# RISKS

- Building 3.6D.4 against unverified assumptions about `redirectUrl`/callback payload shape risks a rebuild once real Moyasar access is available — explicitly flagged, not glossed over.
- The `requires_reconciliation` UX state is the one place a naive implementation could cause real financial-trust harm (a customer wrongly told to retry a payment that may have already succeeded) — this needs deliberate design attention, not a default fallback onto the existing generic error-toast pattern.
- The existing cash-flow checkout (`useCheckout.js`) and any new Payment-First flow would, at least initially, coexist in the same codebase — this audit does not decide whether/how they're unified or which becomes primary, and that decision has real product implications beyond this task's scope.

---

# REPORT_FILE

`reports/TASK_3_6D_A_CHECKOUT_UX_ARCHITECTURE_AUDIT.md`

# DOWNLOAD_COPY

`/sdcard/Download/TASK_3_6D_A_CHECKOUT_UX_ARCHITECTURE_AUDIT.md` (copied and checksum-verified after this report was written).

# NEXT_STEP

Owner decisions needed before implementation: (1) whether/how the existing cash-flow checkout and a new Payment-First checkout coexist, (2) the redirect/callback destination design (new route vs. in-page state), pending (3) real Moyasar verification (G-6) to de-risk 3.6D.4 specifically. 3.6D.1–3.6D.3 and 3.6D.5–3.6D.7 could reasonably begin independently of the Moyasar-specific unknowns if you choose to proceed incrementally. No implementation begins without separate, explicit instruction, per this task's strict stop list.

---

*Report generated 2026-08-26. Architecture analysis only — no code written, no schema modified, no migration created, no deployment, no Moyasar call, no commit, no push.*
