# Task 3.6A-1a.1 — create_order Idempotency Type Drift Audit

**READ-ONLY. No code, schema, or database was changed. No migration applied. Nothing deployed or committed.**

---

# EXECUTIVE SUMMARY

The `p_idempotency_key uuid` (Production) vs. `p_idempotency_key text` (Staging) drift is **real, confirmed live, and pre-dates this session's work** — it was already fully root-caused in `reports/STAGING_SCHEMA_PARITY_AUDIT_REPORT.md` before Task 3.5 began: Staging's `orders` table was independently bootstrapped with `idempotency_key text` and a **different uniqueness model** (`orders_restaurant_idempotency_key_uq`, per-restaurant composite) than Production's canonical, ADR-47-established `idempotency_key uuid` with a **global** partial unique index (`orders_idempotency_key_uidx`). Production is unambiguously the canonical design.

A deeper finding this audit surfaced: **the two idempotency identities already have different types from each other, even within Production itself** — `orders.idempotency_key` is `uuid`, but `payment_transactions.idempotency_key` is `text`, consistently on **both** environments. This is not an oversight; it's a direct consequence of how each is generated in application code (`crypto.randomUUID()` → bare UUID for orders; `newIdempotencyKey('pay')` → `"pay_<uuid>"`, a **non-UUID-formatted string that could never be stored in a uuid column**, for payments). Order and Payment idempotency are — and were always intended to be — independent identities with independently appropriate types. The Staging/Production drift is therefore a **single-column, Staging-only anomaly** in the Order-idempotency identity specifically, not a symptom of a deeper architectural inconsistency.

The **only real runtime caller** of `create_order`'s `p_idempotency_key`, `src/features/menu/hooks/useCheckout.js`, always supplies a value from `crypto.randomUUID()` — a genuine UUID-format string — via named-parameter RPC, regardless of which environment it targets. This single fact is what makes the drift low-risk in practice: the actual value sent never depends on or is affected by which column type receives it.

The dry-run migration (`sql/order_dry_run_pricing.sql`) is **completely orthogonal** to this drift: its `DROP FUNCTION` target was independently re-verified live against Production in this audit and matches Production's actual signature (`p_idempotency_key uuid`) exactly, byte for byte; it adds only a trailing boolean parameter and touches nothing related to idempotency-key typing.

**DECISION: `DRIFT_CAN_REMAIN_TEMPORARILY`.**
**PRODUCTION DRY-RUN DECISION: `SAFE_TO_APPLY_DRY_RUN_TO_PRODUCTION`.**

---

# LIVE SIGNATURES

Re-verified live in this audit — not assumed from any prior report:

| | Production (`gpwwnuuicywsvmmhxngs`) | Staging (`rgqsetckcigkgsyobyjg`) |
|---|---|---|
| `create_order` args | `p_restaurant_id uuid, p_branch_id uuid, p_table_number text, p_delivery_address text, p_customer_name text, p_customer_phone text, p_type text, p_items jsonb, p_notes text, p_coupon_code text, p_client_total numeric, p_idempotency_key uuid, p_payment_transaction_id uuid` | `p_restaurant_id uuid, p_branch_id uuid, p_table_number text, p_delivery_address text, p_customer_name text, p_customer_phone text, p_type text, p_items jsonb, p_notes text, p_coupon_code text, p_client_total numeric, p_idempotency_key text, p_payment_transaction_id uuid, p_dry_run boolean` |
| `create_order` return type | `TABLE(id uuid, order_number text, access_token text, subtotal numeric, tax numeric, delivery_fee numeric, total numeric, price_changed boolean, price_changes jsonb)` | identical |
| `create_order` overload count | **1** | **1** |
| `create_order_from_table_qr` | **Exists.** `p_qr_token uuid, p_items jsonb, p_customer_name text, p_customer_phone text, p_notes text, p_coupon_code text, p_client_total numeric, p_idempotency_key uuid` | **Does not exist** (confirmed — query returned zero rows) |

Note: Production still shows 13 args (no `p_dry_run`) because, per Task 3.6A-1a's explicit instruction, the dry-run migration has **not** been applied to Production yet — this is expected and confirms the prior report is still accurate, not stale.

