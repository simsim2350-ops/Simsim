# Task 3.6D-E — Payment-First Checkout Edge Function Implementation

**Implements the approved TASK_3_6D_C spec exactly, plus one owner-approved deviation from the spec's own assumption (see IMPLEMENTATION).**

---

# EXECUTIVE_SUMMARY

Created `supabase/functions/payment-first-checkout/` (`handler.js`, `index.ts`, `handler.test.js`) implementing the full 3.6D-C specification: QR/slug tenant resolution, server-only `returnUrl` construction, always-HTTP-200 business outcomes, authoritative-total re-read, and the deferred-but-documented rate-limiting/idempotency-scoping items.

**One real blocker was hit and resolved before any handler code was written**, via an explicit owner decision (not a unilateral choice): 3.6D-C's Phase 9 assumed `initiatePaymentFirstCheckout` could be imported directly into the Edge Function, the same way `MoyasarAdapter` already is in `payment-webhook`. Investigation showed `checkoutOrchestration.js` → `paymentService.js` → `adapters`/`utils`/`types` used bare, extensionless relative imports (`'../adapters'`, `'../utils'`, `'./paymentService'`) that Deno cannot resolve — the same constraint `payment-webhook/handler.js` already documents for `paymentService.js`, but here spanning the entire payment-first orchestration chain, not one isolated file. Duplicating that chain's logic (dry-run pricing, checkout snapshot/fingerprint binding, `startCharge`'s atomic idempotency/Moyasar-charge logic) inline would have meant re-deriving a large, already-hardened body of business logic a second time, with real risk of drift. This was presented to the owner as a 3-way choice; **the owner selected "add explicit `.js` extensions"** — a minimal, mechanical, zero-behavior-change edit to 5 import lines across 2 existing files (`checkoutOrchestration.js`, `paymentService.js`) plus 1 more discovered transitively (`utils/index.js`). Verified zero behavior change: 751/751 pre-existing tests passed unchanged immediately after the edit, before any new code was written.

The Edge Function itself required no other deviation from the approved spec. 812/812 tests pass (751 baseline + 61 new). Static security review found no `service_role` exposure and no new frontend coupling.

---

# IMPLEMENTATION

**New files** (exactly as required, Phase 25):
- `supabase/functions/payment-first-checkout/handler.js` — DI-based (`buildHandler({ db, orchestrate, publicAppBaseUrl })`), Deno-free, testable.
- `supabase/functions/payment-first-checkout/index.ts` — Deno entry point: env vars, `service_role` client, `Deno.serve`.
- `supabase/functions/payment-first-checkout/handler.test.js` — 61 tests (49 numbered + 6 security-focused, some split into sub-cases), colocated with the function per the task's own explicit file list (not `tests/unit/`, unlike `payment-webhook`'s test — the task named this path directly, so it was followed literally over precedent).

**Pre-existing files touched (owner-approved, see EXECUTIVE_SUMMARY)** — import-extension-only, zero logic change:
- `src/payments/services/checkoutOrchestration.js` — 4 import lines: `'./paymentService'` → `'./paymentService.js'`, `'../checkoutBinding'` → `'../checkoutBinding.js'`, `'../utils'` → `'../utils/index.js'`, `'../types'` → `'../types/index.js'`. (Untracked/new file this session — no `git diff` entry, but content changed.)
- `src/payments/services/paymentService.js` — 4 import lines: `'../adapters'` → `'../adapters/index.js'`, `'../utils'` → `'../utils/index.js'`, `'../types'` → `'../types/index.js'`, `'./checkoutOrchestration'` → `'./checkoutOrchestration.js'`.
- `src/payments/utils/index.js` — 1 import line: `'../types'` → `'../types/index.js'`.

No other existing file was modified. `payment-webhook`, `paymentService.refund()`, the frontend, and the database were not touched.

---

# REQUEST_CONTRACT

