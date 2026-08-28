# Task 3.6D.4-A — Payment Status Resolution Server Capability Specification

**Specification only. No production code, schema, migration, Edge Function, or deployment. No Moyasar call.**

---

# EXECUTIVE_SUMMARY

`TASK_3_6D_4_REDIRECT_CALLBACK_IMPLEMENTATION_REPORT.md` found that a browser returning from Moyasar has no safe way to ask "what happened to my payment?" — `payment_transactions` is RLS-protected, and the two mechanisms that *could* answer (`paymentService.confirmCharge()`, and the webhook) are both server-only. This task compares three designs to close that gap and recommends one, decomposed into two independently-scoped pieces:

1. **A new, narrow, read-only `SECURITY DEFINER` SQL RPC** (`get_payment_status_by_idempotency_key`), callable directly from the browser via the anon key — **this is Design A**, and it is the recommended solution for 3.6D.4's actual browser-facing need. It is not a new architectural shape: it directly mirrors `get_orders_status_secure`, an **already-live, already-production, already-anon-callable** RPC (confirmed called today from `useActiveOrders.js` via `supabase.rpc(...)`, no Edge Function involved) that solves the structurally identical problem — "let an anonymous customer read a normally-protected row via an opaque bearer token." No new HTTP surface, no new CORS decision, no new Edge Function, no schema change (only a new function).
2. **Active provider confirmation (Design B's mechanism — `confirmCharge()` calling Moyasar's real `verifyPayment`) is recommended to be *relocated entirely* out of the browser-reachable surface**, into the already-tracked, already-deferred **3.6E reconciliation phase**, running as a scheduled/background process — never triggered by an anonymous request. This removes Design B's most serious risks (anonymous-triggerable live Moyasar calls, cross-tenant Moyasar rate-limit exhaustion, a first-ever-live-tested G-6 dependency in a security-critical path) **by construction**, not by mitigation.

