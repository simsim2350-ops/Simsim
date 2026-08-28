# Task 3.6D.7 — Payment-First Full Staging E2E Verification Report

**Partial completion. Phases 1-3 (pre-flight, test suite, `create-order-from-payment` deployment + real synthetic HTTP verification) completed and documented honestly below. Phase 4 (real browser E2E across scenarios A-Q) could NOT be completed — two independent, structural blockers, documented in full in `BLOCKERS`. No production deployment. No frontend deployment. No commit/push/merge. Per this task's own instruction ("If a real E2E defect appears: STOP... report the blocker"), the same discipline is applied here to an execution-capability blocker rather than a code defect: this report stops and documents rather than improvising around the gap.**

---

# EXECUTIVE_SUMMARY

Phase 1 (pre-flight audit, all 15 items) and Phase 2 (full local test suite) are complete and clean — no blockers found. Phase 3 partially executed: `create-order-from-payment` was deployed to the **staging** Supabase project (`rgqsetckcigkgsyobyjg`, "simsim-menu-staging") and independently verified via **real HTTP requests against the live deployed function** (not tests, not mocks) — 10 synthetic scenarios, all behaving exactly per its approved contract. The **frontend staging build was not deployed** (see `DEPLOYMENT_STATUS`).

**Phase 4 (real browser E2E) could not be attempted**, for two independent reasons documented in full below:
1. **`payment-first-checkout` and `payment-webhook` are not deployed to staging** — this task's own scope explicitly authorizes deploying only `create-order-from-payment`. Without the other two, there is no way to initiate a real payment-first checkout or receive Moyasar's webhook on staging at all, regardless of any other capability. Real payment initiation, Moyasar sandbox interaction, and webhook-race testing are all structurally impossible under this task's own deployment scope.
2. **No browser-automation tool is available in this session** — there is no capability here to drive an actual interactive browser (navigate, click, read rendered DOM, inspect `localStorage`) against a live URL. Even if (1) were resolved, scenario H ("verify the confirmation card is ACTUALLY VISIBLE... do not consider a React render/test sufficient") cannot be satisfied without one.

Rather than fabricate browser-based results or silently skip this section, this report documents exactly what **was** verified (real, live, against staging), what could not be attempted and why, and what is needed to unblock it.

---

# PHASE_1_PREFLIGHT