Implemented exactly per spec: QR path (`table_qr_token` required, UUID-shaped) XOR non-QR path (`restaurant_slug` + `branch_id` required); `type`, `customer_phone`, `items` always required; `table_number`/`delivery_address` conditional on `type`; `customer_name`/`notes`/`coupon_code`/`clientTotal`/`paymentIdempotencyKey` optional. `restaurant_id`, `table_id`, `currency`, `returnUrl`, `providerRef` are never read from the request body at all — confirmed by SEC-01 through SEC-06.

---

# RESPONSE_CONTRACT

Implemented exactly per spec's per-status body shapes. `providerRef` and `paymentTransactionId` are never included in any HTTP response (PFCX-33, PFCX-34).

---

# QR_TENANT

Implemented as 3 sequential read-only queries (`restaurant_tables` → `restaurants` → `branches`), replicating `create_order_from_table_qr`'s exact live SQL criteria verbatim (confirmed against `sql/order_idempotency.sql`, not the superseded 7-arg version in `sql/table_qr_system.sql`): `qr_token`/`qr_enabled=true`/`status='active'` on the table; `is_active=true`/`platform_suspended=false` on the restaurant; `branch.restaurant_id` integrity check + `is_active=true`/`is_paused=false` on the branch. `create_order_from_table_qr` itself was not modified or called. The resolved `table_number` is always used server-side — a client-supplied `table_number` in a QR request is silently ignored (PFCX-20, SEC-07). One necessary elaboration beyond the literal SQL: the restaurant query also reads `slug` (not selected by the original function), because it is required to construct `returnUrl` (RETURN_URL below) — a read-only addition, not a behavior change.

---

# NON_QR_TENANT

`restaurant_id` resolved from `restaurant_slug` via `is_active=true`/`platform_suspended=false`; `branch_id` passed through from the client unchecked at the Edge Function layer, exactly as spec required, relying on `create_order`'s own existing dry-run validation as the real authority (PFCX-13 through PFCX-15).

---

# AUTHENTICATION

Default Supabase gateway JWT verification — no `verify_jwt: false` anywhere in this function's configuration (no `config.toml` override was added; the project has none today, so the platform default applies, same as every other function except `payment-webhook`'s explicit exception). `supabase.functions.invoke()` with the anon key satisfies this from the browser. No customer login, no custom auth scheme.

---

# CORS

`Access-Control-Allow-Origin: *`, headers `authorization, x-client-info, apikey, content-type`, `OPTIONS` → 200 — identical convention to `create-platform-admin` and `payment-webhook` (PFCX-01).

---

# RETURN_URL

Built server-side only, from `PUBLIC_APP_BASE_URL` (new Deno env var, not yet set in any environment — see BLOCKERS) + the server-resolved restaurant slug + `payment_callback=<paymentIdempotencyKey>` + (QR only) `&t=<table_qr_token>`. Any client-supplied `returnUrl` field is never read (PFCX-37, PFCX-38, PFCX-39, PFCX-40, SEC-05).

One design clarification made during implementation, not present verbatim in the spec text: `initiatePaymentFirstCheckout`'s `input.returnUrl` is the URL **sent to Moyasar** (consumed by `startCharge` → `MoyasarAdapter.createCharge` → `callback_url`), used to tell Moyasar where to send the customer back *after* completing payment. It is distinct from `response.redirectUrl`, which `initiatePaymentFirstCheckout` already returns on success — Moyasar's own hosted payment-page URL, i.e. the value the response contract's `redirectUrl` field is required to carry (the browser's *next* hop, not the *return* hop). The handler builds the server-side `returnUrl` and passes it into `orchestrationInput.returnUrl` *before* calling `orchestrate()`, then passes `response.redirectUrl` straight through, unmodified, as the response's `redirectUrl` field. This required resolving `paymentIdempotencyKey` in the handler itself, before calling `orchestrate()` (see IDEMPOTENCY below), since `returnUrl` needs to embed it.

