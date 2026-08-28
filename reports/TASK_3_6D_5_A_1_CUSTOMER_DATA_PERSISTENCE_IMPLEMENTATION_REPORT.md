# Task 3.6D.5-A.1 — Payment-First Customer Data Persistence Implementation

**Implements the owner-approved TASK_3_6D_5_A specification exactly. No order-creation trigger, no PublicMenu.jsx change, no deploy.**

---

# APPROVED_DECISIONS

All 14 owner-approved decisions from `TASK_3_6D_5_A` implemented literally: Option A (persist before redirect); `localStorage`; storage key `simsim_payfirst_customer_${paymentIdempotencyKey}`; 2-hour TTL; lazy read-time expiry, no background sweep/timer; the exact `{version, createdAt, expiresAt, customerPhone, customerName?, tableNumber?, deliveryAddress?, notes?}` schema; the exact field-inclusion rules per order type; the exact forbidden-field list (never stored); browser storage treated as untrusted; no client-side encryption; no new server persistence table; `createOrderFromSuccessfulPayment` and existing payment-idempotency behavior both left completely unmodified; the same-slug/branch multi-tab collision behavior accepted as a documented residual risk, not redesigned.

---

# EXACT_ARCHITECTURE

Two new files, split exactly along the write/read boundary the spec required:
- **`src/features/menu/hooks/paymentCustomerDataHelpers.js`** — pure functions (`buildPaymentCustomerDataRecord`, `parseStoredPaymentCustomerData`) plus thin `localStorage` I/O wrappers (`persistPaymentCustomerData`, `clearPaymentCustomerData`, `readPaymentCustomerData`) and the key-format function (`paymentCustomerDataStorageKey`). No React, no hooks — mirrors `cartHelpers.js`'s own established split between pure logic and hook-level state.
- **`src/features/menu/hooks/usePaymentCustomerData.js`** — a thin React hook wrapping `readPaymentCustomerData` in `useEffect`/`useState`, structurally identical to `useResumedPaymentIdempotencyKey`'s own shape (`TASK_3_6D_4`) — **not built as a hook for the write side at all**: writing is a one-shot, fire-and-forget action with no reactive state to expose, so `persistPaymentCustomerData`/`clearPaymentCustomerData` are plain functions, called directly from `PaymentFirstCheckoutPanel`'s existing effects/handlers — a deliberate simplification the spec's own "hook/helper" phrasing explicitly allowed.

`PaymentFirstCheckoutPanel.jsx` (already-existing, `TASK_3_6D_3`) is the only component modified — it is the exact "same logical checkout-initiation phase" the spec required, since it already resolves `paymentIdempotencyKey` and already owns the moment `startCheckout` is first called.

---

# EXACT_FILES_MODIFIED

**Created**:
- `src/features/menu/hooks/paymentCustomerDataHelpers.js`
- `src/features/menu/hooks/usePaymentCustomerData.js`
- `tests/unit/paymentCustomerDataHelpers.test.js`
- `tests/unit/usePaymentCustomerData.test.js`
- `reports/TASK_3_6D_5_A_1_CUSTOMER_DATA_PERSISTENCE_IMPLEMENTATION_REPORT.md` (this file)

**Modified**:
- `src/features/menu/PaymentFirstCheckoutPanel.jsx` — new `isQrCheckout` prop (default `false`); the record is persisted inside the existing auto-start `useEffect`, immediately before the first `startCheckout` call; `handleCancel` and the `FAILED` branch of the existing outcome-watching effect now also clear the record.
- `tests/unit/PaymentFirstCheckoutPanel.test.jsx` — 9 new tests added; all 12 pre-existing tests re-verified passing, unmodified.

**Not modified** (confirmed via `git diff`): `PublicMenu.jsx` (its tracked diff is unchanged, byte-identical to the `TASK_3_6D_4_C_3` baseline — this task added zero lines to it), `App.jsx`, `createOrderFromSuccessfulPayment`, `paymentService.js`, `payment-webhook`, the payment-status RPC, `usePaymentFirstCheckout.js`, `PaymentFirstPriceConfirmation.jsx`, `PaymentFirstCallbackLanding.jsx`, `usePaymentIdempotencyKey.js`, `useResumedPaymentIdempotencyKey.js`.