This combination is, in substance, **Design C (hybrid)** — but decomposed into two separately-scoped, separately-timed tracks rather than one combined endpoint: a cheap, safe, pollable read now (this spec's deliverable-to-be), and an already-planned, not-newly-invented asynchronous safety net later (3.6E). Nothing is implemented in this task. A future implementation task (mirroring how `TASK_3_6D-E` followed `TASK_3_6D-C`) would build exactly the contract specified below, pending owner approval.

---

# PROBLEM_STATEMENT

Restated precisely from `TASK_3_6D_4`'s findings: a browser holds only a `paymentIdempotencyKey` (self-issued, persisted in `localStorage` per 3.6D.3, echoed back via `?payment_callback=<key>` per 3.6D-C/3.6D-E) after returning from Moyasar's hosted payment page. It has **no way** to translate that key into an authoritative status, because:
- `payment_transactions` RLS requires `is_platform_admin()` — no anonymous read path exists, with or without a key.
- The only code that can answer authoritatively (`confirmCharge()`, the webhook) requires `service_role`.
- No existing Edge Function exposes this.
- Naively re-calling `startCheckout()`/`initiatePaymentFirstCheckout` is unsafe (see WHY_SAFER_THAN_RESTARTING_CHECKOUT).

---

# EXISTING_ARCHITECTURE

Read in full for this task, none modified:

- **`src/payments/services/paymentService.js`** — `confirmCharge(providerRef, {db})` (lines 119–148): loads by `provider_ref`, short-circuits if `isTerminalStatus(tx.status)` (no Moyasar call, no write), otherwise calls `adapter.verifyPayment(providerRef)` and writes the real status. Already tested (`PS-006`–`PS-009`). **Never wired to anything reachable from a browser.**
- **`src/payments/adapters/moyasar.js`** — `verifyPayment(providerRef)` calls Moyasar's documented `GET /v1/payments/{id}`, mapped through the same `mapStatus()` used everywhere else. Never executed against a live Moyasar account in this session (same unverified status as every other adapter method, per G-6).
- **`src/payments/utils/index.js`** — `TERMINAL = new Set([SUCCEEDED, FAILED, CANCELLED, REFUNDED])`, `isTerminalStatus`. Independently duplicated (not imported) inside `supabase/functions/payment-webhook/handler.js`'s own `TERMINAL` set — both currently identical; a pre-existing, out-of-scope minor duplication, noted but not touched.
- **`sql/payment_transactions_idempotency_key_unique.sql`** — `uq_paytx_idempotency_key`, a unique index on `payment_transactions.idempotency_key WHERE idempotency_key IS NOT NULL`. Confirms exact-match-by-key lookups are already efficient and already guaranteed unique — no schema change needed for any design compared here.
- **`sql/order_status_reads.sql`** — the load-bearing precedent. `get_orders_status_secure(p_orders jsonb)`: `STABLE SECURITY DEFINER`, `SET search_path TO 'public'`, joins caller-supplied `{id, access_token}` pairs against `orders`, returning rows **only** where the token matches. `cancel_order_by_customer(p_order_id, p_access_token)`: same token-gated pattern, this time for a guarded write. Both are **already in production**, already anon-callable, already exactly the "bearer-capability-token read of an otherwise-protected table" pattern this task needs.
- **`src/features/menu/hooks/useActiveOrders.js`** (lines 94–115) — confirms `supabase.rpc('get_orders_status_secure', {...})` is called **directly from the browser** via the anon key, with **no Edge Function involved at all**, as part of a `reconcileActiveOrders()` fallback (primary updates via Realtime; this RPC is the reconciliation-on-reconnect path). This is also useful precedent for the *frontend* polling/reconciliation shape a future callback page could reuse.
- **`reports/TASK_3_6D_C_...`** — established, still-binding rules this spec must not violate: `providerRef` never exposed; `paymentTransactionId` not needed browser-side; currency/amount are safe, established response fields (already returned by `payment-first-checkout` on `succeeded`).
- **`reports/TASK_3_6D_E_...`** / **`TASK_3_6D_3_...`** — confirm the `payment_callback=<paymentIdempotencyKey>` return-URL parameter and the persisted-key lifecycle (`usePaymentIdempotencyKey`) are both already live and tested; this spec's contract is designed to be consumed by exactly that existing key, unchanged.

---

# CONSTRAINTS

Restated from this task's own instructions, all honored throughout: specification only; no Edge Function; no schema/migration change; no deploy; no Moyasar call; no frontend wiring; no start of 3.6D.5/3.6D.6/3.6D.7. All CRITICAL SECURITY RULES (redirect URL never proof; never trust client status/amount/currency; never expose `providerRef` without justification; never re-run `startCheckout` for status; never expose `payment_transactions` directly; don't assume webhook-before-redirect ordering; don't invent Moyasar callback parameters; don't leave an unauthenticated status endpoint unaddressed for enumeration/rate-limiting) are treated as binding design inputs below, not aspirational notes.

---

# DESIGN_A_ANALYSIS — Pure status read (`idempotencyKey → payment_transactions → status`)

