# Task 3.6F — Payment Transaction Idempotency Index

**Migration applied to Production. All other files/systems: read-only / untouched.**

---

# EXECUTIVE SUMMARY

`sql/payment_transactions_idempotency_key_unique.sql` — a pre-existing, unmodified migration file committed since Task 3.3 (`524bdda`), explicitly OWNER/DBA-gated in its own header — was applied to **Production** (`gpwwnuuicywsvmmhxngs`) after every prerequisite in the task's own phase sequence was independently re-verified against live data, not assumed. The duplicate check (re-run fresh) confirmed zero conflicting rows; the migration succeeded; the resulting index was confirmed **valid and ready** by direct catalog inspection (not inferred from a "completed" message); and the actual database-level guarantee was proven behaviorally inside a rolled-back test transaction — a duplicate key insert was correctly rejected, while `NULL` values and a distinct key both inserted successfully. Nothing else in the schema (`orders`, `payment_webhook_events`, `create_order`, the webhook, Moyasar, `pg_cron`) was touched.

**Status: `MIGRATION_APPLIED_AND_VERIFIED`**

---

# ARCHITECTURE DECISION CONTEXT (carried forward, not re-derived)

As stated in the task and already established in `reports/TASK_3_6_SCOPE_ARCHITECTURE_AUDIT.md`:

- `orders.idempotency_key` = Order idempotency
- `payment_transactions.idempotency_key` = Payment idempotency — **the subject of this task**
- `payment_webhook_events.event_id` = Webhook event idempotency
- `provider_ref` = Provider payment lookup/reference

