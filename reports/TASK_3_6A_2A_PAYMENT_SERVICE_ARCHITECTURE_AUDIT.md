# Task 3.6A-2A — Existing Payment Service Architecture Audit

**Read-only. No code, schema, or database was changed. No Moyasar call was made. No payment transaction was created.**

---

# EXECUTIVE SUMMARY

`paymentService.startCharge` is the sole write path to `payment_transactions` (confirmed by repository-wide search — the webhook handler only ever `UPDATE`s it, never `INSERT`s). Its public API is stable, unmodified since it was built (Task 3.3), and already accepts a generic `metadata` object — meaning the Task 3.6A-1b.2 snapshot builder has a ready, already-existing integration point (`input.metadata = { checkout: snapshot }`) requiring **zero changes to `paymentService.js` itself**. The amount-unit chain was traced end-to-end from actual code, not assumed: `create_order`'s dry-run `total` (SAR) → `payment_transactions.amount` (SAR, confirmed by schema `CHECK (amount >= 0)` with no unit hint, and by `paymentService` storing `input.amount` verbatim) → `MoyasarAdapter.createCharge`'s explicit `Math.round(input.amount * 100)` conversion to halalas, applied exactly once, exactly at the provider boundary. **No conversion is missing or duplicated anywhere in this chain** — verified directly, not inferred.

One real, already-documented, still-open gap governs this task's risk profile: **G-5** — `paymentService.startCharge`'s final `UPDATE` (recording a successful Moyasar charge's `provider_ref`/`status`) has no `try/catch`; a failure there leaves a row stuck at `status='initiated'`, `provider_ref=NULL`, with **no existing reconciliation mechanism** (3.6E, not yet built). This is not new — it was found and scoped in the Task 3.6 Scope Audit, before any of this session's 3.6A-1x work began, and remains exactly as documented.

**Verdict: `PAYMENT_SERVICE_AUDIT_READY_WITH_WARNINGS`** — the architecture is fully traceable and 3.6A-2 is buildable without any blocking unknown, but G-5's absence of reconciliation is a standing, real risk that 3.6A-2 will make reachable in practice for the first time (today it's a live but never-triggered code path, since `startCharge` has zero real callers).

---

# PAYMENT SERVICE INVENTORY

**Public API, traced from actual implementation, `src/payments/services/paymentService.js`** (unmodified since Task 3.3; confirmed identical to every prior read this session via `git diff --stat`):

| Export | Kind | Purpose |
|---|---|---|
| `paymentService.startCharge(input, {db})` | async method | Creates a `payment_transactions` row, calls the provider adapter, records the result |
| `paymentService.confirmCharge(providerRef, {db})` | async method | Re-queries provider status for a known `provider_ref`, updates the row |
| `paymentService.handleWebhookEvent(event, {db})` | async method | Records + processes a webhook event (idempotent via `payment_webhook_events` unique constraint) |
| `paymentService.refund(input, {db})` | async method | Issues a refund via the adapter, updates the row to `refunded` |

**Real callers today**: `confirmCharge` and `handleWebhookEvent` have zero real callers (the live webhook Edge Function, per its own code comment, does **not** import `paymentService.handleWebhookEvent` — Deno bare-specifier incompatibility, confirmed in earlier session tasks — it re-implements the equivalent logic directly in `handler.js`). `startCharge` and `refund` have **zero real callers anywhere in the application** — confirmed again this task via repository-wide search; only their own unit tests invoke them.

**Provider selection**: `getAdapter(provider)` (`src/payments/adapters/index.js`), a simple registry lookup (`{moyasar: new MoyasarAdapter()}`), throws if the key isn't registered. `startCharge` defaults `provider = input.provider ?? 'moyasar'` if not specified.

**Logging**: none — no `console.log`/structured logging anywhere in `paymentService.js` or `moyasar.js`. Errors are only ever thrown or returned, never separately logged.

**Metadata handling**: see METADATA BEHAVIOR below.

**Transaction handling**: no database-transaction wrapping (`BEGIN`/`COMMIT`) anywhere in `startCharge` — each Supabase call (`SELECT`, `INSERT`, `UPDATE`) is its own independent statement/round-trip. This is the structural root of G-5 (see G-5 PARTIAL FAILURE HANDLING).

**Idempotency behavior**: see IDEMPOTENCY (PAYMENT-LEVEL) below.

---

# STARTCHARGE CONTRACT

Exact input shape, from the actual function signature and body (`startCharge(input, { db })`):

