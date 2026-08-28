# Task 3.6D.4 — Payment-First Redirect / Callback Handling

**AUDIT-ONLY OUTCOME. No code written. No files modified. Regression baseline unchanged at 853/853.**

---

# EXECUTIVE_SUMMARY

Task 3.6D.4 asked for a full audit first, followed by implementation of only the "verified portion" if one exists, or a clear blocker report if it does not. **This report concludes: no safely-implementable, non-speculative portion of 3.6D.4 exists yet, and the task stops here without writing production code**, per its own explicit instruction for this exact outcome.

Two distinct things were investigated, and they resolve differently:

1. **The classic "G-6" redirect-shape risk** (what query parameters Moyasar appends to `callback_url`, and whether they can be trusted) — **this is avoidable by design, not a hard blocker.** The architecture already established in `TASK_3_6D_C_PAYMENT_FIRST_SECURITY_IMPLEMENTATION_SPEC.md` and implemented in `TASK_3_6D_E_...` never asked the browser to trust anything Moyasar puts in the URL — the return URL's only meaningful parameter is `payment_callback=<paymentIdempotencyKey>`, a value **we** generate and control end-to-end. A callback page that ignores every Moyasar-specific parameter and relies solely on this self-issued key sidesteps G-6's redirect-shape ambiguity entirely, exactly as this task's own CRITICAL section demands ("Do NOT assume that a browser redirect parameter is proof that payment succeeded").

