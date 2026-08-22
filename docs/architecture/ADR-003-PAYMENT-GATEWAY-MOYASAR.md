# ADR-003 — Payment Gateway: Moyasar

| Field | Value |
|-------|-------|
| **Status** | **ACCEPTED** |
| **Date** | 2026-08-22 |
| **Deciders** | Owner (Mohammed Saif) |
| **Ref in PROJECT_STATE.md** | ADR-52 |
| **Phase** | Phase 3 — Payment Integration |
| **Replaces** | — (first payment gateway decision) |
| **Superseded by** | — (pending future decision if gateway changes) |

---

## Context

SimSim is a multi-tenant SaaS restaurant management platform serving the Saudi market. Customers scan a QR code at their table, browse the digital menu, add items to a cart, and place an order.

As of Phase 2 completion (2026-08-22), the payment infrastructure is fully scaffolded but dormant:

- `src/payments/` directory: types, contracts (`PaymentAdapter`), empty adapter registry, stub `paymentService`, utils
- `sql/payments_gateway_foundation.sql`: three DB tables applied to production (`payment_providers`, `payment_transactions`, `payment_webhook_events`)
- All five providers seeded into `payment_providers` with `is_enabled = false`
- `docs/PAYMENTS.md`: full architecture documented (Adapter Pattern, flow, webhook design)

No payment gateway was wired. Customers currently cannot pay electronically; the platform operates cash-only.

This ADR documents the **selection of Moyasar** as the first payment gateway to integrate, resolving the P0-1 risk identified in the engineering audit:

> "No electronic payment gateway wired — `src/payments/` is an empty stub. Impact: Customers cannot pay electronically; business cannot collect digital payments."

---

## Decision

**Moyasar is the officially selected payment gateway for SimSim Phase 3.**

This decision is locked. Do not reopen gateway selection during Phase 3 implementation unless a new ADR is created to explicitly supersede this one.

---

## Reasons for Selecting Moyasar

The following factors informed this decision. Commercial terms (fees, settlement periods) are NOT documented here — those are verified by the owner directly from official Moyasar documentation and may change.

| Factor | Assessment |
|--------|-----------|
| **Saudi-market suitability** | Moyasar is a Saudi-native payment gateway, incorporated and regulated in the Kingdom of Saudi Arabia |
| **Mada support** | Supports Mada (Saudi domestic debit network) — the primary payment method for most Saudi consumers |
| **Apple Pay support** | Supports Apple Pay — high adoption rate in Saudi Arabia |
| **Card payments** | Supports Visa / Mastercard credit and debit |
| **Webhook support** | Provides server-to-server webhook notifications for payment state changes |
| **Idempotent payment creation** | API supports idempotency keys to prevent duplicate charges on retries |
| **API-based integration model** | REST API suitable for server-side integration (Edge Function or backend service) |
| **QR-menu restaurant checkout fit** | Designed for e-commerce checkout flows — applicable to QR-menu mobile checkout |
| **Abstraction foundation** | Integrates cleanly into the `PaymentAdapter` contract already scaffolded in `src/payments/contracts/` |
| **Saudi-first strategy alignment** | Matches SimSim's positioning as a Saudi-first restaurant SaaS |

---

## Alternatives Considered

| Gateway | Reason Not Selected |
|---------|-------------------|
| **Tap Payments** | Also strong for MENA; Moyasar selected due to Saudi-native focus and existing team familiarity. Tap remains a viable future alternative — `TapAdapter` can be added without changing business logic. |
| **HyperPay** | Multi-gateway aggregator; adds complexity not needed for initial integration. Can be added as a future adapter. |
| **Stripe** | Excellent API and documentation but limited Mada support — Mada is critical for Saudi market. |
| **Manual (cash only)** | Current state. Insufficient for business growth; does not support digital payment collection. |

---

## Consequences

### Positive
- Customers can pay digitally via Mada, Apple Pay, and cards
- Business can collect electronic payments
- P0-1 risk (engineering audit) resolved after Phase 3 implementation
- Adapter pattern means swapping or adding gateways later requires only a new adapter file

### Negative / Trade-offs
- Moyasar account, API credentials, and compliance requirements are the owner's responsibility (not in-repo)
- The webhook Edge Function requires Supabase service role key (sensitive secret management)
- Saudi regulatory requirements (ZATCA, PCI compliance for card data) must be verified by owner — NOT documented here

