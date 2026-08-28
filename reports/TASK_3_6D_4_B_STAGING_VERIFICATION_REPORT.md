# Task 3.6D.4-B — Staging Verification Report

**STAGING ONLY. Production never touched. No repository code changed. No callback UI, no Edge Function, no Moyasar call.**

---

# TARGET_ENVIRONMENT_CONFIRMATION

Verified live, not assumed from prior reports, via `list_projects` at the start of this task:

| Project | ID | Name | Status | Role |
|---|---|---|---|---|
| `gpwwnuuicywsvmmhxngs` | — | `simsim` | ACTIVE_HEALTHY | **PRODUCTION** — never targeted by any write in this task |
| `rgqsetckcigkgsyobyjg` | — | `simsim-menu-staging` | ACTIVE_HEALTHY | **STAGING** — the sole target of this task |
| `fklbydlnmksyrcdsvhgo` | — | `madar` | INACTIVE | Unrelated project — never queried |

This matches, and independently re-confirms, the identification already established across two prior dedicated tasks in this session (`STAGING_SCHEMA_PARITY_AUDIT_REPORT.md`, `STAGING_TARGETED_PAYMENT_PARITY_EXECUTION_REPORT.md`). **No ambiguity existed at any point** — the project name itself (`simsim-menu-staging` vs. plain `simsim`) is unambiguous, and it matches a project ID already independently verified twice before. Every subsequent tool call in this task specified `project_id: rgqsetckcigkgsyobyjg` explicitly; none specified `gpwwnuuicywsvmmhxngs`.

---

# PRE_APPLY_VERIFICATION

Performed before touching anything, per instruction:

1. **Target is staging, not production** — confirmed above.
2. **Migration contents match the approved contract exactly** — `sql/payment_status_reads.sql` re-read in full immediately before applying; compared line-by-line against `TASK_3_6D_4_A`'s approved contract and `TASK_3_6D_4_B`'s own implementation report. No discrepancy.
3. **Function name/signature**: `get_payment_status_by_idempotency_key(p_idempotency_key text)` ✓.
4. **`SECURITY DEFINER`**: present in the header ✓.
5. **`SET search_path TO 'public'`**: present ✓.
6. **Exact equality lookup**: `where idempotency_key = p_idempotency_key`, no `LIKE`/`ILIKE`/partial match ✓.
7. **Only `status, amount, currency, updated_at` returned**: confirmed from `RETURNS TABLE(...)` ✓.
8. **Required `GRANT`**: `GRANT EXECUTE ON FUNCTION public.get_payment_status_by_idempotency_key(text) TO anon, authenticated;` present ✓.
9. **Not silently modified**: the exact file content was passed to `apply_migration` verbatim — no edits made during this task.

