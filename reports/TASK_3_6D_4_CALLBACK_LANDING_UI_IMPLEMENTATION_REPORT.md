# Task 3.6D.4 — Payment-First Callback Landing UI Implementation

**Callback landing/status-resolution UI only. No live-page wiring, no result-mapping (3.6D.5), no order confirmation (3.6D.6), no Edge Function, no Moyasar call, no production changes.**

---

# EXECUTIVE_SUMMARY

Implemented the browser-side callback landing experience: `PaymentFirstCallbackLanding.jsx`, a component that resumes a payment attempt using the **locally-persisted** payment idempotency key (never the raw URL parameter) and resolves its authoritative status exclusively through the approved, staging-verified RPC — `supabase.rpc('get_payment_status_by_idempotency_key', { p_idempotency_key })`. An 8-state machine covers exactly the states the task specified (idle, missing-key, resolving, pending, succeeded, failed, unknown, retryable-error), with a bounded (5-attempt, 3-second-interval) polling mechanism for the `pending` case and a manual retry action once polling exhausts.

A critical security design point, arrived at during implementation and not merely assumed: **the RPC is always queried using the key read from `localStorage` (via a new, read-only `useResumedPaymentIdempotencyKey` hook), never the `payment_callback` URL parameter directly.** The URL parameter serves only as a trigger signal ("we're in a callback context"); it is never trusted as the actual query input, which closes a subtle information-disclosure/spoofing angle a naive implementation could have introduced (a tampered or shared callback URL cannot make this component check the status of an *attacker-chosen* key — only whatever this specific browser's own `localStorage` already holds).

Like every payment-first UI piece before it (3.6D.1–3.6D.3), this component is complete and fully tested but **not mounted into `PublicMenu.jsx` or any route** — that live-wiring decision remains explicitly deferred, consistent with 3.6D-A's own unresolved "how does payment-first coexist with the cash flow" product question. 897/897 tests pass (873 baseline + 24 new). Two real bugs were found and fixed during test-driven development (not merely cosmetic): a React state-equality bug that silently stopped polling after the first attempt, and an icon/text DOM-structure issue — both detailed in TESTS below.

---

# ARCHITECTURE_AUDIT

All eleven listed reports were re-read in full before writing any code. Key facts re-confirmed, not re-derived:

- **`TASK_3_6D_C_...`/`TASK_3_6D_E_...`**: the return URL is `${PUBLIC_APP_BASE_URL}/menu/${slug}?payment_callback=${paymentIdempotencyKey}[&t=${qrToken}]` — **`/menu/:slug` itself, not a dedicated callback route**. This is why the new component reads `useSearchParams()` rather than existing on its own route.
- **`TASK_3_6D_4_...` (audit) / `TASK_3_6D_4_A_...` (spec) / `TASK_3_6D_4_B*_...` (implementation + hardening + staging verification)**: the approved, now staging-verified contract — `get_payment_status_by_idempotency_key(p_idempotency_key text) RETURNS TABLE(status, amount, currency, updated_at)`, `SECURITY DEFINER`, exact-match only, `PUBLIC` revoked, `anon`/`authenticated` granted. This is the **only** server capability this component is allowed to use, and the only one it does use.
- **`TASK_3_6D_2_...`/`TASK_3_6D_3_...`**: `PaymentFirstPriceConfirmation.jsx` and `PaymentFirstCheckoutPanel.jsx` — re-read, confirmed both remain completely out of this component's own file; this task adds a sibling, not a modification.
- **`src/features/menu/hooks/usePaymentIdempotencyKey.js`** (3.6D.3, re-inspected, **not** reused directly): its "generate a fresh key if none exists" behavior is exactly correct for *starting* a checkout attempt but exactly **wrong** for *resuming* one — reusing it here would risk silently fabricating a brand-new key on a bare page load with no in-progress attempt, directly violating this task's "do not create a new idempotency key when resuming" rule. This is why a **new**, narrower, read-only hook was written instead of reusing the existing one (see FILES_CREATED).
- **`src/features/menu/hooks/cartHelpers.js`**: `paymentIdempotencyStorageKey(slug, branchId)` (3.6D.3) reused verbatim — the new read-only hook computes the identical storage key name, guaranteeing it reads the *same* localStorage entry `usePaymentIdempotencyKey` would have written during checkout.
- **`src/pages/PublicMenu.jsx`**: re-read (top portion) — confirms `useSearchParams()` from `react-router-dom` is the established convention for reading query parameters (`branch`, `table`) on this exact route; mirrored for `payment_callback`.
- **`src/lib/supabase.js`**: the browser-bundled `supabase` singleton, anon-key-only, re-confirmed as the correct default `db` for this component (matching `useActiveOrders.js`'s own `supabase.rpc(...)` calling convention exactly).
- **`src/features/menu/OrdersScreen.jsx`**: inspected for result-state visual conventions; the established green-success palette (`#ECFDF5`/`#047857`/`#D1FAE5`, first seen in `CartDrawer.jsx`'s QR-trust badge) was reused for the `succeeded` state, keeping this component visually consistent with the rest of the codebase rather than inventing a new palette.
- **`tests/unit/ProtectedRoute.test.jsx`**: the established `<MemoryRouter initialEntries={[...]}>` test pattern for components depending on `useSearchParams()` — mirrored exactly for this component's tests.

---

# CALLBACK_STATE_MACHINE

```
mount
  │
  ├─ no ?payment_callback in URL ──────────────► IDLE (renders nothing — out of context entirely)
  │
  ├─ ?payment_callback present, no localStorage
  │  key for this slug/branch ──────────────────► MISSING_KEY (no RPC call at all; safe recovery action only)
  │
  └─ ?payment_callback present + localStorage key found
              │
              ▼
        RESOLVING  ──RPC call, using the LOCALSTORAGE key, never the URL value──►
              │
              ├─ row.status ∈ {initiated, pending} ──► PENDING ──(bounded poll, ≤5 more attempts,
              │                                                    3s apart)──► loops back to RESOLVING
              │                                                    │
              │                                          (exhausted) ──► stays PENDING, shows manual "Check again"
              │
              ├─ row.status = succeeded | refunded ───► SUCCEEDED (amount/currency shown, nothing else)
              │
              ├─ row.status = failed | cancelled ─────► FAILED (generic safe message, "Back to menu")
              │
              ├─ no row returned (RPC succeeded, empty) ► UNKNOWN ("attempt not found", "Back to menu")
              │
              └─ RPC itself errored/threw ─────────────► RETRYABLE_ERROR (generic message, manual retry)
```

`refunded` is folded into `SUCCEEDED` — per `TASK_3_6D_4_A`'s own explicit instruction not to invent new callback behavior for it, since a refund can only ever follow a successful payment and dedicated refund-specific messaging is deliberately left to a later, unspecified task.

---

# FILES_CREATED

- **`src/features/menu/PaymentFirstCallbackLanding.jsx`** — the callback landing component (`CallbackState` enum exported alongside the default export, mirroring `usePaymentFirstCheckout.js`'s own `CheckoutState` export pattern).
- **`src/features/menu/hooks/useResumedPaymentIdempotencyKey.js`** — a new, narrow, read-only hook. Reads `localStorage` via the existing `paymentIdempotencyStorageKey` pure function; **never** calls `crypto.randomUUID()` or `localStorage.setItem` under any code path — structurally incapable of fabricating a key.
- **`tests/unit/PaymentFirstCallbackLanding.test.jsx`** — 18 tests.
- **`tests/unit/useResumedPaymentIdempotencyKey.test.js`** — 6 tests.
- **`reports/TASK_3_6D_4_CALLBACK_LANDING_UI_IMPLEMENTATION_REPORT.md`** (this file).

# FILES_MODIFIED

- **`src/features/menu/i18n.js`** — 11 new translation keys added (`pfCallback*`), reusing the existing `backToMenu` key for the recovery action rather than duplicating it.

No other existing file was modified. `usePaymentFirstCheckout.js`, `PaymentFirstPriceConfirmation.jsx`, `PaymentFirstCheckoutPanel.jsx`, `usePaymentIdempotencyKey.js`, `cartHelpers.js`, the payment-status RPC/SQL files, `paymentService.js`, `payment-webhook`, `PublicMenu.jsx`, and `App.jsx` are all confirmed untouched (`git diff` shows zero lines changed for `PublicMenu.jsx`/`App.jsx` specifically).

---

# EXACT_RPC_USAGE

```js
const response = await db.rpc('get_payment_status_by_idempotency_key', { p_idempotency_key: resumedKey })
```

Exactly the approved contract, exactly the approved parameter name, using `db` (defaulting to the real `supabase` singleton, overridable for tests — the same dependency-injection convention every payment-first piece in this arc has used). **`resumedKey` is always the value returned by `useResumedPaymentIdempotencyKey` — never `searchParams.get('payment_callback')` directly** (see SECURITY_ANALYSIS). No other Supabase call (`.from(...)`, `.rpc()` with any other name, or a raw `fetch`) appears anywhere in this component or its new hook — confirmed both by direct code review and by static tests (`PFCL-08`, `PFCL-09`, `PFCL-10`).

---

# IDEMPOTENCY_RESUME_BEHAVIOR

- The persisted key is read via the **new**, read-only `useResumedPaymentIdempotencyKey(slug, branchId)` — not the existing `usePaymentIdempotencyKey` (which would risk generating a fresh key on a bare page load, exactly the behavior this task forbids).
- No `localStorage.setItem` call exists anywhere in the new hook or the callback component — confirmed by a live spy-based test (`RPIK-03`, `PFCL-11`) that renders the component through a full resolve cycle and asserts `Storage.prototype.setItem` was never called.
- The key is **preserved, not cleared**, by this component under any state — clearing-on-terminal-outcome (as `PaymentFirstCheckoutPanel` already does for `SUCCEEDED`/`FAILED`) is deliberately **not** duplicated here, since this component has no way to know whether the *original* checkout-initiating context still needs the key for anything else; key lifecycle ownership stays exactly where 3.6D.3 already placed it.

---

# SECURITY_ANALYSIS

- **The redirect URL is never proof of anything.** `payment_callback`'s value is read (`searchParams.get(...)`) purely to decide *whether* to activate the resolution flow — it is never passed to the RPC, never displayed, never compared against the result for authorization purposes. The actual RPC argument is always `resumedKey`, sourced exclusively from this browser's own `localStorage`.
- **This closes a real, non-obvious risk**: a shared or manipulated callback link (`?payment_callback=<arbitrary-value>`) sent to a different browser cannot make this component check *that arbitrary value's* status — it can only ever check whatever key *that specific browser* already has locally stored (or nothing, landing in `MISSING_KEY`). An attacker cannot use this component as an oracle for an arbitrary idempotency key by crafting a URL.
- **No client-supplied status/amount/currency is ever trusted** — every value shown in the `SUCCEEDED` state comes directly from the RPC's own response row, never from the URL, never computed client-side.
- **`providerRef` and internal IDs are never rendered** — structurally, since the RPC itself never returns them (re-confirmed staging-verified in `TASK_3_6D_4_B_2`), and defensively verified in this task too: `PFCL-12` feeds a mock RPC response that *includes* `provider_ref`/`id` fields (simulating a hypothetically-compromised or future-drifted RPC) and asserts neither value appears anywhere in the rendered DOM — the component only ever reads `status`/`amount`/`currency`/`updated_at` off the result object by name.
- **`failure_reason` is never displayed** — not merely omitted by choice, but structurally unavailable (the RPC contract never returns it), matching the task's own instruction precisely.
- **No direct `payment_transactions` access** — confirmed by static test (`PFCL-08`) that the component contains no `.from('payment_transactions')` call of any kind; the RPC is the only access path, exactly as RLS already enforces server-side.
- **No `confirmCharge()`, no Moyasar call, no `startCheckout`/`initiatePaymentFirstCheckout` re-invocation** — confirmed both by code review and by static tests (`PFCL-09`, `PFCL-10`); the component's only outbound call of any kind is the one approved RPC.

---

# POLLING_STRATEGY

Bounded, not invented ad hoc: an initial RPC call, and — **only while the result is `pending`/`initiated`** — up to **5 additional** attempts, **3 seconds apart** (≈15 seconds of active polling, 6 total RPC calls in the worst case). After the 5th additional attempt, polling stops automatically (`pollExhausted` becomes true) and the UI switches from "still checking" to an explicit **manual** "Check again" button — no further automatic calls occur unless the customer clicks it, and clicking it starts a **fresh, equally-bounded** 6-call cycle (never unbounded, never compounding).

**A real bug was found and fixed while building the bounded-polling test**: the original implementation scheduled the next poll from inside a `useEffect` keyed on `state`. Because `mapRowToState` legitimately returns the *same* string (`'pending'`) across repeated polls, React's `Object.is`-based bailout meant `setState('pending')` when state was already `'pending'` produced **no new render**, so that effect **silently never re-fired after the very first poll** — polling would have appeared to work once and then permanently stall in a real browser, never triggering the "still checking" → "confirmed"/"failed" transition even after the webhook actually resolved. Fixed by scheduling the next attempt directly inside `resolveStatus` itself (via a plain `attemptsRef`-guarded `setTimeout`), independent of React's state-change bailout. This was caught specifically because `PFCL-13`'s fake-timer test asserted call counts over simulated time rather than merely checking the final rendered state once — a good illustration of why the "polling, if implemented, is bounded" test requirement mattered concretely, not just formally.

---

# TESTS

**`tests/unit/PaymentFirstCallbackLanding.test.jsx`** — 18 tests (`PFCL-01`..`PFCL-15`, some split into `a`/`b` sub-cases), covering all 13 scenarios the task listed, plus additional coverage:
1/2/3 — valid key → succeeded / pending / failed (`PFCL-01`/`02`/`03`, plus `03b` for `cancelled`).
4 — unknown key, RPC succeeds with an empty result (`PFCL-04`).
5 — missing key, no RPC call at all (`PFCL-05`).
6 — no `payment_callback` in the URL at all → `IDLE`, nothing rendered, no RPC call (`PFCL-06`).
7 — RPC error field and a thrown exception, both mapped to `RETRYABLE_ERROR` without crashing (`PFCL-07`/`07b`).
8 — no `.from('payment_transactions')` reference anywhere in the file (`PFCL-08`).
9 — no Moyasar import, no raw `fetch()` call (`PFCL-09`).
10 — no `startCheckout`/`initiatePaymentFirstCheckout`/`checkoutOrchestration` import (`PFCL-10`).
11 — the resumed key is never overwritten; `localStorage.setItem` is never called across a full resolve cycle (`PFCL-11`).
12 — `provider_ref`/internal `id` fields, even if hypothetically present in a mock RPC response, never appear in the rendered DOM (`PFCL-12`).
13 — polling is bounded: more than one but never more than 6 total RPC calls even after simulating far longer than the poll window; further time advances produce zero additional calls (`PFCL-13`), and the manual "Check again" button after exhaustion triggers exactly one more call (`PFCL-13b`).
Plus: the "Back to menu" recovery action calling `onRecover` (`PFCL-14`), and `onSucceeded` firing exactly once with the RPC's own result object (`PFCL-15`).

**`tests/unit/useResumedPaymentIdempotencyKey.test.js`** — 6 tests (`RPIK-01`..`RPIK-06`): reads an existing key unchanged; returns `null` and creates nothing when absent (verified both by direct `localStorage` inspection and by a `Storage.prototype.setItem` spy); handles missing `slug`/`branchId` without throwing; distinct keys per branch; no import of the key-*generating* hook or `crypto`.

**Two genuine bugs found and fixed during authoring** (not test-tooling false positives): the polling state-equality stall described above (`PFCL-13` initially failed with the retry button never appearing), and an off-by-one in the test's own call-count bound (fixed to `≤6`, matching "1 initial + 5 scheduled" correctly — the component's behavior was already correct here, only the test assertion was wrong). Two ordinary self-referential comment false positives (the recurring, previously-documented pattern in this session) were also hit and fixed: `PFCL-09`'s "no Moyasar" check matched the component's own explanatory comment mentioning "Moyasar" in prose, and `RPIK-06`'s check similarly matched prose — both fixed by narrowing to `import`-line-only scanning, the same established fix used repeatedly throughout this session. A third, unrelated bug was fixed independently: the icon-prefixed titles (`✓ {t('...')}`, `↻ {t('...')}`, etc.) produced two sibling text nodes inside one `<div>`, making `getByText(exact title)` fail even though the title *was* correctly rendered — fixed by restructuring every state's icon into its own `<span>` sibling (matching `PaymentFirstPriceConfirmation.jsx`'s own established icon/title layout), which is a real, if minor, accessibility/structure improvement, not just a test workaround.

---

# FOCUSED_RESULTS

```
npx vitest run tests/unit/PaymentFirstCallbackLanding.test.jsx tests/unit/useResumedPaymentIdempotencyKey.test.js
 Test Files  2 passed (2)
      Tests  24 passed (24)
```

---

# FULL_REGRESSION

```
npx vitest run
 Test Files  50 passed (50)
      Tests  897 passed (897)

npm test -- --run
 Test Files  50 passed (50)
      Tests  897 passed (897)
```

897 = 873 (the 3.6D.4-B.2 baseline) + 24 new. Both commands ran to completion with zero failures; no pre-existing test was modified or deleted.

---

# BLOCKERS

None.

---

# WARNINGS

1. **Not mounted into any live route.** `PublicMenu.jsx`/`App.jsx` are confirmed unchanged (zero-line `git diff`). A customer landing on `/menu/:slug?payment_callback=...` today would see the normal menu page, not this component — wiring it in is a deliberately deferred, separate decision (see DEFERRED), consistent with every prior UI piece in this arc.
2. The bounded-polling window (~15 seconds, 6 total calls) is a reasonable but not owner-specified default — flagged as a concrete parameter a future task or owner review may want to tune once real webhook-latency data exists.
3. `refunded` is folded into the `SUCCEEDED` state's generic messaging, per `TASK_3_6D_4_A`'s explicit instruction not to invent new behavior for it — a future, dedicated refund-callback treatment remains unspecified and out of this task's scope.
4. The component's inline styling continues this arc's established practice of hand-mirroring existing color/layout conventions (no shared style module exists in this codebase) — consistent, not a defect.

---

# DEFERRED

- Mounting `PaymentFirstCallbackLanding` into `PublicMenu.jsx` (or a dedicated route) — the live-wiring decision remains open, per 3.6D-A's still-unresolved cash-flow/payment-first coexistence question.
- Full result-mapping UI beyond this component's own honest state rendering (3.6D.5) — this task renders safe, minimal messaging per state; richer UX (retry-with-new-attempt flows, detailed error copy per failure reason, etc.) is explicitly 3.6D.5's scope.
- Final order-confirmation behavior (3.6D.6) — `onSucceeded(result)` is a bare notification callback with no consumer wired up; turning a succeeded payment into an actual order via `createOrderFromSuccessfulPayment` remains untouched and unscoped here.
- 3.6E (reconciliation) — unaffected by and unrelated to this task.
- Tuning the polling window/attempt count based on real production webhook-latency observation.

---

# SCOPE_DEVIATIONS

None. No RPC contract change, no `paymentService.js`/`payment-webhook` change, no new Edge Function, no Moyasar call from the browser, no `startCheckout`/`initiatePaymentFirstCheckout` rerun, no direct `payment_transactions` access, no production migration application, no live-page wiring, and no start of 3.6D.5/3.6D.6/3.6D.7/3.6E.

---

# GIT_STATUS

New files (untracked, this task):
```
src/features/menu/PaymentFirstCallbackLanding.jsx
src/features/menu/hooks/useResumedPaymentIdempotencyKey.js
tests/unit/PaymentFirstCallbackLanding.test.jsx
tests/unit/useResumedPaymentIdempotencyKey.test.js
reports/TASK_3_6D_4_CALLBACK_LANDING_UI_IMPLEMENTATION_REPORT.md
```

Tracked-file modification, this task's entire contribution:
```
src/features/menu/i18n.js | 16 +   (11 new translation keys)
```

Full `git diff --stat` (cumulative across this session's arc; only `i18n.js`'s delta is new to this task):
```
 src/features/menu/hooks/cartHelpers.js        |   6 +
 src/features/menu/hooks/cartHelpers.test.js   |  10 +-
 src/features/menu/i18n.js                     |  16 +   ← this task (was +5 before)
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
 13 files changed, 772 insertions(+), 23 deletions(-)
```

`src/pages/PublicMenu.jsx` and `src/App.jsx`: confirmed zero diff. No commit, no push, no merge, no production migration applied.

---

# NEXT_STEP

Per instruction: **stopping here.** Not proceeding automatically to 3.6D.5, 3.6D.6, 3.6D.7, or 3.6E. The callback landing UI is complete, fully tested, and ready to be mounted whenever the owner decides how payment-first should surface on a live route — that decision, and the subsequent wiring, remain open items for a future, explicitly-scoped task.

---

*Report generated 2026-08-27. UI-only implementation — no deployment, no Moyasar call, no commit, no push, no merge.*