| Field | Classification | Behavior |
|---|---|---|
| `input.restaurantId` | **REQUIRED** | `if (!input?.restaurantId) throw new Error(...)` |
| `input.amount` | **REQUIRED** | `if (!input?.amount \|\| input.amount <= 0) throw new Error(...)` — must be a positive number |
| `input.currency` | **REQUIRED** | `if (!input?.currency) throw new Error(...)` |
| `input.invoiceId` | **OPTIONAL** | Defaults to `null`; stored on the row (nullable FK to `invoices`) |
| `input.idempotencyKey` | **OPTIONAL** | Auto-generated via `newIdempotencyKey('pay')` if omitted |
| `input.metadata` | **OPTIONAL** | Defaults to `{}`; stored on the row, passed through to the adapter, re-merged (see METADATA BEHAVIOR) |
| `input.returnUrl` | **OPTIONAL** | Passed to `adapter.createCharge` as `returnUrl`; not itself stored as a top-level column (only surfaces back via `chargeResult.redirectUrl` → `metadata.redirect_url`) |
| `input.provider` | **OPTIONAL** | Defaults to `'moyasar'` |
| `db` (second arg) | **REQUIRED** | Supabase client with `service_role` privilege — the function's own header comment states RLS requires `is_platform_admin()`, so `db` must already carry that authority; the function does not select/create it itself |
| Any other field (e.g. `customerName`, `customerPhone`) | **IGNORED** | Not read anywhere in the function body — silently has no effect |
| `payment_transaction_id` / anything order-related | **UNSUPPORTED** | Not a `startCharge` concept at all — the linkage to an order happens later, at `create_order`'s own `p_payment_transaction_id` parameter, using the `transactionId` this function returns; `startCharge` has no awareness of orders |

**Return value** (success): `{transactionId, providerRef, status, redirectUrl, idempotent: false}`. **Return value** (idempotent replay — same `idempotencyKey` already exists): `{transactionId, providerRef, status, redirectUrl, idempotent: true}` — **no new provider call is made** in this case; the adapter is never invoked.

**Error behavior**: throws a plain `Error` (not a typed/structured error object) for validation failures, for an `INSERT` failure, and re-throws whatever the adapter throws for a provider-call failure (after first marking the row `FAILED`). No error code taxonomy exists at this layer — see ERROR TAXONOMY.

---

# PAYMENT TRANSACTION CREATION FLOW

**Who creates the row?** `paymentService.startCharge` exclusively — confirmed by a repository-wide search for every `.from('payment_transactions')`/`insert(` occurrence: the only `INSERT` into this table anywhere in the codebase is `paymentService.js:44`. The webhook (`supabase/functions/payment-webhook/handler.js`) only ever `UPDATE`s an existing row (`:186`, `:226`) or `SELECT`s it — never creates one. No RPC creates it (`create_order` only ever *reads* `payment_transactions` to validate `p_payment_transaction_id`, never writes to it). No dedicated "checkout service" exists yet — that's exactly what 3.6A-2 is.

**Exact sequence, traced from the actual code** (`startCharge`):
```
1. Validate input (restaurantId, amount>0, currency) — throws immediately if invalid, no DB call yet.
2. SELECT payment_transactions WHERE idempotency_key = idemKey  (idempotency pre-check)
   → if found: return early, idempotent:true, adapter is NEVER called.
3. INSERT payment_transactions (status='initiated', provider_ref=NULL, ...)   ← Payment Transaction FIRST
4. adapter.createCharge(...)                                                  ← Provider call SECOND
5a. On error: UPDATE status='failed', failure_reason=err.message; rethrow.
5b. On success: UPDATE provider_ref, status, raw, metadata (redirect_url appended).  ← UNGUARDED (G-5)
```

**Sequence confirmed: Payment Transaction row → Provider call**, not the reverse. This means the row (in `status='initiated'`) exists before Moyasar is ever contacted — a deliberate, already-correct design (it guarantees an attempt is recorded even if the network call never completes), but it is also exactly what makes step 5b's unguarded write dangerous: if it fails, the row is stuck in a state (`initiated`, no `provider_ref`) that looks identical to "the provider call never happened," even though it actually succeeded.

---

# PAYMENT TRANSACTION SCHEMA

