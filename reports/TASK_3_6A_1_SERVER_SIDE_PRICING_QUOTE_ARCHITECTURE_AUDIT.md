# Task 3.6A-1 — Server-Side Pricing / Payment Quote Architecture Audit

**Read-only. No code, schema, or configuration was changed. No migration created. Nothing deployed or committed.**

---

# EXECUTIVE SUMMARY

`create_order`'s pricing logic was traced statement-by-statement. Every price-*determining* input it uses is already server-side database state (`restaurants`/`branches`/`products`/`coupons`, read live); the client only ever controls *selection* (which items, which coupon code, which order type), never a value. This means a safe quote mechanism is architecturally straightforward — the hard part was never "can pricing be made safe," it's "how do we guarantee a quote, a payment, and the eventual order never silently disagree."

**The key insight driving this audit's recommendation**: `create_order` **already has a live, tested, production-proven mismatch-rejection mechanism** (`p_client_total` vs. its own recomputed `v_total` → `price_changed=true`, no row created). This existing mechanism is the *actual* enforcement point for the `QUOTE_TOTAL == PAYMENT_AMOUNT == ORDER_TOTAL` invariant — not something that needs to be newly invented. A quote engine's job is therefore to produce a *very likely correct* number fast, not a *provably tamper-proof* one — because `create_order` independently re-verifies regardless, exactly as it already does today for the 100%-cash flow.

This reframes the option comparison: full extraction of pricing logic into a shared function (Option A) is still the cleanest long-term answer, but a `create_order` dry-run flag reusing the *exact same code path* (Option D) offers an even stronger consistency guarantee with a smaller, more surgical diff. A **stateless** quote (no persistence) is sufficient — a persistent quote table (Option E) is evaluated and **not recommended** as a first step, since it adds real complexity (expiry, session identity, cart fingerprinting) to solve a race window that `create_order`'s existing safety net already bounds to "a failed order + a stuck charge needing manual/automated refund," not "silent financial harm."

**Recommended architecture: Option D (create_order dry-run) as the primary path, with Option A noted as the cleaner long-term refactor if D's input-contract awkwardness becomes a real problem.** Neither was implemented — this is an architecture recommendation only.

**Final verdict: `PRICING_ARCHITECTURE_READY_WITH_DECISIONS`**

---

# CURRENT PRICING ENGINE

*(Phase 1 — traced from `sql/order_payment_reference.sql`, the current live `create_order` body, re-verified this session.)*

| Element | Exact logic |
|---|---|
| Product price lookup | `SELECT p.id, p.restaurant_id, p.branch_id, ..., p.price, p.options, p.is_available FROM public.products p WHERE p.id = v_product_id` — one live `SELECT` per line item, every call. Never trusts a client-supplied price. |
| Quantity | `v_qty := coalesce((v_item->>'quantity')::integer, (v_item->>'qty')::integer, 0)`, validated `1–99`. Only a multiplier — the per-unit price is never client-supplied. |
| Product availability | `not v_product.is_available` / branch-mismatch → `raise exception 'product is unavailable for this branch'`, live-checked every call. |
| Option pricing | Each selected option validated against the product's *current* `options` JSON; price read from that same live JSON, not from the client's memory of it. Required groups enforced. |
| Subtotal | `v_item_price := product.price + options_price`; accumulated `v_subtotal_gross += v_item_price * v_qty` — fully server-derived. |
| Coupon lookup | `SELECT c.* FROM coupons c WHERE restaurant_id=... AND upper(code)=upper(trim(p_coupon_code)) AND is_active AND (expires_at IS NULL OR expires_at >= now()) AND (branch_id IS NULL OR branch_id = p_branch_id) FOR UPDATE` — row-locked, live, by code string only. |
| Coupon validation | Min order amount, usage limit, valid discount type — all exception-raising if violated. |
| Discount | `percent`: `round(subtotal * value/100, 2)`; `fixed`: `greatest(0, value)`; capped by `max_discount_amount`, then capped again at the subtotal itself. |
| Tax | `v_net := round(discounted_gross / 1.15, 2); v_tax := round(discounted_gross - v_net, 2)` — matches `lib/pricing.js`'s `VAT_RATE = 0.15` exactly. |
| Delivery fee | `case when p_type='delivery' then greatest(0, coalesce(branch.delivery_fee, 0)) else 0 end` — a **flat, branch-level fee**. No zone/distance/time/order-value/customer dependency of any kind. |
| Total | `round(discounted_gross + delivery_fee, 2)`. |
| Currency | Implicit SAR throughout — matches `MoyasarAdapter`'s hardcoded `currency: 'SAR'`. |
| Rounding | `round(..., 2)` at each derived step. |
| Min/max | 1–100 items, 1–99 qty per line; no explicit minimum order value outside a coupon's own `min_order_amount` gate. |
| Restaurant/branch relationship | Both must be `is_active`; restaurant not `platform_suspended`; branch not `is_paused`. |
| Client cross-check (non-authoritative) | `p_client_total` mismatch (`abs(diff) > 0.01`) → returns server numbers, `price_changed=true`, **no row created**. This is the exact mechanism this audit's recommendation leans on. |

