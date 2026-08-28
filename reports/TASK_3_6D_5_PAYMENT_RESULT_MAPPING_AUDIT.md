# Task 3.6D.5 — Payment-First Result Mapping Audit

**AUDIT/SPECIFICATION ONLY. Zero source code changed. Zero tests changed. No deployment.**

---

# EXECUTIVE_SUMMARY

The CRITICAL PRINCIPLE this task opens with — payment success must not automatically be treated as order confirmation — is not merely a design guideline to keep in mind going forward. **It is already a hard architectural fact in this codebase**: `createOrderFromSuccessfulPayment` (built in `TASK-PAY-3.6B`, unmodified since) is a **separate, distinct, currently browser-unreachable** step from payment success, and re-reading its exact signature during this audit surfaces a concrete, previously-undocumented-as-a-gap consequence: **it requires `customerPhone` (required) and accepts `tableNumber`/`deliveryAddress`/`customerName`/`notes` (execution-only fields deliberately excluded from the payment snapshot for PII-minimization, per `TASK-PAY-3.6A-1b.2`) — none of which survive the full-page Moyasar redirect round trip in current React state.** A customer landing back on `/menu/:slug?payment_callback=...` today has no order yet, and — as the code exists right now — **no mechanism exists anywhere in the browser-reachable stack to create one**, because the data needed to do so was never designed to be recoverable after a real, cross-origin redirect.

This is not a new discovery invented by this audit — `createOrderFromSuccessfulPayment`'s own doc comment already says so explicitly: *"استرداد الطلب دون وجود متصفّح يبقى مسؤولية 3.6E المستقبلية"* ("recovering the order without a browser remains a future 3.6E responsibility"). This audit's contribution is tracing exactly *why* that's true down to the specific missing fields, and finding that **part of the gap already has a clean, reuse-based answer** while another part genuinely needs a new decision.

**Two concrete findings, one already-solvable, one requiring an owner decision**:
1. **QR-scoped checkouts**: `table_number` is fully recoverable without any new persistence — the approved return-URL contract (`TASK_3_6D_4_C_1`/`C_2`) already carries `table=<qrToken>` back to the browser, and `PublicMenu.jsx` already calls `resolve_table_qr` with it. No new mechanism needed here.
2. **`customer_phone` (always required) and non-QR `table_number`/`delivery_address` (when applicable)**: genuinely lost across the redirect today. The existing cash-flow's own `PHONE_STORAGE_KEY = simsim_phone_${slug}` (`useCheckout.js`) is a directly-reusable **precedent** for solving this — but it currently writes **after** order success; payment-first would need the equivalent write to happen **before** the Moyasar redirect, a genuine (if small) new design point requiring explicit owner approval, not something this audit decides.

Beyond that, this audit confirms `PaymentFirstCallbackLanding`'s existing `SUCCEEDED`/`FAILED`/`PENDING`/`UNKNOWN`/`RETRYABLE_ERROR` state handling is **already correctly conservative** in every case this task asks about — none of it needs to change. What's missing is entirely **downstream** of that component: a transitional "confirming your order" step, a new server-side order-creation trigger (itself needing its own `TASK_3_6D_4_A`-style spec-and-approval cycle), and — once an order exists — reuse of the **already-generic, already-reusable** `OrdersScreen.jsx` for final confirmation, exactly as `TASK_3_6D_A` originally predicted.

---

# CURRENT_PAYMENT_FLOW

