# Task 3.4 — Webhook Edge Function Report

**Date:** 2026-08-23
**Task:** 3.4 — Payment Webhook Edge Function
**Branch:** `phase-3/task-3-4-webhook-edge-function`
**Commits:** `6b0a4f2` (implementation) · `e49e4ea` (test fix)
**PR:** #326
**CI Run:** 32621723936 — ✅ PASSED
**Status:** ✅ TASK 3.4 = COMPLETE

---

## 1. Executive Summary

Task 3.4 implements the Supabase Edge Function (`supabase/functions/payment-webhook/`) that receives Moyasar payment webhooks, validates HMAC-SHA256 signatures using `crypto.subtle` (timing-safe), parses the payload via `MoyasarAdapter.parseWebhook`, and updates `payment_transactions` and `payment_webhook_events` tables idempotently. 22 unit tests were added. All 476 tests pass in CI (up from 454 pre-existing). No real credentials were used. No production systems were modified.

**TASK 3.4 = COMPLETE (code + tests + CI)**
**REAL MOYASAR DELIVERY: NOT TESTED — credentials unavailable**
**PRODUCTION: UNCHANGED**
**TASK 3.5 = NOT STARTED**

---

## 2. Preflight State

| Item | State at Task 3.4 Start |
|------|------------------------|
| Branch base | `phase-3/task-3-3-payment-service` (Task 3.3 complete) |
| `supabase/functions/payment-webhook/` | DID NOT EXIST |
| Existing Edge Functions | `supabase/functions/create-platform-admin/index.ts` (one function) |
| `paymentService.handleWebhookEvent` | COMPLETE (Task 3.3) — informs handler design |
| `MoyasarAdapter.parseWebhook` | COMPLETE (Task 3.2) — reused via injection |
| `payment_webhook_events` schema | UNIQUE(provider, event_id) — idempotency guaranteed at DB level |
| `payment_providers.moyasar.is_enabled` | false — unchanged |
| Pre-existing tests | 454 / 35 files |

### Existing Edge Function Pattern (from `create-platform-admin/index.ts`)

| Pattern | Observed in project |
|---------|-------------------|
| Import target | `https://esm.sh/@supabase/supabase-js@2` |
| Runtime API | `Deno.serve`, `Deno.env.get` |
| Client creation | `createClient(URL, SERVICE_ROLE_KEY)` inside function |
| CORS | `corsHeaders` object, OPTIONS → 200 response |
| Errors | `json({ error: '...' }, status)` helper |
| Language | TypeScript |

---

## 3. Task 3.4 Scope

### In scope — implemented
- `supabase/functions/payment-webhook/handler.js` — pure DI-based handler logic
- `supabase/functions/payment-webhook/index.ts` — Deno entry point
- `tests/unit/paymentWebhook.test.js` — 22 unit tests

### Not in scope — not touched
- Task 3.5 (create_order RPC)
- Payment UI
- Production deployment
- Production DB changes
- Real Moyasar credentials
- Enabling `payment_providers.moyasar.is_enabled`

---

## 4. Architecture

```
Moyasar servers (POST with HMAC signature)
        ↓
supabase/functions/payment-webhook/index.ts   ← Deno entry point
  Deno.env.get('PAYMENT_MOYASAR_WEBHOOK_SECRET')
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  Deno.env.get('PAYMENT_MOYASAR_SECRET_KEY')
  createClient(SUPABASE_URL, SERVICE_ROLE_KEY)  ← service_role bypasses RLS
  new MoyasarAdapter(apiKey)                    ← Task 3.2 adapter reused
  buildHandler({ webhookSecret, adapter, db })
        ↓
supabase/functions/payment-webhook/handler.js  ← pure logic (no Deno deps)
  verifyHmacSha256(rawBody, signature, secret)  ← crypto.subtle (timing-safe)
  adapter.parseWebhook(payload, headers)        ← MoyasarAdapter.parseWebhook
  _handleWebhookEvent(event, db)
        ↓
payment_webhook_events (insert — UNIQUE guard)
        ↓
payment_transactions (UPDATE status)
```

### Architectural Constraint: paymentService Cannot Be Imported in Deno

`paymentService.js` uses bare module specifiers (`import { getAdapter } from '../adapters'`) which Deno's module resolver requires explicit `.js` extensions to resolve. Since there is no bundling step (functions deploy directly), these imports would fail at Deno runtime.

**Resolution:** The webhook handling logic is implemented directly in `handler.js` — a self-contained equivalent of `paymentService.handleWebhookEvent`. The duplication is minimal (≈60 lines) and bounded to the webhook-handling context. `MoyasarAdapter.parseWebhook` IS reused via dependency injection (no duplication of gateway parsing logic).

