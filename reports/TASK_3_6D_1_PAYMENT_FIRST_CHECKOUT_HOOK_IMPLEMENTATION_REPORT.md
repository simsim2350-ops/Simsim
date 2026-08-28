# Task 3.6D.1 — Payment-First Checkout Hook

**IMPLEMENTED. Additive only — legacy checkout flow completely untouched.**

---

# EXECUTIVE_SUMMARY

Implemented `usePaymentFirstCheckout` (`src/features/menu/hooks/usePaymentFirstCheckout.js`), a thin, additive React hook providing a clean interface to the existing, unmodified `initiatePaymentFirstCheckout` (3.6A-2). Re-inspecting the actual backend contract (per Phase 1's explicit instruction) surfaced one critical, previously-unstated architectural fact that shapes this hook's entire design: **`initiatePaymentFirstCheckout` requires a `service_role`-carrying `db` client and cannot be safely invoked directly from browser code with the public `anon` key** — exactly the same constraint already documented for `paymentService.startCharge` throughout this whole session. This hook is therefore built with full dependency injection (`db`, `orchestrate`), mirroring `checkoutOrchestration.js`'s own DI pattern for `paymentService` — safe, fully testable today, and ready to be pointed at a real Edge-Function-backed network call in a later task without any change to its own public interface. The hook's state values are derived exhaustively and only from the backend's actual, real `status` strings — no state is invented, and one genuine gap (the backend's `succeeded` response carries no authoritative total) is documented rather than papered over. `useCheckout.js`, `CartDrawer.jsx`, `PublicMenu.jsx`, and `OrdersScreen.jsx` are all confirmed untouched — zero diff. 15 new tests pass. Full regression: **751/751 PASS** (736 baseline + 15 new).

**Verdict: `TASK_3_6D_1_COMPLETE_WITH_WARNINGS`** — complete on its own narrow terms, but the `service_role`-access architectural gap is a real, unresolved prerequisite for any future task that tries to wire this hook to a live browser call.

---

# BACKEND_CONTRACT

Re-read in full from the actual, current `src/payments/services/checkoutOrchestration.js` (3.6A-2, unmodified) — not assumed from memory:

**Input** (`input`, first argument): `restaurant_id`, `branch_id`, `type` (`'dine_in'|'takeaway'|'delivery'`), `customer_phone` (required); `table_number`, `delivery_address`, `customer_name`, `notes`, `coupon_code`, `clientTotal` (advisory only, never the charged amount), `currency` (must be `'SAR'`/omitted or the call is rejected), `paymentIdempotencyKey`, `returnUrl` (all optional); `items` (required array, `{product_id, quantity, options}}` shape).

**Context** (second argument): `{db, paymentService?}` — **`db` is required** for any real call to succeed (every internal step reads/writes `payment_transactions` through it); `paymentService` is optional, defaulting to the real service.

**Output** — a single object, `status` being one of exactly six real values: `'rejected'`, `'price_changed'`, `'failed'`, `'retryable_error'`, `'requires_reconciliation'`, `'succeeded'`. Field-by-field, per status:
- `rejected`: `{status, reason, message?, idempotencyKey?}` (`idempotencyKey` present only if resolved before the rejection point).
- `price_changed`: `{status, idempotencyKey, dryRun: {subtotal, tax, delivery_fee, total, price_changes}}`.
- `failed` / `retryable_error`: `{status, reason, message?, idempotencyKey}`.
- `requires_reconciliation`: `{status, idempotencyKey, message}`.
- `succeeded`: `{status, paymentTransactionId, providerRef, paymentStatus, redirectUrl, idempotencyKey, idempotent}`.

**Errors**: the function is designed to **never throw** for any *recognized* backend-side condition — every failure mode is expressed as a `status` value in a normally-resolved object. It can still throw a `TypeError` for genuinely malformed input (missing `db`, non-object `input`) or propagate a truly unexpected exception from deep inside its own call chain — both are real, if rare, possibilities the hook must handle.

