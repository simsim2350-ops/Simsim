# Task 3.6D.9 — Final Payment-First Code Audit (Read-Only, Pre-GitHub-Integration)

**Read-only audit. Zero files written or edited. No deployment. No commit/push/merge. No secrets requested, read, or exposed.**

> **Verdict scale used throughout, per instruction:**
> **A. CODE COMPLETE** — the implementation exists and is internally consistent.
> **B. TEST VERIFIED** — covered by a passing automated test (unit/component/handler).
> **C. STAGING VERIFIED** — exercised via a real network call against the real, deployed staging function/database.
> **D. LIVE MOYASAR VERIFIED** — a real Moyasar charge was created and confirmed. **Nothing in this report is D.** Every such item remains `DEFERRED_EXTERNAL_CONFIGURATION`.

---

# EXECUTIVE_SUMMARY

The payment-first implementation is architecturally sound, thoroughly tested (1054/1054, re-confirmed this task), and free of hardcoded secrets, dead debug code, or unsafe patterns anywhere this audit could reach. Security boundaries (server-authoritative amount/currency/items/restaurant/branch/payment-status, client-untrusted customer data, no `paymentTransactionId`/`providerRef`/`accessToken` client-facing leakage) are correctly enforced at every layer this audit checked, both statically and via live, non-payment staging requests. Git status is clean of anything unexpected — the same 14 tracked-file changes and 138 untracked files already documented across every prior task's own reports in this arc.

**One significant, previously-undisclosed-in-this-form finding**: `PaymentFirstCheckoutPanel` — the UI component that actually *starts* a payment-first checkout — **is not rendered anywhere in the live application** (`PublicMenu.jsx`, `CartDrawer.jsx`, `useCheckout.js` all confirmed, via direct search, to contain zero references to it). Every task since `3.6D.4` built and wired the *callback/order-creation half* of the flow (customer returns from a payment → order gets created → confirmation shown) — but nothing in this entire session ever wired the *initiation half* (customer clicks "pay now" in the cart → sees `PaymentFirstCheckoutPanel` → gets redirected to Moyasar) into the actual customer-facing checkout UI. This is not dead code — it is real, complete, well-tested code (21 + 15 + 15 tests across `PaymentFirstCheckoutPanel`/`PaymentFirstPriceConfirmation`/`usePaymentFirstCheckout`) — it is simply **unintegrated**. See `ARCHITECTURE_VERDICT` for full detail; this is the single most important thing this audit surfaces.

**A second, smaller finding**: `@playwright/test` is a real, configured dev dependency with existing E2E specs (including `tests/e2e/qr-cart-checkout-order.spec.ts`), but browser binaries are not installed in this environment (`~/.cache/ms-playwright` does not exist). This meaningfully refines — not necessarily overturns — the "no browser-automation tool available" conclusion from `TASK_3_6D_7`/`3.6D.8`: the *test framework* exists in this repo; whether its browsers can actually be installed and run on this Termux/proot platform was not attempted in this read-only task and remains unverified. Recorded as a recommendation, not acted on.

---

# ARCHITECTURE_VERDICT

