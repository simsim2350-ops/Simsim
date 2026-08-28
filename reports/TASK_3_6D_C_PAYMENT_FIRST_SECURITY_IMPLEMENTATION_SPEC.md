# Task 3.6D-C — Payment-First Security Decisions & Implementation Spec

**Specification only. No code, schema, or database changed. No Edge Function created. No Moyasar call.**

---

# EXECUTIVE_SUMMARY

This task resolves all 18 open decision points from `TASK_3_6D_B_PAYMENT_FIRST_SERVER_ENTRY_POINT_AUDIT.md` into one authoritative, unambiguous specification for `supabase/functions/payment-first-checkout/`. Two decisions required going beyond restating the prior audit's findings: **(1)** rate limiting has no reliable mechanism achievable without a schema change (Edge Functions run as stateless, per-request instances — in-memory counters do not persist across them), so this task specifies the target architecture (a database-backed counter) as future work and separately recommends checking for a zero-code Supabase-platform-level control now; **(2)** re-inspecting `initiatePaymentFirstCheckout`'s actual parameter list surfaced that it has **no native QR-token support at all** — it only ever accepts `restaurant_id`/`branch_id` directly — meaning the Edge Function itself, not `checkoutOrchestration.js`, must own the QR-token → tenant resolution step, replicating (never modifying) `create_order_from_table_qr`'s existing read-only lookup criteria. A third finding shaped the HTTP-status design: because `usePaymentFirstCheckout`'s already-built `orchestrate` wrapper does `if (error) throw error`, **every backend-recognized `status` value (including `rejected`/`failed`) must be returned as HTTP 200** — using a non-2xx status for a legitimate business outcome would misroute it into the hook's `error` (unexpected-exception) path instead of its correct `result`-based state, silently breaking the already-tested state machine.

**This task produces a specification only — no ambiguity, but also no implementation.**

---

# DECISIONS

Eighteen decisions, each with exactly one recommendation, per instruction.

---

# RATE_LIMITING

**Decision: mark `RATE_LIMITING_REQUIRES_INFRA_DECISION` for a fully-reliable, code-only solution — but recommend concrete, layered action, not a shrug.**

- **Option B (in-memory throttling) explicitly rejected**: Edge Functions (Deno-based, per Supabase's platform) run as independent, potentially-multiple, stateless instances — a `Map`/counter held in module-level memory would not be shared across concurrent invocations or cold starts, giving **no real guarantee**, exactly the "cannot work reliably across instances" failure mode this task explicitly forbids relying on.
- **Option C (database-backed counter) is the only mechanism that would actually be reliable** — Postgres is already this system's single source of truth for everything else, and a sliding-window or fixed-window counter table (`payment_checkout_rate_limit(key text, window_start timestamptz, count int)`, keyed by e.g. `restaurant_id` and/or a hashed client IP) would work correctly across any number of concurrent Edge Function instances, exactly like `uq_paytx_idempotency_key`/`uq_webhook_provider_event` already reliably coordinate across concurrent requests today. **This requires a schema change — not created in this task**, per instruction; specified here as the target for a future, separately-approved migration.
- **Option A (Supabase/project gateway limits)**: **recommended as an immediate, zero-code, zero-schema-change parallel action** — check whether the current Supabase project plan exposes any built-in per-function or per-project request-rate controls at the dashboard/infrastructure level (distinct from the Auth-specific rate limits already verified in Task 1.4, which do **not** cover Edge Function invocations at all, confirmed in 3.6D-B). This is an *infrastructure configuration* question, not a code question — outside what this repository's source can answer, hence the `_REQUIRES_INFRA_DECISION` marker.

**Recommended policy** (target, for whichever mechanism is eventually chosen):
- **Per IP**: a conservative cap (e.g., 10 checkout initiations per 5-minute window) — generous enough for a genuine customer retrying a failed card, tight enough to blunt scripted spam.
- **Per tenant (`restaurant_id`)**: a much higher cap (e.g., 300/5-minute window) — protects a single restaurant's traffic from starving others sharing infrastructure, without constraining legitimate high-volume restaurants.
- **Per idempotency key**: **not separately rate-limited** — already fully governed by `startCharge`'s own existing idempotent-replay behavior (a repeated call with the same key never re-hits the provider, so it's not a spam vector in the same sense).
- **Burst behavior**: fixed or sliding window, not a hard per-second cap — payment initiation is inherently bursty around meal times; a smooth per-window limit is more appropriate than a strict rate.
- **Response on limit exceeded**: HTTP `429`, body `{status: 'rejected', reason: 'rate_limited'}` — consistent with the "always 200 for backend-recognized outcomes" rule NOT applying here, since this is a *request-level* rejection before any backend logic runs at all (ERROR_MAPPING below draws this exact line).
- **Retry behavior**: the browser should **not** auto-retry on a `429` — surface it to the customer as "please wait a moment and try again," no automatic re-invocation.

