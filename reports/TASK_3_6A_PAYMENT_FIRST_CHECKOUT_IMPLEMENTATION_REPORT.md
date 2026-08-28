# Task 3.6A — Payment-First Checkout Service

**No code was written. This task stopped at Phase 2 per its own explicit, mandatory stop condition.**

---

# EXECUTIVE SUMMARY

Phase 1 (interface documentation) was completed in full, against the actual current code — not assumed. Phase 2 (amount integrity) then surfaced a genuine, well-evidenced architectural gap: **there is no server-side mechanism in this codebase, other than `create_order` itself, that computes or validates an authoritative checkout amount.** The existing cart total is computed entirely client-side (`useCheckout.js`, from `localStorage`-persisted cart data and `lib/pricing.js`) and is submitted to `create_order` only as an optional, non-authoritative cross-check (`p_client_total`) — the *only* place server-side pricing is actually computed and enforced is inside `create_order`'s own transaction, which this task's own instructions explicitly forbid calling (Phase 10: "Explicitly DO NOT call: create_order in this task").

Since Payment-First requires knowing a trustworthy amount **before** any order (and therefore before any `create_order` call) exists, and since no other component in this codebase can produce that trustworthy amount, implementing the Checkout Service now would necessarily mean either (a) trusting a client-supplied amount — explicitly forbidden — or (b) inventing a new pricing-computation mechanism — explicitly forbidden ("Do not redesign it... STOP. Report the exact blocker."). Per the task's own instructions, this is exactly the documented stop condition.

**No insecure implementation was written. No new file was created. No existing file was modified.**

**Final verdict: `AMOUNT_INTEGRITY_GAP`**

---

# CURRENT ARCHITECTURE

## Phase 1 — Actual interfaces, read fresh this session, not assumed

