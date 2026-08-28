# Task 3.6A-1b.1 — Canonicalization + Cart Fingerprint

**IMPLEMENTED. Pure utility only — no wiring, no schema, no network.**

---

# EXECUTIVE SUMMARY

Implemented `src/payments/checkoutBinding.js`, a pure, synchronous-canonicalization + async-hashing utility producing a deterministic SHA-256 fingerprint of checkout/cart identity, per Option C of `reports/TASK_3_6A_1B_CART_INTEGRITY_QUOTE_BINDING_AUDIT.md`. The utility fingerprints exactly the five approved PAYMENT_INTEGRITY fields (`restaurant_id`, `branch_id`, `type`, `items`, `coupon_code`) and deliberately excludes price/customer-metadata fields. 46 new tests cover canonicalization rules, 14 malformed-input rejection cases, all 18 required equivalence/difference scenarios, and a 100-iteration determinism check. Full regression: **573/573 PASS** (527 baseline + 46 new). No wiring, snapshot builder, `paymentService`, `create_order`, schema, or Moyasar code was touched.

**Verdict: `TASK_3_6A_1B_1_COMPLETE`**

---

# ARCHITECTURE REFERENCE

Implements exactly Option C's fingerprint half from `reports/TASK_3_6A_1B_CART_INTEGRITY_QUOTE_BINDING_AUDIT.md` — the CANONICALIZATION and HASH_DESIGN sections specifically. The snapshot-builder half (3.6A-1b.2) is explicitly **not** implemented here, per the task's own scope boundary.

---

# CANONICALIZATION RULES

Implemented in `canonicalizeCheckout(input)`, a synchronous pure function:

