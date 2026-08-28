# Phase 3 — Pre-Flight Report

**Date:** 2026-08-22
**Prepared by:** Claude Code (claude-sonnet-4-6) — Read-Only Inspection
**Source document:** `SIMSIM_CURRENT_STATE_ENGINEERING_AUDIT.md` §N (Prioritized Remediation Roadmap)
**Status:** INSPECTION ONLY — no files modified, no implementation started

---

## 1. Official Phase 3 Objective

**Phase 3 — Payment Integration (Weeks 9–16)**

> Wire a live payment gateway into the existing payment foundation so that restaurant customers can pay electronically for orders placed via the QR menu.

Source: Engineering Audit §N, §M (P0-1: "No payment gateway — customers cannot pay electronically; business cannot collect digital payments").

This is the only Phase 3 defined in the official engineering roadmap. It is distinct from:
- ADR-39 "Loyalty Phase 3" (Seasonal Campaigns — already complete per PROJECT_STATE.md)
- ADR-46 "Customer Order Journey PHASE 3" (Checkout UX hardening — already complete per PROJECT_STATE.md)
- "Phase 4 — Infrastructure Hardening" (separate phase, out of scope here)

---

## 2. Every Phase 3 Task in Order

| # | Task | Priority | Owner |
|---|------|----------|-------|
| **3.1** | Select payment gateway (Moyasar / HyperPay / Tap Payments / Stripe) | **P0** | **Human decision — REQUIRED** |
| **3.2** | Implement gateway adapter in `src/payments/adapters/` | **P0** | Local Claude Code |
| **3.3** | Wire `paymentService.js` to adapter | **P0** | Local Claude Code |
| **3.4** | Add payment webhook Edge Function | **P0** | Local Claude Code |
| **3.5** | Update `create_order` RPC to accept payment reference | **P0** | Local Claude Code (SQL) |

All five tasks are classified **P0** in the official audit. All are currently unimplemented.

---

## 3. Priority of Each Task

All tasks are **P0 — Critical**. Per the audit:

> "P0 — Critical (Must Fix Before Growth)"
> "P0-1: No electronic payment gateway wired — `src/payments/` is an empty stub. Impact: Customers cannot pay electronically; business cannot collect digital payments."

There is no lower-priority fallback within Phase 3. The entire phase is a P0 block.

---

## 4. Dependencies Between Tasks

```
3.1 — Select gateway (Human Decision)
  │
  ├──▶ 3.2 — Implement gateway adapter
  │         (gateway must be known to write API calls, HMAC verification, status mapping)
  │              │
  │              ├──▶ 3.3 — Wire paymentService.js
  │              │         (adapter must exist to call getAdapter())
  │              │
  │              └──▶ 3.4 — Webhook Edge Function
  │                        (gateway-specific payload parsing + signature verification)
  │
  └──▶ 3.5 — Update create_order RPC
             (payment_reference column/parameter — can be designed in parallel with 3.2,
              but must be merged before payment flow goes live)
```

### Hard blockers

| Dependent | Blocked by | Reason |
|-----------|-----------|--------|
| 3.2 | 3.1 | Cannot implement adapter without knowing which gateway API to call |
| 3.3 | 3.2 | `paymentService` calls `getAdapter(provider)` — adapter must be registered |
| 3.4 | 3.1 + 3.2 | Webhook parsing is gateway-specific (HMAC key, payload schema) |
| 3.5 | None (can start independently) | SQL migration does not need gateway choice — but must be live before end-to-end flow |

### Task 3.1 is the hard gate for the entire phase

Task 3.1 is formally marked "Human decision" in the audit. Claude Code **cannot select a payment gateway**. This decision determines every API call, webhook verification method, secret key structure, and test credential needed for 3.2, 3.3, and 3.4.

---

## 5. Required Owner / Manual Actions