Traced through the actual, unmodified code, not re-derived from memory of prior reports: `initiatePaymentFirstCheckout` → `create_order(dry_run=true)` → `buildCheckoutSnapshot` (stores cart identity + computed total, **not** phone/table/address/name/notes) → `paymentService.startCharge` → `payment_transactions` row (`status='initiated'` → provider call → `status` updated to whatever Moyasar returns) → customer redirected to Moyasar's hosted page → Moyasar redirects back to `${PUBLIC_APP_BASE_URL}/menu/${slug}?payment_callback=<key>[&branch=<id>|&table=<qrToken>]` (`TASK_3_6D_4_C_2`, now live) → `PublicMenu.jsx`'s new gate (`TASK_3_6D_4_C_3`, now live) renders `PaymentFirstCallbackLanding` → `get_payment_status_by_idempotency_key` RPC (staging-verified, `TASK_3_6D_4_B_2`) resolves `status`/`amount`/`currency` from `payment_transactions`, sourced from `localStorage`, never the URL. **This entire chain ends at "here is the payment's status."** Nothing downstream of it currently runs.

---

# CURRENT_ORDER_FLOW

`createOrderFromSuccessfulPayment(input, {db})` (`TASK-PAY-3.6B`, re-read in full for this audit): loads `payment_transactions` by ID (server column is the only trust source for `status`), rejects if not `SUCCEEDED`, checks for an already-existing order for this `payment_transaction_id` (idempotent-replay — see IDEMPOTENCY_BEHAVIOR), rebuilds the cart entirely from the stored snapshot (never from a new client payload), verifies the snapshot's fingerprint and amount, then calls `create_order(dry_run=false)` using `paymentTx.restaurant_id` (authoritative) + `snapshot.branch_id`/`items`/`type`/`coupon_code` (from the snapshot) + **`input.customerPhone`/`tableNumber`/`deliveryAddress`/`customerName`/`notes`** (from the *caller*, not the snapshot — the gap this audit centers on). **This function has zero live callers anywhere in the browser-reachable code today** — confirmed by search; it is exercised only by its own unit tests (`orderFromPayment.test.js`).

---

# PAYMENT_ORDER_RELATIONSHIP

`payment_transactions` never references an order (no such column). `orders.payment_transaction_id` is the reverse reference (order → payment, nullable, unique-indexed), created only by `create_order`'s own `p_payment_transaction_id` parameter — meaning **the order, when it eventually exists, points back to the payment; the payment never points forward to an order.** This is why "is there an order identifier available in the browser after redirect" (audit question 5) has a clean, structural answer: **no, by design — none can exist until `createOrderFromSuccessfulPayment` actually runs, which nothing currently triggers.**

---

# AUDIT_ANSWERS (questions 1–16)