---

# CLIENT CART

*(Phase 2 — `useCart.js`, `useCheckout.js`, `lib/pricing.js`, re-read in full.)*

- **Client-side data**: `cart` (`{id, price, basePrice, qty, note, selectedOptions}`, `price` **snapshotted at add-to-cart time**, not refreshed), persisted to `localStorage`; `idempotencyKey` (`crypto.randomUUID()`, one per non-empty cart).
- **Sent to `create_order`**: `p_items` (product IDs + quantities + option *selectors*, never prices), `p_coupon_code` (code string), `p_client_total` (advisory), plus logistics/identity fields (`p_type`, `p_table_number`, `p_delivery_address`, `p_customer_name/phone`).
- **Manipulable fields**: technically anything in the request — but `create_order` never *reads* a price from `p_items`, so manipulation can only change *which* real product/option/coupon is referenced, never the price itself.
- **Authoritative fields**: none, by design. All authority is `create_order`'s own live reads.
- **Coupon/discount path to server**: only the code string; `lib/pricing.js`'s `computeCouponDiscount()` is an explicitly-documented non-authoritative client replica ("لا يُوثَق بها كمصدر حقيقة").
- **Delivery fee**: server-only, flat per-branch — confirmed, re-verified this session, zero external/zone dependency.
- **Confirmed staleness risk**: cart `price` is a snapshot; a restaurant editing a product's price after add-to-cart produces a stale client total — exactly what `price_changed` exists to catch. Any quote mechanism must perform the same live re-lookup, never trust the cached cart price.

---

# CREATE_ORDER DEPENDENCIES

*(Phase 3 — classified by origin.)*

| Dependency | Classification |
|---|---|
| `p_restaurant_id`, `p_branch_id` | CLIENT DATA (selector) → resolves to DATABASE STATE |
| `restaurants`/`branches` rows (active/suspended/paused/delivery_fee) | DATABASE STATE |
| `p_type`, `p_table_number`, `p_delivery_address`, `p_customer_name/phone` | CLIENT DATA (price-irrelevant) |
| `p_items` (product IDs/qty/option selectors) | CLIENT DATA (selector) → resolves to DATABASE STATE (`products`) |
| `p_coupon_code` | CLIENT DATA (selector) → resolves to DATABASE STATE (`coupons`) |
| `p_client_total` | CLIENT DATA (advisory only, never authoritative) |
| `p_idempotency_key`, `p_payment_transaction_id` | CLIENT DATA (selectors, price-irrelevant) |
| Auth/session | AUTH CONTEXT — `create_order` is `SECURITY DEFINER` and does **not** call `auth.uid()` anywhere in its pricing path (re-confirmed this session) — consistent with guest/public ordering (ADR-9) |
| External services | **NONE** — no payment gateway, maps/distance API, or external tax service anywhere in the pricing computation; VAT rate is a hardcoded constant matching `lib/pricing.js` |

**Determination, unchanged from the prior pass**: the pricing calculation can be extracted without changing its business meaning — every value-determining dependency is already live database state, regardless of which function issues the `SELECT`.

---

# PRICING LOGIC REUSE ANALYSIS / ARCHITECTURE OPTIONS

*(Phase 4 — the five specified options, each evaluated against the eleven requested criteria.)*

### Option A — Shared PostgreSQL pricing function
Extract the pricing computation (item loop → coupon → VAT/delivery math) out of `create_order` into a standalone function both `create_order` and a new `quote_order` call.

### Option B — `quote_order` RPC
A new, additive, read-only RPC returning `subtotal/tax/delivery_fee/total` without creating a row. (Evaluated here as *implemented on top of A* — a standalone/duplicated B is covered under "duplication risk" below and is not separately recommended.)

### Option C — Dedicated pricing service/function
A **freshly-written**, independent SQL function implementing the same intended logic, *not* extracted from `create_order`'s existing code — `create_order` itself is left untouched.

### Option D — `create_order` internal dry-run mode
Add one new parameter (e.g. `p_dry_run boolean DEFAULT false`) and a single early-return branch immediately before the existing `INSERT` statement, returning the already-computed totals without writing a row. **The pricing code path itself is not duplicated, extracted, or rewritten — it is the literal same code, just exited early.**