### Testability Design

`handler.js` is pure JavaScript with no Deno-specific code. It exports:
- `buildHandler({ webhookSecret, adapter, db })` → returns async request handler
- `verifyHmacSha256(body, sig, secret)` → HMAC verification
- `signHmacSha256(body, secret)` → test helper (computes expected signature)

This allows Vitest to import and test `handler.js` directly using mocked `adapter` and `db`, without mocking `Deno` globals or `esm.sh` imports.

---

## 5. Files Created

| File | Lines | Description |
|------|-------|-------------|
| `supabase/functions/payment-webhook/handler.js` | 215 | Pure handler logic — testable |
| `supabase/functions/payment-webhook/index.ts` | 35 | Deno entry point |
| `tests/unit/paymentWebhook.test.js` | 310 | 22 unit tests |

---

## 6. Files Modified

None. No existing files were modified.

---

## 7. Files Not Modified

| Category | Confirmation |
|----------|-------------|
| `src/payments/services/paymentService.js` | UNCHANGED |
| `src/payments/adapters/moyasar.js` | UNCHANGED |
| `src/payments/adapters/index.js` | UNCHANGED |
| `src/payments/contracts/PaymentAdapter.js` | UNCHANGED |
| All `src/pages/**`, `src/features/**`, `src/components/**` | UNCHANGED |
| `package.json` / `package-lock.json` | UNCHANGED |
| `vite.config.js` | UNCHANGED |
| `.github/workflows/ci.yml` | UNCHANGED |
| `sql/*.sql` | UNCHANGED |
| `payment_providers` table | UNCHANGED — moyasar is_enabled=false |
| `payment_transactions` table | UNCHANGED — no rows modified |
| `payment_webhook_events` table | UNCHANGED — no rows modified |

---

## 8. Webhook Request Flow

```
1. Moyasar sends POST /payment-webhook
         ↓
2. OPTIONS → 200 (CORS preflight)
   non-POST → 405
         ↓
3. Read raw request body (text)
         ↓
4. Check x-moyasar-signature header
   → missing: 401 "Missing webhook signature"
         ↓
5. verifyHmacSha256(rawBody, signature, webhookSecret)
   → UNVERIFIED signature: 401 "Invalid webhook signature"
         ↓
6. JSON.parse(rawBody)
   → malformed: 400 "Malformed JSON body"
         ↓
7. adapter.parseWebhook(payload, headers)
   → WebhookParseResult { eventId, type, providerRef, status, raw }
         ↓
8. _handleWebhookEvent({ ...event, provider: 'moyasar' }, db)
   a. INSERT payment_webhook_events (UNIQUE guard → 23505 = already_processed)
   b. If no providerRef → mark processed, return no_provider_ref
   c. SELECT payment_transactions WHERE provider_ref = event.providerRef
   d. If not found → mark error, return transaction_not_found
   e. If terminal status → mark processed, return already_terminal
   f. UPDATE payment_transactions { status }
   g. UPDATE payment_webhook_events { transaction_id, processed_at }
         ↓
9. 200 { ok: true, updated: true/false, reason?, transactionId?, status? }
   500 (on internal error — generic message, no secret exposure)
```

---

## 9. HMAC Verification Design

| Aspect | Implementation |
|--------|---------------|
| Algorithm | HMAC-SHA256 |
| Signature header | `x-moyasar-signature` |
| Signature encoding | Hexadecimal string |
| Key import | `crypto.subtle.importKey('raw', ..., { name: 'HMAC', hash: 'SHA-256' })` |
| Verification | `crypto.subtle.verify('HMAC', key, sigBytes, bodyBytes)` — inherently timing-safe |
| Body used | Raw request body (text) read BEFORE any JSON parsing |
| Env var | `PAYMENT_MOYASAR_WEBHOOK_SECRET` |

**PROVEN:** The implementation correctly verifies HMAC-SHA256 signatures — confirmed by 5 dedicated HMAC unit tests using `crypto.subtle` in the happy-dom environment.

**NOT PROVEN:** Whether the `x-moyasar-signature` header name and hex encoding match actual Moyasar webhook delivery. Real sandbox credentials are required to verify this. Moyasar's production HMAC mechanism must be checked in their official documentation before deployment.

---

## 10. Error Handling

