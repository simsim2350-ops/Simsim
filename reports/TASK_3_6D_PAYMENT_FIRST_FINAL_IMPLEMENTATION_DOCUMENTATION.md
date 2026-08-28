# Payment-First Checkout — Final Implementation Documentation

**Consolidated reference document for the complete Payment-First arc (`TASK-PAY-3.4` through `TASK-PAY-3.6D.10`). Read-only synthesis — no code, test, or configuration changed by this document's creation.**

> **Status legend used throughout:** **COMPLETED** (implemented) · **TEST VERIFIED** (covered by a passing automated test) · **STAGING VERIFIED** (exercised via a real network call against the real, deployed staging function/database) · **DEFERRED** (blocked on something outside this session's reach — never claimed done). **Live Moyasar payment processing is never marked as verified anywhere in this document** — every occurrence is explicitly `DEFERRED_EXTERNAL_CONFIGURATION`.

---

# 1. EXECUTIVE_SUMMARY

SimSim's Payment-First checkout lets a customer pay by card *before* an order is created, instead of the existing cash-on-delivery/pickup flow where the order is created first and paid for later. The full flow — cart → payment method choice → server-verified price confirmation → Moyasar redirect → callback → server-verified payment status → order creation → confirmation → existing order tracking — is now **CODE COMPLETE** and **TEST VERIFIED** (1100/1100 automated tests), with the three Edge Functions it depends on **STAGING VERIFIED** as deployed and reachable. The only thing remaining is **DEFERRED_EXTERNAL_CONFIGURATION**: three Moyasar/application secrets that must be set by someone with Supabase dashboard access before a real charge can be processed anywhere.

---

# 2. ORIGINAL_OBJECTIVE

Per `PHASE_3_PREFLIGHT_REPORT.md`: *"Phase 3 — Payment Integration (Weeks 9–16): Wire a live payment gateway into the existing payment foundation so that restaurant customers can pay electronically for orders placed via the QR menu."* The existing system (cash/pay-on-delivery, order created first) needed to gain a second, payment-first path without breaking the first.

---

# 3. COMPLETED_SCOPE

**COMPLETED**: Moyasar adapter and webhook (3.4); `orders.payment_transaction_id` linkage (3.5); server-side pricing quote/dry-run architecture, cart-integrity fingerprinting, checkout snapshot builder (3.6A.1 family); payment-first orchestration service and its architecture audit (3.6A.2); order creation from a successful payment (3.6B); payment→order status sync and refund hardening (3.6C family); the entire customer-facing UI and server chain (3.6D family, detailed below); staging deployment of all three payment-first Edge Functions (3.6D.7-A); a provider-independent readiness audit (3.6D.8); a final code audit that found and then closed the one remaining integration gap (3.6D.9 → 3.6D.10).

**DEFERRED**: any transaction that requires an actual Moyasar charge (real payment initiation, real webhook signature verification, real end-to-end browser walk) — blocked purely on external secret configuration, not on anything this session could do.

---

# 4. ARCHITECTURE

```
Browser (anon key only, never service_role)
  │
  ├─ CartDrawer.jsx → useCheckout.js (payment-method toggle; snapshot builder)
  │     ↓ "card" chosen
  ├─ PaymentFirstCheckoutEntry → PaymentFirstCheckoutPanel → PaymentFirstPriceConfirmation
  │     ↓ usePaymentFirstCheckout → paymentFirstCheckoutApi.js (HTTP)
  ▼
payment-first-checkout (Edge Function, service_role)          ─┐
  → initiatePaymentFirstCheckout → create_order(dry_run) →     │  supabase/functions/*
    buildCheckoutSnapshot/computeCheckoutFingerprint →         │  src/payments/*
    paymentService.startCharge → Moyasar → payment_transactions│
                                                                 │
Moyasar (external) → redirect back to app                      │
                                                                 │
Browser: PaymentFirstCallbackLanding → get_payment_status_by_  │
  idempotency_key (RPC) → PaymentFirstOrderCreation             │
    ↓ status===succeeded                                       │
  paymentOrderCreationApi.js (HTTP)                             │
  ▼                                                             │
create-order-from-payment (Edge Function, service_role) ───────┘
  → createOrderFromSuccessfulPayment → create_order(real) → orders
  ▼
Browser: confirmation card → existing useActiveOrders/OrdersScreen

payment-webhook (Edge Function, service_role, HMAC-authenticated, no verify_jwt)
  → Moyasar async notification → payment_transactions.status update only (never creates orders)
```

Every arrow above is either **COMPLETED + TEST VERIFIED** (application logic) or **STAGING VERIFIED** (the three deployed Edge Functions' reachability/validation/error paths) except the Moyasar leg itself, which is **DEFERRED_EXTERNAL_CONFIGURATION**.

---

# 5. CUSTOMER_CHECKOUT_FLOW

**COMPLETED, TEST VERIFIED.** Customer adds items to cart (unchanged), opens the cart drawer, sees a payment-method toggle ("نقداً/عند الاستلام" default / "الدفع الإلكتروني"), fills in the same order-type/customer-info/table-or-address fields the cash flow always used, and presses one confirm button. If "card" was selected, the button starts the payment-first flow instead of `create_order` directly (`TASK-PAY-3.6D.10`).

---

# 6. PAYMENT_INITIATION

**COMPLETED, TEST VERIFIED, STAGING VERIFIED (validation paths).** `useCheckout.js`'s `startPaymentFirstCheckout()` runs the same defensive checks `placeOrder()` runs, then freezes a snapshot (`TASK-PAY-3.6D.10`). `PaymentFirstCheckoutPanel` (`3.6D.3`) auto-starts `usePaymentFirstCheckout` (`3.6D.1`), which calls `paymentFirstCheckoutApi.js` (`3.6D.10`) → the deployed `payment-first-checkout` Edge Function (`3.6D-E`) → `initiatePaymentFirstCheckout` (`3.6A.2`). `restaurant_id` is never sent — only `restaurant_slug`/`table_qr_token` and `branch_id`, matching the Edge Function's own approved contract (`TASK_3_6D_C`).

---

# 7. PRICE_CONFIRMATION

**COMPLETED, TEST VERIFIED.** `PaymentFirstPriceConfirmation.jsx` (`3.6D.2`) shows the server-computed dry-run total; if it differs from what the customer expected, an explicit "حدّث وتابع" confirmation is required before any charge is attempted (`TASK-CHK-004`-style price-drift protection, reused). The server's dry-run (`create_order(p_dry_run=true)`) remains the sole source of price truth — no client-side calculation feeds into what gets charged.

---

# 8. CUSTOMER_DATA_PERSISTENCE

**COMPLETED, TEST VERIFIED.** `paymentCustomerDataHelpers.js`/`usePaymentCustomerData.js` (`3.6D.5-A.1`) persist phone/name/table(non-QR)/delivery-address/notes to `localStorage`, keyed by the payment idempotency key, written just before the Moyasar redirect and read back after return — since the SPA loses all React state across that cross-origin redirect. TTL-bounded (2 hours, safety net only). Never contains `paymentTransactionId`/`providerRef`/status/amount/`branchId`/`restaurantId`. Cleared only after a confirmed order (`3.6D.6-B`), never during pending/retryable states.

---

# 9. PAYMENT_CALLBACK

**COMPLETED, TEST VERIFIED.** `PaymentFirstCallbackLanding.jsx` (`3.6D.4`), gated into `PublicMenu.jsx` (`3.6D.4-C.3`) ahead of every other screen when `?payment_callback=` is present — full-screen takeover, no menu/cart underneath. Resolves status using the **resumed, `localStorage`-stored** idempotency key, never the raw URL parameter (URL value is activation-only). Bounded polling (5 attempts / 3s) with manual retry after exhaustion.

---

# 10. PAYMENT_VERIFICATION

**COMPLETED, TEST VERIFIED, STAGING VERIFIED.** `get_payment_status_by_idempotency_key` (`3.6D.4-A`/`B`), a `STABLE SECURITY DEFINER` SQL RPC, is the sole authority — staging-verified live with 11/11 real scenarios (`3.6D.4-B.2`). Never derives status from the URL, from `localStorage` claims, or from the mere fact of a redirect having occurred.

---

# 11. ORDER_CREATION

**COMPLETED, TEST VERIFIED, STAGING VERIFIED.** `createOrderFromSuccessfulPayment` (`3.6B`) rebuilds the cart entirely from the server-stored snapshot (never from new client input), verifies fingerprint and amount, then calls `create_order(p_dry_run=false)` using `payment_transactions.restaurant_id` (authoritative) + snapshot fields, with execution-only fields (`customerPhone`/`tableNumber`/`deliveryAddress`/`customerName`/`notes`) supplied by the caller. Exposed via `create-order-from-payment` (`3.6D.6`), deployed and reachable on staging (`3.6D.7`), the sole caller of this function anywhere in the codebase.

---

# 12. ORDER_CONFIRMATION

**COMPLETED, TEST VERIFIED.** `PaymentFirstOrderCreation.jsx` (`3.6D.6-B`/`3.6D.6-C`) shows "تم استلام الدفع، جاري تأكيد طلبك..." while `create-order-from-payment` runs, then a genuine, visibly-painted (not instantly-replaced) confirmation card — order number, restaurant name, next-step guidance, and an explicit "عرض طلبي" button that hands off to the existing, unmodified `OrdersScreen`/`useActiveOrders` mechanism. **Payment success alone never displays this card** — only a real `succeeded` response from `create-order-from-payment` does (structurally guaranteed, single call site).

---

# 13. IDEMPOTENCY

**COMPLETED, TEST VERIFIED, STAGING VERIFIED (schema).** Two layers: DB-level (`orders_payment_transaction_id_uidx` unique index — the actual source of truth, staging-confirmed present and correctly defined) and app-level (pre-checks that skip redundant work as a cost optimization). `p_idempotency_key = p_payment_transaction_id` inside `create_order` makes a genuine concurrent second attempt collide with the unique index and get safely recovered, never duplicated.

---

# 14. DUPLICATE_CALLBACK_HANDLING

**COMPLETED, TEST VERIFIED.** A second `onSucceeded` firing (double callback, refresh mid-flow) is debounced client-side (`attemptingRef` in `PaymentFirstOrderCreation`) and, regardless, resolves safely server-side via the same idempotency mechanism above — `idempotent: true` is treated identically to a first-time success.

---

# 15. RETRY_BEHAVIOR

**COMPLETED, TEST VERIFIED.** `retryable_error` at either layer (payment-status RPC failure, or `create-order-from-payment`'s own `order_race_unrecovered`) offers a retry that reuses the **same** idempotency key — never generates a new one, never re-initiates payment.

---

# 16. QR_FLOW

**COMPLETED, TEST VERIFIED, STAGING VERIFIED.** QR-scoped checkout sends `table_qr_token`; the server resolves the real table via `restaurant_tables`; `tableNumber` is **never** read from `localStorage`/request body for this path, enforced at three independent layers (storage, request-building, server) per `TASK_3_6D_8`'s own audit.

---

# 17. NON_QR_FLOW

**COMPLETED, TEST VERIFIED.** `restaurant_slug` + `branch_id` (client-supplied, matching the existing cash flow's own trust level — real authorization remains `create_order`'s own validation).

---

# 18. TAKEAWAY

**COMPLETED, TEST VERIFIED.** No table/address required or sent.

---

# 19. DELIVERY

**COMPLETED, TEST VERIFIED.** `delivery_address` forwarded as an execution-only field; delivery fee remains server-computed via the existing dry-run.

---

# 20. MULTI_BRANCH

**COMPLETED, TEST VERIFIED.** `branch_id` always the actually-resolved branch; idempotency-key storage itself is `slug`+`branchId`-scoped so two branches never collide.

---

# 21. SECURITY_MODEL

**COMPLETED, TEST VERIFIED, STAGING VERIFIED (live response inspection).** Server-authoritative: amount, currency (hardcoded `SAR`), items (fingerprint-verified snapshot), restaurant, branch, payment status. Never client-controllable: `paymentTransactionId` (resolved server-side only, no request field exists for it anywhere), `providerRef` (never in any request or response contract). `service_role` never referenced anywhere under `src/` (browser-bundled code) — confirmed by source search in `TASK_3_6D_9`.

---

# 22. SENSITIVE_DATA_HANDLING

**COMPLETED, TEST VERIFIED, STAGING VERIFIED.** No hardcoded secret anywhere in the payment-first tree (targeted regex search, `TASK_3_6D_9`). `accessToken` flows into the existing `activeOrders` mechanism only (never rendered, never logged) — same, unmodified pattern the cash flow already used. `providerRef`/`paymentTransactionId` appear only in server-side `console.*` calls (Edge Function logs), never in any HTTP response — confirmed by both static audit and live staging response inspection.

---

# 23. ERROR_STATES

**COMPLETED, TEST VERIFIED.** Full state machine — `PENDING`/`SUCCEEDED`/`FAILED`/`UNKNOWN`/`RETRYABLE_ERROR`/`REQUIRES_RECONCILIATION` (payment layer) and `checking`/`price_confirmation`/`creating_payment`/`redirecting`/`error` (checkout-initiation layer, `3.6D.10`) — every value has a dedicated, tested UI branch; no unmapped state is ever silently swallowed (`default` branches always fail safely).

---

# 24. RECONCILIATION_BEHAVIOR

**COMPLETED, TEST VERIFIED.** `REQUIRES_RECONCILIATION` (the G-5 ambiguous-outcome case — provider call succeeded but the final DB write's own confirmation is uncertain) shows a neutral message with **no retry affordance** at either the checkout-initiation or order-creation layer — deliberately, since retrying a genuinely ambiguous payment state could risk a duplicate charge attempt. Never claims success or failure.

---

# 25. AUTOMATED_TESTS

**TEST VERIFIED.** 61 test files across unit, component/integration, and Edge-Function-handler layers, using dependency-injected mocks at real network/database boundaries only (`db.rpc`, `supabase.functions.invoke`) — never at internal application-logic boundaries. Real database/RPC behavior was separately confirmed live on staging where noted above.

---

# 26. TEST_COUNT

```
npx vitest run
Test Files  61 passed (61)
     Tests  1100 passed (1100)
```
Zero failures. Historical progression across this arc: 751 (`3.6D-E`) → 959 (`3.6D.5-A.1`) → 1009 (`3.6D.6`) → 1045 (`3.6D.6-B`) → 1054 (`3.6D.6-C`, `3.6D.7`–`3.6D.9`) → **1100** (`3.6D.10`, current).

---

# 27. STAGING_DEPLOYMENTS

**STAGING VERIFIED.** Project `rgqsetckcigkgsyobyjg` ("simsim-menu-staging"). Deployed and `ACTIVE`: `create-order-from-payment` (v1, `TASK_3_6D_7`), `payment-webhook` (v1, `TASK_3_6D_7_A`), `payment-first-checkout` (v1, `TASK_3_6D_7_A`). All three re-confirmed reachable and behaviorally correct (validation/not-found/method/auth paths) via real, non-payment HTTP requests across `3.6D.7`, `3.6D.7_A`, `3.6D.8`, and `3.6D.9`. Database invariants (`orders_payment_transaction_id_uidx`, `uq_paytx_idempotency_key`, `uq_paytx_provider_ref`, single 14-parameter `create_order` overload) all live-confirmed present and correctly defined. **Production (`gpwwnuuicywsvmmhxngs`) was never touched by any payment-first task** except the already-approved, pre-arc `TASK_3_5` migration (`orders.payment_transaction_id`/`orders_payment_transaction_id_uidx` columns/index — a prerequisite this arc built on, not part of it).

---

# 28. LIVE_MOYASAR_E2E_LIMITATION

**DEFERRED_EXTERNAL_CONFIGURATION.** No real Moyasar charge has been created or confirmed anywhere in this arc. Two independent gates: (1) three environment variables — `PUBLIC_APP_BASE_URL`, `PAYMENT_MOYASAR_WEBHOOK_SECRET`, `PAYMENT_MOYASAR_SECRET_KEY` — remain unset on staging (re-confirmed unchanged as recently as `TASK_3_6D_9`, via a secret-free behavioral method that never reads or exposes a value); (2) no browser-automation tool is available in this session (`@playwright/test` is a real, configured dependency with existing specs, but its browser binaries are not installed in this Termux/proot environment — never attempted or confirmed working). **This document does not claim, and no report in this arc has ever claimed, live Moyasar payment as verified.**

---

# 29. DEFERRED_EXTERNAL_CONFIGURATION

| Item | Needed for | Status |
|---|---|---|
| `PUBLIC_APP_BASE_URL` | `payment-first-checkout`'s return-URL construction | Unset — confirmed via live behavioral signal only, no value read |
| `PAYMENT_MOYASAR_WEBHOOK_SECRET` | `payment-webhook`'s HMAC verification | Unset — same method |
| `PAYMENT_MOYASAR_SECRET_KEY` | Outbound Moyasar API calls (`createCharge`/`verifyPayment`) | Assumed unset (not independently re-verifiable without the above) |
| Frontend staging deployment | Any browser-driven walk of the flow | Never deployed in this arc |
| Browser-automation tooling | Live/automated E2E execution | Playwright present but uninstalled/unverified on this platform |

---

# 30. FILES_CREATED

**Edge Functions**: `supabase/functions/payment-first-checkout/{index.ts,handler.js,handler.test.js}`, `supabase/functions/create-order-from-payment/{index.ts,handler.js,handler.test.js}`.

**Server-side orchestration**: `src/payments/services/checkoutOrchestration.js`, `src/payments/checkoutBinding.js`.

**SQL**: `sql/order_dry_run_pricing.sql`, `sql/order_payment_reference.sql`, `sql/payment_status_reads.sql`, `sql/staging/*.sql` (4 files).

**Frontend components**: `PaymentFirstCallbackLanding.jsx`, `PaymentFirstCheckoutPanel.jsx`, `PaymentFirstPriceConfirmation.jsx`, `PaymentFirstOrderCreation.jsx`, `PaymentFirstCheckoutEntry.jsx`.

**Frontend hooks/helpers**: `hooks/usePaymentFirstCheckout.js`, `hooks/usePaymentIdempotencyKey.js`, `hooks/useResumedPaymentIdempotencyKey.js`, `hooks/paymentCustomerDataHelpers.js`, `hooks/usePaymentCustomerData.js`, `paymentFirstErrors.js`, `paymentOrderCreationApi.js`, `paymentFirstCheckoutApi.js`.

**Guard tests**: `src/lib/paymentStatusReadGuard.test.js`, `src/lib/orderPaymentReferenceGuard.test.js`.

**Test files** (22): one per source file above, plus `PublicMenuCallbackIntegration.test.jsx`, `PublicMenuOrderCreationWiring.test.jsx`, `PublicMenuPaymentFirstCheckoutWiring.test.jsx`, `orderFromPayment.test.js`, `orderPaymentSync.test.js`, `paymentWebhookSyntheticE2E.test.js`, `useCheckoutPaymentFirst.test.js`.

---

# 31. FILES_MODIFIED

`src/features/menu/CartDrawer.jsx`, `src/features/menu/hooks/cartHelpers.js` (+`.test.js`), `src/features/menu/hooks/useCheckout.js`, `src/features/menu/i18n.js`, `src/pages/PublicMenu.jsx`, `src/payments/adapters/moyasar.js`, `src/payments/index.js`, `src/payments/services/index.js`, `src/payments/services/paymentService.js`, `src/payments/types/index.js`, `src/payments/utils/index.js`, `supabase/functions/payment-webhook/handler.js`, `tests/unit/CartDrawer.test.jsx`, `tests/unit/MoyasarAdapter.test.js`, `tests/unit/paymentService.test.js`, `tests/unit/paymentWebhook.test.js`.

---

# 32. REPORTS_CREATED

Approximately 95 reports across this arc (`TASK_3_4_*` through `TASK_3_6D_10_*`, plus `DEDICATED_PAYMENT_SANDBOX_*`, `STAGING_TARGETED_PAYMENT_PARITY_*`, `STAGING_SCHEMA_PARITY_AUDIT_REPORT.md`, `PHASE_3_PREFLIGHT_REPORT.md`, `TASK_3_6_SCOPE_ARCHITECTURE_AUDIT.md`, `TASK_3_6F_PAYMENT_IDEMPOTENCY_INDEX_REPORT.md`) — the exact list committed alongside this document is enumerated in `TASK_3_6D_12_FINAL_DOCUMENTATION_GIT_INTEGRATION_REPORT.md`'s own `FILES_INCLUDED` section.

---

# 33. KNOWN_RISKS

- The `succeeded` code path inside both `payment-first-checkout` (real `startCharge`) and `payment-webhook` (real HMAC-verified update) has never executed against a real Moyasar charge — only against mocks and non-payment staging requests.
- No live browser has ever rendered the payment-first UI — all verification is `happy-dom`-based.
- `useCheckout.js` now has two parallel "start an order" entry points with intentionally duplicated validation/items-mapping logic (deliberate, to avoid touching the cash path at all) — a small, contained, already-disclosed tradeoff.
- Two small, intentional, already-documented code duplications remain (tenant-resolution helpers between two Edge Functions; webhook-handling logic between `paymentService.js` and `payment-webhook/handler.js`, a long-standing Deno-compatibility workaround).

---

# 34. DEFERRED_ITEMS

- Setting the three external secrets (requires dashboard/CLI access this session lacks).
- Deploying a frontend build to staging.
- Attempting `npx playwright install` to determine real browser-E2E feasibility on this platform.
- Any live Moyasar transaction of any kind.

---

# 35. EXACT_FUTURE_STEPS

1. Owner (or someone with Supabase dashboard access) sets `PUBLIC_APP_BASE_URL`, `PAYMENT_MOYASAR_WEBHOOK_SECRET`, `PAYMENT_MOYASAR_SECRET_KEY` on the staging project.
2. Deploy a frontend build to staging (or another environment `PUBLIC_APP_BASE_URL` can point at).
3. Resolve the browser-automation question — either manual owner testing (a step-by-step script can be produced on request from the existing E2E scenario matrices in `TASK_3_6D_7`/`3.6D.8`) or a future session with a working browser tool.
4. Only after 1-3: attempt a real, single, controlled Moyasar sandbox transaction and document it as genuinely `LIVE MOYASAR VERIFIED` for the first time — never claim this status before that point.