### Option E — Separate quote table + pricing function
Persist quotes (id, snapshot of computed totals, expiry, status) in a new table, computed via a pricing function (shared or dedicated).

| Criterion | A (extract+share) | B alone (duplicated) | C (dedicated, fresh) | D (dry-run flag) | E (persistent quote) |
|---|---|---|---|---|---|
| Price consistency | Guaranteed by construction | Not guaranteed | Not guaranteed (fresh code can drift) — but bounded by `create_order`'s own re-check | **Guaranteed by construction — literally the same code** | Same as whichever pricing engine backs it (A/C/D) + adds a second consistency question (is the *stored* quote still valid at redemption time?) |
| Code duplication | None | High | Some (a second, independent implementation) | **None** | Depends on backing engine |
| Transaction safety | Same guarantees as `create_order` today (single transaction, `FOR UPDATE` on coupons) | Same, but a second code path to keep in sync | Same mechanics, independently implemented | **Identical — same transaction semantics as `create_order` itself** | Requires its own transaction design for quote creation + later redemption |
| Coupon correctness | Preserved exactly | Must be manually kept in sync | Must be manually kept in sync | **Preserved exactly (same code)** | Depends on backing engine; adds a *new* race — see COUPONS below |
| Concurrency | Same `FOR UPDATE` lock as today | Independent locking must be re-implemented correctly | Same requirement, independently implemented | **Identical — reuses the exact existing lock** | Adds concurrency questions around quote expiry/reuse |
| Security | No new attack surface beyond a new read-only entry point | Same | Same | Same — new parameter is `DEFAULT false`, so existing callers are unaffected | Introduces a new object (quote row) with its own access-control questions (Phase 14) |
| Performance | One extra function-call hop | Two independent code paths, no extra hop | Same as A | Negligible — same function, same query plan characteristics | Extra table read/write per quote |
| Auditability | Single logic location | Two locations to audit | Two locations to audit | **Single location — it's the same function** | Adds an auditable quote record (a genuine plus, if persistence is later wanted) |
| Compatibility with current `create_order` | Requires refactoring its internals | No impact on `create_order` | **No impact on `create_order` at all** | Requires a signature change (new overload → old-signature `DROP` cutover, same pattern already proven safe in Task 3.5) | Depends on backing engine |
| Migration complexity | Medium–high (touches every line of the pricing section) | Low (purely additive) | Low (purely additive, `create_order` untouched) | **Low–medium (small, surgical diff to a well-understood function)** | Medium (new table + RLS + backing engine) |
| Rollback | Revert the extraction + the `create_order` refactor together | Drop the new function | Drop the new function | Revert to the pre-flag signature (same documented DROP+CREATE pattern as every prior payment migration this session) | Drop the new table + function |
| Testability | Existing `create_order` tests continue to cover the shared logic; new tests for the wrapper only | Two independent test suites needed, risk of them silently diverging | Two independent test suites needed | **Existing `create_order` tests continue to exercise the exact same code the quote path uses** | Needs its own lifecycle tests (creation, expiry, redemption, reuse-prevention) |

**Options B-alone, C, and E-without-a-shared-engine all carry a real duplication or added-complexity cost that the other options avoid.** D and A are the only two options with zero duplication; D achieves this with a smaller, more surgical change than A.

---

# QUOTE MODEL

*(Phase 6 — is a persistent quote required?)*

**Stateless quote** (server computes, returns a number, keeps nothing): simplest, no new table, no expiry-management code, no cleanup job. Con: the client could theoretically request a quote, wait an arbitrarily long time, then attempt payment against a long-stale number — but this is not actually a *safety* problem given the recommended architecture, because `create_order` re-verifies independently regardless of how old the quoted number is; a stale quote just means a higher chance of hitting `price_changed=true` (a failed order, requiring the already-discussed recovery path), not a wrong charge being accepted.

**Persistent quote** (a new table, `quote_id`, `expires_at`, `status`, etc.): gives quotes a real identity that could be referenced by ID at payment/order time, and would let `create_order` (or a future variant) skip recomputation by trusting a still-valid, server-generated quote row instead of the client's raw numbers — a meaningfully *stronger* guarantee than "recompute and hope it's still close," at the cost of real new complexity: expiry policy, cleanup, RLS on a new table, and a new race (Phase 9: two customers redeeming quotes that both reserved the "last" coupon use).

**Recommendation**: **stateless quote is sufficient for a first implementation**, precisely because `create_order`'s existing re-verification is the real safety net either way. A persistent quote table is not recommended as a first step — it solves a problem (long-lived, ID-referenceable quotes) that hasn't been shown to be needed yet, and the schema/table for it is explicitly **not created in this audit**, per instruction.

---