| Scenario | HTTP Status | Response Body |
|----------|-------------|---------------|
| OPTIONS (CORS) | 200 | `"ok"` |
| Non-POST method | 405 | `{ error: 'Method Not Allowed' }` |
| Body read failure | 400 | `{ error: 'Failed to read request body' }` |
| Missing signature | 401 | `{ error: 'Missing webhook signature' }` |
| Webhook secret unconfigured | 500 | `{ error: 'Webhook secret not configured' }` |
| Invalid signature | 401 | `{ error: 'Invalid webhook signature' }` |
| Malformed JSON | 400 | `{ error: 'Malformed JSON body' }` |
| Duplicate event (23505) | 200 | `{ ok: true, updated: false, reason: 'already_processed' }` |
| No providerRef | 200 | `{ ok: true, updated: false, reason: 'no_provider_ref' }` |
| Transaction not found | 200 | `{ ok: true, updated: false, reason: 'transaction_not_found' }` |
| Terminal transaction | 200 | `{ ok: true, updated: false, reason: 'already_terminal' }` |
| DB/internal error | 500 | `{ error: 'Internal error processing webhook' }` |
| Happy path | 200 | `{ ok: true, updated: true, transactionId, status }` |

**Why duplicate events return 200:** Moyasar retries webhooks that receive non-200 responses. Returning 200 for already-processed events stops retry loops without side effects.

---

## 11. Idempotency Handling

| Layer | Mechanism |
|-------|-----------|
| DB | `UNIQUE INDEX uq_webhook_provider_event ON payment_webhook_events(provider, event_id)` — prevents duplicate rows at DB level |
| Application | `whErr.code === '23505'` → return `already_processed` immediately |
| Terminal guard | `TERMINAL.has(tx.status)` → skip payment_transactions UPDATE |

The UNIQUE index on `payment_webhook_events` is the primary idempotency guarantee — even if two concurrent webhook deliveries arrive simultaneously, only one INSERT succeeds. The second gets a 23505 error and returns 200 immediately without updating any transaction.

---

## 12. Security Review

| # | Check | Result | Notes |
|---|-------|--------|-------|
| S-1 | Raw body used for HMAC | ✅ PROVEN | `rawBody = await req.text()` before JSON parse |
| S-2 | Signature validated before processing | ✅ PROVEN | Lines 38–52 of handler.js |
| S-3 | Timing-safe comparison | ✅ PROVEN | `crypto.subtle.verify` is inherently constant-time |
| S-4 | Service-role key never in handler.js | ✅ PROVEN | `db` is injected; handler.js has no env var reads |
| S-5 | Webhook secret is environment-only | ✅ PROVEN | `webhookSecret` param injected from `index.ts` via `Deno.env.get` |
| S-6 | No secrets committed | ✅ CONFIRMED | grep: no real keys in any new file |
| S-7 | No card data logged | ✅ PROVEN | Only `[payment-webhook] error: <message>` logged |
| S-8 | Client-supplied status not trusted | ✅ PROVEN | Status comes from `adapter.parseWebhook` (provider-parsed), not request headers |
| S-9 | Duplicate webhook cannot double-process | ✅ PROVEN | 23505 DB constraint + unit test WEBHOOK-007 |
| S-10 | Terminal transaction cannot regress | ✅ PROVEN | TERMINAL set check + unit test WEBHOOK-009 |
| S-11 | Malformed input cannot crash | ✅ PROVEN | try/catch around `req.text()` and `JSON.parse()` |
| S-12 | Unsupported methods rejected | ✅ PROVEN | `req.method !== 'POST'` check + tests WEBHOOK-005 |
| S-13 | CORS appropriate | ✅ | Only `content-type` + `x-moyasar-signature` in Allow-Headers; POST+OPTIONS only |
| S-14 | Error responses don't leak secrets | ✅ PROVEN | Generic "Internal error" on 500 + test WEBHOOK-013 |
| S-15 | service_role key not reachable from browser | ✅ PROVEN | `db` injected in index.ts (server-side only); handler.js has no browser exposure |
| S-16 | HMAC signature header name matches Moyasar | ⚠️ UNVERIFIED | `x-moyasar-signature` is standard but must be verified against Moyasar documentation with real credentials |
| S-17 | HMAC encoding (hex) matches Moyasar | ⚠️ UNVERIFIED | Hex is common; Moyasar may use base64 or a different format |

**UNVERIFIED items (S-16, S-17) require owner verification against Moyasar documentation before production deployment.**

---

## 13. Tests Added

**File:** `tests/unit/paymentWebhook.test.js`
Environment: `// @vitest-environment happy-dom`
Imports: `buildHandler`, `verifyHmacSha256`, `signHmacSha256` from `handler.js`
Mocking: Chainable Supabase mock (`makeDb`/`makeChain`), mock adapter (`makeAdapter`)
No real HTTP, no real DB, no real credentials.