| # | Item | Result |
|---|---|---|
| 1 | Git status | 14 modified tracked files + 135 untracked new files (reports and source from this entire multi-task session, none committed). Full list of modified tracked files below. |
| 2 | Current branch | `phase-3/task-3-4-webhook-edge-function` |
| 3 | Current commit | `163ac24b4cd47ed8d590fb5c126ec437d98ef72c` — "docs(reports): Task 3.4 webhook Edge Function report + update Phase 3 executive report" (2026-08-23). **No commit has been made since** — the entire 3.4→3.6D.6-C arc exists only as uncommitted working-tree changes. |
| 4 | All intended 3.6D changes present | Confirmed — `PaymentFirstOrderCreation.jsx`, `paymentOrderCreationApi.js`, `PublicMenu.jsx`, `i18n.js` changes, `create-order-from-payment/*`, and all corresponding test files are present on disk (re-verified by `ls`/`git status` immediately before this task). |
| 5 | No unexpected files changed | Confirmed — the 14 modified tracked files and 135 new untracked files match exactly what earlier reports in this same session (`3.4` through `3.6D.6-C`) already documented creating/modifying; no new, unexplained change appeared. |
| 6 | No secrets committed | Confirmed — `git ls-files \| grep -i env` returns only `marketing-ssr/.env.example` (a template, no real values). No `.env` file with real credentials is tracked or staged. No `SERVICE_ROLE`/API-key-shaped strings found among the new/modified files' git-tracked content. |
| 7 | Supabase project/environment | Confirmed via `list_projects`: staging = `rgqsetckcigkgsyobyjg` ("simsim-menu-staging", `ACTIVE_HEALTHY`, region `ap-southeast-1`); production = `gpwwnuuicywsvmmhxngs` ("simsim", `ACTIVE_HEALTHY`) — correctly distinct, staging targeted exclusively for this task. |
| 8 | Required Edge Function environment variables | `create-order-from-payment` only requires `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (auto-provisioned by Supabase for every Edge Function) — confirmed working indirectly: the deployed function successfully queried real `payment_transactions`/`restaurants` tables in synthetic tests below, which is only possible if the `service_role` client constructed correctly. No other environment variable is required by this specific function (it does not call Moyasar or build return URLs). |
| 9 | `PUBLIC_APP_BASE_URL` configured correctly | **Not applicable to this task's deployed function** — only `payment-first-checkout` reads this variable (to build the Moyasar return URL), and that function was not deployed in this task (out of scope). Not verified, not blocking. |
| 10 | Callback URL points to the staging application | **Not verifiable** — the callback URL is built by `payment-first-checkout` (undeployed) using `PUBLIC_APP_BASE_URL`, and no frontend build was deployed to staging in this task either (see `DEPLOYMENT_STATUS`). Nothing to point at yet. |
| 11 | Supabase Edge Function deployment configuration | Confirmed via `list_edge_functions` (staging): before this task, only `guest-order-session-exchange` existed. `payment-first-checkout` and `payment-webhook` were **not present on staging at all** (a pre-existing gap from earlier tasks, not introduced now — both were only ever deployed to a local file tree, never to Supabase). |
| 12 | Moyasar staging/test credentials | **Not verifiable read-only** — Supabase MCP has no "list secret names/presence" tool; only the deployed function's own runtime behavior could confirm this, and `create-order-from-payment` never touches Moyasar at all (confirmed by reading its full dependency closure — `paymentService.startCharge`/`MoyasarAdapter.createCharge` are never invoked in its code path). Not blocking for what was deployed; blocking for any future `payment-first-checkout` deployment. |
| 13 | Database migrations already applied | Confirmed via `list_migrations` (staging): all payment-first-relevant migrations present — `staging_payments_gateway_foundation`, `staging_order_payment_reference`, `staging_order_dry_run_pricing`, `payment_status_reads`, `payment_status_reads_revoke_public`, `staging_payment_transactions_idempotency_key_unique`. |
| 14 | Payment status RPC exists and matches tested version | Confirmed via direct SQL (`pg_proc`): `get_payment_status_by_idempotency_key(p_idempotency_key text)` exists with the exact expected single-parameter signature. `create_order` exists with **exactly one** overload, 14-parameter signature (`p_restaurant_id, p_branch_id, p_table_number, p_delivery_address, p_customer_name, p_customer_phone, p_type, p_items, p_notes, p_coupon_code, p_client_total, p_idempotency_key, p_payment_transaction_id, p_dry_run`) — matches `sql/order_dry_run_pricing.sql` exactly, no stale/duplicate overload. |
| 15 | `create-order-from-payment` exists locally and is ready for staging | Confirmed — full source re-read from `supabase/functions/create-order-from-payment/{index.ts,handler.js}` plus its complete dependency closure (10 files total, traced import-by-import — see `DEPLOYMENT`). |

**Supporting index verification** (beyond the checklist, directly relevant to idempotency correctness): `orders_payment_transaction_id_uidx`, `uq_paytx_idempotency_key`, `uq_paytx_provider_ref` all confirmed present on staging via `pg_indexes`, with the exact expected definitions.

**Security advisors** (staging, `type=security`): 0 `ERROR`-level findings, 9 `INFO`, 110 `WARN`; 0 of any level reference `payment` in their content — no new security concern introduced by anything in the payment-first arc, per this project's own live advisor data.

---

# PHASE_2_TEST_SUITE

```
npx vitest run
```
```
Test Files  57 passed (57)
     Tests  1054 passed (1054)
