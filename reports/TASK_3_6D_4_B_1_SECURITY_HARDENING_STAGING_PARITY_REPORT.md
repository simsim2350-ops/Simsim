# Task 3.6D.4-B.1 — Payment Status RPC Security Hardening + Staging Idempotency Parity

**STAGING ONLY. Production read once (index definition only, no write). No callback UI, no Edge Function, no Moyasar call.**

---

# TARGET_ENVIRONMENT

Re-confirmed independently at the start of this task (not merely assumed from prior reports):

| Project | ID | Role |
|---|---|---|
| `rgqsetckcigkgsyobyjg` (`simsim-menu-staging`) | staging | **Sole target of every write in this task.** |
| `gpwwnuuicywsvmmhxngs` (`simsim`) | production | **Read once, read-only** (the exact `uq_paytx_idempotency_key` definition, to guarantee the staging equivalent matches byte-for-byte). **Zero writes.** |

Every `apply_migration` call in this task specified `project_id: rgqsetckcigkgsyobyjg` exclusively. The single production interaction was one `execute_sql` `SELECT` against `pg_indexes` — no `apply_migration`, no `INSERT`/`UPDATE`/`DELETE`/`ALTER` of any kind was ever sent to production.

---

# OBJECTIVE_1 — GRANT_HARDENING

## RPC_GRANT_STATE

| | Before | After |
|---|---|---|
| `PUBLIC` | **EXECUTE** (implicit Postgres default — not explicitly requested in `TASK_3_6D_4_B`, not explicitly forbidden either, simply the standard behavior for any newly created function) | **Absent** — `REVOKE ALL ... FROM PUBLIC` applied |
| `anon` | EXECUTE | EXECUTE — unchanged, re-confirmed live |
| `authenticated` | EXECUTE | EXECUTE — unchanged, re-confirmed live |
| `postgres`, `service_role` | EXECUTE | EXECUTE — unchanged (standard for these roles, out of scope, not addressed) |

Verified live, both before (re-queried fresh at the start of this task) and after applying the hardening migration, via `information_schema.role_routine_grants`.

## MIGRATION_APPLIED

Two statements, exactly the pattern specified in the task:
```sql
REVOKE ALL ON FUNCTION public.get_payment_status_by_idempotency_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_payment_status_by_idempotency_key(text) TO anon, authenticated;
```
Applied to staging via `apply_migration` (name `payment_status_reads_revoke_public`) — succeeded on the first attempt.

## FUNCTION_DEFINITION_UNCHANGED

The live function body/signature was re-fetched via `pg_get_functiondef` after this migration and compared against the pre-hardening capture (`TASK_3_6D_4_B_STAGING_VERIFICATION_REPORT.md`) — **character-for-character identical**. Only the grant/revoke state changed; the function's `RETURNS TABLE`, `LANGUAGE`, `SECURITY DEFINER`, `search_path`, and body are untouched.

## POST_HARDENING_INVOCATION_RE-VERIFIED

Both roles re-tested live, after the `REVOKE ALL FROM PUBLIC`, to confirm it did not inadvertently also strip their own explicit grants (a real risk with `REVOKE ALL` if misapplied — it was not):
- `SET LOCAL ROLE anon; SELECT * FROM get_payment_status_by_idempotency_key('pay_nonexistent-verify-after-hardening');` → `[]`, no permission error.
- `SET LOCAL ROLE authenticated; SELECT * FROM get_payment_status_by_idempotency_key('pay_nonexistent-verify-authenticated');` → `[]`, no permission error.

## LOCAL_FILE_UPDATED

`sql/payment_status_reads.sql` updated in place (the function definition itself untouched — only the grant section extended) to add the `REVOKE ALL ... FROM PUBLIC` statement immediately before the existing `GRANT`, so the file now represents the complete, correct, hardened contract as a single source of truth — consistent with this repo's established convention (`sql/*.sql` files document the current correct live definition, using idempotent `CREATE OR REPLACE`/re-runnable `GRANT`/`REVOKE` statements, not a literal chronological changelog).

## STATIC_GUARD_EXTENDED

