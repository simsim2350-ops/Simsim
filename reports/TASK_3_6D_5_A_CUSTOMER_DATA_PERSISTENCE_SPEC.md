# Task 3.6D.5-A — Payment-First Customer Data Persistence Specification

**Specification only. No production code, schema, or deployment. No order-creation Edge Function created.**

---

# EXECUTIVE_SUMMARY

`TASK_3_6D_5` found that `createOrderFromSuccessfulPayment` requires `customerPhone` (always) and conditionally `tableNumber`/`deliveryAddress`/`customerName`/`notes` — none of which survive the full-page Moyasar redirect today. This task resolves *how* those fields should survive, comparing three options and auditing (not blindly accepting) the task's own suggested direction.

**Recommended: Option A** — persist a minimal, execution-fields-only record to `localStorage` **before** the Moyasar redirect, keyed by the payment idempotency key's own **value** (not a hash, not the slug/branch namespace the payment key itself uses) — refined from the task's suggested `payment-first:{idempotencyKey}:customer_data` into `simsim_payfirst_customer_{idempotencyKey}`, aligning with this codebase's own established `simsim_<purpose>_<scope>` naming convention (`simsim_cart_${slug}`, `simsim_idem_...`, `simsim_payidem_...`, `simsim_phone_...`) rather than introducing a new colon-delimited prefix style.

**Why keying by the key's *value*, not by slug/branch (unlike the payment key's own storage namespace)**: this creates a direct, unambiguous 1:1 binding between one specific payment attempt and one specific customer-data record, immune to the slug/branch-scoped collision behavior `usePaymentIdempotencyKey` already has by design (two tabs at the same slug/branch already *share* the same payment key today — a pre-existing, accepted property, not something this task changes). The one real cost of this choice — unlike slug/branch-scoped keys, which self-limit by natural overwrite, a per-attempt key accumulates a new `localStorage` entry per attempt — is addressed with an explicit TTL safety net and cleanup piggybacked onto the payment key's own already-existing `clearKey()` call sites, not a new, separate cleanup mechanism.

**No encryption is recommended** — the threat model doesn't support it (see THREAT_MODEL): any client-side encryption key would be exposed to the exact same JS execution context an XSS attacker would already control, so it defends against nothing real, while every other piece of comparably-sensitive data already stored in this codebase (`simsim_phone_${slug}`, cart contents) is unencrypted today. Encrypting only this one record would be inconsistent, not more secure.

**No new server persistence table is proposed or needed** — `localStorage`, scoped and bounded as specified here, is sufficient; the audit found no evidence it is insufficient.

---

# PROBLEM_STATEMENT

Restated precisely from `TASK_3_6D_5`: `createOrderFromSuccessfulPayment(input, {db})`'s exact signature (`checkoutOrchestration.js`, re-verified for this task) requires `input.customerPhone` and optionally accepts `input.tableNumber`/`input.deliveryAddress`/`input.customerName`/`input.notes` — fields deliberately excluded from `payment_transactions.metadata.checkout` for PII-minimization (`TASK-PAY-3.6A-1b.2`). A customer's browser loses all in-memory form state across the cross-origin Moyasar redirect. Without a persistence mechanism, no future order-creation trigger can ever supply these fields.

---

# EXISTING_ARCHITECTURE

