# Task 3.6D.4-B — Payment Status Resolution RPC Implementation

**Implements the owner-approved TASK_3_6D_4_A specification exactly. SQL migration written, not applied. No Edge Function, no Moyasar call, no frontend wiring, no deploy.**

---

# EXECUTIVE_SUMMARY

Created `sql/payment_status_reads.sql`, defining `get_payment_status_by_idempotency_key(p_idempotency_key text)` — a narrow, read-only, `SECURITY DEFINER` PostgreSQL function that lets a browser resolve a payment attempt's status by its already-issued, already-persisted `paymentIdempotencyKey`, returning only `status`, `amount`, `currency`, `updated_at`. It mirrors the exact, already-live production pattern of `get_orders_status_secure` (`sql/order_status_reads.sql`) — same `STABLE SECURITY DEFINER`/`SET search_path TO 'public'` shape, same exact-equality-only lookup, same `GRANT EXECUTE ... TO anon, authenticated` convention, same "no distinguishable error for an unknown key" behavior. **No JS wrapper was added** — following the same precedent, `get_orders_status_secure` has none either; it is called directly via `supabase.rpc(...)` from wherever it's eventually consumed, and no consumer exists yet in this task's scope. A new, dedicated static-contract guard test (`src/lib/paymentStatusReadGuard.test.js`, mirroring `src/lib/adminGate.test.js`'s established offline-SQL-parsing philosophy) enforces the approved contract — every forbidden field, the exact-match-only lookup, the `SECURITY DEFINER`/`search_path` requirements, and the grant — directly against the SQL source text, so any future drift from the approved contract fails CI immediately. 871/871 tests pass (853 baseline + 18 new). The migration is **written but not applied** to any database, per instruction.

---

# APPROVED_SPECIFICATION

`reports/TASK_3_6D_4_A_PAYMENT_STATUS_RESOLUTION_SERVER_CAPABILITY_SPEC.md`, as amended by the owner's explicit approval message: Design A only; no Edge Function; no anonymous provider confirmation; exact field list `status`/`amount`/`currency`/`updated_at`; explicit forbidden-field list; empty/non-distinguishable result for unknown keys; no partial-key search; preserve `uq_paytx_idempotency_key`; read-only/side-effect-free. Implemented **literally**, with no reinterpretation.

---

# CONVENTIONS_VERIFIED_BEFORE_IMPLEMENTATION

Per instruction, re-read in full before writing any code:

- **`sql/order_status_reads.sql`** — `get_orders_status_secure(p_orders jsonb)`: `LANGUAGE sql`, `STABLE SECURITY DEFINER`, `SET search_path TO 'public'`, `AS $function$ ... $function$;`. `cancel_order_by_customer`: same header shape, no `STABLE` (it writes). Both use a plain `select`/`update` body with no PL/pgSQL constructs.
- **`sql/payment_transactions_idempotency_key_unique.sql`** — confirmed `uq_paytx_idempotency_key` already exists (`CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ... ON public.payment_transactions (idempotency_key) WHERE idempotency_key IS NOT NULL`), guaranteeing the new function's lookup returns at most one row without any additional constraint work. **Not modified.**
- **`sql/000_schema_migrations_table.sql`** / **`sql/menu_branding.sql`** — confirmed the exact `GRANT EXECUTE ON FUNCTION public.<name>(<arg_types>) TO anon, authenticated;` convention, placed immediately after the function definition.
- **`src/features/menu/hooks/useActiveOrders.js`** (lines 94–115) — re-confirmed `get_orders_status_secure` is called directly via `supabase.rpc(...)` from the browser, with no Edge Function and no dedicated JS wrapper module — the precedent this task's "no wrapper" decision follows.
- **`src/lib/adminGate.test.js`** / **`src/lib/orderJourneyGuards.test.js`** — confirmed the established, repo-wide convention of offline/static regex-based parsing of `sql/*.sql` files to enforce security contracts in CI, without any live database connection. Neither file was modified — `orderJourneyGuards.test.js`'s `ORDER_JOURNEY_FN_NAMES` allowlist is explicitly scoped to order-journey functions only ("النطاق مقصود: دوال رحلة الطلب فقط"), and the new payment-status function is intentionally out of that scope, not added to it.
- **`src/payments/services/paymentService.js`** — re-read `confirmCharge`/`startCharge` in full; confirmed neither is referenced, called, or duplicated by the new SQL function.
- **`src/payments/adapters/moyasar.js`**, **`supabase/functions/payment-webhook/`** — re-confirmed untouched; the new function has zero code path to either.

---

# FILES_CREATED

