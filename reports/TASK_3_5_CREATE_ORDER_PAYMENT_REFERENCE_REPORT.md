# Task 3.5 — Wire `create_order` RPC Payment Reference

## TASK

**Phase:** Phase 3 — Payment Integration (Moyasar)
**Task ID:** Task 3.5 — Wire `create_order` RPC payment reference
**Branch:** `phase-3/task-3-4-webhook-edge-function` (unchanged — no new branch created, no commit made, per instruction not to commit unless explicitly asked)
**HEAD at start / end:** `163ac24` (unchanged — nothing was committed)
**Date:** 2026-08-25
**Project root:** `/data/data/com.termux/files/home/simsim`

---

## OBJECTIVE

Link `create_order` (and, by extension, the `orders` table) to a specific `payment_transactions` row, safely and traceably, while preserving:
- backward compatibility for the 100% of current traffic that doesn't use online payment,
- idempotency (both the pre-existing order-level idempotency and a new payment-reference uniqueness guarantee),
- tenant isolation (a payment reference must belong to the same restaurant as the order),
- no possibility of one payment transaction backing two orders,
- no change to the existing RPC's return contract,
- no deployment, no migration application, no new commit — code/SQL authored and tested only.

---

## INITIAL STATE

Verified directly from the repository before any change (not assumed):

