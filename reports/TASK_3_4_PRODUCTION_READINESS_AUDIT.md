# Task 3.4 — Payment Webhook Edge Function: Production Readiness / Deployment Audit

**Read-only audit. Nothing was deployed, modified, or written to any database. No Moyasar configuration was touched.**

---

# EXECUTIVE SUMMARY

Task 3.4's Payment Webhook Edge Function was re-verified from scratch in this session — code, tests, database contract, and deployment state — not assumed from prior reports. **Everything previously known remains true, freshly confirmed:** code is unchanged since its original commit (checksummed), 22/22 webhook-specific tests pass, full suite is 487/487 (up from the previously-cited 476 — the difference is Task 3.5's own new tests added since, not drift or regression), and **the function is confirmed NOT deployed** (directly queried via `list_edge_functions` — it does not appear among the three functions that are deployed). Two genuinely new findings from this pass: (1) HMAC signing/status-mapping constants were cross-checked line-by-line and are internally consistent (no silent enum-mismatch bug); (2) the function performs **zero database writes to `orders`** and has **zero dependency on Task 3.5's schema** — it only touches `payment_transactions`/`payment_webhook_events`, both unchanged by Task 3.5's migration, so there is no compatibility question between them, but there is also no automatic order-status update wired yet when a payment succeeds (a known, pre-existing scope gap, not a defect).

**Final verdict: `TASK_3_4_READY_WITH_WARNINGS`**

Not `READY_FOR_DEPLOY` outright, because two real gaps remain exactly as Task 3.4's own original report already disclosed: the HMAC header name/encoding is unverified against Moyasar's actual documentation, and Moyasar sandbox credentials don't exist yet — both are prerequisites for a *safe* deployment, not code defects.

---

# CURRENT STATE