| # | Criterion | Analysis |
|---|---|---|
| 1 | Security | Narrow `SECURITY DEFINER` function, exact-match `WHERE`, fixed safe column projection. No new HTTP surface — reuses Supabase's existing RPC/PostgREST gateway, already handling anon RPC traffic project-wide. |
| 2 | Anonymous/browser exposure | Yes, by design — same trust level as `get_orders_status_secure` today. |
| 3 | Authentication | Anon key only — no login, consistent with the entire guest-checkout model (ADR-9). |
| 4 | Authorization | Possession of the exact key is the authorization — a bearer-capability model, identical in spirit to `order_access_token`. Key is `pay_<crypto.randomUUID()>` — effectively unguessable. |
| 5 | CORS | No new decision — inherits Supabase's existing project-level RPC/REST CORS config, unchanged, exactly as `get_orders_status_secure` already does. |
| 6 | Rate limiting | Same pre-existing gap as every other endpoint (no rate limiting exists anywhere in this codebase yet — `RATE_LIMITING_REQUIRES_INFRA_DECISION`, unchanged from 3.6D-C). Abuse risk is low: read-only, no external side effect, no cost beyond a normal indexed DB read. |
| 7 | Enumeration resistance | Strong — key space is UUID-derived (~122 bits); no sequential/guessable identifier anywhere in the design. Unknown key → empty result, not a distinguishable error (matches `get_orders_status_secure`'s own null-safe join behavior). |
| 8 | Idempotency | N/A in the write sense — read-only, naturally side-effect-free, safe to call any number of times. |
| 9 | Provider verification | **None** — this design only ever reflects whatever the webhook (or, later, 3.6E) has already written. This is its one real limitation, addressed by pairing with 3.6E, not by this capability alone. |
| 10 | Webhook race conditions | Honest, not hidden: if the webhook hasn't arrived, the read returns `pending`/`initiated`, which the frontend must render as "still confirming" (reusing 3.6D-A's already-designed `ERROR_STATE_MAPPING` treatment for ambiguous states), never as failure. |
| 11 | Retry behavior | Frontend polls with its own backoff (frontend concern, not this spec's to invent — see OWNER_DECISIONS_REQUIRED); the RPC itself imposes no state that would make repeated calls unsafe. |
| 12 | Failure modes | Unknown/malformed key → empty result set (not an exception) — avoids an error-vs-empty side channel. A genuine DB-level failure surfaces via PostgREST's own standard error shape, nothing custom to leak. |
| 13 | Information disclosure | Bounded to exactly one transaction per valid key (enforced by the existing unique index); no cross-tenant leak path exists. |
| 14 | Amount/currency exposure | Returned — already an established-safe field (3.6D-C/E already return `total`/`currency` to the browser on `succeeded`); no new precedent. |
| 15 | providerRef exposure | **Never returned** — not selected, not derivable from anything this function returns. |
| 16 | RLS implications | None — `SECURITY DEFINER` bypasses RLS by function-owner privilege, the same mechanism `get_orders_status_secure`/`cancel_order_by_customer` already use in production; no RLS *policy* change on `payment_transactions` is proposed or needed. |
| 17 | Operational complexity | **Lowest of the three** — one new SQL function + one `GRANT`, no new deployment target, no new secret, no new CORS/auth surface. |
| 18 | Testability | Straightforward — same pattern as other SQL RPCs in this codebase (a thin JS wrapper testable via a mocked `db.rpc`, following this session's established `makeChain`/`makeDb` conventions). |
| 19 | Production readiness | High once built — depends on nothing Moyasar-related at all; its only dependency is the already-implemented, already-HMAC-verified webhook being *eventually* correct, unaffected by this design either way. |
| 20 | Compatibility with existing architecture | **Highest** — reuses an already-live pattern verbatim rather than introducing a new one. |

---

# DESIGN_B_ANALYSIS — Active confirmation (`idempotencyKey → payment_transactions → provider_ref → confirmCharge() → Moyasar → persist`)

| # | Criterion | Analysis |
|---|---|---|
| 1 | Security | Materially higher risk than A: an anonymous-reachable endpoint that can trigger a **real outbound call to a third-party payment provider** and a real write, not merely a read. |
| 2 | Anonymous/browser exposure | Same response-side exposure as A, but the *request* now has a costly, provider-facing side effect. |
| 3 | Authentication | Same as A (anon key) — but combined with #1, a stronger capability is being granted anonymously. |
| 4 | Authorization | Same bearer-key model as A, but the capability now includes "cause a live Moyasar API call," not merely "read a row." |
| 5 | CORS | Needs its own Edge Function CORS policy (a new, if trivially-resolved, decision — `'*'`, matching existing precedent). |
| 6 | Rate limiting | **Materially more urgent than A.** An anonymous caller could spam this endpoint to repeatedly hit Moyasar's real API for one transaction — risking Moyasar-side throttling/blocking that could degrade or fail **other, unrelated restaurants'** live transactions sharing the same Moyasar account. This is a cross-tenant availability risk Design A simply does not have. |
| 7 | Enumeration resistance | Same key protection as A, but the *stakes* of a successful guess are higher (triggers a real provider call, not just a read). |
| 8 | Idempotency | `confirmCharge`'s terminal-status short-circuit is good, but it has **no optimistic-concurrency guard** (unlike `refund()`'s hardened compare-and-swap claim from 3.6C.3.0) — two concurrent invocations for the same row before either completes could each independently call `verifyPayment`, and the later `UPDATE` could overwrite a status the webhook delivered in between with a stale value from its own, slower-arriving `verifyPayment()` response. This is a real, previously-undocumented correctness gap in `confirmCharge`, surfaced by this analysis, not present in `refund()` (which was specifically hardened against exactly this class of race). |
| 9 | Provider verification | Its whole purpose — the strongest possible source of truth. But also the **one path in this entire session that would make a live, anonymous-triggerable call to Moyasar without ever having been exercised against a real Moyasar account** — the narrowest, truest form of the G-6 gap. |
| 10 | Webhook race conditions | Actively resolves ambiguity faster than A, but **introduces** the race described in #8 — a genuinely new risk, not merely an unresolved old one. |
| 11 | Retry behavior | A failed call is retryable; the idempotent short-circuit protects against a second *successful* Moyasar call once terminal, but the mid-flight race in #8 is not covered by it. |
| 12 | Failure modes | `confirmCharge` today has **no internal try/catch** around `adapter.verifyPayment` — a Moyasar network/API error would propagate as a raw exception; any wrapping Edge Function would need its own handling to avoid leaking that raw error to the browser (not free by simple reuse). |
| 13 | Information disclosure | Same field set as A, but the act of a successful call is itself more informative (proves live provider-call capability). |
| 14/15 | Amount/currency/providerRef exposure | Same policy as A — amount/currency safe, `providerRef` never exposed. |
| 16 | RLS implications | Cannot be a pure SQL function — calling an external HTTPS API is not something PL/pgSQL/SQL functions in this codebase's architecture can do; **this design structurally requires an Edge Function** (service_role + the JS Moyasar adapter), a hard architectural difference from Design A. |
| 17 | Operational complexity | **Highest** — new Edge Function, new deployment, new CORS, new and more urgent rate-limiting need, a third code path now touching the live Moyasar secret key (`startCharge`, `refund`, and now this). |
| 18 | Testability | Same DI-based testability as any Edge Function in principle — but *production* correctness still depends on real Moyasar verification (G-6) in a way Design A structurally never does. |
| 19 | Production readiness | **Lower** — directly collides with this task's own CRITICAL rule and with G-6's long-standing, four-times-independently-confirmed status as unresolved. |
| 20 | Compatibility with existing architecture | Reuses `confirmCharge` (no logic duplication — good), but introduces a **new risk class**: this would be the first time an anonymous customer could trigger a live third-party API call merely by holding a key. Every existing Moyasar call today is customer-initiated-once (`startCharge`), provider-initiated (`webhook`), or admin-initiated (`refund`) — none are anonymously re-triggerable on demand. |

---

# DESIGN_C_ANALYSIS — Hybrid (read first, bounded active confirmation when appropriate)

Evaluated as literally proposed (one combined endpoint doing A then conditionally B) **and** as the decomposed variant this spec recommends (A now, B relocated to 3.6E). The single-endpoint variant inherits **all** of Design B's criteria 1, 5, 6, 8, 9, 12, 16, 17, 19 risks the moment it contains *any* code path that can call Moyasar from an anonymous request — bounding it by a time threshold reduces frequency, not the underlying risk class (an attacker can simply wait past the threshold, or hold many keys). The **decomposed** variant (A now; B's mechanism moved into a scheduled, non-anonymous 3.6E job) inherits Design A's full row of low-risk properties for the browser-facing surface, and confines Design B's higher-risk properties to a context (server-scheduled, bounded volume, no anonymous trigger) where they are the *correct*, already-accepted risk profile for background reconciliation — the same profile every other deferred G-5/G-6-adjacent reconciliation gap in this session has always been slated for. **This is the recommended design**, specified in full below.