| Field | Rule | Basis |
|---|---|---|
| `restaurant_id`, `branch_id`, `items[].product_id` | Must match `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` (case-insensitive), normalized to lowercase | Audit's UUID normalization rule |
| `type` | Must be exactly `dine_in`, `takeaway`, or `delivery` — **no case normalization, no fuzzy matching**; any other value throws | Audit: "do not silently normalize unknown values" |
| `items[].quantity` | Must be `typeof 'number'`, `Number.isInteger`, `Number.isFinite`, and within **1–99** (the exact range already enforced by `create_order`, not a new range) | Audit's quantity rule; range value from `sql/order_payment_reference.sql`'s own `v_qty < 1 or v_qty > 99` |
| `items[].options` | Each `{groupName, choiceName}` (both required non-empty strings); sorted by `(groupName, choiceName)`, joined as `` `${groupName}:${choiceName}` `` with `\|` — **the exact `useCart.js` `addToCart`/`updateCartItem` pattern**, reused verbatim, not reinvented | Audit: "follows the existing useCart.js canonicalization pattern" |
| `items[]` (array) | Non-empty, max 100 (mirrors `create_order`'s `jsonb_array_length` bound); each canonical tuple is `(product_id, quantity, optionsKey)`; **sorted** by product_id → quantity → optionsKey via an explicit comparator (field-by-field, no delimiter-based string concatenation, avoiding any collision ambiguity); **duplicate lines are never merged** | Audit: order-independence + "do not merge duplicate product lines" |
| `coupon_code` | `upper(trim(code))`; empty/whitespace-only or absent → `null` | Audit: "normalize exactly like create_order" — matches `nullif(upper(trim(p_coupon_code)), '')` byte for byte in intent |

`canonicalizeCheckout` throws a `TypeError` with a specific message for every malformed input — nothing is silently repaired.

---

# FINGERPRINT DESIGN

`computeCheckoutFingerprint(input)` (async):
1. Calls `canonicalizeCheckout(input)`.
2. Builds a **fixed, explicitly-ordered** plain object (`restaurant_id`, `branch_id`, `type`, `items`, `coupon_code`) — never relies on incidental JS object key-insertion order from elsewhere in the call chain.
3. `JSON.stringify` → UTF-8 bytes (`TextEncoder`) → `crypto.subtle.digest('SHA-256', bytes)` → lowercase hex string (64 chars).

**`crypto.subtle`** (Web Crypto API) was chosen over Node's `crypto.createHash`, matching the **existing** convention already used in this codebase's own `supabase/functions/payment-webhook/handler.js` (`verifyHmacSha256`, `crypto.subtle.importKey`/`.sign`/`.verify`) — same API surface, portable across browser/Deno/modern-Node, consistent with an existing pattern rather than introducing a new one.

**Only `PRICE`-and-`PII`-excluded fields are hashed** — `subtotal`/`tax`/`delivery_fee`/`total`/`currency`/`p_client_total`/`notes`/`table_number`/`delivery_address`/`customer_name`/`customer_phone` never enter the canonical object or the hash input, confirmed directly by EQUIV-14 through EQUIV-18 below.

---

# VALIDATION

Implemented and tested (14 categories, matching the task's "at minimum" list exactly, plus 2 extra edge variants):

`missing restaurant_id` · `missing branch_id` · `invalid UUID` · `missing type` · `invalid type` · `missing items` (+ empty-array variant) · `invalid product_id` · `invalid quantity` (0, and NaN/Infinity/null variant) · `quantity as string` · `quantity as decimal` · `malformed options` (non-array) · `missing groupName` · `missing choiceName` · `invalid coupon type` (non-string).

Every case throws `TypeError` — none are silently coerced or repaired.

---

# TEST_MATRIX

All 18 required equivalence/difference tests implemented in `tests/unit/checkoutBinding.test.js`, `describe('EQUIV: ...')`:

| # | Scenario | Expected | Result |
|---|---|---|---|
| 1 | Same cart | same fingerprint | PASS |
| 2 | `[A,B]` vs `[B,A]` | same | PASS |
| 3 | Option order changed | same | PASS |
| 4 | UUID case changed | same | PASS |
| 5 | Coupon case/whitespace | same | PASS |
| 6 | Different product | different | PASS |
| 7 | Different quantity | different | PASS |
| 8 | Different option | different | PASS |
| 9 | Different coupon (incl. vs. no coupon) | different | PASS |
| 10 | Different restaurant | different | PASS |
| 11 | Different branch | different | PASS |
| 12 | Different fulfillment type | different | PASS |
| 13 | Duplicate item lines | remain distinct (not merged); fingerprint differs from the pre-merged equivalent | PASS |
| 14 | Notes changed | **same** | PASS |
| 15 | Customer name changed | **same** | PASS |
| 16 | Delivery address changed | **same** | PASS |
| 17 | Client total changed | **same** | PASS |
| 18 | Server-calculated total changed | **same** | PASS |

Tests 14–18 directly demonstrate — by actually running extraneous fields through the function and observing an unchanged fingerprint — that the fingerprint represents cart/payment identity, not price or customer metadata, exactly as the task required them to prove.

---

# DETERMINISM

`DETERM-001`: the same canonical input (a multi-item, multi-option, coupon-bearing cart) run through `computeCheckoutFingerprint` **100 times**, `await Promise.all`, collected into a `Set` — **`Set` size is `1`** (all 100 outputs identical), and the fingerprint matches `^[0-9a-f]{64}$` (valid lowercase SHA-256 hex). No randomness, no timestamp, no generated ID, and no environment-dependent value is read anywhere in the module — confirmed both by this test and by direct code inspection (the module contains no `Date`, `Math.random`, `crypto.randomUUID`, or any global/env read of any kind).

---

# SECURITY

Static review, per the task's explicit checklist:

| Check | Result |
|---|---|
| Deterministic | Confirmed (DETERM-001) |
| Pure | Confirmed — no I/O, no side effects; `canonicalizeCheckout` is fully synchronous, `computeCheckoutFingerprint` is async only because `crypto.subtle.digest` returns a Promise, not because of any I/O |
| No secrets | Confirmed — no key, credential, or secret referenced anywhere in the file |
| No network | Confirmed — no `fetch`, no `XMLHttpRequest`, no adapter/provider import (also directly asserted by `PURITY-001`'s source-text check) |
| No database | Confirmed — no Supabase import, no `db`/`supabase` reference anywhere (also directly asserted by `PURITY-001`) |
| No client price trust | Confirmed — `subtotal`/`tax`/`delivery_fee`/`total`/`p_client_total` are not read by the module at all; even if present in `input`, they have zero effect on the output (EQUIV-17, EQUIV-18) |
| No PII | Confirmed — `customer_name`/`customer_phone`/`delivery_address`/`notes` are not read (EQUIV-14–16) |
| No HMAC secret | Confirmed — plain `SHA-256` only, no `importKey`/signing key of any kind, matching the audit's explicit "no keyed MAC required" conclusion |
| No Moyasar dependency | Confirmed — no adapter, no provider-specific code, no import from `src/payments/adapters/` |
| No schema changes | Confirmed — this task touched no `sql/` file and made no database call of any kind |

---

# FILES_CHANGED

| File | Status |
|---|---|
| `src/payments/checkoutBinding.js` | **NEW** — the canonicalization + fingerprint utility |
| `tests/unit/checkoutBinding.test.js` | **NEW** — 46 tests |
| `src/payments/index.js` | **MODIFIED** — one line added (`export * from './checkoutBinding'`), following the file's own existing barrel-export convention |
| `paymentService.js`, `create_order`, `payment_transactions` schema, webhook, Moyasar adapter | **NOT TOUCHED** — confirmed by `git diff --stat` below |

Before creating a new file, existing conventions were inspected (`src/payments/utils/index.js`, `src/payments/README.md`, `src/payments/index.js`'s barrel-export pattern, and the fact that all `payments`-related tests already live in `tests/unit/` rather than co-located beside `src/payments/`) — no equivalent canonicalization/hashing utility already existed (confirmed via repository-wide search for `sha256`/`createHash`/`subtle.digest`, which found only the unrelated webhook-HMAC code). A new focused module was the correct choice, matching the task's own suggested path.

---

# TEST_RESULTS

```
$ npx vitest run tests/unit/checkoutBinding.test.js
 Test Files  1 passed (1)
      Tests  46 passed (46)
```

---

# FULL_REGRESSION

```
$ npx vitest run
 Test Files  38 passed (38)
      Tests  573 passed (573)
   Duration  38.84s
```

**573/573 PASS** — the stated baseline (527) plus the 46 new tests, exactly, with zero failures and zero regressions.

---

# GIT_STATUS

```
$ git status --short
 M src/payments/adapters/moyasar.js
 M src/payments/index.js                          ← NEW change, this task (1 line)
 M src/payments/types/index.js
 M supabase/functions/payment-webhook/handler.js
 M tests/unit/MoyasarAdapter.test.js
 M tests/unit/paymentWebhook.test.js
?? src/payments/checkoutBinding.js                 ← NEW, this task
?? tests/unit/checkoutBinding.test.js               ← NEW, this task
?? reports/TASK_3_6A_1B_1_CANONICALIZATION_FINGERPRINT_IMPLEMENTATION_REPORT.md  ← this report
(plus the same set of pre-existing untracked report/sql files from prior tasks — unchanged)

$ git diff --stat
 src/payments/adapters/moyasar.js              | 20 +++++-
 src/payments/index.js                         |  1 +
 src/payments/types/index.js                   |  3 +
 supabase/functions/payment-webhook/handler.js | 19 ++++++
 tests/unit/MoyasarAdapter.test.js             | 57 ++++++++++++++--
 tests/unit/paymentWebhook.test.js             | 95 +++++++++++++++++++++++++++
 6 files changed, 188 insertions(+), 7 deletions(-)
```

The five files modified in earlier tasks are unchanged (identical diffs to every prior report this session); the only new diff line is `src/payments/index.js`'s single added export. **No commit, no push, no merge.**

---

# BLOCKERS

None.

# WARNINGS

None — no unrelated file was touched, no test was modified, no scope was exceeded.

---

# CLASSIFICATION

- **IMPLEMENTED**: `canonicalizeCheckout`, `computeCheckoutFingerprint`, all canonicalization rules, all 14 validation cases, `src/payments/index.js` export wiring.
- **VERIFIED**: all 46 new tests passing, full 573/573 regression, static security review.
- **NOT IMPLEMENTED** (out of this task's explicit scope): snapshot builder (3.6A-1b.2), any `paymentService`/`create_order`/webhook/frontend wiring, any schema change, any Moyasar call.
- **DEFERRED**: nothing — this task's full scope was completed.

---

# REPORT_FILE

`reports/TASK_3_6A_1B_1_CANONICALIZATION_FINGERPRINT_IMPLEMENTATION_REPORT.md`

# DOWNLOAD_COPY

`/sdcard/Download/TASK_3_6A_1B_1_CANONICALIZATION_FINGERPRINT_IMPLEMENTATION_REPORT.md` (copied and checksum-verified after this report was written).

# NEXT_STEP

Per the strict stop instruction: **no further work begins** — not 3.6A-1b.2, not 3.6A-2, not 3.6B through 3.6G — without separate, explicit instruction from you.

---

*Report generated 2026-08-26.*
