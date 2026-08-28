# Task 3.6D.2 — Payment-First Price Confirmation UI Implementation

**Implements the Price Confirmation UI layer only. No payment initiation, no Edge Function change, no database change, no deploy.**

---

# EXECUTIVE_SUMMARY

Built a new, fully additive presentational component, `PaymentFirstPriceConfirmation.jsx`, that renders the three pre-payment states `usePaymentFirstCheckout` (TASK-PAY-3.6D.1, unmodified) can produce: `STARTING` (checking price), `PRICE_CHANGED` (requires explicit customer confirmation before any payment attempt), and `REJECTED` (terminal, cannot proceed). It reuses the hook's existing output shape verbatim — no pricing computation, no network call, no state management of its own. A small companion pure-function module, `paymentFirstErrors.js`, maps the payment-first flow's machine-readable rejection reasons to bilingual messages, reusing the existing `mapOrderError` for the one reason (`dry_run_failed`) whose underlying message is literally the same `create_order` error surface the legacy checkout already handles — avoiding any duplicate error-string maintenance. No existing file was modified except adding 3 new translation keys to `i18n.js` (net +4 lines). No hook, no Edge Function, no database, and no existing checkout file (`useCheckout.js`, `CartDrawer.jsx`, `PublicMenu.jsx`) was touched. 833/833 tests pass (812 baseline from 3.6D-E + 21 new).

---

# OBJECTIVE

Build the price-confirmation UI layer for the payment-first checkout flow: present the server-authoritative price to the customer for explicit confirmation, never allow silent proceed on a stale/client-computed amount, and keep this concern decoupled from actually initiating payment — per the task's 10 stated objectives, all addressed (see UX/STATE_FLOW_BEHAVIOR and SECURITY_CONSIDERATIONS below).

---

# EXISTING_ARCHITECTURE_REVIEWED

- **`src/features/menu/hooks/useCheckout.js`** (legacy, non-payment-first flow) — the established precedent for this exact UX problem. `submitOrder()` calls `create_order`/`create_order_from_table_qr` with `p_client_total`; if the server's dry-run-equivalent check finds a mismatch (`price_changed=true` or no `id` returned), it sets `priceChangeInfo = { oldTotal, newTotal }` **and never creates an order**. `confirmPriceUpdate()` is the customer's only path forward — it resubmits with `clientTotalOverride = priceChangeInfo.newTotal`, i.e. the server's own previously-quoted total, not a client recomputation.
- **`src/features/menu/CartDrawer.jsx`** — renders `priceChangeInfo` as an inline banner (old total struck through → new total), gates the main "confirm order" button off entirely while `priceChangeInfo` is set (`canSubmit = ... && !priceChangeInfo`), and offers only the explicit "حدّث وتابع" (Update & continue) action to proceed. This is the exact visual/UX convention this task's component mirrors.
- **`src/features/menu/hooks/usePaymentFirstCheckout.js`** (TASK-PAY-3.6D.1, read, not modified) — already exposes exactly what's needed: `state` (a 9-value `CheckoutState` enum, including `PRICE_CHANGED` and `REJECTED`), `result` (the raw backend response, including `result.dryRun` on `PRICE_CHANGED` and `result.reason`/`result.message` on `REJECTED`), `isLoading`, `startCheckout`, `reset`.
- **`src/payments/services/checkoutOrchestration.js`** (`initiatePaymentFirstCheckout`, read, not modified) — confirmed structurally that every `status: 'rejected'` return statement occurs *before* `paymentService.startCharge` is ever called (PHASE 7 in that file). This is what justifies scoping this component to exactly `STARTING`/`PRICE_CHANGED`/`REJECTED` — no `rejected` outcome can occur after a payment attempt has started, so this component's boundary cleanly matches "price confirmation" vs. "payment initiation" (task point 6).
- **`sql/order_idempotency.sql`** (read) — confirmed `price_changes` is `jsonb_build_array(jsonb_build_object('client_total', v_client_total, 'server_total', v_total))`: a single-element array carrying both the previously-asserted total and the new authoritative one, **both server-recorded**, not client-computed at render time. This is what the component uses for its "old → new" display — no client-side "previous total" prop was needed at all.
- **`src/features/menu/orderErrors.js`** (`mapOrderError`, read, reused) — the existing pure Postgres-error-message-substring-to-bilingual-text map used by `useCheckout.js`. Reused directly for the `dry_run_failed` rejection reason, since that reason's `message` field is literally a `create_order` RPC error (same underlying call, wrapped one layer deeper by `initiatePaymentFirstCheckout`'s own dry-run call).
- **`src/features/menu/i18n.js`** (`TT`/`makeT`, read, extended) — flat `{key: {ar, en}}` dictionary + `makeT(lang) => (key) => ...` factory. Reused `priceChangedTitle`, `priceChangedUpdateBtn`, `totalVat`, `vatLine`, `deliveryFee` verbatim (identical meaning, no need to duplicate). Added exactly 3 new keys for concepts with no existing equivalent (see FILES_MODIFIED).
- **`tests/unit/CartDrawer.test.jsx`** (read) — the established React-component test convention in this repo (`@vitest-environment happy-dom`, `render`/`screen`/`fireEvent`/`cleanup` from `@testing-library/react`, a local `t` mock dictionary, `defaultProps`, `beforeEach(vi.clearAllMocks)`/`afterEach(cleanup)`). Mirrored exactly for the new component test.