- **`usePaymentIdempotencyKey(slug, branchId)`** (`TASK-PAY-3.6D.3`) — the direct precedent this spec follows most closely: generates once via `crypto.randomUUID()`, persists to `localStorage` under `simsim_payidem_${slug}_${branchId}`, read-or-generate on mount, explicit `clearKey()` on terminal outcomes (`PaymentFirstCheckoutPanel`'s own `SUCCEEDED`/`FAILED` handling, `TASK_3_6D_4`).
- **`useResumedPaymentIdempotencyKey(slug, branchId)`** (`TASK_3_6D_4`) — the read-only counterpart, structurally incapable of writing — the model this spec's own *read* side should mirror for the customer-data record.
- **`useCart.js`'s `CART_TTL_MS = 6 * 60 * 60 * 1000`** (`readStoredCart`, `cartHelpers.js`) — the only existing precedent in this codebase for a **lazy, read-time TTL check** (`Date.now() - savedAt >= TTL`), not a background sweep — directly reused as this spec's own expiry-checking pattern.
- **`PHONE_STORAGE_KEY = simsim_phone_${slug}`** (`useCheckout.js`, cash flow) — written **after** order success, and — a fact newly confirmed during this task, not previously noted — **read back by `useLoyalty.js`** as a phone-lookup fallback (not by `useCheckout.js` itself for form pre-fill). This is a **write-after, cross-feature** pattern; the payment-first record this spec designs is a **write-before, single-feature** pattern — structurally different enough that reusing the *same* key is not appropriate, though the *naming convention* is directly reused.
- **`create_order`'s own validation** (`sql/order_idempotency.sql`, re-confirmed unchanged): phone `^5[0-9]{8}$`, string fields truncated/bounded at 500 characters. This remains the **sole authoritative validator** for every field this spec's record carries — nothing here proposes duplicating or replacing it.
- **`createOrderFromSuccessfulPayment`'s existing idempotent-replay** (`reReadOrderByPaymentTransactionId`, `TASK-PAY-3.6B`) — already handles duplicate-invocation safety at the function level; this spec's design must not attempt to re-solve what this already solves.

---

# REQUIRED_FIELDS

Re-derived precisely from `createOrderFromSuccessfulPayment`'s own signature — this is the **complete, exact** list of fields this spec's record needs to carry, no more:

| Field | Required? | Notes |
|---|---|---|
| `customerPhone` | Always | The only unconditionally required field |
| `tableNumber` | Conditional | Only meaningful for `dine_in`; for QR-scoped `dine_in`, **already recoverable without persistence** via the approved `table=<qrToken>` return-URL parameter + the existing `resolve_table_qr` RPC (`TASK_3_6D_4_C_1`/`C_2`) — persisted only for **non-QR** `dine_in` |
| `deliveryAddress` | Conditional | Only meaningful for `delivery` |
| `customerName` | Optional | Never required by `create_order` itself |
| `notes` | Optional | Never required |

**Explicitly not needed in this record at all**, because `createOrderFromSuccessfulPayment` derives them from elsewhere: `restaurant_id`/`branch_id`/`items`/`coupon_code`/`type` (all from `payment_transactions.metadata.checkout`, the already-stored, server-authoritative snapshot — re-confirmed by re-reading the function's own `orderResult` construction), `paymentTransactionId` (resolved server-side by the future trigger from the idempotency key, never client-supplied), `providerRef`, `amount`. This materially **shrinks** the record versus a naive "just persist the whole checkout form" approach.

---

# OPTION_A_ANALYSIS — Persist before redirect, payment-attempt-scoped storage

| # | Criterion | Assessment |
|---|---|---|
| 1 | UX | Zero re-entry on the common path — the customer never sees a form again after checkout, matching the cash flow's own single-entry expectation. |
| 2 | Security | No new server exposure; data never leaves the browser except through `create_order`'s own already-validated path once the future trigger runs. Tampering risk bounded to the customer's own order (see THREAT_MODEL). |
| 3 | Privacy | Same PII already routinely handled by this codebase (phone, optionally address/name) — no new category of data introduced. |
| 4 | PII exposure | Bounded, minimal (REQUIRED_FIELDS above), TTL-limited, `localStorage`-scoped to this origin only — not sent anywhere until the future trigger's own server call. |
| 5 | XSS implications | No worse than every other PII already in `localStorage` today (cart contents, `simsim_phone_${slug}`) — see THREAT_MODEL for why this is an accepted, not a new, risk category. |
| 6 | Browser refresh | Fully safe — `localStorage` survives refresh; record is read-only from the callback's perspective, never regenerated. |
| 7 | Browser restart | Survives (unlike `sessionStorage` — see the explicit comparison in EXACT_STORAGE_KEY_STRATEGY). |
| 8 | Multiple tabs | Same slug/branch → same payment key (existing, unchanged `usePaymentIdempotencyKey` behavior) → same customer-data key → last-write-wins is consistent with, not worse than, the existing payment-key collision behavior; different slug/branch → fully independent, no collision. |
| 9 | Multiple simultaneous attempts | Structurally isolated by construction — see MULTI_TAB_BEHAVIOR. |
| 10 | Abandoned payment | Record persists until TTL expiry (safety net); no cleanup code ever runs since the browser never returns — inherent to any client-only design, not specific to Option A. |
| 11 | Payment failure | Record cleared alongside the payment key's own existing `clearKey()` call — one new line at an existing call site, not a new mechanism. |
| 12 | Payment success | Record read once by the future trigger, then cleared. |
| 13 | Order creation failure | Record kept (not yet cleared) to allow a safe, idempotent retry of the trigger itself — cleared only on eventual success, explicit abandonment, or TTL. |
| 14 | Storage cleanup | Piggybacks on existing `clearKey()` sites + lazy TTL check on read — no new background process. |
| 15 | QR flow | `tableNumber` **not** persisted at all — already recoverable via `table=`/`resolve_table_qr`. |
| 16 | Non-QR dine-in | `tableNumber` persisted. |
| 17 | Pickup (takeaway) | No conditional field needed beyond `customerPhone`. |
| 18 | Delivery | `deliveryAddress` persisted. |
| 19 | Multi-branch | Fully isolated per the payment key's own existing slug/branch scoping, inherited automatically. |
| 20 | Idempotency | The record itself carries no idempotency logic of its own — it's inert data, read once; all idempotency safety lives in `createOrderFromSuccessfulPayment`'s already-existing pre-check, unchanged. |
| 21 | Stale-data risk | Bounded by TTL; a record that outlives its usefulness is either overwritten (same slug/branch, new attempt scoped to a *different* key value — no collision) or eventually pruned on next read. |
| 22 | Compatibility with current architecture | **Highest** — directly extends an already-proven, already-approved pattern (`usePaymentIdempotencyKey`) rather than introducing a new one. |
| 23 | Testability | Straightforward — pure `localStorage` read/write, mirrors the exact test patterns already established for `usePaymentIdempotencyKey`/`useResumedPaymentIdempotencyKey` (`TASK_3_6D_3`/`3_6D_4`). |
| 24 | Migration complexity | Low — new hook(s) + one new call site at checkout-initiation, one new call site at each existing `clearKey()` invocation. |

## OPTION_B_ANALYSIS — Re-collect after return, before order creation

| # | Criterion | Assessment |
|---|---|---|
| 1 | UX | **Worse** — every successful payment gains a mandatory second form, even though the customer already provided this information once, moments earlier. |
| 2 | Security | Marginally simpler (nothing persisted client-side across the redirect) but not meaningfully more secure — the re-collection form itself is still client-supplied, untrusted input either way, subject to the exact same server-side validation Option A already relies on. |
| 3–5 | Privacy/PII/XSS | No PII persists across the redirect at all — the *only* option with zero client-side storage of these fields during the gap. This is a genuine, real advantage specific to Option B. |
| 6–7 | Refresh/restart | Trivially fine — nothing to lose, since nothing was ever stored. |
| 8–9 | Multi-tab/multiple attempts | No collision risk of any kind, for the same reason. |
| 10 | Abandoned payment | No wasted persisted data ever accumulates. |
| 11–13 | Failure/success/order-failure | Re-collection form only ever appears on `SUCCEEDED` — simpler state surface than A in this narrow sense. |
| 14 | Storage cleanup | None needed — nothing was stored. |
| 15–18 | QR/dine-in/pickup/delivery | Same conditional-field logic as A, just collected at a different, later moment. |
| 19 | Multi-branch | No collision risk, trivially. |
| 20 | Idempotency | Same as A — relies on `createOrderFromSuccessfulPayment`'s existing safety, unaffected by *when* the fields were collected. |
| 21 | Stale-data risk | None — data is always fresh, collected at the moment it's used. |
| 22 | Compatibility | Introduces a **new interaction pattern** (a post-payment form) not otherwise present anywhere in this codebase's checkout flow. |
| 23 | Testability | New form component, new validation surface, new test coverage needed beyond what A requires. |
| 24 | Migration complexity | Comparable to A in raw size, but adds a genuinely new UX surface rather than extending an existing one. |
| **Verdict** | Real privacy advantage, real UX cost. Not recommended as the primary path, but see Option C for where this genuinely earns its place. |

## OPTION_C_ANALYSIS — Hybrid

Persist only what's safe and low-friction to persist (`customerPhone`, `tableNumber` for non-QR dine-in, `customerName`, `notes`); re-collect only `deliveryAddress` specifically, on the reasoning that a delivery address is the single most sensitive, longest-lived, most "feels wrong to silently persist across a payment redirect" field among the set.

| Criterion | Assessment |
|---|---|
| UX | Slightly worse than pure A (a re-collection step exists, but only for delivery orders, and only conditionally) — better than pure B (most orders — dine-in, pickup — see zero re-entry). |
| Security/Privacy/PII | Marginal improvement over A specifically for delivery addresses; no improvement for phone (still persisted either way, and phone is already precedented as persisted elsewhere in this exact codebase via `PHONE_STORAGE_KEY`). |
| Everything else | Materially the same analysis as A, with the added complexity of **two different data-recovery code paths** (persisted-and-read vs. re-collected-and-validated) instead of one. |
| **Verdict** | The added implementation complexity (two paths instead of one) is not clearly justified by the marginal privacy gain, given phone number — arguably comparably sensitive — is already accepted as persisted in this exact codebase's existing, live `PHONE_STORAGE_KEY` pattern. Flagged as a legitimate, available refinement (see OWNER_DECISIONS_REQUIRED) rather than dismissed outright, but not the default recommendation. |

---

# THREAT_MODEL

- **Primary realistic threat**: an XSS vulnerability on the `simsim.*` origin, or malware/physical access to the same authenticated browser profile. In **either** case, the attacker already has full JS execution or file-system access to the browser's storage — a client-side encryption key stored or derivable in that same JS context provides **no defense**, since the attacker can simply read whatever the legitimate code would use to decrypt. This is why the task's own instruction ("do not attempt to solve PII security with client-side encryption unless the threat model demonstrates real benefit") is correct here: it does not.
- **Storage tampering cannot escalate to cross-customer access.** The record supplies *only* execution-only fields (phone/table/address/name/notes) to the future trigger — never tenant identity, cart contents, pricing, or the `paymentTransactionId` itself (server-resolved independently, from the idempotency key, which the record's *storage key name* mirrors but whose *value* the record's *contents* never repeat). A customer editing their own record can at worst cause their **own** order to be created with an incorrect phone number they themselves typed into their own browser's storage — never another customer's payment, order, or data. This directly satisfies the task's explicit "must not allow storage tampering to authorize another customer's payment/order" requirement.
- **The `payment_callback` URL value remains non-authoritative**, unchanged by this spec — nothing here proposes deriving the storage lookup from it; the lookup is always by the *locally-resolved* idempotency key value (mirroring `useResumedPaymentIdempotencyKey`'s own existing, unchanged pattern for the payment key itself).
- **Server-side validation remains the only real trust boundary.** `create_order`'s existing phone/string validation, `createOrderFromSuccessfulPayment`'s existing snapshot/fingerprint/amount checks, and the future trigger's own required server-side resolution of `paymentTransactionId` from the idempotency key (never accepting a client-supplied transaction ID) are **all unchanged by, and fully sufficient for, this spec** — this record is explicitly, deliberately **untrusted browser input**, exactly as the task requires.

---

# PRIVACY_ANALYSIS

The record's PII footprint (phone, optionally name/address/notes) is a strict subset of what this application already stores client-side elsewhere (the cart itself can contain a delivery address in the cash flow's own form state momentarily; `simsim_phone_${slug}` already persists a phone number indefinitely, cross-session, today). This spec does not expand the *category* of PII this codebase handles client-side — only adds one more, TTL-bounded, purpose-scoped, single-read instance of data this application already accepts storing.

---

# RECOMMENDED_OPTION

**Option A.** Zero UX regression on the dominant path (dine-in/pickup, and even delivery — see OWNER_DECISIONS_REQUIRED for the one open refinement question), lowest implementation complexity, highest architectural consistency with the already-approved, already-tested `usePaymentIdempotencyKey` pattern it directly extends, and no meaningful security/privacy shortfall once the threat model is honestly assessed (THREAT_MODEL above).

---

# EXACT_STORAGE_SCHEMA

```json
{
  "version": 1,
  "createdAt": "2026-08-27T12:00:00.000Z",
  "expiresAt": "2026-08-27T14:00:00.000Z",
  "customerPhone": "512345678",
  "customerName": "محمد",
  "tableNumber": "12",
  "deliveryAddress": "حي النخيل، شارع...",
  "notes": "بدون بصل"
}
```

| Field | Type | Required in record | Rule |
|---|---|---|---|
| `version` | integer | Always | `1`. Lets any future reader safely discard/ignore records from an incompatible future schema rather than misinterpret them. |
| `createdAt` | ISO 8601 string | Always | Set once, at write time. |
| `expiresAt` | ISO 8601 string | Always | `createdAt` + TTL (OWNER_DECISIONS_REQUIRED item 2 for the exact duration) — checked lazily on read, mirroring `readStoredCart`'s existing pattern; never a background timer. |
| `customerPhone` | string | Always | Present verbatim as typed; `create_order`'s own regex remains the authority — this record does no validation of its own beyond what the checkout form already does today. |
| `customerName` | string | Optional | Omitted (not `null`, not `""`) when not provided. |
| `tableNumber` | string | Conditional | Present **only** for non-QR `dine_in`. Never present for QR-scoped orders (redundant, recoverable server-side). |
| `deliveryAddress` | string | Conditional | Present **only** for `delivery`. |
| `notes` | string | Optional | Omitted when not provided. |

**Deliberately absent, and why**: `orderType` (implicitly encoded by which conditional fields are present — no need to duplicate), `slug`/`branchId` (metadata only, not needed for the trigger's own logic since `createOrderFromSuccessfulPayment` derives tenant/branch from the server-side snapshot — optional to add purely for human debugging visibility, never authoritative), `restaurant_id`/`table_qr_token`/`paymentTransactionId`/`providerRef`/any payment status or amount field (all explicitly forbidden by this task's own SECURITY REQUIREMENTS, and all already recoverable server-side without client involvement).

**Maximum size**: negligible in absolute terms (a few short strings), but each string field is capped at 500 characters on write — matching `create_order`'s own existing truncation bound and this arc's own established payload-limit convention (`payment-first-checkout`'s `MAX_STRING_LEN`, `TASK_3_6D_E`) — for consistency, not because `localStorage`'s multi-megabyte quota is remotely at risk.

---

# EXACT_STORAGE_KEY_STRATEGY

**`simsim_payfirst_customer_${paymentIdempotencyKey}`** — refined from the task's suggested `payment-first:{idempotencyKey}:customer_data` to match this codebase's own established, consistently-used naming convention (`simsim_cart_${slug}`, `simsim_idem_${slug}_${branchId}`, `simsim_payidem_${slug}_${branchId}`, `simsim_phone_${slug}`) rather than introducing a new colon-delimited style with no precedent anywhere else in this repository.

- **Keyed by the idempotency key's raw *value*, not hashed, and not by a slug/branch namespace.** Audited, not assumed: hashing provides no confidentiality benefit, since the same key value is *already* stored in plaintext elsewhere in `localStorage` (`simsim_payidem_${slug}_${branchId}`'s own value) — an attacker who can read one can read the other regardless. Keying by slug/branch (matching the payment key's own storage *namespace*, as opposed to its *value*) was considered and rejected: it would work, but keying by the actual per-attempt value creates a strictly *tighter*, structurally-guaranteed 1:1 binding between one attempt and its own data, immune to any future divergence between the two records' collision behavior.
- **`localStorage`, not `sessionStorage`.** Must survive a full cross-origin redirect and, per this task's own explicit question, a browser restart — `sessionStorage` does not reliably guarantee either across all real-world redirect/in-app-browser contexts, and using it would create an inconsistent pairing with the payment key itself (already `localStorage`-based, already restart-durable) — a payment key that resumes correctly paired with customer-data that vanished on restart would be a broken, confusing combination.
- **No separate schema/version table** — the `version` field inside each record itself is sufficient for this scale of data.

---

# LIFECYCLE_STATE_MACHINE

```
checkout starts (customer submits the payment-first checkout form)
  → client-side pre-validation only (phone shape, required-field-per-order-type presence) — cheap,
    non-authoritative, exactly mirroring the existing cash-flow form's own pre-checks; create_order
    remains the real authority, unchanged
  → paymentIdempotencyKey resolved (usePaymentIdempotencyKey — EXISTING, UNCHANGED by this spec)
  → [NEW] customer-data record written to simsim_payfirst_customer_{key} — same logical moment as
    the key's own resolution, guaranteeing the two are always written as a consistent pair
  → startCheckout (EXISTING, UNCHANGED) → redirect to Moyasar
        │
        ▼
  [gap — customer on Moyasar's page; nothing in this app runs]
        │
        ▼
  Moyasar redirects back → PaymentFirstCallbackLanding resolves status (EXISTING, UNCHANGED)
        │
        ├─ SUCCEEDED → [FUTURE, 3.6D.6] trigger reads the record by the same key, calls the new
        │              Edge Function with the execution fields → createOrderFromSuccessfulPayment
        │              runs → on success: clear BOTH the payment key and this record together
        │              → on order-creation failure (already-coded branches): KEEP the record
        │                (safe, idempotent retry remains possible) — cleared only on eventual
        │                success, explicit customer-initiated abandonment, or TTL
        │
        ├─ FAILED    → clear BOTH records together, at the SAME existing clearKey() call site
        │              (TASK_3_6D_4's PaymentFirstCheckoutPanel) — one new line, not a new mechanism
        │
        ├─ PENDING / RETRYABLE_ERROR → KEEP both records (matches the existing policy for the
        │              payment key itself — a future resume/retry needs both)
        │
        └─ UNKNOWN   → record may still exist locally (harmless orphan) — pruned only via the TTL
                        safety net on next read, since no code path will ever look it up successfully
                        again by a key the server has no matching row for

  Other terminal paths:
    user abandons before ever reaching Moyasar → record persists until TTL expiry (no code ever
      runs again in that browser session to clean it up — inherent to any client-only design)
    TTL expiry (read-time, lazy check) → treated as absent; if reached while a genuinely-succeeded
      payment is still trying to trigger order creation, the future flow must show an honest
      "payment succeeded, but we no longer have your order details — contact support with
      reference [idempotency key]" state, never a silent failure or false success
    cart/order context changes in the same browser after the record was written → no effect
      whatsoever; both the payment snapshot (server-side, immutable once startCharge commits) and
      this record (client-side, write-once) are frozen the moment they're created
```

---

# TTL_CLEANUP

**Lazy, read-time expiry check** (`Date.now() > new Date(record.expiresAt).getTime()`), mirroring `readStoredCart`'s exact existing pattern — never a background sweep/timer. **Primary** cleanup is event-driven (piggybacked onto the payment key's own existing `clearKey()` call sites for `SUCCEEDED`/`FAILED`, plus the future trigger's own success/final-failure paths); TTL is a **safety net** for the cases nothing else can catch (genuine abandonment, browser crash, etc.), not the primary mechanism — exact duration is an explicit open tuning question, not decided by this audit (see OWNER_DECISIONS_REQUIRED item 2), with a reasoned starting recommendation of **2 hours** (shorter than the cart's own 6-hour precedent, since a payment-attempt round trip is expected to resolve far faster than a browsing session, but still generous enough to cover realistic delays — a customer needing to fetch a different card, a temporary connectivity loss, etc.).

---

# MULTI_TAB_BEHAVIOR

- **Same customer, same restaurant, same branch**: already share one payment idempotency key today (`usePaymentIdempotencyKey`'s existing, unchanged read-or-generate behavior) — the customer-data record, keyed by that same shared value, is therefore also shared. Last-write-wins between the two tabs' record writes is consistent with, not worse than, the pre-existing collision behavior of the payment key itself, and — critically — **cannot** cause the trigger to use one customer's data for a *different* customer's payment, since both tabs belong to the same customer's own browser.
- **Same customer, same restaurant, different branches**: fully independent — different `branchId` → different payment key → different customer-data key. No collision of any kind.
- **Different carts, same slug/branch, same tab-pair scenario above**: whichever tab's `startCharge` call wins the server-side idempotency race (unrelated to this spec, an existing, unchanged property) determines which cart's snapshot is real; the customer-data record may, in the rare case of adversarial-timing between the two tabs' *local* writes and their *server* race, end up reflecting whichever tab wrote last locally rather than whichever tab won server-side — a narrow, low-severity, same-customer-only correctness edge case (documented honestly, not hidden), not a security issue, and not one this spec proposes solving with a distributed-lock mechanism disproportionate to its real-world likelihood.
- **This design structurally satisfies the task's explicit "must not allow one payment attempt to consume another attempt's customer data"** requirement: the storage key name itself *is* the unique attempt identifier (the idempotency key's own value, already unguessable, already unique per attempt) — there is no shared, ambiguous lookup path through which two *different* attempts (let alone two different customers) could ever resolve to the same record unintentionally.

---

# MULTI_BRANCH_BEHAVIOR

Fully inherited from the payment key's own existing, unchanged branch-scoping — no new logic needed (see MULTI_TAB_BEHAVIOR above).

---

# QR_BEHAVIOR

`tableNumber` is **never** included in this record for a QR-scoped checkout — it remains fully recoverable, with zero new persistence, via the approved return-URL contract's `table=<qrToken>` parameter (`TASK_3_6D_4_C_1`/`C_2`, already live) plus the already-existing `resolve_table_qr` RPC `PublicMenu.jsx` already calls. This is the one field this spec explicitly does **not** need to solve.

---

# ORDER_TYPE_BEHAVIOR

| Order type | Fields persisted beyond `customerPhone` |
|---|---|
| `dine_in`, QR-scoped | None (table recovered via QR, per above) |
| `dine_in`, non-QR | `tableNumber` |
| `takeaway` | None |
| `delivery` | `deliveryAddress` |

`customerName`/`notes` persisted whenever provided, regardless of order type — both optional, never required by `create_order`.

---

# SERVER_VALIDATION_REQUIREMENTS

Unchanged, restated as a binding constraint for the future trigger, not a new requirement invented here: `create_order`'s own phone regex and string-length bounds remain the sole authority; the future Edge Function must **never** trust this record's contents as pre-validated, must pass them through to `createOrderFromSuccessfulPayment` exactly as the cash flow's own equivalent fields are already passed to `create_order` today (validated server-side, not client-side), and must independently resolve `paymentTransactionId` server-side from the idempotency key rather than accept one from the browser.

---

# BROWSER_TRUST_BOUNDARIES

This entire record is **untrusted browser input**, full stop — explicitly required by this task, and consistent with every other client-supplied field in this entire payment-first arc (cart contents, `clientTotal`, etc., all already treated this way). Nothing about this record's design changes that boundary; it only adds one more untrusted-input surface the server must (and already does, via `create_order`) validate.

---

# XSS_CONSIDERATIONS

Covered in THREAT_MODEL — no new exposure class is introduced; the record is exactly as exposed to a same-origin XSS attacker as every other piece of `localStorage` data this application already stores, and encrypting it would not change that (the decryption key would be equally exposed).

---

# TEST_STRATEGY (for the future implementation task — not built here)

Mirroring `usePaymentIdempotencyKey.test.js`/`useResumedPaymentIdempotencyKey.test.js`'s exact established conventions: a write-side hook's tests (generates the record correctly per order type, respects the 500-char cap, sets `expiresAt` correctly), a read-side hook's tests (reads and returns the record; treats an expired record as absent, mirroring `readStoredCart`'s own tested TTL behavior; never writes); and an integration test proving that whatever future trigger consumes this record never receives `paymentTransactionId`/`providerRef`/any payment-status field from it (a static/behavioral test in the same spirit as this arc's repeated `PFCX-33`/`PFCX-34`-style non-exposure checks).

---

# MIGRATION_CONSIDERATIONS

No existing data to migrate — this is a wholly new, additive `localStorage` key with no predecessor. The `version` field exists specifically so that if this schema ever needs to change later, old records can be safely ignored rather than misread.

---

# ROLLBACK_STRATEGY

A future implementation would be a small, additive pair of hooks plus a few new call sites at existing `clearKey()` locations — reverting is a direct file/diff revert with no schema or server-side dependency, consistent with every other client-only piece of this arc.

---

# OWNER_DECISIONS_REQUIRED

1. **Approve Option A** (persist-before-redirect, attempt-scoped `localStorage`) as the target architecture, or direct Option C's hybrid (re-collect delivery address specifically) instead — the one genuinely close call in this analysis.
2. **Approve the recommended 2-hour TTL**, or specify a different duration — an explicit tuning choice, not a correctness question.
3. **Confirm the exact storage key name** (`simsim_payfirst_customer_${idempotencyKey}`) or propose an alternative consistent with this codebase's naming conventions.
4. **Confirm no objection** to `customerName`/`notes` being persisted whenever provided (both optional, low-sensitivity, but worth an explicit nod given the task's overall PII-conscious framing).

---

# EXPLICIT_NON_GOALS

- Implementing this spec — no hook, no call site, no test was created.
- Modifying `createOrderFromSuccessfulPayment`, `PaymentFirstCallbackLanding`, `PublicMenu.jsx`, or any Edge Function.
- Designing the order-creation-trigger Edge Function itself (that remains a separate, `TASK_3_6D_4_A`-style spec task, per `TASK_3_6D_5`'s own recommendation).
- Deciding the exact "confirming your order" UI copy/state machine details beyond what `TASK_3_6D_5` already specified.
- Any schema, database, or deployment change.

---

# RISKS

- **If the future trigger's own request/response contract doesn't independently resolve `paymentTransactionId` server-side**, and instead trusted a client-supplied value, the careful boundary this spec establishes (record supplies only execution fields, never identity) would be undermined by a *different* task's mistake — flagged here explicitly so the eventual trigger-spec task inherits this constraint deliberately, not by accident.
- **The multi-tab, different-carts, same-branch edge case** (MULTI_TAB_BEHAVIOR) remains a low-severity, honestly-documented residual risk — acceptable, but worth the future implementation task's own test coverage to confirm it degrades safely (wrong-but-harmless execution details) rather than in some worse, unanticipated way.
- **TTL tuning risk**: too short, and a customer who takes unusually long on Moyasar's page could return to find their execution data gone (falling into the honest "contact support" path unnecessarily often); too long, and orphaned records accumulate for longer than needed. 2 hours is a reasoned starting point, not a proven-optimal one.

---

# DEFERRED

- All implementation (hooks, call sites, tests).
- The order-creation-trigger Edge Function and its own spec cycle.
- `PaymentFirstCallbackLanding`'s new `CONFIRMING_ORDER` state (per `TASK_3_6D_5`).
- `3.6D.6`, `3.6D.7`, `3.6E`.

---

# IMPLEMENTATION_SEQUENCE (recommended, for future tasks)

1. Owner approves this spec (or an amended version) — `OWNER_DECISIONS_REQUIRED` above.
2. A small implementation task: the write-side hook (called at checkout-initiation, alongside `usePaymentIdempotencyKey`'s own resolution) and the read-side hook (mirroring `useResumedPaymentIdempotencyKey`), plus cleanup wiring at the existing `clearKey()` call sites — its own focused tests, its own regression run, no server changes.
3. Only then does the order-creation-trigger Edge Function's own spec task (`TASK_3_6D_5`'s recommendation) have real, concrete input data to design its request contract around.

---

# GIT_STATUS

No file was created or modified by this task beyond this report. `git status --short`/`git diff --stat` are byte-identical to the pre-task baseline (14 tracked files, 800 insertions(+), 25 deletions(-); no new untracked file except this report). No commit, no push, no merge.

# REGRESSION_BASELINE

**914/914 remains unchanged** — this task performed zero code or test changes.

---

# NEXT_STEP

Awaiting explicit owner approval on the `OWNER_DECISIONS_REQUIRED` list above before any implementation begins. Per instruction: **stopping here.** Not implementing anything, and not proceeding to `3.6D.6`, `3.6D.7`, or `3.6E`.

---

*Report generated 2026-08-27. Specification only — no code, no schema, no deployment, no Moyasar call, no commit, no push, no merge.*