---

# STORAGE_KEY_IMPLEMENTATION

```js
export function paymentCustomerDataStorageKey(paymentIdempotencyKey) {
  return `simsim_payfirst_customer_${paymentIdempotencyKey}`
}
```
Exact match to the approved format. Keyed by the payment idempotency key's own resolved value (already available inside `PaymentFirstCheckoutPanel` via `usePaymentIdempotencyKey`, unmodified) — never derived from `slug`/`branchId`, never from the URL's `payment_callback` value.

---

# SCHEMA_IMPLEMENTATION

`buildPaymentCustomerDataRecord({type, isQrCheckout, customerPhone, customerName, tableNumber, deliveryAddress, notes, now})` returns exactly the approved shape. Field-inclusion rules, implemented as unconditional structural logic (not merely documented intent):
- `customerPhone` — always present (trimmed, never truncated — phone shape is already bounded by `create_order`'s own regex, truncation would be meaningless).
- `customerName`/`notes` — included only when a non-empty value is provided (object key entirely absent otherwise, not `null`/`""` — confirmed by `expect(record).not.toHaveProperty(...)` tests, not merely `toBeUndefined()`).
- `tableNumber` — included **only** when `type === 'dine_in' && !isQrCheckout`. For a QR-scoped `dine_in` checkout, `tableNumber` is **never** written to the record even if the caller supplies a value — verified directly (`PFDATA-10`/`PFDATA-10b`), not merely by omission.
- `deliveryAddress` — included only when `type === 'delivery'`.
- Every free-text field (`customerName`, `notes`, `tableNumber`, `deliveryAddress`) is defensively truncated to **500 characters** on write — matching `create_order`'s own existing bound and this arc's established `MAX_STRING_LEN` convention (`TASK_3_6D_E`) — truncated, not rejected, since this is a passive copy of already-submitted, already-UI-validated form data, not a new input-validation gate (per the owner's own explicit instruction not to invent new validation rules conflicting with `create_order`).
- **A missing/empty `customerPhone` blocks persistence entirely** — `persistPaymentCustomerData` returns without writing anything if the phone is absent, rather than storing an incomplete, unusable record. This was not explicitly spelled out character-for-character in the approved schema but is a direct, necessary consequence of "customerPhone: always required" — implemented, not assumed.

---

# TTL_IMPLEMENTATION

`expiresAt = createdAt + PAYMENT_CUSTOMER_DATA_TTL_MS` where `PAYMENT_CUSTOMER_DATA_TTL_MS = 2 * 60 * 60 * 1000` (exactly 2 hours, verified in tests down to the millisecond). Expiry is checked **only** inside `parseStoredPaymentCustomerData`, a pure function taking `now` as an explicit parameter — called only from `readPaymentCustomerData` at actual read time. **No `setInterval`/`setTimeout`/background sweep of any kind exists anywhere in either new file** — confirmed by code review; the only timers in this entire implementation are the ones the test suite itself uses (`vi.useFakeTimers`-free here, since no polling is needed for this feature).

---

# WRITE_TIMING

The record is written inside `PaymentFirstCheckoutPanel`'s existing auto-start `useEffect`, in this exact order: `startedRef.current = true` → `persistPaymentCustomerData(paymentIdempotencyKey, {...fields from checkoutInput...})` → `startCheckout({...checkoutInput, paymentIdempotencyKey})`. This guarantees the record exists in `localStorage` **before** the call that can eventually lead to `redirectUrl` navigation, for **both** possible paths to that redirect: a first-try success (no price change) and a price-confirmed retry (`handleConfirm`) — because the record is written **once**, before either call, and is never re-written or cleared between them. Verified directly (`PFDATA-01`): the record exists in `localStorage` immediately after the first `orchestrate` call, using the checkout form's own `checkoutInput` fields as the **sole** data source — no second source of truth was introduced, exactly as required.

---

# READ_BEHAVIOR

`readPaymentCustomerData(paymentIdempotencyKey, now)`:
- Missing key or missing stored value → `null`, no write.
- Invalid JSON → `null`, **and** the corrupt entry is actively removed from `localStorage` (cleanup, not data generation — the approved spec explicitly distinguished these).
- Unsupported `version` → `null`, entry removed.
- Expired (`now >= expiresAt`) → `null`, entry removed.
- Valid, unexpired → the record, returned as-is, **entry left untouched** (no re-write, no touch of `expiresAt`).
- `usePaymentCustomerData`'s own hook body contains no `setItem` call anywhere — confirmed both by static import-line inspection and by a live `Storage.prototype.setItem` spy across a full render cycle, in both the "record exists" and "record absent" cases.

---

# CLEANUP_BEHAVIOR

Implemented exactly per the approved per-outcome policy, piggybacked onto `PaymentFirstCheckoutPanel`'s **already-existing** `clearKey()` call sites — no new, separate cleanup mechanism was introduced:

| Outcome | Payment key (unchanged) | Customer-data record (this task) |
|---|---|---|
| `SUCCEEDED` | Cleared | **Deliberately kept** — the future order-creation flow owns final cleanup |
| `FAILED` | Cleared | Cleared, at the same existing call site |
| `REJECTED` (explicit "Back") | Cleared (`handleCancel`) | Cleared, at the same `handleCancel` call site |
| `PENDING`/`RETRYABLE_ERROR`/`REQUIRES_RECONCILIATION`/`REDIRECT_REQUIRED` | Kept | Kept (untouched — no code path clears it) |
| Abandoned (browser never returns) | Kept indefinitely (unchanged) | Kept until the 2-hour TTL lazily expires it on next read |

The one line the task explicitly called out — **do not clear the record merely because the callback page renders `SUCCEEDED`** — is satisfied by construction: this entire cleanup logic lives in `PaymentFirstCheckoutPanel`, not `PaymentFirstCallbackLanding` (untouched by this task), and even within `PaymentFirstCheckoutPanel`, the `SUCCEEDED` branch of the outcome effect only clears the *payment key*, never the customer-data record — verified directly with a dedicated test using a controlled, deferred promise to capture the record's continued existence immediately after the `SUCCEEDED` transition.

---

# ORDER_TYPE_BEHAVIOR

Verified for all four combinations: `dine_in` + non-QR → `tableNumber` included; `dine_in` + QR (`isQrCheckout=true`) → `tableNumber` excluded even when supplied; `takeaway` → neither `tableNumber` nor `deliveryAddress`, even when both are supplied; `delivery` → `deliveryAddress` included. `customerName`/`notes` behave identically across all four (included only when non-empty).

---

# QR_BEHAVIOR

Consistent with `TASK_3_6D_5`'s own finding: QR `tableNumber` needs no persistence at all, since it remains recoverable via the approved return-URL contract's `table=<qrToken>` parameter plus the existing `resolve_table_qr` RPC. This implementation enforces that by **never writing** `tableNumber` for a QR-scoped attempt, structurally (not merely by convention) — a caller passing `isQrCheckout={true}` cannot cause `tableNumber` to appear in the record no matter what value it supplies.

---

# MULTI_TAB_BEHAVIOR

Per the owner's explicit instruction, no locking or distributed coordination was added. Tests added prove the one property that *is* required: two different idempotency keys always produce two fully isolated records, with clearing one never affecting the other (`PFDATA-19`). The already-documented, owner-accepted residual risk (two tabs at the same slug/branch sharing one payment key, and therefore one customer-data record, with last-write-wins semantics) is unchanged and was not touched — consistent with the explicit instruction not to redesign payment idempotency in this task.

---

# SECURITY_ANALYSIS

- **Forbidden fields never appear in any record this implementation can produce** — confirmed by a dedicated test enumerating `paymentTransactionId`, `providerRef`, `status`, `amount`, `branchId`, `restaurantId` (and snake_case variants) and asserting none are present, both at the pure-function level and at the actual `PaymentFirstCheckoutPanel`-driven write.
- **`payment_callback`'s URL value is never used as the storage key** — the storage key is always the *locally-resolved* `paymentIdempotencyKey` from `usePaymentIdempotencyKey`, unchanged, untouched by this task.
- **The key is never derived from `slug`/`branchId`** — confirmed by direct inspection of `paymentCustomerDataStorageKey`'s own implementation (single parameter, no other input).
- **Stored values are never treated as authorization** — this implementation contains no code path that reads the record back and uses it to make any access-control or payment-authority decision; it exists purely to be handed, unverified, to a future server-side trigger that (per `TASK_3_6D_5_A`'s own binding requirement, restated here, not re-implemented) must independently resolve `paymentTransactionId` and validate every field server-side exactly as `create_order` already does today.
- **No client-side encryption was added** — per the owner's explicit instruction, and consistent with `TASK_3_6D_5_A`'s own threat-model conclusion that it would provide no real protection.
- **No secrets, service-role credentials, or payment status of any kind appear in either new file** — confirmed by static grep in addition to the dedicated tests above.

---

# PRIVACY_ANALYSIS

Unchanged from the approved spec's own conclusion: this record's PII footprint (phone, optionally name/table/address/notes) is a strict subset of data this codebase already handles client-side elsewhere (cart contents, `simsim_phone_${slug}`), TTL-bounded, and cleared proactively on every explicit terminal outcome except the one the owner explicitly reserved for a future task.

---

# TESTS_ADDED

**`tests/unit/paymentCustomerDataHelpers.test.js`** — 30 tests covering the storage key format, `version`/`createdAt`/`expiresAt` (down to the exact 2-hour millisecond delta), `customerPhone` presence, optional `customerName`/`notes`, all four order-type field-inclusion combinations, the complete forbidden-field enumeration, 500-character truncation, invalid-JSON/unsupported-version/expired-record parsing (both as pure-function assertions and as live-`localStorage` cleanup-on-read assertions), multi-key isolation, and "read never writes" (via a `setItem` spy).

**`tests/unit/usePaymentCustomerData.test.js`** — 6 tests: reads a valid record, returns `null` when absent, never calls `setItem` under any circumstance, handles a missing key gracefully, correctly isolates two different keys, and a static check that the hook's own import lines never reference the write-side function.

**`tests/unit/PaymentFirstCheckoutPanel.test.jsx`** — 9 new tests (all 12 pre-existing tests re-verified passing, unmodified): the record exists immediately after the first `orchestrate` call using `checkoutInput`'s own data; non-QR `dine_in` includes `tableNumber`, QR `dine_in` (`isQrCheckout`) excludes it even when supplied; `FAILED` clears the record; `REQUIRES_RECONCILIATION`/`RETRYABLE_ERROR` both preserve it; `SUCCEEDED` deliberately preserves it (the task's own most important behavioral requirement, tested explicitly, not merely asserted in a comment); the explicit "Back" action after `REJECTED` clears it; and no forbidden field appears in the record the panel actually produces end-to-end.

**Two real, self-inflicted test-timing bugs were found and fixed during authoring**, both the same root cause: capturing the generated payment key via `localStorage.getItem(...)` *after* an outcome that triggers `clearKey()` risks reading a key that has already been cleared by the time the assertion runs, since `waitFor`'s polling can let the entire async chain (orchestrate resolve → state update → clearing effect) complete before the test's own next line executes — silently turning "the record was cleared" into "there was never a key to check," a false-positive risk, not a true pass. Fixed for both the `SUCCEEDED`-preserves and `FAILED`-clears tests by switching to the file's own pre-existing `deferred()` promise pattern (already used by `PFCP-04`), capturing the key deterministically while `orchestrate` is still pending, before any possible clear.

---

# FOCUSED_RESULTS

```
npx vitest run tests/unit/paymentCustomerDataHelpers.test.js tests/unit/usePaymentCustomerData.test.js tests/unit/PaymentFirstCheckoutPanel.test.jsx
 Test Files  3 passed (3)
      Tests  57 passed (57)
```

---

# FULL_REGRESSION

```
npx vitest run
 Test Files  53 passed (53)
      Tests  959 passed (959)

npm test -- --run
 Test Files  53 passed (53)
      Tests  959 passed (959)
```

959 = 914 (the `TASK_3_6D_5_A` baseline) + 45 new (30 + 6 + 9). One transient Vitest `maxWorkers`/`sequence.groupOrder` tooling flake occurred on the first `npm test -- --run` attempt (the same recurring, code-unrelated flake documented repeatedly throughout this session) — resolved by an immediate retry, which passed cleanly. Both commands ultimately ran to completion with zero failures; no pre-existing test was weakened or deleted.

---

# BLOCKERS

None.

---

# WARNINGS

1. `isQrCheckout` is a **new, caller-supplied** prop on `PaymentFirstCheckoutPanel` — since this panel is still not mounted into any live page, no real caller exists yet to supply it correctly; whichever future task wires this panel into a live checkout flow must remember to pass it accurately (`true` for QR-scoped checkouts, `false`/omitted otherwise) or QR `dine_in` orders would incorrectly persist a `tableNumber` that should have been omitted.
2. This implementation does not, and per its own strict scope should not, address how the future order-creation trigger will actually *consume* this record — that remains entirely `3.6D.6`'s scope, informed but not pre-empted by this work.

---

# KNOWN_RESIDUAL_RISKS

Restated from the approved spec, unchanged, not newly introduced or newly resolved by this implementation:
- The same-slug/branch multi-tab collision behavior (two tabs sharing one payment key, and therefore one customer-data record) — explicitly accepted by the owner, explicitly not redesigned here.
- A genuinely abandoned attempt's record persists until the 2-hour TTL lazily expires it on next read — inherent to any client-only persistence design, not specific to this implementation.
- If a genuinely successful payment's order-creation trigger runs more than 2 hours after checkout (extremely unlikely for a synchronous redirect flow), the record will have expired and the future trigger will need its own honest "we no longer have your order details" degradation path — flagged in `TASK_3_6D_5`/`TASK_3_6D_5_A`, not resolved here, not this task's to resolve.

---

# DEFERRED

- The order-creation-trigger Edge Function and its own spec-and-approval cycle.
- `PaymentFirstCallbackLanding`'s new `CONFIRMING_ORDER` state.
- Wiring `isQrCheckout` and this entire mechanism into any live checkout page.
- `3.6D.6`, `3.6D.7`, `3.6E`.
- Any deployment, staging or production.

---

# GIT_STATUS

New files this task (all untracked):
```
src/features/menu/hooks/paymentCustomerDataHelpers.js
src/features/menu/hooks/usePaymentCustomerData.js
tests/unit/paymentCustomerDataHelpers.test.js
tests/unit/usePaymentCustomerData.test.js
reports/TASK_3_6D_5_A_1_CUSTOMER_DATA_PERSISTENCE_IMPLEMENTATION_REPORT.md
```

Modified this task (`PaymentFirstCheckoutPanel.jsx` already untracked from `TASK_3_6D_3`, content updated; its test file already untracked):
```
src/features/menu/PaymentFirstCheckoutPanel.jsx
tests/unit/PaymentFirstCheckoutPanel.test.jsx
```

**`src/pages/PublicMenu.jsx` confirmed untouched by this task** — its tracked `git diff --stat` (`30 lines, +28/-2`) is byte-identical to the `TASK_3_6D_4_C_3` baseline, carried over from that prior task, not newly added here. Full tracked-file diff (`git diff --stat`): identical to every prior task's baseline in this arc (14 files, 800 insertions(+), 25 deletions(-)) — zero new tracked-file changes from this task. No commit, no push, no merge, no deploy.

---

# EXACT_NEXT_STEP

Per instruction: **stopping here.** Not implementing the order-creation trigger, not adding the `CONFIRMING_ORDER` state, not proceeding to `3.6D.6`, `3.6D.7`, or `3.6E`, and not deploying anything. The customer-data persistence mechanism is now fully built, tested, and ready to be consumed once the order-creation-trigger Edge Function (its own, separate, not-yet-started spec cycle) exists.

---

*Report generated 2026-08-27. Local implementation and tests only — no deployment, no Moyasar call, no commit, no push, no merge.*
