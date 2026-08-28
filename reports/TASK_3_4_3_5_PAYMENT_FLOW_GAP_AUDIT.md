# Task 3.4/3.5 — Payment Flow Gap Audit

**Read-only audit. No code, database, or configuration was changed. No fix was applied to anything found.**

---

# EXECUTIVE SUMMARY

The complete intended chain — Customer Order → Payment Transaction → Payment Provider → Moyasar → Webhook → Payment Transaction Update → Order State — was traced end-to-end through the actual code, not assumed. **The headline finding: every individual link in this chain is implemented and tested in isolation, but almost none of them are actually wired together in any live code path.** Specifically:

1. **`paymentService.startCharge` — the only function anywhere that creates a `payment_transactions` row — has zero callers in the entire application.** No page, component, or service invokes it. It exists, is unit-tested, but is functionally dead code from the running application's perspective.
2. **`orders.payment_transaction_id` — the column Task 3.5 added — has zero writers in any live code path.** `useCheckout.js` (the only caller of `create_order`) never passes `p_payment_transaction_id`. Confirmed via a full-repository grep: zero matches for `payment_transaction_id`/`paymentTransactionId` outside test files and the SQL migration itself.
3. **There is no payment UI anywhere in the codebase** — no checkout-with-payment page, no "pay online" button, no Moyasar-facing component. Confirmed via grep across `src/pages/`, `src/components/`, `src/features/`.
4. **No trigger, function, or frontend code propagates `payment_transactions.status` to `orders.status`.** These two tables are connected by exactly one static FK column (`orders.payment_transaction_id`) and nothing else — no automatic sync exists in either direction.
5. **A real, previously-undocumented reliability gap was found in `paymentService.startCharge` itself**: if the Moyasar API call succeeds but the subsequent database write (recording `provider_ref`/status) fails, the transaction row is permanently stuck at `initiated` with no `provider_ref` — meaning a customer could be charged by Moyasar while SimSim has no record of it, and the eventual webhook would find no matching transaction (`transaction_not_found`) and silently lose the update.

None of this is a defect in Task 3.4 or Task 3.5 individually — both were built and verified correctly for what they scope themselves to. **The gap is entirely at the integration layer between them, which was never in either task's stated scope**, and which — per Task 3.4's own original report (OQ-3) — was explicitly deferred as "Payment UI... separate scope."

---

# PHASE 1 — ORDER CREATION TRACE

**Caller located**: `src/features/menu/hooks/useCheckout.js` — the **only** caller of `create_order`/`create_order_from_table_qr` in the entire codebase (confirmed via grep; the only other matches are comments/docs referencing the RPC name, not invoking it).

```js
// useCheckout.js, submitOrder()
const request = tableQr
  ? supabase.rpc('create_order_from_table_qr', { p_qr_token, p_items, ..., p_idempotency_key })
  : supabase.rpc('create_order', { p_restaurant_id, p_branch_id, ..., p_idempotency_key })
```

**Direct answers, from evidence:**

