# Task 3.6D.4-C.3 — PublicMenu Payment Callback Integration

**Implements the approved architecture from TASK_3_6D_4_C/C_1/C_2 exactly. First task in this arc to modify a live, working page. No production deploy.**

---

# EXECUTIVE_SUMMARY

`PaymentFirstCallbackLanding` is now wired into the real `/menu/:slug` route as a full-screen takeover gate inside `PublicMenuInner`, positioned exactly where `TASK_3_6D_4_C`'s audit recommended: after `loading`/`resolvingTableQr`/`notFound` have settled (so `branch?.id` is resolved), and before `orderPlaced` (so a genuine payment return takes priority over any stale locally-stored order-tracking flag). The existing `rawTableQrToken && !tableQr` QR-failure blocking gate was given one additional condition — it no longer fires when a `payment_callback` is present — directly implementing the CRITICAL QR rule from both `TASK_3_6D_4_C` and this task's own instructions: a customer whose table QR was disabled between checkout and return must still be able to see their payment result, not a generic "QR unavailable" wall. `App.jsx` was not touched — the approved contract never required a new route, so it wasn't needed.

One real, previously-invisible defect was found and fixed during this integration, not merely a cosmetic afterthought: `PaymentFirstCallbackLanding`'s loading spinner animation (`animation: 'spin 0.7s linear infinite'`) depended on a `@keyframes spin` rule that only exists inside `PublicMenu`'s own frame `<style>` block — a block this new early-return gate, by construction, never reaches (the gate returns *before* that `<style>` tag is ever rendered). The component's own isolated tests never caught this because `happy-dom` doesn't evaluate whether a referenced animation name actually resolves to a declared keyframe. Fixed by giving the component its own small, local `<style>` tag for just that one keyframe, mirroring `MenuSkeleton.jsx`/`OrdersScreen.jsx`'s own established convention for exactly this situation (every independently-rendered early-return screen in this codebase already carries its own keyframes for the same structural reason).

11 new integration tests were written against a full mock of `PublicMenuInner`'s entire hook/component surface (a first for this codebase — `PublicMenu.jsx` had no test file before this task). 914/914 tests pass (903 baseline + 11 new). No Edge Function, RPC, `paymentService.js`, or `payment-webhook` change was made or needed.

---

# ARCHITECTURE_USED

Option A from `TASK_3_6D_4_C`, exactly as approved: a conditional early-return inside `PublicMenuInner`, not a new route, not a pre-mount shell. No deviation from the recommended architecture.

---

# EXACT_INTEGRATION_POINT

`src/pages/PublicMenu.jsx`, inside `PublicMenuInner`, in this exact gate order (unchanged gates omitted for brevity):

```
if (loading || resolvingTableQr) return <MenuSkeleton />                                          // unchanged
if (rawTableQrToken && !tableQr && !paymentCallbackActive) return (...)                             // ONE condition added
if (notFound) return (...)                                                                          // unchanged
if (paymentCallbackActive) return <PaymentFirstCallbackLanding slug={slug} branchId={branch?.id}
                                     t={t} isEn={isEn} brandColor={brandColor}
                                     onRecover={() => navigate(`/menu/${slug}`, {replace:true})} />  // NEW
if (orderPlaced && ordering) return (<OrdersScreen .../>)                                           // unchanged
```

`paymentCallbackActive = Boolean(searchParams.get('payment_callback'))`, computed once near the top of the component alongside the existing `branchId`/`rawTableQrToken` reads — no new query-parameter-reading mechanism was introduced; `branch`/`table` are read by the exact same, already-existing `searchParams.get(...)` calls that ordinary menu browsing already uses (confirmed by `TASK_3_6D_4_C_2`: the approved return-URL contract deliberately reuses these exact parameter names for this reason).

---

# FILES_MODIFIED