**No frontend integration of `usePaymentFirstCheckout` into any live page exists yet** (confirmed unchanged since 3.6D-A/B/D.1 — `usePaymentFirstCheckout` is still not called from `PublicMenu.jsx`/`CartDrawer.jsx`). This task does not change that — it builds the presentational piece a future wiring task (3.6D.3+) will consume.

---

# FILES_CREATED

- `src/features/menu/PaymentFirstPriceConfirmation.jsx` — the price-confirmation presentational component.
- `src/features/menu/paymentFirstErrors.js` — pure `mapPaymentFirstRejectionReason(reason, message)` function.
- `tests/unit/PaymentFirstPriceConfirmation.test.jsx` — 15 component tests.
- `tests/unit/paymentFirstErrors.test.js` — 6 pure-function tests.
- `reports/TASK_3_6D_2_PRICE_CONFIRMATION_UI_IMPLEMENTATION_REPORT.md` (this file).

# FILES_MODIFIED

- `src/features/menu/i18n.js` — 3 new keys added (net +4 lines including one comment line), inserted directly after the existing `priceChangedUpdateBtn` key:
  - `pfCheckingPrice` — "جارٍ التحقق من السعر النهائي…" / "Checking the final price…"
  - `pfCannotProceedTitle` — "تعذّر إتمام الطلب" / "Could not complete checkout"
  - `pfBackAction` — "رجوع" / "Back"

No other existing file was modified. `usePaymentFirstCheckout.js`, `checkoutOrchestration.js`, `paymentService.js`, the Edge Function, `useCheckout.js`, `CartDrawer.jsx`, `PublicMenu.jsx`, and every database/migration file are untouched.

---

# EXACT_IMPLEMENTATION_CHANGES

**`PaymentFirstPriceConfirmation.jsx`** — `export default function PaymentFirstPriceConfirmation({ state, result, onConfirm, onCancel, t, isEn, brandColor })`:
- `state === CheckoutState.STARTING` → a loading row (spinner + `t('pfCheckingPrice')`), `role="status"`/`aria-live="polite"`.
- `state === CheckoutState.PRICE_CHANGED`:
  - Defensive guard: `if (!result?.dryRun) return null` — no server pricing data, nothing rendered, nothing confirmable.
  - Reads `dryRun.price_changes[0]` (`{client_total, server_total}`, both server-recorded) if present, to show an "old → new" line; falls back to showing only the new total if `price_changes` is empty.
  - Renders the full authoritative breakdown (`subtotal`, `tax`, conditionally `delivery_fee`) directly from `dryRun` fields — no arithmetic performed in the component.
  - "حدّث وتابع" button calls `onConfirm(dryRun)` — passes the server object through unchanged; does not itself call `startCheckout`, does not initiate payment (task point 6).
  - "رجوع" button calls `onCancel()`.