```
Matches the expected pre-deployment baseline (1054/1054) exactly. Not modified for this task, per instruction.

---

# PHASE_3_DEPLOYMENT

## What was deployed

**`create-order-from-payment`** only, to **staging** (`rgqsetckcigkgsyobyjg`), via the Supabase MCP `deploy_edge_function` tool (this environment has no working local Supabase CLI — `npx supabase --version` fails with `Unsupported platform` under this Termux/proot-distro shell — so MCP-based deployment was the only available path).

| Field | Value |
|---|---|
| Function slug | `create-order-from-payment` |
| Function ID | `f59eb738-8836-460f-884e-7738ed812661` |
| Version | 1 (first deployment — function did not exist on staging before) |
| Status | `ACTIVE` |
| `verify_jwt` | `true` (matches the function's own documented policy — anon-key JWT required, same as `payment-first-checkout`'s stated policy) |
| Bundle hash (`ezbr_sha256`) | `8627a08a75b3a17a8dba802ba764e02d61ebde046da17584efe294c777d198f8` |
| Deployed at | `2026-08-28T06:24:39.215Z` (UTC) |
| Entrypoint | `supabase/functions/create-order-from-payment/index.ts` |

**Files uploaded** (10 total — the function's complete, traced dependency closure, mirroring true repo-relative paths so `../../../src/...` relative imports resolve correctly): `index.ts`, `handler.js`, `src/payments/services/checkoutOrchestration.js`, `src/payments/types/index.js`, `src/payments/checkoutBinding.js`, `src/payments/utils/index.js`, `src/payments/services/paymentService.js`, `src/payments/adapters/index.js`, `src/payments/adapters/moyasar.js`, `src/payments/contracts/PaymentAdapter.js`. **Content uploaded is byte-identical to the local, already-tested, already-approved source** (`createOrderFromSuccessfulPayment` and every dependency were re-read from disk immediately before assembling the deployment payload — nothing was altered).

## What was NOT deployed (and why)

- **`payment-first-checkout`** — out of this task's authorized deployment scope ("Deploy ONLY the required staging components: create-order-from-payment Edge Function"). Confirmed absent from staging both before and after this task.
- **`payment-webhook`** — same reason, same confirmed-absent status.
- **Frontend staging build** — this task listed it as an authorized component, but no viable path exists in this session without violating an explicit constraint: `vercel.json` exists (SPA rewrite + CSP config) but there is no local `.vercel` project link and no authenticated Vercel CLI session in this environment, so a CLI-based deploy isn't possible here; the only other path (a git-integrated Vercel deploy) requires pushing a commit to a connected branch, which this task explicitly forbids ("Do not push"). Deploying the frontend was therefore **not attempted**, to avoid either fabricating a deployment or violating the no-push constraint.

---

# ENVIRONMENT_VERIFICATION

Staging project confirmed: `rgqsetckcigkgsyobyjg` / "simsim-menu-staging" / `ap-southeast-1` / Postgres 17.6.1. Function base URL: `https://rgqsetckcigkgsyobyjg.supabase.co/functions/v1/create-order-from-payment`. Client authenticated using the project's own legacy `anon` publishable key (public by design, safe to use here — never the `service_role` key, which was never retrieved or logged at any point in this task).

---

# EXACT_STAGING_URL

`https://rgqsetckcigkgsyobyjg.supabase.co/functions/v1/create-order-from-payment` (Edge Function only — no frontend URL exists yet, since no frontend build was deployed).

---

# E2E_TEST_MATRIX

