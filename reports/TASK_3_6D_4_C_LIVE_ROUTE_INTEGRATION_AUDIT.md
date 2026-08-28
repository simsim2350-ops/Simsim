# Task 3.6D.4-C — Payment-First Live Route Integration Audit

**AUDIT/SPECIFICATION ONLY. Zero source code changed. Zero tests changed. No deployment, no production migration.**

---

# EXECUTIVE_SUMMARY

`PublicMenu.jsx` was read in full (568 lines, not merely the top portion read in prior tasks). This surfaced two concrete, previously-undetected integration risks that materially shape the recommendation, beyond simply choosing where to mount a component:

1. **A query-parameter name mismatch.** The approved return-URL design (`TASK_3_6D_C`/`TASK_3_6D_E`) appends `&t=<table_qr_token>` for QR-scoped attempts, but `PublicMenu.jsx`'s own, already-live QR-token parameter is named `table`, not `t`. As written today, a customer returning from a QR-scoped payment would **not** have their table context recognized by `PublicMenu.jsx` at all.
2. **A missing branch identifier for non-QR, multi-branch checkouts.** The approved return-URL design never includes a `branch=` parameter for the non-QR path. `useMenuData(slug, branchId)` — confirmed by reading its source — silently falls back to the restaurant's **primary** branch whenever `branchId` is absent. For a customer who explicitly checked out against a **non-primary** branch, this means the callback page would silently resolve the **wrong** branch, computing the **wrong** `localStorage` key, and incorrectly reporting `MISSING_KEY` for a real, valid payment.

Neither of these is fixed in this task (out of scope, and neither `PublicMenu.jsx` nor the Edge Function may be touched here). Both are reported as **required decisions** for the future implementation task.

With those two risks documented, this audit recommends **Option A** — a new early-return gate inside `PublicMenuInner`, structurally identical to the existing `orderPlaced && ordering` full-screen takeover — over a dedicated route (Option B, which would require reopening the already-approved `returnUrl` contract) or a pre-`PublicMenuInner` shell (Option C, viable but adds duplication for a marginal isolation benefit). The exact integration point, required future code changes, and a full options comparison follow below.

---

# CURRENT_ROUTE_ARCHITECTURE