- `state === CheckoutState.REJECTED`:
  - `mapPaymentFirstRejectionReason(result?.reason, result?.message)` resolves the message; rendered with `role="alert"`.
  - Only a single "رجوع" action — no confirm path (a rejected checkout cannot be "confirmed forward").
- Any other `state` (`IDLE`, or any post-payment-initiation state: `FAILED`, `RETRYABLE_ERROR`, `REQUIRES_RECONCILIATION`, `REDIRECT_REQUIRED`, `SUCCEEDED`) → renders `null`, by design — out of this component's scope.

**`paymentFirstErrors.js`** — `mapPaymentFirstRejectionReason(reason, message)`:
- `reason === 'dry_run_failed'` → `mapOrderError(message)` (delegates to the existing, already-tested map).
- Known reasons (`unsupported_currency`, `invalid_idempotency_key`, `snapshot_failed`, `amount_integrity_violation`, `snapshot_integrity_violation`, `tenant_not_found`) → a small bilingual dictionary, mirroring `orderErrors.js`'s structure exactly.
- Unknown/missing reason → a generic fallback message, never throws.

---

# UX_STATE_FLOW_BEHAVIOR

```
usePaymentFirstCheckout().state
        │
        ├─ IDLE ─────────────────────────► (nothing rendered — checkout not yet started)
        │
        ├─ STARTING ─────────────────────► "Checking the final price…" (loading, role=status)
        │
        ├─ PRICE_CHANGED ────────────────► price banner (old→new from server's own price_changes,
        │                                   full subtotal/tax/delivery breakdown from dryRun) +
        │                                   ["Update & continue" → onConfirm(dryRun)] ["Back" → onCancel()]
        │                                   (mirrors CartDrawer's existing priceChangeInfo pattern)
        │
        ├─ REJECTED ─────────────────────► rejection message (mapped from reason/message) +
        │                                   ["Back" → onCancel()]  (role=alert, no confirm path — terminal)
        │
        └─ FAILED / RETRYABLE_ERROR /
           REQUIRES_RECONCILIATION /       ► out of scope — nothing rendered (payment-initiation-phase
           REDIRECT_REQUIRED / SUCCEEDED     concerns, deferred to 3.6D.3+ per task point 6)
```

The customer can never see a "confirm and pay" affordance while `PRICE_CHANGED` is active without first explicitly clicking "Update & continue" — there is no code path in this component that lets a stale total silently carry forward, matching CartDrawer's own `canSubmit = ... && !priceChangeInfo` gating philosophy, just implemented as "nothing to submit is even rendered" rather than "a disabled submit button," since this component has no submit button of its own (point 6 keeps that action in the caller).

---

# SECURITY_CONSIDERATIONS

- **No client-provided total is ever treated as authoritative.** The component reads `dryRun.total`/`subtotal`/`tax`/`delivery_fee` — all server-returned fields — and renders them as-is. The one "old" value shown (`price_changes[0].client_total`) is itself an *echo of what the server recorded*, displayed for context only; it is never used to decide whether checkout can proceed, and no code path lets it substitute for `dryRun.total`.
- **No pricing/business logic is duplicated.** Verified: no arithmetic (`+`, `-`, `*`, `.reduce`) appears anywhere in `PaymentFirstPriceConfirmation.jsx` — confirmed by static grep during verification (see FOCUSED_TEST_RESULTS/verification below). Every number displayed is a direct, unmodified server field.
- **No secrets or server-only values are exposed.** Confirmed by grep: neither `PaymentFirstPriceConfirmation.jsx` nor `paymentFirstErrors.js` contains any reference to `service_role`, `SUPABASE_SERVICE_ROLE_KEY`, or any secret-shaped string. Neither file imports `supabase`, `initiatePaymentFirstCheckout`, or `paymentService` — confirmed both by a static grep and by an automated test (`PFC2-15`) that scans only the component's own `import` lines.
- **Payment initiation stays fully decoupled.** `onConfirm` passes the server's `dryRun` object back to the caller and does nothing else — this component never calls `startCheckout`, never touches `db`, never triggers a redirect. The actual "resubmit with the confirmed total" action remains the responsibility of whichever screen wires this component in (a later task), consistent with the task's explicit point 6.
- **Stale/rejected states cannot silently proceed.** `PRICE_CHANGED` requires an explicit click; `REJECTED` offers no forward path at all, only "Back."

