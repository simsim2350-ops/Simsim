# Task 3.6A-1b — Cart Integrity / Quote Binding Architecture Audit

**Read-only. No code, schema, or database was changed. No migration created. Nothing deployed or committed.**

---

# EXECUTIVE SUMMARY

`create_order`'s pricing is already fully server-authoritative (Task 3.6A-1/1a) — the open gap is narrower than "can pricing be trusted," it's "can the server prove the cart it priced is the same cart that got paid for and the same cart that becomes the order." Two facts, gathered from the actual live code rather than assumed, resolve most of this design:

1. **`payment_transactions.metadata` already exists** (`jsonb NOT NULL DEFAULT '{}'`), is already used exactly as a free-form, server-controlled bag (`paymentService.startCharge` writes it at INSERT and again after the provider call, always as a full-object replace, never a destructive overwrite of unrelated keys), and — critically — **the client has no access to this table at all**: the single RLS policy (`ptx_admin_all`, `ALL`, `is_platform_admin()`) means only `service_role` (i.e., server-side code) can read or write any row, any column, at any time. This closes the "can the client tamper with a stored binding" question before any new protection is designed — it's already closed, structurally, by an access-control decision made when the payments schema was first built.
2. **The client-supplied `p_items` shape never carries a price** — only `product_id`, `quantity`, `notes`, and `options[].{groupName, choiceName}` (verified directly in `useCheckout.js`). Every price-determining value is already a server-side lookup. This means a cart-binding mechanism only has to prove *identity* (which products, which options, which coupon, which restaurant/branch/type), not re-prove price — price is already, separately, guaranteed by `create_order`'s existing recomputation.

**Recommended architecture: Option C — store both a canonical checkout snapshot and a SHA-256 fingerprint of its payment-integrity subset, inside the existing `payment_transactions.metadata` column, under a dedicated `checkout` key.** Zero schema change (no new table, no new column, no `create_order` parameter, no new RPC) — a metadata *convention*, enforced by the future orchestration service, not by the database. `create_order` itself remains completely untouched; it continues to be the sole re-verifier of price, coupon validity, and product availability, exactly as already established.

**Verdict: `CART_BINDING_ARCHITECTURE_READY_WITH_WARNINGS`** — the core mechanism is fully decidable from the existing architecture; one genuine open policy question (how much customer PII, if any, belongs in the recovery snapshot) is flagged as a deliberate, owner-level decision rather than resolved unilaterally here.

---

# CURRENT CREATE_ORDER INPUT MODEL

Re-inspected against the live Production signature (post-3.6A-1a, 14 args) and its source:

| Parameter | Classification | Basis |
|---|---|---|
| `p_restaurant_id` | **PRICE_CRITICAL, CART_CRITICAL, FULFILLMENT_CRITICAL, RESTAURANT_OWNERSHIP** | Scopes every product/branch/coupon lookup; determines delivery-fee source |
| `p_branch_id` | **PRICE_CRITICAL, CART_CRITICAL, FULFILLMENT_CRITICAL** | Scopes product lookup, delivery-fee amount, `dine_in`/`takeaway`/`delivery` availability |
| `p_table_number` | **FULFILLMENT_CRITICAL, CUSTOMER_METADATA** | Required for `dine_in`, never read by any pricing statement |
| `p_delivery_address` | **FULFILLMENT_CRITICAL, CUSTOMER_METADATA** | Required for `delivery`, never read by any pricing statement — delivery fee is a flat per-branch amount, confirmed in Task 3.6A-1, not address/distance-derived |
| `p_customer_name` | **CUSTOMER_METADATA** | Stored on the order, never read for pricing |
| `p_customer_phone` | **CUSTOMER_METADATA** | Validated (format only), never read for pricing |
| `p_type` | **PRICE_CRITICAL, FULFILLMENT_CRITICAL** | Gates whether the delivery fee applies at all (`case when p_type='delivery' then ... else 0`) |
| `p_items` | **PRICE_CRITICAL, CART_CRITICAL** | The core subject of this audit |
| `p_notes` | **CUSTOMER_METADATA** | Free text, truncated to 500 chars, never read for pricing |
| `p_coupon_code` | **PRICE_CRITICAL, CART_CRITICAL** | Selects the discount-determining coupon row |
| `p_client_total` | **CONTROL_PARAMETER** | Advisory only — triggers the existing `price_changed` early-return on mismatch, never authoritative |
| `p_idempotency_key` | **IDEMPOTENCY** | Governs retry-safety of the order-creation call itself |
| `p_payment_transaction_id` | **PAYMENT_REFERENCE** | Links the created order to a `payment_transactions` row (Task 3.5) |
| `p_dry_run` | **CONTROL_PARAMETER** | Governs whether the call mutates anything (Task 3.6A-1a) |

---

# P_ITEMS STRUCTURE

Traced directly from `src/features/menu/hooks/useCheckout.js:132-137` (and again, identically, at :148-153 for the price-confirmation resubmission path) — **this is the actual, current, only real production shape**, not a hypothetical:

```js
{
  product_id: i.id,                    // UUID string, from the cart line's product id
  quantity: i.qty,                     // integer, 1–99 (server-enforced)
  notes: i.note || '',                 // free text, per-line
  options: (i.selectedOptions || []).map(o => ({ groupName: o.groupName, choiceName: o.choiceName })),
}
```

**No price field of any kind is ever sent for a line or an option** — `useCart.js`'s `addToCart` computes `finalPrice`/`basePrice` for local UI display only; neither is included in the object built for the RPC call. This independently reconfirms (from the caller's actual code, not just the callee's) that the client structurally cannot submit a price even if it wanted to.

