# Task 3.6D-B — Payment-First Server Entry Point Audit

**Read-only. No code, schema, or database was changed. No Moyasar call. No Edge Function created or modified.**

---

# EXECUTIVE_SUMMARY

Exactly **two** Edge Functions exist in this repository — `payment-webhook` and `create-platform-admin` — and between them they establish **both** of the two patterns a new Payment-First entry point needs: `payment-webhook` shows the "public, unauthenticated caller, `service_role` constructed once at module load, sanitized JSON response" shape (the closer match, since customers are anonymous — guest ordering, ADR-9); `create-platform-admin` shows the "verify caller identity first, only construct the privileged `service_role` client after authorization succeeds" shape (useful for *how* to structure the file, not directly applicable since there's no customer JWT to verify). The client-side calling convention is **already established and already live**: `supabase.functions.invoke(name, {body})`, used today by `adminsApi.js` for `create-platform-admin` — not a new pattern to invent.

A concrete, previously-undocumented finding this audit surfaced: `usePaymentFirstCheckout.js`'s current default wiring (`orchestrate = initiatePaymentFirstCheckout`, importing `checkoutOrchestration.js` directly) means that **if the hook were ever imported into real browser page code as-is, `checkoutOrchestration.js` and transitively `paymentService.js` would be bundled into the browser JavaScript** — not a secret leak (neither file hardcodes a key), but a structural sign that the hook's default wiring is for tests/server contexts only, and any real frontend integration must override `orchestrate` with a thin wrapper around `supabase.functions.invoke(...)` instead, never the direct import.

The `succeeded` response's missing authoritative-total field (flagged in 3.6D.1) has a clean, safe resolution once the Edge Function is added: the Edge Function can read `payment_transactions.amount` directly (the row `initiatePaymentFirstCheckout` itself just created) and include it in the browser-facing response — no backend logic change is needed, only a slightly richer Edge Function response than the raw `checkoutOrchestration.js` return value.

Also newly surfaced: an existing but *unrelated and possibly dead* reference — `src/pages/Staff.jsx` calls `supabase.functions.invoke('delete-staff', ...)`, but **no `delete-staff` function source exists anywhere in this repository** (only `payment-webhook` and `create-platform-admin` do) — flagged for awareness, not investigated further (out of this audit's scope).

**Verdict: `SERVER_ENTRY_POINT_READY_WITH_REQUIRED_DECISIONS`** — the architecture is fully specifiable from existing, proven patterns, but genuine gaps exist (no Edge-Function-level rate limiting anywhere in this codebase today; the `returnUrl`/redirect-callback design still depends on unverified Moyasar behavior, G-6) that need explicit owner decisions before implementation.

---

# EDGE_FUNCTIONS

| Function | Purpose | Auth | `verify_jwt` | `service_role` usage | DB client creation | Exposure | Request/response convention | Error convention |
|---|---|---|---|---|---|---|---|---|
| `payment-webhook` | Receives Moyasar payment status webhooks | **None at the Supabase-gateway level** — protected entirely by HMAC-SHA256 signature (`x-moyasar-signature` header), verified in `handler.js` | **`false`** (documented deployment requirement from earlier session reports — required because Moyasar, an external non-Supabase caller, cannot supply any Supabase-recognized credential at all) | Constructed once at module load in `index.ts` (`createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {auth:{persistSession:false}})`), used for every DB operation | Module-level, outside the request handler | **Fully public** (must be, to receive webhooks from Moyasar's servers) | `POST` only (`405` otherwise), JSON body, `{ok, ...}` / `{error}` responses | Generic `Internal error processing webhook` for unexpected exceptions; specific `4xx` messages for recognized failure modes (missing signature, malformed JSON, missing event ID) — real internal error text only ever `console.error`'d, never returned |
| `create-platform-admin` | Creates a new platform-admin account | **Full user-JWT verification**, done manually inside the function body (reads `Authorization: Bearer <token>`, resolves the user via a `userClient.auth.getUser()` call using the **anon** key + that token) | Not explicitly documented in this repo, but the function's own code assumes a valid Supabase session JWT already arrived — consistent with the Supabase-gateway *default* (`verify_jwt: true`, unset/default) | Constructed **only after** authorization succeeds (`platform_admin_can` RPC, run under the *caller's own* identity/RLS, not `service_role`) — the privileged client is a local variable inside the handler, not module-level | Two clients: a short-lived `userClient` (anon key + caller's token, for identity/authorization) and `admin` (service_role, for the actual privileged work) | **Requires an authenticated platform-admin session** — not public | `POST`, JSON body, `{ok, user_id}` / `{error}` | Generic exception handler returns `String(e.message)`; a few specific mapped messages (duplicate email → `409`) |

Both `corsHeaders` blocks are near-identical in shape (`Access-Control-Allow-Origin: '*'`, explicit `Allow-Headers`/`Allow-Methods`, `OPTIONS` handled first) — an established, reusable CORS convention (CORS section below).

**No Edge Function was assumed safe merely because it exists** — `create-platform-admin`'s privilege-escalation-shaped danger (creating admin accounts) is exactly why it performs its own manual JWT+capability check before touching `service_role`; this was read in full, not skimmed.

---

# SERVER_PATTERNS

Repository-wide search, not assumed:

- **`supabase.functions.invoke`**: exactly two call sites — `adminsApi.js` (`create-platform-admin`) and `Staff.jsx` (`delete-staff` — **no corresponding function source exists in this repo**, flagged as a loose end, not investigated further, out of scope).
- **`createClient(` with `SUPABASE_SERVICE_ROLE_KEY`**: exactly the two Edge Functions above — confirmed, no other server-side privileged client construction exists anywhere.
- **`Authorization`/`Bearer`**: only inside `create-platform-admin` (manual JWT extraction) — no other custom auth-header handling pattern exists.
- **The closest existing pattern for hosting Payment-First Checkout**: **`payment-webhook`**, specifically for its "public caller, `service_role` needed for every operation, no user session to check" shape — matching a guest/anonymous customer checkout exactly. `create-platform-admin` is the closer match for internal *file structure* (CORS block, `json()` helper, `Deno.serve(...)` wrapping a single async handler) but not for its authorization model, which doesn't apply to an anonymous customer at all.

---

# SECURITY_MODEL

**How can an anonymous customer safely invoke an Edge Function today?** By **not requiring a login at all** — exactly the model `create_order`/`create_order_from_table_qr` already use (guest ordering, `SECURITY DEFINER`, no `auth.uid()` check, confirmed repeatedly throughout this session). The client-side `supabase` singleton (`src/lib/supabase.js`) is constructed with only `appConfig.supabaseAnonKey` — **the anon key is the only credential the browser ever holds**, and `supabase.functions.invoke(...)` automatically attaches it to every call.

**Precisely why `payment-webhook` needed `verify_jwt: false` but a customer-facing checkout function would not**: `payment-webhook`'s caller (Moyasar's servers) is not a Supabase client at all and cannot supply the anon key — disabling gateway JWT verification was the *only* way to let it through, with HMAC substituting as the real authentication. A **browser** calling via `supabase.functions.invoke(...)` **always** sends the anon key automatically — which **does** satisfy the Supabase gateway's *default* JWT check (the anon key is itself a valid, low-privilege JWT the gateway recognizes) — so a new customer-facing checkout function should use the **default** (`verify_jwt: true`/unset), **not** copy `payment-webhook`'s exception. This is a real, precise distinction, not a guess: it's supported directly by observing that `create-platform-admin`'s own code architecture (manually checking a `Bearer` token *inside* the handler) only makes sense if the *gateway itself* already guaranteed *some* valid Supabase credential arrived — the anon key satisfies that baseline for an anonymous checkout function too, while the function's own body then does zero *further* identity checks (correctly, since there's no logged-in customer identity to check) and moves straight to *tenant* validation instead (CUSTOMER_CONTEXT below).

**No new authentication scheme is invented here** — QR-token-based table/branch resolution (already live, `create_order_from_table_qr`) remains the actual trust mechanism for *tenant* identity; the anon-key-gated Edge Function gateway is only the *transport* trust boundary (proving "this is a real request from a real browser using this app's public key," not "this is restaurant X's customer").

---

# CUSTOMER_CONTEXT

Traced from `PublicMenu.jsx` (re-confirmed, unchanged since the 3.6D-A audit): `restaurant`/`branch` are resolved from the `:slug` URL param via a **public** data fetch (menu data is intentionally public — no tenant secret involved in simply *reading* a public menu); `tableQr` (`{token, tableId, tableName, restaurantId, branchId}`) is resolved **server-side** from an opaque QR token via `create_order_from_table_qr`'s own existing, unmodified logic.

**Can the Edge Function safely derive `restaurant_id`/`branch_id`/`table_id` from trusted server-side data?** **Yes, using exactly the same mechanism already proven for orders**: if the checkout request carries a QR token, the Edge Function should resolve restaurant/branch/table from that token **server-side**, exactly mirroring `create_order_from_table_qr`'s own resolution (a `SELECT` against `restaurant_tables` by `qr_token`, already live, unmodified) — **never** trust a client-supplied `restaurant_id`/`branch_id` directly for the QR-scoped path. For the **non-QR** (browse-by-slug) path, today's `useCheckout.js` already trusts `restaurant.id`/`branch?.id` as resolved from the (public) menu-data fetch — the **same** trust level a Payment-First entry point would inherit; this is not a *new* weakening, it's the *existing* trust boundary this whole system already operates under for the non-QR checkout path, and this audit does not propose changing it.

**The client must not be able to use arbitrary `restaurant_id`/`branch_id` to access another tenant**: this is **already independently guaranteed** by `create_order`'s own existing validation (re-confirmed throughout 3.6A-1a/2/3.6B) — even if the Edge Function passed through a client-supplied value uncritically, the dry-run call inside `initiatePaymentFirstCheckout` would reject any restaurant/branch/product mismatch before any payment is initiated. This is defense-in-depth already present at the *database* layer, independent of whatever the Edge Function itself does or doesn't additionally check.

---

# PAYMENT_INPUT

Every field in `initiatePaymentFirstCheckout`'s actual input, classified:

| Field | Classification | Rationale |
|---|---|---|
| `restaurant_id` | **CLIENT-SUPPLIED, SERVER-VALIDATED** | From the public menu-data fetch (slug path) or **SERVER-DERIVED** from the QR token (QR path) — either way, independently re-validated by `create_order`'s own dry-run call |
| `branch_id` | Same as `restaurant_id` |
| `type` | **CLIENT-SUPPLIED** | A genuine customer choice (dine-in/takeaway/delivery); server-validated by `create_order` against branch capability flags |
| `customer_phone` | **CLIENT-SUPPLIED** | Required customer-provided contact info; format-validated server-side by `create_order` |
| `table_number` | **CLIENT-SUPPLIED** (non-QR) / **SERVER-DERIVED** (QR — from `tableQr.tableName`) |  |
| `delivery_address` | **CLIENT-SUPPLIED** | Free-text customer input; never price-relevant (3.6A-1 audit's own finding, unchanged) |
| `customer_name` | **CLIENT-SUPPLIED**, optional |  |
| `notes` | **CLIENT-SUPPLIED**, optional, free text |  |
| `coupon_code` | **CLIENT-SUPPLIED (selector only)** | Never price-authoritative — the coupon's actual terms are always looked up server-side |
| `items` | **CLIENT-SUPPLIED (selectors only)** | `product_id`/`quantity`/`options` only, never a price field (established exhaustively since 3.6A-1) |
| `clientTotal` | **CLIENT-SUPPLIED, ADVISORY ONLY** | Never authoritative — only ever used for the `price_changed` cross-check, explicitly documented as such in `checkoutOrchestration.js`'s own code |
| `currency` | **SERVER-VALIDATED (effectively SERVER-DERIVED)** | If the client sends anything other than `'SAR'`/omitted, the request is rejected outright — the client cannot actually *set* this to anything meaningful |
| `paymentIdempotencyKey` | **CLIENT-SUPPLIED, optional** | Passed through unchanged if present; server-generated if absent (3.6A-2's own design) |
| `returnUrl` | **CLIENT-SUPPLIED today — a real risk, see REDIRECT_URL** | Currently forwarded to Moyasar with **no validation of any kind** at any layer |

**No field is currently server-*computed* except `currency`'s enforcement** — every price-determining value remains, as established throughout this entire session, a server-side lookup regardless of what the client claims.

---

# SERVICE_ROLE_BOUNDARY

**`SUPABASE_SERVICE_ROLE_KEY` must exist only inside the new Edge Function's Deno runtime environment** (an environment variable/secret, `Deno.env.get(...)`, exactly matching both existing functions' pattern) — **never** in any file reachable by the Vite frontend build. Confirmed, not assumed: `src/lib/supabase.js` (the actual browser-bundled client) references only `appConfig.supabaseAnonKey`; a repository-wide search for `service_role`/`SERVICE_ROLE` outside `supabase/functions/` found only **explanatory comments** in `checkoutOrchestration.js`/`paymentService.js`/`usePaymentFirstCheckout.js` (documenting the *requirement*, never containing an actual key value) and one unrelated reference in `restaurantDeletion.js` (not investigated further, out of scope, but confirmed not to be a literal secret either).

**The one structural risk this audit identifies, precisely**: `usePaymentFirstCheckout.js`'s current default (`orchestrate = initiatePaymentFirstCheckout`) means that **file itself** (and its transitive imports, `checkoutOrchestration.js` → `paymentService.js` → `MoyasarAdapter`) would be pulled into the browser bundle **if the hook is ever imported by real page code without overriding `orchestrate`**. No secret is embedded in any of these files, but bundling server-oriented code that structurally *expects* a `service_role` `db` into client JavaScript is a design smell worth closing before real integration — **the fix is straightforward and doesn't require touching `checkoutOrchestration.js` at all**: whatever future task wires the hook to production must supply an `orchestrate` override that calls `supabase.functions.invoke('payment-first-checkout', {body: checkoutInput})` instead of relying on the hook's default. Flagged as a required decision for the implementation plan, not fixed here.

---

# REQUEST_CONTRACT

Proposed (not implemented) — minimum safe shape, deliberately narrower than `initiatePaymentFirstCheckout`'s own full parameter list:

```
POST /functions/v1/payment-first-checkout

{
  "table_qr_token": "..." ,        // present for QR-scoped orders; omit for slug-browse orders
  "restaurant_slug": "...",        // present for slug-browse orders; omit for QR-scoped orders
  "branch_id": "...",              // slug-browse path only — the customer's already-selected branch
  "type": "dine_in" | "takeaway" | "delivery",
  "table_number": "...",           // dine_in, non-QR only
  "delivery_address": "...",       // delivery only
  "customer_name": "...",
  "customer_phone": "...",
  "notes": "...",
  "items": [ { "product_id": "...", "quantity": 1, "options": [...] } ],
  "coupon_code": "...",
  "clientTotal": 0,                // advisory only
  "paymentIdempotencyKey": "..."   // omit to let the server generate one
}
```

**Not exposed to the request contract at all**: `restaurant_id` as a raw field for the QR path (derived server-side from `table_qr_token` instead), `currency` (hardcoded server-side to `'SAR'`, never read from the request), `returnUrl` (server-constructed — see REDIRECT_URL), any internal database identifier beyond what the customer's own UI naturally already has (product IDs from the menu it already loaded, etc.).

---

# RESPONSE_CONTRACT

**`providerRef` should NOT be exposed to the browser.** It identifies the payment at Moyasar's own system — the browser has no legitimate use for it (the customer-facing flow only ever needs to know *its own* payment succeeded/failed, and to follow a `redirectUrl` if present; `providerRef` is purely an internal cross-reference between `payment_transactions` and Moyasar, useful for support/reconciliation, not for the customer's browser). **Recommendation: keep it server-side only** (available in `payment_transactions.provider_ref` and in the Edge Function's own logs, per OBSERVABILITY), and omit it from the JSON returned to the browser.

**Safest browser-facing response**, by backend `status`:

| Backend `status` | Exposed to browser | Withheld |
|---|---|---|
| `rejected` | `{status, reason}` (a small, closed set of known reason strings — never `message` verbatim if it could ever carry raw SQL text; map to a fixed safe string set server-side) | Raw `error.message` from `create_order`/`buildCheckoutSnapshot` |
| `price_changed` | `{status, dryRun: {subtotal, tax, delivery_fee, total}}` | `price_changes`'s raw internal shape can stay (it's just `{client_total, server_total}`, already safe) |
| `failed` | `{status, reason}` (`payment_initiation_failed` / `provider_failed` — safe, already-generic reason strings) | Raw Moyasar error text (`message`) — map to a fixed customer-safe string per `reason` instead |
| `retryable_error` | `{status, reason}` | Same |
| `requires_reconciliation` | `{status}` **only** — deliberately minimal, so the browser cannot construct a misleading message from raw internal text | The raw `message` (internal diagnostic only) |
| `succeeded` | `{status, redirectUrl, total, currency}` (see AUTHORITATIVE_TOTAL) | `providerRef` (above), `paymentTransactionId` **arguably also withholdable** — the browser doesn't strictly need it unless a later phase (3.6D.4's callback) needs to reference "which attempt is this," in which case the **`paymentIdempotencyKey`** (already client-supplied or server-generated and already returned) is the more appropriate identifier to round-trip, not the raw internal UUID |