These four identities were not conflated by this task — this migration only touches the second one, and does so by adding a database-level guarantee to a protection that already existed at the application level (`paymentService.startCharge`'s `SELECT`-before-`INSERT` check), not by changing what the key means or how it's used.

---

# PHASE 1 — GIT SAFETY

```
$ git status --short
(same 5 modified files from the prior remediation task — nothing new)
$ git branch --show-current
phase-3/task-3-4-webhook-edge-function
$ git diff -- sql/payment_transactions_idempotency_key_unique.sql
(empty — file unmodified)
$ git log -3 -- sql/payment_transactions_idempotency_key_unique.sql
524bdda  Sun Aug 23 00:23:19 2026  feat(payments): Task 3.3 — wire paymentService to MoyasarAdapter
```

Confirmed: the migration file already exists, is tracked, was committed in Task 3.3, and has never been modified since — including by this task. No unrelated file was touched.

---

# PHASE 2 — MIGRATION READ AND VERIFIED

Full file re-read this session. Findings:

| Property | Value |
|---|---|
| Exact statement | `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_paytx_idempotency_key ON public.payment_transactions (idempotency_key) WHERE idempotency_key IS NOT NULL;` |
| Index name | `uq_paytx_idempotency_key` |
| Table | `public.payment_transactions` |
| Column | `idempotency_key` |
| Uniqueness | Yes — `UNIQUE INDEX` |
| `CONCURRENTLY` | Yes, explicitly used, with the file's own comment explaining why (avoids locking the table in production) |
| Transaction-block compatibility | **Explicitly documented in the file as incompatible** — "يجب تنفيذه خارج أي transaction block (CONCURRENTLY لا يعمل داخل BEGIN/COMMIT)." This was independently confirmed true in Phase 6 below, not just trusted from the comment. |
| Safety guard preserved? | **Yes.** No rewrite was made — the file's `CONCURRENTLY` clause (its central safety property) was not stripped or worked around, even when the first application attempt failed because of it (see Phase 6). |

---

# PHASE 3 — DUPLICATE CHECK (re-verified fresh, not assumed)

Run against Production, this session:

```sql
SELECT idempotency_key, COUNT(*) FROM public.payment_transactions
WHERE idempotency_key IS NOT NULL GROUP BY idempotency_key HAVING COUNT(*) > 1;
-- → empty result set (zero duplicates)

SELECT COUNT(*) FROM public.payment_transactions;
-- → 0

SELECT COUNT(*) FROM public.payment_transactions WHERE idempotency_key IS NULL;
-- → 0
```

**All three figures were queried live in this session, not carried over from a prior report's claim.** Production's `payment_transactions` table remains empty (consistent with every prior audit this session, but this time independently re-confirmed as the specific prerequisite check this task required).

---

# PHASE 4 — NULL SEMANTICS

Determined from the migration's actual SQL and standard PostgreSQL behavior, not assumed:

- The index is **partial**: `WHERE idempotency_key IS NOT NULL` excludes every `NULL`-valued row from the index entirely — such rows never participate in the uniqueness check at all, by construction.
- Independently, even a plain (non-partial) `UNIQUE` index in PostgreSQL treats each `NULL` as distinct from every other `NULL` (unlike some other database systems) — so this migration's behavior here is doubly guaranteed, both by the partial predicate and by Postgres's native NULL-handling.
- **Conclusion, confirmed behaviorally in Phase 8, not just reasoned about**: any number of rows with `idempotency_key IS NULL` may coexist without restriction. Only two or more rows sharing the *same non-null* value are rejected. This is exactly the desired protection stated in the task: "same non-null idempotency_key → only one payment transaction."

---

# PHASE 5 — ENVIRONMENT IDENTIFICATION

**Positively identified: PRODUCTION — `gpwwnuuicywsvmmhxngs` (project name `"simsim"`).**

Evidence chain (no single point of failure):
1. The migration file's own header explicitly states it must be approved "لتنفيذها يدوياً على قاعدة الإنتاج" — "for manual execution on the production database."
2. `list_projects` (queried this session) shows exactly two relevant candidates: `gpwwnuuicywsvmmhxngs` (name `"simsim"`) and `rgqsetckcigkgsyobyjg` (name `"simsim-menu-staging"`) — the naming itself distinguishes them unambiguously.
3. Every prior task this session (Production Readiness Audit, Production Migration Execution, Compatibility Audit, Gap Audit, Scope Audit) has independently and consistently corroborated `gpwwnuuicywsvmmhxngs` as production — including direct evidence like 155 real customer orders and commit-history comments explicitly naming this exact project ID as "قاعدة الإنتاج."
4. The unrelated third project (`madar` / `fklbydlnmksyrcdsvhgo`) was never queried or considered a candidate.

**Staging (`rgqsetckcigkgsyobyjg`) was not touched in this task** — this specific migration file was never intended for staging (staging's payment foundation was set up via a separate, staging-specific file in an earlier task, and staging's own idempotency model was deliberately left as-is per that task's explicit scope).

No ambiguity existed — `MIGRATION_NOT_APPLIED_WRONG_ENVIRONMENT` was not triggered.

---

# PHASE 6 — MIGRATION APPLICATION

**First attempt** — via `apply_migration` (this project's standard migration tool):
```
ERROR: 25001: CREATE INDEX CONCURRENTLY cannot run inside a transaction block
```
This is exactly the failure mode the migration file's own comment warned about — `apply_migration` wraps its input in an implicit transaction. **Per instruction, the SQL was not rewritten to remove `CONCURRENTLY` to force compatibility with this tool** — that would have discarded the file's own intentional safety guard (avoiding a table lock on a live production table) to work around a tooling limitation, which is exactly the kind of change this task said not to make.

**Second attempt** — via `execute_sql` (same project, same unmodified SQL, different execution path): **succeeded**, with no error. This tool does not wrap the statement in an implicit transaction, so `CONCURRENTLY` executed as designed.

No other schema object was touched — confirmed by the fact that only this one `CREATE INDEX` statement was ever submitted, and re-confirmed afterward (Phase 7/8) that `orders`, `payment_webhook_events`, `create_order`, and row counts elsewhere in the schema are all unchanged.

---

# PHASE 7 — DATABASE VERIFICATION

Queried directly from `pg_index`/`pg_class` — **not inferred from the apply call's success message alone**:

```
index_name: uq_paytx_idempotency_key
table_name: payment_transactions
is_unique:  true
is_valid:   true   ← confirms the CONCURRENTLY build completed cleanly, not left invalid
is_ready:   true
definition: CREATE UNIQUE INDEX uq_paytx_idempotency_key ON public.payment_transactions
            USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL)
```

Every field matches the migration file's intent exactly. `is_valid: true` specifically rules out the known failure mode of `CONCURRENTLY` builds (a partially-completed build leaves an index marked invalid rather than rolling back automatically) — this was checked explicitly, not assumed from the absence of an error.

---

# PHASE 8 — BEHAVIORAL VERIFICATION

Run inside an explicit `BEGIN ... ROLLBACK` (the same pattern already proven, in this session's earlier Task 3.5 production verification, to genuinely revert — re-confirmed here by the post-test row count):

| Step | Action | Result |
|---|---|---|
| 1 | Insert a `payment_transactions` row with `idempotency_key = 'test_idem_36F_001'` | **SUCCEEDED** |
| 2 | Insert a second row with the **same** `idempotency_key = 'test_idem_36F_001'` | **CORRECTLY REJECTED** — `duplicate key value violates unique constraint "uq_paytx_idempotency_key"` |
| 3 | Insert two rows, both with `idempotency_key = NULL` | **BOTH SUCCEEDED** — confirms NULLs coexist without restriction |
| 4 | Insert a row with a different, distinct `idempotency_key = 'test_idem_36F_002'` | **SUCCEEDED** — confirms the constraint only blocks true duplicates, not all inserts |

**Post-test verification**: `SELECT COUNT(*) FROM payment_transactions` → **0** — confirms the `ROLLBACK` genuinely reverted every test row; nothing persisted.

**Final sanity check** (unrelated tables/objects, proving isolation): `orders` count = 155 (unchanged), `payment_webhook_events` count = 0 (unchanged), `create_order` overload count = 1 (unchanged) — nothing outside this one index was affected.

---

# WHAT WAS NOT TOUCHED

Per the explicit instruction: `orders`, `payment_webhook_events`, `create_order`, the payment webhook, Moyasar (no configuration, no credentials, no calls), and `pg_cron` (no job created or modified) — none of these were referenced by any write in this task. Staging was never queried. `madar` was never queried.

---

# GIT STATUS

```
$ git status --short
(only the same 5 modified files carried over from the earlier remediation task — nothing new)
$ git diff --stat
5 files changed, 187 insertions(+), 7 deletions(-)   (identical to before this task — no file was touched)
```

**No commit, no push, no merge.** This task's only lasting effect is the new index on the live Production database — the repository's working tree is unchanged.

---

# FINAL STATE

- **Production**: `payment_transactions.idempotency_key` now has a database-level `UNIQUE` guarantee (`uq_paytx_idempotency_key`, valid, ready), closing the gap the architecture audit identified (previously application-level-only, `SELECT`-before-`INSERT`, race-prone). Table remains empty (0 rows) — this was a pure schema hardening, not a data migration.
- **Staging**: untouched.
- **Repository**: unchanged.

---

# REPORT FILE

`reports/TASK_3_6F_PAYMENT_IDEMPOTENCY_INDEX_REPORT.md`

# DOWNLOAD COPY

`/sdcard/Download/TASK_3_6F_PAYMENT_IDEMPOTENCY_INDEX_REPORT.md` (copied and verified after this report was written).

---

*Report generated 2026-08-26. One migration applied to Production, exactly as written in the pre-existing, unmodified `sql/payment_transactions_idempotency_key_unique.sql`. No other schema object, table, function, Edge Function, or Moyasar configuration was touched. No commit, no push, no merge.*