---

# SECURITY_THREAT_MODEL

| Threat | Design A alone | Decomposed A+3.6E (recommended) | Single-endpoint C / B |
|---|---|---|---|
| Anonymous read of another tenant's payment status | Closed — key is unique-indexed, unguessable | Closed | Closed |
| Anonymous-triggered live Moyasar call / provider rate-limit abuse | N/A — no such path exists | N/A — 3.6E's trigger is scheduled, not anonymous | **Open** — the exact risk flagged in Design B row 6 |
| Stale status shown while webhook is in flight | Present but honestly represented (pending state) | Bounded by 3.6E's eventual sweep | Present, resolved faster but with the race in Design B row 8 |
| Webhook/confirmCharge concurrent-write race | N/A — no write path here | Present inside 3.6E's own future design (must be addressed there, e.g. with a `refund()`-style optimistic-concurrency guard) | Present, anonymously triggerable, higher frequency |
| Redirect-parameter spoofing (classic G-6) | N/A — no redirect parameter is ever read by this capability | N/A | N/A (orthogonal to all three designs — mitigated purely by frontend design, see PROVIDER_VERIFICATION) |
| Enumeration of valid idempotency keys | Mitigated by key entropy + null-safe empty-result behavior | Same | Same, higher stakes per successful guess |

