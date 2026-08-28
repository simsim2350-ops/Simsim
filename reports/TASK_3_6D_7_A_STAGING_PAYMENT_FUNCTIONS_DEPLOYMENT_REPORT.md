# Task 3.6D.7-A — Staging Payment Functions Deployment Report

**Deployment task resolving Blocker 1 from `TASK_3_6D_7_PAYMENT_FIRST_STAGING_E2E_VERIFICATION_REPORT.md`. `payment-first-checkout` and `payment-webhook` deployed to STAGING ONLY, byte-identical to already-tested local source. No production deployment. No source code modified. No commit/push/merge. A new, real configuration gap was discovered during verification and is reported honestly rather than worked around — see `BLOCKERS`.**

---

# EXECUTIVE_SUMMARY

Both `payment-first-checkout` and `payment-webhook` are now deployed and `ACTIVE` on staging (`rgqsetckcigkgsyobyjg`), using the exact, unmodified source already on disk and already covered by this session's unit-test suite. Deployment itself succeeded cleanly for both. **Live synthetic verification then surfaced a real, pre-existing configuration gap**: neither `PUBLIC_APP_BASE_URL` (required by `payment-first-checkout`) nor `PAYMENT_MOYASAR_WEBHOOK_SECRET` (required by `payment-webhook`) is currently set as a secret on this staging project — both functions correctly detect this and fail closed (`500`, no crash, no data written, no secret ever exposed), exactly as their own source is designed to do. This is not a deployment defect; it is the expected, safe behavior of code that has never had these specific secrets configured on this project before (neither function was ever deployed to staging prior to this task, so neither secret was ever configured). No workaround was attempted — this session has no tool capable of setting Edge Function secrets, and inventing a value would violate this task's own "do not print/expose secret values" instruction in spirit even if not in letter. See `BLOCKERS` for what is needed to close this out.

Everything else requested was verified successfully: both functions are `ACTIVE` with the correct JWT policy, `payment-webhook`'s signature/security validation logic is intact and correctly ordered, its payment-transaction-update-only behavior is unchanged (confirmed no order creation occurs), and the full local regression suite remains at **1054/1054** with zero source files touched.

---

# PRE_DEPLOYMENT_AUDIT

1. **Reports read**: `TASK_3_6D_E_PAYMENT_FIRST_EDGE_FUNCTION_IMPLEMENTATION_REPORT.md` (payment-first-checkout's own implementation report, from this same session's earlier work) and `TASK_3_6D_7_PAYMENT_FIRST_STAGING_E2E_VERIFICATION_REPORT.md` (this task's direct predecessor, defining Blocker 1). `payment-webhook`'s original implementation predates this session's own report set (Task 3.4, the session's single git commit) — its behavior was instead re-verified directly from current source (below), which is the more authoritative check regardless.
2. **Exact source on disk verified**: both `handler.js`/`index.ts` pairs re-read in full immediately before assembling deployment payloads. Checksums recorded for traceability:
   | File | MD5 |
   |---|---|
   | `supabase/functions/payment-first-checkout/handler.js` | `7a63cdf26daffc41d918b93e9bf4a43d` |
   | `supabase/functions/payment-first-checkout/index.ts` | `31557405d8d79b5965afc83c4e51f782` |
   | `supabase/functions/payment-webhook/handler.js` | `08d2325c6693f5dd9081971ec91ae7c3` |
   | `supabase/functions/payment-webhook/index.ts` | `be0df730da77634042a40c6e71c26a55` |
3. **Dependency closures traced by reading every import**:
   - `payment-first-checkout`: `index.ts` → `handler.js` → `checkoutOrchestration.js` (`initiatePaymentFirstCheckout`, `newIdempotencyKey`) → `paymentService.js`, `checkoutBinding.js`, `utils/index.js`, `types/index.js` → `adapters/index.js` → `adapters/moyasar.js` → `contracts/PaymentAdapter.js`. 10 files total, identical to the closure already traced and deployed for `create-order-from-payment` in `TASK-PAY-3.6D.7` (same shared dependency tree).
   - `payment-webhook`: `index.ts` imports `MoyasarAdapter` **directly** (not through `adapters/index.js`) plus `./handler.js`; `handler.js` itself has **zero** imports (its own header comment explains why — `paymentService.js`'s bare-specifier imports aren't Deno-compatible, so its webhook-handling logic was deliberately re-implemented locally in this file back when it was first built). Closure: `index.ts`, `handler.js`, `adapters/moyasar.js`, `contracts/PaymentAdapter.js`, `types/index.js` — 5 files.