**Additional pre-apply staging-schema checks** (beyond the instruction's own checklist, performed because this session has a documented history of staging/production schema drift):
- `payment_transactions` columns queried directly: `status text`, `amount numeric`, `currency text`, `updated_at timestamptz`, `idempotency_key text` — all present, all matching what the function requires, byte-compatible with the file's assumptions.
- `get_payment_status_by_idempotency_key` did **not** already exist in staging (empty result from `pg_proc`) — a clean, first-time creation, no prior partial/conflicting definition to worry about.
- `payment_transactions` row count: **0** (matches the fully-cleaned-up state left by the prior `STAGING_TARGETED_PAYMENT_PARITY_EXECUTION_REPORT.md` task).
- **Finding, not a blocker**: `uq_paytx_idempotency_key` (the unique index this function's "at most one row" assumption relies on) **does not exist in staging** — confirmed via direct `pg_indexes` query; staging's payment foundation (`sql/staging/staging_payments_gateway_foundation.sql`, applied in the prior task) created `uq_paytx_provider_ref` but never this index. This is a pre-existing staging/production parity gap, unrelated to and unaffected by this task's migration — see WARNINGS.
- `payment_transactions` RLS policy: exactly one, `ptx_admin_all` (`ALL`, role `public`, using `is_platform_admin()`) — matches the prior parity report's documented state precisely.

---

# MIGRATION_APPLIED

**Yes**, to staging (`rgqsetckcigkgsyobyjg`) only, via `apply_migration` (name `payment_status_reads`), verbatim content of `sql/payment_status_reads.sql`'s two statements. Tool reported `{"success":true}`.

---

# POST_APPLY_VERIFICATION

Every claim below is backed by a direct catalog query run **after** applying the migration — none trusted from the tool's own success flag alone, per this session's own established discipline.

## FUNCTION_EXISTENCE

Confirmed via `pg_proc` + `pg_get_functiondef`. The **live deployed definition** was fetched and compared **character-for-character** against the local `sql/payment_status_reads.sql` file's function body — **identical**, confirming `apply_migration` deployed exactly what was intended, with no silent transformation:
```
security_definer: true
volatility: 's' (STABLE)
config: ["search_path=public"]
language: 'sql'
```

## RPC_INVOCATION_RESULTS

Both tests run as the `anon` role (`SET LOCAL ROLE anon`), exactly as a real browser's Supabase client would authenticate:

- `get_payment_status_by_idempotency_key('pay_00000000-0000-0000-0000-000000000000')` → **`[]`** (empty result, no error). Confirms anonymous RPC invocation works end-to-end.
- `get_payment_status_by_idempotency_key('')` → **`[]`** (empty result, no error). Confirms no crash on edge-case/empty input.

## VALID_KEY_RESULT

**Not verified — no fixture was available, and none was created**, per this task's explicit instruction ("Do not fabricate one. Do not create production-like payment records merely for testing"). Staging's `payment_transactions` table currently holds **zero rows** (confirmed above), so there is no existing valid idempotency key to test against, and this task deliberately did not insert one — unlike the prior `STAGING_TARGETED_PAYMENT_PARITY_EXECUTION_REPORT.md` task (which did create and then clean up tagged synthetic rows under different, more permissive instructions). This is an honest gap, not an oversight: **the "known key returns its real status" path remains unverified against a live row** — only its *shape* is verified (via the local static contract guard, `src/lib/paymentStatusReadGuard.test.js`, 18 tests, unaffected by staging state) and its *empty-input behavior* (verified live, above).

## UNKNOWN_KEY_RESULT

**Verified live**, as shown above — empty result, indistinguishable from any other non-matching input, no error, no exception.

## RETURNED_FIELD_VERIFICATION

Confirmed via the live `RETURNS TABLE(status text, amount numeric, currency text, updated_at timestamp with time zone)` clause, captured directly from `pg_get_functiondef` post-deployment — structurally, the function **cannot** return anything beyond these four fields; there is no code path by which it could. Cross-checked against the forbidden list: `provider_ref`, `id`, `restaurant_id`, `invoice_id`, `metadata`, `raw`, `failure_reason` — **none appear in the live return type or the live function body**.

## SECURITY_VERIFICATION

- **Function cannot perform writes**: the live body (captured via `pg_get_functiondef`) is a single `SELECT` statement — no `INSERT`/`UPDATE`/`DELETE`, no call to any other function, `LANGUAGE sql` (structurally incapable of dynamic SQL or procedural side effects).
- **No Moyasar call occurred**: this task made zero network calls of any kind beyond the Supabase MCP tool calls themselves; the function has no code path capable of reaching Moyasar, and none of this task's own actions did either.
- **Direct anonymous table access re-confirmed still blocked**: `SET LOCAL ROLE anon; SELECT count(*) FROM payment_transactions` → **denied** (`42501: permission denied for function is_platform_admin`) — proves the new function's narrow `SECURITY DEFINER` bypass did not weaken or replace the table's own RLS in any way; direct access remains exactly as restrictive as before.
- **Security advisor** (`get_advisors`, type `security`, run post-deployment): the new function triggers the standard, generic `anon_security_definer_function_executable` / `authenticated_security_definer_function_executable` `WARN`-level linter notices — **confirmed, by direct comparison, that the exact same generic notices already exist for `get_orders_status_secure`** (the established precedent function), at the same `WARN` level. This is expected, standard Postgres/Supabase-linter behavior for any anon-executable `SECURITY DEFINER` function, not a finding specific to this implementation, and is the exact, already-accepted risk profile `TASK_3_6D_4_A`'s own approval explicitly reasoned through (capability-by-possession). No new *class* of security issue was introduced.

## RLS_VERIFICATION

`payment_transactions`' policy set queried before and after the migration — **identical both times**: exactly one policy, `ptx_admin_all` (`ALL`, role `public`, `qual = is_platform_admin()`). No RLS policy was added, removed, or modified by this task.

## IDEMPOTENCY_CONSTRAINT_VERIFICATION

`uq_paytx_idempotency_key` queried before and after the migration — **absent both times, unchanged**. This task's migration contains no `CREATE INDEX`/`ALTER TABLE` statement of any kind and could not have affected this constraint either way. (See WARNINGS for the significance of its absence.)

---

# TEST_RESULTS

```
npx vitest run
 Test Files  48 passed (48)
      Tests  871 passed (871)

npm test -- --run
 Test Files  48 passed (48)
      Tests  871 passed (871)
```

Identical to the pre-task baseline — expected, since local tests exercise no live database connection and this task added no new local test/source files (only the already-existing `src/lib/paymentStatusReadGuard.test.js` from `TASK_3_6D_4_B`'s implementation, already counted in the 871 baseline).

---

# BLOCKERS

None.

---

# WARNINGS

1. **`uq_paytx_idempotency_key` does not exist in staging.** Production has this unique index (`sql/payment_transactions_idempotency_key_unique.sql`); staging's payment foundation, applied in a prior task, never received it. This function's implicit "at most one row" assumption (documented in both `TASK_3_6D_4_A` and the migration's own header comment) is currently **not enforced by staging's schema** — a pre-existing parity gap, not introduced or worsened by this task, and out of this task's scope to fix (no instruction to touch constraints). Flagged here so it isn't mistaken for a property of the new function itself. Production, where the constraint *does* exist, is unaffected either way (never touched).
2. **The "valid key returns correct status" path is unverified against a live row.** Staging's `payment_transactions` table is empty, and no fixture was created (per explicit instruction). Only the function's *shape* (via the static contract guard) and its *empty/unknown-input* behavior (verified live) are confirmed. A future task — either a dedicated, explicitly-approved synthetic-fixture test (mirroring the prior `STAGING_TARGETED_PAYMENT_PARITY_EXECUTION_REPORT.md`'s own precedent and cleanup discipline) or eventual real traffic once wired to a live checkout flow — would be needed to close this specific gap.
3. **Minor grant-list difference from precedent**: the live grant list for the new function includes `PUBLIC` (alongside the explicitly-granted `anon`/`authenticated` and the automatically-present `service_role`/`postgres`), whereas `get_orders_status_secure`'s current grant list does **not** show a `PUBLIC` row. This is standard PostgreSQL default behavior (newly created functions grant `EXECUTE` to `PUBLIC` unless explicitly revoked) and does not expand real-world exposure beyond what `anon`/`authenticated` already have (PostgREST never authenticates as a literal "PUBLIC" role) — the approved contract never specified a `REVOKE ... FROM PUBLIC` statement, so none was added unilaterally. Flagged for awareness only; not treated as a deviation from the approved contract, since the contract didn't address it either way.

---

# PRODUCTION_READINESS_STATUS

**Not production-ready yet — by design, and not attempted.** This task's entire scope was staging verification. Before this capability could be considered ready for production:
1. The same migration would need explicit owner approval to apply to `gpwwnuuicywsvmmhxngs` (never attempted here).
2. The valid-key path should ideally be exercised at least once against real (or realistically-fixtured) data before being relied upon by a live callback UI — currently only structurally verified, not behaviorally verified end-to-end with a real row.
3. `uq_paytx_idempotency_key`'s absence in staging (WARNING 1) should be resolved or explicitly accepted before staging is used for any *further* payment-flow verification relying on that guarantee — irrelevant to production, which already has the constraint.
4. No frontend consumer exists yet — this remains exactly what `TASK_3_6D_4_A`/`TASK_3_6D_4_B` always described: a verified, deployable building block, not yet part of any live user-facing flow.

**What *is* now true**: the SQL contract, once deployed, behaves in staging exactly as specified and approved — correct signature, correct security posture, correct field exposure (and non-exposure), correct anonymous-invocation behavior, zero write capability, zero effect on existing RLS or constraints, zero Moyasar interaction.

---

# GIT_STATUS

No repository file was created or modified by this task beyond this report. `git status --short` and `git diff --stat` are identical to the `TASK_3_6D_4_B` implementation-task baseline:
```
?? sql/payment_status_reads.sql                              (from 3.6D.4-B, unchanged)
?? src/lib/paymentStatusReadGuard.test.js                     (from 3.6D.4-B, unchanged)
?? reports/TASK_3_6D_4_B_PAYMENT_STATUS_RESOLUTION_RPC_IMPLEMENTATION_REPORT.md  (from 3.6D.4-B, unchanged)
?? reports/TASK_3_6D_4_B_STAGING_VERIFICATION_REPORT.md       (this report, new)
```
Tracked-file diff: byte-identical to every prior task's baseline in this arc (13 files, 761 insertions(+), 23 deletions(-)) — zero new tracked-file changes. No commit, no push, no merge.

---

# NEXT_STEP

Awaiting explicit owner instruction on:
1. Whether/when to apply `sql/payment_status_reads.sql` to production.
2. Whether to close the valid-key verification gap now (an explicitly-approved, tagged, cleaned-up synthetic fixture in staging, mirroring the prior parity task's own precedent) or defer it to whichever task first wires a real consumer.
3. Whether the `uq_paytx_idempotency_key` staging parity gap (WARNING 1) warrants its own remediation task.

Per instruction: **stopping here.** Not proceeding to 3.6D.5, 3.6D.6, 3.6D.7, or 3.6E automatically.

---

*Report generated 2026-08-27. Staging-only — production never touched, no code changes, no Moyasar call, no commit, no push, no merge.*