**Re-verified live against Production in this task — not assumed unchanged from Task 3.6A-1a's audit**:

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `restaurant_id` | uuid | NO | — |
| `invoice_id` | uuid | YES | — |
| `provider` | text | NO | — |
| `provider_ref` | text | YES | — |
| `status` | text | NO | `'initiated'` |
| `amount` | numeric | NO | — |
| `currency` | text | NO | `'SAR'` |
| `failure_reason` | text | YES | — |
| `idempotency_key` | text | YES | — |
| `metadata` | jsonb | NO | `'{}'::jsonb` |
| `raw` | jsonb | YES | — |
| `created_at` | timestamptz | NO | `now()` |
| `updated_at` | timestamptz | NO | `now()` |

**Constraints** (re-verified live via `pg_constraint`):
- `payment_transactions_amount_check`: `CHECK (amount >= 0)`
- `payment_transactions_status_check`: `CHECK (status IN ('initiated','pending','succeeded','failed','cancelled','refunded'))` — matches `TransactionStatus` exactly
- FKs: `invoice_id → invoices(id) ON DELETE SET NULL`, `provider → payment_providers(key)`, `restaurant_id → restaurants(id) ON DELETE CASCADE`

**Indexes** (re-verified live):
- `uq_paytx_idempotency_key` — **still exists, unique partial** (Task 3.6F, confirmed unchanged)
- `uq_paytx_provider_ref` — **unique partial on `(provider, provider_ref) WHERE provider_ref IS NOT NULL`** — an existing safeguard not previously highlighted in this session's reports: prevents two `payment_transactions` rows from ever sharing the same provider-assigned reference
- `idx_paytx_restaurant`, `idx_paytx_invoice` — plain lookup indexes

**`orders.payment_transaction_id` uniqueness — re-verified, still valid**: `orders_payment_transaction_id_uidx`, unique partial, unchanged since Task 3.5. `orders.idempotency_key`'s own unique index (`orders_idempotency_key_uidx`) is also confirmed still present, unchanged.

**Nothing has changed in this schema since Task 3.6A-1a** — every column, constraint, and index matches exactly.

---

# METADATA BEHAVIOR

**Exact write behavior, traced from `startCharge`'s actual code**:
1. INSERT time: `metadata: input.metadata ?? {}` — whatever the caller passes, stored verbatim.
2. Post-provider-call time: `const meta = { ...(input.metadata ?? {}) }; if (chargeResult.redirectUrl) meta.redirect_url = chargeResult.redirectUrl` then `UPDATE ... metadata: meta`.

This is a **full-column replace**, not a partial JSON merge (Postgres `UPDATE ... SET metadata = $1` replaces the whole value) — but the **replacement value itself is built by spreading the original `input.metadata` first**, so any key the caller set (e.g. a `checkout` sub-key holding a Task 3.6A-1b.2 snapshot) survives this second write unless something else later performs an actual overwrite. **Nothing else in the codebase writes to `payment_transactions.metadata` at all** — confirmed: the webhook handler's `UPDATE`s never touch `metadata`, only `status`/`updated_at` (and `raw` isn't `metadata` either — separate column).

**Is metadata ever ignored or overwritten unpredictably?** No — its behavior is fully deterministic and traceable to exactly these two lines of code, both inside `startCharge`, both already read in full.