---

## Architecture Requirement: Provider Abstraction

This decision must NOT create vendor lock-in inside the application codebase.

The implementation MUST maintain the adapter boundary already defined in `docs/PAYMENTS.md` and `src/payments/contracts/PaymentAdapter.js`:

```
Customer Checkout UI
        ↓
  paymentService         (orchestration — gateway-agnostic)
        ↓
  PaymentAdapter         (abstract contract: createCharge / verifyPayment /
   interface              parseWebhook / refundPayment / mapStatus)
        ↓
  MoyasarAdapter         (Moyasar-specific implementation — Phase 3)
        ↓
  Moyasar REST API
```

Future gateways are additive only — no modification to `paymentService` or business logic:

```
MoyasarAdapter    ← Phase 3 (this decision)
TapAdapter        ← future (add adapter file + register)
HyperPayAdapter   ← future (add adapter file + register)
```

The `adapters/index.js` registry uses a `getAdapter(providerKey)` lookup. Adding a new gateway = one new file + one registry entry. Zero changes to `paymentService`, `create_order`, or checkout business logic.

---

## Security Requirements

The following constraints apply to ALL Phase 3 implementation work:

| Requirement | Rationale |
|-------------|-----------|
| Secret API keys must NEVER be exposed to the browser | Client-side keys can be extracted and abused |
| Provider secrets (API key, webhook secret) live in Supabase Edge Function env vars only | Never in repo files, never in `src/`, never in `vercel.json` |
| Webhook authenticity must be validated via HMAC signature before processing | Unauthenticated webhooks allow payment state forgery |
| Client-supplied payment status must NOT be trusted | Frontend can be manipulated; server-side verification is the source of truth |
| Sensitive card data must NOT be stored or logged | PCI scope concerns; Moyasar handles tokenisation |
| No secrets in git history | `.env` and credential files must remain gitignored |
| All provider responses validated server-side | Never assume success based on redirect URL parameters alone |

---

## Idempotency Requirements

Every payment creation operation must be protected against duplicate charges caused by:

- network timeouts on the client side
- browser refresh after submitting payment
- API timeout leading to client retry
- webhook retries from the provider
- user double-tap / double-click
- server-side retry logic

**Implementation requirement:**

The `paymentService.startCharge()` method must generate a stable `idempotency_key` (using the existing `newIdempotencyKey()` utility in `src/payments/utils/`) and pass it to the Moyasar API. The key must be derived from stable order context (e.g., `order_id + attempt_number`) — not random per-call — so that retrying the same logical payment does not create a new charge.

The `payment_transactions` table already has an `idempotency_key` column. This must be populated on every charge attempt.

---

## Webhook Requirements

The payment provider webhook is the authoritative server-side source of payment state.

The webhook Edge Function (to be created in `supabase/functions/payment-webhook/`) must implement the following guarantees:

| Requirement | Detail |
|-------------|--------|
| **Authentication** | Validate Moyasar HMAC signature before processing any payload |
| **Idempotency** | Insert into `payment_webhook_events(provider, event_id)` — unique constraint prevents double-processing |
| **Retry-safety** | If `processed_at` is not null → skip processing, return 200 (provider expects 200 to stop retrying) |
| **Observable** | Log `process_error` on failure; do NOT silently swallow errors |
| **Independent from browser** | Payment state must NOT depend on the browser success-page redirect completing |

Flow:

```
Moyasar → POST /payment-webhook (Edge Function)
            ↓
        Verify HMAC signature
            ↓
        INSERT INTO payment_webhook_events (idempotent)
            ↓
        If already processed → return 200 immediately
            ↓
        adapter.parseWebhook(payload, headers) → WebhookParseResult
            ↓
        paymentService.handleWebhookEvent(event)
            ↓
        UPDATE payment_transactions SET status = ...
            ↓
        If succeeded → UPDATE invoices / orders accordingly
            ↓
        UPDATE payment_webhook_events SET processed_at = now()
```

---

## Payment State Requirements

The system must distinguish at minimum between the following payment states (already defined in `src/payments/types/index.js` as `TransactionStatus`):