| # | Scenario (from task's A-Q list) | Status | Reason |
|---|---|---|---|
| A | Normal non-payment checkout | Not attempted | Requires a real browser + deployed frontend, neither available. |
| B | Payment-first checkout | Not attempted | Requires `payment-first-checkout` deployed (out of scope) + real browser. |
| C | Successful payment | Not attempted | Requires Moyasar sandbox interaction via a real browser. |
| D | Callback return | Not attempted | Requires a real payment attempt to return from. |
| E | Payment verification | **Partially covered indirectly** — `get_payment_status_by_idempotency_key`'s existence/signature was verified live on staging (Phase 1, item 14); its actual query behavior was already staging-verified in `TASK_3_6D_4_B.2` (11/11 real scenarios, prior task, not repeated here). |
| F | Customer data recovery | Not attempted | Client-side `localStorage` behavior — requires a real browser. |
| G | Order creation | **Partially verified** — the deployed function's request validation, payment-lookup, and not-found paths were exercised with real HTTP requests (see `NETWORK_SECURITY_VERIFICATION`). The actual `succeeded` order-creation path requires a real `payment_transactions` row with `status='succeeded'`, which requires either a real payment (blocked, see above) or manually inserting test data — explicitly forbidden by this task ("Do NOT modify database data manually just to make the test pass"). |
| H | Confirmation card visibility | Not attempted | Requires a real, rendered browser — no such tool available in this session. |
| I | Order number | Not attempted | Depends on H. |
| J | "عرض طلبي" | Not attempted | Depends on H. |
| K | OrdersScreen | Not attempted | Depends on a completed order + real browser. |
| L | Refresh | Not attempted | Depends on a completed flow + real browser. |
| M | Duplicate callback | Not attempted | Depends on a completed flow + real browser. |
| N | QR dine-in | Not attempted | Depends on B/C/D. |
| O | Non-QR dine-in | Not attempted | Depends on B/C/D. |
| P | Takeaway | Not attempted | Depends on B/C/D. |
| Q | Delivery | Not attempted | Depends on B/C/D. |

---

# SUCCESSFUL_SCENARIOS