---

# AUTHORITATIVE_TOTAL

On `succeeded`, the handler re-reads `payment_transactions.amount`/`currency` fresh from the database using `response.paymentTransactionId` (kept server-side only) — never `clientTotal`, never a stale `dryRun.total`, never anything from the orchestration response itself (PFCX-35, PFCX-36). If the re-read fails or returns no row, the response degrades safely to `requires_reconciliation` rather than exposing an error or a guessed total.

---

# CURRENCY

Never accepted from the client (SEC-04) and never forwarded to orchestration. On `succeeded`, if the re-read `payment_transactions.currency` is unexpectedly not `SAR`, the handler does **not** silently pass it through or convert it — it returns `requires_reconciliation`, following the same "genuine ambiguity, no guessing" convention `checkoutOrchestration.js` already uses for its own G-5 case. This exact branch has no dedicated automated test (no live path currently produces a non-SAR value; documented as a WARNING below).

---

# IDEMPOTENCY

`paymentIdempotencyKey` is resolved once, in the handler, before calling `orchestrate()`: the client-supplied value is used verbatim if present (PFCX-41, PFCX-42); otherwise the handler generates one itself using the same `newIdempotencyKey('pay')` helper `checkoutOrchestration.js` would have used internally — necessary so the same key value is available for `returnUrl` construction ahead of the orchestration call. `initiatePaymentFirstCheckout`'s own internal generation is never triggered as a result (the passed-in value always takes precedence). The deferred `restaurant_id`-scoping fix to `startCharge`'s idempotency-key lookup (`src/payments/services/paymentService.js`) was **not** implemented here, per the spec's own explicit deferral and this task's strict scope — see DEFERRED.

---

# RATE_LIMITING

Not implemented, as instructed (Phase 16). No in-memory counter, no new database migration, no fabricated Supabase-platform configuration claim. Documented as `RATE_LIMITING_REQUIRES_INFRA_DECISION`, matching 3.6D-C's own conclusion — unchanged status, carried forward, not silently marked done.

---

# ERROR_HANDLING

Every backend-recognized `status` (`rejected`, `price_changed`, `failed`, `retryable_error`, `requires_reconciliation`, `succeeded`) returns HTTP 200 (PFCX-28 through PFCX-32b). Structural/request-level problems (`invalid_request`, `method_not_allowed`) return 400/405. An unrecognized orchestration `status` value (should never occur in practice) and any thrown exception return 500 with `{error: 'internal_error'}` only — no raw exception text, stack trace, or database error message ever reaches the response body (PFCX-43, PFCX-44).

---

# LOGGING

`console.log`/`console.warn`/`console.error`, matching the existing project convention exactly — no new logging infrastructure. `requestId` (`crypto.randomUUID()` per invocation) correlates all log lines for one request but is not returned to the browser. `requires_reconciliation` and unexpected exceptions log at `error` severity; rejections/failures at `warn`; success at `log`. No raw request body is ever logged.

---

# SECURITY