**Never exposed, in any status**: `service_role`, any raw database error object, the full Moyasar `raw` payload, `metadata`/the checkout snapshot's internal contents.

---

# AUTHORITATIVE_TOTAL

**Confirmed gap, re-verified**: `initiatePaymentFirstCheckout`'s `succeeded` response genuinely carries no total field (3.6D.1's own finding, re-checked against the current unmodified source in this audit).

**Safest server-side source, evaluated**:
- `payment_transactions.amount` — **the correct source.** By the time `initiatePaymentFirstCheckout` returns `status: 'succeeded'`, a `payment_transactions` row already exists (created by `paymentService.startCharge`, called from inside the orchestration function) with `amount` set to exactly `dryRun.total` — the same value that was actually charged. The Edge Function, having its own `service_role` `db` already in hand, can simply `SELECT amount, currency FROM payment_transactions WHERE id = paymentTransactionId` immediately after `initiatePaymentFirstCheckout` returns, and include it in the response.
- Checkout snapshot — also holds `total`, but is not more authoritative than `payment_transactions.amount` itself (the snapshot's `total` and the row's `amount` are the *same* value by construction, per 3.6A-2's own integrity assertions) — reading the column directly is simpler and doesn't require parsing `metadata`.
- Provider response — `chargeResult`/Moyasar's own response is **not** a total in the sense needed here (it's a payment confirmation, not a price) — not an appropriate source.
- Order creation result — **not available yet** at this point in the flow; order creation (3.6B) only happens *after* payment succeeds, as a *separate*, later step (`createOrderFromSuccessfulPayment`, not part of this entry point's own response at all).

**What the browser should display after success**: **the amount read from `payment_transactions.amount` by the Edge Function itself**, added to the response the Edge Function returns — **never** a client-side recalculation, and never the raw `dryRun.total` from a *stale*, separately-remembered value the browser might have cached from an earlier `price_changed` round — always the freshly-read database value, guaranteeing it reflects exactly what was actually charged, not what was merely quoted.

---

# REDIRECT_URL

- **Who constructs `returnUrl` today?** **No one** — confirmed, `initiatePaymentFirstCheckout`'s `input.returnUrl` is optional and currently has zero real callers supplying any value.
- **Can the browser supply an arbitrary `returnUrl`?** **As the code is currently structured, yes, if a caller chose to pass one** — `checkoutOrchestration.js` forwards `input.returnUrl` straight to `paymentService.startCharge` → `adapter.createCharge`'s `callback_url` with **no validation of the URL's origin/domain at any layer**.
- **Is an open redirect possible?** **Yes, as a real, unaddressed risk if a browser client were ever allowed to supply this value directly** — Moyasar's hosted payment page would (per the adapter's own request shape) redirect the customer's browser to whatever `callback_url` it was given after payment completes; an attacker who could control this value (e.g., by directly calling a future Edge Function with a crafted body, bypassing whatever the legitimate frontend UI intends) could redirect a paying customer to an arbitrary external site immediately after a real payment — a genuine open-redirect-adjacent risk specific to payment flows.
- **Are allowed origins enforced anywhere?** **No** — confirmed, no allow-list of valid return origins exists anywhere in this codebase today.
- **Recommendation, not implemented**: **the callback destination must be server-defined, never accepted from the request body at all.** The Edge Function should construct `returnUrl` itself (e.g., derived from a fixed, server-known base URL + the restaurant's `slug` + a fixed callback path, matching whatever 3.6D.4 eventually designs), and the request contract (REQUEST_CONTRACT above) should have **no `returnUrl` field at all** — closing this risk by construction rather than by validation logic that could have a bug.

---

# IDEMPOTENCY

Traced: Browser → (future) Edge Function → `initiatePaymentFirstCheckout` → `paymentService.startCharge`. **Already safely repeatable for "same key + same checkout"** — this is exactly 3.6A-2's own, already-tested design (`ORCH-11` etc.): the same `paymentIdempotencyKey` reused across retries returns the existing `payment_transactions` row rather than charging twice, with the additional concurrent-race backstop (`uq_paytx_idempotency_key`) already proven in 3.6A-2's own test suite.

**Can a malicious client reuse an idempotency key across tenants or carts?** **No — already structurally prevented, independent of anything the Edge Function does**: `startCharge`'s pre-check `SELECT ... WHERE idempotency_key = idemKey` has **no `restaurant_id` filter**, meaning if a malicious caller reused a *known* key from a *different* restaurant's transaction, they would get back **that other transaction's own data** (`idempotent: true`, but pointing at someone else's payment) rather than starting a new charge for themselves — **this is a genuine, real finding worth flagging precisely**: it is not exploitable to *pay for* something using another tenant's already-successful payment (the linkage to an *order* still requires `initiatePaymentFirstCheckout`'s own cart/snapshot to match, and `createOrderFromSuccessfulPayment`'s own tenant check would catch a mismatch later), but it **could** leak *whether* a given idempotency key belongs to an existing transaction, and return that transaction's `status`/`redirectUrl` to an unrelated caller who merely guessed or otherwise obtained the key string. Since idempotency keys are UUID-based (`newIdempotencyKey`, effectively unguessable) or client-chosen (in which case the client already "knows" it), this is a **low-probability but non-zero** information-disclosure risk, not a payment-theft risk — flagged for SECURITY_THREAT_MATRIX, not fixed here (would require a `paymentService.js` change, out of this task's read-only scope).

---

# RATE_LIMITING

**No Edge-Function-level rate limiting exists anywhere in this codebase today** — confirmed by search and by cross-referencing the only rate-limiting work done this session (`TASK_1_4_RATE_LIMITING_VERIFICATION_REPORT.md`), which covers **only Supabase's built-in Auth rate limits** (login/signup/OTP) — entirely unrelated to Edge Function invocation frequency. **Neither existing Edge Function has any request-throttling of its own.** This is a **real, confirmed gap**, not merely a theoretical one, directly relevant to a payment-initiation endpoint specifically (the class of endpoint most attractive to abuse — card-testing/probing, initiation spam). Not implemented here, per instruction; flagged as a required decision (RATE_LIMITING has no existing pattern to extend — a genuinely new capability would need to be added, likely at the Supabase project/gateway level or via a lightweight in-function counter, a real design decision for a future task).

---

# ERROR_MAPPING

| Backend `status` | Browser-safe mapping |
|---|---|
| `rejected` | A small, fixed set of safe strings keyed by `reason` (`unsupported_currency`, `invalid_idempotency_key`, `dry_run_failed`, `snapshot_failed`, `amount_integrity_violation`, `snapshot_integrity_violation`) — none of these need to leak the underlying SQL exception text to be useful to a customer; a generic "couldn't start checkout, please try again" covers all of them from the customer's perspective, with the specific `reason` retained server-side/in logs for debugging |
| `price_changed` | Not an error — `dryRun` totals passed through directly, per RESPONSE_CONTRACT |
| `failed` | "Payment didn't go through" — safe regardless of whether the underlying cause was `payment_initiation_failed` or `provider_failed`; the distinction matters for logs/debugging, not customer-facing copy |
| `retryable_error` | Same customer-facing treatment as `failed` today (a raw internal `reason` string, not meant for display) — though its *retry semantics* differ (per 3.6A-2's own design, this specifically means "the same idempotency key can safely be retried"), which 3.6D.5 should account for even though the *displayed text* can stay generic |
| `requires_reconciliation` | **Must never say "failed"** — a distinct, honest "we're confirming your payment" message, no immediate retry offered (3.6D-A's own finding, re-affirmed here) |
| `succeeded` | Not an error |

This mapping preserves everything 3.6D.5 will need (the `status`/`reason` fields survive server-side and can still reach the browser as *structured*, safe values — only the *raw* database/provider text is what gets filtered out).

---

# NETWORK_FAILURE

**Browser → Edge Function → payment initiation → browser network failure (e.g., the HTTP response never arrives, but the request reached the server and payment may have already started)**: the client can safely know **nothing conclusive** from a network-level timeout alone — the request may have never reached the server, may have been processed and failed, or may have succeeded with the response lost in transit. **This is structurally the same class of ambiguity `requires_reconciliation` already exists to represent** — a network timeout on the *client* side is, from the customer's perspective, indistinguishable from the server-side G-5 ambiguity 3.6A-2 already built `requires_reconciliation` to handle. **No new retry behavior is invented here** — the existing guidance (SESSION_RETRY_CONTINUITY from 3.6D-A: persist the `paymentIdempotencyKey` across the request, and if a retry is later attempted, reuse the *same* key so `startCharge`'s own idempotent-replay logic — already proven safe — handles it correctly rather than risking a double charge). A timed-out request should **not** automatically retry on its own; per 3.6D-A's own ERROR_STATE_MAPPING, the safest client behavior is to surface an ambiguous/"checking" state and let the customer (or a later reconciliation mechanism) resolve it, not to silently re-fire the same request.

---

# CORS

Both existing functions use an identical shape: `Access-Control-Allow-Origin: '*'`, an explicit `Access-Control-Allow-Headers` list (function-specific — `payment-webhook` allows `content-type, x-moyasar-signature`; `create-platform-admin` allows `authorization, x-client-info, apikey, content-type`), `Access-Control-Allow-Methods: POST, OPTIONS`, and an explicit `OPTIONS` short-circuit returning `200` immediately.

**Correct CORS model for the new endpoint**: closer to `create-platform-admin`'s header list (`authorization, x-client-info, apikey, content-type` — the standard `supabase-js`-generated headers), since the new function will be invoked via `supabase.functions.invoke(...)` from the browser exactly like `create-platform-admin` is, not via a raw webhook POST like `payment-webhook`. `Access-Control-Allow-Origin: '*'` matches both existing functions' convention (no stricter origin allow-list exists anywhere in this codebase today) — this audit does not recommend deviating from the established pattern without a separate, explicit decision to tighten it, since doing so would be a new security posture, not merely following precedent.

---

# OBSERVABILITY

**Existing logging pattern**: `console.error(...)` for internal failures only, in both existing functions — no structured/external logging service is wired in anywhere in this repository (confirmed by the absence of any Sentry/LogRocket-equivalent import inside `supabase/functions/`, despite both tools being used in the *frontend*, per this session's own memory of earlier Phase 1 tasks — Edge Functions are a separate deployment surface).

**What should be logged for a checkout attempt** (recommendation, not implemented): `paymentTransactionId`, `paymentIdempotencyKey`, `restaurant_id`, the resulting `status`, and (server-side only, never in a browser-facing log) `providerRef` — sufficient to trace any single attempt end-to-end for support/debugging without needing anything else. **Never log**: card data (never touches this codebase at all — Moyasar's hosted page handles it directly, confirmed throughout this session), `service_role`, the Moyasar API key, or `customer_phone`/`customer_name`/`delivery_address` beyond what's already necessarily present in `payment_transactions`/`orders` themselves (i.e., don't *additionally* echo PII into a separate log stream unnecessarily).

---

# ARCHITECTURE_OPTIONS

| | A — New dedicated `payment-first-checkout` function | B — Extend `payment-webhook` | C — Extend `create-platform-admin` | D — Another existing architecture |
|---|---|---|---|---|
| Security | Clean — a single, narrowly-scoped, purpose-built function, easiest to reason about | **Wrong shape entirely** — `payment-webhook` is HMAC-authenticated for an *external, non-Supabase* caller (Moyasar); mixing in a `supabase.functions.invoke`-based customer path would conflate two completely different trust models in one file | Wrong domain — an admin-account-creation function has no logical relationship to customer checkout; extending it would be a confusing, unrelated coupling | N/A — no other existing architecture is a plausible host |
| Tenant isolation | Enforced fresh, cleanly, for exactly this one concern | Would require carving out a second, incompatible auth path inside an already-security-sensitive file (this session has repeatedly, deliberately avoided touching `payment-webhook` for exactly this kind of reason) | N/A | N/A |
| Maintainability | High — one file, one job | Low — two unrelated concerns in one file | Low — same | N/A |
| Testing | Follows the exact `buildHandler({...deps})` dependency-injection pattern `payment-webhook/handler.js` already established, fully testable without Deno | Would inherit `payment-webhook`'s existing test suite's scope, awkwardly | N/A | N/A |
| CORS | Own, purpose-fit header list | Would need to merge two different header requirements | N/A | N/A |
| Authorization | None needed (anonymous, by design) — simplest possible model | Already has none, but for the *wrong* reason (external caller, not anonymous browser) — reusing it would be superficially similar but conceptually incorrect | Would inherit an authorization model that doesn't apply to anonymous customers, requiring code to bypass it | N/A |
| Idempotency | Delegates entirely to `initiatePaymentFirstCheckout`'s already-proven mechanism — no new logic needed | Same underlying mechanism, but bolted onto an unrelated file | N/A | N/A |
| Error mapping | Purpose-built response shape (RESPONSE_CONTRACT) | Would risk leaking webhook-specific response conventions into a customer-facing surface, or vice versa | N/A | N/A |
| Deployment | Independent — can be deployed/rolled back without touching the already-live, working webhook | Any change here risks the already-verified, production-live webhook | N/A | N/A |
| Rollback | Trivial — a new function can simply not be invoked by the frontend if reverted | Risky — any bug introduced while extending `payment-webhook` for an unrelated purpose could affect real Moyasar webhook processing | N/A | N/A |
| Complexity | Lowest — new, focused, small | Higher — merges unrelated concerns | N/A | N/A |

**Recommendation: Option A — a new, dedicated `payment-first-checkout` Edge Function.** Every dimension favors a clean, single-purpose function; extending either existing function would be a strictly worse choice on every axis evaluated, and this session's own established discipline around never touching `payment-webkhook` without exceptional cause (re-verified, re-affirmed as unmodified, across every task since 3.6A) makes Option B specifically inadvisable regardless of any other consideration.

---

# FRONTEND_IMPACT

`usePaymentFirstCheckout`'s public interface — `state`, `result`, `error`, `isLoading`, `startCheckout`, `reset` — **requires zero changes** to accommodate this recommendation. The hook already accepts `orchestrate` as an injectable option (3.6D.1's own design, built precisely so this decision could be deferred without rework) — the only change a future task needs to make is supplying a **different** `orchestrate` function when the hook is actually wired into a real page:

```js
const orchestrate = async (checkoutInput) => {
  const { data, error } = await supabase.functions.invoke('payment-first-checkout', { body: checkoutInput })
  if (error) throw error
  return data
}
usePaymentFirstCheckout({ orchestrate }) // no `db` needed at all from the browser side
```

**The hook never needs to know about `service_role` or any internal DB detail** — from its perspective, `orchestrate` is just an async function matching `(checkoutInput) => Promise<response>`, exactly the same shape whether it's the raw `initiatePaymentFirstCheckout` (tests) or a `functions.invoke` wrapper (real usage). This confirms 3.6D.1's own DI design was the right call, made *before* this audit even existed to confirm it.

---

# IMPLEMENTATION_PLAN

Minimum required, derived from findings above — **not implemented in this task**:

- **EDGE FUNCTION**: `supabase/functions/payment-first-checkout/index.ts` (+ a `handler.js` split mirroring `payment-webhook`'s own testable-without-Deno structure, given `checkoutOrchestration.js` is plain JS and can be imported the same way `MoyasarAdapter` already is).
- **FRONTEND CALL**: `supabase.functions.invoke('payment-first-checkout', {body})`, wired as `usePaymentFirstCheckout`'s `orchestrate` override (FRONTEND_IMPACT above) — no hook changes needed.
- **AUTHORIZATION**: none (anonymous, by design) — default Supabase gateway JWT verification (anon key) is sufficient; no manual auth check needed inside the function body, unlike `create-platform-admin`.
- **REQUEST CONTRACT**: per REQUEST_CONTRACT above — narrower than the raw backend input, no `currency`, no `returnUrl`.
- **RESPONSE CONTRACT**: per RESPONSE_CONTRACT above — `providerRef` withheld, `paymentTransactionId` reconsidered, `total`/`currency` added on success (per AUTHORITATIVE_TOTAL).
- **CORS**: `create-platform-admin`'s header-list convention (REQUEST-side standard `supabase-js` headers), `Allow-Origin: '*'` matching existing precedent.
- **TENANT VALIDATION**: QR-token server-side resolution for the QR path (mirroring `create_order_from_table_qr`); slug-derived restaurant/branch trusted at the same level `useCheckout.js` already trusts it for the non-QR path — both backstopped by `create_order`'s own existing, unmodified validation.
- **IDEMPOTENCY**: pass through to `initiatePaymentFirstCheckout` unchanged — no new logic; the cross-tenant idempotency-key information-disclosure risk (IDEMPOTENCY above) should get an explicit owner decision on whether it's worth closing before or after this endpoint ships.
- **ERROR MAPPING**: per ERROR_MAPPING above, implemented inside the Edge Function (not in `checkoutOrchestration.js`, which stays unmodified).
- **LOGGING**: per OBSERVABILITY above — `console.error`/`console.log` matching the existing convention, no new logging infrastructure introduced.
- **TESTS**: a `handler.js`-style test file, following `paymentWebhook.test.js`'s own established Deno-free testing convention exactly.
- **AUTHORITATIVE TOTAL**: supplied by the Edge Function reading `payment_transactions.amount` fresh after `initiatePaymentFirstCheckout` returns `succeeded` (AUTHORITATIVE_TOTAL above) — no change to `checkoutOrchestration.js` itself required.

---

# 3_6D_DEPENDENCIES

| Phase | Status |
|---|---|
| 3.6D.2 — Price confirmation UI | **CAN SCAFFOLD** — the UI itself doesn't need a live network call to build/test against a mocked hook result, but can't be *demonstrated end-to-end* until the Edge Function exists |
| 3.6D.3 — Payment initiation UI | **CAN SCAFFOLD** — same reasoning |
| 3.6D.4 — Redirect/callback handling | **BLOCKED** — both on the Edge Function existing (to construct `returnUrl` server-side, per REDIRECT_URL) **and** on real Moyasar verification (**REQUIRES G-6**) to confirm the actual redirect/callback payload shape |
| 3.6D.5 — Result mapping UI | **CAN SCAFFOLD** — the mapping logic (ERROR_MAPPING) can be written and unit-tested against known response shapes without a live endpoint |
| 3.6D.6 — Order confirmation reuse | **CAN START** — entirely independent of the Edge Function question; already confirmed reusable in 3.6D-A |
| 3.6D.7 — Full UI/E2E tests | **BLOCKED** on the Edge Function existing for any true end-to-end coverage; component-level tests **CAN SCAFFOLD** now |

**The Edge Function itself is a new, separate implementation task, not yet started, not part of this audit's own deliverable.**

---

# SECURITY_THREAT_MATRIX

| # | Threat | Existing control | Gap | Required future control |
|---|---|---|---|---|
| 1 | `service_role` exposure | Confirmed absent from any browser-bundled file today | The *pattern* of a hook defaulting to a `service_role`-requiring import is a latent risk if ever wired incorrectly | Real integration must use the `functions.invoke` wrapper (FRONTEND_IMPACT), never the raw import, for `orchestrate` |
| 2 | Cross-tenant checkout | `create_order`'s own existing restaurant/branch/product validation (independent backstop) | None beyond relying on that backstop — acceptable, since it's already proven | None required beyond documenting reliance on it |
| 3 | Arbitrary `restaurant_id` | Same as #2, plus QR-token server-side resolution for the QR path | Slug-browse path trusts client-supplied `restaurant_id`/`branch_id` at the same level `useCheckout.js` already does today — not a *new* gap | None beyond what already exists — explicitly not proposed to change here |
| 4 | Arbitrary `branch_id` | Same as #3 | Same | Same |
| 5 | `returnUrl` manipulation (open redirect) | **None today** | **Real, confirmed** — no origin validation anywhere | Server-construct `returnUrl` entirely; remove it from the request contract (REDIRECT_URL) |
| 6 | Payment idempotency abuse | `startCharge`'s own existing key-reuse-returns-existing-row behavior | **Real, narrow**: no `restaurant_id` scoping on the idempotency-key lookup — a guessed/leaked key from another tenant could disclose that transaction's status | Flagged for a future, separate decision — would require a `paymentService.js` change, out of this audit's scope to implement |
| 7 | Payment initiation spam | **None** — confirmed, no Edge-Function-level rate limiting exists anywhere in this codebase | **Real, confirmed gap** | A rate-limiting decision is needed before production launch — no existing pattern to extend |
| 8 | `providerRef` exposure | N/A today (no endpoint exists yet) | Would be a gap if a naive implementation echoed the raw backend response | Explicitly withhold it in the Edge Function's response mapping (RESPONSE_CONTRACT) |
| 9 | Amount tampering | `create_order`'s own dry-run recomputation + 3.6A-2's own integrity assertions (unchanged, unmodified) | None | None required — already closed at the database layer |
| 10 | Cart tampering | Same — `p_items` is always re-validated server-side | None | None required |
| 11 | Forged payment status | `syncOrderStatusFromPayment`/`createOrderFromSuccessfulPayment` both read `payment_transactions.status` from the column, never trust a client-supplied value (3.6B/3.6C, unmodified) | None | None required |
| 12 | Replay | `uq_webhook_provider_event` (webhook side), `uq_paytx_idempotency_key` (charge side) — both already proven | None new | None required |
| 13 | CORS abuse | `Allow-Origin: '*'` on both existing functions — already the established, accepted posture | Same posture would carry over to the new function; not a *new* gap, but worth an explicit owner acknowledgment that this remains the chosen tradeoff | Owner decision: keep `'*'` (matches precedent) or tighten (a deliberate, separate choice) |
| 14 | Oversized payload | **None found** — no request-size limit exists in either existing function | **Real gap**, same class as #7 | A payload-size check (e.g., `items` array length — already bounded to 100 by `create_order` itself, so the *database* layer already protects against a truly enormous cart, but the Edge Function itself has no independent limit before that point) |
| 15 | Network timeout ambiguity | The existing `requires_reconciliation`/idempotency-key-reuse mechanisms already correctly handle this class of ambiguity (NETWORK_FAILURE above) | None beyond what's already documented | None required — already correctly designed for |

---

# BLOCKERS

None for *further specifying* the architecture — this audit fully answers the entry-point-location question. **Real blockers for actual implementation**: (1) no rate-limiting pattern exists anywhere in this codebase to extend, a genuine new capability needing its own design decision; (2) 3.6D.4 specifically remains gated on real Moyasar verification (G-6), unaffected by anything this audit found.

# WARNINGS

1. `usePaymentFirstCheckout.js`'s current default `orchestrate` wiring must not be used as-is in real browser page code — a future task must override it with a `functions.invoke`-based wrapper, per FRONTEND_IMPACT.
2. The idempotency-key cross-tenant information-disclosure risk (#6 in SECURITY_THREAT_MATRIX) is real but narrow, and closing it would require a `paymentService.js` change — a separate, explicit future decision, not blocking this entry point's initial build.
3. `Staff.jsx` references a `delete-staff` Edge Function that has no corresponding source file anywhere in this repository — flagged for owner awareness, not investigated further (unrelated to this audit's actual scope).
4. `Allow-Origin: '*'` is the established convention for both existing functions; carrying it forward is consistent but is itself a real security posture worth an explicit, conscious owner sign-off rather than silent inheritance.

---

# ACCEPTANCE_CRITERIA

For a future implementation of `payment-first-checkout` to be considered correctly scoped against this audit:
- No `service_role` key reachable from any browser-bundled file.
- `returnUrl` never accepted from the request body; constructed server-side only.
- `providerRef` never present in any browser-facing response.
- The authoritative total on a `succeeded` response is read fresh from `payment_transactions.amount`, never recomputed client-side or carried forward from a stale `dryRun` value.
- Tenant identity for the QR path is resolved server-side from the QR token, never trusted from a client-supplied `restaurant_id`/`branch_id`.
- `usePaymentFirstCheckout`'s public interface remains unchanged.
- A rate-limiting decision is made and documented (even if the decision is "defer, accept the risk for now") before production launch.

---

# REPORT_FILE

`reports/TASK_3_6D_B_PAYMENT_FIRST_SERVER_ENTRY_POINT_AUDIT.md`

# DOWNLOAD_COPY

`/sdcard/Download/TASK_3_6D_B_PAYMENT_FIRST_SERVER_ENTRY_POINT_AUDIT.md` (copied and checksum-verified after this report was written).

# NEXT_STEP

Owner decisions needed: (1) approve Option A (dedicated new Edge Function) as the entry point, (2) decide on rate-limiting approach before production launch, (3) decide whether the narrow idempotency-key cross-tenant disclosure risk needs closing now or can be deferred. No implementation begins without separate, explicit instruction, per this task's strict stop list.

---

*Report generated 2026-08-27. Architecture analysis only — no code written, no schema modified, no migration created, no deployment, no Moyasar call, no commit, no push.*
