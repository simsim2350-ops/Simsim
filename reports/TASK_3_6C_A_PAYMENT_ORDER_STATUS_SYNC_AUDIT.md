# Task 3.6C-A — Payment → Order Status Sync Architecture Audit

**Read-only. No code, schema, or database was changed. No Moyasar call. No migration created.**

---

# EXECUTIVE SUMMARY

The single most important finding of this audit: **most of what "payment → order sync" naively suggests is already structurally solved by 3.6B, not something 3.6C needs to build.** `createOrderFromSuccessfulPayment` only ever creates an order **after** `payment_transactions.status = 'succeeded'` is confirmed, and `create_order` always inserts a brand-new order at `status = 'pending'` (the same immediately-kitchen-visible state the cash flow already uses) — there is no separate "confirm the order" step for 3.6C to perform, because order **existence** already **is** the payment-succeeded signal. The task's own Phase 3 template listed a hypothetical `PENDING/CONFIRMED/.../DELIVERED` status set — **re-verified against the live CHECK constraint and the trigger's own transition matrix, the actual, only-ever-five values are `pending, preparing, ready, completed, cancelled`.** No `confirmed` status exists; none should be invented.

The second major finding, traced from the webhook's **actual, unmodified** code, not assumed: `_handleWebhookEvent`'s existing terminal-status guard (`TERMINAL = new Set(['succeeded','failed','cancelled','refunded'])`, checked against the transaction's status **before** any update) already, structurally, **prevents a `payment_transactions` row from ever being moved out of `succeeded` via the webhook path** — meaning "payment fails after Order created" (Phase 7's question) **cannot happen through the webhook today**, by an already-existing guard, not a hypothetical risk. The practical consequence: **refunds do not currently reach `payment_transactions.status` via the webhook at all** (a `payment_refunded` webhook event on an already-`succeeded` row is silently short-circuited as `already_terminal`) — the only code path that ever writes `status = 'refunded'` is `paymentService.refund()`'s own direct `UPDATE`, which (per the 3.6A-2A audit, re-confirmed here) has zero real callers anywhere in the codebase.