| Area | Verdict |
|---|---|
| 1. Architecture consistency | **A — with one material gap.** Every layer built (checkout-initiation UI → Edge Function → payment status RPC → callback UI → order-creation Edge Function → confirmation UI → existing order-tracking) is individually consistent with its neighbors and with the security/idempotency invariants established from `TASK-PAY-3.6A` onward. The gap: the initiation UI (`PaymentFirstCheckoutPanel`) is never rendered from `PublicMenu.jsx`/`CartDrawer.jsx` — confirmed by direct search (`grep -rn "<PaymentFirstCheckoutPanel" src/` → zero matches outside the component's own file). A customer today has no way to trigger a payment-first checkout through the live UI at all; only the *return* half of the journey (`?payment_callback=...`) is reachable. |
| 2. Payment flow consistency | **A/B for the reachable half; A-only (unreachable) for the initiation half.** The callback → status-check → order-creation → confirmation chain is fully connected and tested end-to-end at the component level (`PaymentFirstOrderCreation.test.jsx`, `PublicMenuOrderCreationWiring.test.jsx`). The initiation chain (`PaymentFirstCheckoutPanel` → `usePaymentFirstCheckout` → `payment-first-checkout` Edge Function) is also fully built and tested in isolation but has no live entry point. |
| 3. Callback flow | **A, B, C.** `PaymentFirstCallbackLanding.jsx` (18 tests) + `PublicMenuCallbackIntegration.test.jsx` (11 tests); the RPC it calls was staging-verified live in `TASK_3_6D_4_B.2`. |
| 4. Order creation flow | **A, B, C.** `createOrderFromSuccessfulPayment` (19 tests) + `create-order-from-payment` handler (50 tests) + live staging verification of its validation/not-found paths (`TASK_3_6D_7`). |
| 5. Order confirmation | **A, B.** `PaymentFirstOrderCreation.jsx`'s `order_created` phase — reachable only from a real `succeeded` Edge Function response, never from payment status alone (structurally guaranteed, single call site). |
| 6. Idempotency | **A, B, C (schema).** DB unique indexes (`orders_payment_transaction_id_uidx`, `uq_paytx_idempotency_key`) re-confirmed live on staging in `TASK_3_6D_7`; app-level pre-checks and race-recovery paths unit-tested. |
| 7. Concurrency protection | **A, B.** Race-recovery catch blocks in `createOrderFromSuccessfulPayment` tested for both the winning and losing side of a simulated race. Live concurrent traffic not exercised (requires real payments). |
| 8-11. QR / non-QR / takeaway / delivery | **A, B.** All four order-type paths have dedicated tests across `checkoutBinding.test.js`, `create-order-from-payment/handler.test.js`, and `PaymentFirstOrderCreation.test.jsx`. |
| 12. Multi-branch | **A, B.** `branchId` used only for local storage-key scoping, never transmitted; existing multi-branch menu regression (`PMCB-10`) unaffected. |
| 13. Customer data | **A, B.** See `TASK_3_6D_8`'s own dedicated audit, re-confirmed unchanged this task. |
| 14-16. Error handling / retry / reconciliation | **A, B.** All six state-machine values (`PENDING`/`SUCCEEDED`/`FAILED`/`UNKNOWN`/`RETRYABLE_ERROR`/`REQUIRES_RECONCILIATION`) tested. |
| 17. Security boundaries | **A, B, C.** See `SECURITY_VERDICT`. |
| 18. Secret exposure | **A, B, C — clean.** See `CONFIGURATION_FINDINGS`. |
| 19. Frontend/backend separation | **A.** `service_role` never imported or referenced anywhere under `src/` (browser-reachable code); confirmed by source search — every `service_role` reference lives exclusively in the three `index.ts` entry points (Deno-only, never bundled to the browser). |
| 20. Edge Function boundaries | **A, with one documented, intentional duplication.** `resolveQrTenant`/`resolveSlugTenant` exist independently in both `payment-first-checkout/handler.js` and `create-order-from-payment/handler.js` — a deliberate scope choice already disclosed in `TASK_3_6D_6`'s own report (avoiding cross-function coupling), not new, not accidental. `payment-webhook/handler.js`'s self-contained re-implementation of webhook-event handling (instead of importing `paymentService.js`) is likewise a long-standing, documented Deno bare-specifier workaround, unchanged since `TASK-PAY-3.4`. |
| 21. Database invariants | **A, C.** Re-confirmed live on staging in `TASK_3_6D_7` (single `create_order` overload, correct indexes); unchanged since (no migration in any task after that). |
| 22. Existing checkout regression | **A, B.** `useCheckout.js` (cash flow) untouched by this entire arc; its tests remain in the 1054/1054 total. |
| 23. Existing order regression | **A, B.** `useActiveOrders.js`/`OrdersScreen.jsx` untouched; payment-first orders integrate through the same, unmodified mechanism. |
| 24. Accessibility | **A (baseline).** Every payment-first screen uses `role="status" aria-live="polite"` (informational) or `role="alert"` (failure) consistently; every button has a real translated text label. No screen-reader software was run (none available). |
| 25. Mobile responsiveness | **A (code-level only).** Relative flex layouts, no fixed pixel widths; button tap targets (`padding: 11px 20px` at 13px font) are close to but not verified against the 44×44px guideline on a real device. See the Playwright finding above — not exercised live. |
| 26. Logging | **A, C.** Structured, `requestId`-prefixed logs across all three deployed functions; re-confirmed live this task that server logs (not responses) are the only place `paymentTransactionId`/`providerRef` ever appear together (`payment-first-checkout/handler.js:407`), which is correct, expected server-side observability — never client-facing. |
| 27. Test coverage | **A, B.** 1054 automated tests across 57 files covering every payment-first source file this audit checked; no source file identified with zero corresponding test coverage. |
| 28. Dead code | **None found**, distinct from the "unintegrated" finding above (which is real, live, tested code with no current render path — not the same as dead/removable code). |
| 29. Temporary/debug code | **None found** — no `console.log` debug scaffolding, no commented-out blocks, no `DEBUG`/test-only-bypass flags in any production source file searched. |
| 30. Unnecessary files | **None identified within the payment-first source/test tree.** (The large number of unrelated, uncommitted report files from earlier project phases is a pre-existing repository-hygiene matter, not something this task's scope covers judging.) |
| 31. TODO/FIXME related to 3.6D | **None found** — a full grep across every payment-first source file returned zero matches. |
| 32. Environment/configuration references | `PUBLIC_APP_BASE_URL`, `PAYMENT_MOYASAR_WEBHOOK_SECRET`, `PAYMENT_MOYASAR_SECRET_KEY` remain **`DEFERRED_EXTERNAL_CONFIGURATION`** — re-confirmed unchanged this task via the same secret-free behavioral method used in `TASK_3_6D_7_A`/`3.6D.8` (no value read, only presence/absence inferred from each function's own documented fail-closed response). |
| 33. Production safety | **Confirmed clean.** No production write operation (deployment, migration, config change) occurred in any task since `TASK_3_5`'s own approved production migration (`sql/order_payment_reference.sql`, unrelated to this arc's own new work). |
| 34. Staging safety | **Confirmed clean.** Three functions deployed (`create-order-from-payment`, `payment-webhook`, `payment-first-checkout`), all `ACTIVE`, re-confirmed reachable this task; no schema change since `TASK_3_6D_7`. |
| 35. Git diff cleanliness | **Confirmed clean and fully explained.** See `GIT_STATUS`. |

---

# SECURITY_VERDICT

Re-verified this task via direct source search across the entire payment-first tree, cross-checked against the live, non-payment staging behavior already established in `TASK_3_6D_7`/`3.6D.7-A`/`3.6D.8`:

| Field | Requirement | Verdict |
|---|---|---|
| `paymentTransactionId` | Server-side only | **Confirmed.** No request-body field for it anywhere; resolved exclusively from `paymentIdempotencyKey` inside `create-order-from-payment`. Its only client-facing-adjacent appearances are inside `console.*` calls (server logs) — never inside a `json({...})` response body (verified by grep across every `handler.js`'s response-construction code). |
| `providerRef` | Server-side only | **Confirmed** — identical pattern to above; never in any response contract. |
| `amount` | Server-authoritative | **Confirmed** — sourced exclusively from `payment_transactions.amount` (the column, not any client input) inside `createOrderFromSuccessfulPayment`; `numericEquals` check exists specifically to catch any drift, unmodified. |
| `currency` | Server-authoritative | **Confirmed** — hardcoded `SUPPORTED_CURRENCY = 'SAR'` constant, never read from any request body anywhere in the payment-first tree. |
| `items` | Server-authoritative snapshot | **Confirmed** — `payment_transactions.metadata.checkout.items`, fingerprint-verified against a fresh recomputation before use; no `items` field exists in `create-order-from-payment`'s request contract at all. |
| `restaurant` | Server-authoritative | **Confirmed** — `paymentTx.restaurant_id` (the column) is what's actually passed to `create_order`; any client-supplied `expectedRestaurantId` is a defense-in-depth *comparison* only, never a source of truth. |
| `branch` | Server-authoritative | **Confirmed** — `snapshot.branch_id` (from the stored checkout snapshot) only; no `branch_id` field exists anywhere in `create-order-from-payment`'s contract. |
| Payment status | Server-authoritative | **Confirmed** — always a fresh `payment_transactions.status` column read; no status field accepted from any client request anywhere in this arc. |

**Customer data**: confirmed untrusted (execution-only fields, never influence price/snapshot/authorization — enforced by `create_order`'s own unchanged validation being the sole authority); confirmed cannot override the payment snapshot (structurally — the snapshot fields and the customer-data fields never overlap in `createOrderFromSuccessfulPayment`'s `create_order` call); confirmed cleanup happens only after a confirmed order (`PaymentFirstOrderCreation.jsx`'s `succeeded` branch, unit-tested including the "not cleared while pending" case via a held-promise test).

**Order confirmation**: confirmed payment success alone never displays final confirmation — the `order_created` phase is reachable exclusively via `create-order-from-payment`'s own `status: 'succeeded'` response, structurally guaranteed by `PaymentFirstOrderCreation`'s single call site for `runCreateOrder` (`PaymentFirstCallbackLanding`'s `onSucceeded`, itself only fired after RPC-verified payment success — two layers, both required, neither sufficient alone).

**Idempotency**: duplicate callbacks, refresh, retry, and (at the DB level) concurrent requests are all confirmed — per this task's own re-read of the mechanisms — incapable of producing more than one order for a given payment, via the unique index `orders_payment_transaction_id_uidx` as the ultimate source of truth, backed by app-level pre-checks as a cost optimization only.

---

# CONFIGURATION_FINDINGS

No hardcoded secret-shaped string, API key, or `service_role` literal was found anywhere in the payment-first source tree (a targeted regex search for `sk_live`/`sk_test`/`sb_secret_`/inline `service_role` assignment returned zero matches). Hardcoded URLs found are all expected and appropriate: `https://api.moyasar.com` (the documented, correct Moyasar API base URL constant), `https://esm.sh` (the standard Deno CDN import source used by every Edge Function's `index.ts`), and a handful of `example.com`/`app.simsim.example`/`evil.example`/`moyasar.example` values — all confined to test files as deliberate fixtures (including one adversarial URL specifically used to prove a forged `returnUrl` is rejected).

Three environment variables remain **`DEFERRED_EXTERNAL_CONFIGURATION`** on staging (re-confirmed unchanged this task, without reading any value): `PUBLIC_APP_BASE_URL`, `PAYMENT_MOYASAR_WEBHOOK_SECRET`, `PAYMENT_MOYASAR_SECRET_KEY`.

---

# DEAD_DEBUG_CODE_FINDINGS

- **No dead code removable without loss of function.**
- **No temporary/debug scaffolding** (no stray `console.log('here')`-style debugging, no commented-out old implementations).
- **No test-only bypass logic in production source** — targeted search for `NODE_ENV === 'test'`, `__TEST__`, `skipAuth`, `bypassAuth`, hardcoded `DEBUG = true` in every payment-first production file returned zero matches.
- **One unintegrated-but-real component tree**: `PaymentFirstCheckoutPanel.jsx` → `usePaymentFirstCheckout.js` → `PaymentFirstPriceConfirmation.jsx` → `paymentFirstErrors.js` — fully built, fully tested (51 tests combined), zero live render path. Not dead; not wired. See `ARCHITECTURE_VERDICT` item 1.
- **Two documented, intentional logic duplications** (not new, not accidental — both already disclosed in earlier task reports): tenant-resolution helpers duplicated between `payment-first-checkout` and `create-order-from-payment`; webhook-event-handling logic duplicated between `paymentService.js` and `payment-webhook/handler.js` (a Deno-compatibility workaround dating to `TASK-PAY-3.4`).

---

# RISKS

1. **The initiation-UI integration gap** (see `ARCHITECTURE_VERDICT` item 1) is the single largest risk to the arc's stated goal — without it, none of the extensively-verified callback/order-creation/confirmation work is reachable by an actual customer yet.
2. **`DEFERRED_EXTERNAL_CONFIGURATION`** (unchanged, three variables) — blocks any real Moyasar interaction regardless of the above.
3. **Zero commits since `TASK_3_4`** — the entire arc (`3.4` through this audit) exists only as uncommitted working-tree changes; this is itself a standing risk (no history, no PR review trail, no recoverability beyond this local working copy) independent of anything payment-first-specific, and is exactly what `GITHUB_READINESS` below is assessing whether to finally address.
4. **Playwright browsers not installed** — the "no live browser E2E possible" conclusion from `TASK_3_6D_7`/`3.6D.8` may be resolvable (the test framework and at least one relevant-adjacent spec already exist), but this was not attempted or confirmed working on this platform in this read-only task.

---

# BLOCKERS

1. `DEFERRED_EXTERNAL_CONFIGURATION` — three Moyasar/staging secrets, requires owner/dashboard access this session lacks (unchanged from `TASK_3_6D_7_A`).
2. `PaymentFirstCheckoutPanel` not wired into any live render path — requires a new, explicit implementation task (out of this audit's own read-only scope to perform).
3. No frontend staging deployment exists yet (unchanged from prior tasks).

---

# DEFERRED_ITEMS

- Wiring `PaymentFirstCheckoutPanel` into the actual cart/checkout UI (`CartDrawer.jsx`/`useCheckout.js`/`PublicMenu.jsx`) — the most consequential deferred item this audit surfaces.
- Setting the three external secrets.
- Attempting `npx playwright install` and a real browser E2E run, once a frontend is deployed and the secrets above are set.
- All Live Moyasar E2E scenarios — remain `DEFERRED_EXTERNAL_CONFIGURATION`, not attempted, not claimed.

---

# AUTOMATED_REGRESSION_RESULTS

```
npx vitest run
```
```
Test Files  57 passed (57)
     Tests  1054 passed (1054)
```
Zero failures. Re-run twice this task (once at the start, once to produce the header count cited above) — both identical, both clean.

---

# GIT_STATUS

```
git status --short   →  14 modified tracked files, 138 untracked files
git diff --stat       →  14 files changed, 858 insertions(+), 25 deletions(-)
git diff --name-only  →  (same 14 files, listed above)
```
Every one of the 14 modified tracked files and every payment-first-related untracked file matches exactly what prior tasks in this same session's own reports already documented creating/modifying (`3.4` through `3.6D.8`) — no unexplained change of any kind was found. The remaining untracked files are pre-existing report/documentation artifacts from earlier, unrelated project phases (Phase 1/2, marketing CMS, etc.), outside this audit's scope to adjudicate. Nothing was altered by this task — every command run was read-only.

---

# FILES_CHANGED

**None, by this task.** For reference, the complete set of payment-first-related tracked modifications and new files carried by the working tree (all from prior tasks in this same session, unmodified by this audit):

**Modified (14)**: `cartHelpers.js`, `cartHelpers.test.js`, `i18n.js`, `PublicMenu.jsx`, `moyasar.js`, `payments/index.js`, `payments/services/index.js`, `paymentService.js`, `payments/types/index.js`, `payments/utils/index.js`, `payment-webhook/handler.js`, `MoyasarAdapter.test.js`, `paymentService.test.js`, `paymentWebhook.test.js`.

**New (payment-first-specific, non-exhaustive listing of the source/test tree)**: `checkoutOrchestration.js`, `checkoutBinding.js`, `PaymentFirstCallbackLanding.jsx`, `PaymentFirstCheckoutPanel.jsx`, `PaymentFirstOrderCreation.jsx`, `PaymentFirstPriceConfirmation.jsx`, `paymentFirstErrors.js`, `paymentOrderCreationApi.js`, `hooks/paymentCustomerDataHelpers.js`, `hooks/usePaymentCustomerData.js`, `hooks/usePaymentFirstCheckout.js`, `hooks/usePaymentIdempotencyKey.js`, `hooks/useResumedPaymentIdempotencyKey.js`, `supabase/functions/create-order-from-payment/*`, `supabase/functions/payment-first-checkout/*`, plus every corresponding test file (22 test files spanning the counts cited throughout this report), plus `sql/order_dry_run_pricing.sql`, `sql/order_payment_reference.sql`, `sql/payment_status_reads.sql`.

---

# GITHUB_READINESS_VERDICT

**`READY_FOR_GIT_INTEGRATION`** — for the code as it exists today, as a version-control action (committing already-correct, already-extensively-tested work), **explicitly distinct from "feature complete and live for customers."**

Justification: nothing in this audit found a code-quality, security, or test-coverage reason to withhold committing this work — the code is clean, consistent, secret-free, and backed by 1054 passing tests. The two real gaps found (`PaymentFirstCheckoutPanel` unwired; three external secrets pending) are **product-completeness** and **external-configuration** gaps respectively, not **git-hygiene** gaps — withholding a commit does not fix either, and this arc has already gone an unusually long time (since `TASK_3_4`) without any commit at all, which is itself a growing, independent risk (no recoverability/review trail beyond this single working tree) that committing now would reduce, not increase.

## RECOMMENDED_COMMIT_SCOPE

**Not executed — provided for the owner's review only, per instruction not to commit.**

A single, cohesively-scoped commit (or a small stack of logically-grouped commits, owner's preference) covering exactly the 14 modified + all payment-first new files listed in `FILES_CHANGED` above, **explicitly excluding** every unrelated report/documentation file from earlier, unrelated project phases (Phase 1/2/marketing-CMS reports, etc. — those belong to separate, already-completed work and would only add noise to a payment-first-scoped commit). Suggested commit message shape (matching this repo's own established Conventional-Commits-adjacent style seen in `git log`):

```
feat(payments): Payment-First checkout — callback, order creation, staging deploy

Implements the full payment-first flow: checkout initiation UI (not yet
wired into the live cart), payment-status callback handling, customer-data
persistence across the Moyasar redirect, order creation from a confirmed
payment (create-order-from-payment Edge Function), and order confirmation.
payment-first-checkout, payment-webhook, and create-order-from-payment are
deployed and ACTIVE on staging; live Moyasar E2E remains blocked on
external secret configuration (PUBLIC_APP_BASE_URL,
PAYMENT_MOYASAR_WEBHOOK_SECRET, PAYMENT_MOYASAR_SECRET_KEY).

1054/1054 tests passing.
```
The owner may prefer splitting this into smaller commits (e.g., one per `TASK-PAY-3.6D.x` boundary) — this audit does not have a strong opinion on granularity, only on scope (payment-first files only, this pass).

---

# EXACT_NEXT_STEP

Per this task's own "STOP" instruction, no further action is taken. In priority order for whoever picks this up next: (1) decide on the commit scope/granularity above and actually commit (a separate, explicit action from this audit); (2) wire `PaymentFirstCheckoutPanel` into the live cart/checkout UI — the highest-value remaining implementation gap; (3) set the three external secrets; (4) attempt `npx playwright install` to determine whether real browser E2E is actually feasible in this environment before assuming it isn't.
