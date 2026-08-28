# Task 3.6A-1 — Server-Side Pricing / Payment Quote Architecture Audit

**Read-only. No code, schema, or configuration was changed. No migration created. Nothing deployed or committed.**

---

# EXECUTIVE SUMMARY

`create_order`'s pricing logic was traced statement-by-statement (not summarized loosely, per instruction), the client-side cart/checkout code was re-read in full, and every dependency `create_order` needs before it can compute a total was classified by origin (server/client/DB/auth/external). **Conclusion: every price-affecting input `create_order` uses is already server-side, database-resident data — `restaurants`/`branches`/`products`/`coupons` rows, looked up live by ID. The only client-supplied inputs that affect the total are `items` (which product IDs/quantities/option selections were chosen) and `p_coupon_code` (which coupon to apply) — never a price itself.** This means the pricing computation *can* be extracted into a shared function without changing its business meaning, because it never actually depended on anything the client controls the value of, only on *which* items/coupon the client is asking about.

Four architectural options were evaluated. **Recommended: Option A+B combined — extract the existing pricing computation into a shared SQL function, then expose it through a new, minimal `quote_order` RPC that calls the same shared function `create_order` would call.** This eliminates duplication (the actual risk in extracting pricing logic at all), requires no schema change, and produces a total that is *provably* identical to what `create_order` would compute for the same inputs, because both would literally run the same code. **Not implemented in this task** — this is an architecture recommendation only, pending your decision.

---

# PHASE 1 — CURRENT PRICING LOGIC

Traced directly from `sql/order_payment_reference.sql` (the current live `create_order` body, re-read this session — not summarized from memory).

