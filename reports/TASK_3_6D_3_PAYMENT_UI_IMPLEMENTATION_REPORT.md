# Task 3.6D.3 — Payment-First Payment Initiation UI Implementation

**Payment initiation UI + idempotency-key persistence only. No live-page wiring, no result-mapping UI, no Edge Function/database change, no deploy, no Moyasar call.**

---

# EXECUTIVE_SUMMARY

Implemented 3.6D.3's two stated deliverables from `TASK_3_6D_A_CHECKOUT_UX_ARCHITECTURE_AUDIT.md`'s `IMPLEMENTATION_PLAN` (the closest thing to an approved specification for this phase — see ARCHITECTURE_REVIEWED for the resolved ambiguity around no standalone "3.6D.3 spec" document existing): **(1)** a new, distinct "processing payment" UI state, and **(2)** a payment-specific idempotency-key persistence mechanism, sibling to the existing order-idempotency-key pattern in `cartHelpers.js`/`useCart.js`.

Both were delivered as fully additive code: a new `usePaymentIdempotencyKey` hook (mirrors `useCart.js`'s own inline idempotency-key lifecycle exactly, generalized into a reusable hook), one new pure helper in `cartHelpers.js` (`paymentIdempotencyStorageKey`, sibling to the existing `idempotencyStorageKey`), and a new `PaymentFirstCheckoutPanel` component that auto-starts `usePaymentFirstCheckout` (3.6D.1, unmodified) and renders `PaymentFirstPriceConfirmation` (3.6D.2, unmodified) for its existing states — with exactly one new render branch: a distinct "جارٍ إعداد الدفع… / Preparing your payment…" indicator shown only for the *second* `STARTING` phase (after the customer has explicitly confirmed a price change), never conflated with the *first* `STARTING` phase's existing "checking price" copy. Neither `usePaymentFirstCheckout.js` nor `PaymentFirstPriceConfirmation.jsx` was modified. No file outside this task's own new/extended files was touched — `CartDrawer.jsx`, `PublicMenu.jsx`, `useCheckout.js`, the Edge Function, and the database remain completely untouched, consistent with 3.6D-A's own finding that "whether/how the existing cash-flow checkout and a new Payment-First checkout coexist" is still an open product decision, not this task's to make. 853/853 tests pass (833 baseline + 20 new).

---

# OBJECTIVE

Deliver 3.6D.3's payment-initiation UI concern: a distinguishable "processing payment" state, separate from price-confirmation, plus a persisted payment-attempt idempotency key surviving a page reload (in preparation for the future redirect round-trip in 3.6D.4) — while strictly preserving the price-confirmation/payment-initiation separation and never duplicating pricing or orchestration logic client-side.

---

# ARCHITECTURE_REVIEWED

- **No standalone "TASK 3.6D.3 specification" document exists** in `reports/` (confirmed by search). The closest approved source is `TASK_3_6D_A_CHECKOUT_UX_ARCHITECTURE_AUDIT.md`'s `IMPLEMENTATION_PLAN` section, phase "3.6D.3 — Payment initiation UI + idempotency-key persistence": *"a new 'processing payment' state; extend `cartHelpers.js`'s existing `localStorage` pattern with a sibling payment-idempotency-key function, per SESSION_RETRY_CONTINUITY."* Combined with this task's own detailed inline instructions, this was treated as the working specification — a resolved ambiguity, not a blocker, since implementing it required no scope outside 3.6D.3.
- **`reports/TASK_3_6D_E_PAYMENT_FIRST_EDGE_FUNCTION_IMPLEMENTATION_REPORT.md`** (read) — confirms the 812/812 baseline this task builds on top of, and that the Edge Function's request/response contract is unaffected by anything in this task (this task never calls the Edge Function — it still uses the hook's own `orchestrate` injection point, exactly as 3.6D.1/3.6D.2 did).
- **`reports/TASK_3_6D_2_PRICE_CONFIRMATION_UI_IMPLEMENTATION_REPORT.md`** (read) — confirms `PaymentFirstPriceConfirmation.jsx`'s established contract (`state`, `result`, `onConfirm(dryRun)`, `onCancel()`, `t`, `isEn`, `brandColor`; scoped to `STARTING`/`PRICE_CHANGED`/`REJECTED` only) — reused verbatim, unmodified.
- **`src/features/menu/hooks/usePaymentFirstCheckout.js`** (re-read, unmodified) — `startCheckout(checkoutInput)` forwards its input to `orchestrate` verbatim; this is the only entry point this task's new panel ever calls.
- **`src/features/menu/PaymentFirstPriceConfirmation.jsx`** (re-read, unmodified) — confirmed its `STARTING` branch already renders generic "checking price" copy; this task does not alter that branch's meaning, it simply stops delegating to it once the customer has confirmed once (see EXACT_CHANGES).
- **`src/features/menu/hooks/useCart.js`** (read) — the exact precedent for idempotency-key lifecycle: generate via `crypto.randomUUID()`, persist to `localStorage` under a stable per-slug/branch key, read-back-if-present, clear when the underlying "intent" ends. Mirrored precisely for the payment-attempt key, substituting "checkout attempt in progress" for "cart non-empty" as the generation trigger.
- **`src/features/menu/hooks/cartHelpers.js`** (read, extended) — `idempotencyStorageKey(slug, branchId)` → `` `simsim_idem_${slug}_${branchId}` ``, a pure function with its own existing test. Extended with a sibling, not a modification.
- **`tests/unit/CartDrawer.test.jsx`** / **`tests/unit/usePaymentFirstCheckout.test.js`** (re-read) — the established component/hook test conventions (`@vitest-environment happy-dom`, `render`/`screen`/`fireEvent`/`cleanup`, `renderHook`/`act`/`waitFor`), mirrored exactly for the two new test files.

