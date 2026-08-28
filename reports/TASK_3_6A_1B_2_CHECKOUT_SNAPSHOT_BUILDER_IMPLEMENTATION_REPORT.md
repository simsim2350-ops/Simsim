# Task 3.6A-1b.2 — Checkout Snapshot Builder

**IMPLEMENTED. Pure utility only — no wiring, no schema, no network.**

---

# EXECUTIVE SUMMARY

Implemented `buildCheckoutSnapshot`, extending `src/payments/checkoutBinding.js` from Task 3.6A-1b.1, per Option C of `reports/TASK_3_6A_1B_CART_INTEGRITY_QUOTE_BINDING_AUDIT.md`. It combines a validated checkout input with a validated `create_order(p_dry_run=true)` result into a `metadata.checkout`-shaped snapshot, reusing `canonicalizeCheckout`/`computeCheckoutFingerprint` verbatim (no duplicated normalization or hashing logic), copying `subtotal`/`tax`/`delivery_fee`/`total` from the dry-run result with zero arithmetic, excluding PII and free-text `notes` by default, and requiring both `currency` and `quotedAt` as explicit, validated caller-supplied parameters (no internal `Date.now()`, no hardcoded currency). 33 new tests cover all 25 required scenarios (several split into sub-cases). Full regression: **606/606 PASS** (573 baseline + 33 new). No wiring, `paymentService`, `create_order`, schema, or Moyasar code was touched.

**Verdict: `TASK_3_6A_1B_2_COMPLETE`**

---

# SNAPSHOT CONTRACT

Implemented exactly as specified:

```js
{
  restaurant_id, branch_id, type, items, coupon_code,   // CLIENT_INPUT_SNAPSHOT
  subtotal, tax, delivery_fee, total, currency,          // SERVER_COMPUTED
  fingerprint, quoted_at,                                 // SERVER_COMPUTED
}
```

---

# FIELD SOURCES

| Field | Source | Notes |
|---|---|---|
| `restaurant_id`, `branch_id`, `type`, `coupon_code` | `canonicalizeCheckout(checkoutInput)`'s own output — **the single existing normalization path, not re-derived** | Already lowercase UUIDs / exact-match `type` / `upper(trim())` coupon, per 3.6A-1b.1 |
| `items` | `checkoutInput.items`, re-projected (not re-canonicalized) into `{product_id, quantity, options}` — reconstruction-ready shape, **original array/option order preserved**, `product_id` lowercased for internal consistency | `canonicalizeCheckout`'s own `items` output uses collapsed `optionsKey` strings, unusable for feeding back into `create_order`; this builder derives a separate, reconstruction-oriented projection instead of reusing that shape verbatim |
| `subtotal`, `tax`, `delivery_fee`, `total` | `dryRunResult.{field}`, copied **verbatim, unmodified type included** | No arithmetic, no rounding, no type coercion of the stored value (see PRICE CONSISTENCY) |
| `fingerprint` | `computeCheckoutFingerprint(checkoutInput)` — **called directly, not reimplemented** | |
| `currency` | Explicit `currency` parameter, validated non-empty string | See CURRENCY |
| `quoted_at` | Explicit `quotedAt` parameter, validated ISO 8601 | See QUOTED_AT |

---

# FINGERPRINT

`buildCheckoutSnapshot` calls `computeCheckoutFingerprint(checkoutInput)` directly — zero duplicated hashing/canonicalization code. `SNAP-02` proves `snapshot.fingerprint === (await computeCheckoutFingerprint(checkoutInput))` exactly, for the same input, every time.

---

# PRICE CONSISTENCY