| State | Meaning |
|-------|---------|
| `initiated` | Charge created locally, not yet sent to Moyasar |
| `pending` | Awaiting customer completion / Moyasar confirmation |
| `succeeded` | Payment confirmed by Moyasar (via webhook or verify call) |
| `failed` | Payment failed |
| `cancelled` | Customer cancelled or timeout |
| `refunded` | Full refund processed |

**Do NOT implement the state machine in this task.**

The state machine will be implemented in Task 3.3 (wire paymentService) and Task 3.4 (webhook Edge Function).

---

## Order / Payment Boundary

A successful browser redirect to a success URL is NOT by itself sufficient proof that an order is paid.

The canonical payment flow (to be implemented in Phase 3) is:

```
Customer submits payment in UI
        ↓
paymentService.startCharge() → Moyasar API → redirect URL
        ↓
Customer redirected to Moyasar payment page
        ↓
Customer completes (or abandons) payment
        ↓
Moyasar sends webhook → Edge Function (authoritative)
        ↓
paymentService.handleWebhookEvent() updates transaction state
        ↓
Order becomes eligible for paid / confirmed state
        ↓
Customer redirect to SimSim success page (secondary confirmation only)
```

**Business rule:** Order confirmed-as-paid only after server-side webhook confirmation — not after browser redirect.

---

## Payment UI Requirement

The payment backend integration (Tasks 3.2–3.5) alone is insufficient for a complete customer payment experience.

SimSim must also provide a complete customer payment UI journey:

```
Cart
  → Checkout (existing)
  → Payment Method selection
  → Payment (Moyasar redirect or embedded form)
  → Processing state
  → Success / Failure screen
  → Order Confirmation
```

The Payment UI must be explicitly tracked as part of Phase 3 completion. It is not implemented in Task 3.1 (this ADR) and is not included in the current audit task list (Tasks 3.2–3.5). **The owner must confirm whether the Payment UI is a Phase 3 sub-task or a separate subsequent phase before Task 3.3 begins.**

---

## Phase 3 Implementation Implications

| Task | Implication of this ADR |
|------|------------------------|
| **Task 3.2** | Implement `src/payments/adapters/moyasar.js` — extends `PaymentAdapter`, implements all 5 methods against Moyasar REST API |
| **Task 3.3** | Replace stub throws in `paymentService.js` with real orchestration calling `getAdapter('moyasar')` |
| **Task 3.4** | Create `supabase/functions/payment-webhook/index.ts` — handles Moyasar webhook POST, validates HMAC, processes idempotently |
| **Task 3.5** | Add payment reference parameter to `create_order` RPC (`p_payment_transaction_id uuid DEFAULT NULL`) — backward compatible |
| **Payment UI** | Status TBD — owner must confirm scope before Task 3.3 |

---

## Future Migration Path

If a future ADR selects an additional or replacement gateway:

1. Create `src/payments/adapters/<gateway>.js` implementing `PaymentAdapter`
2. Register in `src/payments/adapters/index.js`
3. Update `payment_providers` table: `UPDATE payment_providers SET is_enabled=true WHERE key='<new>'`
4. Deploy a new or updated webhook Edge Function

**No changes required to:** `paymentService.js`, `create_order` RPC, checkout business logic, or any other application module.

---

## References

| Document | Location |
|----------|----------|
| Payment foundation architecture | `docs/PAYMENTS.md` |
| Payment adapter contract | `src/payments/contracts/PaymentAdapter.js` |
| Payment types / enums | `src/payments/types/index.js` |
| Adapter registry (empty — to be filled in Task 3.2) | `src/payments/adapters/index.js` |
| paymentService stub (to be wired in Task 3.3) | `src/payments/services/paymentService.js` |
| DB tables: providers, transactions, webhook_events | `sql/payments_gateway_foundation.sql` |
| Engineering audit Phase 3 scope | `SIMSIM_CURRENT_STATE_ENGINEERING_AUDIT.md` §N |
| Phase 3 Pre-Flight Report | `reports/PHASE_3_PREFLIGHT_REPORT.md` |
| PROJECT_STATE.md cross-reference | ADR-52 |

---

*ADR created: 2026-08-22*
*Status: ACCEPTED — Moyasar is the official Phase 3 payment gateway*
*Implementation: NOT YET EXECUTED — this document is decision-only*