| Claimed (from prior reports) | Re-verified this session | Status |
|---|---|---|
| Code completed | Yes — files unchanged since `6b0a4f2` (checksummed) | **CONFIRMED** |
| Unit tests completed, 22/22 | Yes — re-ran `paymentWebhook.test.js` fresh: 22/22 PASS | **CONFIRMED** |
| Full suite previously 476/476 | Now 487/487 (+11 from Task 3.5's own new tests this session) | **CONFIRMED, WITH EXPLAINED DELTA** |
| Deployment not done | Directly confirmed via `list_edge_functions` — `payment-webhook` absent from the 3 deployed functions | **CONFIRMED** |
| Moyasar Sandbox E2E not done | No evidence of any Moyasar interaction anywhere in this session's history or the codebase | **CONFIRMED** |
| Real credentials not used | No secret was viewed; code reads env vars that are (per this audit) not yet configured for a non-existent deployment | **CONFIRMED** |

---

# REPOSITORY STATE

```
Branch: phase-3/task-3-4-webhook-edge-function
HEAD:   163ac24
```

`git log -10` confirms the relevant history in order: `8afe304` (Task 3.1 ADR) → `48d3750` (Task 3.2 MoyasarAdapter) → `e20f73f` (docs) → `524bdda` (Task 3.3 paymentService wiring) → `ffd3719` (docs) → `6b0a4f2` (**Task 3.4 — webhook Edge Function + 22 tests**) → `e49e4ea` (Task 3.4 test fix) → `163ac24` (Task 3.4 docs, current HEAD).

`git status`/`git diff` show only pre-existing untracked report/sql files from this and prior sessions (Task 3.5 staging/production work) — **no tracked file is modified**, and Task 3.4's files (`supabase/functions/payment-webhook/{index.ts,handler.js}`, `tests/unit/paymentWebhook.test.js`) are not among the untracked/modified set at all, since they were committed in `6b0a4f2`.

**Confirmed via `git log -1 -- supabase/functions/payment-webhook/`**: the last commit touching this directory is `6b0a4f2` — **no change since Task 3.4's original implementation.**

---

# EDGE FUNCTION

**Location**: `supabase/functions/payment-webhook/` — two files, `index.ts` (Deno entry point, 41 lines) and `handler.js` (pure logic, 256 lines), re-read in full this session.

| Aspect | Finding |
|---|---|
| Entry point | `index.ts` — `Deno.serve(handle)`, `handle = buildHandler({ webhookSecret, adapter, db })` |
| Dependencies | `@supabase/supabase-js@2` (via esm.sh CDN import — standard Deno Edge Function pattern), `../../../src/payments/adapters/moyasar.js` (`MoyasarAdapter`, unchanged since `48d3750`, checksummed this session) |
| Environment variables | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (both auto-injected by Supabase at deploy time), `PAYMENT_MOYASAR_SECRET_KEY`, `PAYMENT_MOYASAR_WEBHOOK_SECRET` (both must be manually configured) |
| Supabase client config | `createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })` — service-role, bypasses RLS (necessary — payment tables are admin-only RLS) |
| Authentication | None at the application level by design — see SECURITY AUDIT |
| Signature verification | HMAC-SHA256 via `crypto.subtle.verify` (timing-safe), header `x-moyasar-signature`, hex-encoded, verified against the **raw** request body (read via `req.text()` before any JSON parsing) |
| Webhook event parsing | Delegated to `MoyasarAdapter.parseWebhook(payload, headers)` — normalizes Moyasar's raw event `type` into `WebhookEventType` enum values |
| Idempotency | DB-level: `INSERT INTO payment_webhook_events` relies on the `uq_webhook_provider_event UNIQUE (provider, event_id)` constraint; a `23505` violation is caught and treated as `already_processed`, returning `200` (not an error) |
| Payment transaction lookup | `SELECT id, status FROM payment_transactions WHERE provider_ref = event.providerRef` |
| Payment transaction update | `UPDATE payment_transactions SET status = newStatus, updated_at = now() WHERE id = tx.id` — only if the transaction is not already in a terminal state |
| Order interaction | **None.** The handler never reads or writes `public.orders` in any way. |
| Error handling | Try/catch around body read, JSON parse, and the whole event-handling call; internal errors return a generic `500 { error: 'Internal error processing webhook' }` — no internal message leaked to the caller (only logged server-side via `console.error`) |
| Logging | `console.error` only for: missing webhook secret config, and internal processing errors (message only, not full stack/payload) — no secret value is ever logged (verified: `webhookSecret` and `SERVICE_ROLE_KEY` are never passed to any `console.*` call) |
| Response codes | `200` OPTIONS/success/duplicate/not-found/no-ref/already-terminal, `400` malformed body/JSON, `401` missing/invalid signature, `405` non-POST, `500` unconfigured secret/internal error |
| Retry behavior | Correctly designed for Moyasar's retry-on-non-200 behavior: duplicate events return `200` specifically to stop retries from re-processing |
| Duplicate webhook handling | Handled via the DB unique constraint + `23505` catch (see Idempotency) |

No secret value was viewed or reproduced anywhere in this review.

---

# DATABASE CONTRACT

Re-verified directly against **live production** (`gpwwnuuicywsvmmhxngs`) catalogs, post-Task-3.5-migration, in this session — not assumed:

| Column the webhook reads/writes | Table | Live Production type | Match? |
|---|---|---|---|
| `id`, `provider`, `provider_ref`, `status`, `updated_at` | `payment_transactions` | `uuid`, `text`, `text`, `text`, `timestamptz` | **MATCH** |
| `id`, `provider`, `event_id`, `event_type`, `payload`, `processed_at`, `process_error`, `transaction_id` | `payment_webhook_events` | `uuid`, `text`, `text`, `text`, `jsonb`, `timestamptz`, `text`, `uuid` | **MATCH** |
| `key` (as FK target for `provider='moyasar'`) | `payment_providers` | `text`, seeded with `moyasar` row | **MATCH** |

**Status value compatibility**: `payment_transactions_status_check` CHECK constraint (live, re-queried) allows `('initiated','pending','succeeded','failed','cancelled','refunded')`. The webhook's `_eventTypeToStatus()` produces `'succeeded'|'failed'|'cancelled'|'pending'` — all within the allowed set. Cross-checked the enum source: `WebhookEventType.PAYMENT_SUCCEEDED = 'payment.succeeded'` (in `src/payments/types/index.js`) matches **exactly** the string literal `'payment.succeeded'` used in `handler.js`'s switch statement — **no silent enum/string mismatch** (this was independently verified, not assumed, by reading both files side by side). `TransactionStatus` values (used when `event.status` is already normalized by the adapter) are also confirmed to be exactly the CHECK constraint's allowed values.

**Task 3.5 interaction**: `orders.payment_transaction_id` (added by Task 3.5) is **never referenced** by the webhook — confirmed via `grep` returning zero matches for `payment_transaction_id`/`create_order` anywhere in `supabase/functions/payment-webhook/`. **There is no compatibility issue, because there is no dependency in either direction.** See TASK 3.5 INTEGRATION IMPACT for what this means functionally.

---

# TASK 3.4 TESTS

Run fresh, this session (not cited from any prior report):

```
$ npx vitest run tests/unit/paymentWebhook.test.js
 Test Files  1 passed (1)
      Tests  22 passed (22)
```

Test IDs (from the file, re-read this session): `WEBHOOK-001` through `WEBHOOK-014` (with `005a/b/c` and `013a/b` sub-cases) plus `HMAC-1` through `HMAC-5` — covering valid signature, missing/invalid signature, malformed JSON, all HTTP methods, duplicate-event idempotency, transaction-not-found, terminal-transaction non-regression, unknown event types, missing `providerRef`, DB errors, and no-secret-leakage in responses.

---

# FULL REGRESSION

```
$ npm test -- --run
 Test Files  36 passed (36)
      Tests  487 passed (487)
```

**Not 476** — this is expected and explained: Task 3.5's own work in this session added 11 new tests (`orderPaymentReferenceGuard.test.js`'s 10 tests + 1 auto-generated case in the pre-existing `orderJourneyGuards.test.js`), unrelated to Task 3.4. **Zero regressions.**