**Confirmed structurally** (from `checkoutOrchestration.js`, unmodified, re-verified): every `rejected` outcome from `initiatePaymentFirstCheckout` occurs strictly before `paymentService.startCharge` is ever called — this is what makes "price confirmation" (3.6D.2's scope) and "payment initiation" (this task's scope) a real, enforceable UI boundary rather than an arbitrary one: nothing this task's panel does can ever cause a "rejected" business outcome to appear to have happened *during* a real payment attempt.

---

# FILES_CREATED

- `src/features/menu/hooks/usePaymentIdempotencyKey.js` — the payment-attempt idempotency-key lifecycle hook.
- `src/features/menu/PaymentFirstCheckoutPanel.jsx` — the payment-initiation orchestrating UI component.
- `tests/unit/usePaymentIdempotencyKey.test.js` — 7 tests.
- `tests/unit/PaymentFirstCheckoutPanel.test.jsx` — 12 tests.
- `reports/TASK_3_6D_3_PAYMENT_UI_IMPLEMENTATION_REPORT.md` (this file).

# FILES_MODIFIED

- `src/features/menu/hooks/cartHelpers.js` — added `paymentIdempotencyStorageKey(slug, branchId)`, a pure sibling function to the existing `idempotencyStorageKey` (+6 lines, no existing code touched).
- `src/features/menu/hooks/cartHelpers.test.js` — added one test for the new function, extending the existing `describe` block pattern (+10/-1 lines).
- `src/features/menu/i18n.js` — added one new key, `pfProcessingPayment` (+1 line to this task's own contribution; 3 keys from 3.6D.2 remain from before).

No other existing file was modified. `usePaymentFirstCheckout.js`, `PaymentFirstPriceConfirmation.jsx`, `paymentFirstErrors.js`, `checkoutOrchestration.js`, `paymentService.js`, the Edge Function, `useCheckout.js`, `CartDrawer.jsx`, `PublicMenu.jsx`, and every database/migration file are untouched.

---

# EXACT_CHANGES

**`cartHelpers.js`**:
```js
export function paymentIdempotencyStorageKey(slug, branchId) {
  return `simsim_payidem_${slug}_${branchId}`
}
```

**`usePaymentIdempotencyKey(slug, branchId)`** — returns `{ paymentIdempotencyKey, clearKey }`:
- On `[slug, branchId]` becoming available: reads `localStorage.getItem(paymentIdempotencyStorageKey(slug, branchId))`; if present, uses it; otherwise generates `crypto.randomUUID()` and persists it.
- `clearKey()`: clears both the React state and the `localStorage` entry.
- Does not itself decide *when* to clear (that policy decision belongs to the caller — see `PaymentFirstCheckoutPanel`).

**`PaymentFirstCheckoutPanel({ slug, branchId, checkoutInput, db, orchestrate, onOutcome, onCancelled, t, isEn, brandColor })`**:
- Auto-starts exactly once: a `useRef` guard fires `startCheckout({...checkoutInput, paymentIdempotencyKey})` the first time both `checkoutInput` and a resolved `paymentIdempotencyKey` are available — never re-fires on subsequent re-renders (verified: `PFCP-11`).
- `handleConfirm(dryRun)` (passed to `PaymentFirstPriceConfirmation` as `onConfirm`, matching its exact existing contract): sets a local `hasConfirmedOnce` flag, then calls `startCheckout({...checkoutInput, paymentIdempotencyKey, clientTotal: dryRun.total})` — **same key, `dryRun.total` taken verbatim**, no arithmetic (verified: `PFCP-03`).
- Render logic:
  - `STARTING && hasConfirmedOnce` → the new, distinct "جارٍ إعداد الدفع…" indicator (own JSX, not delegated to `PaymentFirstPriceConfirmation`).
  - `STARTING` (first time) / `PRICE_CHANGED` / `REJECTED` → delegates entirely to `PaymentFirstPriceConfirmation`, unmodified, same props contract as 3.6D.2.
  - Any other state → renders nothing; instead fires `onOutcome(state, result)` once per transition (via a `useEffect` keyed on `state`) for `FAILED`, `RETRYABLE_ERROR`, `REQUIRES_RECONCILIATION`, `REDIRECT_REQUIRED`, `SUCCEEDED` — none of these render any UI here, per this task's scope boundary (result-mapping UI is 3.6D.5's job).
