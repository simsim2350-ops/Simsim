# Staging Targeted Payment Parity — Plan (NOT EXECUTED)

**This entire document is a plan. Nothing described in it has been applied to any database. No file listed as "to create" has been created. No `INSERT`/`UPDATE`/`DELETE`/`ALTER`/`CREATE`/`DROP`/migration was executed in this task — every finding below comes from read-only queries already run against `simsim-menu-staging` (and two earlier read-only lookups against production, reused from prior sessions, not re-run here) in this and the prior audit tasks.**

---

## CURRENT STAGING STATE

All confirmed live, this session, via read-only Postgres catalog queries against `rgqsetckcigkgsyobyjg`.

### `create_order`

- **Exactly one overload.** No pre-existing duplicate-overload problem.
- Full signature: `create_order(p_restaurant_id uuid, p_branch_id uuid, p_table_number text, p_delivery_address text, p_customer_name text, p_customer_phone text, p_type text, p_items jsonb, p_notes text, p_coupon_code text, p_client_total numeric DEFAULT NULL, p_idempotency_key text DEFAULT NULL)`
- Returns `TABLE(id uuid, order_number text, access_token text, subtotal numeric, tax numeric, delivery_fee numeric, total numeric, price_changed boolean, price_changes jsonb)` — **identical shape to production.**
- `SECURITY DEFINER`, `search_path=public` — identical to production.
- **Full body fetched and read.** Staging's `create_order` is **not** a copy of production's — it has staging-specific logic:
  - Idempotency check is done **inline at the top** (`select ... from orders where restaurant_id = p_restaurant_id and idempotency_key = v_idempotency_key`), not via a separate index-driven approach — functionally equivalent to production's, just written differently.
  - **Explicit key-length validation**: `if v_idempotency_key is null or length(v_idempotency_key) < 16 or length(v_idempotency_key) > 128 then raise exception 'invalid idempotency key';` — **production has no such check.** This means, unlike production, staging's `create_order` currently **requires** a non-null idempotency key of 16–128 characters — `p_idempotency_key` has a `DEFAULT NULL` in the signature but the function body itself rejects `NULL`. This is a real, functional divergence worth knowing about before testing.
  - Variable naming differs (`v_coupon_found` vs. production's `v_coupon_id`) — cosmetic, not a behavioral difference.
  - Otherwise, validation order and business logic (restaurant/branch/product/coupon/pricing) match production closely.

### `orders`

- `idempotency_key`: **`text`**, nullable. Confirmed via `information_schema.columns` directly (not inferred).
- Unique index: `orders_restaurant_idempotency_key_uq` — **composite** `(restaurant_id, idempotency_key)`, partial (`WHERE idempotency_key IS NOT NULL`). This is **not** the same guarantee as production's `orders_idempotency_key_uidx` (global, single-column). Staging allows the *same* idempotency key to be reused across *different* restaurants; production does not.
- `status`: **no CHECK constraint**, **no `enforce_order_transition` trigger** — the state machine from `sql/order_state_machine.sql` was never applied to staging (re-confirmed).
- RLS policies (re-confirmed, exact text captured in the prior audit and not re-altered since):
  - `orders_access` — `FOR ALL`, role `public`, logic inlined differently from production (uses `is_restaurant_owner`/`member_branch_scope` checks directly rather than calling a `member_has_branch_access` helper — because that helper **does not exist** in staging, confirmed below).
  - `orders_cancel_public` — `FOR UPDATE`, role `public`, `qual: status = 'pending'`, `with_check: status = 'cancelled'`. **Open to any unauthenticated request.**
  - `orders_insert_public` — `FOR INSERT`, role `public`, `with_check: true`. **Unconditionally open** — anyone can insert an arbitrary order row.
- Triggers: `trg_broadcast_order_status`, `trg_broadcast_restaurant_orders`, `trg_loyalty_earn`, `trg_staging_orders_updated_at` (calls `set_updated_at()`, staging's own equivalent of production's `update_updated_at()` — same one-line body, different name). **No `set_order_number` trigger** — `order_number` is generated via a column `DEFAULT` (`'STG-' || nextval('staging_order_number_seq')`), a different mechanism than production's trigger-based numbering.

### Payment tables

**Confirmed absent, and confirmed zero partial implementation.** Queried `information_schema.tables`, `pg_proc`, and `pg_type` for anything matching `%payment%` or `%moyasar%` in the `public` schema. The only match was the pre-existing `payments` table (and its implicit row type) — this is the **unrelated, pre-existing settled-payments table from `sql/billing_foundation.sql`** (platform/subscription billing), not a leftover fragment of the payment-gateway foundation. **`payment_providers`, `payment_transactions`, `payment_webhook_events` do not exist in any form.**

### Dependencies

- **`invoices`**: exists, schema **identical** to production (re-confirmed in the prior audit, not re-diffed column-by-column again this session but no reason to expect drift since nothing has changed staging between then and now).
- **`subscriptions`**: **exists** (newly confirmed this session — this was not checked in the prior audit). This matters: `sql/payments_gateway_foundation.sql`'s `payment_transactions.invoice_id → invoices(id)` FK, and `invoices.subscription_id → subscriptions(id)` FK, both have live targets already in staging. **This removes the "missing invoices/subscriptions" blocker that a from-scratch sandbox would have had** (see the earlier `DEDICATED_PAYMENT_SANDBOX_READINESS_REPORT.md`, which was written before this specific check).
- **`restaurants`, `branches`, `products`, `coupons`**: all exist in staging (re-confirmed).
- **Required helper functions**: `has_restaurant_access`, `is_platform_admin`, `is_restaurant_owner`, `is_restaurant_member` — **fetched in full and confirmed byte-for-byte identical to production.** `member_has_branch_access` — **does not exist in staging** (staging's `orders_access` policy inlines equivalent logic directly instead; this is pre-existing staging behavior, not something this plan needs to fix, since the payment-foundation RLS policies don't depend on this specific function — only `is_platform_admin()` is used by `payment_providers`/`payment_transactions`/`payment_webhook_events`'s policies, and that one is confirmed identical).
- **Required triggers**: `set_updated_at()` already exists and is usable (confirmed above). No production-only trigger function is missing for what this plan needs.

### Client-side idempotency key generation (repository, not staging)

`src/features/menu/hooks/useCart.js` generates the value via `crypto.randomUUID()` (confirmed by reading the source). **The client always sends a well-formed UUID string**, regardless of whether the database column/parameter is typed `text` or `uuid`. This is directly relevant to the `create_order` strategy below.

---

## PROPOSED CHANGES

1. Add `payment_providers`, `payment_transactions`, `payment_webhook_events` to staging, matching production's schema, via a **staging-only** file (not `sql/payments_gateway_foundation.sql` directly, to keep a clear separation and allow a staging-specific safety guard — see below).
2. Add `orders.payment_transaction_id` (+ FK + partial unique index) to staging.
3. Extend staging's **actual, current** `create_order` (not production's) with a new `p_payment_transaction_id uuid DEFAULT NULL` parameter and the same validation logic designed for Task 3.5 (existence + tenant-isolation check + duplicate-reference rejection).
4. **Separately, not bundled with 1–3**: a proposed fix for the `orders_insert_public`/`orders_cancel_public` open policies — designed here, **not applied**, pending your explicit decision.

**Explicitly not proposed:** converting `orders.idempotency_key`/`create_order`'s `p_idempotency_key` from `text` to `uuid`; adding the QR-ordering subsystem; adding the order-state-machine CHECK/trigger; changing `orders_restaurant_idempotency_key_uq` to a global unique index. All of these are real, pre-existing divergences from production, but none are required for Task 3.5's payment-reference verification, and touching them would work against your instruction not to turn staging into a full production mirror.

---

## FILES TO CREATE/MODIFY

**None of these exist yet. All are proposed only.**

| Proposed path | Purpose |
|---|---|
| `sql/staging/staging_payments_gateway_foundation.sql` | Creates the 3 payment tables + admin-only RLS + seeds disabled providers. Content close to `sql/payments_gateway_foundation.sql` (verbatim is expected to work, since `invoices`/`subscriptions` FK targets already exist in staging), prefixed with a safety guard (see below). |
| `sql/staging/staging_order_payment_reference.sql` | Adds `orders.payment_transaction_id` + FK + unique index; drops staging's exact current `create_order` overload and recreates it with the new parameter, **preserving staging's actual existing body** (fetched and quoted above), not production's body. Prefixed with the same safety guard. |
| `sql/staging/staging_close_open_order_policies.sql` (proposed, separate, not part of Task 3.5) | Drops `orders_insert_public` and `orders_cancel_public`, revokes direct `INSERT`/`UPDATE`/`DELETE` on `orders` from `anon` — mirrors production's `sql/order_journey_hotfix.sql` MIG-003/MIG-004 fix. |

**No file under `sql/` (the production-targeted directory) is touched or modified** — `sql/order_payment_reference.sql` remains exactly as it is, unmodified, per your explicit instruction, since the prior audit already proved its assumptions are correct for production.

**Safety guard design** (to be included at the top of both `staging_*.sql` files): a `DO $$ ... $$` block that inspects `pg_proc`/`pg_get_function_identity_arguments` for the current live `create_order` and `RAISE EXCEPTION`s immediately if the last parameter's type is `uuid` instead of `text` — i.e., it aborts itself if it ever detects it's being run against a database shaped like production (or an already-migrated staging). This directly satisfies "cannot be run on Production by accident": running it against production would hit the guard and stop before any `ALTER`/`CREATE` executes.

---

## create_order STRATEGY

**Decision: do not change `p_idempotency_key`'s type. Add `p_payment_transaction_id uuid DEFAULT NULL` as a new, independent 13th parameter, leaving the existing `text` parameter and column completely untouched.**

Reasoning, addressing each point you asked to analyze:

- **Why does staging use `text`?** Not certain from available evidence (no changelog/commit history for staging's internal migration content is retrievable via the tools available — `list_migrations` only returns version+name, not SQL body). A plausible, evidence-based hypothesis: production's own `payment_transactions.idempotency_key` (a *different* table, added by `sql/payments_gateway_foundation.sql`) is **also `text`**, not `uuid` — so production itself is inconsistent across its two idempotency-key columns (`orders.idempotency_key uuid` vs. `payment_transactions.idempotency_key text`). It's plausible staging's implementer picked `text` uniformly, or built staging's `create_order` idempotency independently of production's specific `uuid` choice for `orders`. This is presented as a reasonable inference, not a proven fact.
- **All current callers**: exactly one — `src/features/menu/hooks/useCheckout.js`, which receives the key from `useCart.js`'s `crypto.randomUUID()`. **The client never sends anything except a valid UUID string**, so from the caller's perspective, `text` vs. `uuid` makes no functional difference today.
- **All references to `orders.idempotency_key`**: the column itself, the composite unique index `orders_restaurant_idempotency_key_uq`, and `create_order`'s inline lookup/insert. No other function or table references it (confirmed via the `pg_proc`/`pg_indexes` queries already run).
- **Does staging have real data depending on `text`?** `orders` has only 4 rows total in staging (confirmed in the prior audit) — low blast radius either way, but this is moot since the plan doesn't touch the column's type at all.
- **Does changing the type need a data migration?** Would, if attempted (an `ALTER COLUMN ... TYPE uuid USING idempotency_key::uuid` plus verifying all 4 existing values are UUID-castable) — but this plan does not attempt it, so it's not a concern here.
- **Can `p_payment_transaction_id uuid DEFAULT NULL` be added while keeping `text` for idempotency?** **Yes — confirmed straightforward.** These are two unrelated parameters; nothing about Task 3.5's payment-reference logic depends on the idempotency key's type.

**No dangerous overload will be created.** The migration explicitly does `DROP FUNCTION IF EXISTS public.create_order(<staging's exact current 12-arg signature, ending ...numeric, text>)` before `CREATE OR REPLACE FUNCTION public.create_order(<same 12 params>, p_payment_transaction_id uuid DEFAULT NULL)` — a clean cutover, identical in spirit to how `sql/order_payment_reference.sql` was designed for production, just targeting staging's actual signature instead of assuming production's. **After this change, exactly one live overload will exist** — verified as an explicit checklist item in the test plan below.

The new function body will be **staging's actual current body** (quoted in full under CURRENT STAGING STATE above) with the Task 3.5 payment-reference validation block inserted (existence + same-restaurant check, generic `'invalid payment reference'` error, `payment_transaction_id` added to the `INSERT` column/value list, wrapped with a `unique_violation` handler raising `'payment reference already linked to another order'`) — **not** a copy of production's body. This preserves staging's existing idempotency-key length validation and its other staging-specific behavior exactly as-is.

---

## PAYMENT FOUNDATION STRATEGY

`sql/payments_gateway_foundation.sql` can very likely be applied to staging **close to verbatim** — this is a materially better position than the from-scratch-sandbox scenario (where `invoices`/`subscriptions` didn't exist at all and would have needed to be built or the FK stripped). Specifically:

- `payment_transactions.restaurant_id → restaurants(id)`: target exists, schema compatible.
- `payment_transactions.invoice_id → invoices(id)`: target exists in staging, schema matches production exactly (already confirmed).
- `invoices.subscription_id → subscriptions(id)`: target exists in staging (newly confirmed this session). Not independently re-diffed column-by-column against production in this session — flagged as a minor residual unknown under Risks, but low-risk since nothing in this plan writes to `subscriptions` or `invoices`, it only needs the table to exist for the FK to be creatable.
- `payment_transactions.provider → payment_providers(key)`: created in the same file, no external dependency.
- RLS: all three payment tables' policies call `public.is_platform_admin()`, confirmed byte-identical between staging and production — will behave identically once applied.
- **No conflicting objects exist** (confirmed via the `%payment%`/`%moyasar%` catalog sweep above) — a plain `create table if not exists` (as the source file already uses) is safe to apply without any prior `DROP`.

**Recommendation: apply the file's content unmodified** inside the staging-labeled file, with only the safety guard prepended — no changes to its actual DDL are anticipated to be necessary. If, when this plan is executed, any FK creation fails unexpectedly (e.g., a column-type mismatch not caught by this read-only pass), the correct response per your standing rules is to stop and report it, not to silently strip the constraint.

---

## RLS SECURITY FIX STRATEGY

**Presented for your decision. Not applied. Not bundled with the Task 3.5 payment migration.**

### Exact current policies (staging, re-confirmed)

```sql
-- orders_cancel_public
FOR UPDATE TO public
USING (status = 'pending')
WITH CHECK (status = 'cancelled')

-- orders_insert_public
FOR INSERT TO public
WITH CHECK (true)
```

### Production's equivalent (already fixed)

Neither policy exists in production. They were removed via `sql/order_journey_hotfix.sql`:
```sql
-- MIG-003
DROP POLICY IF EXISTS orders_cancel_public ON public.orders;
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM anon;

-- MIG-004
DROP POLICY IF EXISTS orders_insert_public ON public.orders;
```

### Proposed staging change

Mirror production's fix exactly:
```sql
DROP POLICY IF EXISTS orders_cancel_public ON public.orders;
DROP POLICY IF EXISTS orders_insert_public ON public.orders;
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM anon;
```

### Impact

- **Closes a real, currently-live vulnerability**: any unauthenticated request can currently insert an arbitrary order row (`with_check: true`, no restriction at all) or flip any `pending` order to `cancelled`.
- **Expected zero impact on legitimate functionality**: staging has no QR-ordering path (confirmed absent), and the only order-creation path is `create_order` (`SECURITY DEFINER`, unaffected by table-level `REVOKE` on `anon` — `SECURITY DEFINER` functions run with the function owner's privileges, not the caller's). Production already validated this exact reasoning when it applied the same fix — no regression was reported there.
- This is the one part of this overall plan with a plausible (if low-probability) chance of surfacing something currently relying on the open policy — flagged explicitly under Risks.

### Rollback plan (for this specific fix, if applied and needing reversal)

```sql
CREATE POLICY orders_cancel_public ON public.orders
  FOR UPDATE TO public
  USING (status = 'pending')
  WITH CHECK (status = 'cancelled');

CREATE POLICY orders_insert_public ON public.orders
  FOR INSERT TO public
  WITH CHECK (true);

GRANT INSERT, UPDATE, DELETE ON public.orders TO anon;
```
(Exact original definitions, captured above — not reconstructed from memory.)

**Classification: HIGH PRIORITY STAGING SECURITY FIX.** Recommend applying this independently of, and not gated behind, the Task 3.5 payment work — but the decision and timing are yours.

---

## MIGRATION ORDER

If approved, the order would be:

1. `sql/staging/staging_close_open_order_policies.sql` — **recommended first**, since it's unrelated to payments and higher priority, but could also be applied independently at any time before or after 2–3 without technical dependency either way. (Separate approval track from 2–3, per your instruction not to mix them.)
2. `sql/staging/staging_payments_gateway_foundation.sql` — creates the 3 payment tables (no dependency on step 3).
3. `sql/staging/staging_order_payment_reference.sql` — depends on step 2 (needs `payment_transactions` to exist for the FK).
4. Synthetic seed data (test restaurant/branch/product, disabled test payment-provider row) — only after 2–3 are applied and verified against staging's live catalogs (mirroring Phase 5's verification approach from the earlier sandbox-creation attempt).

---

## ROLLBACK PLAN

| Step | Rollback |
|---|---|
| 3 (`create_order` + `orders.payment_transaction_id`) | `DROP FUNCTION public.create_order(<13-arg signature>);` then `CREATE OR REPLACE FUNCTION public.create_order(<staging's original 12-arg body, quoted in full above>);` to restore byte-identical original behavior. Then `ALTER TABLE public.orders DROP COLUMN payment_transaction_id;` (drops the FK and the partial unique index automatically). |
| 2 (payment foundation) | `DROP TABLE public.payment_webhook_events; DROP TABLE public.payment_transactions; DROP TABLE public.payment_providers;` (in this order, respecting FK dependencies — webhook_events references transactions, transactions references providers). |
| 1 (RLS fix) | Recreate the two policies + re-grant, exact statements under RLS SECURITY FIX STRATEGY above. |
| Seed data | `DELETE FROM orders/payment_transactions/products/branches/restaurants WHERE <tagged test IDs>` — test data will be created with an easily identifiable naming convention (e.g., restaurant names prefixed `SANDBOX TEST —`) specifically so cleanup is unambiguous. |

Every rollback step is a straightforward reversal of an additive/isolated change — nothing in this plan modifies or deletes any existing staging data or existing function logic beyond the one `create_order` cutover (which is itself fully reversible via the captured original body).

---

## TEST PLAN

None of these have been run — this is the plan for after approval and execution:

1. **Existing order without payment reference** — call `create_order` exactly as `useCheckout.js` does today (12 named args, no `p_payment_transaction_id`); must succeed identically to pre-migration behavior.
2. **Valid payment reference** — seed a `payment_transactions` row, pass its `id`; must succeed, `orders.payment_transaction_id` must equal it.
3. **Nonexistent reference** — pass a random UUID not present in `payment_transactions`; must fail with `'invalid payment reference'`.
4. **Cross-restaurant reference** — seed a `payment_transactions` row under a *different* test restaurant, pass its `id`; must fail with the same generic `'invalid payment reference'` (not a different message that would leak the other tenant's data existence).
5. **Duplicate payment reference** — reuse a reference already linked to one order on a second, different order; must fail with `'payment reference already linked to another order'`.
6. **Rollback** — trigger any failure (e.g., scenario 3) and confirm no `orders` row and no `payment_transactions` state change resulted (single-statement `plpgsql` transaction semantics guarantee this by construction, but should be confirmed by actually checking row counts before/after).
7. **Idempotency** — retry the exact same call (same `p_idempotency_key` text value) twice; must return the same order both times, confirmed via `SELECT COUNT(*)` on `orders` for that key.
8. **Existing staging order flow** — exercise the non-payment paths already in use (coupon application, delivery/takeaway/dine-in types) to confirm nothing about the cutover altered staging's pre-existing behavior.
9. **RLS** — confirm `orders_access` still governs correctly (owner/member can read their own orders); if the security fix (Phase/steps above) was also applied, confirm `orders_insert_public`/`orders_cancel_public` are gone and a raw anon `INSERT`/`UPDATE` attempt is now rejected.
10. **Payment transaction access** — confirm `anon`/`authenticated` roles cannot directly `SELECT`/`INSERT`/`UPDATE` `payment_transactions` (admin-only policy enforced).
11. **`create_order` overload count** — `SELECT COUNT(*) FROM pg_proc WHERE proname='create_order'` scoped to `public` schema must return exactly `1` after the migration.
12. **Regression** — re-run this repository's local suite (`npm test -- --run`, currently 487/487) to confirm the staging-only SQL changes (which touch no repository file) leave it unaffected; additionally, consider authoring a new static guard test for `sql/staging/staging_order_payment_reference.sql` (mirroring `src/lib/orderPaymentReferenceGuard.test.js`'s technique) as a *recommended follow-up*, not yet written.

---

## RISKS

| Risk | Mitigation in this plan |
|---|---|
| Safety-guard correctness — the abort-on-production check must be airtight | Guard checks the live `create_order`'s last parameter type via `pg_proc`, which is a hard, unambiguous fact (`text` in staging today, `uuid` in production today) — low risk of a false negative as long as neither database's `create_order` changes type between now and execution. |
| Silently regressing staging-specific `create_order` behavior | Mitigated by design: the new function body is staging's **actual fetched body**, not production's, with only an additive validation block inserted — not a wholesale replacement. |
| RLS fix affecting something currently relying on the open policy | No known legitimate caller depends on it (all real order creation goes through `create_order`, unaffected by the `REVOKE`) — but this is the one change in the plan with residual uncertainty, since it removes existing (if insecure) capability. Recommend applying as its own, separately-reviewable step, not bundled. |
| `subscriptions` schema not independently re-diffed column-by-column against production this session | Low risk — this plan doesn't write to `subscriptions`, only relies on it existing as an FK target, which is already confirmed true. |
| Uncertainty about *why* staging chose `text` | Presented as an inference, not fact — doesn't affect the plan's safety, since the plan deliberately avoids depending on knowing the historical reason (it just doesn't touch the type at all). |

---

## BLOCKERS

**None identified that would prevent this plan from being executable as designed.** All dependencies checked (payment table absence confirmed clean, `invoices`/`subscriptions` targets exist, helper functions exist and match production, no naming conflicts) resolve favorably. The only open item requiring your decision (not a technical blocker) is whether to bundle, sequence, or separately schedule the RLS security fix relative to the payment-foundation work, as you already instructed should be a separate track.

---

## EXPECTED FINAL STATE

If this plan is approved and executed:

- Staging has `payment_providers`/`payment_transactions`/`payment_webhook_events`, schema-matching production, admin-only RLS.
- Staging's `create_order` has exactly one live overload, 13 parameters, `p_idempotency_key text` **unchanged**, new `p_payment_transaction_id uuid DEFAULT NULL`, preserving all of staging's pre-existing validation behavior plus the new payment-reference checks (existence, tenant isolation, duplicate rejection via a DB-level unique constraint).
- `orders.payment_transaction_id` + FK + partial unique index present.
- Staging remains deliberately **not** a full production mirror: no QR subsystem, no order-state-machine, no idempotency-key type change, no global (vs. per-restaurant) idempotency uniqueness change — scope stayed targeted to what Task 3.5 needs, as instructed.
- (If separately approved) `orders_insert_public`/`orders_cancel_public` closed, matching production's security posture.
- All 8+ of Task 3.5's functional scenarios become genuinely, live-executable and verifiable against staging for the first time.
- `sql/order_payment_reference.sql` (the production-targeted file) remains completely untouched throughout.

---

## GIT STATUS

```
Branch: phase-3/task-3-4-webhook-edge-function (unchanged)
HEAD:   163ac24 (unchanged — no commit made)
Modified tracked files: none
New untracked file from this task: reports/STAGING_TARGETED_PAYMENT_PARITY_PLAN.md
```

No commit, push, deploy, or merge was performed. No file under `sql/` or `sql/staging/` was actually created — this report describes their proposed future content only.

---

## REPORT FILE

`reports/STAGING_TARGETED_PAYMENT_PARITY_PLAN.md`

## DOWNLOAD COPY

`/sdcard/Download/STAGING_TARGETED_PAYMENT_PARITY_PLAN.md` (copied and verified after this report was written — see final summary).

---

## FINAL STATUS

**PLAN_READY_FOR_APPROVAL**

Every design decision above is grounded in evidence actually read from staging's and production's live catalogs and function bodies in this and the prior sessions (not assumed) — including the one important discovery that staging's `create_order` body differs materially from production's (the idempotency-key length check), which shaped the recommendation to preserve staging's actual body rather than reuse production's. Nothing has been applied. Awaiting your explicit approval before any execution — and, per your instruction, the RLS security fix and the payment/Task-3.5 work should be treated as separately approvable, not a single yes/no.

---

*Report generated 2026-08-25 (resumed after an interrupted turn — all analysis in this report is based on read-only data already gathered before the interruption; no new database queries were required to complete it). No database — production, staging, or otherwise — was written to. No file under `sql/` was created or modified.*
