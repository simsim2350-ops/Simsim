# Task 3.6C-Refund-A — Refund Architecture Audit

**Read-only. No code, schema, or database changed. No Moyasar call. No refund call. No migration created.**

---

# EXECUTIVE SUMMARY

`paymentService.refund()` exists, is fully implemented, and has **zero real callers anywhere in the repository** (confirmed by a repository-wide search — only its own definition, its own doc comments, and this session's own explanatory comments in `checkoutOrchestration.js` reference it). It has three real, concrete, previously-undocumented gaps this audit found by tracing its actual code: **(1) no tenant/ownership check at all** — it looks up a transaction by `provider_ref` alone and refunds whoever owns it, with no `restaurant_id` verification anywhere; **(2) no real idempotency guard** — the `idempotencyKey` it requires as input is validated for presence but never checked, stored distinctly, or sent to Moyasar, so protection against a double-refund relies entirely on a sequential status check (`tx.status !== 'succeeded'`) with **no database-level guard** (no unique constraint, no row lock) — a genuine concurrent-race gap; **(3) an unguarded final `UPDATE`** — structurally identical to the already-documented G-5 pattern in `startCharge`, but never previously flagged for `refund()` specifically.

The webhook path was traced precisely for why `succeeded → refunded` is currently blocked: **two independent, deliberate design decisions**, not one — the terminal-status guard (blocks any further write once a transaction reaches any terminal state) **and** `payment_refunded` being explicitly routed to `RECOGNIZED_UNHANDLED` (Task 3.4's own deliberate choice to invent no business logic for unverified event types) — both would need to change for the webhook to ever set `status='refunded'`, and neither has been verified against real Moyasar payloads (the same G-6 gap already tracked throughout this session).

**Given this, the safest, immediately-actionable trigger point is `paymentService.refund()` itself (Option B)** — not the webhook — because it is the **only** code path that actually, correctly sets `status='refunded'` today, requires no speculative webhook changes, and `syncOrderStatusFromPayment`'s own re-read-from-database design (3.6C.2, unmodified) makes it safe to call from here without any change to that service.

**Verdict: `REFUND_ARCHITECTURE_READY_WITH_WARNINGS`** — the sync-trigger-point question has a clear, safe answer, but `paymentService.refund()` itself has real, pre-existing gaps (tenant isolation, idempotency, G-5-equivalent failure isolation) that are **prerequisites to wiring it to any real caller**, entirely independent of the order-sync question this task was scoped to answer.

---

# REFUND_API

Traced from the actual, unmodified `paymentService.refund(input, {db})`:

| Aspect | Finding |
|---|---|
| Signature | `async refund(input, {db})` — `input: {providerRef, amount?, reason?, idempotencyKey}` (`RefundInput` typedef, `src/payments/types/index.js`, unchanged) |
| Real callers | **None** — confirmed via repository-wide search for `.refund(`, `refund(`, `paymentService.refund`, `refundPayment`, `createRefund`, `refundTransaction`. The only non-definition matches: `PaymentAdapter.refundPayment`/`MoyasarAdapter.refundPayment` (the adapter method `refund()` calls, not `refund()` itself), a fully separate, unrelated, also-uncalled `PaymentContract.refundPayment` in `src/integration/contracts/capabilities/payment.js` (a dormant future-integration-layer abstraction, unconnected to the payments module), and this session's own explanatory comments in `checkoutOrchestration.js` confirming it is *not* called from there either. |
| Provider adapter call | `adapter.refundPayment(input)` — the full, raw `input` object is forwarded unchanged |
| Database updates | One `UPDATE payment_transactions SET status='refunded', raw=..., updated_at=...` after the adapter call succeeds — **no `try/catch`** around it (see FAILURE_ISOLATION) |
| Transaction lookup | `SELECT id, provider, status, amount FROM payment_transactions WHERE provider_ref = input.providerRef` — **no `restaurant_id` in the query or anywhere in the function** |
| Tenant validation | **None** — a real, concrete gap (see TENANT_ISOLATION) |
| Amount handling | `tx.amount` is fetched but **never read or compared again** anywhere in the function — a caller-supplied `input.amount` (if present) passes straight to the adapter with **zero validation against the original charged amount** (see REFUND_AMOUNT) |
| Currency handling | Not referenced at all in `refund()` — the adapter's own refund endpoint doesn't take a currency parameter either (Moyasar refunds are implicitly in the original charge's currency, per the endpoint's own shape) |
| Idempotency | `input.idempotencyKey` is **required** (`if (!input?.idempotencyKey) throw ...`) but then **never used again** — not stored on the transaction row, not sent to Moyasar, not checked for reuse. The only actual protection is the `tx.status !== SUCCEEDED` guard (see REFUND_IDEMPOTENCY) |
| Error handling | Plain thrown `Error`s for validation/lookup failures; the adapter call and final UPDATE are **not** wrapped — any failure there propagates as an unhandled rejection to the caller |
| Return value | `{transactionId, refundRef, status}` — no raw payload, no secrets |

---

# MOYASAR_REFUND_ADAPTER

`MoyasarAdapter.refundPayment(input)` (unmodified, not called in this audit):

| Aspect | Finding |
|---|---|
| Endpoint | `POST /payments/{providerRef}/refund` |
| Provider reference used | `input.providerRef`, embedded directly in the URL path |
| Amount representation | `Math.round((input.amount ?? 0) * 100)` — **halalas**, same `*100` conversion pattern as `createCharge`; `0` if `input.amount` is absent (full-refund case — Moyasar's own API treats a request with no/zero amount as "refund the full remaining amount," per this codebase's own comment, not independently re-verified against live docs in this read-only task) |
| Currency | Not sent — implicit to the original charge, matching the endpoint's own path-based (not body-based) charge reference |
| Authentication | Same `Basic ${apiKey}` header as every other Moyasar call — no separate refund-specific credential |
| Response mapping | `{refundRef: data.id, status: data.status === 'refunded' ? RefundStatus.REFUNDED : RefundStatus.FAILED, raw: data}` |
| Error mapping | Same shared `_handleResponse` helper as `createCharge`/`verifyPayment` — 4xx/5xx/network-error patterns, unchanged |
| Idempotency behavior | **None** — no idempotency key or header of any kind is sent in the refund request body, confirmed by direct code inspection (`body = {amount, reason}` only) |
| Provider success persisted locally? | Only via the **caller's** own subsequent `UPDATE` (`paymentService.refund()`) — the adapter itself never touches the database, consistent with the adapter layer's existing DB-agnostic design throughout this module |
| Provider failure changes local status? | **No** — if `adapter.refundPayment` throws, `paymentService.refund()` has no catch around it; `payment_transactions.status` remains unchanged (`'succeeded'`) — safe in the sense of not recording an incorrect status, but see FAILURE_ISOLATION for the opposite (success-then-local-failure) case |

No secret was exposed or referenced beyond what already exists in the unmodified adapter code; no real Moyasar call was made.

---

# PAYMENT_STATUS_TRANSITIONS

Every writer of `payment_transactions.status`, re-traced in full this task:

| Transition | Source | Currently allowed? | Validated where? | DB guard? | Webhook guard? |
|---|---|---|---|---|---|
| `(new row) → initiated` | `startCharge` INSERT | Yes | N/A (new row) | None needed | N/A |
| `initiated → {succeeded,pending,failed,...}` | `startCharge` post-call UPDATE | Yes | None — first real transition, unconditional | None | N/A (not the webhook) |
| `initiated → failed` | `startCharge` catch-block UPDATE | Yes | None — first real transition | None | N/A |
| `{pending} → {succeeded,failed,cancelled,pending}` | Webhook `_handleWebhookEvent` | Yes, **only if current status is not already terminal** | `TERMINAL` set check (`succeeded,failed,cancelled,refunded`) | None (application-level only) | **Yes** — this is the guard |
| `{pending} → {succeeded,failed,cancelled,pending}` | `confirmCharge` | Same — `isTerminalStatus(tx.status)` guard, identical mechanism | Same | None | N/A (not the webhook, but the same blacklist pattern) |
| **`succeeded → refunded`** | **`paymentService.refund()` only** | **Yes — the only path that currently succeeds** | **Whitelist**: `tx.status !== SUCCEEDED` → throw (i.e., *only* a currently-`succeeded` row is eligible) | **None** (no unique constraint, no row lock — see REFUND_IDEMPOTENCY) | **Blocked** — the webhook's blacklist guard treats `succeeded` as terminal and refuses to write past it, for *any* target status including `refunded` |
| `succeeded → refunded` via webhook | `_handleWebhookEvent` | **No — structurally blocked** | N/A | N/A | Terminal guard fires, `already_terminal`, no write |

**`refund()`'s guard is the inverse shape of the webhook's**: the webhook blacklists *source* states (anything terminal is frozen); `refund()` whitelists exactly one *source* state (`succeeded`) and one *target* (`refunded`) — different mechanisms, but both currently correct for their own narrow scope, and both independently confirmed by direct code reading, not assumption.

---

# WEBHOOK_TERMINAL_GUARD

**Exactly why `succeeded → refunded` is blocked**: `_handleWebhookEvent`'s `TERMINAL = new Set(['succeeded','failed','cancelled','refunded'])` check runs **before** any status write, testing the transaction's **current** (pre-event) status — if it's already in that set, the function returns `{updated:false, reason:'already_terminal'}` immediately, **regardless of what the new event claims**. It does not inspect the *target* status at all — it is a blunt, current-state-only blacklist.

**What it protects against**: event **reordering/replay** — Moyasar's own delivery is not guaranteed to arrive in chronological order (documented via its retry policy, re-confirmed in earlier this-session audits), so an older, now-superseded event (e.g., a stale `payment_authorized` arriving after a `payment_paid` was already processed) must not be allowed to regress an already-resolved transaction. This is **not** primarily a duplicate-event guard (that's `uq_webhook_provider_event`'s job, at the event-identity layer, before this check ever runs) — it is specifically a **state-regression** guard.

**Would a narrow exception for `succeeded → refunded` be safe?** **Yes — reasoned through explicitly, not assumed**: every value in `TERMINAL` is, by construction, a state with no further *legitimate* forward transition **except** `refunded`, which is only ever reachable from `succeeded` specifically (per PAYMENT_STATUS_TRANSITIONS above — `refund()`'s own whitelist already enforces this). There is no legitimate Moyasar event that could arrive *after* a genuine `succeeded → refunded` transition and need to *further* change the status (refunded is itself terminal, with no valid successor) — meaning a narrow carve-out (`if (tx.status === 'succeeded' && newStatus === 'refunded') { allow }`) would **not** reintroduce the reordering risk the guard exists to prevent, because refund is the one legitimate *forward* continuation from `succeeded`, not a regression to it. **This reasoning supports that such an exception *could* be made safely** — but it is **not implemented here**, and doing so would still require independently verifying Moyasar's *actual* refund webhook payload shape against real traffic (G-6, not resolved by this audit) before trusting `event.status`/`data.status` values sourced from it.

---

# WEBHOOK_REFUND_EVENTS

Traced from `MoyasarAdapter.parseWebhook` and `_eventTypeToStatus`, not assumed:

- `payment_refunded` is in `KNOWN_WEBHOOK_TYPES` (recognized, not `UNKNOWN`) but maps to `WebhookEventType.RECOGNIZED_UNHANDLED` — **not** a distinct "refund" semantic type with its own handling.
- In `_handleWebhookEvent`, the `RECOGNIZED_UNHANDLED` branch **explicitly skips any status update** (`if (!event.status && event.type === 'recognized_unhandled') {...skip...}`) — a deliberate Task 3.4 design choice to avoid inventing unverified business logic.
- **However**: `parseWebhook`'s own `status: data.status ? this.mapStatus(data.status) : undefined` line, and `mapStatus`'s own `case 'refunded': return TransactionStatus.REFUNDED`, **already exist and are already correct** — if a `payment_refunded` webhook's `data.status` field happens to equal `'refunded'`, the mapping machinery would produce the right value. The `RECOGNIZED_UNHANDLED` routing is what currently discards this even when it would be correct, not a missing capability in the mapping layer itself.

**Conclusion**: refund events are **not a source-unavailable problem** — the *capability* to correctly map a refund status already exists in the adapter. What's missing is (a) routing `payment_refunded` to use that mapping instead of `RECOGNIZED_UNHANDLED`, and (b) the terminal-guard carve-out above — both deliberate, narrow, but **unverified-against-real-traffic** changes. **`REFUND_WEBHOOK_SOURCE_UNAVAILABLE` is not the accurate characterization** — the more precise finding is: *the source is technically representable but is currently, deliberately suppressed, and its real-world shape has never been confirmed against live Moyasar data.*

---

# REFUND_OWNERSHIP

**No refund functionality exists anywhere in the UI** — confirmed via a search of `src/admin/` and `src/pages/` for any refund-related code: zero matches. There is no Admin Dashboard, Super Admin, Order Management, or Payment Management refund action anywhere in this codebase today.

**Existing authorization architecture**: the project has an established RBAC system (`sql/platform_roles_rbac.sql`, confirmed to exist from prior session audits) governing admin/staff permissions generally, but **no refund-specific permission or role is currently defined within it** — this audit does not propose inventing one; it only confirms none exists yet. `paymentService.refund()` itself performs **no authorization check of any kind** — consistent with this module's existing pattern throughout (`startCharge` doesn't check *who* is calling it either; authorization is expected to live at whatever *calling* layer — an Edge Function, an admin endpoint — eventually invokes these functions, none of which currently exist for refunds).

---

# TENANT_ISOLATION

Traced precisely: `refund request → payment transaction (looked up by provider_ref only) → tx.restaurant_id exists on the row but is never read → adapter.refundPayment(input)`.

**Finding, stated plainly: `paymentService.refund()` has no tenant-ownership check anywhere.** It fetches `id, provider, status, amount` — **not `restaurant_id`** — and nothing in the function compares the found transaction's restaurant to any caller-supplied or otherwise-verified expected restaurant. **If this function is ever exposed to any caller that only needs to supply a `provider_ref` (which, unlike `payment_transactions.id`, is not obviously restaurant-scoped from a caller's perspective), it could currently refund any restaurant's payment, regardless of who is asking.** This is a genuine, concrete gap — the exact opposite of the careful `restaurant_id`-from-trusted-column discipline already established in `createOrderFromSuccessfulPayment` (3.6B) and `syncOrderStatusFromPayment` (3.6C.2). **Not fixed here** (this task is read-only and scoped to the sync-trigger-point question), but flagged as a hard prerequisite for wiring `refund()` to any real caller.

---

# REFUND_AMOUNT

**Both full and partial refund are supported at the type/adapter level** — `RefundInput.amount` is explicitly optional ("جزئي؛ يُترك فارغاً للاسترداد الكامل" — partial; left empty for full refund).

**Amount source rule, as currently implemented: not server-authoritative, not validated against the original payment.** `paymentService.refund()` fetches `tx.amount` (the original charged amount) in its own `SELECT` but **never reads it again** — a caller-supplied `input.amount` for a partial refund passes straight to `adapter.refundPayment` with **zero check that it's ≤ the original amount**, and zero check that repeated partial refunds don't cumulatively exceed the original charge (there is no running "amount already refunded" tracking anywhere in this schema). Whatever validation exists today would only occur at Moyasar's own API level, external and unverifiable without a real call (explicitly out of scope here). **This is a real, concrete constraint gap**, distinct from the tenant-isolation one, equally a prerequisite for any real refund-initiation caller — not something this audit's sync-trigger-point recommendation can or should paper over.

---

# REFUND_IDEMPOTENCY

- **Can the same refund be triggered twice?** Sequentially, once the first call's `UPDATE` has committed — **no**, the second call's `SELECT` finds `status='refunded'` (not `'succeeded'`) and throws before reaching the adapter. **Concurrently** (two calls both reading `status='succeeded'` before either's `UPDATE` commits) — **yes, this is currently possible**: both would pass the guard and both would call `adapter.refundPayment`, a genuine double-refund risk if this were ever wired to live traffic.
- **Is there protection against double-refund?** Only the sequential status-check described above — an application-level, non-atomic check, not a database guarantee.
- **Is there a unique constraint?** **No** — re-confirmed against the live schema (3.6A-2A/3.6C-A's own re-verification, unchanged): `uq_paytx_idempotency_key` and `uq_paytx_provider_ref` are the only relevant unique indexes on `payment_transactions`, and **neither would prevent a duplicate `UPDATE` to the same existing row** (unique constraints govern `INSERT` conflicts, not concurrent `UPDATE`s to one row).
- **Is there an existing idempotency-key model equivalent to payment creation?** **No** — `startCharge`'s idempotency model (pre-check `SELECT` + a real unique-index-backed guarantee against duplicate rows) has no counterpart here. `refund()`'s `idempotencyKey` parameter is required for input-validation purposes only and is never actually used as an idempotency mechanism (REFUND_API above).

---

# SAFEST_TRIGGER_POINT

Evaluated all five, against actual evidence gathered above:

| | A — Webhook (after guard adjustment) | **B — Inside `paymentService.refund()`** | C — New admin-triggered service | D — Reconciliation job (3.6E) | E — Multiple entry points |
|---|---|---|---|---|---|
| Requires unverified changes first? | **Yes — two** (terminal guard carve-out + `RECOGNIZED_UNHANDLED` re-routing), neither verified against real Moyasar traffic (G-6) | **No** — `refund()` already, correctly, sets `status='refunded'` today with zero changes needed to reach that state | No new blocker beyond what B already has | Wrong scope — 3.6E is for *ambiguous/lost* state, this is *known* state | Combines A's prerequisite risk with B's readiness — no benefit over B alone today |
| Safety | Depends entirely on the unverified webhook changes being correct | High — reuses `syncOrderStatusFromPayment`'s own re-read-from-DB design, which doesn't care who calls it | Same safety profile as B, plus the tenant/idempotency gaps in `refund()` itself still apply regardless of caller | N/A | Redundant calls harmless (3.6C.2 idempotent by design), but adds complexity for no gain until A becomes viable |
| Consistency with existing architecture | Breaks the established pattern of not touching the webhook without real-traffic verification | **Matches** — the same "call the existing, tested sync service from the one place that already reaches the right state" pattern already used nowhere yet, but architecturally identical to how 3.6B was integrated conceptually | Would need to be built from scratch; `refund()` already exists | N/A | N/A |

**Recommendation: B — call `syncOrderStatusFromPayment({paymentTransactionId: tx.id}, {db})` from inside `paymentService.refund()`, immediately after its own successful `UPDATE`.**

**Duplicate-trigger safety, explicitly re-verified for this entry point**: `syncOrderStatusFromPayment` (3.6C.2, unmodified) always re-reads `payment_transactions.status` and the linked order's *current* status fresh from the database on every call — it has no memory of prior invocations and doesn't need one. If `refund()` were ever called twice for the same transaction (the concurrent-race scenario above), the **second** `syncOrderStatusFromPayment` call would find the order already `cancelled` and correctly return `{action:'none'}` (3.6C.2's own already-tested idempotency, SYNC-08/SYNC-12) — **this holds regardless of entry point**, confirmed by re-reading 3.6C.2's actual logic, not assumed.

---

# FAILURE_ISOLATION

**Scenario**: refund succeeds at Moyasar → the local `payment_transactions` `UPDATE` (inside `refund()`) fails.

**Finding: this is a genuine, new, previously-undocumented gap — structurally identical to G-5, but specific to refunds and not previously named or tracked anywhere in this session's reports.** `refund()`'s final `UPDATE` has no `try/catch`, exactly mirroring `startCharge`'s own G-5 pattern. If it fails, `payment_transactions.status` remains `'succeeded'` even though the money has actually been returned to the customer at Moyasar — refund state is silently lost from this system's perspective (though, unlike G-5's payment-creation case, Moyasar's own dashboard/records would still independently reflect the real refund — this system's local record would simply be stale, not the sole record of truth being lost).

**Classification, per instruction ("determine whether this is already protected, a NEW G-5-equivalent gap, or something to document only")**: this is a **NEW G-5-equivalent gap** — not already protected by anything in this codebase, and **not fixed here**, exactly as instructed. It should be named and tracked alongside G-5 for whatever future reconciliation work (3.6E) eventually addresses both.

---

# SECURITY_THREAT_MODEL

| # | Threat | Current protection | Proposed protection | Residual risk |
|---|---|---|---|---|
| 1 | Client-triggered refund for another tenant | **None** — `refund()` has no tenant check at all (TENANT_ISOLATION) | Add an explicit `restaurant_id` verification to `refund()` itself (out of this task's scope — a prerequisite for wiring any real caller, not a sync-layer concern) | **High, currently** — this is a real, exploitable gap the moment any caller is wired to `refund()`, independent of the order-sync question this task answers |
| 2 | Fake webhook triggering refund status | HMAC signature verification (already required, unconditionally, before any event processing) — and moot today regardless, since the webhook currently never reaches a refund status write at all (WEBHOOK_TERMINAL_GUARD) | None needed beyond the existing HMAC gate, if/when the webhook path is ever opened up | None currently reachable |
| 3 | Refund replay | Sequentially: `tx.status !== SUCCEEDED` guard (REFUND_IDEMPOTENCY) | A real idempotency mechanism (row lock or a dedicated unique constraint) — not proposed as an implementation here, only identified as a gap | **Real** — a genuine concurrent-race double-refund is currently possible if `refund()` is ever called concurrently for the same transaction |
| 4 | Partial refund abused to bypass amount checks | **None** — `input.amount` is never validated against `tx.amount` (REFUND_AMOUNT) | Server-side validation capping cumulative refunds at the original amount — not implemented here | **Real**, same prerequisite-gap class as #1 |
| 5 | Refund triggering Order cancellation incorrectly | `decideOrderSyncAction`'s own decision matrix (3.6C.1, unmodified) — only `pending`/`preparing`/`ready` orders are ever cancelled by a refund; `completed` orders are explicitly `unsupported`, never forced | None needed — already correctly scoped by the existing, tested decision function | None, provided the sync is only ever triggered from a *verified* refund (which #1's gap currently undermines — a wrongly-triggered refund would still correctly gate its *order* consequence via 3.6C.1, but the *payment* consequence itself would already be wrong) |
| 6 | Race between staff Order completion and refund sync | The `enforce_order_transition` trigger itself (unmodified) — whichever `UPDATE` commits first wins, the other is either valid against the new state or rejected with `invalid_order_transition`, already gracefully classified by 3.6C.2 | None needed — already correctly handled | None beyond the already-accepted, symmetric race outcome documented in 3.6C-A/3.6C.1-2 |
| 7 | Refund on non-existent payment | `if (!tx) throw ...` — a clear, immediate rejection | None needed | None |
| 8 | Refund on already-refunded payment | `tx.status !== SUCCEEDED` guard rejects it (status would be `'refunded'`, not `'succeeded'`) | None needed for the sequential case; see #3 for the concurrent case | Same as #3 |

---

# SCOPE_PROPOSAL

Derived from the actual findings — narrower than a naive template, since several "prerequisite" gaps (#1, #3, #4 above) belong to hardening `refund()` itself, not to the sync-wiring question this audit was scoped to answer:

### 3.6C.3.1 — `syncOrderStatusFromPayment` call site in `paymentService.refund()`
- **Objective**: one new call, immediately after `refund()`'s existing successful `UPDATE`, to the already-existing, unmodified 3.6C.2 service.
- **Files**: `paymentService.js` — the **one** legitimate, minimal touch point this audit identifies for the sync question specifically (not the webhook).
- **DB changes**: none.
- **Dependencies**: none beyond what already exists (3.6C.2).
- **Risk**: low, in isolation — but see 3.6C.3.0 below, which should logically precede it.

### 3.6C.3.0 — (Prerequisite, not part of "the sync wiring" itself) Harden `refund()`'s own gaps
- **Objective**: address the tenant-isolation (#1), amount-validation (#4), and concurrent-idempotency (#3) gaps found in this audit — **none of which are about order-sync at all**, and all of which are real regardless of whether 3.6C.3.1 is ever added.
- **Files**: `paymentService.js`.
- **DB changes**: possibly a new guard mechanism for #3 (e.g., a row lock or a dedicated constraint) — needs its own dedicated design, not assumed safe to add casually.
- **Dependencies**: none.
- **Risk**: this is genuinely separate work from "wire the sync" and should not be silently bundled into a task titled "refund sync integration" — flagging it as its own, explicitly separate scope item is itself part of this audit's finding.

### 3.6C.3.2 — Webhook terminal-guard carve-out + `RECOGNIZED_UNHANDLED` re-routing (optional, deferred)
- **Objective**: if/when real Moyasar webhook payload verification (G-6) becomes possible, narrow the terminal guard for `succeeded→refunded` specifically and route `payment_refunded` to use the existing, already-correct status-mapping instead of `RECOGNIZED_UNHANDLED`.
- **Dependencies**: G-6 (real Moyasar sandbox/webhook payload access) — not resolvable by any task in this session.
- **Risk**: touches the webhook's core idempotency/terminal logic — deserves its own focused, separately-reviewed task (consistent with this session's established caution around this specific file).

### 3.6C.3.3 — Tests
- **Objective**: unit tests for the new call site (3.6C.3.1) using the established `makeChain`/`makeDb` mocking pattern — verifying `syncOrderStatusFromPayment` is called with the correct `paymentTransactionId` after a successful refund, and that a failure in the sync call doesn't prevent `refund()`'s own successful return (mirroring the FAILURE_ISOLATION principle already established for the webhook in 3.6C-A).
- **Dependencies**: 3.6C.3.1.

**Not proposed anywhere in this scope**: any change to the order state machine, any new order status, any change to `create_order`, any reconciliation job, any refund UI/authorization endpoint (that's separate, larger work this audit only confirms doesn't exist yet).

---

# BLOCKERS

None for implementing 3.6C.3.1 specifically (the sync call site) — it can be added safely today, in isolation, exactly as scoped. **A real blocker exists for treating `refund()` as safe to expose to any actual caller** (3.6C.3.0's items: tenant isolation, amount validation, concurrent idempotency) — but this is a pre-existing gap in `refund()` itself, not something 3.6C.3's narrow sync-wiring task needs to resolve to be correct on its own terms.

# RISKS

- Adding 3.6C.3.1 without also addressing 3.6C.3.0 would mean the *sync* is correct the moment `refund()` is ever actually called, but `refund()` itself remains unsafe to call from anywhere real — an easy trap for a future task to fall into (assuming "the sync is wired, therefore refunds are ready") if this distinction isn't kept explicit.
- The new G-5-equivalent gap (FAILURE_ISOLATION) means a real refund could, in a narrow failure window, leave the local system's payment status stale relative to what Moyasar's own records show — not fixed here, consistent with instruction, but should be tracked alongside G-5 for whatever future task addresses both.
- The webhook path (Option A) remains attractive long-term (it's the *provider's own* authoritative signal, rather than trusting this system's own `refund()` call to have actually succeeded) but requires real-traffic verification this session has never had access to (G-6) — not a reason to avoid Option B now, but a reason not to consider the refund-sync question "fully" solved until the webhook path is eventually opened up too.

---

# REPORT_FILE

`reports/TASK_3_6C_REFUND_A_REFUND_ARCHITECTURE_AUDIT.md`

# DOWNLOAD_COPY

`/sdcard/Download/TASK_3_6C_REFUND_A_REFUND_ARCHITECTURE_AUDIT.md` (copied and checksum-verified after this report was written).

# NEXT_STEP

Owner decision needed on scope: proceed with 3.6C.3.1 alone (wire the sync call into `refund()`, leaving `refund()`'s own tenant/amount/idempotency gaps explicitly unaddressed and undocumented-as-acceptable-for-now), or require 3.6C.3.0 (hardening `refund()` itself) first/alongside it. No implementation begins without separate, explicit instruction, per this task's strict stop list.

---

*Report generated 2026-08-26. Architecture analysis only — no code written, no schema modified, no migration created, no deployment, no Moyasar call, no refund call, no commit, no push.*