---

# SOURCE HISTORY

| File | Tracked in git? | Establishes |
|---|---|---|
| `sql/order_idempotency.sql` (ADR-47, TASK-ORD-002) | **Yes, tracked** — the canonical, git-history-attested source | `orders.idempotency_key uuid`, `p_idempotency_key uuid DEFAULT NULL` on both `create_order` and `create_order_from_table_qr`. Explicitly documents (in its own header) that it was executed on Production (`gpwwnuuicywsvmmhxngs`) and warns about the overload-creation landmine this project has handled correctly ever since. **`uuid` is the intended, original, documented architecture.** |
| `sql/order_payment_reference.sql` | Untracked (this session's Task 3.5 output) | Carries `p_idempotency_key uuid` forward unchanged — consistent with the canonical design, targets Production. |
| `sql/staging/staging_order_payment_reference.sql` | Untracked (this session's Task 3.5 staging-variant output) | Carries Staging's **pre-existing** `p_idempotency_key text` forward unchanged — this file did not introduce the drift, it inherited and preserved it, because Staging's `orders.idempotency_key` column was already `text` before this file was ever written (independently confirmed in `reports/STAGING_SCHEMA_PARITY_AUDIT_REPORT.md`, produced before Task 3.5's execution). |
| `sql/order_dry_run_pricing.sql` | Untracked (Task 3.6A-1a output) | Carries Production's `uuid` forward unchanged. |
| `sql/staging/staging_order_dry_run_pricing.sql` | Untracked (Task 3.6A-1a output) | Carries Staging's `text` forward unchanged. |

**Is the difference documented?** Yes — explicitly, twice: once in `reports/STAGING_SCHEMA_PARITY_AUDIT_REPORT.md` (root-caused in detail, including the *why*: Staging's `orders` table was independently bootstrapped without the QR-ordering column set and with a different order-numbering mechanism entirely, consistent with Staging never having been a byte-for-byte clone of Production), and again in this task's own prior report (`TASK_3_6A_1A_CREATE_ORDER_DRY_RUN_IMPLEMENTATION_REPORT.md`, WARNINGS section).

**Do both versions have equivalent idempotency semantics?** Functionally yes (same-key ⇒ return existing order, not a new one) but not identically scoped: Production's uniqueness is **global** (`orders_idempotency_key_uidx`, partial unique on `idempotency_key` alone); Staging's is **per-restaurant** (`orders_restaurant_idempotency_key_uq`, composite unique on `(restaurant_id, idempotency_key)`). This scope difference pre-dates this task and was not introduced or altered by Task 3.5 or 3.6A-1a.

**No pre-existing file was modified in this audit** — this section is inspection only.

---

# CALLER AUDIT

Full-repository search for `create_order(`, `p_idempotency_key`, and `idempotency_key`:

| Caller | Classification | Value type sent | Source of the key | UUID guaranteed? |
|---|---|---|---|---|
| `src/features/menu/hooks/useCheckout.js` (`supabase.rpc('create_order', {...})` and `supabase.rpc('create_order_from_table_qr', {...})`) | **FRONTEND** | JS string | `idempotencyKey` prop, generated once per cart in `src/features/menu/hooks/useCart.js:73` via `crypto.randomUUID()` | **Yes, always** — this is the only real caller, and it never sends anything other than a genuine `crypto.randomUUID()` output, in either code path (direct `create_order` or QR-flow `create_order_from_table_qr`), regardless of which environment (Production or Staging) it targets. Named-parameter RPC (`{p_idempotency_key: idempotencyKey}`), not positional. |
| `src/lib/orderPaymentReferenceGuard.test.js` | **TEST** | N/A — static text assertion against `sql/order_payment_reference.sql`'s source text only | N/A | N/A — does not execute any RPC |
| `src/lib/orderJourneyGuards.test.js` | **TEST** | N/A — does not reference idempotency at all (covers order **status** state-machine transitions only, a separate guard) | N/A | N/A |
| `src/features/menu/orderErrors.js` / `.test.js` | **FRONTEND (support)** | N/A — maps `create_order`/`create_order_from_table_qr` **error codes** to display messages; never sends or reads an idempotency key value | N/A | N/A |
| `src/features/menu/hooks/useCoupon.js`, `src/lib/pricing.js` | **FRONTEND (comment reference only)** | N/A — comments noting their discount math mirrors `create_order`'s server logic (TASK-CHK-003); no RPC call, no idempotency reference | N/A | N/A |
| `tests/unit/paymentService.test.js`, `tests/unit/MoyasarAdapter.test.js`, `tests/unit/paymentWebhookSyntheticE2E.test.js` | **TEST** | N/A — these reference `payment_transactions.idempotency_key` (a **separate** identity, see below), never `create_order`'s `p_idempotency_key` | N/A | N/A |
| Edge Function (`supabase/functions/payment-webhook/`) | — | **Not a caller at all** — grepped, zero references to `create_order` or `idempotency_key` anywhere in the webhook function. Confirms the webhook never touches Order idempotency, consistent with the Task 3.6 Scope Audit's three-identity model. | | |
| `scripts/` | — | **Not a caller** — grepped, zero matches. | | |

**Is arbitrary text possible today?** No, in practice — the sole real caller only ever produces `crypto.randomUUID()` output. Staging's `text` column would *accept* arbitrary text if some future/different caller sent it (bounded only by Staging's own inline `length between 16 and 128` check), but no such caller exists in this codebase today.

**`useCheckout.js` given special attention, as instructed**: confirmed at lines 12, 48, and 62 — single `idempotencyKey` value (from `useCart.js`), reused identically for both the direct `create_order` path and the `create_order_from_table_qr` path, sent via object/named notation in both cases. No positional-argument risk (named notation is immune to parameter-order confusion, which is the usual risk `DROP FUNCTION`/overload landmines create — this caller is unaffected by that class of risk entirely).

---

# DATABASE TYPES

Re-verified live via `information_schema.columns`, both environments, in this audit:

| Column | Production | Staging |
|---|---|---|
| `orders.idempotency_key` | **uuid** | **text** ← the drift |
| `orders.payment_transaction_id` | uuid | uuid — **identical, no drift** |
| `payment_transactions.idempotency_key` | **text** | **text** — **identical, no drift** |
| `payment_transactions.provider_ref` | text | text — identical |
| `payment_webhook_events.event_id` | text | text — identical |

**Key finding**: `orders.idempotency_key` (uuid on Production) does **not** match `payment_transactions.idempotency_key` (text on Production) — this mismatch exists **within Production itself**, independent of Staging entirely, and is not a bug: it reflects that Order idempotency and Payment idempotency are different identities generated by different code with different natural representations (see IDEMPOTENCY SEMANTICS below). The Staging/Production drift under audit is specifically and only about the **Order**-idempotency column (`orders.idempotency_key` / `create_order.p_idempotency_key`) — every other idempotency-adjacent column is already type-consistent across both environments.

---

# IDEMPOTENCY SEMANTICS

Four independent identities, re-confirmed with concrete generation-code evidence (not just prior architectural documentation):

| Identity | Column | Generated by | Natural format |
|---|---|---|---|
| **Order** | `orders.idempotency_key` | `crypto.randomUUID()` (`src/features/menu/hooks/useCart.js:73`) | Bare UUID string, e.g. `a1b2c3d4-...` |
| **Payment** | `payment_transactions.idempotency_key` | `newIdempotencyKey('pay')` (`src/payments/utils/index.js:5-8`) → `` `${prefix}_${randomUUID-or-fallback}` `` | Prefixed string, e.g. `pay_a1b2c3d4-...` — **structurally not a valid UUID literal, could never fit a `uuid` column** |
| **Webhook event** | `payment_webhook_events.event_id` | Moyasar's own event `id` field (external, provider-assigned) | Provider-defined string format, not controlled by this codebase |
| **Provider reference** | `payment_transactions.provider_ref` | Moyasar's payment `id` (external) | Provider-defined string format |

**Confirmed independent** — no code path anywhere in this repository conflates any of these four. **Does `uuid` vs. `text` change the semantic *meaning*, or only validation/representation?** **Only validation/representation.** The *meaning* of "same order-idempotency-key ⇒ return the same order" is identical in both environments' `create_order` bodies; `uuid` additionally gives Production free format enforcement and case-insensitive comparison at the Postgres type level, while `text` on Staging relies entirely on the function's own inline length check plus whatever the (single, UUID-only-in-practice) caller happens to send.

---

# SECURITY

| Question | Answer |
|---|---|
| Oversized values? | **No** — Staging's `create_order` explicitly rejects any key outside `length 16–128` (`raise exception 'invalid idempotency key'`), so unbounded-size input is already rejected regardless of the `uuid`/`text` question. |
| Collisions? | Structurally near-impossible either way (`crypto.randomUUID()`'s collision probability is the limiting factor, not the column type). The *scope* of the uniqueness constraint differs (global on Production vs. per-restaurant on Staging, pre-existing, documented above) — this affects cross-tenant key reuse tolerance, not collision probability itself. |
| Whitespace variations? | Staging trims (`nullif(trim(p_idempotency_key), '')`) before use; Production's `uuid` input parser is also whitespace-tolerant. Equivalent in practice. |
| Case variations? | **Real, structural difference**: Postgres's `uuid` type canonicalizes case, so `AAAA-...` and `aaaa-...` compare equal on Production; Staging's `text` comparison is byte-exact (case-sensitive), so differently-cased-but-equivalent UUID strings would be treated as **different** keys on Staging, which could theoretically weaken idempotency protection. **Not currently exploitable**: the sole real caller (`crypto.randomUUID()`) always emits lowercase, so no caller in this codebase can actually trigger this today. |
| Arbitrary strings? | Possible on Staging within the 16–128 length bound (no format check); impossible on Production (Postgres rejects non-UUID-syntax input before the function body even runs). Not currently exploitable — no caller sends non-UUID text. |
| Replay attacks? | Unaffected by the type question either way — replay protection comes from the UNIQUE constraint + "return existing order on match" short-circuit logic, present and independently verified (Task 3.6A-1a, this session) as working correctly on **both** environments regardless of column type. |
| Does UUID provide a security advantage here? | **Yes, marginally**: free format validation and case-insensitive comparison at the database boundary, at zero application cost. Not currently load-bearing (no caller exercises the gap), but a real defense-in-depth property Production has that Staging currently lacks. |

No new security assumption was introduced by this analysis — every conclusion above is traceable to either the live schema, the live function source, or the actual JS generation code, not to a hypothetical.

---

# PAYMENT_FIRST IMPACT

Traced: Dry-run → payment transaction → payment idempotency → provider → payment success → `create_order` → webhook.

- The cross-identity linkage the Payment-First flow actually depends on is `orders.payment_transaction_id` (a `uuid` foreign key into `payment_transactions.id`) + `orders_payment_transaction_id_uidx` (a unique partial index) — **both are byte-for-byte identical in type and definition on Production and Staging** (independently re-confirmed live in this audit). This is the mechanism that prevents a duplicate Order for the same Payment Transaction, and it has **zero** drift.
- `payment_transactions.idempotency_key` (governing duplicate-Payment prevention) is `text` on **both** environments — also zero drift.
- `orders.idempotency_key` / `create_order.p_idempotency_key` (the drifted column) governs a **different** concern: duplicate-Order prevention for repeated **client-side retry of the same checkout attempt**, independent of which payment (if any) is attached.

**Should `payment_transactions.idempotency_key` and `orders.idempotency_key` be identical?** **No** — confirmed by direct evidence, not assumption: they are generated by different code, in different formats, for different purposes (payment retry-safety vs. order retry-safety), and forcing them to be the same value or type would not simplify anything and would not be more correct.

**Does the current type drift cause any of the following?**

| Risk | Assessment |
|---|---|
| Payment/order mismatch | **No** — mismatch prevention is `create_order`'s independent price recomputation (Task 3.6A-1 audit's subject), entirely unrelated to idempotency-key typing. |
| Duplicate Order | **No** — prevented by `orders_payment_transaction_id_uidx` (identical on both environments) for the Payment-First path specifically, and by each environment's own (functioning, if differently-scoped) `orders.idempotency_key` mechanism for the general retry case. |
| Duplicate Payment | **No** — governed entirely by `payment_transactions.idempotency_key`, which has no drift. |
| Failed `create_order` call | **No**, in practice — only a theoretical risk if a non-UUID-format string were sent to Production, which the actual codebase's sole caller never does. |
| Type conversion error | **No** — same reasoning; no caller sends a value that would trigger one. |
| Inability to replay safely | **No** — replay (idempotent retry) was directly, behaviorally verified working correctly on Staging in Task 3.6A-1a (same-key reuse correctly returns the pre-existing order); Production's mechanism is the original, longer-proven version of the same logic. |

**Conclusion**: the drift does not touch, and cannot affect, any part of the Payment-First design as currently planned.

---

# DRY_RUN MIGRATION SAFETY

Inspected `sql/order_dry_run_pricing.sql` (not modified). Cross-checked against the live Production signature re-verified at the top of this audit:

| Question | Finding |
|---|---|
| Preserves Production's `uuid` type? | **Yes** — the file's `DROP FUNCTION IF EXISTS public.create_order(uuid, uuid, text, text, text, text, text, jsonb, text, text, numeric, uuid, uuid)` and the new `CREATE OR REPLACE FUNCTION ... p_idempotency_key uuid DEFAULT NULL::uuid ...` both carry `uuid` forward unchanged — confirmed by direct file inspection, matching the live-verified signature exactly, parameter for parameter. |
| Creates an overload? | **No** — the `DROP FUNCTION IF EXISTS` target matches Production's current live signature exactly (13 args, re-verified live in this audit), so the subsequent `CREATE OR REPLACE` cleanly replaces it — same proven pattern as Task 3.5 (Production) and Task 3.6A-1a (Staging), both independently confirmed to result in exactly one overload afterward. |
| Causes ambiguity? | **No** — one overload before, one guaranteed after. |
| Changes existing callers? | **No** — `p_dry_run` is 14th, `DEFAULT false`; every existing call (positional or named) that doesn't mention it is unaffected. `create_order_from_table_qr` (Production-only, calls `create_order` positionally with only its first 12 arguments) continues to work unchanged — it simply never sets `p_dry_run` or `p_payment_transaction_id`, both of which correctly default. |
| Changes default behavior? | **No** — `p_dry_run DEFAULT false` reproduces the pre-migration behavior exactly for any caller that omits it. |
| Requires any cast? | **No** — the idempotency-key type is not touched, referenced differently, or cast anywhere in this file relative to the current live Production function. |

**The migration and the type drift are provably independent** — the migration's only change is the addition of one boolean parameter at the end of the list; it does not read, write, compare, or reference `p_idempotency_key` in any new way.

---

# OPTIONS

| | A — Keep drift | B — Normalize both to `uuid` | C — Normalize both to `text` | D — Explicit compatibility boundary (documentation, no schema change) |
|---|---|---|---|---|
| Safety | High — no change, both environments already independently tested | Medium — requires validating every existing Staging row is UUID-format before an `ALTER COLUMN`, plus an index-model change (per-restaurant → global) | **Low** — requires touching **Production**'s live schema/data (155 real orders) and **two** functions (`create_order` + `create_order_from_table_qr`) for zero functional gain | High — no schema change at all |
| Migration complexity | None | Medium-high (column type conversion + index rebuild + function signature change, Staging only) | High (same, but on Production — higher stakes) | None |
| Caller impact | None (sole caller already UUID-format regardless) | None on the real caller; removes Staging's current length-based validation tolerance in favor of strict UUID format | None on the real caller; **removes** Production's existing format-validation safety property | None |
| Payment impact | None | None | None | None |
| Order impact | None (each environment's own mechanism already correct within itself) | Positive long-term — Staging becomes representative of Production for idempotency testing | Negative — degrades Production's guarantees to match Staging's weaker ones | None |
| Rollback | N/A | Real but low-stakes (Staging is disposable/test data) | Real and **high-stakes** (Production) | N/A |
| Future maintenance | Minor recurring overhead: any future `create_order`-touching migration must re-verify live signatures per environment first (already the established, proven practice — done correctly three times this session) | Best long-term outcome for Staging-as-parity-environment | Worse — abandons the original ADR-47 architecture for no gain | Turns today's ad hoc (but already-correct) practice into a named, durable decision |
| Production risk | None | **None** (Staging-only) | **Real** (Production-only option that touches Production) | None |

---

# RECOMMENDATION

**A + D combined**: keep the drift operationally unresolved for now (Option A), but formally record — e.g., as a short note in `PROJECT_STATE.md` or a new lightweight ADR — that (1) `orders.idempotency_key`/`create_order.p_idempotency_key` is `uuid` on Production and `text` on Staging by historical accident, not design intent; (2) any future migration touching `create_order` must independently re-verify each environment's live signature before writing its `DROP FUNCTION` clause (the practice already followed correctly in `sql/staging/staging_order_payment_reference.sql`, `sql/staging/staging_order_dry_run_pricing.sql`, and this very audit); (3) Option B (normalize Staging to `uuid`) is the correct eventual fix, tracked as separate, future, Staging-only work — not urgent, not blocking, not bundled into Payment-First delivery.

**Option C is not recommended under any circumstance evaluated** — it is the only option that requires touching Production purely to chase symmetry with Staging, which inverts the project's own established canonical/divergent relationship between the two environments.

---

# DECISION

**`DRIFT_CAN_REMAIN_TEMPORARILY`.**

Basis (not cleanliness alone, per instruction): the sole real caller's actual runtime behavior is unaffected by the type (always sends genuine UUID-format text); the Payment-First flow's actual cross-identity linkage (`payment_transaction_id`) has zero drift; Payment idempotency (a fully separate identity) has zero drift; both environments' own idempotency mechanisms were independently, behaviorally verified working correctly within their own type/scope in Task 3.6A-1a's staging testing this session.

---

# PRODUCTION DECISION

**`SAFE_TO_APPLY_DRY_RUN_TO_PRODUCTION`.**

The type drift does not affect this migration because: (1) the migration's `DROP FUNCTION` target was re-verified live against Production in this very audit and matches Production's actual signature exactly, including `p_idempotency_key uuid`; (2) the migration does not read, write, cast, or otherwise reference `p_idempotency_key` anywhere beyond carrying its existing type forward unchanged; (3) the drift exists only on Staging, which this migration file was never written to target (Staging has its own separate, already-applied file that correctly matches Staging's `text` type); (4) no dependency exists between the new `p_dry_run` parameter and the idempotency-key type in either function body.

No dependency needs to be resolved first. This decision is specific to `sql/order_dry_run_pricing.sql` only — it does not constitute blanket approval to apply it, which remains pending per Task 3.6A-1a's own explicit stop instruction.

---

# RISKS

- The case-sensitivity and format-validation gaps identified under SECURITY are real but currently unexploited (no caller triggers them). If a future caller (e.g., an admin tool, a script, or a different frontend surface) is ever added that sends `p_idempotency_key` from a source other than `crypto.randomUUID()`, this risk profile should be re-evaluated at that time — flagging this as a forward-looking note, not a current blocker.
- Should Option B (normalize Staging to `uuid`) ever be pursued, it is a real, separate migration with its own data-validation and index-model-change risk on Staging — not something to bundle casually into a future task without its own dedicated review.

# BLOCKERS

None. This audit found no dependency that must be resolved before the dry-run migration can be safely applied to Production.

---

# REPORT FILE

`reports/TASK_3_6A_1A_1_CREATE_ORDER_IDEMPOTENCY_TYPE_DRIFT_AUDIT.md`

# DOWNLOAD COPY

`/sdcard/Download/TASK_3_6A_1A_1_CREATE_ORDER_IDEMPOTENCY_TYPE_DRIFT_AUDIT.md` (copied and checksum-verified after this report was written).

# NEXT STEP

This audit does not itself apply the dry-run migration — it only clears the specific question raised (whether the drift blocks it). Applying `sql/order_dry_run_pricing.sql` to Production still requires your separate, explicit approval, as stated at the end of Task 3.6A-1a's own report. No other work (3.6A-1b, 3.6B–3.6G, Payment Service, Option B's Staging-normalization migration) begins without further explicit instruction.

---

*Report generated 2026-08-26. Read-only audit — no code, schema, or database change of any kind.*