# PRICE CONSISTENCY

*(Phase 5 — how `QUOTE_TOTAL == PAYMENT_AMOUNT == ORDER_TOTAL` is actually guaranteed, not assumed.)*

The invariant is enforced in three layers, none of them new inventions:

1. **Quote → Payment**: the checkout service (3.6A, not yet built) charges Moyasar for exactly the number `quote_order` (or `create_order(..., p_dry_run=true)`) just returned. This is a direct, immediate hand-off — no independent computation happens here.
2. **Payment → Order attempt**: the same number is passed as `p_client_total` to the real, non-dry-run `create_order` call.
3. **Order → Truth**: `create_order` **recomputes independently, exactly as it does today**, and compares. If they match (the overwhelming majority of cases, since steps 1–3 happen within seconds to at most a few minutes of each other), the order is created, linked to the payment (`p_payment_transaction_id`), and the invariant holds by direct verification, not by trust. **If they don't match, `price_changed=true`, no order is created — the invariant is never silently violated; it fails loudly and safely instead.**

**This is the concrete design**: the guarantee is not "the quote engine can never be wrong," it's "the system never accepts an order at a price that doesn't match what was actually charged, because the exact same authoritative check that already protects the cash flow today also protects this flow." No new invariant-enforcement code is required — `create_order`'s existing `price_changed` branch **is** the enforcement mechanism.

---

# QUOTE LIFECYCLE

Covered under QUOTE MODEL above — **stateless recommended**, no expiry/status machinery needed for a first implementation, since staleness degrades gracefully into the already-handled `price_changed` failure path rather than into a silent inconsistency.

---

# PRICE CHANGE BEFORE PAYMENT

*(Phase 7.)*

| Approach | Evaluation |
|---|---|
| Quote locks price | Not recommended as a first step — requires persistence (a lock needs somewhere to live), the exact complexity QUOTE MODEL recommends deferring. |
| Quote expires | Meaningful only if quotes are persisted; moot under the stateless recommendation. |
| Server recalculates (at `create_order` time) | **This is what already happens, unmodified, today.** Recommended — no new code. |
| Payment rejected outright | Too aggressive — a quote-to-payment window of a few seconds shouldn't routinely fail; reserve rejection for the rarer case where the *order* attempt itself mismatches. |
| Order creation revalidates | **Same as "server recalculates" — this is the existing `price_changed` mechanism.** Recommended. |

**Recommendation**: do nothing new here — the existing `create_order` revalidation, unmodified, is the correct and sufficient answer to this scenario.

---

# PRICE CHANGE AFTER PAYMENT

*(Phase 8 — the critical scenario: customer pays X, `create_order` computes Y, X ≠ Y.)*

**Designed invariant**: **the system must never create an order whose total doesn't match what `create_order` itself independently verified — full stop, no exception.** Concretely: if `price_changed=true` fires after a successful charge, **no order is created**, exactly as `create_order` already behaves for the cash-flow case. The difference from the cash flow is that here, money has already changed hands with no order to show for it — this is **the same G-5-adjacent class of problem** already identified (a successful external action with an unconfirmed/unlinked local state), and this audit's position is the same as Task 3.6's own position on G-5: **recovery (refund-or-retry) is a separate, explicitly out-of-scope concern for this task**, not something to solve here by weakening the price-match requirement. The safe invariant is preserved by *refusing* to paper over a mismatch, not by relaxing `create_order`'s check to "accept whatever was charged."

---

# COUPONS

*(Phase 9.)*