| Element | Exact logic |
|---|---|
| **Product price lookup** | `SELECT p.id, p.restaurant_id, p.branch_id, ..., p.price, p.options, p.is_available FROM public.products p WHERE p.id = v_product_id` — one live `SELECT` per cart line item, every time `create_order` runs. **Never trusts any client-supplied price.** |
| **Quantity handling** | `v_qty := coalesce((v_item->>'quantity')::integer, (v_item->>'qty')::integer, 0)` — read from the client's item list, validated `1 ≤ qty ≤ 99`, but the *price per unit* is never client-supplied — only quantity (a multiplier) is. |
| **Product availability** | `if not found or v_product.restaurant_id <> p_restaurant_id or v_product.branch_id <> p_branch_id or not v_product.is_available then raise exception 'product is unavailable for this branch'` — live-checked every call; a product deactivated after being cached in a client's cart is caught here. |
| **Option pricing** | For each selected option, the *group/choice combination* is validated against the product's *current* `options` JSON (not the client's memory of it), and its price is read from that same live JSON: `v_options_price := v_options_price + coalesce((v_choice->>'price')::numeric, 0)`. Required option groups are enforced (`raise exception 'required product option is missing'` if a mandatory group has no valid selection). |
| **Subtotal** | `v_item_price := coalesce(v_product.price, 0) + v_options_price` per line, accumulated as `v_subtotal_gross := v_subtotal_gross + (v_item_price * v_qty)` across all items — 100% server-derived. |
| **Coupon lookup** | `SELECT c.* FROM public.coupons c WHERE c.restaurant_id = p_restaurant_id AND upper(c.code) = upper(trim(p_coupon_code)) AND c.is_active = true AND (c.expires_at IS NULL OR c.expires_at >= now()) AND (c.branch_id IS NULL OR c.branch_id = p_branch_id) FOR UPDATE` — live lookup by the client-supplied *code string* only; every other coupon attribute (value, type, limits) comes from the database row, `FOR UPDATE`-locked to prevent a race on `usage_count`. |
| **Coupon validation** | Minimum order amount (`v_subtotal_gross < coalesce(v_coupon.min_order_amount, 0)`), usage limit (`usage_count >= usage_limit`), discount type must be `percent` or `fixed` — all raise exceptions if violated; invalid/expired/unknown codes raise `'invalid or expired coupon'`. |
| **Discount calculation** | `percent`: `round(v_subtotal_gross * v_coupon.discount_value / 100, 2)`; `fixed`: `greatest(0, v_coupon.discount_value)`; capped by `max_discount_amount` if set, then capped again at the subtotal itself (`least(v_discount, v_subtotal_gross)` — a discount can never exceed the order value). |
| **Tax** | VAT is backed out of the tax-inclusive gross, matching `lib/pricing.js`'s documented formula exactly: `v_net := round(v_discounted_gross / 1.15, 2); v_tax := round(v_discounted_gross - v_net, 2)`. |
| **Delivery fee** | `v_delivery_fee := case when p_type = 'delivery' then greatest(0, coalesce(v_branch.delivery_fee, 0)) else 0 end` — a **flat fee read from `branches.delivery_fee`** (with a `restaurants.delivery_fee` fallback via `v_restaurant.restaurant_delivery_fee`, resolved earlier). **No distance/zone/external delivery-pricing service is involved anywhere** — confirmed, this is the entire delivery-fee logic. |
| **Total** | `v_total := round(v_discounted_gross + v_delivery_fee, 2)`. |
| **Currency** | Not parameterized at all — implicitly SAR throughout (matches `MoyasarAdapter.createCharge`'s hardcoded `currency: 'SAR'`, confirmed consistent). |
| **Rounding** | `round(..., 2)` (2 decimal places) applied at each derived-value step (discount, net, tax, total) — consistent, no floating-point drift accumulation across steps beyond standard `numeric` rounding. |
| **Min/max constraints** | Item count: `1 ≤ jsonb_array_length(p_items) ≤ 100`. Quantity per line: `1 ≤ qty ≤ 99`. No explicit minimum *order value* constraint outside of a coupon's own `min_order_amount` (which only gates coupon eligibility, not order creation itself). |
| **Restaurant/branch relationship** | `branches.restaurant_id` must equal `p_restaurant_id`; both must be `is_active`; restaurant must not be `platform_suspended`; branch must not be `is_paused`. All server-side, live-checked. |
| **Client cross-check (not authoritative)** | `p_client_total` — if supplied and it doesn't match the server-computed `v_total` (`abs(v_client_total - v_total) > 0.01`), the function returns the server's own numbers with `price_changed = true` **and creates no order row** — this is a *rejection-and-report* mechanism, not a source of truth. |

**Nothing in this list is client-controlled in value — only client-controlled in *selection* (which product IDs, which quantities, which option choices, which coupon code, which order type).** This is the central fact the rest of this audit depends on.

---

# PHASE 2 — CLIENT CART

Re-read in full this session: `useCart.js`, `useCheckout.js`, `lib/pricing.js`.

| Question | Answer, with evidence |
|---|---|
| What data exists client-side? | `cart` (array of `{cartKey, id, name, price, basePrice, qty, note, selectedOptions}` — `price`/`basePrice` are **snapshots taken at `addToCart` time**, from whatever `product.price` the menu page had loaded at that moment — not re-verified against the live database until `create_order` runs), persisted to `localStorage`; `idempotencyKey` (a `crypto.randomUUID()`, generated once per non-empty cart, persisted to `localStorage`, invalidated on empty cart). |
| What does the client send to `create_order`? | `p_restaurant_id`, `p_branch_id` (from already-loaded restaurant/branch context — **not user-editable**), `p_table_number`/`p_delivery_address` (user input, but only affects delivery *logistics*, not price beyond the flat delivery fee lookup), `p_customer_name`/`p_customer_phone`, `p_type`, `p_items` (product ID + quantity + option selections — **the actual selections, not prices**), `p_notes`, `p_coupon_code` (the code string only), `p_client_total` (a display/cross-check value, explicitly non-authoritative per Phase 1), `p_idempotency_key`. |
| Which fields can be manipulated? | Technically, a malicious client could send *any* string as `p_items`' embedded `price`-adjacent fields — but `create_order` **never reads a price from `p_items`** (confirmed in Phase 1 — only `product_id`/`quantity`/`options` selectors are read from the item JSON; `v_item_price` is computed entirely from the live `products`/option-JSON lookup, never from anything in `p_items` itself). So even a fully adversarial client cannot inject a price — it can only choose *which* real, current products/options/coupon to reference. |
| Which fields are authoritative? | None, by design — `create_order`'s own live database reads are the sole authority; every client-supplied value is either a *selector* (which row to look up) or advisory (`p_client_total`, purely for UX). |
| How does coupon/discount info reach the server? | Only as `p_coupon_code` — a code string. `lib/pricing.js`'s `computeCouponDiscount()` is a **client-side, explicitly-non-authoritative replica** of the server's discount math (confirmed by its own doc comment: "لا يُوثَق بها كمصدر حقيقة" — "not trusted as a source of truth"), used solely so the UI can show a plausible total *before* the user confirms — the actual applied discount is always recomputed server-side from the live `coupons` row. |
| How is delivery fee determined? | Server-side only, from `branches.delivery_fee`/`restaurants.delivery_fee` (Phase 1) — the client never supplies a delivery fee value that `create_order` reads. |

**Staleness risk, confirmed structurally (not hypothetical)**: because cart `price`/`basePrice` are snapshotted at add-to-cart time and never refreshed, a customer's cart can silently reflect an *old* price if a restaurant edits a product's price (or availability) between add-to-cart and checkout. This is precisely what `create_order`'s `price_changed` mechanism exists to catch — and it is also precisely why any future quote mechanism **must** perform the same live re-lookup, not trust anything cached client-side, including the cart's own remembered prices.

---

# PHASE 3 — CREATE_ORDER DEPENDENCIES

Every input `create_order` needs before it can compute a total, classified by origin:

| Dependency | Classification | Detail |
|---|---|---|
| `p_restaurant_id`, `p_branch_id` | **CLIENT DATA** (selector only) | Identifies *which* restaurant/branch row to read — the row's actual data (active/suspended/paused/delivery_fee) is **SERVER DATA / DATABASE STATE**. |
| `restaurants` row (`is_active`, `platform_suspended`, `delivery_enabled`, `delivery_fee`) | **DATABASE STATE** | Live `SELECT`, not cached, not client-supplied. |
| `branches` row (`is_active`, `is_paused`, `delivery_enabled`, `delivery_fee`, `takeaway_enabled`) | **DATABASE STATE** | Same. |
| `p_type` (dine_in/takeaway/delivery) | **CLIENT DATA** | A genuine user choice — legitimately client-controlled, doesn't leak a price. |
| `p_table_number` | **CLIENT DATA** | Logistics only, no price impact. |
| `p_delivery_address` | **CLIENT DATA** | Logistics only — **not used to compute delivery fee** (the fee is a flat per-branch value, confirmed Phase 1 — no zone/distance lookup exists). |
| `p_customer_name`, `p_customer_phone` | **CLIENT DATA** | Identity/contact fields, validated (phone regex) but price-irrelevant. |
| `p_items` (product IDs, quantities, option selectors) | **CLIENT DATA** (selector only) | Chooses *which* products/options; the products/options themselves are **DATABASE STATE**. |
| `products` rows (`price`, `options`, `is_available`, `restaurant_id`, `branch_id`) | **DATABASE STATE** | Live `SELECT` per item, every call. |
| `p_coupon_code` | **CLIENT DATA** (selector only) | Chooses *which* coupon code to look up; the coupon's actual terms are **DATABASE STATE**. |
| `coupons` row (`discount_type`, `discount_value`, `min_order_amount`, `max_discount_amount`, `usage_limit`, `usage_count`, `is_active`, `expires_at`) | **DATABASE STATE** | Live `SELECT ... FOR UPDATE`. |
| `p_client_total` | **CLIENT DATA** (advisory only) | Never authoritative — confirmed Phase 1. |
| `p_idempotency_key` | **CLIENT DATA** | Not price-related — a dedup key. |
| `p_payment_transaction_id` (Task 3.5) | **CLIENT DATA** (selector) / cross-checked against **DATABASE STATE** (`payment_transactions.restaurant_id`) | Not price-related either — a linkage reference, validated for tenant match. |
| Auth/session context | **AUTH CONTEXT** | `create_order` is `SECURITY DEFINER` and does not itself call `auth.uid()` anywhere in its body (confirmed — re-scanned the function text) — it relies on the caller having already resolved `p_restaurant_id`/`p_branch_id` correctly (e.g., from the public menu route's own slug resolution), not on a authenticated-user identity check inside the pricing path itself. This matches the public/guest nature of ordering (ADR-9). |
| External services | **NONE** | Confirmed — no payment gateway, no distance/maps API, no tax-rate service, no external call of any kind occurs anywhere inside `create_order`'s pricing computation. VAT rate (`1.15`) is a hardcoded constant, matching `lib/pricing.js`'s `VAT_RATE = 0.15` exactly. |

**Determination: yes, the pricing calculation can be extracted without changing its business meaning.** Every dependency that affects the *computed value* (as opposed to merely *which row to look up*) is already `DATABASE STATE`, read live, inside the same transaction, regardless of which function (`create_order` or a hypothetical new one) issues the `SELECT`. Extracting this logic into a shared function changes *where* the code lives, not *what* it depends on.

---

# PHASE 4 — REUSABLE PRICING ENGINE

Four options evaluated, evidence-based:

### OPTION A — Shared PostgreSQL Function

Extract the pricing computation (item loop, coupon logic, VAT/delivery math — everything between "validate items" and "compute `v_total`" in Phase 1's trace) into a new, standalone `SECURITY DEFINER` (or `INVOKER`, since it performs no writes) function — e.g. conceptually `compute_order_pricing(p_restaurant_id, p_branch_id, p_type, p_items, p_coupon_code) RETURNS TABLE(subtotal, tax, delivery_fee, total, price_changes...)`. `create_order` would then call this function instead of inlining the logic, and any future quote mechanism would call the *same* function.

- **Pros**: single source of truth enforced at the database level (not just by convention); `create_order` and any quote mechanism are *structurally* guaranteed to agree, since they'd execute identical code; no duplication.
- **Cons**: requires a schema migration (new function) and a refactor of `create_order` itself — a real, non-trivial change to a payment-critical, already-live, production RPC. Higher review burden.
- **Risk**: refactoring `create_order` risks introducing a regression in logic that currently works and is extensively tested/live-verified (155 real production orders processed by the current inline version).

### OPTION B — `quote_order` RPC

A new, additive RPC, callable independently, that **duplicates or (better) calls Option A's shared function** to return a total without creating an order row.

- **If built on top of Option A** (calling the same shared function): no duplication risk, and this is genuinely the piece needed to unblock Payment-First — a way to get an authoritative total *before* calling `create_order`.
- **If built by duplicating the logic instead** (not calling a shared function): this recreates exactly the risk the context of this audit explicitly forbids — "duplicating pricing logic in Payment Service is forbidden," and the same reasoning applies equally to duplicating it in a second SQL function. **Not recommended as a standalone choice.**

### OPTION C — Reuse `create_order` itself via the existing `price_changed` mechanism (no new function)

As already noted in the Task 3.6A report: calling `create_order` with a deliberately-mismatching `p_client_total` (e.g., `-1`, guaranteed less than any real total) forces the `price_changed = true` branch, which returns the server-computed `subtotal`/`tax`/`delivery_fee`/`total` **without inserting a row**.

- **Pros**: zero new code, zero new migration, uses exactly the function already live and tested in production.
- **Cons**: this is **not what this function was designed for** — using it as a "quote" mechanism is a repurposing, not an intended API. It also still requires supplying a valid `p_customer_phone` (regex-validated) and other order-shaped fields that are conceptually irrelevant to "just tell me the price," which is a poor-fit input contract for a pricing-only caller. It also means Task 3.6A's own instruction ("Explicitly DO NOT call: `create_order` in this task") would need to be revisited for whatever task *does* implement this — worth flagging explicitly since it's a direct tension with that task's own boundary.
- **Risk**: low technical risk (proven code path), but architecturally muddies `create_order`'s single responsibility, and every future maintainer must understand this dual-purpose behavior.

### OPTION D — Trust the client amount at charge-initiation, re-validate strictly at `create_order` time (authorize-then-verify)

Initiate the Moyasar charge using the client-supplied total, but treat it as provisional; only actually *capture*/finalize once `create_order` confirms it matches.

- **Rejected outright, with reasoning recorded for completeness**: this still means a real charge (or at minimum a real charge *authorization*) is initiated against an unverified amount — the exact thing Task 3.6A's own instructions forbid ("The client MUST NOT be trusted for authoritative payment amount... Do not weaken the security model"). Even as an "authorize now, confirm later" pattern, it requires the payment gateway to support amount adjustment/partial-capture semantics that were never confirmed for Moyasar in this codebase (G-6, still open), and introduces a new failure mode (authorized-but-mismatched-amount) not present in any other option. **Not recommended.**

### Option E (implicitly forbidden, evaluated for completeness) — Duplicate the pricing logic directly inside `paymentService.js` (JavaScript)

- **Rejected outright**: explicitly forbidden by this task's own context ("duplicating pricing logic in Payment Service is forbidden"), and independently a bad idea on the evidence — `lib/pricing.js`'s own `computeCouponDiscount` already exists as exactly this kind of duplicate (client-side, JS), and its own doc comment already documents the consequence: it cannot be trusted, precisely because it's a second copy that can drift from the server's real logic (different rounding, different edge-case handling, different data freshness). Replicating the same pattern server-side (in `paymentService.js`, still JavaScript, still a second copy of the SQL logic) would carry the identical risk, just moved from client to a different server-side layer — no safety gained.

---

# COMPARISON MATRIX

| Option | New migration needed | Duplication risk | Refactors live `create_order` | Fit for a "just tell me the price" caller | Recommended |
|---|---|---|---|---|---|
| A. Shared SQL function | Yes | None (by construction) | **Yes** | N/A (infrastructure only) | Yes, as the foundation |
| B. `quote_order` RPC (on top of A) | Yes (small, additive) | None (calls A) | No | **Best fit** — clean, purpose-built input/output | **Yes — recommended combination: A+B** |
| B (without A, duplicated) | Yes | **High** | No | Good fit, bad implementation | No |
| C. Repurpose `create_order` | No | None | No | Poor fit (order-shaped inputs for a price-only ask) | No — viable fallback only if a migration truly cannot be authorized |
| D. Authorize-then-verify | No | N/A | No | N/A | No — reintroduces the exact risk this audit exists to avoid |
| E. Duplicate in `paymentService.js` | No | **High** | No | Good fit, bad implementation | No — explicitly forbidden already |

---

# RECOMMENDATION

**Option A + B, combined**: extract `create_order`'s pricing computation into a new, shared, read-only SQL function (Option A), then expose a new, minimal `quote_order` RPC (Option B) that calls that same shared function and returns `subtotal`/`tax`/`delivery_fee`/`total`/`price_changes`-equivalent output — without ever inserting into `orders`. `create_order` itself would be refactored to call the same shared function instead of its current inline logic, guaranteeing the two can never disagree, by construction rather than by convention or duplicated tests.

This is the only option that satisfies every constraint stated in this task's context simultaneously: no client-trusted amount, no duplicated pricing logic, no order created just to get a price, no possibility of payment/order total inconsistency (since both would compute from the same function), and no weakening of coupon/discount/tax/delivery logic (all of it is preserved exactly, just relocated).

**This is a recommendation for your decision, not an implementation.** Refactoring `create_order` — a live, production, payment-adjacent RPC with 155 real historical orders behind it — is a real, non-trivial change that deserves its own dedicated, carefully-reviewed task (with its own staging verification pass, mirroring how Task 3.5's migration was handled), not something to bundle into a "quick" pricing-extraction task. If a faster, lower-risk path is preferred in the interim, **Option C (repurposing `create_order`'s existing `price_changed` mechanism)** is the only other option in this audit that requires zero new migration — at the cost of an awkward input contract and a direct tension with Task 3.6A's own "do not call `create_order`" boundary, which would need to be explicitly re-authorized if chosen.

---

# GIT STATUS

```
$ git status --short
 M src/payments/adapters/moyasar.js       (unchanged — carried over from earlier tasks)
 M src/payments/types/index.js            (unchanged)
 M supabase/functions/payment-webhook/handler.js  (unchanged)
 M tests/unit/MoyasarAdapter.test.js      (unchanged)
 M tests/unit/paymentWebhook.test.js      (unchanged)
 (plus pre-existing untracked report/sql files from prior sessions)

$ git diff --stat
 5 files changed, 187 insertions(+), 7 deletions(-)   (identical to every prior task — nothing new)
```

**No commit, no push, no merge, no migration created, no deployment, no database change, no Moyasar configuration.** This entire task was `Read`/`Bash`(grep) inspection only.

---

# REPORT FILE

`reports/TASK_3_6A_1_PRICING_QUOTE_ARCHITECTURE_AUDIT.md`

# DOWNLOAD COPY

`/sdcard/Download/TASK_3_6A_1_PRICING_QUOTE_ARCHITECTURE_AUDIT.md` (copied and verified after this report was written).

---

## FINAL POSITION

The `AMOUNT_INTEGRITY_GAP` found in Task 3.6A has a clear, evidence-based resolution path: **every price-determining input `create_order` uses is already server-side data — nothing about the pricing logic actually depends on anything client-controlled beyond *selection*.** This means a safe quote mechanism is architecturally straightforward to build (Option A+B) — it was never blocked by the *nature* of the pricing logic, only by the fact that no standalone entry point to it exists yet. Building that entry point is a real, scoped task (refactor `create_order` to use a shared function + add `quote_order`), not a redesign of how pricing works. **Nothing was implemented here** — this is the architecture recommendation Task 3.6A's own report asked for, ready for your decision on whether and when to schedule it as its own implementation task.

---

*Report generated 2026-08-26. Architecture analysis only — no code written, no schema modified, no migration created, no deployment, no Moyasar configuration, no commit, no push.*