---

# CI

```
$ gh auth status
You are not logged into any GitHub hosts.
```

**`CI_STATUS_NOT_VERIFIED`** — no authenticated GitHub access in this environment. Per instruction, not guessed. (This is unrelated to and does not affect the local, actually-run test results above, which were executed directly, not sourced from CI.)

---

# ENVIRONMENT VARIABLES

Names only — no values viewed or printed:

| Variable | Used for | Classification |
|---|---|---|
| `SUPABASE_URL` | Constructing the service-role Supabase client | **REQUIRED** (auto-injected by Supabase platform at deploy time — not something to manually configure) |
| `SUPABASE_SERVICE_ROLE_KEY` | Same | **REQUIRED** (auto-injected) |
| `PAYMENT_MOYASAR_WEBHOOK_SECRET` | HMAC signature verification | **REQUIRED** — code fails closed (`500`) if unset; must be manually configured before deploy |
| `PAYMENT_MOYASAR_SECRET_KEY` | Passed to `MoyasarAdapter` constructor | **OPTIONAL for this specific function** — the webhook only calls `adapter.parseWebhook()`, which the adapter's own code comment confirms doesn't need an API key; this variable matters for `createCharge`/`verifyPayment`/`refundPayment`, none of which the webhook calls |

No other environment variable is referenced anywhere in `supabase/functions/payment-webhook/`.

**Configuration status**: cannot be verified without either deploying (forbidden in this task) or a secrets-listing capability that would risk exposing whether specific secrets exist — not attempted. The function's absence from `list_edge_functions` (see EDGE FUNCTION / PRODUCTION DEPLOY READINESS) means there is currently no deployed instance for these variables to be configured against at all.

---

# SECURITY AUDIT

### Authentication
The webhook endpoint is **intentionally public-by-design** — no Supabase Auth/JWT check in the code, because Moyasar (an external server) cannot present a Supabase user JWT. This is standard for payment webhooks. **Important deployment-configuration consequence** (newly confirmed this session, not previously documented as explicitly): all 3 currently-deployed Edge Functions in this project have `verify_jwt: true`. If `payment-webhook` is deployed with the platform-level default (`verify_jwt: true`), **Supabase itself would reject Moyasar's calls before the function code ever runs**, since Moyasar won't send a JWT. This must be explicitly set to `verify_jwt: false` at deploy time — the code has no control over this, it's a deployment-command flag. **Flagged as a deployment-readiness item, not a code defect.**

### Signature verification
Implemented — HMAC-SHA256 via `crypto.subtle.verify`, checked before any payload parsing, checked before touching the database. **Unverified against real Moyasar documentation** (header name `x-moyasar-signature`, hex encoding) — this was already an open item in Task 3.4's original report (L-1/L-2) and remains open; it cannot be closed without either Moyasar's own webhook docs or live sandbox credentials, neither of which this audit obtained (out of scope, per instruction).