`assertServerNumeric` validates presence and numeric validity (accepting either a JS `number` or a numeric string — the real, observed `create_order`/PostgREST return shape; the codebase's own `useCheckout.js:87` already defensively wraps `Number(data.total)` rather than trusting it to already be a JS number, confirming this is not a hypothetical concern) **for validation only** — the value actually stored in the snapshot is `dryRunResult.<field>` itself, completely unchanged, including its original type. `SNAP-03`–`SNAP-06` confirm exact value equality; `SNAP-06b` confirms a numeric-string dry-run value is stored as that same string, not coerced to a JS number; `SNAP-07` deliberately passes internally-inconsistent numbers (`subtotal+tax+delivery_fee ≠ total`) and confirms the builder stores `total` exactly as given (999), **not** a recomputed 12 — direct proof the builder performs no arithmetic of any kind.

**Fingerprint/total separation, maintained exactly as specified**: the fingerprint never includes `subtotal`/`tax`/`delivery_fee`/`total`/`currency` (already true from 3.6A-1b.1, re-confirmed here since `buildCheckoutSnapshot` calls the same unmodified `computeCheckoutFingerprint`), and the price fields never influence or are influenced by the fingerprint computation — CART INTEGRITY and AMOUNT INTEGRITY remain two independent, separately-verifiable properties of the snapshot.

---

# PII POLICY

Exactly the approved default — no invention, no dedicated recovery table:

- `customer_name`, `customer_phone`, `delivery_address`, `table_number` are **never read** from `checkoutInput` by the builder — confirmed structurally (the function only ever destructures/reads the five named `CLIENT_INPUT_SNAPSHOT` fields) and behaviorally (`SNAP-18` sends all four in `checkoutInput` and asserts none of them, nor their values, appear anywhere in the resulting snapshot or its JSON serialization).
- **`notes` is also excluded**, resolved per the task's explicit instruction to inspect `create_order`'s actual requirements first: `create_order`'s own SQL treats `notes` as fully optional (`left(coalesce(v_item->>'notes', v_item->>'note', ''), 500)` — defaults silently to an empty string if absent), so it is **not necessary** for a future `create_order` reconstruction to succeed. Given it is unnecessary and is client-supplied free text (which could incidentally contain PII a customer typed in, e.g. a phone number or address inside a note), it is excluded from the snapshot's item shape — confirmed by `SNAP-18`'s second test, which sends a `notes` value and asserts it does not appear anywhere in the output.
- `p_client_total` is also confirmed absent from the snapshot (`SNAP-19`) — consistent with the audit's PAYMENT_INTEGRITY_FIELDS/ORDER_METADATA_FIELDS separation, reused here from 3.6A-1b.1 without modification.

---

# CURRENCY

**Not derivable from `create_order`'s dry-run result** — confirmed: its `RETURNS TABLE` contract (unchanged since Task 3.6A-1a) has no `currency` column. **Not hardcoded inside this module either** — `checkoutBinding.js` is explicitly provider/currency-agnostic (no Moyasar or SAR-specific assumption anywhere in 3.6A-1b.1's implementation).