2. **The real, load-bearing blocker: no server-side capability exists for a browser to safely resolve "what happened to payment attempt X" given only its idempotency key.** RLS on `payment_transactions` requires `is_platform_admin()` — an anonymous browser client cannot read it directly, with or without an idempotency key. The only two pieces of server logic that COULD answer this question (`paymentService.confirmCharge()`, which calls Moyasar's real, documented `GET /v1/payments/{id}` and updates the row, and the existing `payment-webhook`, which independently updates the same row asynchronously) both require `service_role` and are not reachable from any existing Edge Function. Building a new one — its request/response contract, security model, and CORS/auth posture — would be genuinely new server-side infrastructure invented on the spot, with no prior specification or owner approval, unlike every other server surface built in this arc (`payment-first-checkout` itself went through a dedicated `TASK_3_6D-C` specification-and-approval cycle *before* `TASK_3_6D-E` implemented it). Inventing that contract unilaterally inside this task would repeat exactly the kind of undesigned-infrastructure risk this session has consistently avoided elsewhere.

This is a **narrower, more precise** blocker than "G-6 blocks everything" — it is not fundamentally about Moyasar's redirect behavior (which can be designed around), but about a missing, unspecified server capability that this task is not the right place to invent unilaterally. See BLOCKERS for the exact unblock path.

---

# APPROVED_SOURCE_SPECIFICATION

No standalone "3.6D.4 specification" document exists (consistent with 3.6D.3's own finding that not every phase in this arc got its own numbered spec task). The closest approved sources, all read in full for this audit:

- `reports/TASK_3_6D_A_CHECKOUT_UX_ARCHITECTURE_AUDIT.md` — `SESSION_RETRY_CONTINUITY` (idempotency-key persistence design), `ERROR_STATE_MAPPING` (required UX per outcome), and the `IMPLEMENTATION_PLAN`'s own 3.6D.4 entry: *"the one genuinely new architectural piece — a callback destination... capable of resuming a persisted payment attempt and calling whatever confirms its outcome... Dependencies: 3.6D.1, 3.6D.3, and real Moyasar verification (G-6)... Risk: highest of any phase — the one area this audit could not fully de-risk from existing code alone."*
- `reports/TASK_3_6D_B_PAYMENT_FIRST_SERVER_ENTRY_POINT_AUDIT.md` — explicitly lists 3.6D.4 as `BLOCKED` on both the Edge Function existing (now resolved, 3.6D-E) *and* real Moyasar verification (`REQUIRES G-6`).
- `reports/TASK_3_6D_C_PAYMENT_FIRST_SECURITY_IMPLEMENTATION_SPEC.md` — same `BLOCKED + REQUIRES G-6` verdict in its `DEPENDENCY_GATES` table; also the authoritative source for the `returnUrl`/`payment_callback` query-parameter design actually implemented.
- `reports/TASK_3_6D_E_PAYMENT_FIRST_EDGE_FUNCTION_IMPLEMENTATION_REPORT.md` — confirms `returnUrl` construction is live and tested (`PFCX-37`..`PFCX-40`): `${PUBLIC_APP_BASE_URL}/menu/${slug}?payment_callback=${idempotencyKey}[&t=${qrToken}]`.
- `reports/TASK_3_6D_2_...` / `reports/TASK_3_6D_3_...` — confirm `usePaymentFirstCheckout`, `PaymentFirstPriceConfirmation`, `PaymentFirstCheckoutPanel`, and `usePaymentIdempotencyKey` as the unmodified, reusable building blocks available to any future callback implementation.

All four independent audits reach the same verdict for this phase; this report is the first to actually act on that verdict rather than defer it further, and refines *why* it's blocked.

---

# ARCHITECTURE_AUDIT

**Files inspected** (all read in full, none modified):
- `src/payments/adapters/moyasar.js` — `createCharge` sets `callback_url: input.returnUrl`; `verifyPayment(providerRef)` calls Moyasar's documented `GET /v1/payments/{id}`, mapping its real status via the same `mapStatus()` used everywhere else. **No code anywhere in this repository parses or documents what query parameters Moyasar appends to `callback_url` on redirect** — confirmed by search; this has never been observed, only ever discussed as an open unknown (G-6).
- `src/payments/services/paymentService.js` — `confirmCharge(providerRef, {db})` (lines 119–148, pre-existing, unmodified, already tested `PS-006`–`PS-009`): loads the transaction by `provider_ref`, short-circuits if already terminal (idempotent — safe to call repeatedly), otherwise calls `adapter.verifyPayment(providerRef)` and persists the real status. **This is the authoritative "confirm after redirect" mechanism this codebase already has** — it has simply never been wired to anything reachable from a browser.
- `supabase/functions/payment-webhook/` — independently, asynchronously, updates the same `payment_transactions.status` column when Moyasar's server-to-server webhook arrives (HMAC-verified, unmodified). Not client-triggerable, not synchronous with the browser's own redirect.
- `sql/payment_transactions_idempotency_key_unique.sql` — confirms `uq_paytx_idempotency_key` already exists; a status-lookup-by-key would need no schema change.
- **RLS**: re-confirmed via `paymentService.js`'s own header comment ("RLS: payment_transactions تتطلّب is_platform_admin()") and every prior task's consistent treatment of this fact — an anonymous browser client cannot read `payment_transactions` under any query shape, with or without an idempotency key.
- `supabase/functions/` (directory listing) — exactly 3 functions exist: `create-platform-admin`, `payment-webhook`, `payment-first-checkout`. **None exposes a status-check-by-idempotency-key action.**
- `src/features/menu/hooks/usePaymentFirstCheckout.js`, `src/features/menu/PaymentFirstPriceConfirmation.jsx`, `src/features/menu/PaymentFirstCheckoutPanel.jsx`, `src/features/menu/hooks/usePaymentIdempotencyKey.js` — all re-read; all still completely unmodified and unmounted into any live page, exactly as their own reports describe.

**Why naively "just call `startCheckout` again on return" is unsafe** (a design path this audit specifically ruled out, not merely overlooked): `initiatePaymentFirstCheckout` always re-runs the dry-run (`create_order(p_dry_run=true)`) *before* reaching `startCharge`'s idempotent-replay check. If the cart/menu changed in the interim (an item went unavailable, a price drifted) the dry-run could return `rejected` or `price_changed` — which would then be reported to a customer whose payment may have **already succeeded**, a direct violation of this task's own CRITICAL instruction never to imply a wrong outcome. A correct status-check must bypass dry-run entirely and read `payment_transactions` (or call `confirmCharge`) directly by identity, not by re-deriving cart state.

---

# REDIRECT_FLOW

What is already fully specified and implemented (3.6D-C/3.6D-E), unmodified by this task:
1. Customer's browser is sent to Moyasar's hosted payment page via `response.redirectUrl` (Moyasar's own `source.transaction_url`).
2. After the customer completes (or abandons) payment there, Moyasar redirects the browser back to `callback_url`, which we set to `${PUBLIC_APP_BASE_URL}/menu/${slug}?payment_callback=${paymentIdempotencyKey}[&t=${qrToken}]`.
3. **What Moyasar appends to that URL beyond what we already put there (if anything) is unverified and must not be parsed or trusted.** This is the one piece of genuine G-6 exposure — and the correct mitigation is to simply never read it, not to guess its shape.

---

# CALLBACK_FLOW

**What a correct callback flow would need to do**, established by this audit but **not implemented**:
1. On landing at `/menu/:slug?payment_callback=<key>[&t=<qrToken>]`, parse only `payment_callback` and `t` — both self-issued, zero Moyasar dependency.
2. Cross-check the URL's `payment_callback` value against the locally-persisted `usePaymentIdempotencyKey` value (defense-in-depth: they should match if this is a genuine return from *this* browser's own attempt).
3. Ask a **server-side** authority "what is the current status of the payment attempt identified by this key?" — **this step has no implementation target today.**
4. Render one of the `ERROR_STATE_MAPPING` states already designed in 3.6D-A (`succeeded` / `failed` / `requires_reconciliation` / still-pending) — itself 3.6D.5's scope, not this task's.

Step 3 is the entire blocker. Two candidate designs were identified (not chosen, not built):
- **Design A — pure read**: a new Edge Function action reads `payment_transactions.status`/`amount`/`currency` by `idempotency_key` (service_role, RLS bypass), relying entirely on the webhook having already updated it. Simpler, but timing-dependent — the webhook is not guaranteed to have arrived yet when the browser lands back.
- **Design B — active confirm**: a new Edge Function action reuses the existing, tested `paymentService.confirmCharge()` (found by `provider_ref`, itself found by `idempotency_key`) — actively calls Moyasar's real `verifyPayment` if the row isn't yet terminal. More robust, but is the first place in this entire session a *live* Moyasar API call would actually execute in production, making its correctness depend on the one thing G-6 has always meant: **verification against real Moyasar traffic, which this session has never had access to.**

Choosing between these (or a hybrid — e.g., A first with a bounded poll, falling back to B) is a real design decision with security implications (new anonymous-reachable endpoint, what it may leak, whether it needs its own rate limiting) that deserves the same dedicated specification-and-approval cycle `payment-first-checkout` itself received in `TASK_3_6D-C`, not a decision made unilaterally inside this implementation task.

---

# AUTHORITATIVE_VERIFICATION_SOURCE

Confirmed, unchanged from every prior task in this arc: **`payment_transactions.status`, written only by `paymentService.startCharge` (initial), `payment-webhook` (async, HMAC-verified provider push), or `paymentService.confirmCharge` (synchronous, real Moyasar `GET` verify) — never by anything the browser supplies.** No redirect query parameter, however named, could ever be treated as this authority. This is the fixed point every future design (A or B above) must build on; it does not change based on how the callback page is eventually built.

---

# IDEMPOTENCY_KEY_RESUME_BEHAVIOR

**Design intent (from 3.6D-A's `SESSION_RETRY_CONTINUITY`, implemented in 3.6D.3):** `usePaymentIdempotencyKey(slug, branchId)` persists the key to `localStorage` under `simsim_payidem_{slug}_{branchId}` for exactly this purpose — so a customer who refreshes mid-redirect, or whose browser is killed and relaunched, can resume with the *same* payment attempt. **Confirmed still correct and already fully tested (`PIK-01`..`PIK-07`, 3.6D.3).**

**What "resume" is supposed to mean concretely, resolved by this audit but not yet actionable:** on landing at the callback URL (or on any later page load where a key is still present and no terminal outcome has been recorded locally), the key should be used to ask the server-side authority (CALLBACK_FLOW step 3, above) for the current status — **not** to re-run `startCheckout` (ruled unsafe, see ARCHITECTURE_AUDIT) and **not** to infer anything from the mere fact that a redirect occurred.

---

# PROVIDER_ASSUMPTIONS

Explicitly enumerated, so none are silently smuggled into implementation later:
1. **Unverified**: the exact query-parameter names/values/encoding Moyasar appends to `callback_url` on redirect (classic G-6). **Mitigated by design** — never parsed, never trusted, made irrelevant by relying solely on our own `payment_callback` parameter.
2. **Unverified**: whether `MoyasarAdapter.verifyPayment()`'s request/response shape (`GET /v1/payments/{id}`, expecting `{id, status, source: {transaction_url}}`) matches Moyasar's real API today — it matches Moyasar's documented shape and is internally consistent with `createCharge`'s own already-exercised response handling, but has never been executed against a live Moyasar account in this session, same as every other adapter method.
3. **Unverified**: webhook delivery timing relative to the browser's own redirect completion — assumed *not* guaranteed to precede it (a conservative assumption, not a confirmed one).
4. **Not an assumption, confirmed from code**: `payment_transactions` RLS blocks anonymous read regardless of query shape — this is certain, not provider-dependent.

None of items 1–3 were used as a basis for any code in this task.

---

# SECURITY_ANALYSIS

No new code was written, so no new attack surface was introduced. The security properties re-confirmed as still intact and unweakened:
- `service_role` remains server-only (unchanged — no new Edge Function created).
- `providerRef` remains never browser-exposed (unchanged — `confirmCharge` was not wired to anything reachable from a browser).
- Idempotency guarantees (`uq_paytx_idempotency_key`, `startCharge`'s existing-row check) remain exactly as they were — untouched.
- The deferred `startCharge` `restaurant_id`-scoping fix remains deferred — not required by anything in this audit, and not implemented, per instruction.
- Rate limiting remains unimplemented, per instruction — also newly relevant context for whichever design (A/B above) is eventually approved: an anonymous, key-guessable-in-principle status-check endpoint would need its own rate-limiting/enumeration-resistance consideration, flagged here for that future spec task.

---

# FILES_CREATED

None.

# FILES_MODIFIED

None.

---

# TESTS

None added — no code was written to test. All existing tests (`confirmCharge`'s `PS-006`–`PS-009`, the full `usePaymentFirstCheckout`/`PaymentFirstPriceConfirmation`/`PaymentFirstCheckoutPanel`/`usePaymentIdempotencyKey` suites) were re-confirmed passing as part of the unchanged regression run below — nothing here needed new coverage since nothing here changed.

---

# FOCUSED_RESULTS

Not applicable — no focused implementation to test.

---

# FULL_REGRESSION_RESULTS

```
npx vitest run
 Test Files  47 passed (47)
      Tests  853 passed (853)
```

Confirmed identical to the 3.6D.3 baseline (`git status --short` shows zero new tracked-file changes since 3.6D.3; only the pre-existing untracked `??` files from earlier tasks remain). No regression run was needed to "prove" anything new, but was run anyway to positively confirm this audit-only task left the baseline untouched.

---

# BLOCKERS

**Primary blocker**: no approved specification or existing implementation for a server-side "resolve payment status by idempotency key" capability. This is required before any real callback-resolution code can be written, regardless of whether Design A (pure read) or Design B (active `confirmCharge`) is eventually chosen. Unblocking requires **one of**:
1. An explicit owner decision to commission a dedicated specification task (mirroring `TASK_3_6D-C`'s process for `payment-first-checkout`) resolving: which design (A/B/hybrid), its exact request/response contract, auth/CORS posture, rate-limiting stance, and exactly what fields are safe to return to an anonymous caller — followed by a separate implementation task (mirroring `TASK_3_6D-E`).
2. Real Moyasar sandbox/API access, which would let Design B's live `verifyPayment()` path be genuinely verified end-to-end (resolving the long-standing G-6 gap directly) rather than only unit-tested against mocks.

**Secondary, narrower point** (not itself blocking, but worth keeping distinct): the classic "what does Moyasar's redirect URL actually look like" question (G-6 in its original, narrowest sense) is **not** blocking further work, because the correct design deliberately never depends on it.

---

# WARNINGS

1. Any future implementation of this phase must resist the temptation to reuse `startCheckout`/`initiatePaymentFirstCheckout` as a status-check mechanism — this audit specifically found that path unsafe (a dry-run failure unrelated to payment status could mask a real, successful outcome).
2. Whichever design is eventually approved, returning *any* payment status to an anonymous caller by a guessable-in-principle key (even a `crypto.randomUUID()`-derived one) reintroduces a narrower version of the idempotency-key information-disclosure concern already flagged in `TASK_3_6D_C`'s `IDEMPOTENCY` section — worth explicit consideration in that future spec, not assumed safe by default.
3. Real end-to-end confidence in this entire payment-first flow — not just this phase — still ultimately depends on G-6 (live Moyasar verification) being resolved at some point before production go-live, consistent with every prior audit in this arc.

---

# DEFERRED

- The actual callback/status-resolution implementation (this entire phase) — pending the specification decision above.
- 3.6D.5 (result-mapping UI), 3.6D.6 (order confirmation reuse), 3.6D.7 (E2E tests) — all remain not started, and 3.6D.5 in particular has a direct dependency on whatever this phase eventually produces.
- Rate limiting and the `startCharge` idempotency tenant-scoping fix — untouched, as instructed, and newly relevant to the future status-check endpoint's own design.
- Real Moyasar sandbox verification (G-6) — still entirely unresolved, still outside any task in this session's control.

---

# SCOPE_DEVIATIONS

None — this task performed the required audit and produced the required report; the explicit "STOP after the audit" path was followed exactly as instructed rather than deviating into unilateral implementation.

---

# GIT_STATUS

No new or modified tracked files. `git status --short` shows the identical tracked-file set as the 3.6D.3 baseline; the only new untracked file is this report. No commit, no push, no merge.

---

# EXACT_NEXT_STEP

Owner decision needed on exactly one of:
1. **Commission a dedicated specification task** (e.g., "3.6D.4-A — Payment Status Resolution Server Capability Spec") to resolve Design A vs. B vs. hybrid, its full request/response contract, and security posture — mirroring how `TASK_3_6D-C` preceded `TASK_3_6D-E`. Implementation would follow as a separate, later task once that spec is approved.
2. **Provide real Moyasar sandbox access** so Design B's live verification path can be built and genuinely confirmed rather than only unit-tested, directly resolving G-6.
3. **Explicitly defer this entire phase** and proceed to work that doesn't depend on it, if any exists in the current roadmap (none does — 3.6D.5/3.6D.6/3.6D.7 all depend on this phase per 3.6D-A's own dependency chart).

No implementation begins until one of these is explicitly chosen. Per instruction, 3.6D.5 and all later tasks remain unstarted.

---

*Report generated 2026-08-27. Audit-only — no code, no schema, no deployment, no Moyasar call, no commit, no push, no merge.*