### Replay protection
Event-ID-based, via the DB unique constraint on `(provider, event_id)` — not a timestamp/nonce scheme, but sufficient for Moyasar's documented retry model (retries reuse the same event ID).

### Duplicate events
Cannot cause a double-update: the `23505` unique-violation path returns immediately without touching `payment_transactions`. Additionally, even for a *different* event ID referencing an already-terminal transaction, the `TERMINAL` status check prevents regression.

### Tenant isolation
The webhook itself doesn't need restaurant-level tenant checks — it operates on `payment_transactions` looked up by `provider_ref` (a provider-assigned, globally-unique-per-provider identifier), and `payment_transactions.restaurant_id` was already fixed at charge-creation time (Task 3.3), not something the webhook can influence or needs to re-validate.

### Secrets
No hardcoded secret found anywhere in `index.ts` or `handler.js` — both files re-read in full this session; all secret material comes exclusively from `Deno.env.get(...)`.

### Logging
No secret or full payment payload is logged — only short error messages (`console.error`). Verified by reading every `console.*` call site in the file (2 total).

### Error responses
Do not leak internal details — the catch-all handler returns a fixed, generic `{ error: 'Internal error processing webhook' }` string regardless of the actual underlying error; the real error is only sent to server-side logs.

---

# IDEMPOTENCY

Covered in EDGE FUNCTION and SECURITY AUDIT above. Summary: **DB-enforced** via `uq_webhook_provider_event`, not merely application-logic-enforced — even concurrent duplicate deliveries cannot both succeed, because the second `INSERT` will hit the unique constraint regardless of race timing.

---

# DUPLICATE WEBHOOK HANDLING

Explicitly tested (`WEBHOOK-007` in the test suite, re-run and confirmed passing this session) and structurally guaranteed by the DB constraint, not just the test mock. Returns `200 { ok: true, updated: false, reason: 'already_processed' }` — correct per Moyasar's retry-stopping requirement (a non-200 would cause Moyasar to keep retrying).

---

# ERROR HANDLING

Covered above (EDGE FUNCTION, SECURITY AUDIT). Every failure mode identified in the original Task 3.4 test suite maps to a specific, correct HTTP status — re-confirmed by re-reading the full response-code table in the code itself, not by trusting the old report's table.

---

# LOGGING

Covered above (SECURITY AUDIT). No secret or PII logging found.

---

# PRODUCTION DEPLOY READINESS

| Check | Expected | Actual | Status | Risk |
|---|---|---|---|---|
| Code complete | Yes | Confirmed, unchanged since `6b0a4f2` | PASS | — |
| Unit tests | 22/22 | 22/22 (re-run fresh) | PASS | — |
| Full regression | No failures | 487/487 (re-run fresh) | PASS | — |
| Database compatibility | Columns/types/CHECK constraints match | Confirmed against live production catalogs | PASS | — |
| Environment variables identified | All named, none hardcoded | Confirmed (4 vars, 2 auto-injected, 2 manual) | PASS | — |
| Secrets configured in deployed environment | N/A — not deployed | Function absent from `list_edge_functions` | **NOT_VERIFIED** (moot — nothing to configure yet) | Low |
| Auth/signature mechanism present | HMAC verification before processing | Confirmed in code | PASS | — |
| Signature mechanism verified against real Moyasar | Confirmed match | **Not verified** — no sandbox access | **WARNING** | Medium — could reject or accept incorrectly on first real delivery |
| Idempotency / duplicate handling | DB-enforced | Confirmed (constraint + tested) | PASS | — |
| Logging safety | No secrets/PII logged | Confirmed | PASS | — |
| Error handling | No internal leakage | Confirmed | PASS | — |
| CI status | Verified pass | `CI_STATUS_NOT_VERIFIED` (no GH auth) | **NOT_VERIFIED** | Low (local run is authoritative and passed) |
| Deployment configuration (`verify_jwt`) | Must be `false` for a public webhook | Not yet deployed; default posture in this project is `true` for all existing functions | **WARNING** | Medium — deploying with defaults would silently break the webhook (Supabase would 401/403 before the function runs) |
| Task 3.5 schema compatibility | No conflict | Confirmed — zero shared surface | PASS | — |
| Order-status wiring on payment success | N/A for Task 3.4's stated scope | Confirmed absent (by design, per Task 3.4's own original scope) | **INFO**, not a blocker for *this* task | See TASK 3.5 INTEGRATION IMPACT |