| # | Action | When Needed | Why |
|---|--------|-------------|-----|
| **O-1** | **Select payment gateway** (Moyasar, HyperPay, Tap, Stripe, or other) | Before Task 3.2 can start | All implementation depends on this |
| **O-2** | Create developer account + obtain sandbox API key(s) from chosen gateway | Before Task 3.2 testing | Required to test adapter locally / in CI |
| **O-3** | Set Edge Function environment variables (`PAYMENT_API_KEY`, `PAYMENT_WEBHOOK_SECRET`) in Supabase dashboard | Before Task 3.4 goes live | Secrets must never enter the repository; live in Supabase env only |
| **O-4** | Enable chosen gateway in DB: `UPDATE payment_providers SET is_enabled=true WHERE key='<chosen>';` | After 3.2–3.4 complete and tested | DB record controls which adapter is active at runtime |
| **O-5** | Test full payment flow in sandbox environment before enabling live mode | Before setting `mode='live'` in `payment_providers` | Business risk: live mode processes real money |
| **O-6** | Rotate webhook secret periodically; document rotation procedure | Ongoing | Security hygiene |

---

## 6. Existing Repository Files Relevant to Each Task

### Task 3.1 — Gateway Selection (Human Decision)

| File | Relevance |
|------|-----------|
| `docs/PAYMENTS.md` | Full architecture doc — lists Moyasar, Tap, HyperPay, Stripe as candidates |
| `src/payments/types/index.js` | `PaymentProvider` enum already defines: `MOYASAR`, `TAP`, `HYPERPAY`, `STRIPE`, `MANUAL` |
| `sql/payments_gateway_foundation.sql` | Seeds all 5 providers into `payment_providers` table (all `is_enabled=false`) |
| `PROJECT_STATE.md` ADR-34 | Documents original decision: "اختيار المزوّد قرار بيانات لا كود" (gateway choice is a data decision, not a code change) |

### Task 3.2 — Gateway Adapter

| File | Relevance |
|------|-----------|
| `src/payments/contracts/PaymentAdapter.js` | Base class to extend — 5 methods: `createCharge`, `verifyPayment`, `parseWebhook`, `refundPayment`, `mapStatus` |
| `src/payments/adapters/index.js` | **Empty adapter registry** — new adapter class registers here |
| `src/payments/types/index.js` | `TransactionStatus`, `WebhookEventType`, `PaymentProvider` — all status enums |
| `src/payments/utils/index.js` | `newIdempotencyKey()`, `normalizeAmount()`, `isTerminalStatus()` |
| `docs/PAYMENTS.md` §4 | Adapter Pattern diagram + per-method responsibilities |
| `docs/PAYMENTS.md` §5 | "How to add a new provider" step-by-step (documented, awaiting implementation) |

### Task 3.3 — Wire paymentService.js

| File | Relevance |
|------|-----------|
| `src/payments/services/paymentService.js` | **Stub** — all 4 methods throw `"مرحلة الأساس فقط"`. Replace throws with real logic |
| `src/payments/adapters/index.js` | `getAdapter(providerKey)` — called by paymentService after 3.2 |
| `docs/PAYMENTS.md` §2 | Payment Flow diagram (5-step sequence to implement) |
| `sql/payments_gateway_foundation.sql` | `payment_transactions` table structure — service writes here |

### Task 3.4 — Webhook Edge Function

| File | Relevance |
|------|-----------|
| `supabase/functions/create-platform-admin/index.ts` | Only existing Edge Function — reference for project structure, headers, error handling |
| `src/payments/services/paymentService.js` | `handleWebhookEvent()` — the Edge Function calls this after parsing |
| `src/payments/contracts/PaymentAdapter.js` | `parseWebhook(payload, headers)` — called in Edge Function to validate signature |
| `sql/payments_gateway_foundation.sql` | `payment_webhook_events` — idempotency table (`UNIQUE (provider, event_id)`) |
| `docs/PAYMENTS.md` §3 | Webhook Flow (parse → idempotency check → update transaction → mark processed_at) |
| `PROJECT_STATE.md` ADR-34 | "لا Edge Functions في الأساس — يُبنى لاحقاً عبر service_role" |

### Task 3.5 — Update create_order RPC

| File | Relevance |
|------|-----------|
| `sql/order_idempotency.sql` | **Current live version** of `create_order` (12 params, no payment reference) + `create_order_from_table_qr` |
| `sql/order_journey_hotfix.sql` | Earlier version of `create_order` (11 params) — superseded by idempotency version |
| `sql/payments_gateway_foundation.sql` | `payment_transactions` table — the FK target for any `payment_transaction_id` added to orders |
| `PROJECT_STATE.md` ADR-25 | Documents 11→12 arg migration history — important for understanding signature evolution |
| `PROJECT_STATE.md` ADR-34 | Notes payment_transactions.invoice_id links to billing invoices, not orders directly |