A third finding directly affects the design: the order state machine has **no valid transition out of `completed`** (`enforce_order_transition`'s matrix confirmed — cancellation is only allowed from `pending`/`preparing`/`ready`) — so a refund issued after an order has already reached `completed` has **no safe order-status target at all**; forcing one would either raise `invalid_order_transition` or require inventing a new status, both explicitly out of scope.

**Verdict: `SYNC_ARCHITECTURE_READY_WITH_WARNINGS`** — a safe, minimal design is fully specifiable from existing architecture, but it covers a narrower surface (refund/void reaching an order that is not yet `completed`) than "payment → order sync" might suggest, and it depends on a currently-unwired refund code path becoming live.

---

# WEBHOOK_INVENTORY

Traced from the actual, current `supabase/functions/payment-webhook/handler.js` and `index.ts` (both re-read in full this task, confirmed unchanged since every prior audit):

| Aspect | Behavior |
|---|---|
| Request authentication | None at the HTTP-auth level (public endpoint, `verify_jwt: false` per prior deployment audits) — protected entirely by HMAC signature |
| HMAC verification | `verifyHmacSha256(rawBody, signature, webhookSecret)` — `crypto.subtle.verify`, constant-time, HMAC-SHA256, hex-encoded signature from the `x-moyasar-signature` header. Missing signature → `401`; invalid signature → `401`; missing secret configured → `500` |
| Event parsing | `adapter.parseWebhook(payload, headers)` — `MoyasarAdapter`, synchronous, unmodified since Task 3.4 remediation |
| `eventId` presence | Rejected with `400` if absent (`payload.id` required, no fabricated fallback — Task 3.4 remediation) |
| Provider reference lookup | `payment_transactions` looked up by `provider_ref = event.providerRef` (not by any client-suppliable id) |
| Payment transaction lookup | `.select('id, status')` only — narrow projection, no over-fetching |
| Payment status mapping | `event.status ?? _eventTypeToStatus(event.type)` — `_eventTypeToStatus` maps `payment.succeeded→succeeded`, `payment.failed→failed`, `payment.cancelled→cancelled`, `payment.pending→pending`, **default→`failed`** (a safe-default, not blank) |
| Database updates | `payment_transactions.status`/`updated_at` only — **never touches `orders` in any way, anywhere in this file** (confirmed — zero references to the `orders` table in `handler.js`) |
| Idempotency behavior | `payment_webhook_events` insert relies on the existing `uq_webhook_provider_event` unique constraint; a `23505` → `{updated:false, reason:'already_processed'}`, no further action |
| Error handling | Top-level `try/catch` around `_handleWebhookEvent`; any thrown error → generic `500 {error:'Internal error processing webhook'}`, with the real message only `console.error`'d server-side, never returned to the caller |
| Response behavior | Always `json({ok:true, ...result})` on success (even for no-op outcomes like `already_processed`/`transaction_not_found`/`already_terminal`) — `200` in every non-exceptional path |

**No import of `checkoutOrchestration.js`, `createOrderFromSuccessfulPayment`, or any 3.6A-2/3.6B code exists anywhere in this file** — confirmed by direct inspection and consistent with every prior task's own source-text tests on this file.

---

# PAYMENT_STATUS_MODEL

From `TransactionStatus` (`src/payments/types/index.js`, unchanged) and traced usage:

| Status | Who writes it | When | From Moyasar? | Client-influenceable? | Terminal? | Can transition again? |
|---|---|---|---|---|---|---|
| `initiated` | `paymentService.startCharge`'s own `INSERT` | Before any provider call | No — SimSim's own default | No | No | Yes |
| `pending` | `startCharge`'s post-call `UPDATE` (from `adapter.createCharge`'s mapped status), or webhook's `payment_authorized`→`payment.pending` | After the provider call returns, or via webhook | Yes (via `mapStatus('authorized')`) | No | No | Yes |
| `succeeded` | `startCharge`'s post-call `UPDATE`, or webhook's `payment_paid`→`payment.succeeded` | Provider confirms success | Yes | No | **Yes** (per the webhook's own `TERMINAL` set) | **No, not via the webhook** (terminal guard blocks any further webhook-driven change) |
| `failed` | `startCharge`'s catch-block `UPDATE`, or webhook default/`payment_failed` | Provider call throws, or webhook reports failure | Yes (webhook path) / No (local network-failure path) | No | Yes | No (same terminal guard) |
| `cancelled` | Webhook only (`payment_expired`→`payment.cancelled`) | Provider reports expiry | Yes | No | Yes | No |
| `refunded` | `paymentService.refund()`'s own direct `UPDATE` **only** — confirmed, the webhook's terminal guard prevents this value from ever being reached via `_handleWebhookEvent` for a row already `succeeded` | A refund is explicitly processed | Indirectly (via `refundPayment` adapter call) | No | Yes | No |

**No new status is proposed or needed** — this table only documents what already exists.

---

# ORDER_STATUS_MODEL

**Correction to the task's own illustrative Phase 3 list**: re-verified live against the actual, unmodified `orders_status_check` CHECK constraint and `enforce_order_transition()` trigger function (`sql/order_state_machine.sql`, cross-checked against `src/pages/Orders.jsx`'s own `STATUS` constant — both agree exactly):

**The only five values that exist are: `pending`, `preparing`, `ready`, `completed`, `cancelled`.** There is no `confirmed`, `out_for_delivery`, or `delivered` status anywhere in this schema. Any design referencing those would be inventing new states, explicitly forbidden by this task's own objective.

**Complete transition matrix** (trigger `enforce_order_transition`, `BEFORE UPDATE OF status`):

| From → To | Allowed? | Condition |
|---|---|---|
| `pending → preparing` | Always | Forward progress |
| `pending → cancelled` | Always | Cancellation |
| `preparing → ready` | Always | Forward progress |
| `preparing → cancelled` | Always | Cancellation |
| `ready → completed` | Always | Forward progress |
| `ready → cancelled` | Always | Cancellation |
| `preparing → pending` | Only within 60s of `updated_at` | Undo window (ADR-50/D-09) |
| `ready → preparing` | Only within 60s | Undo window |
| `completed → ready` | Only within 60s | Undo window |
| **Anything → `completed → cancelled`** | **Never** — not in the matrix at all | **No cancellation path exists once an order is `completed`** |
| Same-status update (e.g. item edits) | Always allowed | Trigger exits early if `new.status = old.status` |
| Any other pair | **Rejected**, `raise exception 'invalid_order_transition: ...'` | |