`src/lib/paymentStatusReadGuard.test.js` extended with 2 new tests (18 → 20 total): confirms a `REVOKE ALL ... FROM PUBLIC` statement exists for exactly this function, with the matching `(text)` signature — so any future edit that silently drops this hardening fails CI immediately, the same enforcement philosophy already applied to the rest of this function's contract.

---

# OBJECTIVE_2 — STAGING_IDEMPOTENCY_PARITY

## PRODUCTION_INDEX_VERIFIED_FIRST

Queried live from `gpwwnuuicywsvmmhxngs` (read-only) before writing anything:
```
CREATE UNIQUE INDEX uq_paytx_idempotency_key ON public.payment_transactions
  USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL)
```
This is the exact definition the staging equivalent was built to match — not assumed from the repository's own `sql/payment_transactions_idempotency_key_unique.sql` file alone, but independently confirmed against the live production catalog.

## STAGING_INDEX_BEFORE

Absent (re-confirmed at the start of this task — `pg_indexes` returned zero rows for this name in staging, consistent with `TASK_3_6D_4_B_STAGING_VERIFICATION_REPORT.md`'s finding).

## FILE_CREATED

`sql/staging/staging_payment_transactions_idempotency_key_unique.sql` — a **new, staging-only** file, explicitly separate from both `sql/payment_transactions_idempotency_key_unique.sql` (the production file, untouched) and `sql/payment_status_reads.sql` (the RPC migration, also untouched by this objective). Defines the identical index (same name, table, column, partial `WHERE` condition) as production.

## OPERATIONAL_NOTE — CONCURRENTLY

The file specifies `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ...`, mirroring production's own file exactly (the correct, general-purpose, lock-avoiding form). **Applying it via `apply_migration` failed** (`25001: CREATE INDEX CONCURRENTLY cannot run inside a transaction block`) — the migration tool wraps DDL in a transaction, which Postgres does not allow for `CONCURRENTLY`. Since staging's `payment_transactions` table held **zero rows** at the time (re-confirmed immediately before this step), a non-concurrent `CREATE UNIQUE INDEX IF NOT EXISTS` was applied instead for this specific execution — safe specifically because there were no existing rows and no concurrent writers to block, not a general substitute for `CONCURRENTLY`'s purpose. **The file itself is left unchanged** (still specifying the correct, production-appropriate `CONCURRENTLY` form) since it documents the correct general-purpose statement for any future re-application against a non-empty table; only the one-time application to this specific, currently-empty staging table used the non-concurrent variant. This is disclosed here explicitly, not silently substituted.

## MIGRATION_APPLIED

```sql
CREATE UNIQUE INDEX IF NOT EXISTS
  uq_paytx_idempotency_key
ON public.payment_transactions (idempotency_key)
WHERE idempotency_key IS NOT NULL;
```
Applied to staging via `apply_migration` (name `staging_payment_transactions_idempotency_key_unique`) — succeeded.

## STAGING_INDEX_AFTER

Re-queried live from `pg_indexes` post-apply:
```
CREATE UNIQUE INDEX uq_paytx_idempotency_key ON public.payment_transactions
  USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL)
```
**Byte-for-byte identical** to production's live definition captured above. Same name, same table, same column, same partial condition — full semantic parity achieved.

## PRODUCTION_INDEX_VERIFICATION

Not modified — the only interaction with production in this entire task was the single read-only `SELECT` used to confirm the target definition; production's own index (`sql/payment_transactions_idempotency_key_unique.sql`) was never touched, re-created, or altered.

---

# RLS_STATE

`payment_transactions`' policy set re-queried after **both** migrations — unchanged, identical to every prior check in this arc: exactly one policy, `ptx_admin_all` (`ALL`, role `public`, `qual = is_platform_admin()`). Neither this task's grant-hardening nor its index-parity work touched RLS in any way.

---

# VALID_KEY_VERIFICATION_STATUS

**Still unverified, and no fixture was created — per explicit instruction.** `payment_transactions` row count re-confirmed **0** both before and after this task's changes. Adding the missing unique index does not by itself create any data to test against; it only restores the *constraint* staging was missing. The valid-key path remains verified only structurally (via the local static contract guard), not behaviorally against a live row — unchanged from `TASK_3_6D_4_B_STAGING_VERIFICATION_REPORT.md`'s own honestly-reported gap. No synthetic payment record was created merely to close this gap, per this task's explicit instruction.

---

# TESTS

```
npx vitest run
 Test Files  48 passed (48)
      Tests  873 passed (873)

npm test -- --run
 Test Files  48 passed (48)
      Tests  873 passed (873)
```

873 = 871 (prior baseline) + 2 legitimate new tests (the `REVOKE ALL ... FROM PUBLIC` contract assertions added to `src/lib/paymentStatusReadGuard.test.js`), exactly matching the task's own "871/871 passing or higher only if legitimate new tests are added" expectation. One transient Vitest `maxWorkers`/`sequence.groupOrder` tooling flake occurred on the first `npm test -- --run` attempt (the same recurring, code-unrelated flake documented repeatedly earlier in this session) — resolved by an immediate retry, which passed cleanly. Both commands ultimately ran to completion with zero failures.

---

# BLOCKERS

None.

---

# WARNINGS

1. **`CONCURRENTLY` could not be used for this specific staging application** (tooling constraint, not a design flaw) — see OPERATIONAL_NOTE above. Safe only because the table was empty; the file itself retains the correct `CONCURRENTLY` form for any future re-application against non-empty data (e.g., if this same file is ever reapplied to a staging environment that has since accumulated rows, or adapted for production).
2. Valid-key behavior remains structurally-only verified, not behaviorally verified against a live row — unchanged gap from the prior task, not addressed here per explicit instruction not to fabricate data.
3. The `PUBLIC` grant that was just revoked was never a functional security hole in practice (PostgREST/Supabase clients always authenticate as `anon` or `authenticated`, never as a literal "PUBLIC" connection role) — this hardening closes a defense-in-depth gap and brings the function's grant list to exact parity with the approved contract's letter, not a previously-exploitable weakness.

---

# PRODUCTION_READINESS_STATUS

**Staging is now fully aligned with the approved contract**: correct grants (no `PUBLIC`, only `anon`/`authenticated`), correct function definition, correct RLS (unaffected), and now correct idempotency-constraint parity with production. **Still not applied to production** — that remains a separate, explicit owner decision, not attempted or assumed by this task. The valid-key behavioral gap (WARNING 2) is the one remaining piece that would benefit from either a dedicated, explicitly-approved synthetic-fixture verification task, or first real exposure once an eventual callback UI is wired and used.

---

# GIT_STATUS

New files this task:
```
sql/staging/staging_payment_transactions_idempotency_key_unique.sql   (new — the entire sql/staging/ directory shows as one collapsed `?? sql/staging/` line in `git status --short` since it was already untracked; individually confirmed present via `ls`)
reports/TASK_3_6D_4_B_1_SECURITY_HARDENING_STAGING_PARITY_REPORT.md    (new — this report)
```

Modified this task (both already untracked from the prior `TASK_3_6D_4_B` task — no previously-tracked file was touched):
```
sql/payment_status_reads.sql                    (added REVOKE ALL ... FROM PUBLIC, function body/signature unchanged)
src/lib/paymentStatusReadGuard.test.js          (+2 tests enforcing the new REVOKE contract)
```

Tracked-file diff (`git diff --stat`): byte-identical to every prior task's baseline in this arc (13 files, 761 insertions(+), 23 deletions(-)) — zero new tracked-file changes. No commit, no push, no merge.

---

# NEXT_STEP

Per instruction: **stopping here.** Not proceeding to the callback UI, 3.6D.5, 3.6D.6, 3.6D.7, or 3.6E. Awaiting explicit owner instruction on:
1. Whether/when to apply the hardened `sql/payment_status_reads.sql` (now including the `PUBLIC` revoke) to production.
2. Whether to close the remaining valid-key behavioral verification gap (an explicitly-approved, tagged, cleaned-up synthetic fixture, mirroring the established `STAGING_TARGETED_PAYMENT_PARITY_EXECUTION_REPORT.md` precedent) or defer it to whichever task first wires a real consumer.

---

*Report generated 2026-08-27. Staging-only writes; production read-only (index definition check). No code deployed, no Moyasar call, no commit, no push, no merge.*