- **`sql/payment_status_reads.sql`** — the migration. Marked with an explicit "OWNER GATE — not yet applied to any environment" header, mirroring `sql/payment_transactions_idempotency_key_unique.sql`'s own convention for a genuinely new (not merely re-documented) capability awaiting owner-authorized application.
- **`src/lib/paymentStatusReadGuard.test.js`** — 18 static-contract tests.
- **`reports/TASK_3_6D_4_B_PAYMENT_STATUS_RESOLUTION_RPC_IMPLEMENTATION_REPORT.md`** (this file).

# FILES_MODIFIED

None. No existing SQL file, JS/JSX file, or test file was changed.

---

# EXACT_IMPLEMENTATION

```sql
CREATE OR REPLACE FUNCTION public.get_payment_status_by_idempotency_key(p_idempotency_key text)
 RETURNS TABLE(status text, amount numeric, currency text, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select status, amount, currency, updated_at
    from public.payment_transactions
   where idempotency_key = p_idempotency_key
$function$;

GRANT EXECUTE ON FUNCTION public.get_payment_status_by_idempotency_key(text) TO anon, authenticated;
```

Every clause traces directly to the approved spec:
- `STABLE SECURITY DEFINER` + `SET search_path TO 'public'` — required verbatim by the approval.
- Single parameter, single exact-equality `WHERE` — no partial match, no `LIKE`/`ILIKE`, no enumeration surface.
- Return list is exactly `status, amount, currency, updated_at`, in the approved order — nothing else selected, so nothing else *can* leak, including `id`, `provider_ref`, `restaurant_id`, `invoice_id`, `metadata`, `raw`, `failure_reason` (all explicitly named as forbidden in the approval; none appear anywhere in the function).
- `LANGUAGE sql` (not `plpgsql`) — the same choice every comparable read function in this codebase makes; a `LANGUAGE sql` function has no `BEGIN`/`RAISE` capability at all, so "never log the full idempotency key" is satisfied structurally, not by discipline.
- No `INSERT`/`UPDATE`/`DELETE`, no call to any other function (`confirmCharge`, any Moyasar-adapter method, or any other RPC) — read-only and orchestration-free, both required by the approval.
- Unknown/invalid key → the `SELECT` simply matches zero rows; no `IF NOT FOUND THEN RAISE EXCEPTION` or equivalent was added, so the caller sees a plain empty result — the exact "non-distinguishable" behavior required, identical to `get_orders_status_secure`'s own join-based null safety.

---

# TESTS

**`src/lib/paymentStatusReadGuard.test.js`** — 18 tests, all statically parsing `sql/payment_status_reads.sql` (and the rest of `sql/`, for the grant search) via the same offline regex-extraction technique already established in `adminGate.test.js`/`orderJourneyGuards.test.js`:

1. Function is actually defined in `sql/`.
2. Header contains `SECURITY DEFINER` and `STABLE`.
3. Header contains `SET search_path TO 'public'`.
4. Header declares `LANGUAGE sql` (not `plpgsql`).
5. Single parameter is exactly `p_idempotency_key text`.
6. `RETURNS TABLE(...)` field list is exactly `status, amount, currency, updated_at`, in that order.
7. *(parameterized, one case per forbidden field)* — `id`, `provider_ref`, `restaurant_id`, `invoice_id`, `metadata`, `raw`, `failure_reason` each individually asserted absent from both the return-type header and the function body.
8. The body contains an exact-equality comparison (`idempotency_key = p_idempotency_key`) and contains neither `LIKE` nor `ILIKE`.
9. The body contains no `INSERT`/`UPDATE`/`DELETE`.
10. The body contains no reference to `confirm_charge`, `moyasar`, or `verify_payment`.
11. A matching `GRANT EXECUTE` exists, naming both `anon` and `authenticated`.
12. The grant's parameter signature matches the function's (`text`).

Also re-ran (unmodified) `src/lib/adminGate.test.js` and `src/lib/orderJourneyGuards.test.js` together with the new file to confirm the new SQL file's syntax doesn't disturb their repo-wide `sql/*.sql` parsing or function-count sanity checks — both passed unchanged.

No JS wrapper exists, so no wrapper-level tests were written — consistent with `get_orders_status_secure` having none either, and with this task's own "add only a thin JS wrapper if actually needed" instruction (it was not needed, since nothing in this task's scope calls the RPC yet).

---

# FOCUSED_RESULTS

```
npx vitest run src/lib/paymentStatusReadGuard.test.js
 Test Files  1 passed (1)
      Tests  18 passed (18)

npx vitest run src/lib/adminGate.test.js src/lib/orderJourneyGuards.test.js src/lib/paymentStatusReadGuard.test.js
 Test Files  3 passed (3)
      Tests  196 passed (196)
```

---

# FULL_REGRESSION_RESULTS

```
npx vitest run
 Test Files  48 passed (48)
      Tests  871 passed (871)

npm test -- --run
 Test Files  48 passed (48)
      Tests  871 passed (871)
```