**Resolution, not a `SNAPSHOT_CURRENCY_SOURCE_GAP`**: inspecting the existing payment architecture surfaced a direct, already-established precedent — `paymentService.startCharge` **already requires `currency` as an explicit input from its own caller**, with no internal default or derivation (`if (!input?.currency) throw new Error('startCharge: currency مطلوبة')`, `src/payments/services/paymentService.js:18`). This builder follows that exact same precedent: `currency` is a required, explicit parameter supplied by the future server-side orchestration layer (which is where any actual currency constant — today, always `'SAR'`, per the hardcoded literal in `MoyasarAdapter.createCharge` and `payment_transactions.currency`'s schema default — genuinely lives), not something derived internally or from the client. `SNAP-20` confirms both that a `currency` value smuggled into `checkoutInput`/`dryRunResult` is ignored (only the explicit parameter is used) and that a missing/empty/non-string `currency` parameter is rejected outright.

---

# QUOTED_AT

**Option A implemented, as instructed as the preference** — the builder is fully pure with respect to time: it never calls any time-producing API internally (confirmed by source-text inspection finding zero occurrences of any internal time-generation call, and by `PURITY-001`'s expanded assertion). `quotedAt` is a required parameter, validated to be a string that round-trips exactly through `new Date(x).toISOString() === x` — matching the exact ISO-8601-with-milliseconds format `paymentService.js` itself already produces via `new Date().toISOString()` for `updated_at`, rather than inventing a new timestamp convention. `SNAP-21`/`SNAP-22` confirm: explicit valid values are accepted and stored verbatim; a missing value, a non-ISO string, a date-only string (`'2026-08-26'`, valid as a `Date` but not an exact `toISOString()` round-trip), and a `Date` object itself (not a string) are all rejected.

---

# VALIDATION

All 25 required test scenarios implemented (`SNAP-01` through `SNAP-25`, several split into labeled sub-cases for clarity) — see TEST MATRIX. Malformed `checkoutInput` (missing/invalid `restaurant_id`/`branch_id`/`type`/`items`/`coupon_code`) is rejected by delegating directly to `canonicalizeCheckout` — `SNAP-17` explicitly asserts the builder's thrown message for an invalid coupon **is byte-identical** to `canonicalizeCheckout`'s own thrown message for the same input, proving no parallel/inconsistent validation path was introduced.

---

# IMMUTABILITY

`SNAP-23` proves, via deep-equality snapshots taken before and after the call, that neither `checkoutInput` nor `dryRunResult` (including nested arrays like `items[].options`) are mutated by `buildCheckoutSnapshot` — the function only ever reads its inputs and constructs entirely new objects/arrays (`.map()`, object literals) for its return value. A second test confirms the returned snapshot is a fully independent object: mutating it after the call (including pushing a new item) has no effect on the original `checkoutInput`.

---

# TEST_MATRIX

| # | Scenario | Result |
|---|---|---|
| 1 | Valid checkout + valid dry-run → valid snapshot | PASS |
| 2 | Snapshot fingerprint matches `computeCheckoutFingerprint(input)` | PASS |
| 3 | `subtotal` exactly equals `dry_run.subtotal` | PASS |
| 4 | `tax` exactly equals `dry_run.tax` | PASS |
| 5 | `delivery_fee` exactly equals `dry_run.delivery_fee` | PASS |
| 6 | `total` exactly equals `dry_run.total` (+ numeric-string passthrough sub-case) | PASS |
| 7 | Builder never recalculates totals (internally-inconsistent numbers stored as-is) | PASS |
| 8 | Missing `subtotal` → reject | PASS |
| 9 | Missing `tax` → reject | PASS |
| 10 | Missing `delivery_fee` → reject | PASS |
| 11 | Missing `total` → reject | PASS |
| 12 | Invalid numeric result (`'abc'`, `NaN`, `Infinity`) → reject | PASS |
| 13 | Missing `restaurant_id` → reject | PASS |
| 14 | Missing `branch_id` → reject | PASS |
| 15 | Missing `type` → reject | PASS |
| 16 | Missing `items` → reject | PASS |
| 17 | Invalid coupon input → reject, message identical to `canonicalizeCheckout`'s own | PASS |
| 18 | PII fields excluded (name/phone/address/table + notes) | PASS |
| 19 | `p_client_total` excluded | PASS |
| 20 | Currency cannot come from client input (+ missing/invalid `currency` rejected) | PASS |
| 21 | `quoted_at` explicitly supplied (+ missing → reject) | PASS |
| 22 | Invalid `quoted_at` (unparseable / `Date` object / non-round-tripping string) → reject | PASS |
| 23 | Input objects remain unchanged (+ returned snapshot independence) | PASS |
| 24 | Repeated identical input + identical `quoted_at` → identical snapshot | PASS |
| 25 | Same cart, different `quoted_at` → only `quoted_at` differs | PASS |

---

# TEST_RESULTS

```
$ npx vitest run tests/unit/checkoutBinding.test.js
 Test Files  1 passed (1)
      Tests  79 passed (79)
```
(46 from 3.6A-1b.1 + 33 new from this task.)

One issue found and fixed during this task, not a functional bug: an early version of a purity self-check test (`PURITY-001`, "no `Date.now()` in source") matched its own explanatory Arabic error-message/comment text, which happened to contain the literal substring `Date.now()` as prose, not as code. Reworded the two comments/messages to remove the incidental collision; re-ran and confirmed genuinely clean (zero `Date.now` occurrences of any kind in the file, code or comments).

---

# FULL_REGRESSION

```
$ npx vitest run
 Test Files  38 passed (38)
      Tests  606 passed (606)
   Duration  37.69s
```

**606/606 PASS** — 573 baseline (post-3.6A-1b.1) + 33 new, zero failures, zero regressions.

---

# SECURITY

| Check | Result |
|---|---|
| No price calculation | Confirmed — `SNAP-07` directly proves no arithmetic occurs |
| No client price trust | Confirmed — `subtotal`/`tax`/`delivery_fee`/`total` only ever come from the explicit `dryRunResult` parameter, never from `checkoutInput` |
| No PII by default | Confirmed — `SNAP-18` |
| No network | Confirmed — no `fetch`/`XMLHttpRequest`, reused from 3.6A-1b.1's existing purity check, still true |
| No database | Confirmed — no Supabase import anywhere in the file |
| No payment provider dependency | Confirmed — no Moyasar/adapter import; currency handled generically (see CURRENCY) |
| No schema changes | Confirmed — no `sql/` file touched, no database call made |
| No `create_order` changes | Confirmed |
| No `paymentService` changes | Confirmed |
| No webhook changes | Confirmed |
| No hidden timestamp inside the pure builder | Confirmed — `quotedAt` is a required, validated parameter; zero internal time-generation calls (verified both by code inspection and an automated source-text test) |
| No mutation of inputs | Confirmed — `SNAP-23` |

---

# FILES_CHANGED

| File | Status |
|---|---|
| `src/payments/checkoutBinding.js` | **MODIFIED** — `buildCheckoutSnapshot` added (extends the existing module, per the task's own preference; no new file created) |
| `tests/unit/checkoutBinding.test.js` | **MODIFIED** — 33 new tests appended |
| `src/payments/index.js` | **UNCHANGED** — the existing `export * from './checkoutBinding'` (added in 3.6A-1b.1) already re-exports the new function automatically; no redundant export added |
| `paymentService.js`, `create_order`, `payment_transactions` schema, webhook, Moyasar adapter | **NOT TOUCHED** |

---

# GIT_STATUS

```
$ git status --short
 M src/payments/adapters/moyasar.js
 M src/payments/index.js
 M src/payments/types/index.js
 M supabase/functions/payment-webhook/handler.js
 M tests/unit/MoyasarAdapter.test.js
 M tests/unit/paymentWebhook.test.js
?? src/payments/checkoutBinding.js        ← untracked (created in 3.6A-1b.1), modified further this task
?? tests/unit/checkoutBinding.test.js      ← untracked (created in 3.6A-1b.1), modified further this task
?? reports/TASK_3_6A_1B_2_CHECKOUT_SNAPSHOT_BUILDER_IMPLEMENTATION_REPORT.md  ← this report
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

The six previously-tracked files' diff is **byte-identical** to every prior report this session (188 insertions, 7 deletions) — none of them was touched by this task. `checkoutBinding.js`/`checkoutBinding.test.js` remain untracked (never committed), so `git diff --stat` doesn't list them (standard git behavior for untracked files); their growth this task is captured in TEST_RESULTS/TEST_MATRIX above instead. **No commit, no push, no merge.**

---

# CLASSIFICATION

- **IMPLEMENTED**: `buildCheckoutSnapshot`, all field-source rules, currency/quoted_at explicit-parameter design, all validation rules.
- **VERIFIED**: 33 new tests passing, full 606/606 regression, static security review.
- **NOT IMPLEMENTED** (explicitly out of scope): any `paymentService`/`create_order`/webhook/frontend wiring, any schema change, any Moyasar call, a dedicated PII/recovery table.
- **DEFERRED**: nothing within this task's scope — the PII-in-recovery-data policy question remains deferred to later reconciliation work, exactly as the architecture audit already stated, not newly deferred by this task.

---

# BLOCKERS

None.

# WARNINGS

None — no unrelated file was touched, no existing test was modified, no scope was exceeded. (One self-inflicted, immediately-fixed test-authoring issue is documented under TEST_RESULTS for full transparency, not hidden.)

---

# REPORT_FILE

`reports/TASK_3_6A_1B_2_CHECKOUT_SNAPSHOT_BUILDER_IMPLEMENTATION_REPORT.md`

# DOWNLOAD_COPY

`/sdcard/Download/TASK_3_6A_1B_2_CHECKOUT_SNAPSHOT_BUILDER_IMPLEMENTATION_REPORT.md` (copied and checksum-verified after this report was written).

# NEXT_STEP

Per the strict stop instruction: **no further work begins** — not 3.6A-2, not 3.6B through 3.6G, no `paymentService` wiring, no Moyasar call, no payment transaction creation, no `create_order`/webhook/database change — without separate, explicit instruction from you.

---

*Report generated 2026-08-26.*