**Who currently drives transitions?** Exclusively `src/pages/Orders.jsx` — direct `supabase.from('orders').update({status: ...})` calls (advance via `STATUS[order.status].next`, cancel via an explicit action) under RLS (`orders_access` policy, `has_restaurant_access` + `member_has_branch_access` — i.e., authenticated staff/owner only). **There is no dedicated order-status-update RPC or service function anywhere in the codebase** — the trigger itself is the entire enforcement layer; any authorized writer (staff via RLS, or a server-side process via `service_role`) can attempt a plain `UPDATE`, and the trigger accepts or rejects it.

**Payment awareness**: **zero** — `enforce_order_transition()` reads only `old.status`/`new.status`/`old.updated_at`; it has no knowledge of `payment_transaction_id`, payment status, or anything payment-related. This is unchanged and is not something this task proposes to alter.

---

# PAYMENT_ORDER_LINK

`orders.payment_transaction_id uuid REFERENCES payment_transactions(id) ON DELETE SET NULL`, with `orders_payment_transaction_id_uidx` — a **unique partial index** — already live (Task 3.5, re-verified in 3.6A-2A, re-confirmed here unchanged). **Correct lookup direction, already indexed**: given a `payment_transactions.id`, `SELECT * FROM orders WHERE payment_transaction_id = $1` uses this index directly (at most one matching row, by construction of the unique constraint) — **no new index is required.**

---

# SYNC_TRIGGER_MATRIX