- **`create_order`** live signature (from `sql/order_idempotency.sql`, confirmed as the sole live version — an earlier 11-arg version was explicitly dropped during Phase 5 per that file's own header comment): 12 parameters ending in `p_client_total numeric DEFAULT NULL, p_idempotency_key uuid DEFAULT NULL`. `SECURITY DEFINER`. Returns `TABLE(id, order_number, access_token, subtotal, tax, delivery_fee, total, price_changed, price_changes)`.
- **Only JS caller:** `src/features/menu/hooks/useCheckout.js`, via `supabase.rpc('create_order', { ...12 named params... })` — named-parameter call, no payment reference.
- **`payment_transactions`** (from `sql/payments_gateway_foundation.sql`): has `restaurant_id`, `invoice_id` (FK to `invoices`, which is **SaaS subscription billing** — restaurant paying SimSim, unrelated to a customer's food order), `provider`, `provider_ref`, `status`, `amount`, `currency`, `idempotency_key`, `metadata`, `raw`. **No column linking it to `orders` existed.**
- **`orders`** table: no `payment_transaction_id` column existed (confirmed via grep across all of `sql/`).
- **No live caller exists yet** that would supply a payment reference — there is no payment/checkout UI (explicitly out of scope per `reports/PHASE_3_EXECUTIVE_REPORT.md` OQ-3), and `paymentService.startCharge` doesn't take an order ID today. This is new, additive plumbing with zero current consumers — not a rewire of an active path.
- **Test baseline (run live before any change):** `npm test -- --run` → **476/476 tests passed, 35 files**.
- **Guard test already in the repo:** `src/lib/orderJourneyGuards.test.js` statically parses every file in `sql/` and enforces several order-journey invariants (token checks, no open write policies, known realtime calls, RPC-name/file consistency). This had to keep passing unmodified.
- **Documented landmine** (in `sql/order_idempotency.sql`'s own header comment): `CREATE OR REPLACE FUNCTION` with a different parameter list creates a **new overload** in Postgres, not a replacement — this exact mistake happened historically on this function and had to be manually corrected in Phase 5.

---

## INVESTIGATION

- Read `sql/order_idempotency.sql` in full (current live `create_order` + `create_order_from_table_qr` bodies).
- Read `sql/payments_gateway_foundation.sql` in full (`payment_transactions` schema).
- Read `sql/billing_foundation.sql` to confirm `invoices` is subscription billing, not order billing — ruling out reusing that relationship.
- Grepped all of `sql/` for `create_order`, `payment_transactions`, `create_order_from_table_qr` to confirm no other file further alters these signatures.
- Grepped `src/` for JS callers of `create_order` — found exactly one (`useCheckout.js`), confirmed it uses **named** parameters (relevant to the overload-safety analysis below).
- Read `src/lib/orderJourneyGuards.test.js` in full to understand exactly what static invariants any new SQL must satisfy.
- Confirmed (via `wc`/`grep`) the highest existing ADR number is `ADR-52` (Task 3.1's Moyasar gateway lock) — referenced the new work as "proposed ADR-53" in the migration's comment header, explicitly flagged as **not yet registered** — I did not edit `PROJECT_STATE.md`'s ADR list myself, since that's a broader documentation decision outside this task's minimal scope.

**Key design conclusion from the investigation:** because `useCheckout.js` calls `create_order` with **named** parameters (not positional), and because Postgres resolves an overloaded named-parameter call by preferring the candidate requiring the fewest defaulted arguments, simply *adding* a new 13-parameter overload alongside the old 12-parameter one would technically still resolve existing calls correctly (the exact 12-arg match wins, zero ambiguity) — however, leaving two live overloads permanently is exactly the anti-pattern this codebase's own comments say was a mistake in the past. I therefore designed this as an explicit **clean cutover** (`DROP FUNCTION IF EXISTS <old 12-arg signature>` then `CREATE OR REPLACE FUNCTION <new 13-arg signature, last param defaulted>`), so there is only ever one live `create_order` definition, and no overload-ambiguity question can ever arise.

---

## IMPLEMENTATION

New file `sql/order_payment_reference.sql`:

1. `ALTER TABLE public.orders ADD COLUMN payment_transaction_id uuid REFERENCES public.payment_transactions(id) ON DELETE SET NULL;`
2. `CREATE UNIQUE INDEX orders_payment_transaction_id_uidx ON public.orders (payment_transaction_id) WHERE payment_transaction_id IS NOT NULL;` — a partial unique index, the same proven pattern already used for `idempotency_key` (`orders_idempotency_key_uidx`). This is the actual database-level guarantee that one payment transaction can never back two orders — not just an application-level check.
3. `DROP FUNCTION IF EXISTS public.create_order(uuid, uuid, text, text, text, text, text, jsonb, text, text, numeric, uuid);` — explicit removal of the old 12-arg signature.
4. `CREATE OR REPLACE FUNCTION public.create_order(<same 12 params, unchanged order/types/names>, p_payment_transaction_id uuid DEFAULT NULL)` — full function body copied from the current live version with two additions:
   - A validation block, placed after the existing input-validation checks and before the item-processing loop: if `p_payment_transaction_id is not null`, look it up in `payment_transactions`; `raise exception 'invalid payment reference'` if not found or if it belongs to a different restaurant than `p_restaurant_id` (tenant isolation — the error message is deliberately generic so it doesn't confirm/deny existence of another tenant's transaction).
   - The `INSERT INTO orders` statement now includes `payment_transaction_id` in both the column list and the values list (`p_payment_transaction_id`), wrapped in a `BEGIN ... EXCEPTION WHEN unique_violation THEN raise exception 'payment reference already linked to another order'` block, so a collision with the new unique index produces a clean, user-facing message instead of a raw Postgres constraint error.
5. `create_order_from_table_qr` was **deliberately not touched**. Its existing body calls `create_order` positionally with exactly 12 values; Postgres allows a positional call to omit trailing parameters that have defaults, so this call remains valid unchanged against the new 13-parameter function (the 13th always defaults to `NULL` for QR-originated orders, which is correct — that flow has no payment-reference concept yet). This keeps the change minimal and the blast radius smaller.
6. `RETURNS TABLE` shape was **not changed** — no new output column was added, since nothing in this task requires echoing the reference back to the caller, and changing the return contract wasn't necessary.

**Migration status: written, not applied to any database.** No live Supabase connection or credentials are available in this session, and per this project's own documented convention (`PROJECT_STATE.md` §9: SQL is executed only after the owner approves each specific script) and the precedent of Task 3.3's still-pending idempotency-key migration, applying SQL to a real database is a separate, explicitly-gated action that was out of scope here (and explicitly forbidden for this task: "لا تعمل Deploy إلى Supabase").

---

## DATABASE CHANGES

**Proposed, NOT applied:**
- New column: `public.orders.payment_transaction_id uuid`, nullable, `REFERENCES public.payment_transactions(id) ON DELETE SET NULL`.
- New index: `orders_payment_transaction_id_uidx`, partial unique index on `orders(payment_transaction_id) WHERE payment_transaction_id IS NOT NULL`.
- Function replaced (drop + recreate, same name, new signature): `public.create_order` — 12 params → 13 params (added `p_payment_transaction_id uuid DEFAULT NULL` at the end).
- Function **unchanged**: `public.create_order_from_table_qr`.

No RLS policy was added, changed, or removed. No seed/data changes. No secrets referenced.

---

## FILES CHANGED

| File | Type | Description |
|---|---|---|
| `sql/order_payment_reference.sql` | **Created** | The migration described above (not applied) |
| `src/lib/orderPaymentReferenceGuard.test.js` | **Created** | 10 new static tests validating the migration's text-level safety properties |

**No existing tracked file was modified.** Verified via `git diff --name-only` (empty output) and `git status --short` (only the two new files above appear, alongside the pre-existing untracked report files from earlier sessions, which this task did not touch).

---

## API / RPC CHANGES

- `create_order` gains one new **optional** parameter, `p_payment_transaction_id uuid DEFAULT NULL`, appended at the end. No existing parameter was renamed, reordered, retyped, or had its default changed.
- No change to `create_order`'s return shape.
- No change to `create_order_from_table_qr`'s signature or return shape.
- No REST/Edge Function endpoint was added or changed.
- **No frontend caller was changed** — `useCheckout.js` still calls `create_order` with its existing 12 named parameters; since the function requires no additional information for this call to keep working exactly as before, nothing needed to change there. There is currently no code path in the repository that would ever populate `p_payment_transaction_id`.

---

## PAYMENT FLOW

This task adds the *storage and validation* half of the order↔payment link; it does not add or change any part of the flow that *initiates* a payment. As designed:

```
(future, out of scope here) Payment UI / checkout-with-payment flow
        ↓ paymentService.startCharge(...) creates a payment_transactions row
        ↓ (future) caller passes that row's id as p_payment_transaction_id
create_order(..., p_payment_transaction_id)
        ↓ validates the reference (exists + same restaurant)
        ↓ INSERT ... orders.payment_transaction_id = <value>
        ↓ unique index guarantees this payment_transaction can never back another order
```

Today, with `p_payment_transaction_id` always omitted/NULL by the only real caller, order creation behaves byte-for-byte as it did before this task.

---

## IDEMPOTENCY

Two independent, non-overlapping idempotency mechanisms now exist on `orders`:

1. **Pre-existing, unchanged:** `p_idempotency_key` — if a caller retries `create_order` with the same key for the same restaurant, the function returns the already-created order immediately, before any new validation or insert logic runs (including the new payment-reference check). Retried calls never reach the new logic at all.
2. **New:** `orders_payment_transaction_id_uidx` — guarantees, at the database level, that a given `payment_transaction_id` can be stored on at most one order row, independent of whether an idempotency key was used. A second attempt to link the same payment transaction to a *different* order (not a retry of the same idempotency key) is rejected with `'payment reference already linked to another order'`.

These two mechanisms are intentionally independent so a retried call (same idempotency key) short-circuits before ever touching the payment-reference logic, and there is no scenario where they could conflict.

---

## SECURITY

- **Tenant isolation:** the new validation explicitly checks `v_payment_tx.restaurant_id <> p_restaurant_id` and raises a generic `'invalid payment reference'` for both "not found" and "belongs to another restaurant" — the same generic message is used for both cases so the error itself cannot be used to probe for the existence of another tenant's payment transactions.
- **No new privilege surface:** the function remains `SECURITY DEFINER` with `SET search_path TO 'public'`, unchanged from before; it already had access to cross-tenant tables (`restaurants`, `branches`, `products`, `coupons`) for its existing validation logic, so reading `payment_transactions` for this same purpose introduces no new class of risk.
- **No secrets involved.** `payment_transactions` contains no card data (confirmed in the earlier Task 3.4 audit); this task only ever reads `id` and `restaurant_id` from it.
- **Defense in depth against duplicate linkage:** enforced at the database level (`UNIQUE` index), not only in application logic — so even a bug or a race in future application code cannot create two orders pointing at the same payment transaction; Postgres itself rejects it.
- Nothing in this task touches RLS, the webhook, or any secret-handling code from Task 3.4.

---

## PERFORMANCE

- One new nullable-column and one new partial unique index on `orders` — negligible write overhead (the index only has entries for rows where `payment_transaction_id is not null`, i.e., zero entries today, since nothing populates it yet).
- One new `SELECT ... FROM payment_transactions WHERE id = ...` lookup, but **only executed when `p_payment_transaction_id` is provided** — for every existing call (which never provides it), this adds zero additional queries and zero measurable overhead to `create_order`'s current execution path.
- No change to the hot path used by 100% of current order traffic.

---

## TESTS

Recorded **before** any change (baseline): `npm test -- --run` → 476/476 passed, 35 files.

Tests actually run in this session, in order:

1. `npx vitest run src/lib/orderPaymentReferenceGuard.test.js` (new file, run standalone first) — 1 failure on first run (a bug in my own test's regex, caused by nested parentheses in the SQL like `nullif(trim(...))` breaking a non-greedy match — **not a bug in the migration**), fixed the test, re-ran: 10/10 passed.
2. `npx vitest run src/lib/orderJourneyGuards.test.js` (pre-existing guard suite, re-run after adding the new SQL file to confirm it still parses/passes it correctly) — 30/30 passed (this suite dynamically generates one check per function definition found across all `sql/*.sql` files; it picked up the new `create_order` definition automatically and validated it against the existing `order_access_token` exemption — no changes were needed to this file).
3. `npm test -- --run` (full suite) — **487/487 passed, 36 files** (476 baseline + 10 new tests of mine + 1 additional dynamically-generated case in the pre-existing guard suite, produced automatically because it now finds one more `create_order` definition across `sql/`; this is the guard test working exactly as designed, not an anomaly).

### Test scenarios from the task brief — coverage disposition

| Scenario | Coverage |
|---|---|
| `create_order` without payment reference (existing flow) | **Covered by regression** — full 487-test suite passes unchanged; by construction (`DEFAULT NULL` + validation gated on `is not null`), behavior is provably identical to before. **NOT independently execution-verified against a live database** (see below). |
| `create_order` with a valid payment reference | Logic authored and statically guard-tested (param exists, lookup+insert wired). **NOT execution-verified** — no live database available. |
| Reference does not exist | Logic authored (`raise exception 'invalid payment reference'` on `not found`), statically guard-tested for presence. **NOT execution-verified.** |
| Duplicate / reused payment reference | Logic authored — DB-level `UNIQUE` index + `unique_violation` handler, statically guard-tested for presence. **NOT execution-verified.** |
| Attempt to link one payment transaction to more than one order | Same mechanism as above (this is the same scenario, phrased differently) — **NOT execution-verified.** |
| Failure / rollback | By construction — a `plpgsql` function executes in the caller's transaction; any `raise exception` prevents the `INSERT` from ever committing, identical to how existing validations (invalid coupon, invalid phone, etc.) already behave. **NOT execution-verified** (no live database to actually trigger and observe a rollback). |
| Idempotency | Reasoned through explicitly above (two independent, non-conflicting mechanisms). **NOT execution-verified.** |
| Regression of existing order flow | **This IS genuinely verified** — the full 487-test suite (including `orderJourneyGuards.test.js`'s structural checks of every SQL function in the repo) passes with zero failures, and the diff to the existing `create_order` body is additive-only (no existing line was altered, only new lines inserted). |

**Why several scenarios could not be execution-verified, stated plainly:** there is no live Postgres or Supabase instance reachable from this environment (confirmed consistent with this repo's own documented constraint — the Phase 3 executive report explicitly notes "SIGILL constraint — cannot run tests locally (Termux/Android); CI-only"). Nothing in this session claims a PASS for behavior that was not actually executed. A manual verification script for these exact scenarios is provided below for you or a DBA to run against a real (ideally sandbox/staging) database before this migration is ever applied to production.

### Manual verification script (for a real database — not run in this session)

```sql
-- Run only against a sandbox/staging database, never production, and only after applying
-- sql/order_payment_reference.sql there first. Replace <restaurant_id>/<branch_id>/<product_id>
-- with real IDs from that environment.

-- 1. Seed a payment_transactions row to reference:
insert into public.payment_transactions (restaurant_id, provider, status, amount)
values ('<restaurant_id>', 'moyasar', 'initiated', 25.00)
returning id;  -- save as <valid_tx_id>

-- 2. create_order WITHOUT payment reference (must succeed exactly as before):
select * from public.create_order('<restaurant_id>', '<branch_id>', null, null, 'Test', '512345678',
  'takeaway', '[{"product_id":"<product_id>","quantity":1}]'::jsonb, null, null);

-- 3. create_order WITH a valid payment reference (must succeed, orders.payment_transaction_id set):
select * from public.create_order('<restaurant_id>', '<branch_id>', null, null, 'Test', '512345678',
  'takeaway', '[{"product_id":"<product_id>","quantity":1}]'::jsonb, null, null,
  null, null, '<valid_tx_id>');
-- then: select payment_transaction_id from public.orders where id = <returned id>; -- expect <valid_tx_id>

-- 4. Nonexistent reference (must raise 'invalid payment reference'):
select * from public.create_order('<restaurant_id>', '<branch_id>', null, null, 'Test', '512345678',
  'takeaway', '[{"product_id":"<product_id>","quantity":1}]'::jsonb, null, null,
  null, null, gen_random_uuid());

-- 5. Cross-restaurant reference (payment_transaction from a DIFFERENT restaurant — must raise the
--    same 'invalid payment reference', not a different message):
--    (seed a payment_transactions row under a different restaurant_id first, then reuse its id here)

-- 6. Duplicate reference — reuse <valid_tx_id> from step 3 on a SECOND, different order (must raise
--    'payment reference already linked to another order'):
select * from public.create_order('<restaurant_id>', '<branch_id>', null, null, 'Test2', '512345679',
  'takeaway', '[{"product_id":"<product_id>","quantity":1}]'::jsonb, null, null,
  null, null, '<valid_tx_id>');

-- 7. Idempotency — retry step 2 or 3 with the SAME p_idempotency_key both times (must return the
--    identical order id both times, not create a second row):
select * from public.create_order('<restaurant_id>', '<branch_id>', null, null, 'Test', '512345678',
  'takeaway', '[{"product_id":"<product_id>","quantity":1}]'::jsonb, null, null,
  null, gen_random_uuid() /* save this key */);
-- re-run the exact same call with the same saved key → expect the same id back, and
-- select count(*) from orders where idempotency_key = '<saved key>'; -- expect 1
```

---

## TEST RESULTS

```
Baseline (before this task):     476/476 passed, 35 files
New file standalone (1st run):   9/10 passed, 1 failed (bug in my test's own regex — fixed)
New file standalone (2nd run):   10/10 passed
Existing orderJourneyGuards.js:  30/30 passed (unchanged, re-verified after adding new SQL file)
Full suite (final):              487/487 passed, 36 files
```

All figures above were produced by commands actually executed in this session; none are copied from a prior report.

---

## REGRESSION RESULTS

**Zero regressions.** All 476 previously-passing tests still pass. The 11-test increase (487 − 476) is fully accounted for: 10 new tests I authored, plus 1 additional dynamically-generated test case inside the pre-existing `orderJourneyGuards.test.js` (it automatically picked up the new `create_order` definition in `sql/order_payment_reference.sql` and validated it — this is that guard test functioning exactly as designed).

---

## PROBLEMS

- One self-inflicted bug during test authoring: my first version of the "payment_transaction_id is inserted" guard test used a regex assuming a simple, non-nested parenthesized `VALUES (...)` clause; the real SQL has nested parentheses (`nullif(trim(p_table_number), '')`), which broke a non-greedy `[\s\S]*?` match. Root cause understood immediately; fixed by matching the broader `INSERT ... RETURNING orders.id` block and checking both identifiers are present within it, rather than trying to precisely parse the parenthesized value list. Re-run confirmed the fix. This was a test-authoring bug, not a migration bug.
- No other problems encountered.

---

## BLOCKERS

- **Cannot execute the migration or any live-database test scenario in this environment** — no Supabase/Postgres connection is available from this Termux session (consistent with this repository's own previously-documented constraint). This blocks true execution-verification of: valid/invalid/duplicate payment reference behavior, rollback behavior, and cross-restaurant rejection. A manual verification script is provided above; running it against a sandbox database is the recommended next validation step, and is an owner/DBA action, not something resolvable from here.
- Applying this migration to any real database (sandbox or production) was explicitly out of scope for this task and was not attempted.

---

## GIT STATUS

```
Branch:            phase-3/task-3-4-webhook-edge-function (unchanged)
HEAD:              163ac24 (unchanged — no commit made)
Modified files:    none (git diff --name-only returned empty)
New untracked files from this task:
  sql/order_payment_reference.sql
  src/lib/orderPaymentReferenceGuard.test.js
Other untracked files: the same 37 pre-existing report .md files from earlier sessions
                        (untouched by this task) plus this new report itself.
Commits made:      none
Push/deploy/merge: none — not attempted
```

---

## REPORT FILE

`reports/TASK_3_5_CREATE_ORDER_PAYMENT_REFERENCE_REPORT.md`

## DOWNLOAD COPY

`/sdcard/Download/TASK_3_5_CREATE_ORDER_PAYMENT_REFERENCE_REPORT.md` (copied and verified after this report was written — see final summary).

---

## NEXT STEP

Per your explicit instruction, this task stops here — no move to Task 3.6, no deploy, no webhook registration, no sandbox E2E. The safest next action, when you're ready, is to run the manual verification script above against a sandbox/staging Supabase database (not production) before this migration is ever applied for real, since several of the scenarios you asked about can only be genuinely proven against a live Postgres instance, which this environment does not have.

---

*Report generated 2026-08-25. Nothing in this report claims a test passed without being run, a migration applied without being applied, or a file changed without being changed.*
