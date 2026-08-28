# Dedicated Payment Sandbox — Creation Attempt Report

## TASK

Create a new, dedicated Supabase project (`simsim-payment-sandbox`) to safely verify Task 3.5's payment-reference migration, then build a minimal production-parity baseline schema on it, seed synthetic test data, and stop before applying Task 3.5's actual migration. This report documents what was actually attempted and what actually happened — **creation failed, so Phases 2–7 were never reached.**

---

## OBJECTIVE

Move from discovery (prior report: `reports/DEDICATED_PAYMENT_SANDBOX_READINESS_REPORT.md`) to execution: create an isolated project, build the minimum schema required for `create_order` + payment-reference verification, and prepare it for Task 3.5's migration to be applied in a later, separate task.

---

## PROJECT CREATED

**No. Creation failed.** See PROJECT STATUS below for the exact error.

## PROJECT ID

**None assigned** — the project was never created, so no ID exists.

## REGION

`ap-southeast-1` was selected (matching both existing projects, `simsim` and `simsim-menu-staging`, which are both in `ap-southeast-1`) and passed to `create_project`, but since creation failed, no project was actually provisioned in this or any region.

## COST

Confirmed via the prior report's `get_cost` call: **$0/month**. In this task, `confirm_cost` was called (required step before `create_project` — it does not create anything by itself, it only returns a confirmation token) and succeeded, returning a confirmation ID. This confirms the *pricing* for a new project is genuinely $0/month on this organization's plan — the failure that followed was **not** a cost/billing problem, it was a **project-count quota** problem (see below).

## PROJECT STATUS

**Creation call failed immediately**, before any project ID or status existed to check. Exact error returned by the Supabase MCP `create_project` tool, reproduced verbatim (contains no secrets — this is a plan-limit message):

```
BadRequestException: The following organization members have reached their maximum limits
for the number of active free projects within organizations where they are an administrator
or owner: simsim2350-ops (2 project limit). To continue, these users will need to either
delete, pause or upgrade one or more of these projects.
```

This is exactly the risk flagged as unverified in the prior discovery report ("Free-tier active-project quota unknown... this account already has `simsim` (production) and `simsim-menu-staging` as active free-tier projects"). It is now **confirmed**: the organization's free plan allows a maximum of **2** concurrently active free projects, and both slots are already occupied by production and staging. A third cannot be created without deleting, pausing, or upgrading an existing project — or upgrading the organization's plan.

**Per your explicit instruction, none of those actions were taken.** No project was deleted, paused, or upgraded. No plan change was attempted. I stopped immediately at this error.

---

## INITIAL DATABASE STATE

**Not applicable.** No project exists, so there is no database to describe.

## BASELINE SCHEMA

**Not built.** Phase 3 (build minimum payment test schema) was never reached because Phase 1 (create project) failed. No `CREATE TABLE`, no function, no trigger, no index, no RLS policy was created anywhere — not on a new project (none exists), and not on production or staging (both explicitly untouched, confirmed below).

**Note on preparation work done before the failed creation attempt:** in order to be ready to build an accurate, production-faithful schema *if* creation had succeeded, I read (read-only, from production) the exact live definitions of the RLS-helper and trigger functions the schema would have needed: `has_restaurant_access`, `member_has_branch_access`, `is_platform_admin`, `is_restaurant_owner`, `is_restaurant_member`, `enforce_order_transition`, `update_updated_at`, plus the column structure of `platform_admins` and `restaurant_members` (their real dependencies). This confirmed one additional discovered dependency worth recording for whenever this is retried: **`sql/payments_gateway_foundation.sql`'s `payment_transactions.invoice_id` has a hard foreign key to `invoices(id)`**, which in turn FKs to `subscriptions(id)` — meaning applying that file verbatim on an empty database requires either also creating minimal `invoices`/`subscriptions` tables, or deliberately omitting that one FK constraint (since `invoice_id` is nullable and unused by any of Task 3.5's actual test scenarios). This is documented here as a finding for the next attempt, not something I decided/applied, since no schema was actually built.

## FUNCTIONS

**None created.** (See note above — bodies were read from production for future use, nothing was written anywhere.)

## TRIGGERS

**None created.**

## INDEXES

**None created.**

## CONSTRAINTS

**None created.**

## RLS

**None created/configured.** No RLS policy exists on any object in relation to this task, because no project/table exists.

## SYNTHETIC TEST DATA

**None created.** Phase 6 was never reached.