**No FAIL. Two WARNINGs (signature-format unverified against real Moyasar; `verify_jwt` deploy flag). Two NOT_VERIFIED items that don't block (CI, pre-deploy secret config — the latter is moot since nothing is deployed yet to configure).**

---

# MOYASAR SANDBOX E2E READINESS

**Not executed — requirements only, as instructed.**

| # | Requirement | Status |
|---|---|---|
| 1 | Moyasar Sandbox account | Not confirmed to exist — open since Task 3.4's original report (OQ-1) |
| 2 | Sandbox API credentials (`PAYMENT_MOYASAR_SECRET_KEY` test key) | Not obtained |
| 3 | Webhook endpoint URL | Would be `https://gpwwnuuicywsvmmhxngs.supabase.co/functions/v1/payment-webhook` once deployed — **not yet deployed**, so this URL does not currently resolve to anything |
| 4 | Webhook secret/signature mechanism confirmed against Moyasar docs | **Not verified** — the code assumes header `x-moyasar-signature`, hex-encoded HMAC-SHA256; must be checked against Moyasar's actual current documentation before relying on it |
| 5 | Test payment method | Would come from Moyasar's own sandbox test-card documentation — not fabricated here |
| 6 | Expected webhook events | Per `MoyasarAdapter`'s `KNOWN_WEBHOOK_TYPES`: `payment_paid`, `payment_failed`, `payment_authorized`, `payment_expired` — **assumed** to be Moyasar's real event names; not independently confirmed against Moyasar docs in this audit |
| 7 | Expected `payment_transactions` transitions | `initiated` → `pending`/`succeeded`/`failed`/`cancelled` (per the mapping logic, verified internally consistent this session) |
| 8 | Expected `payment_webhook_events` persistence | One row per `(provider, event_id)`, `processed_at` set on completion, `process_error` set on business-logic failure (not on transport/signature failure, which never reaches the insert) |
| 9 | Retry behavior | Design correctly returns `200` for already-processed/duplicate events specifically to stop Moyasar retries — confirmed in code, not independently confirmed against real Moyasar retry behavior |
| 10 | Duplicate webhook test | Covered by unit test `WEBHOOK-007` (mocked); a **live** duplicate-delivery test would require actual sandbox access, not performed here |

---

# TASK 3.5 INTEGRATION IMPACT

Directly and specifically investigated, per your instruction:

- **Does the webhook need `orders.payment_transaction_id`?** No — confirmed via full-file re-read and `grep`, zero references.
- **Does it need `create_order`?** No — same confirmation.
- **Does it update `payment_transactions`?** Yes — this is its core function, and this table was **not modified** by Task 3.5's migration (Task 3.5 only touched `orders`), so nothing here changed as a result of Task 3.5.
- **Could it cause state inconsistency?** Not by itself — it cannot corrupt or conflict with anything Task 3.5 added, since it never touches `orders`. **However**, this reveals a genuine functional gap in the overall payment flow (not a Task 3.4 defect, and not something this audit was asked to fix): when a webhook marks a `payment_transactions` row `succeeded`, nothing in the current codebase automatically reflects that back onto the linked `orders` row (via `orders.payment_transaction_id`) — no order-status trigger, no application code path does this yet. This is consistent with Task 3.4's own original report explicitly scoping out "Payment UI" and (at the time) "Task 3.5" as future work, and with Task 3.5's own reports never claiming to wire this either. **This is not a blocker for Task 3.4's deployment readiness** (the webhook does exactly what it was scoped to do: record payment state), but it is worth your awareness as a real, currently-open gap before any live payment flow is considered complete end-to-end.
- **Does it need any code modification before deployment because of Task 3.5?** **No.** No incompatible dependency was found. Nothing was modified in this audit.

---

# BLOCKERS

**None identified that prevent deployment on purely technical/code grounds.** The two open items below are prerequisites for a *safe*, *correct* live deployment, not code defects — listed as WARNINGS, not BLOCKERS, per the strict definitions in this task's own instructions (a blocker would be: unknown required secret situation that can't be resolved, missing signature verification, missing duplicate protection, incompatible database contract, or failing critical tests — **none of these apply**).