---

# RECOMMENDED_DESIGN

**Design A**, implemented as a new `SECURITY DEFINER` SQL function mirroring `get_orders_status_secure`, for the browser-facing surface. **Explicitly paired with a recommendation** (not a decision made here) that the already-deferred **3.6E reconciliation phase** absorb Design B's active-confirmation mechanism as a scheduled, non-anonymous process — closing the "stuck pending" gap without ever exposing an anonymous provider-call trigger. This is not new scope invention: 3.6E has been named and deferred for exactly this class of problem (G-5 reconciliation) throughout this entire session.

---

# EXACT_FUTURE_API_CONTRACT

**Not an Edge Function.** A PostgreSQL function, callable directly via `supabase.rpc(...)` using the project's `anon` key — identical calling convention to `get_orders_status_secure`.

- **Function name**: `get_payment_status_by_idempotency_key`
- **Call**: `supabase.rpc('get_payment_status_by_idempotency_key', { p_idempotency_key: key })`
- **HTTP method**: N/A directly — PostgREST's RPC convention (`POST` to `/rest/v1/rpc/get_payment_status_by_idempotency_key` under the hood, exactly like every other RPC in this codebase); no custom method choice to make.

## REQUEST_SCHEMA

| Parameter | Type | Required | Validation |
|---|---|---|---|
| `p_idempotency_key` | `text` | Yes | Exact-match `WHERE` only — no format assumed or enforced in SQL (mirrors `order_access_token`'s own lack of format constraint); a malformed/empty value simply matches nothing. |

## RESPONSE_SCHEMA

Table return, **zero or one row** (unique index guarantees at most one):

| Field | Type | Allowed |
|---|---|---|
| `status` | `text` | One of `TransactionStatus`'s 6 values (`initiated`, `pending`, `succeeded`, `failed`, `cancelled`, `refunded`) |
| `amount` | `numeric` | Verbatim from `payment_transactions.amount` |
| `currency` | `text` | Verbatim from `payment_transactions.currency` |
| `updated_at` | `timestamptz` | Verbatim — lets the frontend show "checking since…" honestly |

**Forbidden response fields** (never selected, never derivable): `id` (`paymentTransactionId` — per 3.6D-C's established "not needed browser-side" rule), `provider_ref`, `restaurant_id`, `invoice_id`, `metadata` (contains the full checkout snapshot, including `items`/`notes` — a real PII surface if ever exposed wholesale), `raw` (Moyasar's raw payload — provider-shape-dependent, never safe to expose unfiltered), `failure_reason` (raw provider/internal error text — recommended omitted entirely rather than exposed or mapped, pending an owner decision; see OWNER_DECISIONS_REQUIRED).

**Empty result** (zero rows): the standard, non-distinguishable response for both "key never existed" and "key exists but caller got it wrong" — no error, no exception, matching `get_orders_status_secure`'s existing null-safe convention.

## ILLUSTRATIVE_SQL (not to be created by this task — for the future implementation task only)

```sql
CREATE OR REPLACE FUNCTION public.get_payment_status_by_idempotency_key(p_idempotency_key text)
 RETURNS TABLE(status text, amount numeric, currency text, updated_at timestamptz)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT status, amount, currency, updated_at
    FROM public.payment_transactions
   WHERE idempotency_key = p_idempotency_key
$function$;

GRANT EXECUTE ON FUNCTION public.get_payment_status_by_idempotency_key(text) TO anon, authenticated;
```

This mirrors `sql/order_status_reads.sql`'s own documented style (`STABLE SECURITY DEFINER`, `SET search_path TO 'public'`, immediately followed by an explicit `GRANT EXECUTE ... TO anon, authenticated`, the exact pattern independently confirmed in `sql/000_schema_migrations_table.sql` and `sql/menu_branding.sql`). **Not executed, not created, not applied by this task.**

---

# STATE_MACHINE

```
Frontend holds paymentIdempotencyKey
        │
        ▼
  RPC call ──► zero rows           → "not_found" (garbage/expired key — frontend treats as unrecoverable, offer restart)
        │
        └──► one row, status ∈ {initiated, pending}   → "pending" (webhook/reconciliation not yet resolved — poll again, never say failed)
                            status = succeeded          → "succeeded" (safe to proceed to order creation, 3.6D.6's job)
                            status = failed              → "failed" (safe to offer retry, per 3.6D-A's ERROR_STATE_MAPPING)
                            status = cancelled            → "failed"-equivalent messaging (customer or timeout cancelled)
                            status = refunded              → not expected in this flow (refund happens post-order); treat as "succeeded"-then-refunded, out of this spec's scope to design UI for
```

`initiated`/`pending` are the only truly ambiguous states — everything else is a direct, safe status passthrough.

---

# AUTHENTICATION_AUTHORIZATION

**Authentication**: none beyond the standard Supabase anon key already attached by `supabase-js` to every RPC call — no login, consistent with guest checkout (ADR-9), identical to `get_orders_status_secure` today.
**Authorization**: capability-by-possession of the exact `paymentIdempotencyKey` — the same trust model already accepted in production for `order_access_token`. No additional identity check is needed or proposed.

---

# CORS

Not applicable as a separate decision — RPC calls go through Supabase's existing project-level REST/RPC gateway, whose CORS configuration already serves every other anon-callable RPC in this codebase (`get_orders_status_secure`, `cancel_order_by_customer`, `menu_branding`, etc.) unchanged. No new CORS policy is introduced or needed.

---

# RATE_LIMITING

Unresolved, exactly as already tracked (`RATE_LIMITING_REQUIRES_INFRA_DECISION`, 3.6D-C, unchanged). This design's abuse profile is materially lower than any design that can trigger a live Moyasar call (see SECURITY_THREAT_MODEL) — a read-only, indexed, side-effect-free query — but it is not zero-risk (a scripted client could still poll excessively). Recommendation: no new rate-limiting mechanism needs to be built *specifically* for this capability before shipping it; whatever project-wide rate-limiting decision eventually gets made (per 3.6D-C's own deferred recommendation) should cover it too.