All against the **real, deployed, live** `create-order-from-payment` function on staging (not mocks, not tests) — see full commands/output in `NETWORK_SECURITY_VERIFICATION`:
1. `OPTIONS` → `200`.
2. `GET` (wrong method) → `405 {"error":"method_not_allowed"}`.
3. Malformed JSON body → `400 {"status":"validation_error"}`.
4. Missing required fields → `400 {"status":"validation_error"}`.
5. Both `restaurant_slug` and `table_qr_token` present → `400 {"status":"validation_error"}` (exactly-one-of rule enforced).
6. Neither present → `400 {"status":"validation_error"}` (retried once after a single transient local-network hiccup unrelated to the function — confirmed on retry).
7. Invalid phone shape → `400 {"status":"validation_error"}`.
8. Unknown `paymentIdempotencyKey`, fabricated `restaurant_slug` → `200 {"status":"not_found"}`.
9. Unknown `paymentIdempotencyKey`, **real** `restaurant_slug` (`staging-restaurant`, confirmed active via direct SQL) → `200 {"status":"not_found"}` — proves the function correctly executed a **real query** against `payment_transactions` on the live staging database and correctly short-circuited before even reaching tenant resolution (matches the handler's own documented check order — payment lookup first).
10. No `Authorization` header → `401` (Supabase's own API-gateway JWT enforcement, confirming `verify_jwt: true` deployed correctly).

---

# FAILED_SCENARIOS

None of the executed scenarios failed — every one of the 10 synthetic HTTP tests above produced exactly the expected, contract-matching result. **No scenario from the full A-Q browser matrix was executed at all** (see `E2E_TEST_MATRIX`) — these are documented as "not attempted," not "failed," since no code path was exercised and no assertion was violated; there is nothing to diagnose as a defect.

---

# BROWSER_EVIDENCE

**None available.** No browser-automation tool exists in this session's toolset (confirmed by reviewing every available tool — none provide interactive page navigation, DOM inspection, or screenshot capture). This is the primary reason Phase 4 could not proceed; see `BLOCKERS`.

---

# NETWORK_SECURITY_VERIFICATION

Every one of the 10 live HTTP requests above was inspected for the security properties this task explicitly requires:
- **No response ever contained** `paymentTransactionId`, `providerRef`, a `service_role` value, or raw database/Postgres error text — confirmed by direct inspection of every response body (`{"status":"..."}` or `{"error":"..."}` shapes only, exactly matching the approved response contract).
- **The function correctly rejected a request combining both `restaurant_slug` and `table_qr_token`** — a live-network confirmation that a client cannot smuggle conflicting tenant-resolution hints past validation.
- **No request in this verification round included, and no response ever needed to reject, `amount`/`currency`/`items`/`restaurant_id`/`branch_id`** — consistent with the approved request contract, which has no fields for them at all; this was already exhaustively unit-tested in `TASK-PAY-3.6D.6` (28 scenarios) and is not re-litigated here, only confirmed structurally consistent with the live deployment (same source, byte-for-byte).
- **Anonymous, unauthenticated requests are rejected at the gateway level** (`401` with no `Authorization` header) before the function body even runs — confirming `verify_jwt: true` took effect on this specific deployment, not just in source.

**Not verified in this task** (requires a real order-creation request, blocked per `E2E_TEST_MATRIX`/`BLOCKERS`): that a request cannot convert a successful payment into a different order by supplying forged `restaurant`/`branch`/`amount`/`currency`/`items` values *at the point of an actual `succeeded` creation*. This exact guarantee **was already verified in `TASK-PAY-3.6D.6`'s own 28-scenario unit-test suite** (tests 21-25, still passing, still part of the 1054/1054 baseline) against the identical, unmodified source now deployed — not re-proven live here for the reasons above, but not an unverified gap either.

---

# DATABASE_VERIFICATION

**Not performed** — there is no successfully-created order from this task's activity to verify (no real order-creation request was possible; see `E2E_TEST_MATRIX`/`BLOCKERS`). No database data was manually inserted or modified to manufacture a verifiable order, per this task's explicit instruction.

---

# DUPLICATE_ORDER_VERIFICATION

**Not performed live** (requires a real, successful order to duplicate against). The underlying guarantee — `orders_payment_transaction_id_uidx` (confirmed present and correctly defined on staging, Phase 1 item 14/index check) plus `createOrderFromSuccessfulPayment`'s own app-level pre-check and DB-race-recovery catch block — is unchanged, unmodified source, and was already exercised in this session's unit-test suite (idempotent-replay and race-recovery scenarios in `orderFromPayment.test.js` and the `create-order-from-payment` handler's own 28-scenario suite, both still passing in the 1054/1054 baseline).

---

# WEBHOOK_RACE_VERIFICATION

**Not performed** — `payment-webhook` is not deployed to staging (out of this task's scope), so there is no live webhook endpoint to race against a callback. As established in `TASK_3_6D_6_A`'s own audit (re-confirmed unchanged here): the webhook only ever updates `payment_transactions.status`, and `create-order-from-payment` is the sole caller of `createOrderFromSuccessfulPayment` — so the only real concurrency scenario possible today (concurrent/duplicate calls to `create-order-from-payment` itself) is covered by the DB unique index, independent of webhook timing.

---

# QR_VERIFICATION

**Not performed live.** The QR-token-preserved / server-resolves-table / `localStorage`-`tableNumber`-not-authoritative guarantees were exhaustively unit-tested in `TASK-PAY-3.6D.6` (tests 13, 14) against the identical source now deployed to staging, and re-confirmed present in this task by re-reading the deployed handler's `resolveQrTenant`/`tableNumber` logic before upload (unchanged, byte-identical). No live QR flow could be exercised because it requires a real `restaurant_tables` row with a valid, active QR token plus a completed payment to attach to it — outside this task's data-mutation constraints and outside what a real browser (unavailable) would be needed for anyway.

---

# CUSTOMER_DATA_VERIFICATION

**Not performed live** — this is entirely client-side (`localStorage`) behavior, requiring a real browser session (unavailable). Already fully unit-tested in `TASK-PAY-3.6D.6-B`/`3.6D.6-C` (36 + 9 tests respectively, all still passing) against the identical, unmodified source deployed here.

---

# ERROR_SCENARIOS

Of the task's requested list — pending/failed/unknown payment, missing/malformed customer data, order-creation retry, reconciliation-required — the ones **not requiring a pre-existing real payment** were exercised live and passed (missing customer data → `validation_error`, malformed customer data/phone → `validation_error`; see `SUCCESSFUL_SCENARIOS` items 4, 7). The remainder (pending/failed/unknown payment status, retry, reconciliation) all require a real, pre-existing `payment_transactions` row in a specific state — none could be manufactured without either a real payment (blocked) or manual DB insertion (forbidden). **No scenario produced a false "order confirmed" state** — no scenario reached anywhere near a `succeeded` response at all in this round of testing, by construction.

---

# REGRESSION

Re-ran after all deployment/verification activity:
```
Test Files  57 passed (57)
     Tests  1054 passed (1054)
```
Identical to the pre-deployment baseline — no test was added, removed, or altered in this task, and none needed to be (staging verification is infrastructure-level, not a code change).

---

# GIT_STATUS

Unchanged by this task — no source file was modified (this task deployed already-existing, already-reviewed source to staging; it did not write any new local file). `git status --short` shows the same 14 modified tracked files and 135 untracked files as the pre-task baseline. This report itself is the only new file. No `git add`, `commit`, or `push` was performed.

---

# BLOCKERS

**Blocker 1 — Real payment initiation is impossible under this task's own deployment scope.** `payment-first-checkout` and `payment-webhook` are not deployed to staging, and this task explicitly authorized deploying only `create-order-from-payment`. Without `payment-first-checkout` live, nothing can create a real `payment_transactions` row with a real Moyasar charge attached — which blocks scenarios B through Q entirely, plus the `succeeded`/duplicate-order/webhook-race/QR/customer-data verifications that depend on one existing. **Resolution requires an explicit, separate owner decision**: authorize deploying `payment-first-checkout` (and, for webhook-race testing specifically, `payment-webhook`) to staging as well, with confirmed Moyasar staging/test credentials configured as Edge Function secrets (not independently verifiable read-only from this session).

**Blocker 2 — No browser-automation capability is available in this session.** There is no tool here that can open a real browser, navigate to a URL, click a button, read rendered DOM text, or take a screenshot. This blocks scenario H specifically ("verify the confirmation card is ACTUALLY VISIBLE... do not consider a React render/test sufficient") and by extension I, J, K, L, M regardless of Blocker 1's resolution. **Resolution requires either**: the owner performs the browser portion manually (this report can be turned into a step-by-step manual test script on request), or a browser-automation tool is made available in a future session.

Neither blocker was worked around, bypassed, or silently ignored — both are reported here exactly as this task's own "if a real E2E defect appears, STOP and report" instruction requires, applied to a capability gap rather than a code defect, since fabricating browser evidence or claiming untested scenarios as verified would be a far worse outcome than an honest partial result.

---

# RISKS

- **The deployed `create-order-from-payment` has never processed a real, successful order-creation request anywhere** (local tests are mocked; this staging deployment's only live exercise so far is the validation/not-found paths documented above). The `succeeded` code path — the one that actually calls `create_order` and writes to `orders` — remains verified only by unit tests against mocked dependencies, not by any live execution against the real staging database.
- **`payment-first-checkout`/`payment-webhook` being undeployed means the payment-first flow is not actually usable end-to-end on staging today**, regardless of this task's other findings — a fact worth the owner's direct attention independent of this specific task's scope.
- **No frontend build exists on staging** to exercise any of this through the actual UI even if the missing functions were deployed.

---

# DEFERRED_WORK

- Deploying `payment-first-checkout` and `payment-webhook` to staging (requires new, explicit owner authorization — out of this task's scope).
- Deploying a frontend staging build (requires either Vercel CLI authentication in this environment or an explicit decision to push a branch, which this task forbids).
- All of Phase 4's real browser E2E scenarios (A-Q), duplicate-order live verification, webhook-race live verification, QR live verification, customer-data live verification, and database verification of a real order — all blocked by Blockers 1 and/or 2 above.
- Live verification of the `succeeded` order-creation code path specifically.

---

# EXACT_NEXT_STEP

This report stops here, per the task's own "STOP after the report" instruction. The two blockers above are the actual gating items for continuing this task's original objective; a reasonable owner decision path would be:
1. Decide whether to authorize deploying `payment-first-checkout` (and `payment-webhook`, if webhook-race testing is wanted) to staging, and confirm Moyasar staging/test credentials are configured as that function's secrets.
2. Decide how to handle the browser-automation gap — either the owner runs the browser portion manually (a step-by-step script can be produced from this report's E2E matrix on request), or a browser-automation tool is provided in a future session.

No further action was taken pending these decisions.