**File locations** (the task's prompt referenced `src/payments/paymentService.js`; the actual, confirmed path is `src/payments/services/paymentService.js`, re-exported through `src/payments/services/index.js` → `src/payments/index.js`):

```
src/payments/
├── index.js                    export * from ./types, ./contracts, ./adapters, ./services, ./utils
├── services/
│   ├── index.js                export { paymentService } from './paymentService'
│   └── paymentService.js       ← the actual startCharge() implementation
├── adapters/
│   ├── index.js                getAdapter(providerKey) / hasAdapter(providerKey)
│   └── moyasar.js               MoyasarAdapter — unchanged since remediation task
├── contracts/PaymentAdapter.js
├── types/index.js               TransactionStatus, PaymentStatus, RefundStatus, WebhookEventType, PaymentProvider, PaymentMode
└── utils/index.js               newIdempotencyKey(), isTerminalStatus(), isSuccess(), normalizeAmount()
```

**Confirmed unchanged since Task 3.3** (`524bdda`, checksummed): `paymentService.js`, `adapters/index.js`, `utils/index.js`, `contracts/PaymentAdapter.js`. (`moyasar.js` and `types/index.js` differ only due to this session's earlier, already-reported remediation task — no further change made here.)

**Exact `startCharge` signature** (`paymentService.startCharge(input, { db })`):

```js
async startCharge(input, { db }) {
  // input.restaurantId, input.amount, input.currency — REQUIRED, validated, throws if missing/invalid
  // input.provider ?? 'moyasar'
  // input.idempotencyKey ?? newIdempotencyKey('pay')
  // input.invoiceId, input.metadata, input.returnUrl — OPTIONAL
  ...
}
```

`startCharge` **already fully implements**, internally: the application-level idempotency pre-check (`SELECT` before `INSERT`), transaction-row creation (`status=INITIATED`), the provider call (`adapter.createCharge`), success persistence (`provider_ref`/`status`/`raw`/`metadata`), and failure persistence (`status=FAILED`, `failure_reason`, re-throw). This means most of Phases 3–8 of this task's own instructions describe behavior that **already exists inside `startCharge`** — the "Checkout Service" this task asks for would be a thin orchestration layer around it, not a reimplementation. This was confirmed by re-reading the full function body this session (unchanged from the Task 3.5 Production Readiness audit's own reading of it).

**`ChargeResult` type** (`src/payments/types/index.js`, re-read): `{ providerRef, status, redirectUrl?, clientSecret?, raw? }` — confirms a `redirectUrl` **can** be present (Moyasar's hosted payment page), consistent with `MoyasarAdapter.createCharge` returning `redirectUrl: data.source?.transaction_url ?? undefined`.

**`create_order`**: re-confirmed, 13-parameter signature (post-Task-3.5), computes `subtotal`/`tax`/`delivery_fee`/`total` **entirely server-side** from `products.price` + active `coupons`, and accepts an **optional** `p_client_total` used only as a mismatch-detector (`price_changed: true` response, no order created, if it doesn't match) — never as a trusted input.

**Current checkout implementation**: `src/features/menu/hooks/useCheckout.js` (`submitOrder`) — computes `const total = clientTotalOverride ?? (Math.max(0, cartTotal - discountAmount) + deliveryFee)` **entirely client-side**, then calls `create_order`/`create_order_from_table_qr` directly. `cartTotal`/`discountAmount`/`deliveryFee` all originate from `useCart.js`, which persists cart state in `localStorage` only — confirmed via `grep`, no server-side cart/session table exists anywhere in `sql/`.

**Existing payment tests** (all re-run this session, all still passing, none modified): `tests/unit/paymentService.test.js`, `tests/unit/MoyasarAdapter.test.js`, `tests/unit/paymentWebhook.test.js`, `tests/unit/paymentWebhookSyntheticE2E.test.js`.

---

# IMPLEMENTATION

**None.** Per the stop condition documented below.

---

# PAYMENT INPUT CONTRACT

**Not defined.** Defining a real input contract requires knowing where the authoritative `amount` comes from — see AMOUNT INTEGRITY.

---

# AMOUNT INTEGRITY

**`AMOUNT_INTEGRITY_GAP` — confirmed, evidence-based, this is the reason this task stopped.**

Evidence, exhaustively checked this session (not assumed from a prior audit):

1. `grep`'d `sql/` for any standalone price-preview/quote/dry-run RPC (`price_preview`, `compute_order_total`, `preview_order`, `quote_order`, `dry_run`, `calculate_total`) — **zero matches**.
2. Confirmed `create_order` has no dry-run/preview parameter — it is all-or-nothing: either it creates a real order row, or (only when a *mismatching* `p_client_total` is explicitly supplied) it returns the server-computed total **without** creating a row. Even this latter path still requires calling `create_order` itself (with a valid phone number, valid restaurant/branch/products, etc.) — and this task's Phase 10 explicitly forbids calling `create_order` in this task, under any circumstance, regardless of whether a row would be created.
3. Confirmed no server-persisted cart/checkout-session table exists anywhere in the schema (`grep` for `create table.*cart`/`checkout_session`/`basket` — only an unrelated `cart_wide_recommendations` match, a product-recommendation feature, not a pricing/cart-total table).
4. Confirmed the existing checkout flow's `total` (`useCheckout.js`) is computed **entirely in the browser**, from `localStorage`-persisted cart data, and is sent to `create_order` purely as an optional, non-authoritative cross-check value.

**Conclusion**: the *only* place in this entire codebase where an order's authoritative total is computed and enforced is inside `create_order`'s own transaction. There is no independent, callable, server-side source of a trustworthy checkout amount that exists *before* an order does — which is precisely what Payment-First requires. Building the Checkout Service now would force a choice between:
- **(a) Trusting a client-supplied amount** — explicitly forbidden by this task ("The client MUST NOT be trusted for authoritative payment amount... Do not weaken the security model... Do not implement an insecure client-controlled amount").
- **(b) Inventing a new pricing-computation mechanism** (e.g., a new "quote" RPC duplicating `create_order`'s pricing logic) — explicitly forbidden ("If you discover that the current paymentService/MoyasarAdapter contract cannot safely support Payment-First without a schema redesign: STOP. Do not redesign it. Report the exact blocker.").

Neither option was taken. **Reported as the blocker instead, exactly as instructed.**

---

# PAYMENT IDEMPOTENCY

**Not implemented — blocked by the amount-integrity gap above (nothing was built to apply idempotency to).** For the record, evaluated and confirmed still true this session: `payment_transactions.idempotency_key` now has the database-level `uq_paytx_idempotency_key` unique partial index (Task 3.6F, applied to Production and re-confirmed unaffected by this task — see FULL REGRESSION), so the *mechanism* a future Checkout Service would rely on for idempotency is already correctly in place. This task did not need to build or verify that mechanism further — only to use it, which never happened because implementation did not proceed.

---

# TRANSACTION CREATION

**Not implemented.** `paymentService.startCharge` already implements the correct transaction-creation logic (status=`INITIATED`, all required columns) internally — nothing new needed to be built for this specific piece; it was never reached because no caller was written.

---

# PROVIDER CALL

**Not implemented.** `paymentService.startCharge` → `MoyasarAdapter.createCharge` already exists, unmodified, and was not called by any new code in this task.

---

# PROVIDER SUCCESS

**Not implemented.**

# PROVIDER FAILURE

**Not implemented.**

# G5 PERSISTENCE FAILURE

**Not implemented — correctly so, since implementing a response to this failure mode without a working Checkout Service around it would be meaningless.** For the record: G-5 remains open, exactly as characterized in the Gap Audit and the Scope Architecture Audit — unaffected by this task, since this task made no code change of any kind.

---

# RESULT CONTRACT

**Not defined.**

---

# ORDER CREATION

**Confirmed: no Order was created.** No code was written that could create one — `create_order` was never called, referenced in new code, or modified.

---

# WEBHOOK

**Confirmed unchanged.** `supabase/functions/payment-webhook/` was not touched — `git diff` shows the same, unchanged remediation-task diff for `handler.js` as every prior task this session; no new modification.

---

# SECURITY

The one security property this task was specifically instructed to protect — **amount integrity** — was protected by *stopping* rather than by writing code that would have violated it. All other security checks (tenant isolation, secrets, provider-reference-never-from-client) are moot, since no code exists to evaluate them against.

---

# TESTS

**None added.** Writing tests for a service that doesn't exist, or for an insecure implementation that wasn't built, would not have produced meaningful coverage.

---

# TEST RESULTS

No new tests to run. Existing, most-relevant payment tests re-run this session to confirm the pre-existing baseline is intact:

```
$ npx vitest run tests/unit/paymentService.test.js tests/unit/MoyasarAdapter.test.js tests/unit/paymentWebhook.test.js tests/unit/paymentWebhookSyntheticE2E.test.js
 Test Files  4 passed (4)
      Tests  93 passed (93)
```

---

# FULL REGRESSION

```
$ npm test -- --run
 Test Files  37 passed (37)
      Tests  526 passed (526)
```

**Matches the stated baseline exactly (526/526) — confirms this task made zero change of any kind to the codebase.**

---

# GIT STATUS

```
$ git status --short
 M src/payments/adapters/moyasar.js       (unchanged — carried over from the earlier remediation task)
 M src/payments/types/index.js            (unchanged)
 M supabase/functions/payment-webhook/handler.js  (unchanged)
 M tests/unit/MoyasarAdapter.test.js      (unchanged)
 M tests/unit/paymentWebhook.test.js      (unchanged)
 (plus the same pre-existing untracked report/sql files from prior sessions)

$ git diff --stat
 5 files changed, 187 insertions(+), 7 deletions(-)   (identical to every prior task this session — nothing new)

$ git diff
(identical content to the already-reported remediation task's diff — no new line)
```

**No commit, no push, no merge.**

---

# FILES CHANGED

**None.**

---

# BLOCKERS

- **`AMOUNT_INTEGRITY_GAP`** (this task's own stop condition, triggered): no server-side, independently-callable mechanism exists to derive or validate a checkout amount before an order is created. Resolving this requires a decision this audit is not authorized to make unilaterally — either (a) a new, minimal "quote"/pricing-preview RPC that reuses `create_order`'s existing pricing logic without creating a row (the cleanest option, but is a schema/RPC design decision), or (b) restructuring the flow so amount validation happens differently (a larger architectural change, not recommended without further review). **Neither was implemented or decided here — this is reported as a blocker for your decision, per instruction.**

# WARNINGS

None beyond the blocker above — this task's scope was narrow enough that stopping cleanly at Phase 2 avoided any secondary risk.

# KNOWN LIMITATIONS

- This report cannot classify any of Phases 3–13 as `IMPLEMENTED`, `VERIFIED`, or even meaningfully `DEFERRED` to a later 3.6 sub-task, because they were never reached — they are simply `NOT IMPLEMENTED`, pending resolution of the amount-integrity blocker.
- `paymentService.confirmCharge` (which exists in code, per the Gap Audit, and could theoretically play a role in a future amount-verification design — e.g., confirming a charge's *actual* amount against what Moyasar recorded, after the fact) was not evaluated as a solution here, since it operates *after* a charge already exists, not before — it doesn't solve the "derive the amount to charge in the first place" problem.

---

# REPORT FILE

`reports/TASK_3_6A_PAYMENT_FIRST_CHECKOUT_IMPLEMENTATION_REPORT.md`

# DOWNLOAD COPY

`/sdcard/Download/TASK_3_6A_PAYMENT_FIRST_CHECKOUT_IMPLEMENTATION_REPORT.md` (copied and verified after this report was written).

---

## FINAL VERDICT

**AMOUNT_INTEGRITY_GAP**

Per the task's own explicit instruction: "If amount cannot be derived or validated server-side: STOP. Return: AMOUNT_INTEGRITY_GAP. Do not implement an insecure client-controlled amount." That is exactly what was found, and exactly what this report does.

---

*Report generated 2026-08-26. No code was written, no file was modified, no migration was created, no deployment occurred. Stopped at Phase 2 per the task's own mandatory stop condition.*