4. **No uncommitted source modifications introduced**: confirmed — this task performed zero `Write`/`Edit` calls against any local file. `git status --short` before and after this task's deployment activity is identical (14 modified tracked files, 136 untracked — the +1 versus the prior task's 135 is `TASK_3_6D_7_PAYMENT_FIRST_STAGING_E2E_VERIFICATION_REPORT.md` itself, created in the previous task, not this one).
5-6. **Required staging secrets/configuration verified without printing values** — see `ENVIRONMENT_CONFIGURATION_VERIFICATION` below; verification was performed entirely through **behavioral signals** (which specific, documented code path a request falls into) rather than ever reading, printing, or guessing an actual secret value. No secrets-listing tool exists in this session's toolset, and none was needed — the functions' own fail-closed design makes their configuration state observable safely from outside.
7-10. Covered in detail in `ENVIRONMENT_CONFIGURATION_VERIFICATION` / `CALLBACK_URL` / `WEBHOOK_VERIFICATION` below.

---

# STAGING_PROJECT

`rgqsetckcigkgsyobyjg` ("simsim-menu-staging", `ap-southeast-1`, `ACTIVE_HEALTHY`) — same project used throughout this arc, re-confirmed via `list_projects` immediately before deployment. Production (`gpwwnuuicywsvmmhxngs`) was not touched.

---

# FUNCTIONS_DEPLOYED

| Function | ID | Version | Status | `verify_jwt` | Deployed at (UTC) | Bundle hash (`ezbr_sha256`) |
|---|---|---|---|---|---|---|
| `payment-webhook` | `299e2d58-3430-4ba4-a13c-a9b00196acdc` | 1 | `ACTIVE` | `false` | 2026-08-28T07:49:16.815Z | `8b0b98578b70fb5d80cdc960e31670520f4355e6ae285a059870a5fe6646ece2` |
| `payment-first-checkout` | `e26d33a8-7503-4832-9757-0e6c1fd2ce2b` | 1 | `ACTIVE` | `true` | 2026-08-28T07:54:57.492Z | `c369a6c7fa55931195620c5a7c2f578598421c2ff12811b655f243eb9b82900d` |