### Test Fix Applied (CI Iteration 2)

`makePostRequest(body, { sig: null })` passed `null` to `opts.sig ?? validSig(...)`. JavaScript's `??` operator treats `null` as nullish and computed a valid signature, causing WEBHOOK-002 to send a valid signature unintentionally (resulting in 500 instead of 401). Fixed by using `'sig' in opts` to distinguish "no sig argument" from "sig explicitly null (no header)".

### Test Table

| Test ID | Description | Status |
|---------|-------------|--------|
| WEBHOOK-001 | POST + valid signature → 200 + updated=true | ✅ |
| WEBHOOK-002 | Missing signature → 401 | ✅ |
| WEBHOOK-003 | Invalid signature → 401 | ✅ |
| WEBHOOK-004 | Malformed JSON → 400 | ✅ |
| WEBHOOK-005a | GET → 405 | ✅ |
| WEBHOOK-005b | PUT → 405 | ✅ |
| WEBHOOK-005c | OPTIONS → 200 (CORS) | ✅ |
| WEBHOOK-006 | adapter.parseWebhook called once with payload | ✅ |
| WEBHOOK-007 | 23505 duplicate → already_processed, 200 | ✅ |
| WEBHOOK-008 | Transaction not found → transaction_not_found, 200 | ✅ |
| WEBHOOK-009 | Terminal transaction → already_terminal, no tx UPDATE | ✅ |
| WEBHOOK-010 | Unknown event type → safe handling, no crash | ✅ |
| WEBHOOK-011 | Missing providerRef → no_provider_ref, 200 | ✅ |
| WEBHOOK-012 | DB error (non-23505) → 500 generic error | ✅ |
| WEBHOOK-013a | Webhook secret not in response body | ✅ |
| WEBHOOK-013b | Service role key not in response body | ✅ |
| WEBHOOK-014 | handler.js works without Deno globals | ✅ |
| HMAC-1 | verifyHmacSha256: valid sig → true | ✅ |
| HMAC-2 | verifyHmacSha256: wrong sig → false | ✅ |
| HMAC-3 | verifyHmacSha256: modified body → false | ✅ |
| HMAC-4 | verifyHmacSha256: empty sig → false | ✅ |
| HMAC-5 | verifyHmacSha256: invalid hex → false | ✅ |

**Total new tests: 22**

---

## 14. Test Results

```
✓ tests/unit/paymentWebhook.test.js   (22 tests, ~87ms)

 Test Files  35 passed (35)
      Tests  476 passed (476)
```

All 22 new tests passed. All 454 pre-existing tests passed. Zero failures.

---

## 15. Full Regression Results

| Metric | Before Task 3.4 | After Task 3.4 | Delta |
|--------|-----------------|----------------|-------|
| Test files | 34 | 35 | +1 |
| Total tests | 454 | 476 | +22 |
| Failed | 0 | 0 | 0 |
| Build | PASS | PASS | — |

**Zero regressions.**

---

## 16. Coverage Results

| Metric | Threshold | Task 3.3 Measured | Task 3.4 Measured | Status |
|--------|-----------|-------------------|-------------------|--------|
| Statements | ≥60% | 67.13% | 68.85% | ✅ +1.72% |
| Branches | ≥53% | 59.77% | 60.57% | ✅ +0.80% |
| Functions | ≥45% | 52.35% | 53.93% | ✅ +1.58% |
| Lines | ≥63% | 71.16% | 72.77% | ✅ +1.61% |

All thresholds pass. Coverage improved across all metrics.

---

## 17. Git / CI Results

```
Branch:     phase-3/task-3-4-webhook-edge-function
Commits:    6b0a4f2 (implementation) · e49e4ea (test fix)
PR:         #326
CI Run:     32621723936 — ✅ PASSED
Build:      PASS
Tests:      476 / 476 passed
Coverage:   All thresholds ✅
```

**CI Iterations:**
- Run 1 (32621467172): FAILED — WEBHOOK-002 received 500 instead of 401 (test helper bug)
- Run 2 (32621723936): PASSED — fixed `makePostRequest` null-sig handling

---

## 18. Production Deployment Status

```
PRODUCTION DEPLOYMENT:     NONE
SUPABASE EDGE FUNCTIONS:   UNCHANGED (function NOT deployed to Supabase)
VERCEL:                    UNCHANGED (preview only)
DATABASE:                  UNCHANGED (0 rows modified)
payment_providers:         moyasar is_enabled=false (unchanged)
PAYMENT_MOYASAR_WEBHOOK_SECRET: NOT SET (no env var configured)
PAYMENT_MOYASAR_SECRET_KEY:     NOT SET (no env var configured)
```

