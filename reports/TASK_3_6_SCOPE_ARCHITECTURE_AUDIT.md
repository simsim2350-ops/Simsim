# Task 3.6 — Payment Integration Scope & Architecture Audit

**Read-only. No code, schema, or configuration was changed. No migration was created. Nothing was deployed or committed.**

---

# EXECUTIVE SUMMARY

Building on `reports/TASK_3_4_3_5_PAYMENT_FLOW_GAP_AUDIT.md`, this document defines what Task 3.6 should actually contain, based only on evidence gathered from the live codebase and database — not assumption. The central architectural finding: **the current order state machine (`pending/preparing/ready/completed/cancelled`) has zero payment-awareness.** No existing order status represents "awaiting payment," "payment failed," or "paid." This is marked `REQUIRES_DESIGN_DECISION`. Combined with the fact that `create_order` unconditionally inserts an order as immediately kitchen-visible (`status='pending'`), this analysis concludes that a **payment-first flow** (create the payment transaction, wait for confirmation, only then call `create_order`) is materially safer and more compatible with the existing architecture than an **order-first flow** — the latter would put unpaid orders on the kitchen's live Kanban board. This also cleanly solves the multiple-payment-attempts question: failed attempts simply never reach `create_order` at all.

Two real, unresolved external blockers remain exactly as established in prior audits and are **not resolved by this document**: real Moyasar authentication verification (G-6) and Moyasar sandbox access — both explicitly out of this audit's control.

**Final verdict: `TASK_3_6_SCOPE_READY_WITH_BLOCKERS`**

---

# CURRENT ARCHITECTURE

Traced arrow-by-arrow, evidence only:

| Arrow | Existing implementation | Caller | DB object | Missing connection | Ownership | Current tests |
|---|---|---|---|---|---|---|
| Customer → Checkout | `PublicMenu.jsx` → `useCheckout.js` | Customer browser | — | No "pay online" option exists in the UI at all | Frontend | `qr-cart-checkout-order.spec.ts` (E2E, cash/manual flow only) |
| Checkout → `create_order` | `supabase.rpc('create_order', {...})` | `useCheckout.js` | `orders` table, `create_order` RPC | Never passes `p_payment_transaction_id` | Frontend + `sql/order_payment_reference.sql` | `orderPaymentReferenceGuard.test.js` (static), live-verified on staging + production (prior tasks) |
| `create_order` → Payment Transaction | `p_payment_transaction_id` param exists and is validated | — | `orders.payment_transaction_id` FK | **No caller ever supplies it** | `create_order` RPC | Covered structurally, never exercised by a real order |
| (separately) Checkout → Payment Transaction | `paymentService.startCharge()` | **None** | `payment_transactions` | **Zero callers anywhere in the app** | `src/payments/services/paymentService.js` | `paymentService.test.js` (unit, mocked DB) |
| Payment Transaction → Moyasar | `MoyasarAdapter.createCharge()` | `paymentService.startCharge` (itself uncalled) | — (external API) | Never reached in practice | `src/payments/adapters/moyasar.js` | `MoyasarAdapter.test.js` (unit, mocked `fetch`) |
| Moyasar → Webhook | `supabase/functions/payment-webhook/` | Moyasar (external) | — | **Function not deployed** | Edge Function | 22 unit + 29 synthetic E2E tests, all passing; zero real deliveries |
| Webhook → Payment Transaction Update | `handler.js`'s `_handleWebhookEvent` | Webhook itself | `payment_transactions`, `payment_webhook_events` | None — this link genuinely works, in isolation | `handler.js` | Same as above |
| Payment Transaction Update → Order | **Does not exist in any form** | — | — | **No trigger, function, service, or frontend code connects these two tables' statuses** | Unowned | None (nothing to test) |

**Do not infer anything exists merely because a function exists** — applied throughout: every "implemented" claim above is qualified by whether it is ever actually *called* in a live path, not merely present in the repository.

---

# ORDER STATE MACHINE

**Exact, current, evidence-based — no invented states.**

States (from `orders_status_check` CHECK constraint, `sql/order_state_machine.sql`, re-read this session): `pending`, `preparing`, `ready`, `completed`, `cancelled`. Exactly five. No sixth state exists anywhere.

**Forward transitions** (always allowed, per `enforce_order_transition()`):
```
pending   → preparing
pending   → cancelled
preparing → ready
preparing → cancelled
ready     → completed
ready     → cancelled
```