---

## 7. Current Implementation Status

### Payment Infrastructure (already in place)

| Item | Status | Location |
|------|--------|----------|
| Payment types / Enums | ✅ COMPLETE | `src/payments/types/index.js` |
| PaymentAdapter contract | ✅ COMPLETE | `src/payments/contracts/PaymentAdapter.js` |
| Adapter registry (empty) | ✅ SCAFFOLD ONLY | `src/payments/adapters/index.js` |
| paymentService (stub) | ✅ SCAFFOLD ONLY — throws on all methods | `src/payments/services/paymentService.js` |
| Payment utils | ✅ COMPLETE | `src/payments/utils/index.js` |
| `payment_providers` DB table | ✅ APPLIED (5 providers, all disabled) | `sql/payments_gateway_foundation.sql` |
| `payment_transactions` DB table | ✅ APPLIED | `sql/payments_gateway_foundation.sql` |
| `payment_webhook_events` DB table | ✅ APPLIED | `sql/payments_gateway_foundation.sql` |
| docs/PAYMENTS.md architecture doc | ✅ COMPLETE | `docs/PAYMENTS.md` |

### What is NOT implemented

| Item | Status | Gap |
|------|--------|-----|
| Gateway adapter (any provider) | ❌ NOT STARTED | `src/payments/adapters/` is empty |
| paymentService live logic | ❌ NOT STARTED | All 4 methods throw "foundation only" |
| Webhook Edge Function | ❌ NOT STARTED | Only `create-platform-admin` exists |
| `create_order` payment reference param | ❌ NOT STARTED | No payment column in orders or RPC |
| Customer checkout UI for online payment | ❌ NOT IN AUDIT TASK LIST | CartDrawer/CheckoutFlow show no payment step |
| Payment confirmation / return URL handler | ❌ NOT IN AUDIT TASK LIST | No `/payment/callback` route in App.jsx |

---

## 8. Risks / Blockers

### Critical Blockers

| # | Risk | Impact | Mitigation |
|---|------|--------|-----------|
| **R-1** | **Task 3.1 is a hard human gate** — no implementation can start until owner selects gateway | Blocks 3.2, 3.3, 3.4 entirely | Owner must decide before any code is written |
| **R-2** | **Each gateway has a different API** — Moyasar, Tap, HyperPay, Stripe each have unique charge creation, webhook schemas, and HMAC verification | Adapter for one gateway is non-transferable to another | Choose once and commit; changing gateway requires rewriting 3.2–3.4 |

### High Risks

| # | Risk | Impact | Mitigation |
|---|------|--------|-----------|
| **R-3** | **create_order signature change (Task 3.5)** — adding a payment_reference parameter requires a DB migration on a live production function | Could break existing order creation if migration is incorrect | Add parameter as `DEFAULT NULL` for full backward compatibility |
| **R-4** | **Webhook secret must never enter the repo** — Edge Function env vars are server-side only | Secret leak = attacker can forge payment confirmations | Store only in Supabase project env; never in `supabase/functions/*/` source files |
| **R-5** | **No payment UI identified in audit task list** — tasks 3.2–3.5 cover backend only; the customer checkout UI is not explicitly listed | Payment gateway wired but customers have no UI to use it | Phase 3 may need a sub-task for the payment UI (CartDrawer / checkout flow update) — this must be confirmed by owner |
| **R-6** | **Supabase SIGILL constraint** — vitest and any Node-based test running is impossible in Termux; all tests require CI | Cannot verify adapter locally | All testing via GitHub Actions CI — same constraint as Phases 1 & 2 |
| **R-7** | **DB migration tracking** — `schema_migrations` table created in Phase 1 but `sql/000_schema_migrations_table.sql` was filed in repo only; was it applied to production? | Task 3.5 SQL migration may be missed | Owner must verify `schema_migrations` table exists in production DB before Task 3.5 |
| **R-8** | **Payment flow intersects with billing system (ADR-29)** — `payment_transactions` references `invoices` (SaaS billing), not `orders` | create_order RPC adding payment_ref needs careful design: link to payment_transactions or directly to provider_ref | Clarify with owner: is Phase 3 targeting customer order payments, subscription payments, or both? |

### Medium Risks