**Safest integration point for a Checkout Snapshot** (identification only, per this task's explicit "do NOT implement" instruction): **the caller of `startCharge` must pass `input.metadata = { checkout: <buildCheckoutSnapshot(...) result> }`** — no change to `paymentService.js` is required, because it already accepts and correctly preserves an arbitrary `metadata` object through both of its writes.

---

# MOYASAR ADAPTER CONTRACT

`src/payments/adapters/moyasar.js`, `MoyasarAdapter extends PaymentAdapter` (abstract contract in `src/payments/contracts/PaymentAdapter.js`, all methods throw "not implemented" — a documentation-only base class, no shared logic).

| Method | Required input | Optional input | Returns |
|---|---|---|---|
| `createCharge(input)` | `input.amount` (number, SAR — see AMOUNT UNIT VERIFICATION), `input.idempotencyKey`, `input.restaurantId` | `input.returnUrl` (defaults `''`) | `{providerRef, status, redirectUrl, raw}` |
| `verifyPayment(providerRef)` | `providerRef` (string) | — | `{providerRef, status, redirectUrl, raw}` |
| `parseWebhook(payload, headers)` | `payload` | — | `{eventId, type, providerRef, status, raw}` (sync, not async) |
| `refundPayment(input)` | `input.providerRef` | `input.amount` (partial refund), `input.reason` | `{refundRef, status, raw}` |

**Currency handling**: `createCharge`'s request body **hardcodes `currency: 'SAR'`** — it does **not** read `input.currency` at all, despite `CreateChargeInput`'s typedef declaring a `currency` field. This is a real, existing fact worth flagging precisely: `paymentService.startCharge` requires and stores `input.currency` (used for the `payment_transactions.currency` column), but the actual value sent to Moyasar is always the literal `'SAR'`, regardless of what `startCharge` was called with. In the currently single-currency system this produces no incorrect behavior (both always resolve to `'SAR'` today), but it means `MoyasarAdapter.createCharge` does not currently generalize to a second currency without a code change — noted as a fact, not something this audit is asked to fix.

**Amount unit**: see AMOUNT UNIT VERIFICATION.

**Error handling**: `_handleResponse` throws a plain `Error` for any non-2xx response — `5xx` → `Moyasar server error {status}`; `4xx` → `Moyasar error {status}: {message}` (parsed from the response body, falling back to the raw body text). Network-level failures (`fetch` itself throwing, e.g. DNS/connection failure) are caught and rethrown as `Moyasar network error: {message}`. **No retry logic of any kind exists** — a single failed call is a single thrown error, propagated straight up to `startCharge`'s `catch` block.

**Webhook interaction**: `parseWebhook` is synchronous, pure (no network call), and does not itself interact with idempotency — event-ID-based idempotency is enforced entirely by the caller (the webhook `handler.js`'s `INSERT` into `payment_webhook_events`, relying on its own unique constraint), not inside the adapter.

**Idempotency interaction**: `createCharge` forwards `idempotencyKey` into the request `metadata.idempotency_key` field sent to Moyasar (**not** as a dedicated Moyasar-native idempotency header/parameter — it's just embedded in the free-form `metadata` object Moyasar stores alongside the charge) — this means Moyasar itself is **not** being asked to deduplicate the charge; deduplication is enforced entirely on SimSim's own side, via `startCharge`'s pre-check `SELECT ... WHERE idempotency_key = idemKey` plus the DB-level `uq_paytx_idempotency_key` unique index.

**Not called, not modified** — this entire section was produced by static code reading only.

---

# AMOUNT UNIT VERIFICATION

**Traced end-to-end from actual code — fully consistent, no gap, no ambiguity.**

| Point in the chain | Unit | Evidence |
|---|---|---|
| `create_order` dry-run `total` | **SAR (major units)** | `sql/order_dry_run_pricing.sql`: `v_total := round(v_discounted_gross + v_delivery_fee, 2)` — all upstream arithmetic (product `price`, VAT backing-out `/1.15`, delivery fee) operates in whole/decimal SAR throughout; a 6.00 total for a 6 SAR product, confirmed repeatedly in this session's live testing |
| `payment_transactions.amount` | **SAR** | `payment_transactions_amount_check: CHECK (amount >= 0)` carries no unit hint itself, but `paymentService.startCharge` stores `amount: input.amount` **verbatim, no conversion** — so its unit is whatever `input.amount` is, which is established as SAR by the next row |
| `paymentService.startCharge`'s `input.amount` | **SAR** | Passed straight through to `adapter.createCharge({amount: input.amount, ...})` with **no conversion inside `paymentService.js`** — confirmed by direct code reading, zero arithmetic on `amount` anywhere in that file |
| `MoyasarAdapter.createCharge`'s `input.amount` | **SAR (interpreted), converted to halalas for the wire** | `moyasar.js:51`: `amount: Math.round(input.amount * 100), // تحويل SAR إلى هللة` — **an explicit, already-existing, already-commented `*100` conversion**, applied exactly once, exactly at the point of building the actual Moyasar API request body |
| Moyasar API's expected wire format | **Halalas (smallest currency unit)**, per the adapter's own existing, already-implemented assumption | Not independently re-verified against live Moyasar docs in this task (explicitly out of scope: "based on existing implementation only — do not fetch docs") — but this is not a new assumption invented for this audit; it is the adapter's own pre-existing, already-shipped, already-tested code (`MoyasarAdapter.test.js` already exercises `createCharge` and asserts on the request body, per this session's Task 3.4 work) |

**Conclusion: the conversion exists, is applied exactly once, at exactly the correct boundary (the outermost edge, immediately before the HTTP request), and every other point in the chain — `create_order`, `payment_transactions.amount`, `paymentService`'s own handling — consistently operates in SAR with no unit confusion.** This is **not** ambiguous or unverifiable from existing code; it is fully traceable. **`AMOUNT_UNIT_VERIFICATION_REQUIRED` is not triggered** — the required verification was performed and resolved with direct evidence.

---

# IDEMPOTENCY (PAYMENT-LEVEL)

Distinct from order idempotency (already audited separately, Task 3.6A-1a.1):

- **Generation**: `input.idempotencyKey ?? newIdempotencyKey('pay')` — if the caller doesn't supply one, `paymentService` generates one itself (`` `pay_${crypto.randomUUID() or Date.now()-Math.random() fallback}` ``, per `src/payments/utils/index.js`). **This means, unlike order idempotency (always caller-supplied, `useCart.js`), payment idempotency has a safe internal default.**
- **Uniqueness enforcement**: DB-level, `uq_paytx_idempotency_key` (unique partial index, re-verified live, present since Task 3.6F).
- **Retry-safety**: `startCharge`'s own pre-check (`SELECT ... WHERE idempotency_key = idemKey`) means a retried call with the **same** key returns the existing row's data (`idempotent: true`) **without calling the adapter again** — genuinely safe against duplicate provider charges, *for retries that reuse the same key*.
- **What happens on duplicate submission** (same key, concurrent): the `SELECT`-then-`INSERT` pattern is not itself atomic — two concurrent calls with the same brand-new key could both pass the `SELECT` (finding nothing) before either `INSERT`s, then race at the `INSERT`; the DB-level `uq_paytx_idempotency_key` index would reject the second `INSERT` with a `23505` unique-violation, but **`startCharge`'s `INSERT` has no `try/catch` around it either** — `if (insertErr) throw new Error(...)` treats ANY insert error (including a legitimate idempotency-race unique-violation) as a generic failure, not as "someone else already has this in flight, return their row" — meaning a genuine concurrent-retry race would surface as a thrown error to the second caller, not a graceful idempotent response. This is a real, narrow, previously-undocumented (in this session) behavioral gap — noted under RISK ANALYSIS.
- **What happens on partial failure** (Payment Transaction created, Moyasar call fails): handled correctly today — `catch` block marks the row `FAILED` with `failure_reason` — **this specific case already has a safety net.** The dangerous partial-failure case is the *other* one: Moyasar succeeds, then the local DB write fails (G-5, next section).

---

# G-5 PARTIAL FAILURE HANDLING

**Located, not newly discovered — already documented in `reports/TASK_3_4_3_5_PAYMENT_FLOW_GAP_AUDIT.md` and `reports/TASK_3_6_SCOPE_ARCHITECTURE_AUDIT.md`, both from earlier in this session, before any 3.6A-1x work began.** Re-confirmed against the current, unmodified `paymentService.js` in this task: still present, unchanged.

**Exact failure mode**: `startCharge`'s final `UPDATE` (recording `provider_ref`, `status`, `raw`, `metadata` after a successful `adapter.createCharge` call) has **no `try/catch`**. If this `UPDATE` itself fails (network blip, RLS misconfiguration, transient DB error — anything), the exception propagates uncaught out of `startCharge`, while:
- The customer's card **has already been charged** (Moyasar's own `createCharge` call succeeded).
- The `payment_transactions` row remains at `status='initiated'`, `provider_ref=NULL` — **indistinguishable, by row inspection alone, from "the provider call was never attempted."**

**Current behavior**: **no rollback** (nothing to roll back — the row already exists from step 3, and Moyasar's own charge is external, uncancelable via this failure path), **not marked failed** (the `catch` block that marks `FAILED` only wraps the `adapter.createCharge` call itself, not this later `UPDATE`), **left orphaned** — exactly as the prior audits already concluded, re-confirmed here from the same, unchanged source. **No retry mechanism exists for this specific `UPDATE`.**

**Existing recovery path**: **none, today.** The already-scoped fix (3.6E, "Failure Recovery — G-5 reconciliation") — a `pg_cron`-scheduled sweep of `status='initiated'` rows older than some threshold, calling the **already-implemented-but-uncalled** `paymentService.confirmCharge`/`MoyasarAdapter.verifyPayment` to reconcile against Moyasar's own record — is fully designed in the prior scope audit but **not implemented, not scheduled, no migration written.**

**Why this matters specifically for 3.6A-2**: today, `startCharge` has zero real callers, so this code path, while live, has never been exercised by a real transaction. **3.6A-2 is the task that will make it reachable for the first time.**

---

# ERROR TAXONOMY

| Layer | Pattern | Detail |
|---|---|---|
| `paymentService.startCharge` input validation | Thrown plain `Error`, synchronous, before any DB/network call | `restaurantId`/`amount`/`currency` checks |
| `paymentService.startCharge` INSERT failure | Thrown plain `Error`, wraps the Supabase error message | `if (insertErr) throw new Error(\`startCharge: فشل إنشاء المعاملة — ${insertErr.message}\`)` — **does not distinguish a unique-violation (idempotency race) from any other insert failure** (see IDEMPOTENCY above) |
| `paymentService.startCharge` provider-call failure | Caught, row marked `FAILED` + `failure_reason`, then **rethrown** (`throw err`) | Caller still receives the original adapter error |
| `paymentService.startCharge` post-success UPDATE failure | **Uncaught** — propagates directly | This is G-5 |
| `MoyasarAdapter._handleResponse` | Thrown plain `Error`, message includes HTTP status + provider message (4xx) or generic (5xx) | No distinction encoded as an error *type/class* — just message text; a caller wanting to branch on "was this a card decline vs. a network error vs. a 5xx" would have to parse the message string |
| `MoyasarAdapter._get`/`_post` network failure | Caught (the `fetch` call itself throwing), rethrown as `Moyasar network error: {message}` | |
| Timeout handling | **None anywhere in `paymentService.js` or `moyasar.js`** | No `AbortController`, no timeout wrapper around `fetch` — an unresponsive Moyasar endpoint would hang until the platform's own outer timeout (if any) intervenes. (Note: `src/lib/asyncTimeout.js`'s `withTimeout` exists and is already used for `create_order` in `useCheckout.js`, but is **not** used anywhere in the payments module today.) |
| Retry logic | **None anywhere** — a single failed provider call is a single thrown error; no automatic retry at any layer |

No error is ever silently swallowed except the one specific, already-documented, already-correct case: `startCharge`'s idempotency pre-check simply returns the existing row when a duplicate key is found — that's a designed short-circuit, not a swallowed error.

---

# CHECKOUT BINDING INTEGRATION POINT

Using `src/payments/checkoutBinding.js` (Task 3.6A-1b.1/1b.2, unmodified):

**Safest point, identified (not implemented)**: **immediately before calling `paymentService.startCharge`**, in the future orchestration layer (3.6A-2 itself). Concretely:
```
1. Call create_order(p_dry_run=true) → dryRunResult (subtotal/tax/delivery_fee/total)
2. Call buildCheckoutSnapshot({ checkoutInput, dryRunResult, currency, quotedAt }) → snapshot
   (currency: the orchestration layer's own constant/source, per 3.6A-1b.2's resolution;
    quotedAt: new Date().toISOString(), captured at this exact point)
3. Call paymentService.startCharge({ restaurantId, amount: dryRunResult.total, currency, metadata: { checkout: snapshot }, ... }, { db })
```

**Required inputs at that point**: the raw client checkout request (for `checkoutInput`), the `create_order(p_dry_run=true)` result (for both the amount and `dryRunResult`), and a `db` client carrying `service_role`/admin authority (already how `startCharge` is invoked, per its own header comment — an Edge Function today, or whatever server-side context 3.6A-2 runs in).

**What already exists**: `create_order(p_dry_run=true)` (3.6A-1a, Production-live), `buildCheckoutSnapshot`/`computeCheckoutFingerprint` (3.6A-1b.1/1b.2), `paymentService.startCharge`'s existing, unmodified `metadata` acceptance (this task's own finding — no change needed there).