---

## PRODUCTION DATA SAFETY

**Production (`gpwwnuuicywsvmmhxngs`) was not modified in any way.** The only interaction with production in this task was two prior read-only `SELECT` queries against `pg_proc`/`information_schema.columns` (fetching function definitions and column lists, for preparation purposes described above) — no `INSERT`/`UPDATE`/`DELETE`/`ALTER`/`CREATE`/`DROP` was executed against production. No row data, customer data, payment data, or secret was read, copied, or referenced by value anywhere in this task or this report.

## STAGING SAFETY

**`simsim-menu-staging` (`rgqsetckcigkgsyobyjg`) was not touched at all in this task** — no query, read, or write of any kind. It was not deleted, paused, or upgraded in response to the quota error, per your explicit instruction.

---

## BASELINE VERIFICATION

**Not performed.** Phase 5 requires a live sandbox catalog to inspect; none exists. No claim of `create_order` signature, payment-table presence, RLS status, or index status is made for a sandbox, because no sandbox was created.

---

## BLOCKERS

**Single, root blocker: organization-level free-tier active-project quota (2 projects) is already fully consumed by `simsim` (production) and `simsim-menu-staging` (existing staging).** This is a Supabase account/billing-plan constraint, not a code or schema problem, and not something resolvable by retrying the same request — it requires one of:

1. Upgrading the organization (`simsim2350-ops's Org`) off the free plan, or
2. Pausing or deleting an existing project (explicitly **not** something I will do without your direct, explicit instruction to do so, and given the strict "don't touch production or staging" rule for *this* task, neither of the two existing projects should be paused/deleted under this task's authorization even if asked generally — that would need its own explicit, separate decision from you), or
3. Some other plan-level change on Supabase's side (e.g., a temporary quota increase, if Supabase offers one) that I have no tool access to request.

None of these were attempted — this is a decision point for you, not something to resolve unilaterally.

---

## SECURITY

No security-relevant change occurred (nothing was created). For completeness, the confirmation token obtained from `confirm_cost` was not a secret (it's a short-lived, single-use cost-acknowledgment reference, not a credential) and is not reproduced here beyond what's operationally necessary to show the call succeeded; no API key, service-role key, password, or connection string was ever requested, viewed, or printed at any point in this task.

## PERFORMANCE

Not applicable — no infrastructure was provisioned.

---

## GIT STATUS

```
Branch: phase-3/task-3-4-webhook-edge-function (unchanged)
HEAD:   163ac24 (unchanged — no commit made)
Modified tracked files: none
New untracked file from this task: reports/DEDICATED_PAYMENT_SANDBOX_CREATION_REPORT.md
(all other untracked files are pre-existing from earlier sessions)
```

No commit, push, deploy, or merge was performed.

---

## REPORT FILE

`reports/DEDICATED_PAYMENT_SANDBOX_CREATION_REPORT.md`

## DOWNLOAD COPY

`/sdcard/Download/DEDICATED_PAYMENT_SANDBOX_CREATION_REPORT.md` (copied and verified after this report was written).

---

## FINAL STATUS

**SANDBOX_CREATION_BLOCKED**

Evidence: `create_project` was actually invoked (not merely priced/discovered) and returned a concrete, verbatim error identifying a hard organizational quota limit (2 active free projects, both already in use). This is not a discovery-stage "maybe" — it's a confirmed, real failure from the live API. No workaround was attempted, per your explicit instruction to stop immediately on this exact failure mode, not delete anything, and not touch production or staging.

---

## NEXT STEP

This needs a decision from you before any further action on this specific goal:

- Upgrade the organization's plan (removes the 2-project cap), then retry project creation — the schema-build plan documented above (and the discovered `invoices`/`subscriptions` FK dependency) is ready to execute as soon as a project exists; or
- Free up a slot by pausing/deleting an existing project — I won't do this without your explicit, separate authorization, since it directly touches production or staging's operational state even if the *action itself* (pause) is reversible; or
- Reconsider using `simsim-menu-staging` after targeted parity work instead of a brand-new project (Option A from the prior discovery report); or
- Defer live verification entirely and rely on the static guard tests + manual verification script already produced for Task 3.5.

No move to Task 3.6. Nothing was committed or pushed.

---

*Report generated 2026-08-25. No Supabase project was created. No database anywhere — production, staging, or otherwise — was written to. `create_project` was attempted once, failed with a quota error, and no further attempts or workarounds were made.*