**Backward transitions** (allowed only within 60 seconds of the row's last `updated_at` — "D-09 = B1" undo window):
```
preparing → pending
ready     → preparing
completed → ready
```

**Everything else raises `invalid_order_transition`.** Notably: `cancelled` has no outgoing transition at all (truly terminal — cannot be un-cancelled). `completed` can only go back to `ready` (undo window), never directly to `pending`/`preparing`/`cancelled`.

**Additional read paths**: `cancel_order_by_customer` (customer self-service cancel, only from `status='pending'`), `get_orders_status_secure`/`get_orders_status` (read-only status polling, token-gated).

**Frontend** (`src/pages/Orders.jsx`, re-read this session): mirrors the DB matrix exactly via its own `STATUS` constant (`pending→preparing→ready→completed`, `cancelled` terminal) — this parity is enforced automatically by the existing `GUARD-STM-001` static guard test, which fails the build if the two ever drift.

**Payment-state → Order-state mapping — evaluated per your instruction, no state invented:**

| Payment state | Existing order state it could map to | Verdict |
|---|---|---|
| `initiated` (transaction created, not yet charged) | None — `pending` already means something else ("order placed, awaiting kitchen") | `REQUIRES_DESIGN_DECISION` |
| `pending` (Moyasar processing) | None | `REQUIRES_DESIGN_DECISION` |
| `succeeded` | Arguably `pending` (i.e., the *existing* meaning: "now visible to the kitchen, awaiting acceptance") — **but only if the order is created at this exact moment, not before** | Works *only* under a payment-first flow (see CANONICAL PAYMENT FLOW) |
| `failed` | None — there is no "payment failed" or rejected order state; `cancelled` is closest but semantically means "cancelled by customer/staff," not "payment declined" | `REQUIRES_DESIGN_DECISION` |
| `cancelled` (payment side) | Could map to order `cancelled`, but only if the order already exists — see multiple-attempts analysis below | `REQUIRES_DESIGN_DECISION` for the general case |
| `refunded` | No order-side concept of "refunded" exists at all (order state machine has no such status, and refunding doesn't need to change order fulfillment status — the order was already fulfilled) | Likely **not** an order-status mapping at all — a separate concern (see MUST/SHOULD HAVE) |

**Conclusion: no clean 1:1 mapping exists between payment states and order states as currently defined.** The only mapping that requires zero new order states is "payment succeeded → order becomes visible as `pending`" — achievable only by *deferring order creation itself* until payment succeeds (see next section), not by trying to layer payment semantics onto the existing 5-state machine after the fact.

---

# PAYMENT STATE MACHINE

**Exact, current, from `TransactionStatus` (`src/payments/types/index.js`), `MoyasarAdapter.mapStatus()`, and webhook handling — re-verified this session, no state invented.**

```
TransactionStatus = { INITIATED, PENDING, SUCCEEDED, FAILED, CANCELLED, REFUNDED }
```

Matches exactly the `payment_transactions_status_check` CHECK constraint (`'initiated','pending','succeeded','failed','cancelled','refunded'`).

**Transitions actually implemented in code** (not a DB-enforced state machine like orders — no equivalent trigger exists on `payment_transactions` at all, confirmed by grep in the prior gap audit):

- `paymentService.startCharge`: `(row created)` → `initiated` → (Moyasar call) → `mapStatus(chargeResult.status)` or `failed` (on API error).
- `MoyasarAdapter.mapStatus()`: Moyasar raw status → `TransactionStatus` (`initiated→INITIATED`, `authorized→PENDING`, `paid→SUCCEEDED`, `failed→FAILED`, `refunded→REFUNDED`, anything else→`FAILED`, safe default).
- Webhook (`handler.js`): `TERMINAL = {succeeded, failed, cancelled, refunded}` — once a transaction reaches any of these, **no further transition is applied**, regardless of what a later event claims (this is an existing, correct protection, unrelated to this task).

**Conflicts between `PaymentStatus` and `OrderStatus`**: there is no naming collision (the two enums use entirely different string values, `payment.succeeded` vs `succeeded`-the-order-never-has-this-value, etc.), so there's no risk of confusing one enum's value for the other's at the code level. **The real conflict is conceptual, not textual**: `payment_transactions` has a genuine terminal-state machine (once `succeeded`/`failed`/`cancelled`/`refunded`, it's done); `orders` has a *different*, richer fulfillment-lifecycle state machine that has nothing to do with payment at all. They are two independent state machines that need a **synchronization rule**, not a shared vocabulary.

---

# CANONICAL PAYMENT FLOW

**Evaluated both flows against actual code, not preference.**

### FLOW A — Payment Transaction → Moyasar → succeeds → `create_order` → webhook

- **Compatible with `create_order`'s actual signature**: yes — `p_payment_transaction_id` can be supplied because the transaction already exists by the time `create_order` runs. This is the *only* way the FK is populated at `INSERT` time (there's no `UPDATE`-order-after-creation path — confirmed, no such RPC exists).
- **Order visibility**: the order **only appears on the kitchen's live Kanban** (`Orders.jsx`) once payment has actually succeeded — `create_order` always inserts as `status='pending'` (hardcoded, unconditional), which is immediately kitchen-visible. Under Flow A, that's correct — `pending` genuinely means "a confirmed order, awaiting kitchen acceptance."
- **New risk introduced**: customer is charged, then `create_order` could still fail (item became unavailable, coupon invalid between checkout start and this final call, price mismatch triggering `price_changed`). This leaves a **succeeded payment with no order** — needs a recovery path (refund or retry), discussed under FAILURE AND RECOVERY.

### FLOW B — Payment Transaction → `create_order` → Moyasar → webhook