10 explicit security tests (Phase 22) pass: client-supplied `restaurant_id`/`table_id`/`currency`/`returnUrl`/`providerRef` are never read or forwarded on either path; QR-path `branch_id` is always server-resolved regardless of what the client sends; cross-tenant QR resolution (a table whose `branch.restaurant_id` doesn't match its own `restaurant_id`) is rejected before orchestration is ever called; inactive/suspended restaurants never reach orchestration. Combined with the broader static review (STATIC_SECURITY_REVIEW below), all 18 acceptance-criteria-equivalent security properties from 3.6D-C hold.

---

# TEST_MATRIX

All 49 numbered scenarios (Phase 21) plus 10 explicit security tests (Phase 22) — 61 tests total, all passing. Notable groupings:
- **1–5**: transport/parsing (OPTIONS, wrong method, malformed JSON, missing fields).
- **6–15**: QR and non-QR tenant resolution, every failure branch (not found, inactive, suspended, branch inactive/paused).
- **16–20**: type validation, delivery/dine-in conditional fields, QR table-number server-derivation and override-resistance.
- **21–27**: defense-in-depth payload limits (item count, body size, quantity, string lengths, phone shape).
- **28–36**: every business-outcome status → HTTP 200, plus provider-ref/transaction-id non-exposure and authoritative total/currency sourcing.
- **37–42**: return-URL construction, client-value rejection, QR-token appending, idempotency-key stability.
- **43–49**: exception safety, no `service_role` leakage, no direct `create_order`/refund/webhook coupling, no real network call in tests.
- **SEC-01–10**: explicit trust-boundary tests per Phase 22.

Two self-inflicted false positives were hit and fixed during authoring, both matching this session's known recurring pattern (a purity-check test matching the assistant's own explanatory comment text rather than real code): `PFCX-02` (an unrelated `happy-dom` `Request` API constraint — GET/HEAD requests cannot carry a body — fixed by conditioning body inclusion on method) and `PFCX-48` (the handler's own doc-comment mentions "`payment-webhook`" in prose explaining the Deno import-extension fix, matching the test's naive full-file string search — fixed by narrowing the check to `import` lines only, the same established fix used repeatedly earlier in this session).

---

# FULL_REGRESSION

`npx vitest run`: **812/812 passed** (43 test files).
`npm test -- --run`: **812/812 passed** (43 test files).

Both commands run to completion with no failures. 751 is the pre-existing baseline; 61 are new. No pre-existing test was modified or deleted.

---

# STATIC_SECURITY_REVIEW