- **Current protection**: `create_order`'s coupon lookup already uses `SELECT ... FOR UPDATE` (re-confirmed this session, line 242 of the current file) — this row-locks the coupon for the duration of the transaction, serializing concurrent redemptions of the *same* coupon row and preventing a usage-limit race **at order-creation time**.
- **Can a stateless quote safely "lock" coupon validity, discount amount, or usage?** **No, and it shouldn't try.** A quote is a preview; it deliberately does **not** take the `FOR UPDATE` lock (that would hold a lock open for an unbounded, client-controlled duration — a real availability/performance risk). The lock, and therefore the real protection, correctly stays exactly where it already is: inside `create_order`'s single, short transaction.
- **Two customers racing for the last use of a coupon**: already handled today, by the existing `FOR UPDATE` + `usage_count >= usage_limit` check — **whichever `create_order` call reaches the lock first wins; the second sees the updated `usage_count` and is correctly rejected.** A quote for either customer might optimistically show the discount as available (since quoting doesn't lock), but the **final** `create_order` call is where the race is actually and already resolved correctly.
- **Is a coupon "reservation" system required?** **No — not for correctness.** It would only improve the *UX* of the losing customer (telling them earlier that the coupon is contested, rather than at final order-creation time) — a UX refinement, not a safety requirement, and explicitly not implemented here.

---

# DELIVERY FEES

*(Phase 10.)*

Re-confirmed this session directly from the current `create_order` body: delivery fee depends **only** on `branch_id` (via `branches.delivery_fee`, with a `restaurants.delivery_fee` fallback) — a flat amount. It does **not** depend on zone, address, distance, order value, time of day, or the customer. **All required inputs (the branch row) are already available server-side, before payment, with no missing input.** A quote engine needs nothing beyond what `create_order` already reads for this specific calculation.

---

# CART INTEGRITY

*(Phase 11 — how does the server know quote Q corresponds to the exact cart being paid for?)*

| Option | Evaluation |
|---|---|
| Deterministic cart hash | Would let the server verify "this is the same cart" cheaply, but doesn't replace re-verification — a hash matching doesn't mean *prices* haven't changed since. |
| Quote ID (persisted) | Only meaningful under a persistent-quote model (Phase 6) — deferred along with that decision. |
| Server-side cart | Would require a new session/cart table — not evidenced as necessary (see QUOTE MODEL). |
| Signed quote | Cryptographically binds a quote's *numbers* to a token, preventing a client from altering the returned total in transit — but under this audit's recommended architecture, **the quoted total is never trusted at order-creation time anyway** (it's always re-verified), so a forged/altered quote number would simply be caught by `create_order`'s existing mismatch check, the same as a stale one. Signing adds tamper-*evidence* but not tamper-*consequence* protection, since there's no consequence to prevent beyond what's already prevented. |
| Persistent quote | Covered above. |

**Recommendation**: **none of these are required for correctness, for the same underlying reason as everywhere else in this audit — `create_order`'s final re-verification is what actually matters, and it doesn't need to know or trust anything about how the quoted number was produced or transmitted.** The *cart* itself (which items/coupon) is what genuinely needs to flow correctly from quote to `create_order`'s `p_items`/`p_coupon_code` — and that's simply normal request-parameter passing, not a new integrity mechanism.

---

# PAYMENT-FIRST COMPATIBILITY

*(Phase 12 — mapping Quote → Payment Transaction → Moyasar → Success → `create_order`, without modifying `create_order`'s existing contract beyond what's already discussed.)*

```
1. Checkout service calls quote_order(restaurant_id, branch_id, type, items, coupon_code)
   → returns {subtotal, tax, delivery_fee, total}  [stateless, no row written]
2. Checkout service calls paymentService.startCharge({restaurantId, amount: total, currency: 'SAR', ...})
   → creates payment_transactions row, calls Moyasar, persists provider_ref/status
3. On success: checkout service calls create_order(..., p_client_total: total, p_payment_transaction_id: transactionId)
   → create_order independently recomputes; if it matches (expected, near-certain), order is created,
     linked via p_payment_transaction_id exactly as Task 3.5 already implemented and verified.
   → if it doesn't match: price_changed=true, no order — the already-discussed recovery scenario.
```

`p_payment_transaction_id` flows in **exactly as Task 3.5 already built and live-verified it** — this audit changes nothing about that parameter or its validation. The quote's numbers flow in only as `p_client_total`, in the same role that field already plays today for the cash-payment flow — **no new parameter or contract change to `create_order` is required by the quote mechanism itself** (only Option D, if chosen over C, requires a *different*, `p_dry_run`-only signature change, for the *quoting* call, not for the real order-creation call).

---

# ORDER CREATION

*(Phase 13 — should `create_order` recalculate independently, accept a quote ID, accept quoted totals, use a shared function, or something else?)*

**Recommended: (A) Recalculate independently — unchanged from today.** Evaluated against the alternatives:
- **(B) Accept `quote_id` and verify**: only possible under a persistent-quote model (Phase 6), which this audit does not recommend as a first step.
- **(C) Accept quoted totals directly** (trust them): **rejected outright** — this is functionally identical to trusting a client-supplied amount (a quote total transmitted back to the server is just as much "client-supplied" as any other request parameter, regardless of where the number originally came from), and directly reintroduces the exact risk Task 3.6A stopped to avoid.
- **(D) Use a shared pricing function**: this is *how* the recalculation happens (Option A or D from Phase 4), not a *replacement* for recalculating — fully compatible with, not an alternative to, "recalculate independently."
- **(E) Another mechanism**: none identified with evidence supporting it over the above.

**This preserves `create_order`'s existing server-side authority completely and by design — the whole architecture in this audit is built around *not* touching that authority, only adding a fast, non-authoritative preview in front of it.**

---

# SECURITY THREATS

*(Phase 14 — all eleven scenarios.)*

| # | Threat | Current protection | Gap | Recommended control |
|---|---|---|---|---|
| 1 | Client changes amount | `create_order` never reads a client-supplied price | None | N/A — already fully protected |
| 2 | Client changes quantity | Validated range (1–99); price computed per-unit server-side regardless of quantity claimed | None | N/A |
| 3 | Client changes product price | Impossible — price is never read from the client | None | N/A |
| 4 | Client changes coupon | Only the *code* is client-supplied; terms are looked up live | None | N/A |
| 5 | Client changes delivery fee | Never read from the client at all | None | N/A |
| 6 | Client changes restaurant | `branch.restaurant_id` cross-checked against `p_restaurant_id`; both existence-checked | None | N/A |
| 7 | Client reuses a quote | Under the stateless model, a "quote" is just a number — reusing it changes nothing, since `create_order` re-verifies every time regardless of reuse | None, **given the stateless model specifically** | If a persistent-quote model is ever adopted later, reuse-prevention (single-use, status-tracked) would become a genuine new requirement at that time |
| 8 | Client uses an expired quote | Same as #7 — statelessness means "expiry" is just "how stale the number is," and staleness only ever degrades to a safe `price_changed` rejection, never a silent accept | None under the stateless model | N/A |
| 9 | Client uses another customer's quote | Same reasoning — a bare number has no owner to steal under the stateless model; the only thing tied to identity is the restaurant/branch/item/coupon *selectors*, which are re-validated independently every time | None under the stateless model | N/A |
| 10 | Client replays a payment | This is `payment_transactions.idempotency_key`'s job — **already DB-enforced** (Task 3.6F, `uq_paytx_idempotency_key`, live on Production) | None | N/A — already closed |
| 11 | Client pays a quote for a different cart than they submit to `create_order` | `p_payment_transaction_id` links the order to a *specific* payment amount/restaurant (Task 3.5's existing tenant-isolation check); if the customer submits different `p_items`/`p_coupon_code` at order time than what was actually quoted/paid for, `create_order`'s own recomputation from the *submitted* items would very likely mismatch the *paid* amount, triggering `price_changed=true` — the same safety net catches this too | Low-probability edge case exists where a substituted cart *coincidentally* totals the same amount as the original — this would not be caught by amount-matching alone | **This is the one genuine, real gap this audit found.** A future implementation should consider whether the checkout service should also pass the *quoted item list* through to `create_order` for a stricter, non-amount-based comparison, or accept this narrow residual risk as low-severity (a coincidental-total item substitution, not an amount manipulation) |

---

# RECOMMENDED ARCHITECTURE

*(Phase 15 — one architecture, fully explained.)*

**Primary recommendation: Option D — `create_order` dry-run mode — as the pricing engine, combined with a stateless `quote_order`-equivalent entry point (which, under Option D, is simply "call `create_order` with `p_dry_run=true`").**

- **Avoids duplicated pricing logic**: completely — there is no second copy of the logic anywhere; the dry-run path is a single early-return inside the same function.
- **Preserves `create_order` correctness**: by construction — the non-dry-run path is untouched line-for-line; only one new early-exit branch is added.
- **How payment amount is obtained**: the checkout service calls `create_order(..., p_dry_run=true)`, reads back `total`, charges Moyasar for exactly that amount.
- **How quote integrity is guaranteed**: it isn't specially guaranteed, and doesn't need to be — the real, final `create_order(..., p_dry_run=false, p_client_total=total, p_payment_transaction_id=...)` call re-verifies from scratch, exactly as it already does today.
- **How expiry works**: there is no expiry, because there is no persisted quote to expire — staleness degrades directly into the already-safe `price_changed` rejection path.
- **How order/payment stay consistent**: enforced by `create_order`'s existing mismatch check, unmodified — see PRICE CONSISTENCY above.
- **How coupons are handled**: exactly as today — the `FOR UPDATE` lock and usage-limit check only ever run inside the real (non-dry-run) `create_order` call, which is correct, since that's the only call that actually needs to serialize against concurrent redemptions.
- **How delivery fee is handled**: exactly as today — a flat, branch-level lookup, already fully available server-side.
- **How retries work**: `payment_transactions.idempotency_key` (Task 3.6F, DB-enforced) and `orders.idempotency_key` (already DB-enforced) independently protect the payment-attempt and order-creation layers respectively — a retried checkout naturally reuses the same two mechanisms already proven live.

**Secondary/long-term option, explicitly not chosen as primary**: **Option A (full extraction into a shared function)** — architecturally "cleaner" in isolation, but requires a larger, higher-review-burden refactor of a live, payment-adjacent, production-proven function for a benefit (avoiding a slightly awkward dry-run input contract) that this audit judges as lower-priority than minimizing the size of the change to `create_order` itself. **Recommend revisiting Option A only if Option D's input-contract awkwardness (the quote caller must supply order-shaped fields like phone/type that are conceptually irrelevant to a price-only ask) proves to be a real, recurring problem in practice.**

---

# IMPLEMENTATION BREAKDOWN

*(Phase 16 — derived from the recommended architecture, not the prompt's example names.)*

### 3.6A-1a — `create_order` dry-run parameter
- **Objective**: add `p_dry_run boolean DEFAULT false` to `create_order`; when `true`, return the computed totals via the existing early-return pattern (mirroring the existing `price_changed` early-return already in the function) and skip the `INSERT`/coupon-`usage_count` update entirely.
- **Files**: a new `sql/` migration, following the exact `DROP FUNCTION` + `CREATE OR REPLACE` cutover pattern already proven safe in Task 3.5 (same signature-change discipline).
- **DB changes**: yes — one function signature change (new overload count discipline, per the established playbook).
- **Tests**: extend `orderJourneyGuards.test.js`-style static checks; new behavioral tests once a live/staging environment is used (per this session's established pattern — no local Postgres available).
- **Dependencies**: none beyond what already exists.
- **Acceptance criteria**: `create_order(..., p_dry_run=true)` returns correct totals for a known cart/coupon combination, creates zero rows, and does **not** increment coupon `usage_count`; the non-dry-run path is provably byte-identical in behavior to before this change.
- **Risks**: same signature-change risk class already handled successfully for Task 3.5 — mitigated by following the identical cutover discipline (explicit `DROP` before `CREATE`, guard-clause pre-flight checks).

### 3.6A-1b — Checkout Service (the original 3.6A scope, now unblocked)
- **Objective**: implement the Payment-First Checkout Service from the original 3.6A task, now with a real amount source (`create_order(..., p_dry_run=true)`).
- **Files**: new hook/service, no existing file modified beyond 3.6A-1a's migration.
- **DB changes**: none beyond 3.6A-1a.
- **Dependencies**: 3.6A-1a.
- **Tests**: the full test list already specified in the original Task 3.6A instructions (successful initiation, transaction creation, provider call, idempotency, amount/currency/tenant integrity, no-order-created, G-5-safe-failure).
- **Acceptance criteria**: matches the original 3.6A acceptance criteria, now achievable.
- **Risks**: the residual risk identified in SECURITY THREATS #11 (item-substitution with a coincidentally-matching total) should be explicitly decided on (accept as low-severity, or add item-list comparison) before this phase is considered complete.

### 3.6B onward — unchanged from the prior Scope Architecture Audit's breakdown (Order/Payment Integration, Payment→Order Sync, Checkout UX, G-5 reconciliation, idempotency hardening — already complete via 3.6F —, and G-6/Moyasar sandbox verification).

---

# MIGRATION IMPACT

*(Phase 17.)*

| Question | Answer |
|---|---|
| Schema migration required? | Yes — one: `create_order`'s new `p_dry_run` parameter (3.6A-1a). No new table. |
| Must `create_order` change? | Yes, minimally — one new parameter, one new early-return branch. Its core pricing logic is untouched. |
| New RPCs needed? | No — the "quote" capability is the *same* `create_order` RPC, called with `p_dry_run=true`. |
| New RLS policies needed? | No — `create_order` is already `SECURITY DEFINER`; dry-run mode doesn't touch any table needing new policy coverage. |
| Edge Functions involved? | No — this is purely a database-and-frontend concern; the payment webhook is untouched. |
| Frontend changes needed? | Yes — the new Checkout Service (3.6A-1b) and, eventually, checkout UX (3.6D) — not part of this audit. |

**Nothing in this section was executed.**

---

# TEST STRATEGY

*(Phase 18 — defined, not written.)*

- Price calculation parity: dry-run output vs. a real (non-dry-run) call with identical inputs must be numerically identical.
- Coupon calculation: percent/fixed/max-cap/min-order-amount, exercised through dry-run, matching existing `create_order`/`pricing.test.js` coverage patterns.
- Delivery fee: dine-in/takeaway (zero) vs. delivery (flat branch fee), through dry-run.
- Tax/rounding: VAT backing-out at each of the existing rounding points, unchanged.
- Quote "expiry": N/A under the stateless model — no test needed.
- Cart mismatch: dry-run with stale/invalid product IDs → same rejection behavior as the real path today.
- Amount tampering: attempting to pass a fabricated total into `p_client_total` at the *real* `create_order` call → must still trigger `price_changed` if it doesn't match the server's own recomputation, proving the dry-run number was never itself trusted.
- Quote replay: calling dry-run repeatedly with identical inputs → same total every time, zero side effects (no coupon usage increment, no rows).
- Payment amount mismatch / order amount mismatch: the Phase 8 scenario — payment succeeds, then `create_order`'s real call mismatches → confirm no order is created and the failure is reported cleanly (not silently swallowed).
- Concurrent coupon usage: two simulated concurrent *real* `create_order` calls for the last coupon use → exactly one succeeds (already covered by existing `FOR UPDATE` semantics; a regression test specifically covering the dry-run path *not* participating in this lock would confirm dry-run calls don't hold or need it).
- Concurrent payment attempt / idempotency: reuses the already-verified `uq_paytx_idempotency_key` (Task 3.6F) and `orders.idempotency_key` mechanisms — no new idempotency logic to test, only that the Checkout Service correctly supplies these existing keys.

---

# BLOCKERS

None internal to this architecture — the recommended design (Option D) requires no capability that doesn't already exist in this codebase. The only blockers remain the ones already tracked and explicitly out of this audit's scope: **G-6 (real Moyasar authentication verification)** and **Moyasar sandbox access**, neither of which this pricing/quote design depends on to be *built and synthetically verified* (only to be verified against *real* Moyasar traffic, eventually).

# RISKS

- The `create_order` signature change (3.6A-1a) touches a live, payment-adjacent, production function — carries the same class of risk already successfully managed for Task 3.5, mitigated the same way (staging-then-production verification discipline, explicit guard clauses).
- SECURITY THREATS #11 (item-substitution with a coincidentally-matching total) is a real, if narrow, residual gap that should be explicitly accepted or closed before 3.6A-1b is considered complete, not silently ignored.
- Choosing Option D over Option A trades a cleaner long-term architecture for a smaller, lower-risk immediate change — this is a legitimate engineering trade-off, but it should be a *conscious* choice, not a default, which is why it's called out explicitly here rather than folded silently into the recommendation.

# ACCEPTANCE CRITERIA

For this architecture to be considered correctly implemented (once actually built, in a future task):

- `create_order(..., p_dry_run=true)` never creates a row, never increments coupon `usage_count`, and returns totals numerically identical to what the same inputs would produce via the real path.
- The real (non-dry-run) `create_order` call remains behaviorally unchanged for every existing caller that doesn't pass `p_dry_run` at all (backward compatibility, the same discipline already applied to every prior parameter addition in this codebase's history).
- A Checkout Service built on top of this can obtain a trustworthy amount, charge Moyasar, and create a correctly-linked order, with the `price_changed` safety net demonstrably still functioning for both the pre-existing cash flow and the new payment flow.

---

# GIT STATUS

```
$ git status --short
(same 5 modified files carried over from earlier tasks — nothing new)
$ git diff --stat
5 files changed, 187 insertions(+), 7 deletions(-)   (identical to every prior task this session)
```

**No commit, no push, no merge, no migration created, no deployment, no database change, no Moyasar configuration.** This entire task was `Read`/`Bash` (grep) inspection only.

---

# REPORT FILE

`reports/TASK_3_6A_1_SERVER_SIDE_PRICING_QUOTE_ARCHITECTURE_AUDIT.md`

*(Note: an earlier, less complete draft of this same analysis was written to `reports/TASK_3_6A_1_PRICING_QUOTE_ARCHITECTURE_AUDIT.md` in response to a truncated version of this same request that arrived first in this session. That file was not deleted, but this report — matching your complete, untruncated specification — supersedes it as the authoritative version, and reaches a materially refined recommendation: the earlier draft favored full extraction (Option A) as essential; this complete analysis, having worked through Phases 5–14, concludes `create_order`'s own existing re-verification is the real safety net, making Option D a stronger primary recommendation.)*

# DOWNLOAD COPY

`/sdcard/Download/TASK_3_6A_1_SERVER_SIDE_PRICING_QUOTE_ARCHITECTURE_AUDIT.md` (copied and verified after this report was written).

---

## FINAL VERDICT

**PRICING_ARCHITECTURE_READY_WITH_DECISIONS**

A concrete, evidence-based architecture is recommended (Option D, `create_order` dry-run mode, stateless quote, no persistence) with full reasoning for every one of the 18 phases requested. It is not unconditionally `READY` because two decisions genuinely require your input before implementation: (1) Option D vs. Option A — a real engineering trade-off, not a foregone conclusion, and (2) SECURITY THREATS #11's narrow residual gap (coincidental-total item substitution) — accept as low-severity or close it. Neither decision blocks understanding the architecture; both should be made consciously before implementation begins.

---

*Report generated 2026-08-26. Architecture analysis only — no code written, no schema modified, no migration created, no deployment, no Moyasar configuration, no commit, no push.*