- **`src/pages/PublicMenu.jsx`** — one new import, one new derived boolean, one modified gate condition, one new gate (30 lines changed total).
- **`src/features/menu/PaymentFirstCallbackLanding.jsx`** — added a local `@keyframes spin` `<style>` tag to the `RESOLVING` state's render (the defect described in EXECUTIVE_SUMMARY). No other change to this file — its props, state machine, RPC usage, and security invariants are all untouched.
- **`tests/unit/PublicMenuCallbackIntegration.test.jsx`** — new, 11 tests.
- **`reports/TASK_3_6D_4_C_3_PUBLIC_MENU_CALLBACK_INTEGRATION_REPORT.md`** (this file).

**Not modified**: `App.jsx` (confirmed via `git diff` — zero lines changed; no new route was needed), `buildReturnUrl`/the Edge Function, `paymentService.js`, `payment-webhook`, the payment-status RPC/any SQL file, `useResumedPaymentIdempotencyKey.js`, `usePaymentIdempotencyKey.js`, `CartDrawer.jsx`, `useCheckout.js`, or any other cash-flow file.

---

# CALLBACK_GATE_LOGIC

`paymentCallbackActive` is derived once, from the same `useSearchParams()` call already used for `branch`/`table`. When `true`, the gate returns `PaymentFirstCallbackLanding` and nothing else from `PublicMenuInner` renders underneath it — a genuine full-screen takeover, identical in kind to the existing `orderPlaced && ordering` → `<OrdersScreen>` precedent, not an overlay or a banner beside a still-interactive menu. `PaymentFirstCallbackLanding` itself is completely unaware of *how* it was mounted — it reads `payment_callback` from the URL via its own internal `useSearchParams()` call (the same router context, since it's rendered inside the same `<Route>` tree), exactly as it already did in its standalone `TASK_3_6D_4` tests. No prop threads the raw `payment_callback` value through `PublicMenu.jsx` at all — only its *presence* (`Boolean(...)`) is used to decide whether to render the gate.

---

# QR_FAILURE_BYPASS_LOGIC

The existing gate's condition changed from `rawTableQrToken && !tableQr` to `rawTableQrToken && !tableQr && !paymentCallbackActive`. This is the entire fix — a single `&&` clause, not a restructuring of the existing QR-resolution flow (`resolve_table_qr`, `tableQr`/`resolvingTableQr` state, all untouched). Consequence: when a payment-callback return's QR re-resolution fails (table since disabled, QR code regenerated, etc.), the customer skips the blocking "QR unavailable" screen entirely and reaches the payment-callback gate instead — verified live in `PMCB-02`. The **ordinary** (non-callback) QR-failure path is unchanged and re-verified unaffected in `PMCB-03`.

**Known, documented limitation, not silently glossed over**: in exactly this degraded scenario (QR-scoped checkout, QR re-resolution fails on return), `effectiveBranchId = tableQr?.branchId || branchId` falls back to the raw `branch` query parameter — which, per the approved `TASK_3_6D_4_C_1` contract, is **never present** on a QR-scoped return URL (only `table` is, since branch is meant to be derived *through* successful QR resolution). This means `useMenuData`'s own existing primary-branch fallback applies in this one specific edge case, and `branch?.id` passed to `PaymentFirstCallbackLanding` could be the *wrong* branch if the customer's actual branch wasn't the primary one. This is an accepted, inherent tradeoff of the approved contract (which explicitly rejected adding a redundant `branch` parameter to QR URLs) — not a defect introduced by this task, and not something this task's scope permits fixing (it would require either violating the approved "no redundant branch param" rule or a new server capability, both out of scope). If it occurs, `PaymentFirstCallbackLanding`'s own existing `MISSING_KEY` state (already correctly handling "key not found under this branch's namespace") is the honest, safe result — never a false success or failure claim.

---

# BRANCH_BEHAVIOR

Non-QR callback: `branch` (from the approved return-URL contract, `TASK_3_6D_4_C_2`) flows through the **already-existing** `const branchId = searchParams.get('branch')` → `effectiveBranchId` → `useMenuData(slug, effectiveBranchId)` → `branch` (the resolved entity) → `branch?.id` passed to `PaymentFirstCallbackLanding`. No new branch-resolution code was written; the existing pipeline already does the right thing once given the right input, exactly as `TASK_3_6D_4_C`'s audit predicted. Verified in `PMCB-04` (a non-primary branch is passed through correctly, not silently replaced by a default) and `PMCB-10` (ordinary multi-branch menu browsing, unrelated to any callback, is unaffected).

---

# STATE_BEHAVIOR (verified scenarios)

Of the 14 scenarios listed in the task instructions, covered as follows:

| # | Scenario | Covered by |
|---|---|---|
| 1 | Non-QR callback, valid branch | `PMCB-04` |
| 2 | QR callback, valid table | `PMCB-02` (QR *failure* case; a QR *success* + callback combination is architecturally identical to `PMCB-01`'s activation check plus `PMCB-09`'s successful-QR-resolution path — both individually verified, confirming the combination is safe by composition) |
| 3 | QR callback, disabled/missing table | `PMCB-02` |
| 4 | Missing `localStorage` key | Owned entirely by `PaymentFirstCallbackLanding`'s own existing, unmodified `MISSING_KEY` state — already covered by its own 18 tests (`TASK_3_6D_4`); this task verifies only that the component *activates* correctly (`PMCB-01`), not its internal state machine again |
| 5 | Unknown key | Same — owned by `PaymentFirstCallbackLanding`'s existing `UNKNOWN` state, unchanged |
| 6 | Refresh during callback | Architecturally guaranteed by reusing `/menu/:slug` with the same query string (no new route, no session-only state introduced by this integration) — not independently re-tested here, since it reduces to "does the gate activate given the URL," already covered by `PMCB-01` |
| 7 | Direct callback URL (deep link) | Same as #6 — `PMCB-01`/`PMCB-04` both render directly from a fresh `MemoryRouter` entry with no prior navigation, which *is* a direct deep link in test terms |
| 8 | Ordinary menu URL, no `payment_callback` | `PMCB-08` |
| 9 | Ordinary QR menu, no `payment_callback` | `PMCB-09` |
| 10 | Ordinary multi-branch menu, no `payment_callback` | `PMCB-10` |
| 11 | Malformed `branch` | Delegated to `useMenuData`'s own existing, unmodified `find(...) || primary` fallback — not new behavior introduced by this task, not re-tested here beyond `PMCB-10`'s confirmation that legitimate `branch` values still flow through correctly |
| 12 | Malformed `table` | Delegated to the existing `resolve_table_qr` failure path, itself covered by `PMCB-02`/`PMCB-03` (a failing/non-matching token is exactly what those tests exercise) |
| 13 | `payment_callback` + `branch` | `PMCB-04` |
| 14 | `payment_callback` + `table` | `PMCB-02` |

---

# SECURITY_ANALYSIS

- **No `providerRef`/internal transaction ID exposure**: this integration adds no new field to any prop, log, or render — `PaymentFirstCallbackLanding`'s own existing non-exposure guarantees (`TASK_3_6D_4`) are unchanged, since the component itself was not modified beyond the unrelated `<style>` fix.
- **No direct `payment_transactions` query**: confirmed both by code review and by a static test (`PMCB-07`) scanning `PublicMenu.jsx` for any `.from('payment_transactions')` reference — none exists.
- **No client-supplied status/amount/currency trusted**: unchanged — `PublicMenu.jsx` never reads or displays any such value; it only decides *whether* to render the resolution UI.
- **`payment_callback`'s URL value never used as the RPC key**: unchanged, verified again by inspection — `PublicMenu.jsx` only ever computes `Boolean(searchParams.get('payment_callback'))`, never passes the actual string value anywhere; the real query key remains exclusively `PaymentFirstCallbackLanding`'s own internal `useResumedPaymentIdempotencyKey`-sourced value, untouched by this task.
- **No URL manipulation can become payment authorization**: a customer hand-editing `branch`/`table` in their own URL can only affect *which localStorage namespace their own browser checks* — per `TASK_3_6D_4_C_1`'s own SECURITY_MODEL, this cannot expose another customer's data (namespace values are only ever producible by that customer's own prior checkout flow) and at worst produces a confusing `MISSING_KEY` for themselves, never a false success.
- **No payment re-execution**: confirmed both by code review and by a live test (`PMCB-05`) asserting the *only* RPC calls made during a callback-mode render are `resolve_table_qr`/`resolve_menu_slug` (the pre-existing menu-context calls) — never `initiatePaymentFirstCheckout`, `startCheckout`, or any Moyasar-related call. A second static test (`PMCB-06`) confirms no Moyasar import and no raw `fetch()` call exists anywhere in `PublicMenu.jsx`.
- **RLS unaffected**: no database object, policy, or grant was touched by this task.
- **`localStorage` idempotency behavior unaffected**: `usePaymentIdempotencyKey`/`useResumedPaymentIdempotencyKey`/`paymentIdempotencyStorageKey` are all untouched files.

---

# TESTS

**`tests/unit/PublicMenuCallbackIntegration.test.jsx`** — 11 tests (`PMCB-01`..`PMCB-11`), the first test file ever written for `PublicMenu.jsx`. Every hook `PublicMenuInner` calls (`useMenuData`, `useLang`, `useActiveOrders`, `useCart`, `useCheckout`, `useCoupon`, `useLoyalty`, `useTables`, `useRecommendationRules`, `useSmartSuggestions`, `useCartWideIds`, `useReviews`) and every heavy child component (`MenuSkeleton`, `MenuHeader`, `MenuBody`, `MenuBranding`, `SearchOverlay`, `ProductModal`, `CartDrawer`, `AllergensModal`, `OrdersScreen`, `BannerDisplays`, `ConfirmDialog`) is mocked, mirroring `CartDrawer.test.jsx`'s own established `vi.mock(...)`-a-child-component convention, scaled up to this component's much larger surface. `supabase.rpc` is mocked at the module level to control `resolve_table_qr`/`resolve_menu_slug` outcomes deterministically. `PaymentFirstCallbackLanding` itself is mocked to a props-capturing stub — this task's tests verify *that it activates, with what props, and that nothing else renders alongside it*, deliberately not re-testing its own internal RPC/state-machine logic (already 18-tests-covered in `TASK_3_6D_4`).

Covers, per the task's own required list: callback takeover (`PMCB-01`); callback bypasses the QR-unavailable gate (`PMCB-02`); non-callback QR still uses the existing, unmodified QR-unavailable behavior (`PMCB-03`); non-QR branch context correctly threaded through (`PMCB-04`); callback does not start checkout (`PMCB-05`); callback does not call Moyasar (`PMCB-06`); callback does not directly query `payment_transactions` (`PMCB-07`); ordinary menu flow unchanged (`PMCB-08`); ordinary QR flow unchanged (`PMCB-09`); ordinary multi-branch flow unchanged (`PMCB-10`); plus one additional test (`PMCB-11`) confirming a stored `orderPlaced` scenario doesn't compete with an active callback for the screen.

No test was written by weakening an assertion to force a pass — the one real defect found (the missing keyframe) was fixed in the component, not hidden by a less-strict test.

---

# FOCUSED_RESULTS

```
npx vitest run tests/unit/PublicMenuCallbackIntegration.test.jsx
 Test Files  1 passed (1)
      Tests  11 passed (11)

npx vitest run tests/unit/PaymentFirstCallbackLanding.test.jsx
 Test Files  1 passed (1)
      Tests  18 passed (18)
```

---

# FULL_REGRESSION

```
npx vitest run
 Test Files  51 passed (51)
      Tests  914 passed (914)

npm test -- --run
 Test Files  51 passed (51)
      Tests  914 passed (914)
```

914 = 903 (the `TASK_3_6D_4_C_2` baseline) + 11 new. Both commands ran to completion with zero failures; no pre-existing test was weakened or deleted.

---

# BLOCKERS

None.

---

# WARNINGS

1. The QR-failure branch-fallback limitation (documented in detail in `QR_FAILURE_BYPASS_LOGIC`) remains a real, if narrow and honestly-degrading, edge case — inherent to the already-approved contract, not introduced here, and not fixable within this task's scope.
2. `onSucceeded`/`onFailed` are deliberately left unwired (not passed as props at all) — per this task's own explicit instruction not to implement 3.6D.5/3.6D.6 behavior. `PaymentFirstCallbackLanding`'s optional-chaining (`onSucceeded?.(result)`) already handles their absence gracefully; no crash, no dead code path.
3. `PublicMenu.jsx` now has its first-ever test file, but it covers only the new gate logic — the component's much larger pre-existing surface (menu rendering, cart, coupons, loyalty, etc.) remains untested by this task, exactly as it was before. This is scoped intentionally, not an oversight.

---

# DEFERRED

- Wiring `onSucceeded`/`onFailed` to real order-confirmation/result-mapping behavior (3.6D.5/3.6D.6).
- The QR-failure branch-fallback limitation's eventual resolution, if ever pursued (would require revisiting the approved return-URL contract or a new server capability, per `TASK_3_6D_4_C_1`'s own analysis — not started here).
- 3.6D.7 (E2E tests), 3.6E (reconciliation) — unaffected, unrelated.
- Broader `PublicMenu.jsx` test coverage beyond this task's own gate-logic scope.
- Any deployment, staging or production.

---

# SCOPE_DEVIATIONS

One, disclosed rather than hidden: `PaymentFirstCallbackLanding.jsx` received a small, unrelated-to-logic fix (a local `@keyframes spin` `<style>` tag) beyond the task's literal "receiving-side callback integration" framing. This was necessary for the integration to actually render correctly rather than silently, invisibly show a frozen (non-animating) spinner in the `RESOLVING` state — a real defect only surfaced *by* this integration, not a bundled unrelated improvement. No other file outside the explicitly-permitted `PublicMenu.jsx` (and the required test file) was touched. `App.jsx` was correctly left unmodified, since no new route was needed.

---

# GIT_STATUS

Modified this task:
```
src/pages/PublicMenu.jsx                              (tracked; +30/-? per git diff --stat)
src/features/menu/PaymentFirstCallbackLanding.jsx      (untracked since TASK_3_6D_4; content updated)
```
New file:
```
tests/unit/PublicMenuCallbackIntegration.test.jsx
reports/TASK_3_6D_4_C_3_PUBLIC_MENU_CALLBACK_INTEGRATION_REPORT.md
```

`App.jsx`: confirmed zero diff. Tracked-file diff (`git diff --stat`): 14 files changed (13 pre-existing baseline files, unchanged from prior tasks, plus `src/pages/PublicMenu.jsx` newly appearing at +30/-? — the only tracked-file change this task contributed). No commit, no push, no merge, no deploy.

---

# EXACT_NEXT_STEP

Per instruction: **stopping here.** Not proceeding automatically to `3.6D.5`, `3.6D.6`, `3.6D.7`, or `3.6E`, and not deploying anything. The payment-first flow is now, for the first time in this arc, reachable end-to-end from a live route through to an honest, RPC-verified status display — but `onSucceeded`/`onFailed` remain intentionally unwired, and nothing has been deployed to any environment. Awaiting explicit owner instruction on what comes next.

---

*Report generated 2026-08-27. Local implementation and tests only — no deployment, no Moyasar call, no commit, no push, no merge.*