- **Order visibility problem, concrete and certain**: `create_order` has no "draft" or "awaiting payment" state to insert into — it always inserts as `pending`, immediately kitchen-visible. Under Flow B, the kitchen would see (and could start preparing) an order **before payment is confirmed**, on every single online-payment attempt, not as an edge case. If payment then fails, staff must notice and manually cancel a real, already-visible kitchen order.
- **`p_payment_transaction_id` timing**: would need to be passed as `NULL` at `create_order` time (transaction doesn't exist yet) and updated afterward — but **no update path exists**, so Flow B cannot actually populate the FK at all without a new RPC, which isn't scoped to exist today.

**Determination, evidence-based, not assumed**: **Flow A is the one compatible with the current schema and `create_order` implementation.** Flow B would require both a new "draft order" concept (schema/state-machine change) and a new order-update RPC — neither exists, and inventing them wasn't authorized in this audit. Flow A's own new risk (charged-but-no-order) is addressed under FAILURE AND RECOVERY and is materially narrower in scope (order-creation failures, given pricing/inventory were already validated at checkout start, are expected to be rare) than Flow B's certain, every-time kitchen-visibility problem.

---

# ORDER PAYMENT RELATIONSHIP

Current schema (re-confirmed, unchanged since Task 3.5): `orders.payment_transaction_id` exists (nullable, unique-indexed FK → `payment_transactions.id`); `payment_transactions.order_id` **does not exist** — the relationship is one-way only.

| Need | Sufficient with current (one-way) model? | Evidence |
|---|---|---|
| Payment → Order lookup | **Yes** — `SELECT * FROM orders WHERE payment_transaction_id = X`, backed by the existing unique index (`orders_payment_transaction_id_uidx`) — as fast as a direct FK would be | Index confirmed live in both staging and production |
| Order → Payment lookup | **Yes** — direct column read, no join needed | — |
| Webhook lookup | **Yes** — webhook never looks up by order at all; it looks up `payment_transactions` by `provider_ref` exclusively | Confirmed, `handler.js` |
| Reconciliation | **Yes** — a reconciliation job would scan `payment_transactions` (by status/age) and can find any linked order via the same reverse lookup above | — |
| Refunds | **Yes** — refunds operate on `payment_transactions`/Moyasar's `provider_ref`, not on orders at all; the order doesn't need to know about a refund for the refund itself to process | — |
| Multiple payment attempts | **Yes, under Flow A** — see next section; a `payment_transactions.order_id` column would actually be *harder* to keep correct here, not easier (see below) | — |
| Abandoned payments | **Yes** — an `initiated`/`pending` transaction with no linked order (because `create_order` was never reached) is simply an orphan row in `payment_transactions`, discoverable by `restaurant_id` + age, with no `orders` involvement needed | — |

**Recommendation: `KEEP CURRENT MODEL`.** Adding `payment_transactions.order_id` would create a second source of truth for the same relationship (which order does this payment belong to?), with no evidence any current or planned use case needs it — every lookup direction is already served by the existing unique-indexed column plus a `WHERE` clause. Under Flow A specifically, a transaction may exist *before* any order does, making a `NOT NULL order_id` on `payment_transactions` actively wrong, and a nullable one redundant with the existing reverse relationship.

---

# MULTIPLE PAYMENT ATTEMPTS

**Critical scenario, evaluated directly: Attempt 1 = failed, Attempt 2 = succeeded.**

Can `orders.payment_transaction_id` (a single nullable FK, uniquely indexed) represent this? **Yes, cleanly — but only if the order is created once, referencing only the successful attempt, which is exactly Flow A's natural behavior:**

1. Customer initiates payment → `paymentService.startCharge` creates `payment_transactions` row #1 (`initiated` → `failed`, e.g., card declined). **No order exists yet — nothing to update, nothing to clean up.**
2. Customer retries with a different card → `startCharge` creates a **second, independent** `payment_transactions` row #2 (own `idempotency_key`, own lifecycle) → succeeds.
3. `create_order` is called **once**, referencing row #2's ID. Row #1 remains in `payment_transactions` forever as a historical failed-attempt record, **never linked to any order**.

**Evaluated against your three options:**
- *Can one Order have multiple `payment_transactions`?* Not simultaneously (the FK column holds exactly one value) — but it doesn't need to, because failed attempts are never linked in the first place under Flow A.
- *Only one active payment transaction per order?* Yes, by construction — and it's always the successful one, once the order exists at all.
- *Historical failed attempts preserved?* Yes, automatically, in `payment_transactions`, queryable by `restaurant_id`/`idempotency_key` prefix or a shared `metadata` marker (e.g., a client-generated "checkout session" ID) if a future need arises to group attempts — **not required for MVP, and not something this audit recommends building now.**

**Recommended model, not implemented**: retries are handled entirely at the `payment_transactions` layer, before `create_order` is ever called. No schema change is needed. This is a direct consequence of adopting Flow A, not a separate design decision.

---

# PAYMENT → ORDER SYNCHRONIZATION

Five options evaluated against your six criteria, based on this project's actual existing patterns (no message queue infrastructure exists anywhere in this codebase; the established pattern throughout is direct Supabase RPC calls and `SECURITY DEFINER` functions):

| Option | Consistency | Idempotency | Tenant isolation | Observability | Rollback | Testability | Complexity |
|---|---|---|---|---|---|---|---|
| **A. Webhook directly updates `orders`** | High — same transaction as the payment update, single code path | High — reuses the webhook's already-proven `payment_webhook_events` idempotency (Tasks 3.4/synthetic E2E already verified this exact mechanism) | High — order lookup via `payment_transaction_id`, restaurant already validated at `create_order` time | Medium — logged same as existing webhook logs | Simple — `enforce_order_transition` trigger still guards the actual order-status write, so an invalid transition is rejected the same way it already is today | High — this project's existing synthetic E2E harness (this session) already models exactly this kind of extension | **Lowest** — no new service, no new infra, extends code that already exists and is already tested |
| B. `paymentService` updates orders | Similar to A, but `paymentService` itself has zero callers today (per the gap audit) — would need to also become the thing that's actually invoked, which conflates "generic payment service" with "webhook-triggered side effect" | Same as A if implemented similarly | Same as A | Same as A | Same as A | Same as A | Slightly higher — splits the logic across two files instead of one |
| C. Database trigger on `payment_transactions` | High in principle, but triggers are invisible to this project's Vitest-based test suite (everything is tested by mocking a JS `db` object, not a real Postgres instance — confirmed throughout this session's tasks) | Must be re-derived at the trigger level (can't reuse `handler.js`'s already-proven guard) | Must be re-implemented in SQL | Low — trigger failures are harder to observe/log meaningfully than application code | Harder — a misbehaving trigger affects every write to `payment_transactions`, including from any future caller | **Low** — this project has no established pattern or tooling for testing triggers (no local Postgres available, confirmed in the Production Readiness audit's own constraint) | Low code, but high *hidden* risk given this project's specific testing gap |
| D. Dedicated payment-order service | High | High (if built carefully) | High | High (dedicated logging) | Simple | Medium | **High** — new service/module, new deployment surface, disproportionate to current scale |
| E. Event-driven application layer | High in principle | Depends on the event bus's own guarantees | Depends | Depends | Depends | Depends | **Highest** — no event/queue infrastructure exists in this project at all; would be introducing an entirely new architectural pattern |

**Recommendation: Option A — extend the existing webhook handler to also update the linked order, through the normal `orders` UPDATE path (so `enforce_order_transition` still guards it), immediately after successfully updating `payment_transactions` to a terminal status.** This is the option most consistent with the project's existing architecture, reuses already-tested idempotency guarantees, and requires no new infrastructure. **Not implemented in this task.**

---

# FAILURE AND RECOVERY

All 15 scenarios, evaluated against the current (traced, not hypothetical) code:

| # | Scenario | Expected state | Recovery path | Idempotency key involved | Reconciliation needed? | Human intervention? |
|---|---|---|---|---|---|---|
| 1 | Create payment transaction fails (DB insert error) | No row created, no charge attempted (insert happens before the Moyasar call) | Customer retries checkout | New `idempotency_key` per attempt | No | No |
| 2 | Moyasar API fails | Transaction row exists, `status=failed`, `failure_reason` set — **already handled correctly today** | Customer retries (new transaction) | New key | No | No |
| 3 | Moyasar succeeds | `chargeResult` obtained, DB update pending | (leads into #4) | `idempotencyKey` sent to Moyasar | — | — |
| 4 | DB update after Moyasar success fails (**G-5**) | Row stuck at `status=initiated`, `provider_ref=NULL` — **confirmed gap, unguarded write** | **None exists today** | Broken — the very `provider_ref` needed to reconcile was never persisted | **Yes — this is the one scenario in this table with no existing recovery path at all** | Likely yes, without a reconciliation job (see G-5 DATA INTEGRITY) |
| 5 | Webhook delayed | Transaction stays in last-known status until delivery | Moyasar's own retry policy (per compatibility audit: 5 retries over ~4h) | `payload.id` (event ID) | No — this is normal, expected behavior | No |
| 6 | Webhook duplicated | Second delivery hits `23505`, returns `already_processed`, no double-update — **already correct, proven by this session's burst tests** | Automatic | `payload.id` | No | No |
| 7 | Webhook arrives before local persistence (i.e., before scenario 3/4 even completes) | `transaction_not_found` (no `provider_ref` to match yet) | **None — G-7, returns 200, Moyasar won't retry** | `provider_ref` | **Yes** | Possibly, if it's never retried |
| 8 | Webhook `transaction_not_found` generally | Same as #7 | Same as #7 | — | Same | Same |
| 9 | Payment failed (genuine decline) | `status=failed`, correctly recorded | Customer retries (new transaction, per Multiple Attempts model) | New key | No | No |
| 10 | Payment refunded | `status=refunded` if `data.status` present; recorded via `RECOGNIZED_UNHANDLED` otherwise (no invented transition, per remediation task) | Manual/business-process refund (Moyasar dashboard or a future refund flow) | `provider_ref` | Only if `data.status` is absent | Possibly |
| 11 | Payment voided | Same pattern as #10 | Same | Same | Same | Same |
| 12 | Order cancelled (independent of payment) | Order-side `enforce_order_transition` handles this already, completely independently of payment state — **the payment side has no awareness this happened at all** (confirmed — no order→payment sync exists in either direction) | N/A today | `orders.idempotency_key` | **Yes, if a paid order is cancelled — does the payment get refunded automatically? No mechanism exists for this today** | Yes, currently manual |
| 13 | Customer retries (double-click, etc.) | Covered by `payment_transactions.idempotency_key` (best-effort today — see IDEMPOTENCY MODEL, G-3.3's still-pending unique index) and `orders.idempotency_key` (DB-enforced, live) | Automatic for orders; best-effort (not yet DB-enforced) for payment transactions | Both | No, once the pending unique index is applied | No |
| 14 | Network timeout after Moyasar success (client never learns the outcome) | Same underlying risk as #4, from the *client's* perspective this time — the charge succeeded server-side but the client doesn't know | Requires a "confirm/verify" step (`paymentService.confirmCharge` already exists in code, but — like `startCharge` — **has zero callers today**) | `providerRef` | Same as #4 | Same as #4 |
| 15 | Frontend loses connection after payment (before any confirmation UI renders) | Same as #14 | Same — `confirmCharge` exists, unused | Same | Same | Same |

**Pattern across the table**: every scenario the *existing, tested* code already handles (2, 6, 9, most of 13) is handled correctly. Every scenario involving the *missing* pieces (4, 7, 8, 12, 14, 15) has no defined recovery today — not because anything is broken, but because the code that would recover from them was never built or never wired up.

---

# IDEMPOTENCY MODEL

Three genuinely independent identities, confirmed as separate fields in the live schema, that **must not be conflated** (this was the exact defect fixed in the Task 3.4 remediation — reusing `data.id` for both payment reference and webhook event identity):

| Identity | Protects against | Canonical field | Scope |
|---|---|---|---|
| **ORDER_IDEMPOTENCY** | A customer's browser retrying `create_order` (e.g., a flaky network causing a double-submit) from creating two orders for the same checkout intent | `orders.idempotency_key` (`uuid`, globally unique — confirmed live, production, `orders_idempotency_key_uidx`) | One per checkout attempt, generated client-side (`crypto.randomUUID()`, confirmed in `useCart.js`) |
| **PAYMENT_IDEMPOTENCY** | Double-charging the customer if `paymentService.startCharge` is called twice for the same payment intent | `payment_transactions.idempotency_key` (`text`) | One per payment attempt — **note: currently only a best-effort application-level check** (`SELECT` before `INSERT`), the DB-level unique index (`sql/payment_transactions_idempotency_key_unique.sql`) remains explicitly OWNER/DBA-gated and unapplied, per Task 3.3's own report |
| **WEBHOOK_EVENT_IDEMPOTENCY** | Processing the same Moyasar webhook delivery twice (retries, at-least-once delivery) | `payment_webhook_events.event_id` (paired with `provider`, `UNIQUE(provider, event_id)` — DB-enforced, confirmed live, and the correctness of using `payload.id` specifically for this — not `data.id` — was the entire subject of the Task 3.4 remediation) | One per Moyasar-generated event |

**`provider_ref` is a fourth, related-but-distinct concept**: it identifies *which payment* a webhook event is *about* (`payment_transactions.provider_ref`, matched against the webhook's `data.id`) — it is a **lookup key**, not an idempotency key. Conflating it with `event_id` was exactly G-1/the remediation's core fix; this audit reconfirms the three-identity model is now correctly separated in code.

**Recommendation**: keep all three fields as the sole canonical identity for their respective layer. Any future code (a checkout service, a reconciliation job) should generate/consume exactly one of these per concern, never reusing one across layers.

---

# G-5 DATA INTEGRITY

**Moyasar succeeds → DB persistence fails → `status=initiated`, `provider_ref=NULL`.**

Evaluated options, simplest-first, against this project's actual stack (no message queue, no background-job runner beyond `pg_cron` — already used elsewhere in this schema for e.g. loyalty-points expiry, confirmed in earlier audits):

- **Immediate retry (in-process)**: wrapping the final `UPDATE` in a retry loop reduces the *transient*-failure window but cannot fully close the gap (a sufficiently persistent failure still falls through) — cheap, worth having regardless of what else is chosen, but not sufficient alone.
- **Reconciliation job**: periodically scan `payment_transactions WHERE status='initiated' AND created_at < now() - interval` and, for each, call `MoyasarAdapter.verifyPayment()` (which **already exists in code**, confirmed, currently only called from `paymentService.confirmCharge` — itself uncalled) to look up the real status from Moyasar directly and reconcile. This is the standard pattern for exactly this class of problem and fits the project's existing `pg_cron` usage precedent.
- **Provider lookup on next customer interaction**: if the customer returns to check order status, trigger a `confirmCharge`-style lookup then — cheap, but only covers the case where the customer comes back, not truly abandoned-but-actually-charged transactions.
- **Idempotent retry via the same `idempotency_key`**: if `startCharge` were called again with the same key, Moyasar itself would (per standard payment-gateway idempotency semantics, though not independently confirmed against Moyasar's docs in this audit) return the same charge result rather than double-charging — this could let a client-side retry naturally self-heal, but depends on an assumption not yet verified against real Moyasar behavior.
- **Outbox/inbox pattern**: architecturally the most robust, but a significant addition (a durable outbox table + processor) disproportionate to this project's current scale and stack — not recommended as a first step.

**Recommended simplest safe approach**: a `pg_cron`-scheduled reconciliation job calling `verifyPayment()` for any `payment_transactions` row stuck in `initiated`/`pending` beyond a threshold (e.g., 15 minutes) — reuses code that already exists (`confirmCharge`/`verifyPayment`), fits the project's existing `pg_cron` precedent, and needs no new infrastructure. **Not implemented in this task.**

---

# G-7 WEBHOOK RACE

**`transaction_not_found` → `200` → Moyasar will not retry → the race (webhook arrives before local persistence) can permanently lose the update.**

Evaluated: changing this to a retryable `5xx` would let Moyasar's own retry policy (documented: 5 retries over ~4 hours) paper over the race automatically, with no new code beyond the response code itself — the simplest possible fix in principle. However, it also means a webhook for a transaction that will **never** exist (a stale/bogus `provider_ref`, or a transaction that failed at creation — scenario #1) would also retry 5 times before Moyasar gives up, which is wasted but harmless traffic. **Durable inbox / reconciliation** would be more robust (store the "orphan" webhook event and re-attempt the match later, e.g. via the same reconciliation job proposed for G-5) but is more work.

**Recommendation**: change the response code for `transaction_not_found` from `200` to a retryable status (e.g. `409` or `500`, whichever best fits — a specific choice deferred to implementation, since it's a one-line change with real behavioral consequences that should be reviewed, not silently picked here) **is the simplest safe approach**, given Moyasar's documented retry window (~4 hours) comfortably covers any realistic persistence-timing race. **Not implemented in this task**, per your explicit instruction not to fix G-7.

---

# CHECKOUT UX

**Functional states and transitions only — no visual design, as instructed.**

```
[Cart] → (customer chooses "Pay online")
   │
   ▼
[Payment Loading] ── initiates payment_transactions row + Moyasar charge
   │
   ├─→ [Redirect/Checkout] ── if Moyasar returns a redirectUrl (hosted payment page)
   │        │
   │        ▼
   │   [Pending confirmation] ── customer returns from Moyasar, awaiting webhook/confirm
   │        │
   │        ├─→ [Success] → create_order → [Order Confirmation]
   │        ├─→ [Failure] → [Retry Payment] (loops back to Payment Loading, new attempt)
   │        └─→ [Cancelled] (customer abandoned at Moyasar) → [Retry Payment] or [Back to Cart]
   │
   └─→ [Failure] (immediate, e.g. Moyasar API rejected the charge request itself) → [Retry Payment]
```

Nine states requested, all present above: Pay online (entry action), Payment loading, Redirect/checkout, Success, Failure, Cancelled, Pending, Retry payment, Order confirmation. **No component, page, or route implementing any of this exists today** — confirmed by grep in the prior gap audit (zero matches for payment-related UI anywhere in `src/pages`/`src/components`/`src/features`).

---

# SECURITY

Controls required, evaluated against what's already proven correct (existing tests/audits) vs. what a future implementation must add:

| Control | Status |
|---|---|
| Tenant isolation (payment reference must belong to the same restaurant) | **Already implemented and live-verified** — `create_order`'s `p_payment_transaction_id` check (Task 3.5, verified on staging and production) |
| Amount integrity | **Partially addressed** — `create_order` already recomputes and verifies pricing server-side independent of any client-supplied total (existing `price_changed` mechanism, unrelated to payments); a future payment-initiation service must similarly never trust a client-supplied amount, always deriving it from server-side cart/pricing logic (`lib/pricing.js`, already the single source of truth per this repo's own ADR-1) |
| Currency integrity | Must be fixed server-side (`'SAR'`, already hardcoded in `MoyasarAdapter.createCharge`) — not client-configurable |
| Restaurant ownership | Same mechanism as tenant isolation above |
| Payment reference ownership | Already implemented (see tenant isolation) |
| Webhook authentication | **Unverified against real Moyasar (G-6) — unchanged, unresolved, out of this document's control** |
| Replay protection | Already implemented — `payment_webhook_events` unique constraint, DB-enforced |
| Duplicate protection | Already implemented and burst-tested (this session's synthetic E2E) |
| Secret management | Already correct — all payment secrets are Edge-Function-only env vars, never client-exposed (confirmed throughout every prior audit this session) |
| Client-side manipulation | The payment-initiation step (not yet built) must never accept a client-supplied `amount`, `restaurantId` validity, or `providerRef` as trusted input without server-side re-derivation — this is a requirement for whatever builds the checkout service, not something currently at risk (nothing calls the vulnerable surface yet) |

---

# MUST HAVE

Required for a *safe* end-to-end payment flow (not necessarily a *complete* one):

1. A payment-initiation service/caller that actually invokes `paymentService.startCharge` (closes G-1) — server-side derived amount/currency only.
2. Wiring `create_order`'s `p_payment_transaction_id` parameter from that flow (closes G-2), following Flow A (payment-first).
3. Deploying the webhook Edge Function with `verify_jwt: false` (already documented as a deployment requirement in the Production Readiness audit).
4. Payment→Order synchronization (Option A recommended above) — closes G-4, without which a successful payment would never make its order visible to the kitchen.
5. G-5 reconciliation (at least the simplest form — a scheduled `verifyPayment` sweep) — without it, a real charge can be silently lost with no recovery path at all.
6. Minimal checkout UX states (Payment Loading, Success, Failure, Retry) — without *some* UI, nothing in 1–5 is reachable by a real customer.
7. `payment_transactions.idempotency_key` DB-level unique index finally applied (already written, `sql/payment_transactions_idempotency_key_unique.sql`, OWNER/DBA-gated since Task 3.3) — currently only a best-effort application check.

# SHOULD HAVE

Important, can follow the MVP:

- G-7 fix (retryable response for `transaction_not_found`) — narrows an existing race window but doesn't block a first working flow, since the race is timing-dependent and not certain to occur.
- Full checkout UX (redirect/pending/cancelled states, polished retry flow).
- Refund-triggered order-status awareness (failure scenario #12) — refunds can be handled manually via Moyasar's dashboard initially.
- Real Moyasar auth verification (G-6) upgrading from `NOT_VERIFIED` to confirmed — needed before **production** go-live, but not before *building* the integration layer against synthetic/staging verification.
- Multi-attempt session grouping/reporting (metadata-based) — not needed for correctness, only for future analytics.

# OUT OF SCOPE

Not necessary for Task 3.6:

- `payment_transactions.order_id` (reverse FK) — evidence above shows the current one-way model is sufficient.
- Outbox/inbox architecture for G-5 — reconciliation job is simpler and sufficient.
- Event-driven/message-queue architecture for sync — no infrastructure exists, disproportionate to current scale.
- Automatic refund-on-order-cancellation — a business-policy decision, not an architecture gap, and not evidenced as required by anything traced in this audit.
- **Moyasar Sandbox E2E**: per your explicit instruction not to pretend access exists — this is classified **`BLOCKED_EXTERNAL_DEPENDENCY`**, not `MUST_HAVE`. Nothing in Task 3.6 can make sandbox credentials appear; the MUST-HAVE list above is deliberately structured so that everything through item 6 can be built and synthetically/staging-verified *without* it, leaving only final real-world confirmation gated on this external dependency.

---

# TASK 3.6 IMPLEMENTATION BREAKDOWN

Derived from the evidence above, not the example names in your prompt:

### 3.6A — Payment-First Checkout Service
- **Objective**: build the missing caller that actually invokes `paymentService.startCharge` with server-derived amount/currency, closing G-1.
- **Files likely affected**: new hook/service in `src/features/menu/` or `src/payments/`, no existing file needs modification.
- **DB changes**: none.
- **Dependencies**: none beyond existing `paymentService`/`MoyasarAdapter`.
- **Tests**: new unit tests mirroring `paymentService.test.js`'s existing mocked-DB pattern.
- **Risks**: client-side amount trust (must avoid — see SECURITY).
- **Acceptance criteria**: a `payment_transactions` row is created with `status=initiated`, then correctly transitions to `succeeded`/`failed` based on the (synthetic, initially) Moyasar response.

### 3.6B — Order/Payment Integration (Flow A wiring)
- **Objective**: call `create_order` with `p_payment_transaction_id` only after 3.6A's charge succeeds, closing G-2.
- **Files**: `useCheckout.js` or a new payment-aware variant of it.
- **DB changes**: none (column/FK already exist).
- **Dependencies**: 3.6A.
- **Tests**: extend existing checkout E2E patterns.
- **Risks**: the "charged but `create_order` fails" edge case (Flow A's own risk, above) — needs at least a documented manual-recovery procedure even if automated reconciliation lands later.
- **Acceptance criteria**: a successful payment reliably produces exactly one order, correctly linked.

### 3.6C — Payment Status → Order Status Synchronization
- **Objective**: implement Option A (webhook extension) — closes G-4.
- **Files**: `supabase/functions/payment-webhook/handler.js`.
- **DB changes**: none (uses existing `orders` UPDATE path, already guarded by `enforce_order_transition`).
- **Dependencies**: 3.6B (nothing to synchronize without a linked order).
- **Tests**: extend this session's synthetic E2E harness with order-table assertions.
- **Risks**: must respect `enforce_order_transition`'s existing rules — a webhook arriving when the order is already `preparing` (staff already acted) must not force an invalid transition.
- **Acceptance criteria**: a `succeeded` webhook for a linked, still-`pending`-payment order results in the correct, guard-respecting order state; the boundary confirmed absent in the gap audit (`SYNTH-ORD-1`) is now deliberately present, tested, and correct.

### 3.6D — Checkout UX
- **Objective**: the functional states defined above, as real UI.
- **Files**: new page(s)/component(s) under `src/features/menu/` or `src/pages/`.
- **DB changes**: none.
- **Dependencies**: 3.6A, 3.6B.
- **Tests**: new Playwright E2E, mirroring existing `qr-cart-checkout-order.spec.ts` structure.
- **Risks**: primarily UX/product decisions, not architectural — deliberately not designed in this document per your instruction.
- **Acceptance criteria**: a real user can complete every state in the CHECKOUT UX diagram above (against synthetic/staging data initially).

### 3.6E — Failure Recovery (G-5 reconciliation)
- **Objective**: the `pg_cron`-based reconciliation sweep recommended above.
- **Files**: new `sql/` migration (function + `pg_cron` schedule), following the exact precedent already in this schema (loyalty expiry).
- **DB changes**: yes — new function, new `pg_cron` job. **Not created in this audit.**
- **Dependencies**: 3.6A (needs real `initiated` rows to reconcile against).
- **Tests**: SQL-level, following this project's existing static-guard-test pattern where a live DB isn't available (per the SIGILL/Termux constraint already documented).
- **Risks**: must call `verifyPayment` idempotently and must not conflict with a webhook arriving concurrently.
- **Acceptance criteria**: a synthetically-stuck `initiated` transaction is correctly reconciled within one sweep cycle.

### 3.6F — Idempotency Hardening
- **Objective**: finally apply `sql/payment_transactions_idempotency_key_unique.sql` (already written, OWNER/DBA-gated since Task 3.3).
- **Files**: none new — this file already exists.
- **DB changes**: yes, one `CREATE UNIQUE INDEX CONCURRENTLY`. **Not applied in this audit.**
- **Dependencies**: none — independent of everything else, could be done first.
- **Tests**: none needed beyond what already exists (the index changes a guarantee, not behavior).
- **Risks**: per the file's own header, must confirm zero existing duplicate `idempotency_key` values first — trivial today since `payment_transactions` has 0 rows in both staging and production (confirmed, prior audits).
- **Acceptance criteria**: concurrent double-`startCharge` calls with the same key cannot both succeed.

### 3.6G — Real Moyasar Verification (external, gated)
- **Objective**: resolve G-6 — confirm the HMAC/auth mechanism against real Moyasar behavior.
- **Dependencies**: **Moyasar sandbox access — `BLOCKED_EXTERNAL_DEPENDENCY`, not something any of 3.6A–F can unblock.**
- **Acceptance criteria**: a real Moyasar sandbox webhook delivery is successfully authenticated and processed.

---

# ACCEPTANCE CRITERIA

For the complete Task 3.6, only criteria supported by the architecture traced above:

- ✅ Customer can initiate payment (3.6A) — *supported, not yet built*.
- ✅ Payment transaction created correctly, with server-derived amount (3.6A).
- ✅ Order/payment relationship correct — one order, one successful transaction, via Flow A (3.6B).
- ✅ Moyasar payment created (3.6A, reusing already-tested `MoyasarAdapter`).
- ✅ Webhook processed correctly — **already true today**, independent of 3.6, per this session's remediation + synthetic E2E work.
- ✅ Duplicate webhook safe — **already true today**, DB-enforced.
- ✅ Payment status updated — **already true today**.
- ✅ Order status updated (3.6C, new).
- ✅ Failed payment safe — **already true today** for the transaction itself; safe-for-the-customer-experience requires 3.6D.
- ✅ Retry safe — via the Multiple Attempts model (no schema change needed, a direct consequence of Flow A).
- ✅ Multiple attempts safe — same as above.
- ✅ Amount cannot be manipulated — requires 3.6A to be built with server-derived amounts from the start (a build requirement, not something to verify after the fact).
- ✅ Tenant isolation — **already true today**, live-verified (Task 3.5).
- ⚠️ Reconciliation — requires 3.6E; without it, G-5's specific failure mode has no safety net.
- ✅ No duplicate orders — **already true today** (`orders.idempotency_key`, DB-enforced, live).
- ⚠️ No lost successful payments — **requires 3.6E**; without it, this criterion cannot be met (G-5 is exactly this failure mode, currently unguarded).

**Two criteria are explicitly marked ⚠️ conditional on 3.6E** — this audit will not claim "no lost successful payments" as achievable without the reconciliation work, since the evidence (G-5) directly contradicts that claim today.

---

# PRODUCTION IMPACT

Assessed, not executed:

- **Production DB changes required**: the idempotency unique index (3.6F, already written) and, if 3.6E is pursued, a new reconciliation function + `pg_cron` schedule. No change to `orders`/`payment_transactions`/`payment_webhook_events`'s existing structure is needed — Task 3.5's migration already provides everything the linkage itself requires.
- **Production Edge Function changes**: the webhook needs to actually be deployed (still pending, per the Production Readiness audit) with `verify_jwt: false`, and — for 3.6C — updated to also write to `orders`.
- **Environment variables**: `PAYMENT_MOYASAR_SECRET_KEY`/`PAYMENT_MOYASAR_WEBHOOK_SECRET` still need real values configured (currently unset, confirmed, no deployment exists yet to configure them against).
- **Frontend deployment**: 3.6D's new checkout UI would ship as a normal Vite/Vercel deployment, no special infrastructure.
- **Migration requirements**: additive only (new column already exists from Task 3.5; only a new index and, if pursued, a new function/cron job) — no destructive change identified anywhere in this analysis.
- **Rollback requirements**: each 3.6 sub-phase above is independently revertible (new files/functions, no destructive schema change) — consistent with every migration this session has already produced and documented rollback procedures for.

**Nothing in this section was executed.**

---

# DEPENDENCIES

- 3.6B depends on 3.6A. 3.6C depends on 3.6B. 3.6D depends on 3.6A+3.6B. 3.6E depends on 3.6A (needs real rows to reconcile). 3.6F is independent, could be done first, at any time, with zero risk (0 existing rows in both environments). 3.6G depends on nothing in this list — it's blocked purely externally.

# BLOCKERS

- **Moyasar sandbox access** — blocks 3.6G entirely, and blocks *real* (not synthetic/staging) confidence in 3.6A–D's Moyasar-facing behavior. Does not block building or synthetically verifying 3.6A–F.
- **G-6 (real auth verification)** — same external dependency as above.
- No internal/architectural blocker was found for 3.6A, 3.6B, 3.6C, 3.6E, or 3.6F — each has a clear, evidence-based design in this document.

# RISKS

- Flow A's "charged but `create_order` fails" edge case (new risk this analysis surfaced) needs at least a documented manual procedure before go-live, even if full automation (3.6E-style) isn't ready yet.
- 3.6C must be built carefully against `enforce_order_transition`'s existing rules — a naive implementation could attempt an invalid transition and simply fail loudly (safe) or, worse, be written to bypass the trigger (unsafe, not recommended anywhere in this document).
- Everything synthetically/staging-verified before 3.6G still carries residual risk until real Moyasar delivery is confirmed — this is an accepted, unavoidable limitation of the current external-access situation, not a flaw in the plan.

---

# RECOMMENDED NEXT STEP

Per this audit's own evidence, the safest ordering is: **3.6F first** (zero-risk, already-written, independent) → **3.6A** → **3.6B** → **3.6C** → **3.6D**, with **3.6E** developed in parallel once 3.6A exists to generate real rows to reconcile against — and **3.6G pursued whenever Moyasar sandbox access becomes available**, independent of the rest of the timeline. This is a recommendation for your decision, not an instruction to proceed — no implementation was started or authorized by this document.

---

# GIT STATUS

```
$ git status --short
 M src/payments/adapters/moyasar.js       (unchanged — from the remediation task, not this one)
 M src/payments/types/index.js            (unchanged)
 M supabase/functions/payment-webhook/handler.js  (unchanged)
 M tests/unit/MoyasarAdapter.test.js      (unchanged)
 M tests/unit/paymentWebhook.test.js      (unchanged)
 (plus pre-existing untracked report/sql files from prior sessions)

$ git diff --stat
 5 files changed, 187 insertions(+), 7 deletions(-)   (identical to prior tasks — nothing new)
```

**No commit, no push, no merge, no deploy, no schema change, no migration created.** This entire task was analysis and documentation only.

---

# REPORT FILE

`reports/TASK_3_6_SCOPE_ARCHITECTURE_AUDIT.md`

# DOWNLOAD COPY

`/sdcard/Download/TASK_3_6_SCOPE_ARCHITECTURE_AUDIT.md` (copied and verified after this report was written).

---

## FINAL VERDICT

**TASK_3_6_SCOPE_READY_WITH_BLOCKERS**

A complete, evidence-based architecture and 7-part implementation breakdown (3.6A–3.6G) is defined, with clear dependencies, acceptance criteria, and production impact for each part. It is not unconditionally `SCOPE_READY` because two items — real Moyasar authentication verification and sandbox E2E — are genuinely blocked by external access this audit cannot resolve or estimate a timeline for. Everything else (3.6A through 3.6F) has no identified architectural blocker and could proceed on your authorization.

---

*Report generated 2026-08-26. Architecture and scope analysis only — no code written, no schema modified, no migration created, no deployment, no Moyasar configuration, no commit, no push.*