---

# ENUMERATION_RESISTANCE

Key space: `pay_` + `crypto.randomUUID()` — ~122 bits of entropy per key, generated exclusively server-side-or-client-side-but-always-random (never sequential, never derived from any predictable value). Unknown-key behavior is a plain empty result, indistinguishable from "valid key, transaction just doesn't exist yet" — no timing or error-shape side channel is introduced by this function's design (a single indexed equality lookup has effectively uniform response time regardless of match/no-match).

---

# LOGGING

This is a pure PostgreSQL function — no application-level logging layer applies to it directly (unlike an Edge Function). Standard Postgres/Supabase query logging (already whatever this project's baseline is) applies unchanged; no new logging requirement is introduced. If a future implementation wraps this RPC in a thin JS helper (for testability/consistency), that helper should follow the same "no PII, no secrets" logging discipline already established in `TASK_3_6D_E`'s `LOGGING` section, but this is optional convenience, not a requirement of the RPC itself.

---

# PROVIDER_VERIFICATION

**None performed by this capability.** This is deliberate, not an oversight: Design A never calls Moyasar. The frontend must never treat the mere fact of landing on the callback URL (or any parameter Moyasar may have appended to it) as proof of anything — the *only* authoritative signal this design surfaces is whatever `payment_transactions.status` already holds, itself written exclusively by `startCharge` (initial), the webhook (async provider push), or, in the future, 3.6E's reconciliation sweep (bounded active `confirmCharge` calls, from a trusted, non-anonymous, scheduled context). No Moyasar-specific redirect parameter is read, parsed, or assumed to exist by this design at any point.

---

# WEBHOOK_RACE_HANDLING

This design does not resolve the webhook race — it **honestly reports** it. If the webhook hasn't yet updated the row when the browser polls, the response is `pending`/`initiated`, and the frontend's job (3.6D.5, not this spec) is to represent that as "still confirming, please check back," matching 3.6D-A's own `requires_reconciliation` treatment almost exactly, and explicitly **never** as failure. Closing this gap for transactions that stay `pending` unusually long is 3.6E's job, via a scheduled sweep — not this RPC's, and not achievable by tightening this RPC's own logic (it has nothing more to check).

---

# IDEMPOTENCY

Read-only; naturally idempotent; safe to call any number of times with no state change and no side effect. No idempotency *mechanism* is needed because there is nothing to deduplicate.

---

# TEST_STRATEGY

For the future implementation task (not built here): a thin JS wrapper (optional, e.g. `checkPaymentStatus(idempotencyKey, {db})` in a new, small, focused module) tested with this session's established `makeChain`/`makeDb` mock pattern, covering: known key → exact passthrough of `status`/`amount`/`currency`/`updated_at`; unknown key → a safe "not found" result, no exception; a source-scan test (mirroring the pattern already used in `PFC2-15`/`PFCP-12`) asserting the wrapper's own code never references `provider_ref`, `metadata`, `raw`, or `service_role`. If the RPC itself is exercised against a real (staging) database in a later integration-style test, it should assert the exact forbidden-field list is genuinely absent from the returned row shape, not merely absent from application code.

---

# DEPLOYMENT_REQUIREMENTS

For the future implementation task: a new file `sql/payment_status_read.sql` (or a similarly-named sibling to `sql/order_status_reads.sql`), containing the function definition and its `GRANT EXECUTE` statement, applied via the same owner-authorized migration process already used for every other SQL function in this repository (Supabase MCP `apply_migration` or equivalent, per this project's own established workflow) — **not** applied by this specification task.

---

# OWNER_DECISIONS_REQUIRED

1. **Approve Design A** (the RPC, decomposed from Design C) as the architecture for 3.6D.4's browser-facing need, or direct a different choice.
2. **Approve deferring active confirmation** (Design B's mechanism) to the already-tracked 3.6E reconciliation phase, rather than building any anonymous-triggerable Moyasar-calling endpoint now.
3. **Approve or amend the exact response field list** — in particular, whether `failure_reason` should be omitted entirely (recommended) or mapped to a small, safe, generic category set and exposed.
4. **Approve the exact function name** (`get_payment_status_by_idempotency_key`) or propose an alternative consistent with this codebase's naming conventions.
5. **Frontend polling cadence/backoff policy** — not decided here (a 3.6D.5-adjacent UI concern), flagged so it isn't silently assumed later.
6. **Confirm this capability should be strictly payment-scoped**, not merged with or generalized alongside the existing order-status RPCs (`get_orders_status_secure`) — recommended to keep separate, since payment and order identity are already treated as distinct concepts throughout this entire arc (3.6A-2 onward).
7. **When to commission the 3.6E reconciliation design itself** (out of this spec's scope to design in detail — only its existence and boundary are referenced here as the recommended home for active confirmation).

---

# EXPLICIT_NON_GOALS

- Implementing this RPC, or any Edge Function.
- Designing 3.6E's reconciliation job in detail (only its role as the recommended home for active confirmation is specified).
- Deciding 3.6D.5's actual result-mapping UI copy/states (already scoped elsewhere).
- Rate limiting implementation.
- The deferred `startCharge` `restaurant_id` idempotency tenant-scoping fix — unrelated to this capability, not addressed.
- Any Moyasar call, sandbox or otherwise.
- Wiring `PaymentFirstCheckoutPanel` or any other frontend component to this (not-yet-existing) capability.

---

# DEPENDENCY_GATES

| Phase | Status |
|---|---|
| 3.6D.4-A (this spec) | Complete — pending owner approval |
| 3.6D.4 (actual callback implementation) | Blocked on approval of this spec + a future implementation task (mirrors 3.6D-C → 3.6D-E) |
| 3.6D.5 (result-mapping UI) | Blocked on 3.6D.4 |
| 3.6D.6 (order confirmation reuse) | Blocked on 3.6D.4/3.6D.5 |
| 3.6D.7 (E2E tests) | Blocked on all prior phases |
| 3.6E (reconciliation) | Independently already-deferred; this spec recommends it absorb Design B's mechanism, but does not itself unblock or schedule 3.6E |

---

# IMPLEMENTATION_PLAN_FOR_FUTURE_TASK

1. Owner approves this spec (or an amended version).
2. A dedicated implementation task creates `sql/payment_status_read.sql` exactly as specified, applies it via an owner-authorized migration.
3. Same task adds a thin, optional JS wrapper + focused tests (TEST_STRATEGY above).
4. Regression run, report, following this session's established pattern — **frontend wiring stays out of that task too**, unless explicitly instructed otherwise (mirrors how 3.6D-E did not wire the frontend either).
5. A **separate**, later task wires this capability into an actual callback-landing UI component (consuming `usePaymentIdempotencyKey`'s persisted key, per SESSION_RETRY_CONTINUITY) — this is the true "3.6D.4" deliverable, now unblocked.
6. 3.6E, whenever separately commissioned, adds the scheduled active-confirmation sweep this spec recommends as Design B's proper home.

---

# WHY_THE_CHOSEN_DESIGN_IS_SAFER_THAN_RESTARTING_CHECKOUT

Re-confirmed from `TASK_3_6D_4`'s own audit, restated precisely here because it is this spec's foundational constraint: `initiatePaymentFirstCheckout` **always** re-runs `create_order(p_dry_run=true)` before ever reaching `startCharge`'s idempotent-replay check. If cart/menu state has changed since the original attempt — an item went unavailable, a price drifted — that fresh dry-run can return `rejected` or `price_changed`, **for a payment that may have already succeeded**. Reporting either of those to a customer whose money has already been taken would be a direct, severe violation of this task's own CRITICAL rule never to imply a wrong outcome. The recommended RPC design has no such failure mode: it reads `payment_transactions` by identity alone, with **no** dependency on current cart state, current menu state, or any re-derivation of pricing — the exact property `startCheckout`-reuse structurally lacks.

---

# GIT_STATUS

No new or modified production files. `git status --short` is unchanged from the 3.6D.4 baseline except for this new report file (untracked, `??`). No commit, no push, no merge.

# REGRESSION_BASELINE

**853/853 remains unchanged** — this task performed zero code changes; no test run was needed to prove this, but the tracked-file diff (`git diff --stat`) was re-confirmed identical to the pre-existing baseline before writing this report.

---

# NEXT_STEP

Awaiting explicit owner approval on the `OWNER_DECISIONS_REQUIRED` list above before any implementation task begins. Per instruction: **no implementation was performed in this task**, and 3.6D.5/3.6D.6/3.6D.7/3.6E remain unstarted.

---

*Report generated 2026-08-27. Specification only — no code, no schema, no deployment, no Moyasar call, no commit, no push, no merge.*