---

# TESTS_ADDED

**`tests/unit/PaymentFirstPriceConfirmation.test.jsx`** — 15 tests (`PFC2-01` .. `PFC2-15`):
- `IDLE`/`SUCCEEDED`/`FAILED` render nothing (out-of-scope states).
- `STARTING` renders the loading indicator.
- `PRICE_CHANGED` without `dryRun` renders nothing (defensive guard against a confirm button with no pricing authority behind it).
- `PRICE_CHANGED` renders the authoritative total, the server-recorded old→new comparison, and the full subtotal/tax/delivery breakdown, with delivery fee shown only when non-zero.
- "Update & continue" calls `onConfirm` with the exact `dryRun` object, unmodified.
- "Back" calls `onCancel` in both `PRICE_CHANGED` and `REJECTED`.
- `REJECTED` renders a mapped message and no confirm affordance, including the `dry_run_failed` → real `create_order` message path and an unknown-reason fallback.
- A source-scan test confirming no `supabase`/`initiatePaymentFirstCheckout`/`paymentService` import in the component.

**`tests/unit/paymentFirstErrors.test.js`** — 6 tests (`PFE-01` .. `PFE-06`): `dry_run_failed` delegation to `mapOrderError` (both a known and an unknown underlying message), every other known reason returns a non-empty bilingual message, unknown/missing reason returns the generic fallback without throwing, and pure-function determinism.

