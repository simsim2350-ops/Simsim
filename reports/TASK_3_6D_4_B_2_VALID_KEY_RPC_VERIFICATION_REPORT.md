# Task 3.6D.4-B.2 — Live Valid-Key Payment Status RPC Verification

**STAGING ONLY. Production never touched. No repository code changed. Fixture created, verified, and fully deleted in the same session.**

---

# EXACT_TARGET_ENVIRONMENT

Re-confirmed independently at the start of this task via `list_projects`:

| Project | ID | Role |
|---|---|---|
| `rgqsetckcigkgsyobyjg` (`simsim-menu-staging`) | **Sole target of every write in this task.** |
| `gpwwnuuicywsvmmhxngs` (`simsim`) | **Never queried or touched at all in this task** — unlike the prior two tasks in this arc, this task needed no production reference check, since the fixture's shape was already fully known from `TASK_3_6D_4_B`'s implementation and `TASK_3_6D_4_B_1`'s already-confirmed schema parity. |
| `fklbydlnmksyrcdsvhgo` (`madar`) | Unrelated — not queried. |

Pre-fixture state confirmed live: `payment_transactions` = **0 rows**; pre-existing legitimate staging data (`restaurants` = 2, `branches` = 2, `orders` = 4) matches the exact figures documented in `STAGING_TARGETED_PAYMENT_PARITY_EXECUTION_REPORT.md`'s own `INITIAL STATE`/`CLEANUP` sections, confirming nothing has drifted since that task.

---

# PRECEDENT_REVIEW

`STAGING_TARGETED_PAYMENT_PARITY_EXECUTION_REPORT.md` was re-read in full before creating anything. Its established, already-accepted discipline was followed exactly: a clearly `SANDBOX TEST —`-tagged entity, minimal required fields only, `provider='manual'` (never `'moyasar'`, so no code path could construe this as provider-linked), recorded fixture IDs before any test, verification performed, then deletion, then a post-cleanup row-count re-check proving exact restoration to the pre-fixture state.

---

# FIXTURE_CREATION_METHOD

A single atomic SQL statement (`WITH ... INSERT ... RETURNING`), executed via `execute_sql` (DML, not DDL — `apply_migration` was not used, consistent with the precedent task's own use of `execute_sql` for synthetic data): a CTE inserts one minimal `restaurants` row (only `name`/`slug` are `NOT NULL` beyond the auto-generated `id` — confirmed by querying `information_schema.columns` first, not assumed), then inserts one `payment_transactions` row referencing its `id`. No Moyasar call, no `provider='moyasar'` value, no `provider_ref` set (left `NULL`), no real payment reference of any kind — a database-only synthetic construct, indistinguishable in mechanism from any other test row this session has created in staging before.

---

# FIXTURE_VALUES (synthetic only)

| Field | Value |
|---|---|
| `restaurants.name` | `SANDBOX TEST — Payment Status RPC Verification` |
| `restaurants.slug` | `sandbox-test-payment-status-rpc-verification` |
| `restaurants.id` | `5cb75bcd-23ed-41ca-9b0c-0ab4b0f27a34` (recorded for cleanup) |
| `payment_transactions.id` | `368bebaf-8826-40c3-9ce6-323687ec83a2` (recorded for cleanup) |
| `payment_transactions.provider` | `manual` |
| `payment_transactions.status` | `succeeded` |
| `payment_transactions.amount` | `12.34` |
| `payment_transactions.currency` | `SAR` |
| `payment_transactions.idempotency_key` | `SANDBOX_TEST_PAY_STATUS_RPC_VERIFICATION_KEY` |
| `payment_transactions.provider_ref` | `NULL` (never set) |
| `payment_transactions.metadata` | `{}` (default) |

No production ID, no real customer/order/payment data of any kind was used or referenced.

---

# RPC_VALID_KEY_RESULT

Invoked as `anon` (`SET LOCAL ROLE anon`), exactly as a real browser client authenticates:
```
get_payment_status_by_idempotency_key('SANDBOX_TEST_PAY_STATUS_RPC_VERIFICATION_KEY')
→ {"status":"succeeded","amount":"12.34","currency":"SAR","updated_at":"2026-08-27 13:37:23.684218+00"}
```
Matches the fixture's `status`/`amount`/`currency` values exactly; `updated_at` matches the row's actual insert timestamp.

---

# RETURNED_FIELD_VERIFICATION

**Exactly four fields returned**: `status`, `amount`, `currency`, `updated_at` — nothing else. `provider_ref`, `id`/`paymentTransactionId`, `restaurant_id`, `invoice_id`, `metadata`, `raw`, `failure_reason` are all **absent** from the live result — not merely unset in this fixture, but structurally impossible for the function to return them at all (its `RETURNS TABLE` clause has no such columns, re-confirmed unchanged since `TASK_3_6D_4_B`/`TASK_3_6D_4_B_1`).

---

# UNKNOWN_KEY_RESULT

`get_payment_status_by_idempotency_key('pay_totally-unknown-key-does-not-exist')` → `[]` — empty, no error — **verified with real data present in the table this time**, proving the `WHERE idempotency_key = ...` clause correctly discriminates and does not leak the fixture row for a non-matching key.

---

# REPEATED_CALL_RESULT

The exact same valid-key call was issued twice, back to back — **identical result both times**, confirming the read is stable/idempotent as expected for a pure, side-effect-free `SELECT`.

---

# DIRECT_ANON_ACCESS_RE-VERIFIED

`SET LOCAL ROLE anon; SELECT count(*) FROM payment_transactions` → **denied** (`42501: permission denied for function is_platform_admin`), **even with a real row now present in the table** — confirms the RLS bypass is scoped exclusively to the narrow `SECURITY DEFINER` function's own four-field projection, never to the table itself.

---

# RLS_VERIFICATION

`payment_transactions`' policy set queried during the fixture's lifetime — unchanged from every prior check in this arc: exactly one policy, `ptx_admin_all` (`ALL`, role `public`, `qual = is_platform_admin()`).

---

# IDEMPOTENCY_INDEX_VERIFICATION

`uq_paytx_idempotency_key` re-queried during the fixture's lifetime — present, and its definition is **byte-for-byte identical** to what `TASK_3_6D_4_B_1` established and to production's own live definition: `CREATE UNIQUE INDEX uq_paytx_idempotency_key ON public.payment_transactions USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL)`. This task's own fixture INSERT itself is a live, incidental proof the constraint is active and functioning (a second row with the same key would have been rejected — not tested deliberately, since it wasn't needed and would have added an unnecessary write attempt).