- Idempotency-key clearing policy (SESSION_RETRY_CONTINUITY): cleared on `SUCCEEDED`/`FAILED` (genuinely terminal) and on explicit "Back" (`handleCancel`, covering the `REJECTED` case); **kept** on `RETRYABLE_ERROR`/`REQUIRES_RECONCILIATION`/`REDIRECT_REQUIRED` (non-terminal — a future resume/retry needs the same key).

---

# UI_STATE_FLOW

```
mount (checkoutInput + paymentIdempotencyKey ready)
        │
        ▼
  startCheckout(checkoutInput + key)  ── once, guarded ──►  usePaymentFirstCheckout.state
        │
        ├─ STARTING (1st) ──────────► delegate to PaymentFirstPriceConfirmation: "Checking the final price…"
        │
        ├─ PRICE_CHANGED ───────────► delegate to PaymentFirstPriceConfirmation: price banner + "Update & continue"
        │         │
        │         └─ onConfirm(dryRun) → hasConfirmedOnce=true → startCheckout(...+ same key + clientTotal=dryRun.total)
        │                   │
        │                   ▼
        │             STARTING (2nd, hasConfirmedOnce=true) ──► NEW: "Preparing your payment…" (own indicator)
        │
        ├─ REJECTED ─────────────────► delegate to PaymentFirstPriceConfirmation: rejection message, "Back" only
        │         │
        │         └─ onCancel → clearKey() + onCancelled()
        │
        └─ FAILED / RETRYABLE_ERROR / REQUIRES_RECONCILIATION / REDIRECT_REQUIRED / SUCCEEDED
                  → nothing rendered here; onOutcome(state, result) fired once;
                    key cleared only for SUCCEEDED/FAILED
```

This makes the "processing payment" distinction concrete and testable: the exact same `STARTING` hook value now maps to two different, correctly-labeled UI messages depending on whether the customer has already explicitly confirmed a price once — without touching either existing component.

---

# SECURITY_REVIEW