1. **What record exists before/while payment starts?** A `payment_transactions` row (`initiated` → provider-reported status), created by `startCharge`. No `orders` row.
2. **Order created before payment?** No — `initiatePaymentFirstCheckout` only ever calls `create_order` with `p_dry_run=true` (pricing/validation only, never persists).
3. **Order created after payment?** Only if `createOrderFromSuccessfulPayment` is called — which, today, nothing does.
4. **Does `payment_transactions` reference an order?** No (see PAYMENT_ORDER_RELATIONSHIP).
5. **Order identifier available in browser after redirect?** No — none exists yet in the common case.
6. **Order identifier stored alongside the payment idempotency key?** No — `localStorage` holds only the payment key (`usePaymentIdempotencyKey`/`useResumedPaymentIdempotencyKey`), nothing order-related.
7. **Does the webhook create/update an order?** No — re-confirmed by re-reading `payment-webhook/handler.js` in full for this audit; it touches only `payment_transactions`/`payment_webhook_events`.
8. **Can payment succeed while order creation is still pending?** Yes — structurally guaranteed by the two-step design; there is always a window (currently unbounded, since nothing triggers step two) between payment success and any order existing.
9. **Can payment succeed while order creation fails?** Yes, and `createOrderFromSuccessfulPayment` already has fully-coded, already-tested failure branches for exactly this: `snapshot_missing`/`snapshot_invalid`/`snapshot_fingerprint_mismatch`, `amount_integrity_violation`, `snapshot_restaurant_mismatch`, `create_order_failed` (e.g. a product went unavailable between checkout and payment completion), and `price_drift_requires_reconciliation` (a G-5-style genuine ambiguity, same honest-non-claim treatment already used elsewhere in this arc). None of this is new to build — it already exists, untested-in-production only because nothing calls it yet.
10. **Can payment fail while an order exists?** Only via refund, post-creation — and `syncOrderStatusFromPayment` (`TASK-PAY-3.6C.1`/`3.6C.2`/`3.6C.3.1`, already live, already tested) already correctly cancels a non-completed order when its payment is refunded. This path is fully solved already.
11. **Browser closes before webhook delivery?** The payment transaction sits at whatever status Moyasar last reported (often still `pending`); nothing is lost server-side, but no browser will ever observe the eventual `succeeded`/`failed` transition unless the customer returns to a URL carrying the same key, or a background reconciliation process (3.6E, still not started) later resolves it via `confirmCharge`.
12. **Webhook arrives after browser callback?** `PaymentFirstCallbackLanding`'s RPC read at that moment sees `pending`/`initiated` — correctly shown as `PENDING`, never a false claim — and either the bounded poll catches the later update or the customer must return again/click "Check again."
13. **Browser callback arrives before webhook?** Same mechanism, same honest outcome — timing-symmetric with 12.
14. **Authoritative for payment?** `payment_transactions.status` — unchanged, re-confirmed.
15. **Authoritative for order?** Existence of an `orders` row with `payment_transaction_id = <tx.id>` (enforced unique), and its own `status` column thereafter.
16. **Authoritative for final customer-facing confirmation?** **Must be order existence + order status, never payment status alone** — this is the CRITICAL PRINCIPLE, and it is not merely a UX preference: given finding 9 above, a customer could have a fully successful payment and *still* have no valid order (a product went unavailable in the interim) — telling them "success" based on payment status alone would be **factually wrong**, not just premature.

---

# STATE_MACHINE (recommended, not implemented)

```
PaymentFirstCallbackLanding resolves payment status
        │
        ├─ SUCCEEDED ──► [NOT YET BUILT] "Payment received — confirming your order…"
        │                       │
        │                       ▼ (new server-side trigger, 3.6D.6's scope)
        │                createOrderFromSuccessfulPayment (already built, already tested,
        │                already idempotent — just needs a caller + the missing fields)
        │                       │
        │              ┌────────┼────────┐
        │              ▼        ▼         ▼
        │          succeeded  price_drift  create_order_failed / snapshot_*
        │              │      _requires_       │
        │              │      reconciliation   │
        │              ▼        ▼              ▼
        │       reuse OrdersScreen   "still confirming,   "payment succeeded but your
        │       (setActiveOrders +    check back" (NOT     order could not be created —
        │        setOrderPlaced,      "failed")            contact support" (payment is
        │        exactly like cash                         real; this is the one case
        │        flow already does)                        needing human follow-up)
        │
        ├─ FAILED ──────► already correct, unchanged: safe recovery UI, no auto-retry
        ├─ PENDING ─────► already correct, unchanged: bounded poll, manual "Check again" after
        ├─ UNKNOWN ─────► already correct, unchanged: honest "not found," no claim either way
        └─ RETRYABLE_ERROR ► already correct, unchanged: "Check again" re-reads, same key, no new attempt
```

---

# PAYMENT_SUCCEEDED_MAPPING

**Recommended**: neither "immediately show success" (factually risky per finding 9) nor silent, indefinite waiting — a **transitional** "payment received, confirming your order" state, followed by a bounded, polling-based order-creation check (mirroring the *exact already-proven* pattern used for payment status itself: bounded attempts, no infinite loop, honest degrade-to-manual-retry). This directly answers the task's own posed options: **"show 'payment received, confirming order'" + "poll" is the right combination**, not any single one alone. This state does not yet exist in code (`PaymentFirstCallbackLanding`'s `SUCCEEDED` case currently just shows the amount/currency and stops) — building it is 3.6D.6's scope, not this audit's to implement, but its *shape* is now well-specified.