---

# CLEANUP_CONFIRMATION

Both fixture rows deleted explicitly by their recorded IDs (`payment_transactions.id = '368bebaf-...'`, then `restaurants.id = '5cb75bcd-...'`) immediately after all verification steps completed. Post-cleanup, the previously-valid key was re-queried via the RPC and now returns `[]` — proving the row is genuinely gone, not merely uncommitted.

---

# FINAL_STAGING_ROW_COUNT

```
payment_transactions_count: 0   (restored exactly)
restaurants_count: 2            (restored exactly — matches pre-fixture and matches STAGING_TARGETED_PAYMENT_PARITY_EXECUTION_REPORT.md's own documented baseline)
branches_count: 2               (untouched throughout — this task never wrote to branches)
orders_count: 4                 (untouched throughout — this task never wrote to orders)
leftover_sandbox_restaurant: 0  (explicit re-check by slug, confirms no dangling synthetic row of any kind remains)
```

**No test payment record, and no synthetic restaurant, was left behind.**

---

# TEST_RESULTS

```
npx vitest run
 Test Files  48 passed (48)
      Tests  873 passed (873)

npm test -- --run
 Test Files  48 passed (48)
      Tests  873 passed (873)
```

Identical to the pre-task baseline (873/873) — expected and correct, since this task made no repository code changes, only live staging data operations that were fully created and reverted within this session; the local test suite exercises no live database connection and was never affected.

---

# PRODUCTION_UNTOUCHED_VERIFICATION

**Zero interaction with `gpwwnuuicywsvmmhxngs` occurred in this task** — every tool call (one `list_projects`, ten `execute_sql` calls) specified either no project or `project_id: rgqsetckcigkgsyobyjg` exclusively. This is confirmed by direct review of every tool call issued during this task, not merely asserted.

---

# BLOCKERS

None. A safe, controlled fixture mechanism was available (direct, tagged, minimal-footprint synthetic rows via `execute_sql`, mirroring the already-established and already-accepted precedent) — no step required production access, a real Moyasar call, or an unsafe/uncontrolled fixture.

---

# WARNINGS

None new. All warnings from `TASK_3_6D_4_B`/`TASK_3_6D_4_B_1` that were specifically about the *absence* of valid-key verification are now resolved by this task. The remaining, unrelated warnings from those tasks (no frontend consumer exists yet; the `PUBLIC`-revoke hardening was cosmetic-in-practice since PostgREST never authenticates as literal `PUBLIC`; `CONCURRENTLY` couldn't be used via the migration tool for the index) are unaffected by and unrelated to this task's scope.

---

# PRODUCTION_READINESS_STATUS

**The `get_payment_status_by_idempotency_key` RPC is now fully behaviorally verified in staging**, closing the last open gap from `TASK_3_6D_4_B`: correct signature and security posture (`TASK_3_6D_4_B`), correct grant hardening and schema/constraint parity (`TASK_3_6D_4_B_1`), and now correct, real, end-to-end behavior against an actual row — valid key returns exactly the approved four fields with correct values, unknown key returns nothing, repeated calls are stable, direct table access remains blocked, and no forbidden field is ever exposed. **Still not applied to production** — that remains a distinct, explicit owner decision, not attempted or assumed here. No frontend consumer exists yet — wiring this into an actual callback UI remains a separate, later, not-yet-approved task.

---

# GIT_STATUS

No repository file was created or modified by this task beyond this report:
```
reports/TASK_3_6D_4_B_2_VALID_KEY_RPC_VERIFICATION_REPORT.md   (new — this report)
```
`git diff --stat` is byte-identical to every prior task's baseline in this arc (13 files, 761 insertions(+), 23 deletions(-)) — zero tracked-file changes. No commit, no push, no merge.

---

# NEXT_STEP

Per instruction: **stopping here.** Not proceeding automatically to the callback UI, 3.6D.5, 3.6D.6, 3.6D.7, or 3.6E. This RPC is now fully staging-verified end-to-end; the remaining open decisions are: (1) whether/when to apply it to production, and (2) which future task wires it into a live callback-landing UI.

---

*Report generated 2026-08-27. Staging-only fixture, created and fully deleted within this session. Production never touched. No code changes, no Moyasar call, no commit, no push, no merge.*