---

# WARNINGS

- **W-1**: HMAC signature header name/encoding (`x-moyasar-signature`, hex) is implemented but not verified against Moyasar's actual current documentation. Deploying without confirming this risks either rejecting all real webhooks (if the format is wrong) or, worse, silently accepting unverified requests if a future code change weakens the check without this being caught.
- **W-2**: The project's existing deployed functions all use `verify_jwt: true`; deploying `payment-webhook` without explicitly overriding this to `false` would make it entirely non-functional for real Moyasar traffic (rejected before the code runs). This is a one-flag deployment-command detail, not a code change, but easy to miss.
- **W-3**: Moyasar sandbox account/credentials do not exist yet (per Task 3.4's own original open question, still open) — blocks any live E2E test regardless of deployment readiness.
- **W-4** (informational, not a Task 3.4 defect): no automatic `orders` status update exists yet when a payment succeeds — see TASK 3.5 INTEGRATION IMPACT.
- **W-5** (carried forward, unrelated): staging's `orders_insert_public`/`orders_cancel_public` remain open — unrelated to Task 3.4, still pending your separate decision.

---

# DEPLOYMENT PLAN

**Presented for a future, separately-approved task. Nothing below was executed.**

1. Resolve W-3 (obtain Moyasar sandbox account + credentials) and W-1 (confirm signature format against Moyasar docs) first — these determine whether the code needs any adjustment before deploy.
2. Deploy `payment-webhook` with `verify_jwt: false` explicitly set (addressing W-2).
3. Configure `PAYMENT_MOYASAR_WEBHOOK_SECRET` (and `PAYMENT_MOYASAR_SECRET_KEY` if other payment functions will share the same Edge Function project) as Edge Function secrets — never in code, never logged.
4. Register the webhook URL in the Moyasar sandbox dashboard.
5. Send a sandbox test event and confirm: signature accepted, `payment_webhook_events` row created, correct `payment_transactions` status transition, correct HTTP response code.
6. Resend the same test event and confirm duplicate handling (200, `already_processed`, no double-update).
7. Only after sandbox confidence is established, consider go-live sequencing (separate decision, separate task).

---

# E2E PLAN

Already covered under MOYASAR SANDBOX E2E READINESS — the 10-point requirement list is the E2E plan's prerequisite checklist. No E2E execution plan beyond "obtain sandbox access, then execute the 10 points" is proposed here, since execution details depend on credentials this audit doesn't have.

---

# ROLLBACK PLAN

Not applicable in the traditional sense — nothing was deployed or changed in this task. If a future deployment needs to be rolled back: Supabase Edge Functions support redeploying a prior version or deleting the function entirely; no database rollback is needed for a deploy-only change, since the webhook doesn't alter schema (Task 3.5's migration, already applied, is a separate concern with its own already-documented rollback plan).

---

# GIT STATUS

```
Branch: phase-3/task-3-4-webhook-edge-function (unchanged)
HEAD:   163ac24 (unchanged — no commit made)
Modified tracked files: none
New untracked file from this task: reports/TASK_3_4_PRODUCTION_READINESS_AUDIT.md
```

No commit, push, deploy, or merge was performed.

---

# REPORT FILE

`reports/TASK_3_4_PRODUCTION_READINESS_AUDIT.md`

# DOWNLOAD COPY

`/sdcard/Download/TASK_3_4_PRODUCTION_READINESS_AUDIT.md` (copied and verified after this report was written — see final summary).

---

## FINAL VERDICT

**TASK_3_4_READY_WITH_WARNINGS**

Code, tests, and database contract are all confirmed correct and unchanged through fresh, direct verification — not carried over from memory. No blocker exists on any of the strict disqualifying criteria (secret situation is understood, not unknown; signature verification exists; duplicate protection exists and is DB-enforced; database contract is fully compatible; all critical tests pass). The remaining warnings are genuine prerequisites — real Moyasar documentation confirmation and sandbox credentials — that must be resolved before deployment is *safe*, not evidence that the code itself has a defect.

---

*Report generated 2026-08-26. Read-only audit only. No Edge Function was deployed. No Supabase configuration, Production database, or Staging was modified. No Moyasar webhook was created or configured. No real payment credential was used. No commit, push, or merge was performed.*
