# Task 3.6D.6-A — Payment-First Order Creation Security Specification

**Specification/audit only. No production code, tests, schema, or deployment changed. No Edge Function created. `createOrderFromSuccessfulPayment` not modified. No 3.6D.6 implementation, 3.6D.7, or 3.6E work started.**

---

# EXECUTIVE_SUMMARY

The payment-first flow is fully built through payment-status resolution (`TASK_3_6D_4_A`/`B`/`B.1`/`B.2`, `TASK_3_6D_4_C.1`–`.3`) and customer-data survival across the Moyasar redirect (`TASK_3_6D_5_A`/`A.1`). The one missing link is the server-side capability that actually triggers order creation once the browser learns the payment succeeded. `createOrderFromSuccessfulPayment` (`src/payments/services/checkoutOrchestration.js:290`, built in `TASK-PAY-3.6B`) already implements the full, correct orchestration logic — payment lookup, status validation, snapshot/fingerprint/amount verification, `create_order` invocation, and a DB-enforced race guard — but has **zero live callers** anywhere in browser-reachable code today.

**Audited**: the function's logic is sound and requires no changes (see `CREATEORDERFROMSUCCESSFULPAYMENT_AUDIT`).

**Recommended: Option A** — a new Edge Function (working name `create-order-from-payment`) that wraps the existing, unmodified `createOrderFromSuccessfulPayment`, invoked with `service_role` from `PaymentFirstCallbackLanding` only after the existing `get_payment_status_by_idempotency_key` RPC (`TASK_3_6D_4_A`/`B`) reports `status = 'succeeded'`. This mirrors the exact architecture decision already made for checkout initiation itself (`payment-first-checkout`, `TASK_3_6D-E`): the orchestration is multi-step JS (snapshot rebuilding, `crypto.subtle.digest` fingerprint verification, a regex-matched race-recovery catch) that would be substantially riskier to re-implement in PL/pgSQL than to call from an Edge Function that already imports it. Full comparison against Option B (new RPC duplicating the logic), Option C (extend the status RPC — not recommended, audit only per this task's own instruction), and Option D (call directly from the browser) is in `ARCHITECTURE_OPTIONS`.

**No schema migration is required.** The exact relationship this capability needs — one `payment_transactions` row ⇒ at most one `orders` row — is already fully enforced today by `orders.payment_transaction_id` + the unique partial index `orders_payment_transaction_id_uidx` (`sql/order_payment_reference.sql:25`), confirmed **applied to production** in `reports/TASK_3_5_PRODUCTION_MIGRATION_EXECUTION_REPORT.md` (line 68: "VERIFIED — unique, partial, correct predicate"; line 209: "migration applied and fully schema-verified"). Note: the `.sql` source file's own header comment still reads "NOT APPLIED TO ANY DATABASE" — that text is stale, written before the owner-approved production execution, and was never updated afterward; it does not reflect current production state. This spec treats the migration-execution report, not the stale file header, as authoritative.

**Core design decision requiring owner approval before implementation**: the request contract must resolve `paymentTransactionId` server-side from `paymentIdempotencyKey` — never accept it from the browser (the browser has never been given this value by any response built so far in this arc). See `REQUEST_CONTRACT` and `OWNER_DECISIONS_REQUIRED`.

---

# CREATEORDERFROMSUCCESSFULPAYMENT_AUDIT

Full re-read of `src/payments/services/checkoutOrchestration.js:290-456` for this task. No behavior described below is inferred — each line cites the exact code.

| Aspect | Finding |
|---|---|
| **Inputs** | `input.paymentTransactionId` (required, throws `TypeError` if absent — line 292-294), `input.expectedRestaurantId` (optional defensive check), `input.customerPhone` (required by `create_order` itself, not enforced by this function directly — see Gap below), `input.tableNumber`/`deliveryAddress`/`customerName`/`notes` (all optional, execution-only). |
| **Authorization** | None performed by this function itself — it is designed to run only under `service_role` (bypasses RLS, see `RLS_ANALYSIS`). It does not check who is calling; the caller (the future Edge Function) is the sole enforcement point for "only the browser holding the right idempotency key may trigger this for that payment." |
| **Payment lookup** | Line 297-301: reads `payment_transactions` by `id` (`.eq('id', input.paymentTransactionId).maybeSingle()`) — server-side, no trust in any client-supplied status. |
| **Status validation** | Line 315-322: `paymentTx.status !== TransactionStatus.SUCCEEDED` ⇒ `rejected/payment_not_successful`. The `status` column is the sole authority; nothing else is consulted. |
| **Amount validation** | Line 367-370: `numericEquals(paymentTx.amount, snapshot.total)` — the amount actually charged (server column) must exactly match the stored snapshot's total. No recomputation, no tolerance, no silent correction either direction. |
| **Currency validation** | Not explicitly re-checked inside this function (the currency was already pinned to `SAR` at charge time by `initiatePaymentFirstCheckout`, `checkoutOrchestration.js:89`). **Gap noted, not fixed here** (out of this task's audit-only scope) — see `RISKS`. |
| **Snapshot validation** | Line 339-343: `paymentTx.metadata?.checkout` must exist and `snapshot.items` must be an array, else `rejected/snapshot_missing`. Line 347-363: fingerprint recomputed via the existing `computeCheckoutFingerprint` and compared to `snapshot.fingerprint`; mismatch ⇒ `rejected/snapshot_invalid` or `snapshot_fingerprint_mismatch`. |
| **Branch validation** | `snapshot.branch_id` is used as-is when calling `create_order` (line 391) — `create_order` itself is the authority that rejects an invalid/inactive branch (unchanged, pre-existing behavior). This function does not duplicate that check. |
| **Restaurant validation** | Line 373-375: `snapshot.restaurant_id !== paymentTx.restaurant_id` ⇒ `rejected/snapshot_restaurant_mismatch` (internal consistency check between the snapshot and its owning payment row). `paymentTx.restaurant_id` (not the snapshot, not the caller) is what is actually passed to `create_order` as `p_restaurant_id` (line 390) — the single strongest-trust source, matching this function's own doc comment (line 273). |
| **Order idempotency** | Two independent layers: (1) app-level pre-check, line 326-336 — `reReadOrderByPaymentTransactionId` returns the existing order as-is if one is already linked, with **zero** re-verification of snapshot/fingerprint/amount (deliberate — the order is already known correct) and **zero** additional `create_order` call. (2) DB-level, see Race conditions below. |
| **Duplicate handling** | Same order returned, marked `idempotent: true` in both the pre-check path (line 334) and the race-recovery path (line 419) — callers cannot distinguish "first success" from "replayed success" except via this flag. |
| **Transaction boundaries** | No explicit multi-statement transaction is opened by this JS function — it relies entirely on `create_order`'s own internal transaction (unchanged, pre-existing PL/pgSQL function) for the order-row + order-items atomicity, and on the DB unique index for the payment↔order atomicity. This function's own "transaction" is really a sequence of independent read-then-write steps; the DB constraint is what makes the *sequence* safe under concurrency, not this function's control flow. |
| **Rollback behavior** | None initiated by this function — a `create_order_failed` (line 424/428) leaves `payment_transactions` completely unchanged (the row was only ever read, never written by this function) and no `orders` row exists. The payment itself is not rolled back or refunded by this path; a failed order-creation attempt after a successful payment is a state this spec's design must handle at the trigger layer (see `IDEMPOTENCY_REQUIREMENTS` scenario 6). |
| **Error behavior** | Every failure path returns a typed `{status, reason, ...}` object — no exception ever escapes past this function's own `try/catch` blocks for `create_order` (line 386-429) or fingerprint computation (line 348-359). The only `throw` is the input-validation `TypeError` at the very top (line 291-294), which happens before any DB I/O. |
| **Webhook interaction** | None — this function never reads or writes anything webhook-related. It only reads `payment_transactions.status`, a column the webhook (`payment-webhook/handler.js:227`) is one of the writers of. See `WEBHOOK_RACE_REQUIREMENTS`. |
| **Race conditions** | Line 382-385's own comment states the design directly: `p_idempotency_key = p_payment_transaction_id = paymentTx.id` is passed to `create_order` (line 401-402), so a **second concurrent call** to this function for the same payment collides with the DB unique index `orders_payment_transaction_id_uidx`, surfaces as a Postgres error matching `ORDER_PAYMENT_RACE_MARKER` (line 23, `/orders_payment_transaction_id_uidx\|payment reference already linked/`), and is caught (line 410-423) to safely re-read and return the winning order — the losing call never errors out to its caller, it returns the same `succeeded`/`idempotent: true` shape as if it had won. |
| **Refresh-safety** | A browser refresh after the trigger call already succeeded hits the app-level pre-check (line 326-336) on any subsequent call with the same `paymentTransactionId` — returns the existing order immediately, no re-verification, no duplicate `create_order` attempt. |
| **Concurrent-tab-safety** | Two tabs calling this function for the same `paymentTransactionId` at the same instant: both may pass the app-level pre-check (a genuine TOCTOU window — the pre-check is a `SELECT`, not a lock), both proceed to `create_order`; the DB unique index is what actually prevents two orders — resolved by the race-recovery catch block described above. The app-level pre-check is a **cost optimization** (skip a doomed `create_order` call when clearly unnecessary), not the actual safety mechanism; the DB constraint is. |
| **Concurrent-webhook-safety** | Not applicable to this function directly — it only reads `payment_transactions.status`; it never races the webhook for a write to that table. The relevant race is between this function's own `create_order` call and nothing else the webhook does (webhook never calls `create_order`, confirmed — see `WEBHOOK_RACE_REQUIREMENTS`). |
| **Known, already-disclosed gap (not introduced by this task)** | The function's own doc comment (line 276) states plainly: *"استرداد الطلب دون وجود متصفّح يبقى مسؤولية 3.6E المستقبلية"* (order recovery without a browser remains a future-3.6E responsibility) — i.e., if the customer's browser never returns after a successful payment (closed tab, crashed, lost connection), **no order is ever created** by this function alone, because nothing else calls it. This is the single most important scenario this spec's trigger design must at least not make worse, and must document honestly as unsolved (see `EXPLICIT_NON_GOALS`). |

**Conclusion: no changes to `createOrderFromSuccessfulPayment` are proposed by this spec.** The function is correctly designed for exactly one new caller to invoke it safely; the work this spec designs is that caller.

---

# PAYMENT_ORDER_RELATIONSHIP_MODEL

```
customer's browser
  │  (holds only: paymentIdempotencyKey — a random opaque string, generated client-side
  │   before charge, TASK-PAY-3.6D.3)
  ▼
payment_transactions
  idempotency_key  (text, unique partial index uq_paytx_idempotency_key)
  id                (uuid, primary key — NEVER given to the browser by any response built so far)
  status            (authoritative: pending | succeeded | failed | ... — TransactionStatus)
  amount, currency  (authoritative — what was actually charged)
  metadata.checkout (the snapshot: restaurant_id, branch_id, type, items, coupon_code,
                      total, fingerprint — captured once, before charge, TASK-PAY-3.6A-1b.1/2)
  │
  │  1 payment_transactions row ⇒ at most 1 orders row
  │  enforced by: orders.payment_transaction_id (nullable FK) +
  │               orders_payment_transaction_id_uidx (unique partial index, WHERE NOT NULL)
  │               sql/order_payment_reference.sql:19-27, applied to production
  ▼
orders
  payment_transaction_id  (links back — the only DB-level proof an order came from this payment)
  id, order_number, order_access_token  (what the browser is ultimately given)
```

The browser never holds `payment_transactions.id`. The only key that survives the full round trip (browser → Moyasar → browser) is `paymentIdempotencyKey`, carried in the `payment_callback` return-URL parameter (`TASK_3_6D_4_C.1`/`.2`, already implemented, unmodified). Any new capability this spec designs must resolve `paymentTransactionId` server-side from that key — the same resolution `get_payment_status_by_idempotency_key` already performs for reads (`sql/payment_status_reads.sql`) and `reReadByIdempotencyKey` performs internally (`checkoutOrchestration.js:39-48`).

---

# AUTHORITATIVE_VS_UNTRUSTED_DATA

| Data | Source of truth | Trust level in this new capability |
|---|---|---|
| `paymentIdempotencyKey` | Browser-supplied (originally generated by browser, `usePaymentIdempotencyKey`) | **Untrusted as a claim, but the only valid lookup key.** Used only to `SELECT` a `payment_transactions` row by exact match — never trusted as proof of anything until the row's own `status` column is read. |
| `paymentTransactionId` | `payment_transactions.id`, resolved server-side from the key above | **Authoritative once resolved — must never be accepted as a request input.** |
| Payment status | `payment_transactions.status` column | **Authoritative.** Written only by `startCharge`/`paymentService` (initial write) and the webhook (`payment-webhook/handler.js:227`, `_handleWebhookEvent`) — never by the browser, never by this new capability itself (this new capability only reads it). |
| Amount / currency | `payment_transactions.amount`/`currency` columns | **Authoritative.** |
| Cart contents / restaurant / branch / type / coupon | `payment_transactions.metadata.checkout` (the snapshot) | **Authoritative** — already fixed at charge time, fingerprint-verified, never re-read from any new request body. |
| `customerPhone` | Browser-supplied via the persisted `simsim_payfirst_customer_{key}` record (`TASK_3_6D_5_A.1`) | **Untrusted, execution-only.** Never influences price, snapshot, or authorization — only where/who the food is handed to. `create_order`'s own validation (`^5[0-9]{8}$`) remains the sole format authority. |
| `tableNumber` / `deliveryAddress` / `customerName` / `notes` | Same as above | **Untrusted, execution-only**, same treatment. |
| `expectedRestaurantId` (if the new Edge Function resolves a tenant the same way `payment-first-checkout` does) | Resolved server-side from `restaurant_slug`/`table_qr_token`, same pattern as `resolveSlugTenant`/`resolveQrTenant` (`supabase/functions/payment-first-checkout/handler.js:191-227`) | **Defense-in-depth only** — `createOrderFromSuccessfulPayment` already treats `paymentTx.restaurant_id` as sole authority (line 390); a mismatched `expectedRestaurantId` causes an early, cheap rejection (`tenant_mismatch`, line 309-311) rather than skipping straight to the (also-safe) snapshot checks. |

---

# IDEMPOTENCY_REQUIREMENTS

The 6 scenarios required by this task, each mapped to existing, already-audited behavior (no new mechanism needed for any of them — `createOrderFromSuccessfulPayment` already handles all six; the trigger layer must not weaken any of them):

1. **Same key, first request** — resolves to one `paymentTransactionId`, no existing order found (line 326), full verification runs, `create_order` succeeds, `idempotent: false` (line 454).
2. **Same key, second request (sequential, e.g. browser retry after a slow response)** — resolves to the same `paymentTransactionId`, app-level pre-check (line 326-336) finds the order already linked, returns it immediately with `idempotent: true`, **no second `create_order` call at all**.
3. **Two concurrent requests, same key (e.g. double-click, or two tabs)** — both may pass the pre-check (TOCTOU window, documented above), both call `create_order` with the same `p_idempotency_key = p_payment_transaction_id`; the DB unique index lets exactly one succeed, the other's Postgres error is caught and mapped to the same winning order, both callers receive an equivalent `succeeded` response.
4. **Refresh during `pending`** (payment not yet confirmed succeeded) — the trigger must not even be called yet in this state; `PaymentFirstCallbackLanding`'s existing polling loop (`TASK_3_6D_4`) is what should gate the call, only invoking the new capability once the status RPC itself reports `succeeded`. If it is called anyway while still `pending` (e.g. a stale client), `createOrderFromSuccessfulPayment` itself safely rejects with `payment_not_successful` (line 315-322) — no order created, no error thrown, safe to retry later.
5. **Webhook and browser both resolve success around the same time** — the webhook never calls `create_order` or this new capability at all (confirmed in `WEBHOOK_RACE_REQUIREMENTS`); it only ever writes `payment_transactions.status`. So this scenario reduces to: the browser's trigger call reads whatever `status` value is currently committed. If the webhook already flipped it to `succeeded` before the browser's call, the browser proceeds normally. If the webhook is slightly late, the browser's read may still see `pending` at that instant — see scenario 4's handling. There is no double-order risk here because only the browser-driven trigger ever calls `create_order` at all today.
6. **Payment succeeded, browser never returns** — **not solved by this trigger design, and not solvable by it** — no order is created, matching the already-disclosed gap in `createOrderFromSuccessfulPayment`'s own doc comment. This is out of scope for 3.6D.6 per the function's own documented boundary and per this task's explicit non-goals; a future reconciliation mechanism (webhook-driven order creation, or a scheduled sweep) is the only way to close it, and is explicitly deferred to 3.6E-or-later (see `EXPLICIT_NON_GOALS`).

---

# CONCURRENCY_REQUIREMENTS

- The trigger layer (new Edge Function) must **not** add its own locking, its own idempotency table, or its own duplicate-suppression cache — doing so would either be redundant with the DB unique index (safe but wasteful) or, worse, could introduce a *new* race window not covered by the DB guarantee (e.g. an in-memory Edge Function instance-local cache, useless across concurrent invocations on different instances). The DB constraint is the only concurrency primitive that needs to exist, and it already does.
- The trigger layer must pass through `createOrderFromSuccessfulPayment`'s response as-is for the `succeeded`/`idempotent` cases — it must not attempt to distinguish "I created it" from "someone else already created it" for any purpose beyond what the function already reports, since both are equally valid, safe outcomes for the browser.
- No new background job, queue, or scheduled task is proposed by this spec (would belong to the 3.6E reconciliation work referenced above, explicitly out of scope).

---

# WEBHOOK_RACE_REQUIREMENTS

Confirmed by direct re-read of `supabase/functions/payment-webhook/handler.js`:
- `_handleWebhookEvent` (line 156) ends with a single `.update({ status: newStatus, updated_at: ... })` against `payment_transactions` (line 227) — **no call to `create_order`, no call to `createOrderFromSuccessfulPayment`, no `orders` table write of any kind.**
- `createOrderFromSuccessfulPayment` is imported/re-exported only via `src/payments/services/index.js` (line 6) — confirmed via repository-wide grep, **zero callers** outside its own unit tests (`orderFromPayment.test.js`) exist anywhere today, including inside the webhook handler.

**Conclusion**: today, there is no actual webhook-vs-browser *order-creation* race, because the webhook does not create orders at all — it only ever updates payment status. The only race that exists (and is already fully handled, per `IDEMPOTENCY_REQUIREMENTS` scenario 3) is browser-vs-browser (concurrent tabs/retries) at the `create_order` call itself. **This must remain true after 3.6D.6 implementation**: the new Edge Function must be the *only* caller of `createOrderFromSuccessfulPayment`, and the webhook must continue to only update status, never trigger order creation directly — otherwise a genuine webhook-vs-browser race at the `create_order` call would newly exist (still safely resolved by the same DB unique index, but worth stating as an explicit constraint on the implementation task, not an assumption left implicit).

---

# ARCHITECTURE_OPTIONS

Each option evaluated against the same 15 criteria, applied consistently.

## Option A — New Edge Function wrapping `createOrderFromSuccessfulPayment` (Recommended)

A new Edge Function (working name `create-order-from-payment`), structured identically to `payment-first-checkout` (`buildHandler({db, orchestrate, ...})`, `service_role` client in `index.ts`, all known outcomes returned as HTTP 200, `providerRef`/raw errors never exposed). Request carries `paymentIdempotencyKey` + execution-only customer fields + tenant-resolution fields (`restaurant_slug`/`table_qr_token`); the handler resolves `paymentTransactionId` server-side (same `reReadByIdempotencyKey`-style lookup, by exact `idempotency_key` match), then calls the existing `createOrderFromSuccessfulPayment` unmodified.

| # | Criterion | Assessment |
|---|---|---|
| 1 | Security | Strong — `service_role` only, RLS irrelevant (see `RLS_ANALYSIS`), no new trust boundary crossed beyond what `payment-first-checkout` already crosses today. |
| 2 | Correctness vs. existing logic | Reuses `createOrderFromSuccessfulPayment` verbatim — zero risk of logic drift between two implementations of the same fingerprint/amount/idempotency checks. |
| 3 | Deno-importability | Already proven — the exact same import chain (`checkoutOrchestration.js` → `checkoutBinding.js`, `utils/index.js`, `types/index.js`) was made Deno-importable in `TASK-PAY-3.6D-E` via the owner-approved `.js`-extension fix, and `createOrderFromSuccessfulPayment` lives in the same file, importing nothing new beyond what's already fixed. |
| 4 | Duplication risk | None — this is the entire point of the option. |
| 5 | Testability | Identical DI pattern already proven for `payment-first-checkout` (`buildHandler({db, orchestrate})`, no real Deno/Supabase/Moyasar needed) — directly reusable test approach. |
| 6 | Consistency with existing architecture | Exact precedent match — this is architecturally the third Edge Function in a family of three (checkout-initiate, webhook, order-creation), all `service_role`, all following the same handler/index.ts split. |
| 7 | Operational complexity | One more Edge Function to deploy/monitor — same operational shape as the two that already exist; no new infrastructure category. |
| 8 | Latency | One additional HTTP round-trip from the browser (status RPC, then this call) — acceptable, matches the existing polling-then-act pattern already built into `PaymentFirstCallbackLanding`. |
| 9 | Failure isolation | A bug in this new Edge Function cannot corrupt payment data (read-only against `payment_transactions`) — worst case is a failed/delayed order, recoverable by retry (idempotent) or by the (future) 3.6E reconciliation path. |
| 10 | Auditability/logging | Same `console.log`/`console.warn`/`console.error` + `requestId` pattern as `payment-first-checkout` — directly reusable. |
| 11 | Rate-limiting fit | Naturally request/response, easy to front with the same rate-limiting posture already documented (undeployed) for the other two functions (see `RATE_LIMITING_POSTURE`). |
| 12 | Migration requirement | None (see `MIGRATION_REQUIREMENTS`). |
| 13 | Blast radius of a mistake | Bounded to order creation only — cannot affect checkout initiation or webhook processing, which remain fully untouched. |
| 14 | Owner-familiarity / review cost | Lowest — reviewer already knows this exact pattern from `TASK_3_6D-E`'s own report; no new architecture concept to evaluate. |
| 15 | Time-to-implement (informational only, not a deciding factor per this task's own instruction not to implement) | Small — handler is mostly request validation + one function call + response-shape mapping, closely mirroring `payment-first-checkout/handler.js`'s own `buildResponse`. |

## Option B — New SQL RPC duplicating the orchestration logic in PL/pgSQL

A `SECURITY DEFINER` RPC (like `get_payment_status_by_idempotency_key`) that re-implements payment lookup, status check, snapshot/fingerprint verification, and `create_order` invocation entirely in PL/pgSQL.

| # | Criterion | Assessment |
|---|---|---|
| 1 | Security | Comparable to Option A in principle (still server-side, still gated) — but `SECURITY DEFINER` functions are harder to review for subtle privilege-escalation mistakes than JS Edge Function code the team already has tooling/tests for. |
| 2 | Correctness vs. existing logic | **High risk** — fingerprint verification uses `crypto.subtle.digest` (`checkoutBinding.js`, JS-only); reproducing this in PL/pgSQL (`pgcrypto`'s `digest()`) requires re-deriving byte-for-byte identical canonicalization and hashing, a genuine re-implementation with real drift risk, not a mechanical port. |
| 3 | Deno-importability | N/A — no import needed, but this is not actually an advantage since the *duplication itself* is the cost, not the import mechanism. |
| 4 | Duplication risk | **High** — the exact risk this option is defined by; two independently-maintained implementations of the same trust-critical logic. |
| 5 | Testability | Weaker — SQL-level fingerprint/JSON logic is harder to unit-test in isolation than the existing JS test suite already covering `createOrderFromSuccessfulPayment`. |
| 6 | Consistency with existing architecture | Partially consistent (matches the `get_orders_status_secure`/`get_payment_status_by_idempotency_key` precedent) but that precedent was explicitly for **pure reads**; this would be the first *write-with-complex-verification* RPC of this kind. |
| 7 | Operational complexity | Slightly lower (no Edge Function to deploy) but this is a minor gain outweighed by criterion 2. |
| 8 | Latency | Marginally lower (one fewer network hop: no Edge Function, direct `supabase.rpc()`) — not a meaningful differentiator at this scale. |
| 9 | Failure isolation | Weaker — a subtle fingerprint bug in SQL could pass `create_order` and create an order it should have rejected, with no JS test suite in the loop to catch it before production. |
| 10 | Auditability/logging | Weaker — PL/pgSQL logging is far less ergonomic than the existing `console.*` + `requestId` pattern. |
| 11 | Rate-limiting fit | Same as Option A. |
| 12 | Migration requirement | Would require a new migration (the RPC itself) — Option A requires none. |
| 13 | Blast radius of a mistake | **Larger** — a `SECURITY DEFINER` RPC bug affecting order creation is a schema-level artifact, harder to hotfix/roll back than an Edge Function redeploy. |
| 14 | Owner-familiarity / review cost | Higher — reviewer must independently verify the PL/pgSQL fingerprint logic matches the JS original bit-for-bit, a much harder review than "confirm this calls the existing function unmodified." |
| 15 | Time-to-implement (informational) | Larger — genuine new logic, not a wrapper. |

**Not recommended.**

## Option C — Extend the existing payment-status RPC to also create the order

Add order-creation as a side effect of `get_payment_status_by_idempotency_key` itself.

**Audit only, per this task's explicit instruction that this option is "not recommended."** Confirmed why: that RPC is documented and implemented as `STABLE` (`sql/payment_status_reads.sql`) — a pure read, callable safely any number of times, including by a polling loop with no side-effect concerns (`PaymentFirstCallbackLanding`'s own repeated calls, `TASK_3_6D_4`). Turning it into a function with a write side effect would (a) break the `STABLE` contract, (b) make every existing polling call a potential order-creation trigger with no explicit intent from the caller, (c) conflate two genuinely different operations ("what is the status" vs "create the order now") behind one name, and (d) require re-deriving all of `createOrderFromSuccessfulPayment`'s logic in SQL anyway — inheriting every weakness of Option B while additionally corrupting a currently-clean, currently-safe read-only capability. No further comparison performed, consistent with the task's own framing of this option as audit-only.

## Option D — Other: direct browser call to `createOrderFromSuccessfulPayment`-equivalent logic (client-side)

Not viable and not seriously comparable: `createOrderFromSuccessfulPayment` requires reading `payment_transactions` directly (RLS-blocked for `anon`/`authenticated`, see `RLS_ANALYSIS`) and must resolve `paymentTransactionId` from a value the browser is never given. Listed only for completeness of the requested A/B/C/D comparison; rejected outright, no 15-criteria table produced (would be uniformly worst-case across every security-relevant criterion).

---

# RECOMMENDED_ARCHITECTURE

**Option A.** A new Edge Function, `create-order-from-payment` (naming subject to owner preference), following `payment-first-checkout`'s exact structure:
- `index.ts`: `service_role` Supabase client, `Deno.serve(buildHandler({db, ...}))`.
- `handler.js`: DI-friendly (`buildHandler({db, createOrder = createOrderFromSuccessfulPayment, ...})`), request validation (body-size cap, shape checks — mirroring `payment-first-checkout/handler.js`'s existing `MAX_BODY_BYTES`/`MAX_STRING_LEN`/`PHONE_SHAPE` constants for consistency, not new invented limits), server-side tenant resolution (reusing the same `resolveSlugTenant`/`resolveQrTenant`-equivalent pattern for the optional `expectedRestaurantId` defense-in-depth check), server-side `paymentIdempotencyKey → paymentTransactionId` resolution, then a single call into the unmodified `createOrderFromSuccessfulPayment`, then response-shape mapping that never exposes `providerRef` and (pending the owner decision below) never exposes `paymentTransactionId`.
- Called only from `PaymentFirstCallbackLanding` (`TASK_3_6D_4`), only after its existing status-polling loop observes `status === 'succeeded'` from `get_payment_status_by_idempotency_key` — this spec does not change that component's polling logic itself, only adds (in the future implementation task) one new call at the point success is already detected.

---

# REQUEST_CONTRACT

| Field | Required | Source | Notes |
|---|---|---|---|
| `paymentIdempotencyKey` | **Yes** | Browser (from the `payment_callback` URL parameter, unchanged since `TASK_3_6D_4_C.1`) | Used only to look up `payment_transactions` by exact `idempotency_key` match. Never trusted as proof of anything by itself. |
| `restaurant_slug` **or** `table_qr_token` | Exactly one, **Yes** | Browser (already available wherever `PaymentFirstCallbackLanding` renders — same page context `payment-first-checkout` itself resolves tenant from) | Mirrors `payment-first-checkout`'s own `hasQr === hasSlug` exclusivity rule (`handler.js:171`). Used only to resolve `expectedRestaurantId` for the defense-in-depth check already supported by `createOrderFromSuccessfulPayment` — **not** used to override the payment row's own `restaurant_id`, which remains sole authority. |
| `customerPhone` | **Yes** | Browser, read from the persisted `simsim_payfirst_customer_{key}` record (`TASK_3_6D_5_A.1`) | Execution-only. Format re-validated by `create_order` itself; this Edge Function may cheaply pre-validate the same `^5[0-9]{8}$` shape (matching `payment-first-checkout`'s own `PHONE_SHAPE` constant) purely to fail fast, not as a new authority. |
| `tableNumber` | Conditional (non-QR `dine_in` only) | Same persisted record | Execution-only. For QR `dine_in`, table identity comes from the QR token itself (already resolved via `resolve_table_qr`), never from this field — matching the existing rule already established for the persisted customer-data record (`TASK_3_6D_5_A.1`, `buildPaymentCustomerDataRecord`). |
| `deliveryAddress` | Conditional (`delivery` only) | Same persisted record | Execution-only. |
| `customerName` | Optional | Same persisted record | Execution-only. |
| `notes` | Optional | Same persisted record | Execution-only. |

**Explicitly forbidden as request fields** (must be rejected or simply never read, matching `payment-first-checkout`'s own pattern of not reading fields it doesn't trust even if present in the body):
- `paymentTransactionId` — **never accepted from the client.** This is the single most important contract rule in this spec: the browser has never been given this value by any response built in this entire arc (`payment-first-checkout`'s success response explicitly omits it — see `buildSucceededResponse`, `handler.js:283-307` — returning only `redirectUrl`/`total`/`currency`/`paymentIdempotencyKey`), so a request field for it would either always be empty (harmless but pointless) or, if ever wired up carelessly by a future caller, would let anyone who guesses/observes a `payment_transactions.id` trigger order creation for a payment that isn't theirs. Resolving it server-side from `paymentIdempotencyKey` closes this off entirely.
- `providerRef`, `amount`, `currency`, `restaurant_id`, `branch_id`, `items`, `coupon_code`, `type` — all authoritative from the stored snapshot/payment row; never read from the request even if sent.

---

# RESPONSE_CONTRACT

Following `payment-first-checkout/handler.js`'s own established convention: every known business outcome returns HTTP 200 with a `status` discriminator; only true infrastructure failures (misconfiguration, unexpected exception, method-not-allowed) use non-200 codes.

| `status` | HTTP | Fields | When |
|---|---|---|---|
| `succeeded` | 200 | `orderId`, `orderNumber`, `accessToken`, `idempotent` (bool) | `createOrderFromSuccessfulPayment` returned `succeeded` (first creation or idempotent replay — both, matching the existing function's own unified shape). **`paymentTransactionId` excluded** (see `OWNER_DECISIONS_REQUIRED` — treated as unproven-safe-to-expose until the owner explicitly approves otherwise, consistent with `payment-first-checkout`'s own precedent of never exposing it). |
| `pending` | 200 | — | Payment resolved but not yet `SUCCEEDED` (`payment_not_successful` from the underlying function, generalized — the caller should keep polling status, not treat this as a hard failure; matches scenario 4 in `IDEMPOTENCY_REQUIREMENTS`). Internal `reason`/`paymentStatus` logged server-side only, not returned. |
| `not_found` | 200 | — | `paymentIdempotencyKey` does not resolve to any `payment_transactions` row, or tenant resolution fails — generalized from `payment_transaction_not_found`/`tenant_mismatch`/`tenant_not_found` into one client-facing status (mirrors `payment-first-checkout`'s own `tenant_not_found` → generic `rejected` pattern, `handler.js:120`) so a client cannot distinguish "wrong tenant" from "unknown payment" (avoids leaking existence information across tenants). |
| `already_processing` / `retryable_error` | 200 | — | The `retryable_error/order_race_unrecovered` case — vanishingly rare (only if the DB race-recovery re-read itself also fails) — client should retry the same call once. |
| `requires_reconciliation` | 200 | `dryRun` (subtotal/tax/delivery_fee/total — same fields already exposed for `price_changed` by `payment-first-checkout`, so this is not a new category of exposure) | `price_drift_requires_reconciliation` — payment succeeded but current pricing has since drifted from what was paid; `create_order` did not run. Mirrors the already-established, owner-seen `requires_reconciliation` pattern from checkout initiation itself. |
| `validation_error` | 400 | `error` (fixed string, no detail) | Malformed request body (missing/malformed required field) — before any DB I/O, same as `payment-first-checkout`'s `invalid_request`. |
| `internal_error` | 500 | `error: 'internal_error'` | Unexpected exception, misconfiguration (e.g. missing env var) — no raw error message, no stack trace, ever returned to the client (matches `payment-first-checkout`'s own `internal_error` handling verbatim). |

**Never included in any response, under any status**: `providerRef`, raw Postgres error text, the payment row's `metadata`/`raw` columns, and — pending explicit owner approval — `paymentTransactionId`.

---

# SECURITY_THREAT_MODEL

| Threat | Mitigation |
|---|---|
| Attacker guesses/enumerates another customer's `paymentIdempotencyKey` (random UUID-derived, `newIdempotencyKey('pay')`) to trigger order creation for someone else's payment | Same exposure surface as the already-approved `get_payment_status_by_idempotency_key` RPC (`TASK_3_6D_4_A`, explicitly accepted risk — the key is high-entropy and short-lived in practice); this new capability adds no *new* enumeration surface, since it uses the identical lookup key and identical exact-match-only pattern. Worst case of a successful guess: an order gets created for a payment that already succeeded, addressed to whatever phone/table/address the attacker supplies — a nuisance (wrong delivery target), not a financial exploit (no new charge, no refund, no price change possible). |
| Attacker sends a `paymentTransactionId` directly (bypassing the idempotency-key resolution) | Prevented by design — this field is never read from the request body at all (see `REQUEST_CONTRACT`). |
| Attacker replays the same request many times hoping to create duplicate orders | Fully prevented — `createOrderFromSuccessfulPayment`'s idempotency (both layers) guarantees at most one order per payment, regardless of request count. |
| Attacker submits a `customerPhone`/`tableNumber`/`deliveryAddress` that doesn't match the real customer, on a payment that isn't theirs (requires already having guessed the key — see first row) | Same "wrong delivery target" nuisance ceiling as above; `create_order`'s own phone-format validation still applies; no price/authorization impact since these fields are execution-only by design (re-confirmed in this audit, not newly established). |
| Cross-tenant order creation (payment for restaurant A used to create an order under restaurant B) | Prevented at two layers: `createOrderFromSuccessfulPayment` always uses `paymentTx.restaurant_id` (line 390), never any client-supplied value; the optional `expectedRestaurantId` defense-in-depth check (line 309-311) adds an early, cheap rejection if the Edge Function's own tenant resolution disagrees. |
| Information leakage: response reveals whether a given key/slug combination exists, or a payment's exact status/reason, to an unauthenticated caller | Addressed by the generalized `not_found`/`pending` statuses in `RESPONSE_CONTRACT` — deliberately coarser than the underlying function's own `reason` values, logged server-side (with `requestId`) but not returned to the client, matching `payment-first-checkout`'s own established logging-vs-response asymmetry. |
| Denial of service via repeated calls (each call performs at least 2-3 DB reads even in the cheap-rejection paths) | Not prevented by this specification — see `RATE_LIMITING_POSTURE` (documented requirement, not implemented here). |
| Edge Function's `service_role` key compromise | Same existing risk already accepted for `payment-first-checkout` and `payment-webhook` — no new exposure introduced by adding a third function of the same kind; standard Supabase secret-management practice (never logged, never returned) applies identically. |

---

# RLS_ANALYSIS

Confirmed via direct re-read of `sql/payments_gateway_foundation.sql`:
- `payment_transactions` has RLS **enabled** (line 54) with exactly one policy, `ptx_admin_all` (line 60): `for all using (public.is_platform_admin()) with check (public.is_platform_admin())`. **Neither `anon` nor `authenticated` roles have any access at all** to this table — not even `SELECT`. This is why every capability that touches `payment_transactions` in this entire arc (`payment-first-checkout`, `payment-webhook`, the status-read RPC's `SECURITY DEFINER`) has had to either use `service_role` (bypasses RLS entirely) or a `SECURITY DEFINER` function (runs as its owner, bypassing the caller's own RLS).
- The new Edge Function, per `RECOMMENDED_ARCHITECTURE`, uses `service_role` — **identical RLS posture to `payment-first-checkout` and `payment-webhook` today**, introducing no new RLS bypass category, only one more caller of an already-accepted bypass mechanism.
- `orders`' own RLS policies were not re-audited in this task (out of scope — `create_order` itself, unchanged, already handles order-row creation under its own existing `SECURITY DEFINER` context, exactly as it does for every other order-creation path in the product today, including cash orders). No new orders-table RLS concern is introduced by this design, since order creation still flows exclusively through the same, unmodified `create_order` RPC.

---

# RATE_LIMITING_POSTURE

**Documented requirement only — not implemented by this spec or any prior task in this arc.** Recorded for the owner's awareness before 3.6D.6 implementation begins:
- This endpoint is more expensive per-call than the status-read RPC (multiple table reads, and on the success path, a full `create_order` invocation with its own internal work) — a tighter rate-limit ceiling than a pure read endpoint would be appropriate.
- Because the endpoint is fully idempotent, rate limiting is a cost/abuse control, not a correctness requirement — a legitimate retry storm is wasteful but not unsafe.
- No rate-limiting mechanism exists anywhere in this codebase today for any Edge Function (confirmed by the absence of any such logic in `payment-first-checkout/handler.js` or `payment-webhook/handler.js`, both already re-read in full this session) — so this is a **pre-existing gap this task is not introducing**, only naming, consistent with the "audit, don't fix out-of-scope issues" instruction.

---

# TEST_STRATEGY

To be implemented in 3.6D.6 (not this task). Listed here as the required coverage plan:
1. **Idempotent creation** — same `paymentIdempotencyKey`, two sequential calls ⇒ same `orderId`, second call has `idempotent: true`, `create_order` invoked exactly once (asserted via mock call count).
2. **Concurrent duplicate prevention** — two simulated concurrent calls (mock `db.rpc('create_order')` first resolving success, second rejecting with the `orders_payment_transaction_id_uidx` race marker) ⇒ both resolve to the same order, no unhandled rejection.
3. **Payment-not-successful rejection** — mock `payment_transactions.status` as `pending`/`failed` ⇒ `status: 'pending'`/generalized rejection, no `create_order` call at all.
4. **Tenant mismatch rejection** — mock resolved tenant disagreeing with `payment_transactions.restaurant_id` ⇒ `not_found` (generalized), `create_order` never called.
5. **Snapshot mismatch rejection** — mock a tampered/invalid `metadata.checkout` ⇒ rejection, no order created (reusing the exact fixture patterns already established in `orderFromPayment.test.js` for `createOrderFromSuccessfulPayment` itself — the Edge Function test layer only needs to prove it plumbs these outcomes through correctly, not re-prove the underlying logic).
6. **Malformed customer data rejection** — missing/invalid `customerPhone`, oversized `notes`/`customerName` ⇒ `validation_error`, 400, before any DB call.
7. **Already-created-order short-circuit** — mock an existing linked order ⇒ `succeeded`/`idempotent: true`, no verification/`create_order` call (mirrors the underlying function's own pre-check test coverage).
8. **Webhook race safety** — mock `payment_transactions.status` flipping from `pending` to `succeeded` between two reads (simulating the webhook committing mid-flight) ⇒ whichever read the request actually saw is handled correctly and safely (either `pending` generalized-rejection, retryable by the client, or full success) — no partial/corrupt state possible either way, since the read is a single atomic `SELECT`.

Test approach continues this session's established conventions: `buildHandler({db, createOrder, ...})` DI (mirroring `payment-first-checkout`'s own test structure), no real Deno/Supabase, `makeChain`/`makeDb` mock helpers, offline SQL-parsing-style guard tests where applicable for any new SQL touched (none expected — see `MIGRATION_REQUIREMENTS`).

---

# MIGRATION_REQUIREMENTS

**None.** The complete relationship this capability needs — `orders.payment_transaction_id` (nullable FK) + `orders_payment_transaction_id_uidx` (unique partial index) + `create_order`'s 13-parameter signature already accepting `p_payment_transaction_id` — is already fully deployed to production (confirmed via `reports/TASK_3_5_PRODUCTION_MIGRATION_EXECUTION_REPORT.md`, re-cited in `EXECUTIVE_SUMMARY`). `createOrderFromSuccessfulPayment` itself requires no changes (see audit above). The only new artifact 3.6D.6 implementation would add is the Edge Function itself (application code, not schema).

---

# OWNER_DECISIONS_REQUIRED

Per this project's mandatory working rules (`CLAUDE.md`), no implementation proceeds without explicit approval. The specific decisions this spec surfaces, each with its recommended default:

1. **Expose `paymentTransactionId` in the success response, or not?** — **Recommended: do not expose it**, consistent with `payment-first-checkout`'s own precedent of never returning it. If a future need arises (e.g. a support/debug tool), it should be a separate, explicitly-scoped decision, not a default inclusion here.
2. **Exact Edge Function name** — this spec used the working name `create-order-from-payment`; owner may prefer a different name (e.g. matching a different naming convention already used elsewhere).
3. **Tenant-resolution field on the request** (`restaurant_slug`/`table_qr_token`) — is the defense-in-depth `expectedRestaurantId` check worth the extra request complexity, or is relying solely on `createOrderFromSuccessfulPayment`'s own `paymentTx.restaurant_id`-is-authority behavior (already safe on its own) sufficient? **Recommended: include it** — cheap, and it turns a would-be silent cross-tenant edge case into an explicit, logged rejection instead of relying solely on the deeper check.
4. **Response granularity** — this spec recommends generalizing several distinct internal `reason` values into fewer client-facing `status` values (e.g. `not_found` absorbing both "unknown payment" and "tenant mismatch") to avoid leaking existence/tenant information. Owner should confirm this trade-off (slightly less specific client-side error messaging) is acceptable.
5. **Whether `PaymentFirstCallbackLanding`'s existing polling loop should call this new endpoint automatically the instant `succeeded` is observed, or require an explicit user action (e.g. a "confirm" tap)** — this spec assumes automatic (matching the fully-automated nature of the rest of the payment-first flow), but this is a UX decision, not purely a security one, and is called out here rather than assumed silently.
6. **Rate-limiting mechanism and thresholds** — `RATE_LIMITING_POSTURE` documents the requirement; owner must decide the actual mechanism (Supabase built-in, a new table-backed counter, an external service) and thresholds — explicitly out of this spec's scope to decide.

---

# EXPLICIT_NON_GOALS

- Recovering an order when the customer's browser never returns after a successful payment (webhook-only success, no browser round-trip) — explicitly deferred, matching `createOrderFromSuccessfulPayment`'s own documented boundary (line 276) and this task's own framing of 3.6E as the eventual owner of reconciliation.
- Implementing rate limiting (documented only, per `RATE_LIMITING_POSTURE`).
- Modifying `createOrderFromSuccessfulPayment`, `payment-webhook`, the payment-status RPC, or `PaymentFirstCallbackLanding` — all confirmed unmodified by this task, per its own explicit instruction.
- Creating any new schema/migration — none needed (`MIGRATION_REQUIREMENTS`).
- Deciding or implementing currency re-validation inside `createOrderFromSuccessfulPayment` (the minor gap noted in the audit table) — flagged as a `Suggestion` below, not fixed here, consistent with `CLAUDE.md`'s rule against fixing out-of-scope issues found during a task.
- Any 3.6D.6 implementation work itself, 3.6D.7, or 3.6E — this task is specification/audit only, per its own explicit "STRICT STOP" framing.

---

# RISKS

- **Currency re-validation gap** (noted in the audit, not fixed here): `createOrderFromSuccessfulPayment` does not independently re-check `paymentTx.currency === 'SAR'` before creating the order — it relies entirely on `initiatePaymentFirstCheckout` having already enforced this at charge time. Since only `SAR` is supported anywhere in the system today (`SUPPORTED_CURRENCY` constants in both `checkoutOrchestration.js:17` and `payment-first-checkout/handler.js:39`), this is currently unreachable in practice, but is worth the owner's awareness as a defense-in-depth gap if multi-currency support is ever added later.
- **TOCTOU window in the app-level idempotency pre-check** (documented in the audit as by-design, not a defect) — relies entirely on the DB unique index for actual correctness under concurrency; if that index were ever accidentally dropped or altered, the app-level pre-check alone would **not** prevent duplicate orders. This is a reason to treat `orders_payment_transaction_id_uidx` as a load-bearing production invariant, not an implementation detail.
- **Stale header comment in `sql/order_payment_reference.sql`** ("NOT APPLIED TO ANY DATABASE") could mislead a future reader who trusts the file text over the migration-execution report — worth a documentation correction at some point (out of scope for this task to make, flagged as a `Suggestion`).
- **No rate limiting today** on any Edge Function in this arc, including this future one — acceptable given full idempotency, but a real cost-control gap under a deliberate abuse scenario (repeated calls, each triggering several DB reads).

---

# IMPLEMENTATION_SEQUENCE (for the future 3.6D.6 implementation task — not started here)

1. Owner reviews and resolves `OWNER_DECISIONS_REQUIRED` (1-6 above).
2. Implement `supabase/functions/create-order-from-payment/handler.js` + `index.ts`, following `payment-first-checkout`'s exact structural precedent, per `RECOMMENDED_ARCHITECTURE`/`REQUEST_CONTRACT`/`RESPONSE_CONTRACT`.
3. Unit tests per `TEST_STRATEGY` (DI-based, no real Deno/Supabase).
4. Full regression run (current baseline: 959/959 per this session's prior tasks) to confirm zero unrelated breakage.
5. Wire the new endpoint into `PaymentFirstCallbackLanding`'s existing success-detection point — a separate, explicitly-scoped follow-up task, not bundled into the Edge Function's own implementation task.
6. Staging verification (mirroring the `TASK_3_6D_4_B.1`/`B.2` staging-first pattern already established for the status RPC) before any production deployment.

**This sequence is documentation only — no step in it is authorized to begin without a new, explicit task instruction, per this task's own "STRICT STOP."**

---

# SUGGESTIONS (out-of-scope items noticed during this audit, per CLAUDE.md rule 4 — not acted on)

- Correct the stale "NOT APPLIED TO ANY DATABASE" header comment in `sql/order_payment_reference.sql` to reflect its actual, verified-applied-to-production status, to prevent a future reader from being misled by the file text alone.
- Consider adding the currency re-validation defense-in-depth check inside `createOrderFromSuccessfulPayment` noted in `RISKS`, if/when multi-currency support is ever planned.