| Payment transition | Order action | Classification |
|---|---|---|
| Payment succeeded (order doesn't exist yet) | Order gets **created** (already `pending`) | **ALREADY HANDLED** — this is 3.6B, not 3.6C's concern |
| Payment succeeded (webhook fires again after 3.6B already created the order) | None — order already exists, already reflects success by existing at all | **NOT APPLICABLE** — no action needed, no order field to update |
| Payment failed **after** an order already exists | Cannot occur via the webhook today (`succeeded` is terminal there) | **NOT APPLICABLE**, given current architecture — verify this remains true if any future task changes the terminal guard |
| Payment refunded, order still `pending`/`preparing`/`ready` | Order → `cancelled` is a **valid** transition (matrix confirms `(X, cancelled)` for all three) | **REQUIRED** (if refund processing is ever wired up) |
| Payment refunded, order already `completed` | **No valid transition exists** — forcing `completed → cancelled` is not in the matrix | **DANGEROUS** if attempted as a status write; **NOT APPLICABLE** to the state machine — must be handled as a separate business/notification concern, not an order-status change |
| Payment voided | Currently a **complete no-op** — `payment_voided` maps to `RECOGNIZED_UNHANDLED`, and the webhook's own explicit branch skips any `payment_transactions.status` write for it | **NOT APPLICABLE** today — nothing to sync from, since the payment side itself never records a "voided" status change |
| Payment pending → succeeded | Same as "payment succeeded" above — order creation is 3.6B's job | **ALREADY HANDLED** |
| Payment pending → failed | No order exists yet (3.6B never created one without success) | **NOT APPLICABLE** |

**Net conclusion**: the only genuinely **REQUIRED** sync surface for 3.6C, given the current architecture, is **refund reaching an order that has not yet reached `completed`** — and even that is currently unreachable in production, since nothing calls `paymentService.refund()` yet.

---

# STATE_MACHINE_COMPATIBILITY

The existing `enforce_order_transition` trigger makes **no distinction between "staff-driven" and "payment-driven"** — it only validates `(old.status, new.status)` pairs, regardless of *who* issued the `UPDATE`. This means a payment-driven sync **can** use the exact same transition rules as staff actions do today, with **no special-casing or bypass needed or possible** — any sync mechanism is bound by the identical matrix a staff member is. Concretely:

- Forcing `X → cancelled` (X ∈ {pending, preparing, ready}) from a payment event **would succeed** at the trigger level, exactly as if a staff member clicked cancel.
- Forcing `completed → cancelled` **would fail** with the trigger's own `invalid_order_transition` exception — there is no way to "force" past this without altering the trigger itself, which is explicitly out of scope.
- **A genuine risk this audit identifies (Phase 6's explicit question)**: a race between a staff member advancing the order (e.g., `pending→preparing`) and a payment-driven refund sync attempting `pending→cancelled` **at the same moment** — whichever `UPDATE` commits first wins; the second one either succeeds (if it's still a valid transition from the *new* current state) or fails with `invalid_order_transition`. This is not a new problem introduced by a sync mechanism — it's the same class of concurrent-update race any two staff members already face today, and the trigger's row-level check already handles it correctly (one wins, one gets a clear rejection) — no new protection is required beyond what the trigger already provides.

**No bypass of the state machine is proposed anywhere in this audit.**

---

# REFUND_CANCELLATION_IMPACT

Documented only, per instruction:

- **Payment refunded, order not yet `completed`**: the order **should** move to `cancelled` — this is the one case with a clean, valid, already-existing transition path, and it matches the business reality (the customer isn't paying, the order shouldn't proceed).
- **Payment voided after order created**: currently cannot be detected at all (see SYNC_TRIGGER_MATRIX) — no data exists to react to. If Moyasar's `payment_voided` event is ever wired to actually update `payment_transactions.status` (a change to `moyasar.js`'s webhook-type handling, out of this task's scope), the same `cancelled`-if-not-`completed` logic would apply.
- **Payment fails after order created**: confirmed **cannot happen via the existing webhook** (terminal guard). If it were ever possible (e.g., via a future manual override), the same reasoning as refund would apply — but this is currently a non-reachable state, not something to design defensively against beyond documenting the guard that already prevents it.
- **Payment refunded, order already `completed`**: **no order-status action is correct or possible** — this is a financial/business-process matter (the food was already delivered; refunding money doesn't un-deliver it) that belongs to a notification/audit mechanism, not the order state machine. Attempting to force a status change here would either fail loudly (good — the trigger protects against a nonsensical state) or require inventing a new status (explicitly forbidden).

---

# MULTI_TENANT_SAFETY

**RLS on `orders`**: exactly one policy, `orders_access`, `ALL`, `(has_restaurant_access(restaurant_id) AND member_has_branch_access(restaurant_id, branch_id))` — this is what protects the *staff UI's* direct updates today.

**Critical finding for any future sync mechanism**: the webhook (and any service reusing its `service_role` `db` client) **bypasses RLS entirely** — exactly as it already does for `payment_transactions`. This means **RLS provides zero protection for a payment-driven order-status sync**; the enforcement layer must be an **explicit, application-level check** — concretely, any sync `UPDATE` to `orders` must be scoped with `.eq('restaurant_id', paymentTx.restaurant_id)` (or equivalently, must first confirm the target order's `restaurant_id` matches the payment transaction's own `restaurant_id` column before writing) — mirroring exactly the discipline 3.6A-2/3.6B already established (always source `restaurant_id` from the trusted `payment_transactions` column, never trust a second copy). **This is not a new mechanism to invent** — it is the same pattern already proven twice in this arc, simply applied to a new write target.

---

# RECOMMENDED_SYNC_LAYER

Evaluated all five options against the actual findings above:

| | A — Inside webhook directly | B — New service triggered by webhook | C — Reconciliation job (3.6E) | D — Inside `checkoutOrchestration.js` | E — Dedicated new sync service |
|---|---|---|---|---|---|
| Safety | Couples order-mutation logic into the webhook's own error-handling path — a bug in order-sync code could affect the webhook's `500` response for an unrelated payment update | Isolated — a failure here is caught and doesn't propagate into the webhook's own success/failure response | Wrong layer entirely — 3.6E is for *lost/ambiguous* payment state (G-5), not routine, already-known status changes; conflating them muddies both concerns | Reasonable — `checkoutOrchestration.js` already owns payment→order concerns (3.6A-2, 3.6B) | Reasonable, but a 4th file for a 2-branch decision (cancel-if-not-completed, no-op-if-completed) is disproportionate |
| Webhook complexity | Increases — webhook must now know about order semantics | Low — webhook just calls one more function, same pattern as `_handleWebhookEvent` already calling into itself | N/A (doesn't touch the webhook) | Low — same as B, just a different import target | Low |
| Coupling | High — payment webhook parsing directly coupled to order state machine knowledge | Low — a clean function boundary | N/A | Low-medium — reuses `checkoutOrchestration.js`'s existing payment-context knowledge (`TransactionStatus`, tenant-sourcing pattern) it already has from 3.6B | Low |
| Testability | Harder — would require the full webhook harness for every order-sync test case | Easy — a pure function taking `(paymentTransactionId or event, {db})`, same testing pattern as 3.6A-2/3.6B's own `makeChain`/`makeDb` mocks | Easy, but wrong scope | Easy — same established pattern | Easy |
| Race conditions | Same as any option — the trigger itself is the actual race-safety mechanism, not the calling layer | Same | Same | Same | Same |
| Consistency with existing architecture | Breaks the established pattern (webhook stays payment-only, per its own header comment's stated reason for re-implementing `_handleWebhookEvent` rather than importing `paymentService`) | Matches the established "webhook triggers a call into service code" shape (mirroring how `_handleWebhookEvent` already exists as a self-contained unit) | Wrong — G-5 reconciliation is explicitly about *unknown/lost* state, this is about *known* state | **Best fit** — `checkoutOrchestration.js` already is "the place payment events become order actions" (3.6B's own precedent) | Also consistent, but unnecessarily fragments a very small amount of logic across one more file |

**Recommendation: D — extend `checkoutOrchestration.js` with a small new function (e.g. `syncOrderStatusFromPayment`), called from the webhook's existing success path** (i.e., the webhook still owns *when* to call it — right after it updates `payment_transactions.status` to `refunded`/whatever triggers it — but the *logic itself* of "what should the order become" lives in the same service module that already owns 3.6A-2/3.6B, not duplicated into the webhook file itself). This is Option B's shape (isolated, testable, low webhook coupling) implemented at Option D's location (architectural consistency, reuses already-proven tenant-sourcing/testing patterns) — the two are not actually in tension once specified precisely.

---

# IDEMPOTENCY

**Duplicate webhook retries**: already fully closed at the event layer — `uq_webhook_provider_event` means a genuinely-retried webhook delivery for the *same event* never reaches `_handleWebhookEvent`'s business logic a second time at all (short-circuited as `already_processed` before any `payment_transactions` or hypothetical `orders` write). A sync mechanism triggered from *inside* that same successful, non-duplicate path therefore inherits this protection automatically — no separate idempotency mechanism is needed for "the same webhook delivery arriving twice."

**Redundant order-status writes** (e.g., a sync function called when the order is *already* `cancelled`): the trigger's own early-exit (`if new.status = old.status then return new`) makes a no-op update harmless and cheap. A sync function should simply **not treat "order already in the target status" as an error** — checking the order's current status before writing (or just attempting the write and treating a same-status no-op as success) is the safest existing mechanism, requiring no new database object.

**Redundant transition *attempts*** (e.g., sync tries `completed → cancelled`): the trigger itself rejects it with a clear exception — a sync function must catch this specific, already-existing exception message pattern (`invalid_order_transition`) and treat it as "no sync possible here," not as an unexpected failure — the same "catch the DB's existing rejection, classify it, don't panic" discipline already established in 3.6A-2/3.6B for their own race/exception handling.

---

# FAILURE_ISOLATION

Traced from the webhook's actual structure: `_handleWebhookEvent`'s top-level caller (`buildHandler`'s `try/catch`) already isolates **any** thrown error into a generic `500`, without losing the fact that the webhook event itself was already durably recorded (`payment_webhook_events` insert happens **before** the payment-status update, and stays recorded regardless of what happens afterward — confirmed, unchanged). If an order-status sync call is added **after** the payment-status update succeeds, and *that* sync call throws:

- **Must not roll back the payment status update**: since `payment_transactions.status` is updated via its own separate `UPDATE` statement (not inside the same transaction as a hypothetical order sync, given Supabase-JS calls are independent round-trips, matching the existing no-explicit-transaction pattern already used throughout `paymentService.js`/`handler.js`) — a failure in a *subsequent* call cannot retroactively undo an already-committed `UPDATE`. This isolation is **already structurally guaranteed** by the current architecture's lack of any wrapping transaction, not something that needs to be newly built.
- **Must not lose the payment event**: already guaranteed — `payment_webhook_events` recording happens first, independent of anything downstream.
- **Must not crash processing for unrelated transactions**: each webhook HTTP request handles exactly one event for one transaction; a thrown error in this request's own order-sync step cannot affect a *different* concurrent request's processing (separate function invocations, no shared mutable state) — already true, not something to add.

**Concretely, for a future implementation**: the sync call should be wrapped in its own `try/catch` **inside** `_handleWebhookEvent` (or the new service it calls), with a failure there logged (`console.error`, matching the existing pattern) but **not** re-thrown past the point where the payment-status update has already succeeded — the webhook should still return its normal `{ok:true, updated:true, ...}` response even if the order-sync sub-step failed, since the payment-status record (the primary responsibility of this endpoint) is correct regardless.

---

# SECURITY_THREAT_MODEL

| # | Threat | Current protection | Proposed protection | Residual risk |
|---|---|---|---|---|
| 1 | Fake webhook triggering Order status change | HMAC-SHA256 signature verification (already, unconditionally, required before any event processing) | None needed beyond the existing HMAC gate — a sync call only ever happens *after* signature verification already passed | None beyond whatever residual risk already exists in the HMAC scheme itself (out of this task's scope, unchanged) |
| 2 | Replayed webhook changing Order status twice | `uq_webhook_provider_event` (already closes this at the event layer, before any downstream logic runs) | None needed — inherited automatically (IDEMPOTENCY above) | None |
| 3 | Order status changed for wrong tenant | **None today** (no sync exists) | Explicit `restaurant_id` scoping on every sync `UPDATE`, sourced from `payment_transactions.restaurant_id`, never trusted from a second copy (MULTI_TENANT_SAFETY) | None, if implemented exactly as specified — this is a design requirement, not optional |
| 4 | Payment status regressing Order status incorrectly | The trigger's own transition matrix (a sync call attempting an invalid regression, e.g. `completed→cancelled`, is rejected outright) | None needed beyond relying on the existing, unmodified trigger — this is precisely what it already protects against, for any caller | None, provided the sync logic doesn't attempt to bypass the trigger (explicitly not proposed anywhere in this audit) |
| 5 | Race between staff action and payment sync | The trigger's row-level check (whichever `UPDATE` commits first determines the "old" state the second must be valid against) | None needed — already correctly handled (STATE_MACHINE_COMPATIBILITY) | A staff member could theoretically advance an order in the same instant a refund sync tries to cancel it, and one of the two loses with a clear rejection — an acceptable, already-existing outcome, not a new gap |
| 6 | Order stuck due to sync never firing | **N/A today** (nothing to get stuck on, since order creation itself — 3.6B — already reflects payment success) | For the refund case specifically: since refund processing itself is currently unwired (`paymentService.refund` has zero callers), a sync hook on it is equally unwired — this is an *existing* gap (refunds aren't processed at all yet), not one this audit's recommendation introduces | Real, but pre-existing and out of scope — refund processing itself needs to be wired up (separate task) before a sync on top of it is even reachable |
| 7 | Silent mismatch between payment and Order status | Today: genuinely possible in principle for the `completed`-order-refunded case, since no order-status action is correct there (REFUND_CANCELLATION_IMPACT) | Not a "protection" to add — an explicit design acknowledgment that this case is **out of the order state machine's scope** and needs a separate visibility mechanism (e.g., surfacing refunded-but-completed transactions to staff/admin some other way) — **not implemented or further designed here**, per instruction | Accepted, documented residual risk — matches this task's own instruction not to redesign the state machine to accommodate it |

---

# SCOPE_PROPOSAL

Derived from the actual findings (a narrower scope than the task's illustrative template, since most of the "sync" surface turned out to already be handled by 3.6B or to be currently unreachable):

### 3.6C.1 — Sync decision function (pure)
- **Objective**: a pure function `decideOrderSyncAction(paymentStatus, currentOrderStatus)` → one of `{cancel, none, unsupported}` — encoding exactly the SYNC_TRIGGER_MATRIX table above (refund/void + order not `completed` → `cancel`; anything else → `none`/`unsupported`). No DB access, fully unit-testable, mirrors `checkoutBinding.js`'s own pure-utility precedent.
- **Risk**: low.

### 3.6C.2 — `syncOrderStatusFromPayment` service function
- **Objective**: given a `paymentTransactionId` and its new payment status, look up the linked order (via `orders.payment_transaction_id`, already indexed), apply 3.6C.1's decision, and — only if `cancel` — perform a tenant-scoped `UPDATE orders SET status='cancelled' WHERE id=... AND restaurant_id=...`, catching and gracefully classifying an `invalid_order_transition` exception (e.g., the `completed` case) rather than treating it as an unexpected error.
- **Files**: extends `checkoutOrchestration.js` (per RECOMMENDED_SYNC_LAYER), following the exact pattern of `createOrderFromSuccessfulPayment`.
- **DB changes**: none.
- **Dependencies**: 3.6C.1.
- **Risk**: depends on refund processing (`paymentService.refund`) actually being wired to a real caller — without that, this function is correct but practically unreachable, same caveat as 3.6A-2/3.6B's own "not yet wired to a live entrypoint" status.

### 3.6C.3 — Webhook integration point
- **Objective**: a small, isolated addition to `_handleWebhookEvent` — after a **refund-mapped** status update succeeds, call 3.6C.2 inside its own `try/catch` that never re-throws past the point the payment-status write has already succeeded (FAILURE_ISOLATION).
- **Files**: `supabase/functions/payment-webhook/handler.js` — the **one** legitimate, minimal touch point this audit identifies, explicitly **not** made in this read-only task.
- **DB changes**: none.
- **Dependencies**: 3.6C.2. Also depends on `moyasar.js`'s webhook-type mapping actually producing a `refunded` status for `payment_refunded` events reaching an already-succeeded row — which, per this audit's own PAYMENT_STATUS_MODEL finding, **it currently does not** (the terminal guard blocks it). **This is a real prerequisite gap this scope proposal surfaces but does not resolve**: either the terminal guard needs a narrow, deliberate carve-out for the specific `succeeded → refunded` transition (a webhook-handler change, separately scoped and reviewed — not assumed safe to just add here), or refund status updates continue to only ever originate from `paymentService.refund()` directly, in which case 3.6C.3's hook point should be **there**, not the webhook.

### 3.6C.4 — Tests
- **Objective**: unit tests for 3.6C.1 (all matrix cases) and 3.6C.2 (tenant scoping, idempotent no-op, `invalid_order_transition` graceful handling, `completed`-order no-action case), following the established `makeChain`/`makeDb` pattern.
- **Dependencies**: 3.6C.1–3.6C.3.

**Explicitly not proposed**: any change to `enforce_order_transition`, any new order status, any change to `create_order`, any reconciliation job (3.6E territory), any checkout UI.

---

# BLOCKERS

None for *specifying* the design further — but a genuine **implementation-prerequisite gap** was found and must be surfaced: **refund status updates do not currently reach `payment_transactions.status` via the webhook at all** (terminal-status guard), and `paymentService.refund()` (the only path that does set `refunded`) has no real caller anywhere. A 3.6C implementation would be correct-but-dormant until one of these two facts changes — that decision (extend the webhook's terminal-guard carve-out vs. hook into `refund()` directly) needs an explicit owner call before 3.6C.3 specifically can be implemented, though 3.6C.1/3.6C.2 can be built and tested independently of it today.

# RISKS

- The `completed`-order-refunded case has no order-state-machine answer and was deliberately left undesigned here, per instruction — it needs a separate, explicit decision (e.g., an admin-visible flag/notification mechanism) before it can be considered "handled," not just "documented."
- If the terminal-guard carve-out path is chosen for 3.6C.3, it touches the webhook's core idempotency/terminal-state logic — a change with real behavioral consequences (per this session's own established caution around exactly this file) that deserves its own focused, separately-reviewed task, not a rider on 3.6C's order-sync logic.
- Race conditions between staff actions and sync are already correctly handled by the existing trigger, but this depends on that trigger continuing to be the sole gatekeeper — any future task that adds a second, parallel order-status-writing path without going through the same trigger-protected `UPDATE` mechanism would reintroduce risk this audit assumes is closed.

---

# REPORT_FILE

`reports/TASK_3_6C_A_PAYMENT_ORDER_STATUS_SYNC_AUDIT.md`

# DOWNLOAD_COPY

`/sdcard/Download/TASK_3_6C_A_PAYMENT_ORDER_STATUS_SYNC_AUDIT.md` (copied and checksum-verified after this report was written).

# NEXT_STEP

Owner decision needed on the refund-status-update prerequisite (webhook terminal-guard carve-out vs. hooking 3.6C into `paymentService.refund()` instead) before 3.6C.3 specifically can be scoped for implementation; 3.6C.1/3.6C.2 (the pure decision function and the tenant-scoped sync service) could be implemented and tested independently of that decision if you choose to proceed incrementally. No implementation begins without separate, explicit instruction, per this task's strict stop list.

---

*Report generated 2026-08-26. Architecture analysis only — no code written, no schema modified, no migration created, no deployment, no Moyasar call, no commit, no push.*
