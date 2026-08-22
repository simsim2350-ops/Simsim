# Task 3.1 — Payment Gateway Decision Report

**Date:** 2026-08-22
**Task:** 3.1 — Select Payment Gateway
**Status:** ✅ COMPLETE

---

## Executive Summary

Task 3.1 is the official gateway-selection step for Phase 3 (Payment Integration). The task is **documentation and decision-lock only** — no application code, no payment implementation, no credentials, no production changes.

**TASK 3.1 = COMPLETE**
**MOYASAR = OFFICIAL PAYMENT GATEWAY**
**PAYMENT IMPLEMENTATION = NOT YET EXECUTED**
**TASK 3.2 = NOT STARTED**

---

## Decision

**Primary Payment Gateway: Moyasar**

Moyasar is the officially selected and locked payment gateway for SimSim Phase 3.

This decision is recorded in:
- `docs/architecture/ADR-003-PAYMENT-GATEWAY-MOYASAR.md` — Status: **ACCEPTED**
- `PROJECT_STATE.md` — ADR-52 pointer

The decision is final for Phase 3. It may only be changed by a future ADR that explicitly supersedes ADR-52 / ADR-003.

---

## Why Moyasar

| Factor | Detail |
|--------|--------|
| Saudi-market suitability | Saudi-native payment gateway, incorporated and regulated in the Kingdom |
| Mada support | Primary Saudi domestic debit network — critical for the target market |
| Apple Pay support | High adoption rate in Saudi Arabia |
| Card payments | Visa / Mastercard credit and debit |
| Webhook support | Server-to-server payment state notifications |
| Idempotent payment creation | API supports idempotency keys — prevents duplicate charges on retries |
| API-based integration model | REST API suitable for server-side Edge Function integration |
| QR-menu restaurant checkout fit | Applicable to mobile-first QR-menu checkout flow |
| Adapter boundary compatibility | Integrates cleanly into `PaymentAdapter` contract already scaffolded |
| Saudi-first strategy alignment | Matches SimSim's Saudi-first restaurant SaaS positioning |

**Note:** Commercial terms (fees, settlement periods, contractual conditions) are NOT documented here. These are verified by the owner from official Moyasar documentation and may change.

---

## Alternatives Considered

| Gateway | Reason Not Selected |
|---------|-------------------|
| Tap Payments | Strong MENA option; Moyasar selected for Saudi-native focus. Tap remains viable as a future `TapAdapter`. |
| HyperPay | Multi-gateway aggregator; adds complexity not needed for initial integration. Can be added later. |
| Stripe | Excellent API; limited Mada support — Mada is critical for Saudi market. |
| Manual (cash only) | Current state; insufficient for business growth. |

---

## Architecture Decision

The implementation MUST maintain the adapter abstraction boundary defined in `docs/PAYMENTS.md` and `src/payments/contracts/PaymentAdapter.js`:

```
Customer Checkout UI
        ↓
  paymentService         (orchestration — gateway-agnostic)
        ↓
  PaymentAdapter         (abstract contract)
        ↓
  MoyasarAdapter         (Phase 3 — to be implemented in Task 3.2)
        ↓
  Moyasar REST API
```

Future gateways are additive — zero changes to business logic:

```
MoyasarAdapter    ← Phase 3 (this decision)
TapAdapter        ← future (new file + registry entry only)
HyperPayAdapter   ← future (new file + registry entry only)
```

---

## Security Requirements

Documented in `docs/architecture/ADR-003-PAYMENT-GATEWAY-MOYASAR.md` §Security Requirements.

Summary:

| Requirement | Status |
|-------------|--------|
| Secret API keys never exposed to browser | Required — enforced by server-side Edge Function |
| Provider secrets in Supabase Edge Function env vars only | Required — never in repo |
| Webhook HMAC signature validation before processing | Required |
| Client-supplied payment status not trusted | Required |
| No storage or logging of sensitive card data | Required |
| No secrets in git history | Required |
| All provider responses validated server-side | Required |

**No secrets were added in this task. No credentials exist in the repository.**

---

## Idempotency Requirements

Documented in ADR-003 §Idempotency Requirements.

Every payment creation must be protected against:
- Network timeouts / retries
- Browser refresh after payment submission
- User double-tap / double-click
- Webhook retries from provider

The `paymentService.startCharge()` implementation (Task 3.3) must:
- Generate a stable `idempotency_key` using `newIdempotencyKey()` (`src/payments/utils/index.js`)
- Derive the key from stable order context — not random per call
- Populate the `payment_transactions.idempotency_key` column on every charge attempt

---

## Webhook Requirements

Documented in ADR-003 §Webhook Requirements.

The webhook Edge Function (Task 3.4) must guarantee:

| Property | Requirement |
|----------|-------------|
| Authenticated | Validate Moyasar HMAC signature before any processing |
| Idempotent | `UNIQUE(provider, event_id)` in `payment_webhook_events` prevents double-processing |
| Retry-safe | If `processed_at` is not null → return 200 immediately |
| Observable | Log `process_error` on failure; no silent swallowing |
| Independent | Payment state must not depend on browser redirect completing |

---

## Payment UI Requirement

Documented in ADR-003 §Payment UI Requirement.

The payment backend (Tasks 3.2–3.5) alone is insufficient. SimSim must provide a complete customer journey:

```
Cart → Checkout → Payment Method → Payment → Processing → Success/Failure → Order Confirmation
```

**The Payment UI is NOT in the current engineering audit task list (Tasks 3.2–3.5).**

The owner must confirm before Task 3.3 begins whether the Payment UI is:
- (A) A Phase 3 sub-task, OR
- (B) A separate subsequent phase

---

## Files Created

| File | Type | Content |
|------|------|---------|
| `docs/architecture/ADR-003-PAYMENT-GATEWAY-MOYASAR.md` | New file | Full ADR — Status: ACCEPTED |
| `docs/architecture/` | New directory | First entry in docs/architecture/ |
| `reports/TASK_3_1_PAYMENT_GATEWAY_DECISION_REPORT.md` | New file | This report |

---

## Files Modified

| File | Change | Lines Added |
|------|--------|-------------|
| `PROJECT_STATE.md` | Added ADR-52 pointer (one paragraph) | +2 |
| `docs/INDEX.md` | Added docs/architecture/ entry and ADR-003 reference | +7 |

---

## Files NOT Modified

No application source code was modified. The following are confirmed unchanged:

| Category | Files |
|----------|-------|
| Application source | `src/**` — UNTOUCHED |
| Payment scaffold | `src/payments/**` — UNTOUCHED |
| Payment SQL | `sql/payments_gateway_foundation.sql` — UNTOUCHED |
| Package config | `package.json` — UNTOUCHED |
| Lock file | `package-lock.json` — UNTOUCHED |
| CI pipeline | `.github/workflows/ci.yml` — UNTOUCHED |
| Vite config | `vite.config.js` — UNTOUCHED |
| Vercel config | `vercel.json` — UNTOUCHED |
| Supabase functions | `supabase/functions/**` — UNTOUCHED |
| Environment variables | `.env*` — UNTOUCHED |
| All SQL migrations | `sql/*.sql` — UNTOUCHED |

---

## Validation Performed

| Check | Result |
|-------|--------|
| ADR file exists at `docs/architecture/ADR-003-PAYMENT-GATEWAY-MOYASAR.md` | ✅ CONFIRMED |
| ADR Status field = ACCEPTED | ✅ CONFIRMED |
| ADR clearly names Moyasar as selected gateway | ✅ CONFIRMED |
| PROJECT_STATE.md references ADR-52 pointing to ADR file | ✅ CONFIRMED |
| docs/INDEX.md updated with new architecture/ directory | ✅ CONFIRMED |
| No secrets or API keys in any created file | ✅ CONFIRMED |
| No application code modified (`src/`) | ✅ CONFIRMED |
| No payment SDK installed | ✅ CONFIRMED |
| `package.json` unmodified | ✅ CONFIRMED |
| No Supabase schema changes | ✅ CONFIRMED |
| No Edge Functions created or modified | ✅ CONFIRMED |
| No production deployment triggered | ✅ CONFIRMED |

---

## Git Status

```
On branch phase-2-task-2-6-coverage-gate

Changes not staged for commit:
  modified:   PROJECT_STATE.md    (+2 lines — ADR-52 pointer)
  modified:   docs/INDEX.md       (+7 lines — architecture/ directory entry)

Untracked files:
  docs/architecture/              (new directory + ADR-003 file)
  reports/TASK_3_1_PAYMENT_GATEWAY_DECISION_REPORT.md  (this report)
```

---

## Git Diff Summary

```
PROJECT_STATE.md  | 2 ++   (ADR-52 one-paragraph pointer → docs/architecture/ADR-003)
docs/INDEX.md     | 7 ++-  (architecture/ dir + ADR-003 file entry)
```

**All other files: zero changes.**

---

## Deployment Status

```
PRODUCTION DEPLOYMENT: NONE
DATABASE CHANGES:      NONE
SUPABASE CHANGES:      NONE
VERCEL CHANGES:        NONE
PACKAGE CHANGES:       NONE
APPLICATION CODE:      UNCHANGED
```

---

## Risks / Open Questions

| # | Item | Owner Action Required |
|---|------|-----------------------|
| R-1 | **Payment UI scope** — not in current audit task list (3.2–3.5). Must be confirmed as Phase 3 sub-task or separate phase. | Confirm before Task 3.3 begins |
| R-2 | **ZATCA compliance** — PROJECT_STATE.md explicitly defers "توافق ZATCA الرسمي". Legal review needed before go-live. | Owner + legal counsel |
| R-3 | **Moyasar account + credentials** — must be created by owner before Task 3.2 can be tested. Sandbox credentials needed. | Owner action before Task 3.2 implementation |
| R-4 | **Webhook secret rotation procedure** — must be documented once credentials are obtained. | Owner action at Task 3.4 |
| R-5 | **schema_migrations table** — created in Phase 1 as repo file only. Must be verified as applied to production DB before Task 3.5 SQL migration. | Owner / DBA action before Task 3.5 |

---

## Next Task

**Task 3.2 — Implement MoyasarAdapter**

Scope: Create `src/payments/adapters/moyasar.js` extending `PaymentAdapter`, implementing all 5 methods against the Moyasar REST API. Register in `src/payments/adapters/index.js`.

**TASK 3.2 = NOT STARTED. Awaiting explicit owner approval.**

---

*Report generated: 2026-08-22*
*Task 3.1 — Payment Gateway Decision: COMPLETE*