**What does not exist yet**: any actual code that calls these three functions in sequence — no orchestration service, no Edge Function endpoint, no frontend wiring to trigger it. This is precisely 3.6A-2's scope.

---

# GAP ANALYSIS

For the full target flow — `Client Checkout → create_order(dry_run) → Fingerprint+Snapshot → Payment Transaction → startCharge() → Moyasar Adapter → Provider`:

| Stage | Status | Evidence |
|---|---|---|
| `create_order(p_dry_run=true)` | **ALREADY IMPLEMENTED** | Task 3.6A-1a, Production-live, staging+production verified |
| Fingerprint (`computeCheckoutFingerprint`) | **ALREADY IMPLEMENTED** | Task 3.6A-1b.1, 46 tests, 573/573 regression at completion |
| Snapshot (`buildCheckoutSnapshot`) | **ALREADY IMPLEMENTED** | Task 3.6A-1b.2, 33 tests, 606/606 regression at completion |
| `payment_transactions` row creation | **ALREADY IMPLEMENTED** (as a capability) | `paymentService.startCharge`, live code, tested — but **never invoked by anything except its own tests** |
| Metadata → snapshot storage convention | **ALREADY IMPLEMENTED** (as a capability), **NOT YET USED** | `startCharge` already correctly preserves `input.metadata` through both writes (this task's own finding) — no caller has ever exercised this path with real checkout-snapshot content |
| `paymentService.startCharge()` invocation from a real checkout flow | **NOT IMPLEMENTED** | Zero real callers, confirmed |
| `MoyasarAdapter` | **ALREADY IMPLEMENTED** | Task 3.2/3.4, live code, unit-tested, amount-unit-verified (this task) |
| Actual provider call in a real flow | **NOT IMPLEMENTED** | Same reason — `startCharge` (which is what would call the adapter) is never invoked live |
| Orchestration connecting all of the above into one flow | **NOT IMPLEMENTED** | This is 3.6A-2's entire scope |
| G-5 reconciliation (partial-failure safety net) | **NOT IMPLEMENTED** | 3.6E, scoped but not built, per the prior Scope Audit |
| Payment→Order status sync (G-4) | **NOT IMPLEMENTED** | Also scoped but not built in the prior Scope Audit — relevant once an order actually gets created from a paid transaction |
| Checkout UX (loading/success/failure/retry states) | **NOT IMPLEMENTED** | Also prior-scoped, not built |

**Summary**: every individual *component* the target flow needs already exists and is independently tested. **Nothing wires them together yet** — that is exactly, and only, 3.6A-2's job.

---

# RISK ANALYSIS

Concrete risks specifically for 3.6A-2's implementation, derived from the evidence above:

- **Double payment**: mitigated by `startCharge`'s existing idempotency pre-check + `uq_paytx_idempotency_key`, **provided 3.6A-2's orchestration layer reliably reuses the same `idempotencyKey` across retries of the same checkout attempt** (e.g., derived deterministically from the cart, or persisted client-side across a page reload) — a real design decision 3.6A-2 must make, not automatically solved by `paymentService` alone.
- **Double order**: already closed at the `create_order` layer (`orders_payment_transaction_id_uidx`, `orders.idempotency_key`) — not a new risk introduced by 3.6A-2, provided it correctly reuses `payment_transaction_id` when linking.
- **Mismatched amount**: closed by construction if 3.6A-2 follows the CHECKOUT BINDING INTEGRATION POINT sequence exactly (amount always sourced from the same `dryRunResult.total` used for the snapshot) — a risk only if 3.6A-2's implementation deviates from that sequence.
- **Currency mismatch**: low risk today (single-currency system, `MoyasarAdapter` hardcodes `'SAR'` regardless of `input.currency`) but **a latent inconsistency** — if `startCharge` is ever called with a non-SAR `currency`, the stored `payment_transactions.currency` and the amount actually charged via Moyasar (`'SAR'` sent, regardless) would silently disagree. Not exploitable today (nothing produces a non-SAR currency anywhere in this codebase), but worth 3.6A-2 hardcoding/asserting `'SAR'` explicitly rather than trusting an unvalidated pass-through.
- **Lost checkout binding**: mitigated by storing the snapshot in `metadata` at `startCharge`'s INSERT time (survives the later `UPDATE`, per METADATA BEHAVIOR) — but **only if 3.6A-2 actually does this**; nothing forces it structurally.
- **Race conditions**: the concurrent-same-new-key race identified under IDEMPOTENCY (a genuine `23505` unique-violation on `INSERT` is treated as a generic thrown error, not a graceful idempotent response) is a real, narrow risk 3.6A-2's error handling should account for, even though `paymentService.js` itself isn't being modified.
- **Webhook desync**: the webhook only ever updates `status`/`raw`, never `metadata` — so a checkout snapshot, once stored, is never disturbed by webhook processing. No new desync risk from this specific interaction.
- **Partial failure states**: G-5 (Moyasar succeeds, local `UPDATE` fails) is the single largest concrete risk 3.6A-2 makes reachable for the first time — currently zero mitigation exists (3.6E not built). This does not mean 3.6A-2 cannot be built, but it means a real charge could be lost/unreconciled once 3.6A-2 goes live, until 3.6E is separately implemented.

---

# SCOPE PROPOSAL FOR 3.6A-2

Derived from the actual gaps found above, not forced into a template:

### 3.6A-2.1 — Orchestration input contract
- **Objective**: define exactly what a checkout-orchestration call needs from the client (restaurant/branch/items/coupon/type — i.e., the same shape `create_order`/`checkoutBinding` already expect) and what it returns to the frontend.
- **Dependencies**: none beyond what's already built.
- **Risk**: low — this is a contract-definition task, not new integration code.

### 3.6A-2.2 — create_order(dry_run) → snapshot → payment_transaction wiring
- **Objective**: implement the exact sequence in CHECKOUT BINDING INTEGRATION POINT — dry-run call, `buildCheckoutSnapshot`, `startCharge` invocation with `metadata.checkout` set.
- **Files**: new orchestration module/service; `paymentService.js` **not modified** (this task's key finding).
- **DB changes**: none — writes only through existing `startCharge`.
- **Risk**: idempotency-key generation/reuse strategy across retries needs an explicit decision (see RISK ANALYSIS).

### 3.6A-2.3 — Moyasar invocation wiring (via existing adapter)
- **Objective**: ensure the orchestration layer correctly surfaces `redirectUrl`/`clientSecret` back to the frontend for whatever checkout UX flow is chosen (still not designed, per the prior Scope Audit's CHECKOUT UX section).
- **Dependencies**: 3.6A-2.2.
- **Risk**: none new — `MoyasarAdapter` itself is unmodified and already tested.

### 3.6A-2.4 — Error/G-5-awareness handling
- **Objective**: **not** a fix for G-5 itself (that's 3.6E, separately scoped) — but 3.6A-2's own orchestration layer should handle `startCharge` throwing (network error, provider decline, or the rare `23505` idempotency race) gracefully enough to give the customer a sane retry path, without attempting to solve reconciliation itself.
- **Dependencies**: 3.6A-2.2/2.3.
- **Risk**: scope discipline — must not accidentally grow into implementing 3.6E.

### 3.6A-2.5 — Regression + integration tests
- **Objective**: full test coverage of the new orchestration wiring, using mocked/fake `db` and adapter (matching this session's established synthetic-E2E test patterns), plus a staging-verified dry-run-to-payment-transaction sequence (no real Moyasar call, consistent with every prior task's constraint).
- **Dependencies**: 3.6A-2.2–2.4.

**3.6E (G-5 reconciliation) is explicitly not part of this breakdown** — it remains separately scoped, as it already was before this task, and should be considered before or alongside 3.6A-2 going live with real traffic, not as part of 3.6A-2's own implementation.

---

# BLOCKERS

None for beginning 3.6A-2's design/implementation. The one item that materially affects **production launch readiness** (not implementation feasibility) is G-5's still-missing reconciliation (3.6E) — noted as a warning, not a blocker to building 3.6A-2 itself.

# WARNINGS

1. **G-5 remains unmitigated** and will become reachable in practice once 3.6A-2 gives `startCharge` a real caller — carried forward from the pre-existing Scope Audit, not newly introduced.
2. **Concurrent same-new-idempotency-key race** (`23505` on `INSERT` surfaces as a generic thrown error, not a graceful idempotent response) — a narrow, previously-undiscussed-in-this-session behavioral detail, relevant to 3.6A-2.4's error handling.
3. **`MoyasarAdapter.createCharge` hardcodes `currency: 'SAR'`**, ignoring `input.currency` — harmless today (single-currency system) but a latent inconsistency worth 3.6A-2 being explicit about rather than assuming `input.currency` flows all the way through.
4. **No timeout handling anywhere in the payments module** — `src/lib/asyncTimeout.js`'s `withTimeout` exists and is used elsewhere (`create_order` calls) but not here; an unresponsive Moyasar endpoint has no bounded wait today.

---

# REPORT_FILE

`reports/TASK_3_6A_2A_PAYMENT_SERVICE_ARCHITECTURE_AUDIT.md`

# DOWNLOAD_COPY

`/sdcard/Download/TASK_3_6A_2A_PAYMENT_SERVICE_ARCHITECTURE_AUDIT.md` (copied and checksum-verified after this report was written).

# NEXT_STEP

Architecture is fully mapped and ready for 3.6A-2's design/implementation to begin, pending your review of the two open, real decisions this audit surfaced: (1) the idempotency-key reuse strategy across checkout retries, and (2) whether 3.6E (G-5 reconciliation) should be built before or alongside 3.6A-2 rather than strictly after it, given 3.6A-2 is what makes G-5 reachable for the first time. No implementation begins without separate, explicit instruction, per this task's strict stop list.

---

*Report generated 2026-08-26. Audit only — no code, schema, or database change; no Moyasar call; no payment transaction created.*