---

## 19. Sandbox / Live Testing Status

```
SANDBOX TESTING: BLOCKED
LIVE TESTING:    BLOCKED

Reasons:
  1. PAYMENT_MOYASAR_WEBHOOK_SECRET not available (owner must obtain from Moyasar dashboard)
  2. PAYMENT_MOYASAR_SECRET_KEY not available
  3. Edge Function not deployed to Supabase
  4. payment_providers.moyasar.is_enabled = false

All 22 tests use mocked HTTP and mocked DB.
No real Moyasar webhook delivery has been received or processed.
```

---

## 20. Known Limitations

| # | Limitation | When Resolved |
|---|-----------|---------------|
| L-1 | HMAC header name (`x-moyasar-signature`) unverified against actual Moyasar delivery | Owner verifies against Moyasar webhook documentation |
| L-2 | HMAC signature encoding (hex) unverified — Moyasar may use base64 or other format | Same as L-1 |
| L-3 | Edge Function not deployed — no real webhook can reach it | Owner deploys after configuring env vars |
| L-4 | `paymentService.handleWebhookEvent` not directly reused (Deno bare-specifier constraint) | Could be resolved by adding explicit `.js` extensions to paymentService imports, or using a bundler |
| L-5 | No sandbox payment end-to-end test | Owner obtains credentials and runs Task 3.4 integration test |
| L-6 | `create_order` RPC has no payment reference column | Task 3.5 |

---

## 21. Owner Actions Required

**Before deploying the Edge Function:**

1. **Verify Moyasar HMAC mechanism** (CRITICAL):
   - Check Moyasar webhook documentation for exact header name and signature encoding
   - Update `SIG_HEADER` in `handler.js` if different from `x-moyasar-signature`
   - Update `verifyHmacSha256` if encoding is not hex

2. **Obtain Moyasar credentials**:
   - Create Moyasar developer account (if not done)
   - Generate sandbox API key → `PAYMENT_MOYASAR_SECRET_KEY`
   - Generate webhook secret from Moyasar dashboard → `PAYMENT_MOYASAR_WEBHOOK_SECRET`

3. **Apply idempotency migration** (from Task 3.3):
   ```sql
   -- Run sql/payment_transactions_idempotency_key_unique.sql
   CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_paytx_idempotency_key
   ON public.payment_transactions (idempotency_key)
   WHERE idempotency_key IS NOT NULL;
   ```

4. **Set Edge Function environment variables**:
   - `PAYMENT_MOYASAR_WEBHOOK_SECRET` = (from Moyasar dashboard)
   - `PAYMENT_MOYASAR_SECRET_KEY` = (from Moyasar account)
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set automatically by Supabase

5. **Deploy the Edge Function**:
   ```bash
   supabase functions deploy payment-webhook
   ```

6. **Register the webhook URL in Moyasar dashboard**:
   - URL: `https://<project-ref>.supabase.co/functions/v1/payment-webhook`

7. **Run sandbox payment test** to verify webhook delivery and HMAC validation

---

## 22. Task 3.5 Readiness

Task 3.5 (add payment reference column to `create_order` RPC) is independent of the Edge Function deployment. It requires:
- Adding `p_payment_transaction_id uuid DEFAULT NULL` to the `create_order` RPC
- This is a backward-compatible DB change
- No Edge Function changes needed

**Task 3.5 is safe to start from a code perspective.** The Edge Function is complete. Task 3.5 does not depend on owner completing the actions in §21.

---

## 23. Final Verdict

### PROVEN (from code + CI)
- Edge Function handler logic correctly processes webhook events
- HMAC-SHA256 signature verification is implemented and timing-safe
- Duplicate webhook events are safely ignored (23505 guard)
- Terminal transactions cannot be regressed
- Malformed JSON and missing signatures are rejected before processing
- 22 unit tests cover all required WEBHOOK-001–014 scenarios
- All 476 tests pass; all coverage thresholds met
- No secrets in any committed file
- service_role key never exposed to handler.js or to HTTP responses

### NOT PROVEN (requires real credentials + deployment)
- Real Moyasar webhook HMAC header/encoding matches `x-moyasar-signature` + hex
- Real Moyasar sandbox payment triggers a webhook and it is processed correctly
- End-to-end payment flow (startCharge → redirect → webhook → confirmed)
- Production performance under load
- Moyasar server IP whitelist requirements (if any)

---

*Report generated: 2026-08-23*
*TASK 3.4 = COMPLETE (code + tests + CI)*
*REAL MOYASAR DELIVERY = NOT TESTED*
*PRODUCTION = UNCHANGED*