- **No client-computed or stale total can bypass server confirmation.** The only value ever sent as `clientTotal` on a retry is `dryRun.total`, read directly off the server's own `PRICE_CHANGED` response object — confirmed by static grep (only two matches of `clientTotal` in the new panel: the doc-comment and the literal `clientTotal: dryRun.total` assignment) and by test `PFCP-03`.
- **No pricing/orchestration logic duplicated.** Static grep for arithmetic operators (`reduce`, `Math.`, multiplication patterns) and for `create_order`/`startCharge`/`Moyasar` references in both new source files returned zero matches. The panel only ever calls the hook's own `startCheckout` — never `db.rpc`, never an adapter, never a raw fetch.
- **No secrets exposed.** Neither new file references `service_role`, `SUPABASE_SERVICE_ROLE_KEY`, or any secret-shaped string (confirmed by grep) — consistent with this component never receiving or needing one; `db` is passed through to the hook exactly as 3.6D.1 already established, and remains the caller's responsibility to supply safely (unchanged from 3.6D.1's own documented architectural constraint).
- **No live Moyasar/network call.** All 12 new panel tests and 7 new hook tests use injected `orchestrate` mocks or pure `localStorage`; the full regression run (853/853) contains no real network call, matching every prior task's established discipline.
- **Idempotency-key stability preserved across a confirm-retry**, which is itself a defense-in-depth property: reusing the same key on the second `startCheckout` call means `startCharge`'s existing idempotent-replay guard (unmodified) is the backstop against a double-charge if the same attempt is somehow retried, exactly as SESSION_RETRY_CONTINUITY intends.

---

# TESTS

**`tests/unit/usePaymentIdempotencyKey.test.js`** — 7 tests (`PIK-01`..`PIK-07`): generates a fresh key on first use; persists it under `simsim_payidem_{slug}_{branchId}`; reuses an existing stored key instead of regenerating; produces distinct keys per branch; `clearKey()` removes both state and storage; no `slug`/`branchId` → no key, no throw; a fresh hook instance after clearing generates a genuinely new key.

**`tests/unit/PaymentFirstCheckoutPanel.test.jsx`** — 12 tests (`PFCP-01`..`PFCP-12`): auto-start-once with a generated key; first `STARTING` shows the existing "checking price" copy (proving delegation, not duplication); `PRICE_CHANGED` → confirm resubmits with the same key and `clientTotal = dryRun.total`; the second `STARTING` (post-confirm) shows the **new**, distinct "processing payment" copy and never the first phase's copy; `REJECTED` shows no confirm affordance; "Back" after `REJECTED` clears the key and calls `onCancelled`; `SUCCEEDED` clears the key, fires `onOutcome`, and renders nothing itself; `FAILED` clears the key; `REQUIRES_RECONCILIATION`/`RETRYABLE_ERROR` both keep the key; no duplicate auto-start on re-render; a source-scan test confirming no `supabase`/`paymentService`/`moyasar` import in the panel.

Also extended: `src/features/menu/hooks/cartHelpers.test.js` with one new test for `paymentIdempotencyStorageKey`, mirroring the existing `idempotencyStorageKey` test exactly.