Two self-inflicted issues were hit and fixed during authoring (both ordinary test-authoring mistakes, not the session's recurring self-referential-comment false positive): a text-collision in `PFC2-04` (test fixture accidentally used the same number for two different displayed fields, `20.00 ﷼` appearing twice) — fixed by using distinct fixture values; and a `PFC2-08` `rerender`-after-`cleanup()` misuse (calling `cleanup()` before `rerender` unmounts the root `rerender` needs) — fixed by removing the stray `cleanup()` call, since a single `render()` + `rerender()` pair doesn't need one.

---

# FOCUSED_TEST_RESULTS

```
npx vitest run tests/unit/PaymentFirstPriceConfirmation.test.jsx tests/unit/paymentFirstErrors.test.js
 Test Files  2 passed (2)
      Tests  21 passed (21)
```

Additional static verification performed (grep, not automated assertions, cross-checked against the automated `PFC2-15` scan):
- No `service_role`/`SUPABASE_SERVICE_ROLE_KEY`/`SECRET` string in either new file.
- No arithmetic pricing operators (`reduce`, `* item`, `.qty *`, `price *`) in `PaymentFirstPriceConfirmation.jsx`.
- No `supabase`/`fetch(`/`functions.invoke`/`.rpc(` call in either new file (the one grep hit was the component's own doc-comment describing this constraint in prose, not code).

---

# FULL_REGRESSION_TEST_RESULTS

```
npx vitest run
 Test Files  45 passed (45)
      Tests  833 passed (833)

npm test -- --run
 Test Files  45 passed (45)
      Tests  833 passed (833)
```

833 = 812 (the 3.6D-E baseline, itself 751 + 61) + 21 new this task. Both commands run to completion with zero failures; no pre-existing test was modified or deleted.

---

# BLOCKERS

None. This task required no change outside its own stated scope — no minimal compatibility fix to the Edge Function was needed (the component consumes only the hook's already-existing, already-tested output shape, which was unaffected by 3.6D-E).

---

# WARNINGS

1. This component is not yet wired into any live page — `usePaymentFirstCheckout` remains unconnected to `PublicMenu.jsx`/`CartDrawer.jsx`, unchanged from 3.6D-A/B/D.1's findings. It is a ready-to-use, fully-tested piece for whichever task performs that wiring (expected to be 3.6D.3 "Payment UI" or later, per the dependency gates already recorded in 3.6D-C).
2. `onConfirm`'s contract (return the confirmed `dryRun` object, let the caller re-invoke `startCheckout` with `clientTotal: dryRun.total`) is an implicit convention established by this task, not yet exercised end-to-end by any real caller — the eventual wiring task should follow this exact contract rather than re-deriving it.
3. The component's inline styling intentionally mirrors `CartDrawer.jsx`'s existing color palette and layout conventions by hand (no shared style module exists in this codebase to import from) — a visual-consistency choice, not a defect, but means any future palette change to `CartDrawer.jsx` would need a matching manual update here.

---

# DEFERRED

- Wiring `usePaymentFirstCheckout` + `PaymentFirstPriceConfirmation` into any live checkout screen or route.
- The actual "resubmit with confirmed total" orchestration call (`startCheckout({...checkoutInput, clientTotal: dryRun.total})`) — this task defines the contract (`onConfirm(dryRun)`) but does not implement the caller side, per task point 6 and the task's own scope boundary.
- Payment UI, redirect/callback handling, and result UI (3.6D.3 – 3.6D.5) — explicitly out of scope and not started.
- Rate limiting and the `startCharge` idempotency-key tenant-scoping fix — untouched, as instructed.

---

# SCOPE_DEVIATIONS

None. Every file created or modified falls within "Price Confirmation UI." No Edge Function, database, hook, or existing checkout file was modified. No rate limiting or idempotency-scoping work was implemented. No live Moyasar/network call was made (all tests use injected props/mocks only).

---

# GIT_STATUS

New files (untracked, this task):
```
src/features/menu/PaymentFirstPriceConfirmation.jsx
src/features/menu/paymentFirstErrors.js
tests/unit/PaymentFirstPriceConfirmation.test.jsx
tests/unit/paymentFirstErrors.test.js
reports/TASK_3_6D_2_PRICE_CONFIRMATION_UI_IMPLEMENTATION_REPORT.md
```

Tracked-file modification, this task's entire contribution:
```
src/features/menu/i18n.js | 4 +
```

Full `git diff --stat` (cumulative across all prior tasks in this session, shown for completeness — only `i18n.js` is new to this task's contribution):
```
 src/features/menu/i18n.js                     |   4 +   ← this task
 src/payments/adapters/moyasar.js              |  20 +-
 src/payments/index.js                         |   1 +
 src/payments/services/index.js                |   7 +
 src/payments/services/paymentService.js       | 122 ++++++-
 src/payments/types/index.js                   |   4 +
 src/payments/utils/index.js                   |   2 +-
 supabase/functions/payment-webhook/handler.js |  19 ++
 tests/unit/MoyasarAdapter.test.js             |  57 +++-
 tests/unit/paymentService.test.js             | 436 +++++++++++++++++++++++++-
 tests/unit/paymentWebhook.test.js             |  95 ++++++
 11 files changed, 745 insertions(+), 22 deletions(-)
```

No commit, no push, no merge performed.

---

# RECOMMENDED_NEXT_STEP

Await explicit owner approval before starting any wiring of `usePaymentFirstCheckout` + `PaymentFirstPriceConfirmation` into a live page, or before starting 3.6D.3 ("Payment UI") or any later task.

---

*Report generated 2026-08-27. UI-only implementation — no deployment, no Moyasar call, no commit, no push, no merge.*