1. **Is the Order created before Payment?** N/A in practice — no live flow creates a payment at all (see Phase 2). When it eventually does, the RPC signature makes the order and any payment link happen in the **same** database call: `create_order` optionally accepts `p_payment_transaction_id` and writes it into the same `INSERT` as the order itself. So "before/after" isn't quite the right framing for the *intended* design — a payment transaction would need to exist *first* (to have an ID to pass in), then the order is created referencing it, atomically, in one RPC call.
2. **Is the Payment Transaction created before the Order?** By the design above, yes — a transaction would need to exist first to be referenced. But **no code currently does this** (see Phase 2).
3. **Can an Order be created without a Payment Transaction?** **Yes — this is the default and only currently-exercised path.** `p_payment_transaction_id` defaults to `NULL`; `useCheckout.js` never supplies it.
4. **Can a Payment Transaction be created without an Order?** **Yes, structurally** — `payment_transactions` has no FK to `orders` at all (only `restaurant_id` and `invoice_id`). Nothing requires an order to exist first. (Moot today since nothing creates a transaction at all — see Phase 2.)
5. **Where are they linked?** Exactly one place: `orders.payment_transaction_id` (added by Task 3.5's migration), populated only as an optional parameter to `create_order`.
6. **Is `orders.payment_transaction_id` actually used today?** **No.** Confirmed by a full grep of `src/` for `payment_transaction_id`/`paymentTransactionId`: the only matches are inside `src/lib/orderPaymentReferenceGuard.test.js` (a static SQL-text guard test) — zero references in any page, hook, or service.
7. **Who is responsible for populating it?** By design, whatever future code initiates a payment and then calls `create_order` with the resulting transaction ID — **this caller does not exist yet.**

---

# PHASE 2 — PAYMENT TRANSACTION CREATION TRACE

**Every `INSERT` into `payment_transactions` in the entire codebase** is in exactly one place: `src/payments/services/paymentService.js`, method `startCharge()` (lines 42–55). No other file, anywhere, inserts into this table.

| Field | Source |
|---|---|
| `restaurant_id` | `input.restaurantId` (caller-supplied) |
| `invoice_id` | `input.invoiceId ?? null` (optional, caller-supplied) |
| `provider` | `input.provider ?? 'moyasar'` |
| `status` | Hardcoded `TransactionStatus.INITIATED` at insert time |
| `amount`, `currency` | Caller-supplied |
| `idempotency_key` | Caller-supplied or auto-generated (`newIdempotencyKey('pay')`) |
| `metadata` | Caller-supplied or `{}` |
| `order_id` | **No such column exists on this table, and none is written** — confirmed against the live schema (Production Readiness audit, prior task): `payment_transactions` has no `order_id` field at all. The relationship is the other direction only (`orders.payment_transaction_id`). |

**Timing classification (per your A–E options): the transaction row is created at whatever moment the (non-existent) caller invokes `paymentService.startCharge` — the code itself supports being called "at checkout" (option D) since it's a standalone service function with no dependency on order state, but since there is no live caller, this is currently a purely theoretical classification.** No code path exercises option A, B, C, D, or E today — the honest answer is: **none of the above happens in the running application.**

**Who calls `paymentService.startCharge`?** Confirmed via grep: **nobody**, in application code. The only places `paymentService` is imported at all are its own `index.js` re-export and its own test file. `supabase/functions/payment-webhook/handler.js` explicitly does **not** import it either (its own comment explains why — Deno bare-specifier incompatibility — and reimplements the *webhook-handling* half only, not `startCharge`).

---

# PHASE 3 — MOYASAR CALL TRACE

Traced through `paymentService.startCharge()`, the only code path that would ever call `MoyasarAdapter.createCharge`:

1. `payment_transactions` row is **inserted first**, `status=INITIATED` (line 42–55) — **before** any Moyasar API call.
2. `adapter.createCharge(...)` is called (line 63–64) — this is where the real `fetch()` to `https://api.moyasar.com/v1/payments` happens (in `moyasar.js`).
3. **If the Moyasar API call fails** (`catch` block, lines 73–83): the transaction row is explicitly updated to `status=FAILED` with `failure_reason: err.message`, then the error is re-thrown to the caller. This path is correct and handled.
4. **If Moyasar succeeds**: the row is updated with `provider_ref`, the mapped `status`, `raw`, and `metadata` (lines 88–97) — **this final update has no try/catch around it.**
5. **New finding — what happens if this final DB write fails after a successful Moyasar charge?** The update call is unguarded. If it throws (network blip, transient DB error, etc.), the exception propagates uncaught out of `startCharge()`. At that point: Moyasar has already processed a real charge (a `chargeResult` with a real `providerRef` exists in memory), but the `payment_transactions` row in the database **still shows `status=INITIATED` with `provider_ref=NULL`** — the successful result was never persisted. When Moyasar's webhook later arrives for this `provider_ref`, `handler.js`'s lookup (`SELECT ... WHERE provider_ref = event.providerRef`) would find **no matching row**, return `transaction_not_found`, and the payment confirmation would be **silently and permanently lost** — with no automatic retry or reconciliation path anywhere in the codebase. This is a genuine reliability gap, not present in either Task 3.4's or Task 3.5's own scope, and not something either task's existing tests would catch (both test `startCharge` and the webhook in isolation from each other).

Where is the Moyasar payment ID stored? `chargeResult.providerRef` (Moyasar's `data.id`) → `payment_transactions.provider_ref`. This matches exactly what the webhook later looks up by.

---

# PHASE 4 — WEBHOOK TRACE

Traced through `handler.js` (post-remediation, current code) for every event type it now recognizes:

| Event | Transaction effect | Order effect | Current status |
|---|---|---|---|
| `payment_paid` | `payment_transactions.status → succeeded` (via `data.status`/`mapStatus`, or `_eventTypeToStatus` fallback) | **None — no code touches `orders` anywhere in the webhook** | Implemented, unit- and synthetic-E2E-tested |
| `payment_failed` / `payment_faild` | `status → failed` | **None** | Implemented, tested (both spellings, post-remediation) |
| `payment_authorized` | `status → pending` | **None** | Implemented, tested |
| `payment_expired` | `status → cancelled` | **None** | Implemented (not in official docs — flagged in the compatibility audit, unchanged) |
| `payment_refunded` / `payment_voided` / `payment_captured` / `payment_verified` | Recorded as `recognized_unhandled`; **status transition only applied if `data.status` is explicitly present**, otherwise deliberately left untouched | **None** | Implemented post-remediation, no invented business logic |

**"Order effect" is `None` for every single event type, without exception.** This is not an oversight of this audit — it is a direct, verified fact of the current code: `handler.js` contains zero references to the `orders` table (re-confirmed by grep in this task, consistent with every prior audit this session). No event type, however it's classified, ever results in any write to `orders`.

---

# PHASE 5 — ORDER STATUS SYNC

**This is the central finding of this audit, stated plainly: no mechanism of any kind makes `payment_transactions.status` affect `orders.status`.**

Checked, exhaustively, and found none of:
- **SQL triggers**: grepped every file in `sql/` and `sql/staging/` for any trigger definition referencing both tables — none exists. The only SQL files referencing both `payment_transactions` and `orders` at all are `payments_gateway_foundation.sql` (defines `payment_transactions`, doesn't touch `orders`) and `order_payment_reference.sql`/its staging variant (adds the static `orders.payment_transaction_id` FK column and the `create_order` parameter — no trigger, no propagation logic).
- **SQL functions**: no function other than `create_order` itself reads or writes `payment_transaction_id`, and `create_order` only ever *validates and stores* the reference at order-creation time — it never re-reads `payment_transactions.status` afterward, and nothing calls back into `orders` when a transaction's status later changes.
- **Application-layer services**: `paymentService.js` never queries or writes `orders`. `handler.js` never queries or writes `orders`.
- **Event handlers / listeners**: no Postgres `LISTEN`/`NOTIFY`, no Supabase Realtime channel, no webhook-triggered callback of any kind touches `orders`.
- **Frontend logic**: no component, hook, or page reads `payment_transactions` at all (confirmed by grep — the only frontend-adjacent match is the guard test), so there is no client-side polling or realtime subscription reacting to payment status either.

**Consequence, stated directly**: if the entire payment flow were wired up today exactly as designed (a future caller creates a transaction, calls `create_order` with it, Moyasar processes the charge, the webhook fires and marks the transaction `succeeded`), **the linked order's `status` would remain `pending` forever**, indistinguishable from an order that was never paid at all, unless some *additional*, currently-nonexistent piece of logic is built to close this loop.

---

# FULL CHAIN — CURRENT STATE DIAGRAM

```
Customer Order (useCheckout.js → create_order RPC)
  ✅ IMPLEMENTED, LIVE, WORKING — the only actively-exercised part of this entire chain
        │
        │  p_payment_transaction_id: NEVER PASSED (confirmed, zero call sites)
        ▼
Payment Transaction (paymentService.startCharge)
  ✅ IMPLEMENTED, UNIT-TESTED  ❌ ZERO CALLERS — dead code from the app's perspective
        │
        ▼
Payment Provider / Moyasar (MoyasarAdapter.createCharge)
  ✅ IMPLEMENTED, UNIT-TESTED  ❌ NEVER INVOKED (no caller reaches this far)
  ⚠️ Gap: unguarded DB write after a successful charge (Phase 3, finding 5)
        │
        ▼
Webhook (payment-webhook Edge Function)
  ✅ IMPLEMENTED, TESTED (unit + synthetic E2E)  ❌ NOT DEPLOYED
  ⚠️ Authentication mechanism unverified against real Moyasar (carried forward, unchanged)
        │
        ▼
Payment Transaction Update
  ✅ IMPLEMENTED, TESTED — this part of the chain genuinely works, in isolation
        │
        ✕  NO CONNECTION EXISTS PAST THIS POINT
        ▼
Order State
  ❌ NEVER UPDATED BY ANYTHING PAYMENT-RELATED — confirmed, no trigger/function/service/frontend
     code of any kind propagates payment status to order status
```

---

# GAP SUMMARY

| # | Gap | Severity | Owner scope |
|---|---|---|---|
| G-1 | `paymentService.startCharge` has zero callers anywhere in the application | High (blocks the entire flow from ever starting) | Not Task 3.4 or 3.5 — belongs to whatever builds the checkout-with-payment UI |
| G-2 | `orders.payment_transaction_id` has zero writers in any live code path | High (Task 3.5's own column is currently unreachable from any real user action) | Same as above |
| G-3 | No payment UI exists anywhere | High (root cause of G-1/G-2) | Explicitly out of scope for both 3.4 and 3.5 per their own prior reports |
| G-4 | No order-status sync when a payment transaction's status changes | High (even once G-1–G-3 are resolved, this would still leave orders stuck at `pending` forever) | Not scoped to any completed task |
| G-5 | Unguarded DB write in `paymentService.startCharge` after a successful Moyasar charge — a successful real-world charge could be silently unrecorded | Medium–High (data-integrity/reconciliation risk, narrow window, but real) | Newly discovered this audit; belongs to whichever future task revisits `paymentService.js` |
| G-6 (carried forward, not new) | Webhook authentication unverified against real Moyasar | High | Already tracked, unchanged |
| G-7 (carried forward, not new) | `transaction_not_found` returns `200`, no retry safety net for a race condition | Medium | Already tracked, unchanged |
| G-8 (carried forward, not new) | `create_order`'s payment-reference check deliberately doesn't validate transaction status (any status, even `failed`, can be linked) | Low–Medium, documented-as-intentional in the SQL's own comment, deferred by design pending a real UI's requirements | Already a known, deliberate deferral (Task 3.5's own comment), not a bug |

**No gap in this list was fixed, patched, or worked around. All are reported for your review only.**

---

# BLOCKERS FOR TASK 3.6

Presented as information for your decision, not a recommendation to proceed or not: if Task 3.6 (or whatever comes next) intends to build toward a working end-to-end payment flow, G-1 through G-4 are the actual, concrete prerequisites — none of them are solved by anything completed so far (Tasks 3.1–3.5 built correct, well-tested *components*, but the *connective tissue* between "customer wants to pay" and "order reflects that it was paid" does not exist yet in any form). If Task 3.6 has a different, narrower objective, these gaps may not all be relevant — this audit doesn't assume what Task 3.6 is.

---

# GIT STATUS

```
$ git status --short
 M src/payments/adapters/moyasar.js       (unchanged from remediation — this audit made no edits)
 M src/payments/types/index.js            (unchanged from remediation)
 M supabase/functions/payment-webhook/handler.js  (unchanged from remediation)
 M tests/unit/MoyasarAdapter.test.js      (unchanged from remediation)
 M tests/unit/paymentWebhook.test.js      (unchanged from remediation)
 (plus pre-existing untracked report/sql files from prior sessions)

$ git diff --stat
 5 files changed, 187 insertions(+), 7 deletions(-)   (identical to the remediation task's diff — nothing new)
```

**No commit, no push, no merge, no deploy, no database write, no Moyasar configuration.** This entire task consisted of `grep`/`Read`/`Bash` inspection only.

---

# REPORT FILE

`reports/TASK_3_4_3_5_PAYMENT_FLOW_GAP_AUDIT.md`

# DOWNLOAD COPY

`/sdcard/Download/TASK_3_4_3_5_PAYMENT_FLOW_GAP_AUDIT.md` (copied and verified after this report was written).

---

## FINAL POSITION

The payment system's individual pieces (Moyasar adapter, payment service, webhook, order-reference column) are each correctly built and tested in isolation — Tasks 3.1 through 3.5 all did what they set out to do. **What doesn't exist yet is the thing that connects them into an actual payment flow a customer could use**: nothing calls `paymentService.startCharge`, nothing populates `orders.payment_transaction_id`, and nothing would update an order's status even if a payment succeeded. This was true before this audit and remains true after it — nothing was changed. The purpose of this report is solely to make that state explicit and documented before any further payment-related work begins.

---

*Report generated 2026-08-26. Read-only audit — no code, database, or configuration change of any kind. No commit, push, deploy, or Moyasar configuration.*