---

# IDEMPOTENCY

**Decision: B — defer the `restaurant_id`-scoping fix to a separate, explicitly-scoped hardening task, with one interim, code-free (for this task) policy specified for the Edge Function's own contract.**

- **Severity re-evaluated, precisely**: `startCharge`'s idempotency-key lookup (`SELECT ... WHERE idempotency_key = idemKey`, no `restaurant_id` filter) means a caller who already knows or guesses a valid key gets back *that* transaction's `status`/`redirectUrl` — an **information-disclosure** risk (which restaurant a given key belongs to, and that transaction's current status), **not a payment-theft risk** (no code path lets anyone charge money or receive goods using another tenant's transaction — `createOrderFromSuccessfulPayment`'s own tenant check, unmodified, would still catch any attempt to misuse it for order creation).
- **Entropy matters directly**: server-generated keys (`newIdempotencyKey('pay')`, effectively `crypto.randomUUID()`-based) are computationally unguessable — the practical risk is only real if a **client-supplied** key is ever accepted with low entropy or is otherwise leaked/observed.
- **Recommended interim policy, specifiable now without touching `paymentService.js`**: the Edge Function's own request-handling logic should treat `paymentIdempotencyKey` as **write-once-per-session, echo-only** — accept a client-supplied value only when it's plausibly a value the *server itself* already returned in an earlier response to *this same* checkout attempt (a documented contract expectation, not a technically-enforced one, since the field remains an opaque string either way) — never accept an arbitrary, freshly-invented low-entropy string as if it were equally trustworthy. This doesn't require a code change to `paymentService.js`, only a documented policy for how the new Edge Function's own callers (the frontend hook) are expected to use the field.
- **Recommended future task** (not implemented here): add `.eq('restaurant_id', input.restaurantId)` to `startCharge`'s existing idempotency pre-check `SELECT` (`src/payments/services/paymentService.js`, the exact line already identified in 3.6D-B) — a small, single-line, low-risk, easily-tested change, fully compatible with all of `paymentService.test.js`'s existing 32 refund/charge tests (none of which exercise cross-tenant key collision, so none would need updating) and requiring **no schema change** (the column already exists on the row being looked up).

---

# RETURN_URL

**Mandatory, fully specified — never accepted from the browser.**

- **Fixed callback route**: reuses the **existing** `/menu/:slug` route (no new route introduced, consistent with 3.6D-A's finding that this app has exactly one customer-facing route today) — distinguished by a query parameter, not a new path.
- **Server-side construction**: the Edge Function builds the full URL itself: `` `${PUBLIC_APP_BASE_URL}/menu/${restaurantSlug}?payment_callback=${encodeURIComponent(paymentIdempotencyKey)}` ``, optionally appending `&t=${encodeURIComponent(table_qr_token)}` if the original request was QR-scoped (so the customer returns to the exact same table-scoped session, matching `PublicMenu.jsx`'s own existing QR-token-in-URL convention).
- **Base URL source**: a new Deno environment secret, `PUBLIC_APP_BASE_URL` (e.g. `https://app.simsim.example`), set once at the Supabase project level — **never** derived from the incoming request's `Origin`/`Referer`/`Host` headers (which are attacker-controllable) — this is exactly what closes the open-redirect risk 3.6D-B identified, by construction rather than by validation logic.
- **Restaurant slug handling**: taken from the value the Edge Function itself already resolved and validated for tenant purposes (TENANT sections below) — never re-read from any other part of the request body.
- **Branch handling**: **not included in the return URL** — not needed; the callback page re-derives branch/table context from its own existing page-load logic (`PublicMenu.jsx`'s current behavior, unchanged).
- **QR handling**: the original `table_qr_token`, if present, is echoed back into the return URL (above) — required so the returning customer lands back in the correct table-scoped session, not a generic slug-browse session.
- **Allowed origin**: exactly one — the fixed, server-configured `PUBLIC_APP_BASE_URL` — no allow-list needed since there is only ever one legitimate value.
- **Encoding rules**: standard `encodeURIComponent` for every interpolated value (idempotency key, QR token).
- **Query parameters**: `payment_callback` (required, the marker + payment attempt identifier, value = `paymentIdempotencyKey`), `t` (conditional, only if QR-scoped, value = `table_qr_token`).
- **Payment attempt identifier**: `paymentIdempotencyKey` itself — already unique, already high-entropy, already returned to the browser regardless — **no new identifier is invented**.

---

# QR_TENANT

**Critical finding, not previously fully surfaced**: `initiatePaymentFirstCheckout`'s actual parameter list (re-verified from source in 3.6D-B, re-confirmed here) has **no `table_qr_token` field at all** — it only accepts `restaurant_id`/`branch_id` directly, because its internal dry-run call uses the plain `create_order` RPC, not `create_order_from_table_qr`. **This means the QR-token → tenant resolution must happen inside the new Edge Function itself**, before `initiatePaymentFirstCheckout` is ever called — `checkoutOrchestration.js` cannot do this for us and is not modified to add this capability (out of scope, and unnecessary — see below).

**Final behavior, fully specified**:
```
Browser → { table_qr_token } → Edge Function
  → SELECT t.id, t.table_number, t.restaurant_id, t.branch_id
    FROM restaurant_tables t
    JOIN restaurants r ON r.id = t.restaurant_id
    JOIN branches b ON b.id = t.branch_id
    WHERE t.qr_token = $1
      AND t.qr_enabled = true AND t.status = 'active'
      AND r.is_active = true AND coalesce(r.platform_suspended, false) = false
      AND b.restaurant_id = t.restaurant_id
      AND b.is_active = true AND coalesce(b.is_paused, false) = false
    (read-only, using the Edge Function's own service_role db client)
  → resolved restaurant_id, branch_id, table_id/table_number
  → passed into initiatePaymentFirstCheckout as p_restaurant_id/p_branch_id/p_table_number
```

This is **exactly** `create_order_from_table_qr`'s own existing `SELECT` criteria (re-read from `sql/order_idempotency.sql` in this session's earlier work), replicated as a **read-only lookup inside the new Edge Function's own code** — **`create_order_from_table_qr` itself is not modified, not called, not touched in any way.** The browser sends only the opaque `table_qr_token`; it **never** supplies `restaurant_id`/`branch_id` for the QR path, and any such fields in the request body are simply ignored/absent from the request contract for this path (REQUEST_CONTRACT below).

---

# NON_QR_TENANT

**Final behavior**: client sends `restaurant_slug` (never a raw `restaurant_id`) + `branch_id` (the branch the customer already selected in the currently-loaded, public menu UI). The Edge Function resolves `restaurant_id` from `restaurant_slug` via a **public** `SELECT id FROM restaurants WHERE slug = $1 AND is_active = true AND coalesce(platform_suspended, false) = false` — the exact same trust level `PublicMenu.jsx` already operates at today for simply *loading* the menu (this is not privileged data; menu browsing is intentionally public).

**What the Edge Function validates**: only that a restaurant matching the slug exists and is active — it does **not** re-implement branch-capability checks (delivery/takeaway enabled, branch active) itself.

**What `create_order` validates** (unchanged, inherited automatically via the dry-run call inside `initiatePaymentFirstCheckout`): branch belongs to the resolved restaurant, branch is active/not paused, branch supports the requested `type` (delivery/takeaway capability flags), every product/option belongs to that restaurant+branch — **all of this is already correctly enforced today and requires no duplication in the Edge Function.**

**No authentication is invented** — guest checkout remains guest checkout; the Edge Function performs zero identity verification for the non-QR path, exactly matching `useCheckout.js`'s own current, unmodified behavior.

---

# REQUEST_CONTRACT

**Final schema**:

| Field | Required/Optional/Conditional | Source |
|---|---|---|
| `table_qr_token` | **Conditional** — required for QR-scoped checkout, absent for slug-browse | Client-supplied (opaque token) |
| `restaurant_slug` | **Conditional** — required for slug-browse checkout, absent/ignored for QR-scoped | Client-supplied |
| `branch_id` | **Conditional** — required for slug-browse checkout; **ignored** (server-derived) for QR-scoped | Client-supplied (slug path) / **server-derived** (QR path) |
| `type` | **Required** | Client-supplied (`'dine_in'|'takeaway'|'delivery'`) |
| `table_number` | **Conditional** — required for `dine_in` non-QR; **server-derived** for QR (from the resolved table) | Client-supplied / server-derived |
| `delivery_address` | **Conditional** — required for `delivery` | Client-supplied |
| `customer_name` | **Optional** | Client-supplied |
| `customer_phone` | **Required** | Client-supplied |
| `notes` | **Optional** | Client-supplied |
| `items` | **Required** | Client-supplied (selectors only — no price fields, unchanged from the entire session's established contract) |
| `coupon_code` | **Optional** | Client-supplied (selector only) |
| `clientTotal` | **Optional, advisory only** | Client-supplied — never authoritative |
| `paymentIdempotencyKey` | **Optional** | Client-supplied, echo-only policy (IDEMPOTENCY above) |

**Explicitly absent from the request contract, by design**: `service_role` (never applicable to a request body), `returnUrl` (RETURN_URL above — server-constructed, never accepted), `providerRef` (never a client concern), `restaurant_id`/`table_id` as raw fields (always server-resolved, never trusted directly from the client even if offered), `currency` (CURRENCY below — never client-controlled).

---

# RESPONSE_CONTRACT

**Final schema, by status** (all returned as HTTP `200` — see ERROR_MAPPING for why):

| `status` | Response body |
|---|---|
| `rejected` | `{status: 'rejected', reason}` |
| `price_changed` | `{status: 'price_changed', dryRun: {subtotal, tax, delivery_fee, total}}` |
| `failed` | `{status: 'failed', reason}` |
| `retryable_error` | `{status: 'retryable_error', reason}` |
| `requires_reconciliation` | `{status: 'requires_reconciliation'}` — deliberately minimal, no raw `message` |
| `succeeded` | `{status: 'succeeded', redirectUrl, total, currency, paymentIdempotencyKey}` |

**`providerRef` is never exposed, in any status** — confirmed final, per instruction, and per 3.6D-B's own reasoning (no legitimate browser use for it).

**`paymentTransactionId` is NOT required by the later callback phase and is NOT exposed.** Reasoning, resolved cleanly: the callback/redirect-return flow (3.6D.4) needs *some* identifier to look up "what happened to my payment" when the customer returns — but `paymentIdempotencyKey` already serves this role completely (it's already browser-visible, already persisted client-side per 3.6D-A's SESSION_RETRY_CONTINUITY design, and a future "check payment status" endpoint can key off it exactly as easily as off the raw internal UUID). Exposing the internal `payment_transactions.id` in addition would be pure surface-area with no functional benefit — omitted.

---

# AUTHORITATIVE_TOTAL

**Final rule, confirmed unchanged from 3.6D-B, restated as binding**: for `status: 'succeeded'`, `total`/`currency` in the response **must** come from a fresh `SELECT amount, currency FROM payment_transactions WHERE id = $1`, executed by the Edge Function **after** `initiatePaymentFirstCheckout` returns `succeeded`, using the `paymentTransactionId` from that return value (used internally by the Edge Function only — never itself exposed, per RESPONSE_CONTRACT). **Never** the client's cart calculation, **never** a `dryRun.total` value carried forward from an earlier `price_changed` round (which could be stale relative to what was actually, finally charged), **never** anything parsed from the raw Moyasar provider response.

---

# CURRENCY

**Final policy**: the browser never supplies a `currency` field at all (absent from REQUEST_CONTRACT). The Edge Function does not need to "validate" a client value that was never accepted in the first place — it simply never passes a `currency` field through to `initiatePaymentFirstCheckout` at all, relying on that function's own existing behavior (defaults to `'SAR'` when `input.currency` is `undefined`) — **the enforcement `checkoutOrchestration.js` already performs stays exactly as-is, unmodified**; the Edge Function's contribution is simply to never give a client the opportunity to send anything else.

---

# CORS

**Recommendation: A — retain the existing `'*'` convention**, matching both `payment-webhook` and `create-platform-admin`.

**Explicit justification, since this decision requires one**: this is a **guest/anonymous** endpoint — it uses no session cookies, no credentialed request state of any kind (the anon key is a public, non-secret API key by design, safe to send from any origin). CORS's primary security purpose is preventing a malicious site from making *credentialed* requests on a logged-in user's behalf (CSRF-adjacent) — that threat model simply doesn't apply here, since there is no session to hijack. **The real protection for this endpoint lives entirely at the application layer**, not the origin layer: server-side tenant resolution (QR_TENANT/NON_QR_TENANT), server-constructed `returnUrl` (RETURN_URL), server-computed amounts (AUTHORITATIVE_TOTAL) — none of these depend on or are weakened by which origin the request came from. Restricting CORS here would add operational complexity (maintaining an allow-list across production/staging/preview domains) for a threat class this endpoint isn't actually exposed to.

---

# AUTHENTICATION

**Final**: default Supabase gateway JWT verification (i.e., **not** `verify_jwt: false` — that exception is specific to `payment-webhook`'s non-Supabase external caller, Moyasar, and does not apply here). The browser calls via `supabase.functions.invoke(...)`, which automatically attaches the `anon` key — this satisfies the gateway's default check without requiring any logged-in customer session. **No customer login is introduced. No custom auth scheme is introduced.** The Edge Function's own body performs **zero** identity verification (unlike `create-platform-admin`) — it moves straight to tenant *resolution* (QR token or slug), which is a separate concern from *authentication*.

---

# ERROR_MAPPING

**The governing rule, stated once, precisely**: `usePaymentFirstCheckout`'s existing, already-tested `orchestrate` wrapper distinguishes "backend answered with a recognized outcome" (→ `result`) from "the call itself failed unexpectedly" (→ `error`) purely based on whether `supabase.functions.invoke` populated `data` or `error` — which is purely a function of the Edge Function's **HTTP status code** (2xx → `data`; non-2xx → `error`). **Therefore every backend-recognized `status` value must be returned as HTTP 200**, regardless of whether it represents a "success" or a "failure" from a business perspective — using a 4xx/5xx for `rejected`/`failed`/etc. would silently misroute a normal, well-understood outcome into the hook's `unexpected_exception` path, breaking its already-tested `deriveState` logic without any code change to the hook itself being at fault.

| `status` | HTTP | Browser-safe JSON | Internal logging |
|---|---|---|---|
| `rejected` | **200** | `{status, reason}` | `console.warn` — expected, not alarming |
| `price_changed` | **200** | `{status, dryRun}` | `console.log` — routine |
| `failed` | **200** | `{status, reason}` | `console.warn` |
| `retryable_error` | **200** | `{status, reason}` | `console.warn` |
| `requires_reconciliation` | **200** | `{status}` | **`console.error`** — needs human attention, this is the one outcome that should be loud in logs even though it's quiet to the customer |
| `succeeded` | **200** | `{status, redirectUrl, total, currency, paymentIdempotencyKey}` | `console.log` |
| Malformed request body / missing required field | **400** | `{error: 'invalid_request'}` | `console.warn` with the actual validation failure reason |
| Wrong HTTP method | **405** | `{error: 'method_not_allowed'}` | — |
| Rate limit exceeded (once implemented) | **429** | `{status: 'rejected', reason: 'rate_limited'}` | `console.warn` |
| Genuinely unexpected internal exception | **500** | `{error: 'internal_error'}` (generic, matching `payment-webhook`'s exact existing convention) | `console.error` with the real exception, never returned to the browser |

**No raw exception text, SQL error message, or Moyasar error payload is ever included in any browser-facing body, at any status.**

---

# NETWORK_TIMEOUT

**Final behavior**: Browser → Edge Function → payment initiation → HTTP response lost. The browser **must not** auto-generate a new `paymentIdempotencyKey`, and **must not** automatically fire a second checkout request. The **safe state** to present is functionally identical to `requires_reconciliation` — "we're not sure if this went through, please wait" — **not** an assumed failure and **not** an assumed success. If/when a retry is later attempted (user-initiated, not automatic), it **must** reuse the exact same persisted `paymentIdempotencyKey` (per 3.6D-A's SESSION_RETRY_CONTINUITY design), letting `startCharge`'s already-proven idempotent-replay behavior handle it correctly rather than risking a double charge. This is not a new mechanism — it's the deliberate reuse of `requires_reconciliation`'s already-designed semantics for a client-side-observed ambiguity, not just a server-side one.

---

# PAYLOAD_LIMITS

**Defense-in-depth only — not a duplication of `create_order`'s own full validation**, which remains the authoritative check:

| Check | Limit | Rationale |
|---|---|---|
| Body size | Reject bodies over ~32 KB before parsing | Cheap, early rejection of grossly malformed/abusive payloads |
| `items` array length | Reject if `> 100` | Matches `create_order`'s own existing bound (`jsonb_array_length(p_items) > 100`) — checking it in the Edge Function avoids wasting a full dry-run round-trip on an obviously-invalid cart, not a new business rule |
| Item `quantity` | Reject only clearly-absurd values (negative, non-integer, `> 1000`) as a cheap pre-filter | The *real* bound (1–99) stays `create_order`'s own job — this is a sanity check, not a duplicate of that validation |
| `notes` / `customer_name` / `delivery_address` string lengths | Reject (not silently truncate) if any exceeds ~500 characters | Matches `create_order`'s own truncation length (`left(...,500)`) — but the Edge Function **rejects** overlong input rather than silently truncating it, giving the customer a clear signal instead of silently losing part of their notes |
| `customer_phone` | Cheap shape pre-check (digits, reasonable length) | The **authoritative** format check remains `create_order`'s own regex (`^5[0-9]{8}$`) — this is only an early, cheap rejection for obviously-wrong input |

**Not implemented in this task** — specified as the target for the eventual Edge Function's own input-validation step, before any database call is made.

---

# LOGGING

**Allowed fields** (server-side only, `console.log`/`console.warn`/`console.error`, matching the existing convention — no new logging infrastructure): `paymentTransactionId`, `paymentIdempotencyKey`, `restaurant_id`, `status`, `providerRef` (server-side logs only — never in a browser response, per RESPONSE_CONTRACT).

**Never logged, under any circumstance**: `service_role` key value, the Moyasar API secret, any card data (never touches this codebase at all — confirmed throughout this entire session, Moyasar's hosted page handles it directly), and no PII (`customer_phone`/`customer_name`/`delivery_address`) beyond what necessarily already exists in `payment_transactions`/`orders` themselves — i.e., don't *additionally* echo these into a separate, redundant log line.

**Severity per status**: per the table in ERROR_MAPPING above — `requires_reconciliation` is the one outcome logged at `error` severity specifically because it is the one case genuinely requiring a human to look at it.

---

# OBSERVABILITY

**Minimum correlation identifiers**:

| Identifier | Browser-visible? | Server-only? |
|---|---|---|
| `requestId` (a fresh `crypto.randomUUID()` generated once per Edge Function invocation, purely for log correlation) | Not needed browser-side | **Server-only** |
| `paymentTransactionId` | **No** (RESPONSE_CONTRACT) | **Server-only** |
| `paymentIdempotencyKey` | **Yes** — the browser already has this (it either supplied it or receives it back), and it's the correct, sufficient identifier for the browser's own purposes (retry continuity, future status checks) | Also logged server-side, as the natural join key between browser-reported issues and server logs |

**No observability platform is introduced** — `console.*` output, matching both existing functions' own convention exactly, is sufficient and consistent.

---

# SECURITY_THREAT_MATRIX

| # | Threat | Decision | Control | Residual Risk |
|---|---|---|---|---|
| 1 | `service_role` exposure | Never in any browser-reachable file | Edge-Function-only env var, `usePaymentFirstCheckout`'s default wiring never used in real pages (3.6D-B's own finding, restated as binding) | None, provided the frontend integration follows the `functions.invoke` wrapper pattern |
| 2 | Cross-tenant checkout | Server-resolved tenant identity (QR_TENANT/NON_QR_TENANT) + `create_order`'s own independent re-validation | Both layers | None |
| 3 | Arbitrary `restaurant_id` | Never accepted as a raw field (REQUEST_CONTRACT) | Slug/QR resolution only | None |
| 4 | Arbitrary `branch_id` | Server-derived for QR; client-supplied-but-independently-revalidated for slug path (matches existing `useCheckout.js` trust level, not a new weakening) | `create_order`'s own validation | None beyond what already exists today |
| 5 | `returnUrl` manipulation | **Closed** — never accepted from the browser (RETURN_URL) | Server construction, fixed base URL | None |
| 6 | Idempotency disclosure | Deferred fix (IDEMPOTENCY), interim echo-only policy | High-entropy server-generated keys in practice | Low, narrow, documented — accepted for now |
| 7 | Payment spam | `RATE_LIMITING_REQUIRES_INFRA_DECISION` | None reliable exists yet | **Real, open** until a decision is made and implemented |
| 8 | `providerRef` exposure | **Closed** — never returned to browser | Response contract omits it entirely | None |
| 9 | Amount tampering | Already closed (unchanged since 3.6A-1) | `create_order`'s own recomputation | None |
| 10 | Cart tampering | Already closed | Same | None |
| 11 | Forged payment status | Already closed | Server reads `payment_transactions.status`/`.amount` directly, never trusts a client claim | None |
| 12 | Replay | Already closed | `uq_webhook_provider_event`, `uq_paytx_idempotency_key` | None |
| 13 | CORS | `'*'` retained, justified (CORS above) | Application-layer controls carry the real weight | Accepted, consistent with existing posture |
| 14 | Oversized payload | New defense-in-depth limits (PAYLOAD_LIMITS) | Body size + `items` length pre-checks | Low — full validation still ultimately enforced by `create_order` regardless |
| 15 | Network ambiguity | Mapped to `requires_reconciliation` semantics (NETWORK_TIMEOUT) | Persisted idempotency key, no auto-retry | Accepted — inherent to any network call, already the best achievable design |
| 16 | Duplicate payment | Already closed | `startCharge`'s existing idempotent-replay + `uq_paytx_idempotency_key` | None |
| 17 | Unauthorized refund | **N/A to this endpoint** | `payment-first-checkout` never calls `paymentService.refund()` in any way | None — refund remains a completely separate, still-uncalled code path |
| 18 | Webhook interference | **N/A** | Separate function, shared state only via `payment_transactions`, using the same already-proven `startCharge` write path the webhook already correctly coexists with | None |

---

# DEPENDENCY_GATES

Unchanged from 3.6D-B — **this task specifies, it does not implement**, so nothing is newly unblocked:

| Phase | Status |
|---|---|
| 3.6D.2 — Price Confirmation | **CAN SCAFFOLD** |
| 3.6D.3 — Payment UI | **CAN SCAFFOLD** |
| 3.6D.4 — Redirect/Callback | **BLOCKED** (Edge Function must exist first) **+ REQUIRES G-6** (real Moyasar redirect payload verification) |
| 3.6D.5 — Result UI | **CAN SCAFFOLD** (this spec's ERROR_MAPPING gives it a complete, stable contract to build against) |
| 3.6D.6 — Order Confirmation | **CAN START** (independent, already confirmed reusable in 3.6D-A) |
| 3.6D.7 — E2E | **BLOCKED** for true E2E; component-level tests **CAN SCAFFOLD** |

---

# FINAL_IMPLEMENTATION_SPEC

**`supabase/functions/payment-first-checkout/`**

**FILE STRUCTURE**: mirrors `payment-webhook`'s proven split — `handler.js` (pure request-handling logic, Deno-free, testable via the same `buildHandler({db, ...deps})` injection pattern) + `index.ts` (Deno entry point: env-var reading, `service_role` client construction, `Deno.serve(...)`).

**DEPENDENCIES**: `checkoutOrchestration.js`'s `initiatePaymentFirstCheckout` (imported server-side only, inside `handler.js`/`index.ts` — never by any browser-bundled file); no new dependency, no modification to any existing payments-module file.

**REQUEST**: per REQUEST_CONTRACT — `table_qr_token` XOR (`restaurant_slug` + `branch_id`), `type`, `customer_phone` required; `table_number`/`delivery_address` conditional on `type`; `customer_name`/`notes`/`coupon_code`/`clientTotal`/`paymentIdempotencyKey` optional.

**RESPONSE**: per RESPONSE_CONTRACT — always HTTP 200 for backend-recognized outcomes (ERROR_MAPPING), `providerRef`/`paymentTransactionId` never exposed.

**AUTH**: default Supabase gateway JWT verification (anon key sufficient); no in-function identity check (AUTHENTICATION).

**TENANT**: QR path resolves server-side via a replicated (not modified) read-only lookup mirroring `create_order_from_table_qr`'s criteria (QR_TENANT); slug path resolves `restaurant_id` from `restaurant_slug` via a public lookup, trusts client `branch_id` at the existing `useCheckout.js` trust level, backstopped by `create_order`'s own validation (NON_QR_TENANT).

**IDEMPOTENCY**: pass-through to `initiatePaymentFirstCheckout` unchanged; echo-only policy for client-supplied keys (IDEMPOTENCY); cross-tenant scoping fix deferred to a separate task.

**RATE LIMITING**: `RATE_LIMITING_REQUIRES_INFRA_DECISION` — not implemented; target architecture (database-backed counter) specified for future work; recommend checking Supabase-platform-level controls in parallel, at zero code cost.

**RETURN URL**: server-constructed from `PUBLIC_APP_BASE_URL` + `restaurant_slug` + `payment_callback=<paymentIdempotencyKey>` (+ `t=<table_qr_token>` if QR-scoped) — never accepted from the request body (RETURN_URL).

**CORS**: `Access-Control-Allow-Origin: '*'`, headers matching `create-platform-admin`'s existing convention (`authorization, x-client-info, apikey, content-type`), `OPTIONS` short-circuited to `200` — matching both existing functions' established pattern (CORS).

**TOTAL**: read fresh from `payment_transactions.amount` after `initiatePaymentFirstCheckout` returns `succeeded`, included in the response (AUTHORITATIVE_TOTAL).

**CURRENCY**: never accepted from the request; always `'SAR'`, relying on `checkoutOrchestration.js`'s own existing, unmodified enforcement (CURRENCY).

**ERRORS**: per the ERROR_MAPPING table — HTTP 200 for all backend-recognized statuses, 400/405/429/500 reserved strictly for request-level problems.

**LOGGING**: per LOGGING/OBSERVABILITY — `console.*` only, no PII/secrets, `requires_reconciliation` logged at `error` severity.

**PAYLOAD LIMITS**: per PAYLOAD_LIMITS — body size, `items` length, quantity sanity bound, string-length rejection, cheap phone shape check; none duplicating `create_order`'s own full validation.

**TEST STRATEGY**: a `handler.test.js`-equivalent file (mirroring `tests/unit/paymentWebhook.test.js`'s exact established convention — `buildHandler({db, orchestrate})` dependency injection, `makeChain`/`makeDb`-style fakes, no real Deno/Moyasar/database) covering: every response-status mapping (all 6 backend outcomes → HTTP 200 with the correct body shape), QR-token resolution (found/not-found/inactive), slug resolution (found/not-found/suspended), `returnUrl` construction (with and without QR token), the authoritative-total re-read, payload-limit rejections, and the idempotency echo-only policy's request-shape handling. No real Moyasar call in any test, matching every prior task's own established discipline this entire session.

---

# ACCEPTANCE_CRITERIA

All 18 required criteria, mapped to where this spec satisfies each:

1. `service_role` never reaches browser — SERVICE_ROLE_BOUNDARY / SECURITY #1, satisfied by construction (env var, server-only).
2. Direct browser import of `checkoutOrchestration` never used — FRONTEND_IMPACT (3.6D-B) + this spec's DEPENDENCIES, satisfied by the `functions.invoke` wrapper requirement.
3. `functions.invoke` used by frontend — same.
4. `returnUrl` server-generated — RETURN_URL, fully specified.
5. `providerRef` never browser-visible — RESPONSE_CONTRACT, explicit.
6. `succeeded` total from `payment_transactions.amount` — AUTHORITATIVE_TOTAL, explicit.
7. QR tenant server-resolved — QR_TENANT, fully specified (including the previously-missing detail that the Edge Function itself must own this step).
8. Currency SAR, server-controlled — CURRENCY, explicit.
9. Idempotency key preserved — IDEMPOTENCY, REQUEST_CONTRACT.
10. No automatic second payment after timeout — NETWORK_TIMEOUT, explicit.
11. Raw provider/database errors never reach browser — ERROR_MAPPING, explicit.
12. No webhook modifications — confirmed throughout, `payment-webhook` untouched by this entire spec.
13. No refund modifications — confirmed, SECURITY #17 (N/A to this endpoint).
14. No schema changes unless explicitly approved — rate-limiting counter table and the idempotency tenant-scoping fix are both explicitly named as **future, separately-approved** work, not implemented here.
15. Rate-limit decision explicit — RATE_LIMITING, `RATE_LIMITING_REQUIRES_INFRA_DECISION` with a concrete recommended policy.
16. CORS decision explicit — CORS, Option A with full justification.
17. All new handler behavior has unit tests — TEST STRATEGY, specified (not yet written, since the handler itself doesn't exist yet).
18. Existing 751/751 regression remains green — trivially true, since this task made zero code changes; re-confirmed via `git status` below.

---

# BLOCKERS

None for this specification task itself — every decision required by the task was resolved to exactly one recommendation. **Real blockers for the eventual implementation**: rate limiting requires an infra-level decision/schema-change approval; 3.6D.4 remains gated on G-6.

# WARNINGS

1. The QR-token-resolution finding (`initiatePaymentFirstCheckout` has no native QR support) means the Edge Function's implementation is slightly more involved than a thin pass-through — it must replicate a read-only lookup, not just forward a token.
2. The "always HTTP 200 for backend-recognized outcomes" rule is easy to get wrong if a future implementer defaults to REST convention (4xx for "failed") — flagged prominently in ERROR_MAPPING specifically because it would silently break `usePaymentFirstCheckout`'s already-tested logic without any fault in the hook itself.
3. The idempotency-key echo-only policy is a *documented contract expectation*, not a technically-enforced control (the field remains an opaque string the Edge Function cannot itself verify the provenance of) — real closure still requires the separate, deferred `restaurant_id`-scoping fix.

---

# REPORT_FILE

`reports/TASK_3_6D_C_PAYMENT_FIRST_SECURITY_IMPLEMENTATION_SPEC.md`

# DOWNLOAD_COPY

`/sdcard/Download/TASK_3_6D_C_PAYMENT_FIRST_SECURITY_IMPLEMENTATION_SPEC.md` (copied and checksum-verified after this report was written).

# NEXT_STEP

This specification is ready to be implemented as a new task. Owner approval needed specifically for: (1) the future rate-limiting database migration (not created here), (2) the future `paymentService.js` idempotency tenant-scoping fix (not created here), (3) proceeding with Edge Function implementation against this exact spec. No code, schema, or Moyasar work begins without separate, explicit instruction.

---

*Report generated 2026-08-27. Specification only — no code written, no schema modified, no migration created, no deployment, no Moyasar call, no commit, no push.*