| # | Risk | Impact | Mitigation |
|---|------|--------|-----------|
| **R-9** | **Saudi compliance (ZATCA)** — PROJECT_STATE.md explicitly defers "توافق ZATCA الرسمي" | Legal risk if payment processing goes live without ZATCA-compliant receipts | Owner should consult legal before live mode |
| **R-10** | **Webhook idempotency table** — `payment_webhook_events` enforces `UNIQUE(provider, event_id)` but has no auto-retry logic | Missed webhook events require manual replay | Edge Function must log failures; monitoring required |

---

## 9. Recommended Execution Order

```
STOP ── Owner decides gateway (Task 3.1) ──▶ ALL subsequent tasks unblock

After 3.1 confirmed:

[Step A — parallel safe]
  ├── 3.5 — SQL migration: add payment_ref param to create_order (DEFAULT NULL)
  │         Independent of gateway choice; can be drafted now
  │
  └── 3.2 — Implement gateway adapter in src/payments/adapters/<gateway>.js
             Extends PaymentAdapter; implements all 5 methods for chosen gateway

[Step B — after 3.2 complete]
  ├── 3.3 — Wire paymentService.js (replace "foundation only" throws with real calls)
  │
  └── 3.4 — Add webhook Edge Function (supabase/functions/payment-webhook/)

[Step C — after 3.2 + 3.3 + 3.4 + 3.5 all complete]
  └── Integration test in sandbox → enable gateway in DB → go live

[Step D — not in current audit task list, may need owner decision]
  └── Payment UI: update CartDrawer / checkout flow to show payment step
```

---

## 10. Exact First Task to Execute

**Task 3.1 — Select Payment Gateway**

This is not a Claude Code implementation task. It is a **human/owner business decision**.

Before any code is written, the owner must answer:

> **Which payment gateway should be integrated?**
>
> Options defined in the audit (Engineering Audit §R-1, Engineering Audit §N Task 3.1):
> - **Moyasar** — Saudi-native, SAR support, common for local merchants
> - **HyperPay** — Multi-gateway aggregator, MENA-focused
> - **Tap Payments** — Saudi/MENA, supports cards + Apple Pay + MADA
> - **Stripe** — Global, excellent docs, limited MADA support
>
> The gateway choice determines every implementation detail for Tasks 3.2, 3.3, and 3.4.
> Claude Code cannot make this decision.

**Claude Code's first implementation task (once 3.1 is decided) will be Task 3.2** — implementing the gateway adapter — unless the owner prefers to start with Task 3.5 (SQL migration) which can be drafted independently.

---

## Additional Observation (Outside Phase 3 Scope)

**Gap not in audit task list:** Tasks 3.2–3.5 wire the backend payment infrastructure but the audit does not explicitly list a frontend task for adding a payment step to the customer checkout flow (`CartDrawer.jsx` / `useCheckout.js`). Before implementation begins, the owner should confirm whether:
- (A) A payment UI sub-task should be added to Phase 3, OR
- (B) The payment UI is planned for a subsequent phase

This does not block Phase 3 pre-flight — it is noted as a gap for owner awareness.

---

## Source Cross-References

| Section | Source |
|---------|--------|
| Phase 3 task list | `SIMSIM_CURRENT_STATE_ENGINEERING_AUDIT.md` §N |
| P0-1 risk | `SIMSIM_CURRENT_STATE_ENGINEERING_AUDIT.md` §M |
| Gateway question R-1 | `SIMSIM_CURRENT_STATE_ENGINEERING_AUDIT.md` §R |
| Payment foundation architecture | `docs/PAYMENTS.md` |
| Payment ADR | `PROJECT_STATE.md` ADR-34 |
| Billing system (adjacent) | `PROJECT_STATE.md` ADR-29 |
| Order creation RPC | `sql/order_idempotency.sql` |
| DB tables applied | `sql/payments_gateway_foundation.sql` |
| Adapter contract | `src/payments/contracts/PaymentAdapter.js` |
| Adapter registry (empty) | `src/payments/adapters/index.js` |
| paymentService stub | `src/payments/services/paymentService.js` |
| Only existing Edge Function | `supabase/functions/create-platform-admin/index.ts` |

---

*Report generated: 2026-08-22*
*Inspection mode: READ ONLY — no files modified, no implementation performed*
*Phase 3 implementation: NOT STARTED — awaiting Task 3.1 owner decision*