---

# PAYMENT_FAILED_MAPPING

Already correct, already implemented, needs no change: `PaymentFirstCallbackLanding`'s `FAILED` state shows a generic, safe message and a "back to menu" recovery action — no `failure_reason` is ever exposed (the RPC doesn't return it, by design, per `TASK_3_6D_4_A`). No automatic retry exists anywhere in this path. A future "retry" affordance, if ever added, **must** route through the *entire* checkout flow again (new cart submission, new dry-run, new idempotency key via `usePaymentIdempotencyKey`'s own existing generate-if-absent logic) — never a re-poll of the same, now-terminal transaction. This is stated here as a binding constraint for any future task, not a new design.

---

# PAYMENT_PENDING_MAPPING

Current bounded polling (5 additional attempts, 3 seconds apart, ~15 seconds total, then a manual "Check again" button, unlimited manual re-checks thereafter) is **structurally sufficient** — it never falsely claims an outcome and never polls forever. Whether **15 seconds specifically** is the right window given real Moyasar webhook latency is an open **tuning** question (already flagged as a warning in `TASK_3_6D_4`'s own report), not a **correctness** gap — this audit does not recommend changing the mechanism, only notes the number itself remains untested against real traffic (same G-6-adjacent caveat as everything else Moyasar-timing-related in this arc).

---

# UNKNOWN_MAPPING

Already correct: "this payment attempt could not be found," safe recovery action, no claim of success or failure. No change recommended.

---

# RETRYABLE_ERROR_MAPPING

"Check again" is appropriate and safe **specifically because** it re-invokes `resolveStatus()` — the *same* RPC read, with the *same* `resumedKey`, never `usePaymentIdempotencyKey`'s generation path (that hook isn't even used by `PaymentFirstCallbackLanding`; it uses the read-only `useResumedPaymentIdempotencyKey`, which is structurally incapable of creating a key — confirmed, unchanged since `TASK_3_6D_4`). No risk of an accidental new idempotency key from this action.

---

# BROWSER_REFRESH_BEHAVIOR

For the **existing**, already-live payment-status resolution: fully safe today — a refresh re-mounts `PaymentFirstCallbackLanding`, re-reads the *same* `localStorage` key (never regenerated), re-queries the *same* RPC — no duplicate anything is possible, confirmed by the component's own architecture (no write path exists in its dependency chain at all).

For the **future**, not-yet-built order-creation step: safety is **already structurally provided** by `createOrderFromSuccessfulPayment`'s own existing idempotent-replay check (`reReadOrderByPaymentTransactionId`, `TASK-PAY-3.6B`) — if a refresh causes the future trigger to call this function a second time for the same `paymentTransactionId`, it returns the **already-created** order instead of attempting a duplicate. This is not something 3.6D.6 needs to build; it already exists and is already tested. The only new refresh-safety surface 3.6D.6 will need to design is at the **triggering mechanism** itself (whatever new Edge Function/RPC gets built) — it should be written to rely on this existing idempotency rather than add its own separate guard, to avoid two independent, potentially-inconsistent safety mechanisms.

---

# WEBHOOK_RACE_BEHAVIOR

Fully covered in AUDIT_ANSWERS 11–13. No new finding beyond what `TASK_3_6D_4_A`/`TASK_3_6D_4` already established: the webhook and the browser callback are independent, racing observers of the same authoritative `payment_transactions.status` column; neither can corrupt the other, and the UI's job in every interleaving is the same — reflect current DB state honestly, never assume based on timing.

---

# IDEMPOTENCY_BEHAVIOR

- **Payment attempt**: unaffected by any callback-page refresh — `localStorage`-sourced, read-only from the callback's perspective, unchanged.
- **Order creation** (future): already idempotent at the function level (`createOrderFromSuccessfulPayment`'s existing pre-check), **once wired**.
- **Result mapping**: purely a function of current DB state on every render/poll — no client-side "have I already shown this" flag is needed or should be added; re-deriving from source is always safe and simpler.
- **`localStorage` key**: unaffected; the same key persists across refreshes until an explicit terminal-outcome clear (already correctly scoped to `PaymentFirstCheckoutPanel`, not the callback component, per `TASK_3_6D_4`).
- **Webhook races**: covered above — races don't affect idempotency, only *timing* of when the correct answer becomes visible.

---

# ORDER_CONFIRMATION_RELATIONSHIP

Once an order exists (via the future trigger), **no new confirmation UI needs to be designed** — `OrdersScreen.jsx`'s existing prop contract (`activeOrders`, `itemName`, `cancelOrderByCustomer`, `onReorder`, `onMessage`, etc., re-verified by reading its full signature during this audit) is already completely generic with respect to *how* an order was created; it consumes exactly `{id, orderNumber, accessToken, status, items, total, tableNumber, orderType, source, deliveryAddress}`-shaped objects, the **same shape** `useCheckout.js`'s cash flow already pushes into `setActiveOrders` today, and the **same fields** `createOrderFromSuccessfulPayment`'s own success return already provides (`orderId`, `orderNumber`, `accessToken` directly; `status`/`total`/etc. via a follow-up read or the function's own return, already itemized in `TASK_3_6D_A`'s prior audit). This re-confirms `TASK_3_6D_A`'s original prediction was correct: `OrdersScreen` needs zero changes for payment-first — this is squarely a "wire the existing thing," not "build a new thing," situation, exactly matching this task's own instruction not to design a new visual system where one already works.

---

# EXISTING_UI_CONVENTIONS

- **Full-screen takeover pattern**: `orderPlaced && ordering → OrdersScreen`, `notFound → ...`, `rawTableQrToken && !tableQr → ...`, and now `paymentCallbackActive → PaymentFirstCallbackLanding` (`TASK_3_6D_4_C_3`) — the future "confirming your order" transitional state and the eventual order-confirmation screen should both continue this exact pattern, not introduce an overlay/modal style.
- **Accessibility**: `role="status"`/`role="alert"` + `aria-live="polite"` already used consistently across `PaymentFirstPriceConfirmation`, `PaymentFirstCheckoutPanel`, and `PaymentFirstCallbackLanding` — the future transitional/confirmation states should reuse this, not invent new patterns.
- **Language/RTL**: `t`/`isEn`/`brandColor` prop-threading is already the established convention throughout every payment-first component; no new i18n mechanism is needed, only new `TT` keys in `src/features/menu/i18n.js` (same file already extended three times in this arc for exactly this purpose).
- **Cart state**: already correctly out of scope for the callback/result path — the cart itself was only ever relevant at checkout-initiation time (captured in the snapshot); nothing in the result-mapping phase should read or write `cart`/`useCart` state at all.
- **Recovery action style**: `onRecover`-style `navigate('/menu/:slug', {replace:true})`, already established in `TASK_3_6D_4_C_3`'s own integration — reusable verbatim for any new terminal/error state this phase adds.

---

# RECOMMENDED_ARCHITECTURE (for future tasks — not decided or implemented here)

1. **A new, narrow server capability** to trigger `createOrderFromSuccessfulPayment` — structurally an Edge Function (not a SQL RPC: the function is JS orchestration calling `create_order` internally plus fingerprint/amount verification logic, the same reasoning that made `payment-first-checkout` itself an Edge Function rather than a raw RPC in `TASK_3_6D_4_A`'s own Design-B-vs-Design-A analysis). This needs **its own `TASK_3_6D_4_A`-style specification-and-approval cycle** before any implementation — request/response contract, auth model, what fields it accepts, rate-limiting posture — mirroring the rigor already applied to the status-read RPC.
2. **Resolve the missing-fields gap** as an explicit owner decision (not decided here): either (a) persist `customer_phone` (and `table_number`/`delivery_address` for non-QR paths) to `localStorage` at checkout-initiation time, before the Moyasar redirect — directly reusing the cash flow's own `PHONE_STORAGE_KEY` **pattern**, just timed differently — or (b) re-collect these fields via a small form shown during the new "confirming your order" transitional state. QR `table_number` specifically needs **no new persistence at all** — it's already recoverable via the return URL's `table=` parameter + the existing `resolve_table_qr` RPC, both already live.
3. **A "confirming your order" transitional UI state**, bounded-polling the new capability exactly as `PaymentFirstCallbackLanding` already bounded-polls payment status — same pattern, same discipline, not a new mechanism.
4. **On success, reuse `OrdersScreen`** via the exact same `setActiveOrders`/`setOrderPlaced(true)` mechanism the cash flow already uses — no new confirmation UI.
5. **On order-creation failure** (the already-coded `createOrderFromSuccessfulPayment` failure branches), a distinct, honest message: *"your payment succeeded, but we couldn't finalize your order — [contact support / reference info]"* — never framed as a failed payment, since it isn't one.

---

# EXACT_FUTURE_INTEGRATION_POINTS

- **`PaymentFirstCallbackLanding.jsx`**: its `SUCCEEDED` branch would need to transition into the new "confirming" sub-flow rather than terminating at the amount/currency display it shows today — a real, if modest, change to this component, not merely to its host.
- **`PublicMenu.jsx`**: the eventual "order confirmed" outcome should feed into the *already-existing* `setActiveOrders`/`setOrderPlaced` state this file already owns for the cash flow — no new state container needed, just a new call site.
- **`src/features/menu/i18n.js`**: new `TT` keys for the transitional/order-failure copy, following the exact pattern of the `pfCallback*` keys already added in `TASK_3_6D_4`.

---

# REQUIRED_CODE_CHANGES (for future tasks, not made here)

- A new Edge Function (name TBD by its own spec task) wrapping `createOrderFromSuccessfulPayment`.
- A decision-dependent small addition for phone/table/address persistence (localStorage write at checkout time, or a re-collection form) — exact files depend on the owner decision in RECOMMENDED_ARCHITECTURE item 2.
- `PaymentFirstCallbackLanding.jsx`: new `CONFIRMING_ORDER` state (or similar), a new bounded-poll cycle against the new capability.
- `PublicMenu.jsx`: wiring the eventual order result into `setActiveOrders`/`setOrderPlaced`.
- New i18n keys.

None of this is implemented in this task.

---

# REQUIRED_DATA_DEPENDENCIES

`paymentTransactionId` (server-side only, never exposed to the browser today — the new Edge Function would need to resolve it itself, the same way `payment-first-checkout` resolves tenant context server-side, likely by looking it up via the same idempotency key the browser already has, mirroring the status-RPC's own lookup pattern exactly). `customerPhone` (missing today, per EXECUTIVE_SUMMARY). Optionally `tableNumber`/`deliveryAddress`/`customerName`/`notes` depending on order type — QR `tableNumber` alone is already recoverable without new dependencies.

---

# REQUIRED_SERVER_CAPABILITIES

One new Edge Function (RECOMMENDED_ARCHITECTURE item 1) — not built, not specified in detail here (that is explicitly the next task's job, mirroring `TASK_3_6D_4_A`'s own role relative to `TASK_3_6D_4_B`). No new RPC, no SQL/schema change is implied by anything found in this audit — `createOrderFromSuccessfulPayment` and `create_order` both already exist, unmodified, sufficient as-is.

---

# SECURITY_ANALYSIS

All of this task's CRITICAL SECURITY constraints are **already satisfied by the existing code** and this audit found no reason any future task should need to weaken them:
- URL parameters are never payment status (unchanged, re-confirmed).
- Redirect is never proof of payment (unchanged, re-confirmed).
- No internal payment ID or `providerRef` is exposed anywhere in the current chain (unchanged, re-confirmed against the RPC's own field list, staging-verified in `TASK_3_6D_4_B_2`).
- No browser-side Moyasar call exists or is proposed (the new Edge Function, like every other server capability in this arc, would be the only thing ever calling Moyasar-adjacent server logic, and even then indirectly — `createOrderFromSuccessfulPayment` itself never calls Moyasar at all, only `create_order`).
- No direct `payment_transactions` query from the browser exists or is proposed.
- No automatic checkout rerun exists or is proposed — the future order-creation trigger is a **distinct** action from `startCheckout`/`initiatePaymentFirstCheckout`, never a re-invocation of them.
- **No duplicate order from a refresh** — already structurally guaranteed by `createOrderFromSuccessfulPayment`'s existing idempotent pre-check (IDEMPOTENCY_BEHAVIOR above), a genuine, verifiable safety property, not an assumption.
- The one genuinely **new** security surface any future task will need to design carefully: whatever mechanism resolves `paymentTransactionId` server-side from the browser's idempotency key for the new Edge Function's own internal use — this must **never** return that ID to the browser (consistent with every prior decision in this arc), and its own request/response contract deserves the same scrutiny `TASK_3_6D_4_A` gave the status-read RPC (anonymous exposure, rate limiting, enumeration resistance) — flagged as required future work, not resolved here.

---

# TEST_STRATEGY (for future tasks)

- Unit tests for the new Edge Function, mirroring `payment-first-checkout/handler.test.js`'s own DI-based, no-real-Moyasar/no-real-Deno conventions.
- Component tests for `PaymentFirstCallbackLanding`'s new `CONFIRMING_ORDER` state, mirroring its own existing 18-test structure (bounded polling already has a proven test pattern from `TASK_3_6D_4`'s `PFCL-13`/`13b`, directly reusable).
- Regression tests confirming `createOrderFromSuccessfulPayment`'s existing, already-passing test suite (`orderFromPayment.test.js`) remains green and unmodified — this audit found no reason that function itself needs any change, only a caller.
- An explicit test proving a double-invocation of the new trigger (simulating a refresh) produces exactly one order, not two — exercising the existing idempotent-replay path end-to-end through the new entry point, not just at the already-tested function level.

---

# FAILURE_SCENARIOS

Already enumerated in AUDIT_ANSWERS 8–13 and PAYMENT_SUCCEEDED_MAPPING's state-machine diagram: order-creation failure after successful payment (multiple already-coded sub-reasons), webhook/browser race in either direction, browser closed before resolution (ties to the still-not-started 3.6E), and refund-after-order-creation (already solved by existing `syncOrderStatusFromPayment`). No failure mode was found that lacks either an existing, tested handling path or a clearly-scoped future task to build one.

---

# OWNER_DECISIONS_REQUIRED

1. **How to recover `customer_phone` (and non-QR `table_number`/`delivery_address`) after the redirect** — persist before redirect (reusing the cash flow's `PHONE_STORAGE_KEY` pattern, retimed) vs. re-collect via a small form during the transitional state. This is the single most consequential open decision from this audit.
2. **Approve commissioning a dedicated spec task** for the new order-creation-trigger Edge Function, mirroring `TASK_3_6D_4_A`'s process, before any implementation begins.
3. **Approve the recommended state machine** (transitional "confirming" state, bounded polling, `OrdersScreen` reuse on success, distinct honest messaging on order-creation failure) as the target architecture for 3.6D.6, or direct otherwise.
4. **Confirm the ~15-second bounded polling window** (inherited from `PaymentFirstCallbackLanding`'s existing payment-status polling, likely to be mirrored for order-creation polling too) is acceptable pending real-traffic tuning data, or direct a different default.

---

# EXPLICIT_NON_GOALS

- Implementing any part of the recommended architecture.
- Modifying `PaymentFirstCallbackLanding.jsx`, `PublicMenu.jsx`, `paymentService.js`, `payment-webhook`, `createOrderFromSuccessfulPayment`, `create_order`, or any RPC/SQL file.
- Specifying the new Edge Function's exact contract in full (that is the next, separate spec task's job).
- Deciding the phone/table/address persistence question (OWNER_DECISIONS_REQUIRED item 1).
- Starting `3.6D.6`, `3.6D.7`, or `3.6E`.
- Any deployment.

---

# RISKS

- **If 3.6D.6 is ever built without first resolving the missing-fields gap**, the new trigger would either silently fail for every real customer (missing required `customer_phone`) or need to be built around a half-finished persistence mechanism improvised under time pressure — this audit exists specifically to prevent that by surfacing the gap now, before any implementation attempt.
- **If the transitional "confirming" state is skipped** and `SUCCEEDED` is left showing only amount/currency (today's actual behavior), a customer whose order-creation later fails (finding 9) would have already seen what reads as a success message with no indication anything might still go wrong — not a security risk, but a real trust/expectations risk worth avoiding deliberately, not by accident.
- **Scope-creep risk**, consistent with this entire arc's own pattern: the temptation to bundle the new Edge Function's build with unrelated fixes (e.g., the still-open `TASK_3_6D_4_C_3` QR-branch-fallback limitation) should be resisted — each deserves its own task.

---

# DEFERRED

- The new order-creation-trigger Edge Function and its own spec task.
- The phone/table/address persistence mechanism (whichever option is chosen).
- `PaymentFirstCallbackLanding`'s new `CONFIRMING_ORDER` state and its bounded polling.
- Wiring the eventual order result into `PublicMenu.jsx`'s existing `setActiveOrders`/`setOrderPlaced`.
- `3.6D.7` (E2E tests across the full flow) — depends on all of the above existing first.
- `3.6E` (reconciliation) — independently already deferred throughout this arc; this audit's findings (especially AUDIT_ANSWERS 11) reinforce why it will eventually matter, but do not change its scope.

---

# IMPLEMENTATION_SEQUENCE (recommended, for future tasks)

1. Owner decision on OWNER_DECISIONS_REQUIRED item 1 (missing-fields recovery strategy).
2. A dedicated `3.6D.6-A`-style specification task for the new order-creation-trigger Edge Function (mirroring `3.6D.4-A`), incorporating whichever persistence/re-collection decision was made in step 1.
3. A dedicated implementation task for that Edge Function (mirroring `3.6D.4-B`), with its own staging verification (mirroring `3.6D.4-B.1`/`B.2`).
4. `PaymentFirstCallbackLanding`'s new `CONFIRMING_ORDER` state and bounded polling, calling the now-implemented capability.
5. `PublicMenu.jsx` wiring into `setActiveOrders`/`setOrderPlaced` on success; the honest order-creation-failure message on the already-coded failure branches.
6. Only then, `3.6D.7`'s end-to-end tests become meaningful across the full flow.

---

# GIT_STATUS

No file was created or modified by this task beyond this report. `git status --short`/`git diff --stat` are byte-identical to the pre-task baseline (14 tracked files, 800 insertions(+), 25 deletions(-); the same set of pre-existing untracked files from prior tasks, none new except this report). No commit, no push, no merge.

# REGRESSION_BASELINE

**914/914 remains unchanged** — this task performed zero code or test changes; confirmed by the git-diff comparison above.

---

# NEXT_STEP

Awaiting explicit owner decisions on the `OWNER_DECISIONS_REQUIRED` list above — in particular, how `customer_phone`/`table_number`/`delivery_address` are recovered after the payment redirect, which is the single gap blocking any real progress on order confirmation. Per instruction: **stopping here.** Not implementing anything, and not proceeding to `3.6D.6`, `3.6D.7`, or `3.6E`.

---

*Report generated 2026-08-27. Audit only — no code, no schema, no deployment, no Moyasar call, no commit, no push, no merge.*