**Checkout snapshot/fingerprint**: **not exposed anywhere in the response** — confirmed, not assumed. The snapshot lives only in `payment_transactions.metadata.checkout` server-side; no field in any response shape carries it.

**Authoritative total on success**: **not present in the `succeeded` response either** — a real, concrete gap (RESULT_NORMALIZATION below), not invented around.

---

# HOOK_API

```js
const { state, result, error, isLoading, startCheckout, reset } =
  usePaymentFirstCheckout({ db, orchestrate })
```

- **`state`**: one of `CheckoutState`'s 9 values (STATE_MODEL below).
- **`result`**: the raw, unmodified response object from the last `startCheckout` call (or `null`).
- **`error`**: `null`, or `{reason: 'unexpected_exception', internalMessage}` — populated only when `orchestrate` itself throws (not for any normal backend-returned rejection, which lives in `result` instead).
- **`isLoading`**: `state === 'starting'`.
- **`startCheckout(checkoutInput)`**: forwards `checkoutInput` verbatim to `orchestrate`, updates `state`/`result`/`error`, returns the response (or `null` on exception).
- **`reset()`**: clears `result`/`error`, returns `state` to `idle` — never touches any idempotency key (the hook manages none itself).

Named exactly per the task's own candidate list (`state`, `result`, `error`, `isLoading`, plus `startCheckout`/`reset` as the two actions) — not a blind copy of `useCheckout.js`'s form-field-heavy shape, since this hook has no form fields of its own to manage (that remains 3.6D.2/.3's job).

---

# STATE_MODEL

`CheckoutState`: `idle`, `starting`, `price_changed`, `rejected`, `failed`, `retryable_error`, `requires_reconciliation`, `redirect_required`, `succeeded` — **9 values, all derived directly from the backend's own 6 real `status` strings, plus the 2 hook-local values (`idle`/`starting`) and exactly one documented derivation** (`redirect_required` = `status:'succeeded' && redirectUrl` truthy, since the backend never returns this as its own distinct status string — a UI-facing refinement of real data, not invented behavior).

**Deliberately not collapsed**: `rejected`, `failed`, and `retryable_error` are kept as three *separate* hook states (not merged into one generic "failed"), because the backend itself distinguishes them with different string values carrying different retry semantics — collapsing them would have been "hiding information needed later," which Phase 5 explicitly forbade. `requires_reconciliation` is likewise its own state, never coerced into `failed` (Phase 9's explicit requirement, directly verified by `PFC-06`).

**No `payment_initializing` sub-state**: the backend's entire dry-run → snapshot → charge sequence happens inside one atomic `await`, with no intermediate progress signal the hook could observe — inventing a finer-grained "initializing" state than the backend can actually report would have been exactly the kind of fabricated behavior Phase 6 warned against. This gap is documented here, not silently absent.

Any response with an unrecognized/malformed `status` value maps to `failed` (`deriveState`'s `default` branch) — a deliberate fail-safe choice: an unexpected shape must never be silently treated as `succeeded`.

---

# INPUTS

`startCheckout` accepts exactly one argument, `checkoutInput`, forwarded to `orchestrate` **byte-for-byte, with zero transformation** — no field is renamed, computed, defaulted, or added by the hook. This was a deliberate design choice per Phase 3's explicit instruction ("Do NOT add new fields unless required by the existing function") — the hook trusts its caller (a future 3.6D.2/.3) to already assemble the correct shape, exactly matching `initiatePaymentFirstCheckout`'s own real parameter list (BACKEND_CONTRACT above), not a reinterpreted or partial one.

---

# SERVER_AUTHORITY

**No client-side amount computation exists anywhere in this file** — confirmed by direct source inspection (`PFC-14`'s source-text test) and by the hook never reading, receiving, or referencing anything resembling a cart total, discount amount, or delivery fee. The only total the hook ever surfaces to a caller is `result.dryRun.total`, sourced exclusively from the backend's own dry-run response (`PFC-13`). The hook never calls `create_order` directly (`PFC-10`/`11`, source-scanned) and never imports or references `paymentService`/`MoyasarAdapter` in any way (`PFC-11`/`12`) — its **only** payment-layer import is `initiatePaymentFirstCheckout` itself, verified to be the sole import from `src/payments/` in the entire file.

**The `service_role` finding, stated plainly**: because `initiatePaymentFirstCheckout` requires a privileged `db`, and no browser-safe way to supply one exists today, this hook **cannot yet be safely called from a real, deployed frontend** with its default wiring. This is not a flaw in the hook's design — it is an honest reflection of a real backend constraint this audit could not resolve without violating the task's own explicit "no backend changes, no routes, no deploy" scope. The hook's `db`/`orchestrate` injection points exist specifically so that a **future** task (introducing an Edge Function endpoint the frontend can call via `supabase.functions.invoke(...)`, which then internally calls the real `initiatePaymentFirstCheckout` with a proper server-side `db`) can wire this hook to production **without changing its public interface at all** — `state`/`result`/`error`/`startCheckout`/`reset` all stay exactly the same either way.

---

# RESULT_NORMALIZATION

**No information was hidden or discarded** — `result` is always the complete, unmodified backend response object, preserving `paymentTransactionId`, `providerRef`, `paymentStatus`, `redirectUrl`, `idempotencyKey`, `idempotent`, `reason`, `message`, and the full `dryRun` sub-object, exactly as BACKEND_CONTRACT documents them.

**Two real gaps documented, not invented around**:
1. **No checkout snapshot/fingerprint is ever exposed** by `initiatePaymentFirstCheckout` — the hook cannot surface what doesn't exist in its dependency's own contract.
2. **The `succeeded` response carries no authoritative total** — a future UI wanting to display "you were charged X SAR" on success has no field to read it from today. This is a real backend-contract gap this task's scope does not permit fixing (no backend changes allowed) — flagged clearly rather than worked around with a client-side guess.

---

# IDEMPOTENCY

**The hook manages no idempotency key of its own, by design.** `checkoutInput.paymentIdempotencyKey`, if present, passes through to `orchestrate` completely unchanged — `PFC-09`'s two tests confirm both a single call preserves the exact caller-supplied value, and two sequential calls with the same input never produce a different key between them (since the hook performs zero key generation logic at any point). If the caller omits `paymentIdempotencyKey` entirely, `initiatePaymentFirstCheckout` itself generates one (its own existing, unmodified behavior) — the hook has no opinion on this either way, exactly matching Phase 7's instruction that persistent key *management* remains 3.6D.3's responsibility, not this task's.

---

# PRICE_CHANGED

`state` becomes `price_changed`, `result.dryRun` carries the complete `{subtotal, tax, delivery_fee, total, price_changes}` object verbatim (`PFC-04`) — enough for a future 3.6D.2 to render an old/new total comparison, directly reusing the existing `priceChangeInfo` UI pattern already identified as reusable in the 3.6D-A audit. **No automatic continuation or resubmission occurs** — `startCheckout` simply returns; nothing in this hook re-calls `orchestrate` on its own.

---

# RECONCILIATION

`requires_reconciliation` is preserved as its own, distinct `state` value — **never coerced into `failed`**, directly proven by `PFC-06`'s explicit negative assertion (`expect(result.current.state).not.toBe(CheckoutState.FAILED)`). No automatic retry, no second call to `orchestrate`, and no UI of any kind is implemented for this state in this task — exactly as scoped; that remains 3.6D.5's job.

---

# ERROR_HANDLING

Two genuinely distinct error channels, matching the project's existing convention of separating "a known, structured backend outcome" from "an unexpected exception":

- **Backend-returned rejections/failures** (`rejected`, `failed`, `retryable_error`, `requires_reconciliation`) live entirely in `result` — already a safe, structured object (no raw database/provider text leaks further than what `checkoutOrchestration.js` itself already sanitized, per its own established design).
- **Genuinely unexpected exceptions** (thrown from `orchestrate` itself — e.g., a missing `db`, a real network failure) populate `error: {reason: 'unexpected_exception', internalMessage}` — `internalMessage` is explicitly named and structured as an *internal* diagnostic field, not a customer-facing string, consistent with "do not expose raw errors to the customer" — the actual translation/display work is correctly deferred to 3.6D.5, this hook only guarantees the raw detail isn't lost before that layer can use it.

Nothing is ever swallowed silently — every `startCheckout` call ends in either a populated `result` or a populated `error`, never neither.

---

# RESET

`reset()` clears `result` and `error` and returns `state` to `idle` — confirmed by `PFC-08`. It **never** touches, generates, or clears any idempotency key, because (per IDEMPOTENCY above) the hook never held one to begin with — satisfying Phase 11's requirement trivially and correctly, by construction rather than by an explicit guard.

---

# TESTS

`tests/unit/usePaymentFirstCheckout.test.js`, using `@testing-library/react`'s `renderHook`/`act` (already an installed dependency; this is the first hook-specific test in this codebase to use it, a legitimate and conventional choice, not a new dependency):

| # | Scenario | Result |
|---|---|---|
| 1 | Initial state | PASS (`PFC-01`) |
| 2 | Successful orchestration (no redirect) | PASS (`PFC-02`) |
| 3 | Redirect-required result | PASS (`PFC-03`) |
| 4 | `price_changed` | PASS (`PFC-04`) |
| 5 | `failed` result | PASS (`PFC-05`) |
| 6 | `requires_reconciliation` (never becomes `failed`) | PASS (`PFC-06`) |
| 7 | Backend exception | PASS (`PFC-07`) |
| 8 | `reset()` | PASS (`PFC-08`) |
| 9 | Caller-provided idempotency key passed unchanged (+ stability across repeated calls) | PASS (`PFC-09`, 2 cases) |
| 10 | No direct `create_order` call | PASS (`PFC-10`) |
| 11 | No direct `paymentService` call | PASS (`PFC-10`) |
| 12 | No real Moyasar call/reference | PASS (`PFC-11/12`, combined) |
| 13 | Authoritative amount comes from backend result | PASS (`PFC-13`) |
| 14 | No client-side amount calculation used for payment | PASS (`PFC-14`, 2 cases) |

One self-inflicted false positive (a source-text purity check matching this file's own explanatory comment about *not* using `cartTotal`/`discountAmount`/`deliveryFee`, the same class of issue encountered repeatedly throughout this session) was found and fixed during authoring by rewording the comment to avoid the literal field names, documented here for transparency.

---

# FULL_REGRESSION

```
$ npx vitest run
 Test Files  42 passed (42)
      Tests  751 passed (751)

$ npm test -- --run
 Test Files  42 passed (42)
      Tests  751 passed (751)
```

**751/751 PASS** on both invocations (736 baseline + 15 new), zero failures, zero regressions.

---

# LEGACY_FLOW_REGRESSION

**`useCheckout.js`, `CartDrawer.jsx`, `PublicMenu.jsx`, and `OrdersScreen.jsx` all show zero diff** — confirmed explicitly via `git diff --stat` scoped to exactly these four files, returning empty. The existing cash/table checkout flow is entirely unaffected; this task added one new file and one new test file, nothing else.

---

# FILES_CHANGED

| File | Status |
|---|---|
| `src/features/menu/hooks/usePaymentFirstCheckout.js` | **NEW** |
| `tests/unit/usePaymentFirstCheckout.test.js` | **NEW** — 15 tests |
| `useCheckout.js`, `CartDrawer.jsx`, `PublicMenu.jsx`, `OrdersScreen.jsx`, `checkoutOrchestration.js`, `create_order`, webhook, `paymentService.js` | **NOT TOUCHED** |

---

# GIT_STATUS

```
$ git status --short
 M src/payments/adapters/moyasar.js
 M src/payments/index.js
 M src/payments/services/index.js
 M src/payments/services/paymentService.js
 M src/payments/types/index.js
 M supabase/functions/payment-webhook/handler.js
 M tests/unit/MoyasarAdapter.test.js
 M tests/unit/paymentService.test.js
 M tests/unit/paymentWebhook.test.js
?? src/features/menu/hooks/usePaymentFirstCheckout.js  ← NEW, this task
?? tests/unit/usePaymentFirstCheckout.test.js            ← NEW, this task
?? reports/TASK_3_6D_1_PAYMENT_FIRST_CHECKOUT_HOOK_IMPLEMENTATION_REPORT.md  ← this report
(plus the same set of pre-existing untracked report/sql/module files from prior tasks — unchanged)

$ git diff --stat
 src/payments/adapters/moyasar.js              |  20 +-
 src/payments/index.js                         |   1 +
 src/payments/services/index.js                |   7 +
 src/payments/services/paymentService.js       | 116 ++++++-
 src/payments/types/index.js                   |   4 +
 supabase/functions/payment-webhook/handler.js |  19 ++
 tests/unit/MoyasarAdapter.test.js             |  57 +++-
 tests/unit/paymentService.test.js             | 436 +++++++++++++++++++++++++-
 tests/unit/paymentWebhook.test.js             |  95 ++++++
 9 files changed, 737 insertions(+), 18 deletions(-)
```

Every tracked file's diff is byte-identical to the prior report (3.6C.3.1) — this task touched none of them, only adding two brand-new, untracked files. **No commit, no push, no merge.**

---

# BLOCKERS

None for this task's own, narrowly-scoped deliverable. **A real, unresolved architectural blocker exists for any future task attempting to make this hook usable from a live, deployed browser session**: no browser-safe entry point to `initiatePaymentFirstCheckout` exists yet (it requires `service_role`). This does not block 3.6D.1 itself (fully specified and tested via injection), but it does block 3.6D.4 (and arguably needs resolving before 3.6D.3 can be meaningfully wired end-to-end).

# WARNINGS

1. **The `service_role` access gap** (SERVER_AUTHORITY above) is the single most important finding of this task — a future task must introduce some server-side entry point (most plausibly a new Edge Function) before this hook can be connected to real checkout traffic; this was not assumed away or silently worked around.
2. **The backend's `succeeded` response has no authoritative total field** — a real gap for whatever UI eventually needs to display a confirmed charged amount; not fixable without a backend change, explicitly out of this task's scope.
3. One self-inflicted, immediately-fixed test false positive occurred during authoring (documented under TESTS) — does not affect the shipped implementation.

---

# DEFERRED

Exactly as instructed: 3.6D.2 (price confirmation UI), 3.6D.3 (payment initiation UI + persistent idempotency-key storage), 3.6D.4 (Moyasar redirect/callback — additionally gated on the newly-surfaced `service_role` entry-point gap), 3.6D.5 (result mapping UI), 3.6D.6 (order confirmation integration), 3.6D.7 (full UI/E2E tests) — none were started.

---

# REPORT_FILE

`reports/TASK_3_6D_1_PAYMENT_FIRST_CHECKOUT_HOOK_IMPLEMENTATION_REPORT.md`

# DOWNLOAD_COPY

`/sdcard/Download/TASK_3_6D_1_PAYMENT_FIRST_CHECKOUT_HOOK_IMPLEMENTATION_REPORT.md` (copied and checksum-verified after this report was written).

# NEXT_STEP

Per the strict stop instruction: **no further work begins** — not 3.6D.2 through 3.6D.7, no route creation, no backend changes, no deployment — without separate, explicit instruction from you. The `service_role`/browser-access gap surfaced by this task is worth your attention before any subsequent 3.6D phase is scoped, since it materially affects how far the UI work can go before a backend/infrastructure decision is made.

---

*Report generated 2026-08-26.*