- **Product ID representation**: bare UUID string, `product_id` key. (`create_order`'s SQL also accepts a legacy `id` alias via `coalesce`, but the live caller never uses it — confirmed dead code path from the client's perspective.)
- **Quantity**: JSON number, `quantity` key. (`create_order` also accepts a `qty` alias; unused by the live caller.)
- **Options**: array of `{groupName, choiceName}` — camelCase only (the SQL's `group_name`/`choice_name` snake_case alias is also dead from this caller). **No price is included in an option selector.**
- **Option ordering**: whatever order the product's option groups were presented/selected in the UI — **not sorted**, not guaranteed consistent between two otherwise-identical carts built by different UI interaction sequences.
- **Product ordering**: array order = cart insertion order (`cart.map(...)`), not sorted.
- **Duplicate product lines**: `create_order` does not merge them — each array element is independently validated and priced; two lines of the same product+options+qty=1 sum to the same total as one line of qty=2, but they are stored as **distinct entries** in `orders.items`.
- **Duplicate options within one line**: `create_order`'s validation loop does **not** deduplicate — each client-supplied option object is matched and priced independently, so sending the same `{groupName, choiceName}` twice would add its price twice. (No live caller does this today — `useCart.js` builds `selectedOptions` from a single-choice-per-group UI flow — but the SQL itself does not defend against it.)
- **Null vs. missing fields**: `notes` defaults to `''` if absent; `options` defaults to `[]` if absent or not an array; a missing/invalid `product_id` or out-of-range `quantity` raises `invalid product or quantity`.
- **Numeric representation**: quantity is a plain integer; no decimal/string ambiguity in the current caller.
- **Irrelevant client fields**: none observed — the live caller sends exactly the four keys above, nothing extraneous.

**Conceptual issue posed in the task** ("[A, B] vs. [B, A] may be the same cart"): **confirmed true and price-irrelevant** — `v_subtotal_gross` is a simple accumulating sum across the loop; reordering the input array cannot change the computed total, coupon eligibility, or validation outcome. **Option order within a line is also price-irrelevant** — each client-supplied option is matched against the product's option definition by name, independently, not by position.

---

# CANONICALIZATION

A deterministic canonical form is achievable and safe, grounded entirely in the above (nothing invented beyond what the actual pricing code already treats as equivalent):

1. **Per-line option key**: sort the line's `options` by `(groupName, choiceName)`, join as `` `${groupName}:${choiceName}` `` joined by `|`. **This is not a new invention** — it is the *exact same pattern* `useCart.js`'s own `addToCart`/`updateCartItem` already use today (`selectedOptions.map(o => \`${o.groupName}:${o.choiceName}\`).sort().join('|')`) to build the cart's own line-deduplication key. Reusing it here is evidence-grounded, not novel.
2. **Per-line canonical tuple**: `(product_id.toLowerCase(), quantity, optionsKey)`. **`notes` is deliberately excluded** — `create_order` never reads it for pricing or product identity, so two carts differing only in free-text notes are payment-integrity-equivalent; including notes in the fingerprint would make semantically identical carts hash differently, which is the exact failure mode the task warns against.
3. **Top-level ordering**: sort the array of per-line tuples lexicographically. This makes `[A, B]` and `[B, A]` canonicalize identically, matching `create_order`'s own order-independent pricing.
4. **Duplicate lines**: **preserved, not merged.** Merging (summing quantities of identical tuples) would still be mathematically price-neutral, but `create_order` itself does not merge them, and introducing a merge step would be inventing a normalization the actual system doesn't perform. Preserving them (as multiple identical sorted entries) is the safer, more literal choice and is still fully deterministic.
5. **Coupon normalization**: `coupon_code` canonicalized as `upper(trim(code))`, or a fixed sentinel (e.g. `null`) if absent — **identical to `create_order`'s own normalization** (`nullif(upper(trim(p_coupon_code)), '')`), so the fingerprint's coupon field always matches what `create_order` will itself derive.
6. **UUID normalization**: lowercase every UUID string before hashing (`restaurant_id`, `branch_id`, `product_id`) — matches Postgres's own case-insensitive `uuid` comparison semantics, avoiding a spurious mismatch from case alone.
7. **Numeric normalization**: quantity as integer, never as a string, never with decimal formatting.
8. **`type` normalization**: exact string match against the fixed 3-value enum (`dine_in`/`takeaway`/`delivery`) — no normalization needed beyond that.

This canonicalization only needs to be **as strict as `create_order`'s own equivalence rules** — no stricter, no looser — which is exactly what was derived above from the actual SQL, not assumed.

---

# PAYMENT_INTEGRITY_FIELDS

Separated from `ORDER_METADATA_FIELDS`, per the explicit instruction not to include fields merely because they exist:

**PAYMENT_INTEGRITY_FIELDS** (must be bound / fingerprinted — these determine price or cart identity):
`restaurant_id`, `branch_id`, `type`, `items[].{product_id, quantity, options}`, `coupon_code`.

**ORDER_METADATA_FIELDS** (useful to retain for recovery/record-keeping, but must NOT be part of the price/cart-identity fingerprint):
`table_number`, `delivery_address`, `customer_name`, `customer_phone`, `notes` (order-level and per-line), `p_client_total` (advisory only, already established).

`currency` is effectively constant (SAR, hardcoded throughout the payments layer) — not meaningfully "critical" in the sense of varying, but included in the stored snapshot for completeness/auditability, not in the fingerprint (nothing currently makes it vary).

---

# PAYMENT_TRANSACTION_METADATA

Live schema, re-verified via `information_schema.columns` (not assumed from any prior report):

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
| **`metadata`** | **jsonb** | **NO** | **`'{}'::jsonb`** |
| `raw` | jsonb | YES | — |
| `created_at` | timestamptz | NO | `now()` |
| `updated_at` | timestamptz | NO | `now()` |

**RLS**: exactly one policy — `ptx_admin_all`, `cmd=ALL`, `roles={public}`, `qual`/`with_check` both `is_platform_admin()`. **This means no ordinary client role (anon or authenticated) can read or write this table at all, for any operation.** All access in this codebase already goes through `service_role` (via an Edge Function, per `paymentService.js`'s own header comment), which bypasses RLS entirely.

**Current metadata usage** (`paymentService.startCharge`, the only code that touches it — the webhook handler never references `.metadata`):
1. On INSERT: `metadata: input.metadata ?? {}` — whatever the caller passed, verbatim.
2. After the provider call: `const meta = { ...(input.metadata ?? {}) }; if (chargeResult.redirectUrl) meta.redirect_url = chargeResult.redirectUrl` then a full-object `UPDATE ... metadata: meta` — this is a **controlled spread-and-append**, not a destructive overwrite of unrelated keys, and not a partial JSON merge either (it's a full replace of the column value, but the replacement value is built by spreading the original input first).
3. `startCharge` currently has **zero real callers** in this codebase outside its own tests — confirmed via repository-wide search. The Payment Service is not yet wired to any checkout flow, consistent with every prior audit this session.

**Can `metadata` safely hold a checkout/cart binding?** **Yes** — it is `jsonb` (no size/shape constraint beyond Postgres's own jsonb limits), already access-controlled to server-only, and its one existing writer already follows a safe, non-destructive read-then-append pattern that a `checkout` sub-key would survive unchanged through the full `startCharge` lifecycle (INSERT → provider call → UPDATE).

---

# ARCHITECTURE_OPTIONS

| | A — Hash only | B — Snapshot only | **C — Hash + Snapshot (both in `metadata`)** | D — Persistent quote table | E — Signed stateless token | F — Server checkout session |
|---|---|---|---|---|---|---|
| Security | Verifies cart identity but gives no recovery data | Verifies by direct value comparison; recovery data present | Both — fast equality check + full recovery data | Strongest (dedicated table, its own RLS) but heaviest | Verifies tamper-evidence in transit, but (per 3.6A-1's own prior finding) `create_order` never trusts the quoted number anyway, so signing adds ceremony without a corresponding removed risk | Strongest session-continuity guarantee, heaviest |
| Amount integrity | N/A — amount integrity is already `create_order`'s job (3.6A-1a), untouched by any of these options | same | same | same | same | same |
| Cart integrity | Yes, but only as a compare-and-reject check — no way to recover *what* the cart was if the hash mismatches or the browser is gone | Yes, directly — the values are right there | Yes, both ways | Yes | Yes, but only while the token is held by *someone* — lost if the browser disappears (same gap as A) | Yes |
| Implementation complexity | Low (one canonicalization function + one comparison) | Low (one snapshot-building function, no hashing) | Low-medium (both, still no schema change) | Medium-high (new table, RLS, lifecycle) | Medium (signing key management, verification code) | High (session table, expiry, cleanup) |
| Schema impact | None | None | **None** | New table + RLS | None (but needs a signing secret, a new kind of secret to manage) | New table + RLS |
| Replay safety | A stale fingerprint just fails equality — safe | A stale snapshot is still usable data — `create_order`'s own re-check is what actually catches staleness (3.6A-1's established mechanism), unaffected by whichever of these options is chosen | Same as B, plus a fast fail-fast path | Same, plus explicit quote-row status tracking | Signature remains valid regardless of staleness unless an expiry claim is added — extra design surface for no corresponding benefit here | Same as B |
| Debugging / auditability | Hash alone is not human-readable — a support engineer looking at a failed payment sees nothing about what was in the cart | Full snapshot is directly inspectable | Best of both | Best of both, plus a queryable table | Poor — opaque token, and the signing key must be available to decode it for debugging | Good |
| Multiple payment attempts | Each attempt's own row can hold its own hash — fine | Each attempt's own row holds its own snapshot — fine | Fine | Fine, needs its own row per attempt too | Fine (each attempt gets its own token) | Fine |
| Coupon changes / product price changes | Detected downstream by `create_order`'s existing re-check regardless of which option is chosen (established in 3.6A-1) | same | same | same | same | same |
| Compatibility with `create_order` | None required — `create_order` is not modified by any option | none | **none** | none (quote table is separate) | none | none |
| Compatibility with `payment_transactions` | Fits in existing `metadata` | Fits in existing `metadata` | **Fits in existing `metadata`** | Requires a new FK relationship | Fits in existing `metadata` (store the token) | Requires session ↔ transaction linkage |
| Tenant isolation | Not itself an isolation mechanism — relies on `payment_transactions.restaurant_id` (existing column) as before | same | same | same, plus the quote table's own `restaurant_id` | same | same |
| Recovery after payment success (browser loss) | **Poor** — a hash proves nothing was tampered with, but doesn't tell the server what to actually build | **Good** — the snapshot has everything `create_order` needs except non-price fulfillment PII (see PRIVACY) | **Good, same as B, plus a fast integrity check** | Good, and gives the quote its own independent lifecycle/audit trail | **Poor**, same gap as A — the token itself must still be *somewhere* server-side to be useful for recovery, which is just Option B again with extra steps | Good |
| Future maintainability | Simple but incomplete on its own | Simple and sufficient | Simple and sufficient, marginal extra cost for the hash | More moving parts to maintain (table lifecycle, cleanup) for a benefit (queryability) already available via `metadata` on the existing table | Adds a secret-management dependency (signing key rotation, verification) for a property (tamper-evidence) already redundant with `create_order`'s own re-verification | More moving parts, no clear benefit over C given `payment_transactions` already gives 1:1 attempt-scoped storage |

---

# RECOMMENDED_ARCHITECTURE

**Option C.** Store, inside each `payment_transactions.metadata` object, under a new `checkout` sub-key:

```
metadata.checkout = {
  restaurant_id, branch_id, type,                    // PAYMENT_INTEGRITY (+ tenant isolation)
  items: [ { product_id, quantity, options }, ... ],  // PAYMENT_INTEGRITY (canonical order, see CANONICALIZATION)
  coupon_code,                                        // PAYMENT_INTEGRITY
  subtotal, tax, delivery_fee, total, currency,        // SERVER_COMPUTED, from the dry-run result
  fingerprint,                                         // SERVER_COMPUTED, SHA-256 of the canonical PAYMENT_INTEGRITY subset above
  quoted_at,                                            // SERVER_COMPUTED, timestamp of the dry-run call
}
```

No new table, no new `payment_transactions` column, no `create_order` parameter, no new RPC, no RLS change — `metadata` already has the right type, the right access control, and the right lifecycle behavior for this. This is a **convention enforced by the future orchestration service** (the not-yet-built Payment-First Checkout Service), not by the database.

---

# HASH_DESIGN

**Fields hashed** (exactly the PAYMENT_INTEGRITY_FIELDS subset, canonicalized per CANONICALIZATION above): `restaurant_id` (lowercase), `branch_id` (lowercase), `type`, sorted `items[]` (each as `product_id.toLowerCase()`, `quantity`, sorted `optionsKey`), `coupon_code` (upper/trim or null-sentinel).

**Deterministic ordering**: items sorted by their canonical tuple; each item's options sorted by `(groupName, choiceName)` — both reusing the exact `useCart.js`-established sort/join pattern.

**Explicitly excluded from the hash** (present in the snapshot, not in the fingerprint): `notes`, `table_number`, `delivery_address`, `customer_name`, `customer_phone`, `subtotal`/`tax`/`delivery_fee`/`total` themselves (the total is separately guaranteed equal by `payment_transactions.amount` and `create_order`'s own recomputation — including it in the *cart*-identity fingerprint would conflate the two invariants the task itself asked to be treated as related-but-distinct).

**Encoding**: build the canonical structure as a fixed-key-order plain object (never rely on implicit `JSON.stringify` key-insertion-order alone across different code paths), serialize to UTF-8 JSON text, hash with **SHA-256**, encode as hex. No HMAC/signing key is needed — this value is never transmitted to or trusted from the client; it is computed and compared entirely server-side, so a keyed MAC would add secret-management overhead for no corresponding threat it defends against.

**Where should hashing happen?** **SERVER SERVICE** — the future orchestration layer that already calls `create_order(p_dry_run=true)` and then `paymentService.startCharge`, i.e. the same layer, not the database (`create_order` is explicitly not to be modified) and not the Edge Function specifically (the webhook Edge Function is a different, unrelated code path — this hashing happens at *checkout initiation* time, before any webhook is involved).

---

# SNAPSHOT_DESIGN

Using actual project fields (not the task's illustrative example verbatim, adjusted per PAYMENT_INTEGRITY_FIELDS/ORDER_METADATA_FIELDS above):

| Field | Source |
|---|---|
| `restaurant_id`, `branch_id`, `type`, `items`, `coupon_code` | **CLIENT_INPUT_SNAPSHOT** — the exact selectors the client submitted to the dry-run call, canonicalized |
| `subtotal`, `tax`, `delivery_fee`, `total` | **SERVER_COMPUTED** — taken directly from the `create_order(p_dry_run=true)` return row, never recomputed client-side |
| `currency` | **SERVER_COMPUTED** (constant `SAR` today, included for forward-compatibility, not because it currently varies) |
| `fingerprint` | **SERVER_COMPUTED** — see HASH_DESIGN |
| `quoted_at` | **SERVER_COMPUTED** — timestamp of the dry-run call, server clock |

`table_number`/`delivery_address`/`customer_name`/`customer_phone`/`notes` are **deliberately not included** in this snapshot by default — see PRIVACY below for the reasoning and the one open policy question this creates.

---

# MUTABILITY

**Can `payment_transactions.metadata` be modified after transaction creation?** Yes, by design — `startCharge`'s own second write (after the provider call) replaces it. **Who can modify it?** Only `service_role`-executing code (per the single `ptx_admin_all` RLS policy, `is_platform_admin()` only) — **the client (browser) has no write path to this table at all, direct or indirect, today.** There is no PostgREST/`supabase-js` client-side call anywhere in this codebase that touches `payment_transactions` — confirmed by the repository-wide search finding `startCharge` has zero real callers yet, and by the file's own header comment stating all production access goes through an Edge Function using `service_role`.

**Could the client change `checkout_snapshot` or `checkout_fingerprint` after payment initialization?** **No — not with the current architecture, and this doesn't require any new protection.** The RLS boundary that already prevents this was put in place before this audit and is not a gap this design needs to close; it's a precondition this design gets to rely on.

**Would additional database/RLS protection be required?** **No new protection is required for client-side tampering.** The one thing worth calling out (not a required change, an observation): the second `startCharge` write is a **full-object replace**, not a partial merge — so any *future* server-side code that writes to `metadata` after the `checkout` key has been set must be written carefully (spread the existing object, don't blindly overwrite) to avoid accidentally dropping the snapshot. This is a coding-discipline note for the eventual implementation task, not a schema/RLS gap.

---

# QUOTE_EXPIRY

The dry-run is stateless (Task 3.6A-1a) and this audit does not introduce persistence, so there is no "quote row" that could expire in the traditional sense. The two scenarios posed:

- **Quote → wait 5 minutes → product price changes → payment**: at the eventual real `create_order` call, the server recomputes price from current `products`/`coupons` state and compares against `p_client_total` (which, per POST_PAYMENT_ORDER_CREATION below, should be set to the *bound* total from the snapshot). If the current price differs, the existing `price_changed` mechanism fires — no order is created. This is **already the correct, sufficient behavior**, unmodified.
- **Quote → coupon expires → payment**: identical reasoning — `create_order`'s own coupon `SELECT ... WHERE expires_at >= now() ... FOR UPDATE` re-evaluates at call time regardless of how old the bound snapshot is; an expired coupon raises `invalid or expired coupon` and no order is created.

**Recommendation: no new expiry mechanism.** "Re-price before order" is not a new design decision — it is **exactly what `create_order` already, unconditionally, does today**, and it is sufficient because staleness degrades into the same safe, already-tested rejection path in both scenarios. The **invariant**, stated precisely: *a checkout binding never expires on its own; instead, every real `create_order` call — regardless of the age of the binding that produced its inputs — independently re-derives price and coupon validity from current database state, and refuses to create an order if that derivation disagrees with what was paid for.*

---

# PAYMENT_TRANSACTION_CREATION

Exact point in the designed flow:

```
Client checkout request
      ↓
create_order(p_dry_run=true)  →  authoritative server total (subtotal/tax/delivery_fee/total)
      ↓
[HERE] build canonical checkout snapshot from the SAME client cart input just used for the dry-run
       call + the dry-run's own returned totals; compute fingerprint from its PAYMENT_INTEGRITY subset
      ↓
payment_transaction INSERT — amount = dry-run total, metadata.checkout = the snapshot just built
      ↓
paymentService.startCharge (unmodified — already accepts input.metadata verbatim)
```

**Critical requirement, satisfied by construction**: the snapshot is built from *the exact same cart object* that was just passed into the dry-run call, and the amount charged is *the exact same total* the dry-run call just returned — there is no intervening step where either could drift, because both come from the same single orchestration call in the same request.

---

# POST_PAYMENT_ORDER_CREATION

**B, with an optional non-authoritative client fingerprint check** — not A, not a hard C:

- The real `create_order` call's `p_restaurant_id`, `p_branch_id`, `p_type`, `p_items`, `p_coupon_code`, and `p_client_total` are sourced **from the stored `metadata.checkout` snapshot on the payment_transactions row that succeeded** — not from a fresh client resubmission — because the server-stored copy is guaranteed present and untampered (MUTABILITY above), while a client resubmission is neither guaranteed to exist (browser loss) nor guaranteed to still match (the exact substitution risk this whole task exists to close).
- **If** the browser is still present (the common case — customer redirected back from Moyasar and the frontend is still running), it *may* resubmit its own current cart, and the orchestration service *may* compute that cart's fingerprint and compare it to the stored one as a fast, friendly early check ("your cart changed since you paid — here's what we're using instead") — but this check is **never a substitute for using the stored snapshot's values as the actual arguments to `create_order`**, and its outcome never overrides them.
- **This preserves server authority absolutely**: the client is never in a position to supply the values `create_order` actually receives for the paid attempt — those always come from what the server itself stored at charge-creation time.

**What happens if the browser disappears after payment?** Fully answered by BROWSER_LOSS_RECOVERY below — this design was built specifically to make that scenario recoverable.

---

# BROWSER_LOSS_RECOVERY

**Scenario**: payment succeeds → customer closes browser → frontend never calls `create_order`.

**With this design**: the succeeded `payment_transactions` row already holds everything `create_order` needs *except* the pure-fulfillment-metadata fields this audit deliberately excluded from the default snapshot (`table_number`, `delivery_address`, `customer_name`, `customer_phone`) — see PRIVACY for why, and for the one open decision this creates. A server-side reconciliation job (the future G-5/reconciliation work, already flagged as separate in Task 3.6A-1) can:
1. Find `payment_transactions` rows with `status='succeeded'` and no linked order (`orders.payment_transaction_id IS NULL` for that transaction id).
2. Read `metadata.checkout` — restaurant, branch, type, items, coupon, total — everything needed to know **what was bought and for how much**.
3. Either automatically call `create_order` with that data (if a policy decision, see PRIVACY, allows synthesizing placeholder fulfillment fields or storing minimal PII specifically for this purpose) or surface the transaction to a human operator who has enough information to manually contact the customer and complete the order — **either way, nothing about what was purchased or how much was paid is lost.**

Without any binding at all (today's state, pre-this-design), a lost-browser succeeded payment would leave only `payment_transactions.amount` — a bare number, with no way to know what it was for. **This is the concrete, evidence-based justification for why Option C (not A) is required for recovery, not merely nice-to-have.**

---

# MULTIPLE_PAYMENT_ATTEMPTS

**Each `payment_transactions` row already gets its own independent snapshot, by construction — no extra design is needed for this.** `startCharge` inserts a **new row per attempt** (unless the caller reuses the same `idempotency_key`, in which case the existing row's snapshot is correctly what's returned, not a new one). Since the snapshot lives in that row's own `metadata`, and rows are never updated across each other:

- **Attempt 1 (Cart A) fails, Attempt 2 (Cart A) succeeds**: two rows, both with Cart A's snapshot — the succeeded row's snapshot is the one recovery/order-creation uses; the failed row's snapshot remains as a correct historical record of what was attempted and failed.
- **Cart A quoted → customer changes to Cart B → Attempt 2**: the orchestration service must re-run the dry-run → snapshot → `startCharge` sequence for Cart B, producing a **new** `payment_transactions` row with Cart B's snapshot, independent of Attempt 1's Cart A snapshot. Nothing in this design allows a stale snapshot from one attempt to leak into another attempt's row.

**Historical attempt integrity is preserved automatically** — this falls directly out of `payment_transactions` already being one-row-per-attempt and `metadata` already being per-row, not out of any new mechanism this audit needs to add.

---

# COUPON_INTEGRITY

- The bound `coupon_code` in the snapshot is a **selector**, exactly like `p_coupon_code` itself — never a reservation, never a lock. This audit does **not** recommend reserving coupons ahead of order creation — no evidence in the actual coupon logic requires it (re-confirmed from Task 3.6A-1: the coupon's `FOR UPDATE` row lock and usage-limit check already only ever run inside `create_order`'s own short transaction, at the moment of actual order creation, which is the correct and sufficient place for that race to be resolved).
- **"Quote valid → payment succeeds → coupon no longer valid before order creation"**: at the real `create_order` call, the coupon re-check (`expires_at >= now()`, `usage_count < usage_limit`) runs against current state. If it now fails, `create_order` raises an exception (`invalid or expired coupon` / `coupon usage limit reached`) and **no order is created** — the payment has already succeeded, but no order exists yet. **This must not, and — per the unmodified `create_order` logic — does not, silently produce `payment amount != order amount`**: there simply is no order in that case, only a succeeded payment with no linked order, which is the same class of recoverable-but-requires-reconciliation state already established for the price-change case in Task 3.6A-1's PRICE_CHANGE_AFTER_PAYMENT section. The fix for *that* payment (refund, retry with a valid coupon or without one, or manual resolution) is explicitly separate, later work — not something the binding mechanism itself should silently paper over by, for example, force-creating an order at a different total than what was charged.

---

# PRODUCT_PRICE_CHANGES

Scenario: dry-run total = 50, payment = 50, product price changes before the real `create_order` call, which recomputes = 55.

**Recommended: reject the order + reconciliation/refund path — not any of the alternatives.**

- **"Create order from immutable paid snapshot"** (i.e., force-create at the old total of 50 despite the product now genuinely costing 55 per current server state) — **rejected.** This would mean trusting a stored-but-now-stale number over the server's own current, authoritative computation — structurally identical to trusting a client-supplied price, just relocated to a different origin (a snapshot instead of a request parameter). It would silently reintroduce exactly the risk this entire line of work (3.6A-1 → 3.6A-1a → this audit) exists to eliminate.
- **"Price lock"** (reserve the old price server-side until the order is created) — **not recommended**, for the same reason Task 3.6A-1 declined a persistent-quote model: it requires new mutable state with its own lifecycle/expiry questions, to solve a problem that already has a safe, existing answer.
- **"Reject order + reconciliation/refund"** — **recommended**, because it is the literal, unmodified behavior `create_order` already exhibits today (the `price_changed` early-return), applied consistently. The financial-safety property this preserves: **the system never creates an order at a total that doesn't match its own current, independently-computed price** — a mismatch always fails safely into "no order, payment needs reconciliation," never into "order created at a stale or unverified number."

This is the same answer already given for PRICE_CHANGE_AFTER_PAYMENT in Task 3.6A-1 — restated and reconfirmed here specifically for the cart-binding context, not a new decision.

---

# TENANT_ISOLATION

**Enforcement layer, precisely**: when the orchestration service builds the real `create_order` call from a succeeded payment's stored snapshot, it must source `p_restaurant_id` from **`payment_transactions.restaurant_id`, the existing first-class column** — not from `metadata.checkout.restaurant_id` — as the primary, trusted value. The metadata copy exists for the fingerprint/display/audit trail, not as the authority for this specific invariant. This means `binding.restaurant_id == payment_transactions.restaurant_id` is enforced **trivially and by construction**, since there is only ever one restaurant_id actually used for the call (the column), and the metadata copy is never independently consulted for this purpose.

Beyond that, `create_order` **itself already, independently** re-validates that every product/branch referenced in `p_items` actually belongs to `p_restaurant_id`/`p_branch_id` (existing code, unmodified) — so even a hypothetical bug that fed a mismatched `restaurant_id` into the real call would still be caught by `create_order`'s own existing cross-ownership checks, as a second, independent layer. **No new tenant-isolation mechanism is required** — the existing column + the existing `create_order` validation together already fully cover this.

---

# CLIENT_TRUST_BOUNDARY

Explicitly, per the actual architecture (not assumption):

**The client may express intent for**: `product_id` selections, `quantity` per line, `options` selections (by name only), `coupon_code`, fulfillment `type`/`table_number`/`delivery_address` choice.

**The client is never authoritative for**: product prices, option prices, discount amount, tax, delivery fee, total (`create_order` computes every one of these server-side, unconditionally, confirmed exhaustively in Task 3.6A-1), `provider_ref` (Moyasar-assigned, never client-supplied — confirmed via `MoyasarAdapter`), payment status (governed by `paymentService`/the webhook, never a client write — confirmed via the RLS policy above, the client cannot write `payment_transactions` at all).

This design does not change this boundary in any direction — it only adds a server-side record of what the client's *intent* (the selector fields) was at the moment a specific payment attempt was created, so that intent can be verified/recovered later without ever treating the client as authoritative for anything it wasn't already non-authoritative for.

---

# PRIVACY

**Would the snapshot, as designed above, contain PII?** **No, by deliberate design** — the recommended default snapshot (`restaurant_id`, `branch_id`, `type`, `items`, `coupon_code`, computed totals, fingerprint, timestamp) contains **zero customer PII**. Product IDs, quantities, option names, coupon codes, and monetary totals are business data, not personal data.

**The one open question, correctly surfaced rather than resolved unilaterally**: `table_number`/`delivery_address`/`customer_name`/`customer_phone` are excluded from the default snapshot specifically to avoid duplicating PII into a table whose primary purpose is payment bookkeeping. This has a real cost: **BROWSER_LOSS_RECOVERY, as designed, can tell an operator exactly what was bought and for how much, but not automatically who to fulfill it for or how to reach them**, without a manual step to correlate the transaction back to the customer through some other channel (e.g. Moyasar's own dashboard, which likely retains the payment method's billing details independent of this system).

Per the task's own instruction ("if recovery requires PII, evaluate whether a dedicated secure checkout record is preferable to payment metadata"): **`payment_transactions` is already, structurally, exactly as secure as a dedicated record would be** — the RLS boundary (`is_platform_admin()` only, confirmed above) is already the strongest access control this project uses anywhere for this kind of data. So the choice is not "insecure metadata vs. a secure dedicated table" (both are equally secure) — it is genuinely **"minimize PII surface even in an already-secure location" vs. "accept some PII duplication in `metadata` for full automatic recovery."** This audit recommends the minimize-PII default and flags the fuller-recovery alternative as an explicit, owner-level decision to be made when the recovery/reconciliation work (G-5-adjacent, already separately tracked) is actually scoped — **not a blocker to approving the core cart-binding mechanism itself**, which is fully specified above independent of this choice.

---

# SECURITY_THREAT_MATRIX

| # | Attack | Current protection | Proposed protection | Residual risk |
|---|---|---|---|---|
| 1 | Change cart after quote | None specific today (only amount is checked, via `p_client_total`/`price_changed`) | Real `create_order` call uses the **stored snapshot's** items, not a fresh client resubmission — a changed cart simply never reaches the real call | None for the bound attempt; a genuinely new cart requires a genuinely new payment attempt with its own snapshot, which is correct, not a gap |
| 2 | Same-total item substitution (the original 3.6A-1 residual gap) | None — amount equality alone doesn't prove cart equality | **Closed** — the snapshot's items, not a resubmitted cart, drive the real `create_order` call | None, for attempts that go through the orchestration service as designed |
| 3 | Change quantity | `create_order` re-validates range (1–99) but doesn't compare to what was paid for | Snapshot's quantity is what's used — a changed quantity is simply not possible to smuggle into the bound attempt | None |
| 4 | Change options | Re-validated against current product definition, but not compared to what was paid for | Snapshot's options are what's used | None |
| 5 | Change restaurant | `create_order` validates the restaurant is active/not suspended, but nothing today ties it to what was quoted | `p_restaurant_id` for the real call sourced from `payment_transactions.restaurant_id` (the column, not metadata) | None — enforced by the existing column, not a new mechanism |
| 6 | Change branch | Similarly, cross-checked against restaurant but not against what was quoted | Snapshot's `branch_id` is what's used | None |
| 7 | Change coupon | Re-validated for validity, but not compared to what was quoted | Snapshot's `coupon_code` is what's used | None for the bound attempt; a genuinely different coupon requires a new attempt |
| 8 | Change fulfillment type | Gates required fields (`table_number`/`delivery_address`) and the delivery fee, but not compared to what was quoted | Snapshot's `type` is what's used | None |
| 9 | Change delivery details affecting price | N/A today — delivery fee is flat per-branch, address text never affects the fee amount (established fact, not new) | Same — `type`/`branch_id` (which the snapshot binds) fully determine the fee; the address text itself was never price-relevant | None beyond the already-accepted fact that address text isn't price-relevant |
| 10 | Change amount | Already closed by `p_client_total`/`price_changed` (Task 3.6A-1) and by `payment_transactions.amount` being the actual charged amount | Unchanged — this task doesn't alter amount integrity, only cart integrity | None, pre-existing closure |
| 11 | Reuse payment transaction (attach one `payment_transaction_id` to two orders) | Already closed — `orders_payment_transaction_id_uidx` (Task 3.5), unique partial index | Unchanged | None, pre-existing closure |
| 12 | Replay old quote/binding | A stale snapshot simply re-enters `create_order`'s existing price/coupon re-check, which fails safely if anything has changed (QUOTE_EXPIRY above) | Unchanged reasoning, now also covers cart identity, not just price | None beyond the accepted "fails into reconciliation" outcome for genuinely stale attempts |
| 13 | Use another tenant's payment | `payment_transactions.restaurant_id` already scopes the row; `create_order`'s own cross-ownership checks are a second layer | Real call always sourced from the column, never from a client-suppliable value | None |
| 14 | Modify metadata (client tampering) | **Already fully closed** — RLS (`ptx_admin_all`, `is_platform_admin()` only) means the client has no write path to this table at all | No new protection needed — pre-existing | None |
| 15 | Browser loss after payment | Today: only the bare amount survives, nothing recoverable about *what* was bought | Snapshot in `metadata.checkout` preserves restaurant/branch/type/items/coupon/total | Fulfillment PII (phone/address) is not retained by default — see PRIVACY; recovery may require a manual customer-contact step |
| 16 | Product price change (quote→payment→order window) | `create_order`'s existing `price_changed` mechanism | Unchanged — the binding doesn't need its own price-staleness handling, this is already handled | Accepted: results in a succeeded-payment-no-order state needing reconciliation (separate, already-tracked work) |
| 17 | Coupon expiration after payment | `create_order`'s existing coupon re-check | Unchanged, same mechanism now also implicitly covers "was this the coupon that was actually quoted" via the bound `coupon_code` | Same reconciliation-needed outcome as #16, not a silent amount mismatch |

---

# SCHEMA_IMPACT

**Metadata convention only.** Specifically:

- No new table.
- No new `payment_transactions` column (`metadata jsonb` already exists, already has the right access control).
- No `create_order` parameter change.
- No new RPC.
- No RLS change (the existing `ptx_admin_all` policy already correctly locks this down).

The only "change" is a **documented convention** for what the future checkout-orchestration service writes into `metadata.checkout` at charge-creation time, and a **documented rule** for where the future order-creation/recovery service reads its `create_order` call arguments from (the stored snapshot + the `restaurant_id` column, never a fresh client resubmission as the authoritative source).

---

# IMPLEMENTATION_BREAKDOWN

Derived from the recommended architecture, continuing this session's established numbering:

### 3.6A-1b.1 — Canonicalization + fingerprint utility
- **Objective**: pure-function module implementing the canonical cart-tuple construction and SHA-256 fingerprint, exactly as specified in CANONICALIZATION/HASH_DESIGN.
- **Files**: new, e.g. `src/payments/checkoutBinding.js` (or similar) — no existing file modified.
- **DB changes**: none.
- **Tests**: same cart → same fingerprint; reordered-but-equivalent cart → same fingerprint; different product/quantity/options/coupon/restaurant/branch/type → different fingerprint (mirrors ACCEPTANCE_CRITERIA below).
- **Risks**: low — pure, isolated logic, directly testable without any DB/network dependency.
- **Acceptance criteria**: the full ACCEPTANCE_CRITERIA list below, for the fingerprint-equality properties specifically.

### 3.6A-1b.2 — Checkout snapshot builder
- **Objective**: pure function combining a raw client cart + a `create_order(p_dry_run=true)` result into the full `metadata.checkout` object (snapshot fields + fingerprint from 3.6A-1b.1).
- **Files**: same module or a sibling file; no existing file modified.
- **DB changes**: none.
- **Tests**: snapshot correctly separates CLIENT_INPUT_SNAPSHOT vs. SERVER_COMPUTED fields; snapshot excludes PII by default per PRIVACY.
- **Risks**: low.
- **Acceptance criteria**: snapshot's fingerprint matches 3.6A-1b.1's output for the same inputs; snapshot's computed fields match the dry-run result exactly (no recomputation, no drift).

### 3.6A-2 — Payment-First Checkout Service (orchestration wiring)
- **Objective**: the not-yet-built service that calls `create_order(p_dry_run=true)` → 3.6A-1b.2's snapshot builder → `paymentService.startCharge(..., metadata: {checkout: snapshot})`. This is the "Payment Service wiring" referenced in the original Task 3.6 Scope Audit.
- **Files**: new service/hook; `paymentService.js` itself requires **no changes** (already accepts `input.metadata` verbatim).
- **DB changes**: none (writes only to the already-existing `metadata` column, via existing `startCharge` code).
- **Tests**: full flow test — dry-run total, snapshot, and charged amount all provably derived from the same single cart input within one orchestration call.
- **Risks**: this is where the actual Moyasar integration is first exercised end-to-end — needs the sandbox access already separately tracked as a blocker (G-6) for any *live* provider testing, though logic can be tested against a mocked adapter first.
- **Acceptance criteria**: payment amount == dry-run total == snapshot total, provably from shared inputs, not merely observed equal.

### 3.6B — Post-payment order creation / recovery
- **Objective**: the service that, given a succeeded `payment_transactions` row, reads `metadata.checkout` + `restaurant_id` (column) and calls the real (non-dry-run) `create_order`, per POST_PAYMENT_ORDER_CREATION above; plus the reconciliation path for succeeded-payment-no-order states (price/coupon changed, or browser loss).
- **Files**: new service; `create_order` itself unmodified.
- **DB changes**: none required by this audit's recommendation (a reconciliation *queue/table* is plausible future work, but out of this audit's scope to design).
- **Tests**: order created from the stored snapshot matches what would have been created from the original cart; browser-loss scenario produces a recoverable, correctly-attributed pending-reconciliation state, not silent data loss.
- **Risks**: this is where the PRIVACY open question (PII in recovery data) needs an owner decision before full automatic recovery can be built — partial (manual-recovery) capability doesn't require that decision.
- **Acceptance criteria**: matches ACCEPTANCE_CRITERIA's order-creation and browser-loss items below.

---

# ACCEPTANCE_CRITERIA

For the eventual implementation (3.6A-1b.1/.2 specifically) to be considered correct:

- Same cart (identical items/options/coupon/restaurant/branch/type) → same canonical binding, every time.
- Semantically equivalent item ordering (same items, different array order) → same binding.
- Different product → different binding.
- Different quantity → different binding.
- Different options (different choice, or same group missing) → different binding.
- Different coupon (including "coupon present" vs. "no coupon") → different binding.
- Different restaurant or branch → different binding.
- Different fulfillment `type` (which changes delivery-fee applicability) → different binding.
- The client cannot modify a stored binding after creation — **already true today**, verified via the `ptx_admin_all` RLS policy, not something the implementation needs to newly enforce.
- Payment amount matches the bound server total — **already true today**, per Task 3.6A-1a's `p_dry_run` design; this audit's binding rides alongside it, doesn't re-derive it.
- `create_order` cannot be made to create a different cart for a given payment — true once 3.6B sources its call arguments from the stored snapshot rather than a fresh client resubmission (POST_PAYMENT_ORDER_CREATION).
- Another restaurant cannot use a payment belonging to a different restaurant — **already true today**, via `payment_transactions.restaurant_id` + `create_order`'s existing cross-ownership checks (TENANT_ISOLATION).
- A failed attempt's binding remains a correct, undisturbed historical record — true by construction, since each attempt is its own row (MULTIPLE_PAYMENT_ATTEMPTS).
- A succeeded attempt remains recoverable after browser loss, for everything except the PII fields explicitly excluded by default (BROWSER_LOSS_RECOVERY/PRIVACY).
- No client-controlled value is ever authoritative for pricing — **unchanged from today**, this design adds cart-identity binding without touching the pricing trust boundary at all.

---

# BLOCKERS

None for the core cart-binding mechanism — it is fully specifiable from the existing, already-inspected architecture (`payment_transactions.metadata`'s type/RLS/usage pattern, `create_order`'s exact pricing/validation logic, `p_items`'s exact real-world shape). The one item that is **not** a blocker but is explicitly **not resolved here** is the PII-in-recovery-data policy question (PRIVACY) — it doesn't prevent approving or beginning 3.6A-1b.1/.2, only bears on how complete *automatic* browser-loss recovery can be until it's decided.

# RISKS

- The PRIVACY open question, if left undecided indefinitely, means browser-loss recovery stays partially manual (operator must separately identify the customer) rather than fully automatic — a real but bounded operational cost, not a financial-integrity risk.
- The future `startCharge` caller (3.6A-2) must follow the "spread, don't overwrite" discipline already established in `startCharge`'s own existing code when building `input.metadata`, so a `checkout` key set at INSERT time survives the second UPDATE — a coding-discipline note, not a schema gap (MUTABILITY).
- This audit's fingerprint/snapshot mechanism is a **defense-in-depth and recovery** layer, not a *replacement* for `create_order`'s own re-verification — any future implementation must not be tempted to skip or weaken that re-verification on the theory that "the binding already proved it," since the binding proves *intent at charge time*, not *validity at order-creation time* (QUOTE_EXPIRY/PRODUCT_PRICE_CHANGES both depend on that re-verification still running unconditionally).

---

# REPORT_FILE

`reports/TASK_3_6A_1B_CART_INTEGRITY_QUOTE_BINDING_AUDIT.md`

# DOWNLOAD_COPY

`/sdcard/Download/TASK_3_6A_1B_CART_INTEGRITY_QUOTE_BINDING_AUDIT.md` (copied and checksum-verified after this report was written).

# NEXT_STEP

Architecture recommendation is ready for owner review — specifically, a decision on the PRIVACY open question (minimal-PII snapshot with partial manual recovery, vs. accepting some PII duplication in `metadata` for full automatic recovery) would let 3.6B's recovery scope be fully specified. No implementation (3.6A-1b.1/.2, 3.6A-2, 3.6B, or any other numbered task) begins without separate, explicit instruction, per this task's own strict stop list.

---

*Report generated 2026-08-26. Architecture analysis only — no code written, no schema modified, no migration created, no deployment, no Moyasar call, no commit, no push.*