No self-inflicted test issues were hit this task (unlike 3.6D.2's two minor authoring mistakes) — all 32 new/extended tests passed on the first run.

---

# FOCUSED_RESULTS

```
npx vitest run tests/unit/PaymentFirstCheckoutPanel.test.jsx tests/unit/usePaymentIdempotencyKey.test.js src/features/menu/hooks/cartHelpers.test.js
 Test Files  3 passed (3)
      Tests  32 passed (32)
```

---

# FULL_REGRESSION_RESULTS

```
npx vitest run
 Test Files  47 passed (47)
      Tests  853 passed (853)

npm test -- --run
 Test Files  47 passed (47)
      Tests  853 passed (853)
```

853 = 833 (the 3.6D.2 baseline) + 20 new (1 extended in `cartHelpers.test.js` + 7 + 12). One transient `maxWorkers`/`sequence.groupOrder` Vitest tooling flake occurred on the first full-suite run (the same recurring, previously-documented, code-unrelated flake from earlier tasks this session) — resolved by an immediate retry of the identical command, which passed cleanly. Both commands ultimately ran to completion with zero failures; no pre-existing test was modified or deleted.

---

# BLOCKERS

None. No scope outside 3.6D.3 was required.

---

# WARNINGS

1. `PaymentFirstCheckoutPanel` is not yet mounted into any live page/route — consistent with 3.6D.1/3.6D.2's own precedent, and deliberate: 3.6D-A explicitly left "whether/how the existing cash-flow checkout and a new Payment-First checkout coexist" as an open, unresolved product decision. Wiring this panel into `CartDrawer.jsx`/`PublicMenu.jsx` was not attempted.
2. `onOutcome(state, result)`'s five forwarded states currently have no consumer — a future 3.6D.5 task must implement the actual result-mapping UI (and, per `ERROR_STATE_MAPPING` in 3.6D-A, must take particular care that `REQUIRES_RECONCILIATION` never renders as a plain "failed" message).
3. The idempotency-key clearing policy implemented here (clear on `SUCCEEDED`/`FAILED`/explicit-cancel; keep on `RETRYABLE_ERROR`/`REQUIRES_RECONCILIATION`/`REDIRECT_REQUIRED`) is this task's own reasoned interpretation of SESSION_RETRY_CONTINUITY's terminal-outcome language — not something 3.6D-A's audit spelled out state-by-state. It is internally consistent and tested, but a future 3.6D.4/3.6D.5 task should treat it as a starting point to validate against real redirect/callback behavior, not as an unquestionable final policy.

---

# DEFERRED

- Wiring `PaymentFirstCheckoutPanel` into any live checkout screen or route.
- The actual result-mapping UI for `FAILED`/`RETRYABLE_ERROR`/`REQUIRES_RECONCILIATION`/`REDIRECT_REQUIRED`/`SUCCEEDED` (3.6D.5).
- Redirect/callback handling and resuming a persisted payment attempt after a page reload (3.6D.4) — the idempotency key now persists correctly for this future use, but nothing yet reads it back after a redirect round-trip.
- Order confirmation reuse (3.6D.6) and any end-to-end tests (3.6D.7).
- Rate limiting and the `startCharge` idempotency tenant-scoping fix — untouched, as instructed.

---

# SCOPE_DEVIATIONS

None. Every file created or modified falls within "Payment initiation UI + idempotency-key persistence." No Edge Function, database, `useCheckout.js`, `CartDrawer.jsx`, `PublicMenu.jsx`, or previously-delivered 3.6D.1/3.6D.2 file was modified. No rate limiting or idempotency tenant-scoping work was implemented. No live Moyasar/network call was made.

---

# GIT_STATUS

New files (untracked, this task):
```
src/features/menu/PaymentFirstCheckoutPanel.jsx
src/features/menu/hooks/usePaymentIdempotencyKey.js
tests/unit/PaymentFirstCheckoutPanel.test.jsx
tests/unit/usePaymentIdempotencyKey.test.js
reports/TASK_3_6D_3_PAYMENT_UI_IMPLEMENTATION_REPORT.md
```

Tracked-file modifications, this task's entire contribution:
```
src/features/menu/hooks/cartHelpers.js       |  6 +
src/features/menu/hooks/cartHelpers.test.js  | 10 +-
src/features/menu/i18n.js                    |  1 +   (cumulative with 3.6D.2's 4 lines: +5 total shown in full diff)
```

Full `git diff --stat` (cumulative across all prior tasks in this session; only the three lines above are new to this task's contribution):
```
 src/features/menu/hooks/cartHelpers.js        |   6 +
 src/features/menu/hooks/cartHelpers.test.js   |  10 +-
 src/features/menu/i18n.js                     |   5 +
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
 13 files changed, 761 insertions(+), 23 deletions(-)
```

No commit, no push, no merge performed.

---

# RECOMMENDED_NEXT_STEP

Await explicit owner approval before starting 3.6D.4 (redirect/callback handling — the highest-risk remaining phase per 3.6D-A, materially blocked on real Moyasar verification/G-6), 3.6D.5 (result-mapping UI), or any wiring of this panel into a live page.

---

*Report generated 2026-08-27. UI-only implementation — no deployment, no Moyasar call, no commit, no push, no merge.*