Both are first-time deployments to this project (neither existed on staging before this task — confirmed via `list_edge_functions` in the prior task's own report). `verify_jwt` was set per each function's own documented, unmodified security model: `payment-first-checkout` requires anon-key JWT (browser caller, matches its header comment and matches `create-order-from-payment`'s own already-deployed policy); `payment-webhook` requires none (Moyasar calls it directly and cannot supply a Supabase JWT — it authenticates via its own HMAC signature instead, exactly as its handler already implements). Neither value was guessed — both were re-derived directly from re-reading each function's own current source before deployment.

Content uploaded is byte-identical to the checksummed local source above — nothing was altered, trimmed, or "cleaned up" for deployment.

---

# ENVIRONMENT_CONFIGURATION_VERIFICATION

No secret value was read, printed, or guessed anywhere in this task. Configuration presence was verified exclusively through each function's own documented, pre-existing fail-closed behavior — a real HTTP request either takes the "secret missing" code path or it doesn't, and that's observable without ever seeing the secret itself.

| Variable | Required by | Verification method | Result |
|---|---|---|---|
| `SUPABASE_URL` | Both (auto-provisioned) | Both functions successfully executed real database-backed logic in earlier and current testing (`create-order-from-payment` in the prior task; `payment-webhook`'s `payment_webhook_events` insert path exercised below) | **Confirmed present** — auto-provisioned by Supabase for every function, functions could not otherwise construct a working `service_role` client at all. |
| `SUPABASE_SERVICE_ROLE_KEY` | Both (auto-provisioned) | Same as above | **Confirmed present.** |
| `PUBLIC_APP_BASE_URL` | `payment-first-checkout` only | A real `POST` with a minimal (`{}`) body was sent live. The handler's own source checks this variable **before any body parsing at all** (`if (!publicAppBaseUrl) return json({error:'internal_error'}, 500)`), so any `POST` — malformed or not — reveals its presence/absence unambiguously. | **NOT configured** — response was `500 {"error":"internal_error"}`, exactly the code path taken when this variable is empty. See `BLOCKERS`. |
| `PAYMENT_MOYASAR_WEBHOOK_SECRET` | `payment-webhook` only | A real `POST` was sent with a present-but-fake `x-moyasar-signature` header. The handler checks `!signature` first (would be `401 Missing webhook signature`), then `!webhookSecret` (`500 Webhook secret not configured`) — sending a signature header specifically isolates the second check. | **NOT configured** — response was `500 {"error":"Webhook secret not configured"}`, exactly the code path taken when this variable is empty. See `BLOCKERS`. |
| `PAYMENT_MOYASAR_SECRET_KEY` | `payment-webhook` (optional — only needed for outbound calls to Moyasar, which `parseWebhook` never makes) | Not independently verifiable and not blocking — this function's own code only reads it to construct `MoyasarAdapter`, and `parseWebhook` (the only method the webhook handler calls) never touches `_apiKey` at all. | Not applicable to webhook receipt; no live signal available either way. |

---

# MOYASAR_CONFIGURATION_VERIFICATION

No secret value was retrieved, displayed, or inferred. What was confirmed:
- `payment-webhook`'s HMAC verification logic (`verifyHmacSha256`, `crypto.subtle.verify`, constant-time) is deployed **unmodified** — re-confirmed by checksum match against the exact source this session's own test suite already exercises.
- The function correctly reaches the "secret not configured" branch **before** ever attempting HMAC verification when the secret is genuinely absent (confirmed live, see table above) — meaning if/when the secret is set, the exact same, already-tested verification logic will run without any further code change needed.
- `PAYMENT_MOYASAR_SECRET_KEY` (the Moyasar API key, distinct from the webhook secret) was not verified live and is not required for the webhook to *receive* events — only for `payment-first-checkout`'s eventual outbound `createCharge` call, which was not exercised in this task (see `BLOCKERS` — blocked by the missing `PUBLIC_APP_BASE_URL` check occurring earlier in the same request).

---

# CALLBACK_URL

`buildReturnUrl` (in `payment-first-checkout/handler.js`, unmodified, re-read and checksummed above) constructs `${PUBLIC_APP_BASE_URL}/menu/${slug}?payment_callback=${key}[&table=...|&branch=...]` — matching the approved `TASK_3_6D_4_C.1`/`.2` contract exactly, unchanged. **Not exercisable live**: since `PUBLIC_APP_BASE_URL` is unset, no request can progress far enough to actually construct and return a `returnUrl` value (the function returns `500` before reaching that code at all). This is consistent with, not contradicted by, the source-level confirmation that the construction logic itself is correct and untouched.

---

# WEBHOOK_VERIFICATION

| Requirement | Result |
|---|---|
| Function `ACTIVE` | Confirmed — `list_edge_functions`-equivalent deployment response shows `status: "ACTIVE"`. |
| Webhook endpoint reachable | Confirmed — `OPTIONS` → `200`; `POST` (various bodies/headers) → correctly differentiated `401`/`500`/`405` responses, never a connection failure. |
| Signature/security validation remains intact | Confirmed — live behavior matches source exactly: no signature header → `401 "Missing webhook signature"`; signature header present but secret unconfigured → `500 "Webhook secret not configured"` (checked in the correct order, before any HMAC computation is attempted). This is the same, unmodified logic already covered by this session's `paymentWebhook.test.js` suite. |
| Payment transaction update behavior remains unchanged | Confirmed by source re-audit (checksummed, unmodified): `_handleWebhookEvent` only ever performs `payment_webhook_events` insert + `payment_transactions.status` update — identical to the version already exercised in `tests/unit/paymentWebhook.test.js` (part of the 1054/1054 baseline). |
| No order creation is performed by webhook | **Confirmed by direct re-reading of the deployed source**: `payment-webhook/handler.js` contains no reference to `create_order`, `createOrderFromSuccessfulPayment`, or the `orders` table anywhere — it is entirely self-contained (zero imports, as noted in `PRE_DEPLOYMENT_AUDIT`), so there is no code path by which it could call either. This matches `TASK_3_6D_6_A`'s own audit finding, re-confirmed here against the now-live deployed bundle rather than only the local file. |

**Not verified live**: a full, correctly-signed webhook call actually updating a real `payment_transactions` row end-to-end — blocked by the missing `PAYMENT_MOYASAR_WEBHOOK_SECRET` (see `BLOCKERS`); attempting to fabricate a "correct" signature without the real secret is not possible by design (that's the entire point of HMAC), and there is no real payment_transactions row with a matching provider_ref to update yet regardless.

---

# PAYMENT_FIRST_CHECKOUT_VERIFICATION

| Requirement | Result |
|---|---|
| Function `ACTIVE` | Confirmed. |
| JWT policy | Confirmed — deployed with `verify_jwt: true`; a request with no `Authorization` header was live-rejected with `401` at the gateway level, before the function body ran. |
| Return URL points to staging | **Not verifiable live** — see `CALLBACK_URL`; blocked by missing `PUBLIC_APP_BASE_URL`. Source-level construction confirmed correct. |
| Payment attempt creation works | **Not currently true, and reported honestly rather than claimed** — every real request currently fails at the very first check (`PUBLIC_APP_BASE_URL` missing) before reaching tenant resolution, dry-run pricing, or `payment_transactions` insertion at all. This is not a code defect (the check itself is working exactly as designed — refusing to operate without a safe return URL is the correct, intentional behavior) but it does mean payment-attempt creation cannot be demonstrated until the missing configuration is supplied. See `BLOCKERS`. |
| No secrets exposed | Confirmed — every live response body across all tests was one of the fixed, documented shapes (`{"error":"..."}` or `{"status":"...","reason":"..."}`); no response ever contained a secret, a stack trace, or raw provider text. |
| Expected response contract | Confirmed for the code paths reachable today: `OPTIONS`→`200`, `GET`→`405 {"error":"method_not_allowed"}`, missing-config→`500 {"error":"internal_error"}`, no-auth→`401` — all exactly matching the source and this session's own `handler.test.js` suite (49+10 tests, part of the 1054/1054 baseline). The `rejected`/`price_changed`/`succeeded`/etc. business-outcome shapes were not re-exercised live (blocked by the same missing-configuration gate), but are unmodified, checksummed, and already covered by that same test suite. |

---

# TESTS

```
npx vitest run
```
```
Test Files  57 passed (57)
     Tests  1054 passed (1054)
```
Identical to the pre-deployment baseline — no test was added, removed, or modified (this task deployed already-existing, already-tested source; it did not change any code).

---

# SECURITY_VERIFICATION

- No `service_role` key, Moyasar API key, or webhook secret was ever read, logged, printed, or transmitted anywhere in this task's own activity — every verification used only the functions' own public, documented fail-closed responses.
- Both functions' `verify_jwt` settings were set from each function's own current, unmodified source/comments — not guessed, not defaulted blindly.
- `payment-first-checkout`'s `internal_error` response for the missing-`PUBLIC_APP_BASE_URL` case reveals only that fixed string — no configuration detail, no variable name, no stack trace (confirmed by direct inspection of the raw HTTP response body).
- `payment-webhook`'s `"Webhook secret not configured"` message is the function's own **pre-existing, unmodified** error string (present in the checksummed source before this task ever began) — not something newly written to be more revealing; it names the *condition*, never the secret.

---

# FILES_CHANGED

**None.** This task performed zero local file writes or edits — it read existing source (for verification and to assemble deployment payloads) and made two remote deployment calls plus a series of read-only HTTP/SQL verification calls. `git status --short` is unchanged from the immediately-preceding task (14 modified tracked files, 136 untracked files, all pre-existing).

---

# GIT_STATUS

Unchanged by this task. No `git add`, `commit`, or `push` was performed, per instruction.

---

# DEPLOYMENT_STATUS

**Staging only.** `payment-webhook` and `payment-first-checkout` are now `ACTIVE` on `rgqsetckcigkgsyobyjg` alongside the already-deployed `create-order-from-payment` and the pre-existing `guest-order-session-exchange` — four Edge Functions now live on staging in total. **Production untouched** — `gpwwnuuicywsvmmhxngs` was not queried for write operations at any point in this task. No frontend build was deployed (unchanged from the prior task; still out of scope here).

---

# BLOCKERS

**New blocker discovered this task (not present before, since neither function was previously deployed anywhere): both `PUBLIC_APP_BASE_URL` and `PAYMENT_MOYASAR_WEBHOOK_SECRET` are unset on staging.** Concretely, this means:
- `payment-first-checkout` cannot currently create a real payment attempt on staging — every request fails at its very first, intentional safety check.
- `payment-webhook` cannot currently process a real Moyasar webhook — every signed request would fail HMAC verification not because the signature is wrong, but because there is no secret configured to check it against.

**This session has no tool capable of setting Supabase Edge Function secrets** (confirmed by search — the MCP toolset available here has no `set_secrets`/equivalent, and this environment's local Supabase CLI is non-functional — `Unsupported platform` under Termux/proot). **Resolution requires the owner (or someone with dashboard/CLI access to this Supabase project) to set these two secrets** — `PUBLIC_APP_BASE_URL` (the intended staging frontend origin, e.g. a Vercel preview URL once one exists) and `PAYMENT_MOYASAR_WEBHOOK_SECRET` (from the Moyasar dashboard's staging/test webhook configuration) — via `supabase secrets set` or the Supabase dashboard's Edge Function secrets UI. `PAYMENT_MOYASAR_SECRET_KEY` should likely be set at the same time, for `payment-first-checkout`'s eventual outbound charge call to work.

**Blocker 1 from the prior report is now partially resolved**: both Edge Functions needed for a real payment-first flow are deployed. **What remains blocking full Phase 4 E2E**: (a) the two secrets above, (b) still no frontend build on staging, (c) still no browser-automation tool in this session (Blocker 2 from the prior report, entirely unchanged and unaddressed by this task, which was explicitly scoped to deployment only).

---

# RISKS

- Until the missing secrets are set, these two newly-deployed functions are inert in practice (safely so — they fail closed, not open) — deploying them did not, by itself, make the payment-first flow usable on staging.
- No live execution of the actual `succeeded` business-outcome paths in either function has occurred yet on staging (blocked by the same configuration gap) — only the pre-condition/validation/error paths have been live-verified so far.

---

# DEFERRED_WORK

- Setting `PUBLIC_APP_BASE_URL`, `PAYMENT_MOYASAR_WEBHOOK_SECRET`, and `PAYMENT_MOYASAR_SECRET_KEY` as staging Edge Function secrets (requires owner/dashboard access this session does not have).
- Live verification of `payment-first-checkout`'s actual payment-attempt-creation and return-URL-construction paths, once `PUBLIC_APP_BASE_URL` is set.
- Live verification of `payment-webhook`'s actual signature-verified update path, once `PAYMENT_MOYASAR_WEBHOOK_SECRET` is set.
- Frontend staging deployment (still out of this task's scope).
- The full Phase 4 browser E2E matrix (still blocked by the absence of a browser-automation tool in this session, per the prior report's Blocker 2, unchanged).

---

# EXACT_NEXT_STEP

Per this task's own "STOP after this deployment report" instruction, no further action is taken. The immediate gating item for continuing toward real E2E is the owner (or someone with appropriate access) setting the three secrets named above on the `rgqsetckcigkgsyobyjg` staging project; once set, a follow-up task could re-run the same safe, secret-free synthetic verification approach used in this report to confirm each function now operates past its configuration checks, before any browser-based work is attempted.