- `grep -rn "SUPABASE_SERVICE_ROLE_KEY\|service_role" src/` — only prose/comment mentions (documentation of the constraint, not key values) in `src/config/README.md`, `usePaymentFirstCheckout.js`, `restaurantDeletion.js`, `paymentService.js`, `checkoutOrchestration.js` — all pre-existing from earlier tasks, none new, no actual key value anywhere in frontend-reachable code.
- `checkoutOrchestration` is imported only by `usePaymentFirstCheckout.js` (a hook confirmed in 3.6D-B/3.6D.1 as not yet wired into any live page/route) and internally within the payments module itself (`paymentService.js`, `services/index.js`) — no new browser-reachable import was introduced by this task.
- `paymentService` is never directly imported by any file under `src/features`, `src/pages`, or `src/components`.
- `supabase/functions/payment-first-checkout/index.ts` reads `SUPABASE_SERVICE_ROLE_KEY` once, uses it only to construct the server-side `db` client, never logs it, never returns it — identical pattern to `payment-webhook/index.ts`.
- `handler.js` never reads any environment variable directly and never references `service_role` — it only receives `db` via dependency injection from `index.ts`.
- No `returnUrl`, `restaurant_id`, or `currency` value from the request body is ever trusted (enforced by both the handler's own logic and SEC-01/02/04/05).

---

# FILES_CHANGED

**New (this task):**
- `supabase/functions/payment-first-checkout/handler.js`
- `supabase/functions/payment-first-checkout/index.ts`
- `supabase/functions/payment-first-checkout/handler.test.js`
- `reports/TASK_3_6D_E_PAYMENT_FIRST_EDGE_FUNCTION_IMPLEMENTATION_REPORT.md` (this file)

**Modified (owner-approved, import-extensions only):**
- `src/payments/services/checkoutOrchestration.js` (untracked/new file this session — content changed, no `git diff` baseline)
- `src/payments/services/paymentService.js`
- `src/payments/utils/index.js`

**Not modified:** `supabase/functions/payment-webhook/*`, `paymentService.refund()`'s logic (only its import lines), any frontend file, any database/migration file.

---

# GIT_STATUS

New files created by this task (untracked, `??`):
```
supabase/functions/payment-first-checkout/
```
(plus the new report file above; all other `??` entries in `git status` predate this task — earlier session work, unrelated report files, and previously-added source/test files from 3.6A–3.6D.1.)

Pre-existing tracked-file modifications, cumulative across all tasks in this session (this task's contribution: `paymentService.js` +6/-4 lines net vs. the 3.6D-B baseline, `utils/index.js` newly appears at +1/-1):
```
 src/payments/adapters/moyasar.js              |  20 +-
 src/payments/index.js                         |   1 +
 src/payments/services/index.js                |   7 +
 src/payments/services/paymentService.js       | 122 ++++++-   (was 116 at 3.6D-B baseline)
 src/payments/types/index.js                   |   4 +
 src/payments/utils/index.js                   |   2 +-        (new in this task)
 supabase/functions/payment-webhook/handler.js |  19 ++
 tests/unit/MoyasarAdapter.test.js             |  57 +++-
 tests/unit/paymentService.test.js             | 436 +++++++++++++++++++++++++-
 tests/unit/paymentWebhook.test.js             |  95 ++++++
 10 files changed, 741 insertions(+), 22 deletions(-)   (was 9 files / 737(+) / 18(-) at 3.6D-B baseline)
```
This task's exact contribution to that diff: `paymentService.js` (4 import lines changed) + `utils/index.js` (1 import line changed, new to the tracked-diff list) = the full +4/+4 delta between the two baselines. Verified via isolated `git diff` on just those two files (import lines only, no other change).

No commit, no push, no merge performed.

---

# BLOCKERS

None remaining for this task's own scope. One deployment-time blocker for actually running this function in any real environment: `PUBLIC_APP_BASE_URL` is not yet set anywhere (no environment currently defines it) — the function will return HTTP 500 `internal_error` immediately on every request until it is configured, by design (RETURN_URL has no safe fallback).

---

# WARNINGS

1. The `currency !== 'SAR'` → `requires_reconciliation` branch (CURRENCY) has no dedicated automated test — no current live code path can actually produce a non-SAR value in `payment_transactions.currency`, so this is defense-in-depth for a state that shouldn't currently be reachable, not a verified-triggerable branch.
2. `RATE_LIMITING_REQUIRES_INFRA_DECISION` remains open — this function is deployable but not yet rate-limited by anything this repository controls.
3. The idempotency-key cross-tenant lookup gap in `paymentService.js`'s `startCharge` (documented in 3.6D-C) remains open — this task's echo-only policy at the Edge Function layer narrows but does not close it.
4. `PUBLIC_APP_BASE_URL` must be set before this function can serve any real request (see BLOCKERS) — this is expected/by-design, not a defect, but is easy to forget at deploy time.

---

# DEFERRED

Exactly as 3.6D-C specified and this task's own instructions required — not implemented here:
- The database-backed rate-limiting counter and its migration.
- The `restaurant_id`-scoping fix to `paymentService.js`'s `startCharge` idempotency-key lookup.
- Any frontend wiring (`usePaymentFirstCheckout.js` remains unmodified and still unconnected to any page).
- Deployment of this function to any real Supabase project.

---

# REPORT_FILE

`reports/TASK_3_6D_E_PAYMENT_FIRST_EDGE_FUNCTION_IMPLEMENTATION_REPORT.md`

# DOWNLOAD_COPY

`/sdcard/Download/TASK_3_6D_E_PAYMENT_FIRST_EDGE_FUNCTION_IMPLEMENTATION_REPORT.md` (copied and checksum-verified after this report was written).

# NEXT_STEP

Await explicit owner instruction before: setting `PUBLIC_APP_BASE_URL` and deploying this function to any environment; starting any of 3.6D.2–3.6D.7, 3.6E, or 3.6G; or scoping the two deferred hardening items (rate limiting, idempotency tenant-scoping) as their own tasks.

---

*Report generated 2026-08-27. Implementation only — no deployment, no Moyasar call, no commit, no push, no merge.*