871 = 853 (the 3.6D.3/3.6D.4-A baseline) + 18 new. Both commands ran to completion with zero failures; no pre-existing test was modified.

---

# SECURITY_VERIFICATION

- **RLS**: `payment_transactions`' existing RLS policy (`is_platform_admin()`) is completely untouched — this function bypasses it only via `SECURITY DEFINER`'s function-owner-privilege mechanism, the same mechanism `get_orders_status_secure`/`cancel_order_by_customer` already use in production. No RLS policy was added, changed, or weakened.
- **Idempotency constraint**: `uq_paytx_idempotency_key` untouched — confirmed by `git status` showing zero changes to `sql/payment_transactions_idempotency_key_unique.sql`.
- **Forbidden fields**: confirmed absent both by direct code inspection and by the automated guard's 7 parameterized tests (one per forbidden field).
- **Enumeration**: exact-match-only, no partial search, no distinguishable not-found behavior — confirmed by tests 6 and 8 above.
- **No orchestration duplication**: the function contains no reference to `confirmCharge`, Moyasar, or any other RPC — confirmed by test 10.
- **No Moyasar call**: this task made zero network calls of any kind; the function itself has no code path capable of one (`LANGUAGE sql`, no external call primitive available).
- **No frontend coupling introduced**: no `.jsx`/`.js` file outside `src/lib/paymentStatusReadGuard.test.js` (a test file) was created or modified.

---

# BLOCKERS

None.

---

# WARNINGS

1. **The migration is written but not applied to any database** (staging or production) — by instruction. Until an owner-authorized migration step runs `sql/payment_status_reads.sql` against a real environment, `get_payment_status_by_idempotency_key` does not exist anywhere callable. This report describes what *would* exist once applied, not a currently-live capability.
2. No JS wrapper or frontend consumer exists yet — a future task (per `TASK_3_6D_4_A`'s own `IMPLEMENTATION_PLAN_FOR_FUTURE_TASK`) is expected to build the actual callback-landing UI that calls this RPC via `usePaymentIdempotencyKey`'s persisted key.
3. `failure_reason` remains entirely unexposed, per the approved spec — if a future UI needs *any* signal beyond `status` for a `failed` outcome, that requires a separate, explicit owner decision (already flagged as open in `TASK_3_6D_4_A`'s `OWNER_DECISIONS_REQUIRED` item 3), not something this implementation silently worked around.
4. The "stuck pending" gap (webhook not yet arrived) is unresolved by design — this RPC only ever reflects current DB state; closing it remains 3.6E's job, not started here.

---

# DEFERRED

- Applying this migration to any real database.
- A JS wrapper (if a future task decides one is actually needed once a real consumer exists).
- The callback-landing UI that would consume this RPC.
- 3.6D.5 (result-mapping UI), 3.6D.6 (order confirmation reuse), 3.6D.7 (E2E tests).
- 3.6E (reconciliation / active confirmation) — still recommended, per `TASK_3_6D_4_A`, as the home for Design B's mechanism; not started.
- Rate limiting and the `startCharge` idempotency tenant-scoping fix — untouched, unrelated to this task.

---

# SCOPE_DEVIATIONS

None. No Edge Function was created. `paymentService.confirmCharge()` was not modified. `payment-webhook` was not modified. No frontend callback UI was created or modified. 3.6D.5/3.6E were not started. Nothing was deployed, committed, pushed, or merged.

---

# GIT_STATUS

New files (untracked, this task):
```
sql/payment_status_reads.sql
src/lib/paymentStatusReadGuard.test.js
reports/TASK_3_6D_4_B_PAYMENT_STATUS_RESOLUTION_RPC_IMPLEMENTATION_REPORT.md
```

No tracked file was modified by this task — `git diff --stat` is byte-identical to the pre-existing baseline (13 files, 761 insertions(+), 23 deletions(-)), confirmed by direct comparison before writing this report. In particular, `src/payments/services/paymentService.js` and `supabase/functions/payment-webhook/handler.js` show zero new changes from this task — their diffs are entirely pre-existing, from prior tasks in this session.

No commit, no push, no merge performed.

# REGRESSION_BASELINE

**853/853 confirmed as the pre-task baseline; 871/871 confirmed as the post-task result (853 + 18 new, zero regressions).**

---

# NEXT_STEP

Per instruction: **stopping here.** Not proceeding to the callback UI (the remainder of "3.6D.4"), 3.6D.5, or 3.6E automatically. Awaiting explicit owner instruction on:
1. Whether/when to apply `sql/payment_status_reads.sql` to a real (staging or production) environment.
2. Which task should build the actual callback-landing UI consuming this RPC, and when.

---

*Report generated 2026-08-27. SQL written, not applied — no deployment, no Moyasar call, no commit, no push, no merge.*