From `src/App.jsx` (re-confirmed, unchanged since `TASK_3_6D_4`'s own audit): `/menu/:slug` is the **only** public customer-facing route. No `/menu/:slug/payment-callback` or any other payment-related route exists. Query parameters already recognized by `PublicMenu.jsx`: `?branch=<branchId>` and `?table=<qrToken>`. This confirms, independently, `TASK_3_6D_C`'s original design premise — the return URL had to reuse `/menu/:slug`, since no other customer route exists to target.

---

# CURRENT_CASH_CHECKOUT_ARCHITECTURE

Traced fully through `PublicMenu.jsx`: `useCart(slug, branch?.id, t)` provides `cart`/`idempotencyKey` (the **order**-level idempotency key, `simsim_idem_{slug}_{branchId}` — a completely distinct concept and a completely distinct `localStorage` namespace from the payment-level key `simsim_payidem_{slug}_{branchId}` used by the payment-first flow; the two must never be confused, and nothing in the current code confuses them). `useCheckout({slug, restaurant, branch, cart, ..., tableQr, idempotencyKey})` drives `placeOrder`/`priceChangeInfo`/`confirmPriceUpdate`, wired directly into `<CartDrawer>`'s props. This is the **only** checkout path currently reachable from the live UI — `usePaymentFirstCheckout`, `PaymentFirstCheckoutPanel`, and `PaymentFirstPriceConfirmation` are **not imported anywhere** in `PublicMenu.jsx`, confirmed by direct inspection, not merely by absence-of-evidence.

---

# PAYMENT_FIRST_ARCHITECTURE

`PaymentFirstCheckoutPanel` (3.6D.3): props `{ slug, branchId, checkoutInput, db, orchestrate, onOutcome, onCancelled, t, isEn, brandColor }`. Internally calls `usePaymentIdempotencyKey(slug, branchId)` — **generates** a fresh key if none exists for that `slug`/`branchId` pair, correct behavior for *starting* an attempt. Not mounted anywhere in the live app (confirmed above) — this audit does not change that.

---

# CALLBACK_ARCHITECTURE

`PaymentFirstCallbackLanding` (3.6D.4): props `{ slug, branchId, db, onSucceeded, onFailed, onRecover, t, isEn, brandColor }`. Reads `useSearchParams().get('payment_callback')` purely as an activation trigger; the actual RPC query key always comes from `useResumedPaymentIdempotencyKey(slug, branchId)` — a **read-only** hook (confirmed: no `setItem`, no `randomUUID` anywhere in that file) computing the identical storage key name (`paymentIdempotencyStorageKey(slug, branchId)`, reused verbatim from `cartHelpers.js`) that `usePaymentIdempotencyKey` would have written at checkout time. **This is the load-bearing constraint the two integration risks above both violate**: the component's correctness depends entirely on being handed the *exact same* `slug`/`branchId` pair used when the original attempt started — and the current return-URL design does not reliably guarantee that pair is recoverable from the URL alone.

---

# INSPECTION_FINDINGS (audit points 1–7, 10–16)

1. **`PublicMenu.jsx` in full**: 568 lines. Four existing early-return "full-screen takeover" gates, in this exact order: `loading || resolvingTableQr` → `<MenuSkeleton />`; `rawTableQrToken && !tableQr` → blocking "QR unavailable" screen; `notFound` → not-found screen; `orderPlaced && ordering` → `<OrdersScreen>`. Only *after* all four does the normal menu/cart JSX render.
2. **`App.jsx` routing**: confirmed, single route, no changes since `TASK_3_6D_4`.
3. **Cash checkout flow**: confirmed above, fully independent of payment-first code.
4. **`PaymentFirstCheckoutPanel` integration points**: none currently — zero references anywhere in `PublicMenu.jsx`/`App.jsx`.
5. **Branch/table/QR context resolution**: `rawTableQrToken = searchParams.get('table')` → async `supabase.rpc('resolve_table_qr', {p_qr_token, p_restaurant_slug: slug})` → `tableQr` state → `effectiveBranchId = tableQr?.branchId || branchId` → passed into `useMenuData(slug, effectiveBranchId)` → `useMenuData` internally resolves the **actual** `branch` object, falling back to `is_primary` when no `branchId` matched (see EXECUTIVE_SUMMARY finding 2).
6. **Existing query-param handling**: exactly two recognized params today, `branch` and `table` — both read via the same `useSearchParams()` call the callback logic would need to extend.
7. **How `payment_callback` should be detected**: `searchParams.get('payment_callback')` — trivial, already the exact mechanism `PaymentFirstCallbackLanding` itself already uses internally; the only remaining question is *where* in `PublicMenu.jsx` to check its presence and *what* to render instead of the menu — that is the A/B/C question below.
10. **Must callback mode block normal menu interaction?** **Yes.** Recommended to mirror the `orderPlaced && ordering` precedent exactly (a full takeover, not an inline banner beside a live, interactive cart) — the current cart's contents may be stale/unrelated to the payment being resolved, and allowing a second, unrelated cash-flow order to start while a payment result is still ambiguous (`pending`) is a real confusion/double-order risk worth foreclosing entirely, not merely discouraging.
11. **Idempotency key ↔ slug/branch association**: `slug` is trivially stable (identical route parameter across the initiate→redirect→return round trip). `branchId` is **not** reliably recoverable from the URL today for the non-QR path — see EXECUTIVE_SUMMARY finding 2.
12. **`payment_callback` present but no matching localStorage key**: already correctly handled by `PaymentFirstCallbackLanding` itself — `MISSING_KEY` state, no RPC call, safe recovery action, no confirmation attempted. The risk this audit adds is not "the component mishandles this case" but "the component may be *fed the wrong `branchId`*, making a real key look missing when it isn't" — a caller-side data problem, not a component-side logic gap.
13. **Does `t`/QR token affect callback resolution, or only menu context?** Both, and inconsistently today: `t` (payment-callback's QR marker) is meant to restore *menu* context (which table), but because `PublicMenu.jsx` only recognizes `table` (not `t`), it currently affects **neither** — a QR-scoped return would neither restore table context **nor** correctly resolve `branchId` via `tableQr`, since `resolve_table_qr` would never even be triggered (see EXECUTIVE_SUMMARY finding 1).
14. **Mobile refresh / direct deep link**: because the return URL targets `/menu/:slug` (not a one-shot, self-destructing route), a refresh naturally re-runs the exact same resolution logic — this is a genuine strength of reusing the existing route, not a new risk, **provided** the `branchId`/QR issues above are resolved so the correct key is found on every reload, not just the first.
15. **Mount before or after normal menu initialization?** **After** — specifically, after the `loading || resolvingTableQr` gate resolves and after `notFound` is ruled out, so that `branch?.id` (or `tableQr?.branchId`) is a real, resolved value before `PaymentFirstCallbackLanding` ever computes its `localStorage` key. Mounting *before* menu initialization would mean calling it with `branchId = null` in the common case, which — combined with finding 2 above — would make the `useMenuData`-style "fall back to primary branch" ambiguity **unavailable** as a safety net (there'd be no resolved `branch` object to fall back to at all).
16. **Race conditions between menu loading and callback resolution**: the primary one is exactly finding 15 — resolving payment status with a not-yet-determined `branchId`. A secondary, narrower race: if the *original* checkout was QR-scoped, `resolve_table_qr` must complete (an async RPC) before `tableQr?.branchId` is known; if `payment_callback` handling doesn't wait for that same resolution (finding 1's `t`-vs-`table` mismatch aside), it would race ahead with an incomplete/wrong `branchId`. Both races point to the same conclusion: the callback gate must sit **downstream of**, not parallel to or ahead of, the existing QR/branch resolution pipeline.

---

# OPTIONS_A_B_C

## Option A — Conditional render inside `PublicMenuInner`

A new early-return gate, positioned analogously to `orderPlaced && ordering`, checking `Boolean(searchParams.get('payment_callback'))` and rendering `<PaymentFirstCallbackLanding slug={slug} branchId={branch?.id} .../>` instead of the normal menu/cart JSX.

## Option B — Dedicated route

A new `<Route path="/menu/:slug/payment-callback" element={<PaymentCallbackPage/>}/>` in `App.jsx`, with a new, separate page component wrapping `PaymentFirstCallbackLanding`. Would require **changing the already-approved `returnUrl` construction** in the Edge Function (`TASK_3_6D_C`/`TASK_3_6D_E`, both already implemented and staging-tested) to target this new path instead of `/menu/:slug` — reopening approved, tested work, not merely adding new work alongside it. This task's own instruction to explicitly **not** create a new route "yet" is itself a strong signal this is not the preferred direction.

## Option C — Pre-`PublicMenuInner` shell

Check `payment_callback` in the outer `PublicMenu` wrapper (currently just `<ErrBoundary><PublicMenuInner/></ErrBoundary>`), rendering `PaymentFirstCallbackLanding` **before** `PublicMenuInner` (and its entire cash-flow hook tree: `useMenuData`, `useCart`, `useCheckout`, `useActiveOrders`, etc.) ever mounts. Reuses `/menu/:slug`, avoiding B's return-URL problem — but would need its **own**, smaller-scope re-implementation of QR/branch resolution (at minimum, the `resolve_table_qr` call) to correctly compute `branchId`, since it wouldn't have access to `useMenuData`'s resolved `branch` object at all.

## COMPARISON

| Criterion | A (in-component gate) | B (dedicated route) | C (pre-mount shell) |
|---|---|---|---|
| UX | Same URL throughout; seamless | New URL hop away and back | Same URL; seamless |
| Security | No new surface; same trust boundary | No new surface; same trust boundary | No new surface; same trust boundary |
| Deep-link behavior | Works as-is against the approved returnUrl | **Requires changing the approved returnUrl** | Works as-is against the approved returnUrl |
| Refresh behavior | Natural — same component tree re-runs | Natural — own route re-runs | Natural — shell re-runs |
| QR/table context | **Reuses existing `tableQr`/`resolve_table_qr` resolution directly** — best fit for fixing finding 1 | Must duplicate QR resolution independently | Must duplicate a **subset** of QR resolution (branch-only) |
| Cash-flow compatibility | Requires correct gate ordering (precedented, low risk) | Fully isolated by construction | Fully isolated by construction |
| Browser back | Matches existing `orderPlaced` precedent exactly | Extra history entry; more complex back chain | Matches existing precedent |
| Accessibility | Consistent with existing full-takeover patterns | Consistent, own page | Consistent |
| Testability | Slightly harder (large host component) but the component itself is already independently tested | **Best isolation** for the new page itself | Good isolation for the shell logic |
| Routing complexity | **Lowest — no new route** | Highest — new route + returnUrl change | Low — no new route, but a new resolution path |

---

# RECOMMENDED_ARCHITECTURE

**Option A.** It is the only option that (a) requires no change to the already-approved, already-staging-verified return-URL contract, (b) can directly reuse — rather than duplicate — the exact `tableQr`/`resolve_table_qr` resolution logic needed to fix EXECUTIVE_SUMMARY finding 1, and (c) mirrors an existing, already-proven full-takeover precedent (`orderPlaced && ordering`) rather than inventing a new interaction pattern. Option C remains a reasonable fallback if a future performance/isolation concern about mounting the full cash-flow hook tree during callback resolution becomes material — flagged as a documented alternative, not dismissed outright, but not the default recommendation today given no such concern has actually been observed.

---

# EXACT_INTEGRATION_POINT (for the future implementation task — not built here)

Insert a new early-return check in `PublicMenuInner`, positioned **after** the `notFound` gate and **before** the `orderPlaced && ordering` gate (`src/pages/PublicMenu.jsx`, currently lines 260–294 house these two neighboring gates):

```
if (notFound) return (...)                         // existing, unchanged

// NEW — payment-first callback takes priority over any stale orderPlaced flag
if (searchParams.get('payment_callback')) return (
  <PaymentFirstCallbackLanding
    slug={slug}
    branchId={branch?.id}
    t={t} isEn={isEn} brandColor={brandColor}
    onSucceeded={...}   // 3.6D.6's concern — not decided here
    onFailed={...}      // 3.6D.5's concern — not decided here
    onRecover={() => navigate(`/menu/${slug}`, { replace: true })}
  />
)

if (orderPlaced && ordering) return (<OrdersScreen .../>)   // existing, unchanged
```

This positioning guarantees `branch` is already resolved (the `loading || resolvingTableQr` gate has already passed by this point in the function), directly addressing findings 15/16.

---

# REQUIRED_CODE_CHANGES_FOR_FUTURE_TASK

Explicitly not built in this task — listed for the implementation task's own planning:

1. **`src/pages/PublicMenu.jsx`**: add the gate shown above; add the `PaymentFirstCallbackLanding` import.
2. **Resolve EXECUTIVE_SUMMARY finding 1** (the `t`/`table` param mismatch) — two candidate fixes, **neither decided here**:
   - (a) `PublicMenu.jsx` additionally reads `t` as a `table`-parameter alias specifically when `payment_callback` is present, or
   - (b) the Edge Function's `buildReturnUrl` (currently in `supabase/functions/payment-first-checkout/handler.js`, per `TASK_3_6D_E`) is changed to append `&table=` instead of `&t=` for consistency — a change to already-approved, already-staging-tested code, requiring its own explicit re-approval.
3. **Resolve EXECUTIVE_SUMMARY finding 2** (missing `branch=` for non-QR multi-branch checkouts) — two candidate fixes, **neither decided here**:
   - (a) the Edge Function's `buildReturnUrl` also appends `&branch=<branchId>` for the non-QR path (same re-approval caveat as above), or
   - (b) a new, small, checkout-time-written `localStorage` entry (e.g. `simsim_lastbranch_{slug}`) recording the branch the customer actually checked out against, read back by the callback gate instead of relying on the URL at all — avoids touching the Edge Function, but is new client-side state needing its own design pass.
4. **`onSucceeded`/`onFailed` callback wiring** — deliberately left as open interface points; their actual behavior is 3.6D.5 (result-mapping)/3.6D.6 (order confirmation)'s scope, not this task's or the future integration task's to decide.

---

# STATE_DATA_DEPENDENCIES

`PaymentFirstCallbackLanding` needs, at mount time: a resolved `slug` (always available, trivial), a resolved `branchId` (available only after `useMenuData`+`tableQr` resolution completes — see findings above), and `t`/`isEn`/`brandColor` (all already computed earlier in `PublicMenuInner`, freely reusable). It needs **nothing else** from the surrounding component — no `cart`, no `restaurant` object beyond `brandColor`, no `products`. This is a genuinely narrow dependency footprint, reinforcing that Option A's "mount late, reuse what's already resolved" approach is cheap once the gate is correctly positioned.

---

# QUERY_PARAMETER_HANDLING

Current: `branch`, `table`. Required addition: recognizing `payment_callback` (already read internally by `PaymentFirstCallbackLanding` itself — `PublicMenu.jsx` only needs to check *presence*, not parse the value itself, to decide whether to render the gate). Required decision: how `t` relates to `table` (finding 1).

---

# LOCALSTORAGE_DEPENDENCY

Two **entirely separate** namespaces already exist and must never be conflated: `simsim_idem_{slug}_{branchId}` (order-level, `useCart`/`useCheckout`, cash flow) and `simsim_payidem_{slug}_{branchId}` (payment-level, `usePaymentIdempotencyKey`/`useResumedPaymentIdempotencyKey`, payment-first flow). The future integration introduces no new namespace — it only needs to ensure the **same** `branchId` value is used to compute the payment-level key on both the writing side (checkout initiation, not yet live-wired either) and the reading side (this callback gate).

---

# BRANCH_SLUG_QR_CONSIDERATIONS

Fully covered in INSPECTION_FINDINGS points 5, 11, 13, 15, 16 and EXECUTIVE_SUMMARY findings 1–2 above — the single most load-bearing set of findings in this audit.

---

# ERROR_RECOVERY_BEHAVIOR

Already fully designed and implemented inside `PaymentFirstCallbackLanding` itself (`TASK_3_6D_4`): `MISSING_KEY`/`FAILED`/`UNKNOWN` states each offer a safe `onRecover` action. The only new responsibility the future integration task has is wiring `onRecover` to something sensible in this specific host — the recommendation above (`navigate('/menu/:slug', {replace:true})`, stripping the `payment_callback` query param) is the natural choice, consistent with how `goToCartsBranch` already uses `navigate(..., {replace:true})` elsewhere in this same file for an analogous "leave this transient state cleanly" purpose.

---

# ACCESSIBILITY_CONSIDERATIONS

`PaymentFirstCallbackLanding` already uses `role="status"`/`role="alert"` with `aria-live="polite"` per state (`TASK_3_6D_4`) — no additional accessibility work is required at the integration layer itself. The one host-level consideration: when the gate activates, focus should logically move to the callback card rather than remaining on whatever the menu would otherwise have focused — a minor, standard SPA-navigation accessibility detail for the future task to include, not a structural finding.

---

# TEST_PLAN (for the future implementation task)

- A `PublicMenu.jsx`-level test (new, since none currently exists for this file per this session's search) or a narrowly-scoped test of just the new gate's condition/props, verifying: `payment_callback` present → `PaymentFirstCallbackLanding` renders instead of the menu/cart; absent → normal menu renders unaffected; `payment_callback` present but `orderPlaced` also true → callback gate wins (priority order); the gate does not render before `branch` is resolved (i.e., not before the `loading`/`resolvingTableQr` gates clear).
- Once finding 1/2 are resolved by the future task, dedicated tests for each: QR-scoped return correctly resolves `tableQr`/`branch` via the reconciled parameter; non-QR multi-branch return correctly resolves the *original* branch, not silently the primary one.
- No change needed to `PaymentFirstCallbackLanding`'s own existing 18 tests, nor to `useResumedPaymentIdempotencyKey`'s 6 — both remain valid, host-agnostic unit tests.

---

# ROLLBACK_STRATEGY (for the future implementation task)

Because Option A adds a single, self-contained, purely additive conditional branch (no modification to any existing gate's own logic, no change to `useCart`/`useCheckout`/the cash flow), rollback is a one-line revert (remove the new `if` block and its import) with zero blast radius on the existing cash-flow behavior — a materially simpler rollback story than Option B would have (which would also need reverting the Edge Function's `returnUrl` change).

---

# OWNER_DECISIONS_REQUIRED

1. **Approve Option A** as the integration architecture, or direct B/C instead.
2. **Resolve the `t`/`table` parameter mismatch** (finding 1) — alias in `PublicMenu.jsx`, or change the Edge Function's return-URL construction (requires reopening `TASK_3_6D_C`/`TASK_3_6D_E`).
3. **Resolve the missing non-QR `branch=` gap** (finding 2) — extend the Edge Function's return-URL (same reopening caveat), or introduce a new, small "last selected branch" `localStorage` entry.
4. **Decide `onSucceeded`/`onFailed` wiring** — explicitly deferred to 3.6D.5/3.6D.6, not this audit's or the integration task's call.
5. **Confirm whether Option C's fuller isolation is worth its added duplication** — not required now, but worth an explicit "no, not needed" or "yes, revisit" decision rather than leaving it implicit.

---

# EXPLICIT_NON_GOALS

- Implementing Option A (or any option).
- Modifying `PublicMenu.jsx`, `App.jsx`, the Edge Function, `paymentService.js`, or `payment-webhook`.
- Deciding 3.6D.5's result-mapping UI or 3.6D.6's order-confirmation wiring.
- Fixing findings 1 or 2 — only documenting and proposing candidate fixes.
- Creating any new route.
- Any deployment or production migration.

---

# RISKS

- **If findings 1/2 are not resolved before live wiring**, a real subset of returning customers (QR-scoped, or non-QR multi-branch on a non-primary branch) would see an incorrect `MISSING_KEY` state for a genuinely successful payment — a customer-trust risk, not merely a cosmetic one, since a customer whose money was taken would be told their attempt cannot be found.
- **Gate-ordering risk**: if a future implementer places the new gate *before* `notFound` or *before* the `loading`/`resolvingTableQr` gates (rather than exactly where this audit recommends), the race conditions in finding 16 would resurface.
- **Scope-creep risk**: because fixing findings 1/2 properly touches already-approved Edge Function code, there is a temptation to "just fix it while we're in there" during the integration task — this audit explicitly recommends treating that as its own decision (see OWNER_DECISIONS_REQUIRED items 2–3), not an automatic side effect of wiring the gate.

---

# IMPLEMENTATION_SEQUENCE (recommended, for future tasks — not started here)

1. Owner decision on findings 1/2 (OWNER_DECISIONS_REQUIRED items 2–3).
2. If either requires an Edge Function change: a dedicated, narrowly-scoped spec-and-approval task (mirroring `TASK_3_6D_C`'s own process), then a dedicated implementation task — **not** bundled into the route-integration task itself.
3. The route-integration task itself: the single gate shown in EXACT_INTEGRATION_POINT, plus its own focused tests (TEST_PLAN above).
4. Only then, 3.6D.5 (result-mapping) and 3.6D.6 (order confirmation) can meaningfully wire `onSucceeded`/`onFailed` to real behavior.

---

# GIT_STATUS

No file was created or modified by this task beyond this report. `git status --short`/`git diff --stat` are byte-identical to the pre-task baseline (13 tracked files, 772 insertions(+), 23 deletions(-); the same set of pre-existing untracked files from prior tasks, none new except this report). No commit, no push, no merge.

# REGRESSION_BASELINE

**897/897 remains unchanged** — this task performed zero code or test changes; confirmed by the git-diff comparison above rather than by re-running the suite (nothing that could affect test outcomes was touched).

---

# NEXT_STEP

Awaiting explicit owner decisions on the `OWNER_DECISIONS_REQUIRED` list above, in particular the two concrete integration gaps (query-parameter mismatch, missing non-QR branch identifier) this audit surfaced, before any implementation task begins. Per instruction: **stopping here**, not proceeding to 3.6D.5, 3.6D.6, 3.6D.7, or 3.6E, and not implementing any part of the recommended architecture.

---

*Report generated 2026-08-27. Audit only — no code, no schema, no deployment, no Moyasar call, no commit, no push, no merge.*
