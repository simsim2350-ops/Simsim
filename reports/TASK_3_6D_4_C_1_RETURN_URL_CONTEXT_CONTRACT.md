# Task 3.6D.4-C.1 — Payment-First Return URL Context Contract

**Specification + audit only. No source code changed. No tests changed. No deployment.**

---

# EXECUTIVE_SUMMARY

The exact live `buildReturnUrl` implementation was re-read in full (`supabase/functions/payment-first-checkout/handler.js`, lines 316–322), not assumed from prior reports. This confirms both gaps `TASK_3_6D_4_C` found are real and precisely scoped: the function accepts only `publicAppBaseUrl`, `restaurantSlug`, `paymentIdempotencyKey`, `tableQrToken` — **`branch_id` is never passed to it at all, for either path**, even though `tenant.branch_id` is already sitting in scope one line above the call. This is a small, mechanical omission, not a structural limitation.

Two new facts, verified against live code rather than assumed, materially strengthen the recommendation:

1. **`branch_id` is already a public, non-secret URL parameter today.** `PublicMenu.jsx` already reads `?branch=<branchId>` from ordinary, shareable menu URLs (`src/pages/PublicMenu.jsx:39`). Adding it to the payment-first return URL discloses **nothing** that isn't already routinely visible in this application.
2. **This Edge Function has never been deployed to any environment.** Every 3.6D-E/3.6D.4-B* task explicitly avoided deploying `payment-first-checkout` itself (only the separate status RPC was ever applied, to staging). There is **zero backward-compatibility risk** — no real `t=`-based URL has ever reached a real browser.

**Recommended contract, verified against the actual code, not assumed correct in advance**: Option A, refined —
```
non-QR: ${BASE}/menu/${slug}?payment_callback=${key}&branch=${branchId}
QR:     ${BASE}/menu/${slug}?payment_callback=${key}&table=${qrToken}
```
`branch` is **omitted** for the QR path (redundant — `table` already resolves branch server-side via the existing `resolve_table_qr` RPC `PublicMenu.jsx` already calls). `table` replaces `t` (aligning with `PublicMenu.jsx`'s own existing, live parameter name). The **already-implemented, already-audited invariant that `payment_callback`'s value is never treated as authoritative** — only its *presence* activates the resolution flow, and the actual RPC query key always comes from `localStorage` — is reaffirmed, not weakened, and is restated as a permanent, binding security invariant of this contract (see SECURITY_MODEL).

A new, precise risk was also surfaced during this audit and is documented for the first time here: an **incorrect-but-valid-looking** `branch` value (not merely a *missing* one) could cause the callback to silently read a **different, stale** payment attempt's `localStorage` entry from the *same* browser (if that browser previously checked out at another branch under the same slug and that old attempt never reached a terminal, key-clearing state) — a subtler failure mode than simple `MISSING_KEY`, and a reason `branch` correctness matters even beyond the "false missing-key" framing `TASK_3_6D_4_C` originally used.

---

# CURRENT_IMPLEMENTATION

Exact, re-verified source (`supabase/functions/payment-first-checkout/handler.js:316-322`):
```js
function buildReturnUrl({ publicAppBaseUrl, restaurantSlug, paymentIdempotencyKey, tableQrToken }) {
  let url = `${publicAppBaseUrl}/menu/${encodeURIComponent(restaurantSlug)}?payment_callback=${encodeURIComponent(paymentIdempotencyKey)}`
  if (tableQrToken) {
    url += `&t=${encodeURIComponent(tableQrToken)}`
  }
  return url
}
```
Called at line 125, **before** `orchestrate()` (line 153) — i.e., before `create_order`'s own dry-run has verified `branch_id` genuinely belongs to the resolved restaurant. This ordering is safe in practice (see CURRENT_GAPS point 6) but is worth stating explicitly, since it means the return URL is constructed from **not-yet-fully-validated** input for the non-QR path specifically.

---

# CURRENT_GAPS (audit points 1–10)

1. **Exact `buildReturnUrl` location**: confirmed above.
2. **Every current query parameter**: `payment_callback` (always), `t` (QR only). No `branch` parameter exists in any code path.
3. **Parameters used by `PublicMenu.jsx`**: `branch`, `table` (confirmed via `TASK_3_6D_4_C`'s full read of `src/pages/PublicMenu.jsx:39-40`) — **not** `t`.
4. **Parameters used by `PaymentFirstCallbackLanding`**: `payment_callback` only (`useSearchParams().get('payment_callback')`), purely as an activation trigger — confirmed by re-reading `src/features/menu/PaymentFirstCallbackLanding.jsx`.
5. **Exact `branchId` available at checkout time**: for the QR path, `tenant.branch_id` (server-resolved via `resolveQrTenant`, itself derived from the `restaurant_tables`/`branches` join — fully server-validated). For the non-QR path, `tenant.branch_id = validation.branch_id` — the **client-supplied** `body.branch_id` from the checkout POST request, passed through `resolveSlugTenant` unchanged (that function never independently re-checks it against the restaurant — see next point).
6. **Is `branch_id` authoritative at checkout initiation?** For QR: yes, fully server-resolved and validated before `buildReturnUrl` is ever reached. For non-QR: **not yet**, at the exact moment `buildReturnUrl` runs — the client-supplied value is only later validated by `create_order`'s own dry-run *inside* `orchestrate()`, which runs *after* the return URL is built. This is safe regardless: if the branch is genuinely invalid, the checkout is rejected before Moyasar is ever contacted, and the return URL — built with that invalid value — is simply never exercised (the customer never reaches a page that could use it). If the branch is valid, by the time the customer could ever actually return from Moyasar, the same value has already been confirmed valid by the dry-run that had to succeed for the redirect to happen at all.
7. **QR token availability at checkout initiation**: yes, already available (`validation.table_qr_token`) and already threaded into `buildReturnUrl` today — no change needed on this point, only the parameter *name* on the receiving (`PublicMenu.jsx`) side.
8. **Does adding `branch` to the URL leak sensitive information?** No — see point 9.
9. **Are branch IDs already publicly visible/used elsewhere?** **Yes, confirmed by direct code inspection**: `src/pages/PublicMenu.jsx:39` — `const branchId = searchParams.get('branch')` — already a live, ordinary, shareable, bookmarkable query parameter on the exact same route, used for exactly the same purpose (selecting which branch's menu to show). This is the single fact that most cleanly resolves the "is this safe to add" question the task asked me not to assume.
10. **Backward compatibility implications**: none — `payment-first-checkout` has never been deployed to staging or production (confirmed by absence from every 3.6D-E/3.6D.4-B*/3.6D.4-C task's own deployment actions, all of which explicitly touched only the status RPC or nothing at all). No real `t=`-based URL has ever been issued.

---

# OPTION_A_ANALYSIS — `branch=`/`table=` explicit parameters

| Criterion | Assessment |
|---|---|
| Correctness | Fixes both gaps directly; branch context is now recoverable from the URL alone on every load, including cross-device (though the payment key itself still correctly requires the *same* browser's `localStorage`, per the unchanged security invariant). |
| Security | No new exposure — `branch` is already exactly this public elsewhere (finding 9). `table`/`payment_callback` unchanged from today's already-accepted exposure level. |
| Privacy/information disclosure | None — nothing new is revealed that isn't already visible in ordinary menu URLs. |
| Deep links | Fully self-contained — a deep link alone carries enough context to render the right branch/menu context, independent of any prior browsing history on that device. |
| Refresh | Fixed — a refresh re-reads the same URL, same correct branch, every time. |
| Browser restart | The URL-encoded context survives; only the `localStorage`-held payment key itself can be lost (unchanged, expected, already-handled `MISSING_KEY` case). |
| Multi-branch correctness | **Fixed** — this was the core gap. |
| QR correctness | **Fixed** — parameter name now matches `PublicMenu.jsx`'s existing, live convention. |
| `localStorage` dependency | **Unchanged** — this option touches only *context* resolution (which branch to show/check), never the actual security-critical key source, which remains `localStorage`-only exactly as `TASK_3_6D_4`/`TASK_3_6D_4_C` established and this contract explicitly preserves. |
| Idempotency-key namespace correctness | Fixed as a direct consequence — the correct `branchId` now reliably reproduces the exact `paymentIdempotencyStorageKey(slug, branchId)` string used at write time. |
| Implementation complexity | **Lowest** — one additional constructor parameter, using a value (`tenant.branch_id`) already in scope at the call site. |
| Compatibility with current architecture | High — pure additive extension of an already-approved function's parameter list; no new concepts introduced. |
| Migration complexity | Low — a single Edge Function change, requiring its own small re-approval (it touches already-approved `TASK_3_6D_C`/`TASK_3_6D_E` code) but no new infrastructure. |
| Rollback | Trivial — revert one function's parameter list and the two call sites that build it. |
| Testability | Straightforward — extends the existing `PFCX-37`..`40` return-URL test pattern (`TASK_3_6D_E`) with two more assertions (branch present for non-QR, absent for QR). |

---

# OPTION_B_ANALYSIS — minimal URL + `localStorage` "last branch" value

| Criterion | Assessment |
|---|---|
| Correctness | Also fixes the gap, but **only** for same-browser, same-session returns — which is actually the *only* case that can ever succeed anyway, since the payment key itself is equally `localStorage`-bound. So its "advantage" of being independent of the URL is moot: a cross-device return fails at the key lookup regardless of how branch context is carried. |
| Security | No new URL exposure (branch never appears in the URL at all) — marginally "better" on paper, but meaningless given finding 9 (branch isn't sensitive to begin with). |
| Privacy | No meaningful difference from A. |
| Deep links | Strictly worse than A for zero real benefit — a deep link opened fresh (no prior `localStorage` for this browsing session on this specific device) has no way to recover branch context at all, even in cases where A's explicit parameter would still let the menu render correctly (even if the payment key itself is separately unresolvable). |
| Refresh | Works, same as A, as long as the new `localStorage` entry survives. |
| Browser restart | Same failure mode as the payment key itself losing its `localStorage` entry — coupled, not independent, which is arguably *fine* (both would be lost together, consistent), but is a second piece of state to reason about instead of one. |
| Multi-branch correctness | Fixed, with the same coupling caveat above. |
| QR correctness | **Unaffected by this option specifically** — the `t`/`table` rename is an orthogonal fix needed regardless of A vs. B. |
| `localStorage` dependency | **Increased** — introduces a *third* `localStorage` namespace (alongside the existing order-idempotency and payment-idempotency keys), with a real, non-trivial new correctness risk: if the customer browses to a *different* branch under the *same* slug between initiating checkout and returning (e.g., opens the menu again in another tab while waiting), a naive "last branch" value could be silently overwritten, corrupting the callback's later lookup — a risk Option A does not have, since its context is fixed at the moment the specific return URL was generated, immune to later, unrelated browsing. |
| Idempotency-key namespace correctness | Fixed, with the overwrite risk noted above as a new, non-trivial edge case to design around (debounce writes? scope by attempt, not just slug? — added design surface Option A never needs). |
| Implementation complexity | Higher — a new write path (at checkout initiation, inside `PaymentFirstCheckoutPanel` or wherever it eventually gets wired) **and** a new read path (at the callback landing gate) — two new pieces vs. Option A's one. |
| Compatibility | Fine, but adds a new state-management concept the current architecture doesn't otherwise need. |
| Migration complexity | Two-sided coordination (writer + reader must ship together; A only ever needs the writer, the Edge Function, updated). |
| Rollback | Slightly more coordination than A's single-function revert. |
| Testability | More surface: needs its own overwrite/staleness tests beyond what A requires. |

---

# OPTION_C_ANALYSIS — server-generated opaque token, context resolved server-side

| Criterion | Assessment |
|---|---|
| Correctness | Could work in principle, but solves a **client-side UI-routing question** (which branch's menu to render) with **new server infrastructure** (a new lookup capability, effectively a second RPC alongside `get_payment_status_by_idempotency_key`) — disproportionate to the problem. |
| Security | No meaningful improvement over A, since `branch_id` was never sensitive to begin with (finding 9) — there is nothing here worth hiding behind an opaque token. |
| Privacy | No meaningful difference. |
| Deep links / Refresh / Browser restart | Comparable to A once built, but at much higher cost to build. |
| Multi-branch / QR correctness | Fixable, but via a heavier mechanism than warranted. |
| `localStorage` dependency | Could in principle be reduced further, but the task's own CRITICAL constraints already forbid weakening the "payment status resolution must stay `localStorage`-sourced, RPC-verified" invariant — so this option does not actually buy anything on that axis either. |
| Implementation complexity | **Highest** — a new SQL/RPC object, its own full specification-and-approval cycle (mirroring the entire `TASK_3_6D_4_A` → `B` → `B.1` → `B.2` arc just completed for a *different*, genuinely security-critical capability), for a problem (menu-branch routing) that isn't security-critical at all. |
| Compatibility | Introduces a new architectural pattern (server-resolved UI context) not otherwise present anywhere in this codebase's menu-routing logic. |
| Migration/rollback | Heaviest of the three. |
| Testability | More surface, more integration points. |
| **Verdict** | **Not recommended.** Explicitly disproportionate: the only thing that genuinely needed server-side, RPC-mediated resolution — payment *status* — already has exactly that, via the already-approved, already-staging-verified `get_payment_status_by_idempotency_key`. Branch/menu *context* is a different, much lower-stakes problem that doesn't warrant the same treatment. |

---

# RECOMMENDED_CONTRACT

**Option A**, refined per the analysis above — not merely because it was the task's own suggested starting point, but because the code-level verification in this task (finding 9 specifically) confirms its central premise (branch_id is safe to expose) rather than merely assuming it.

## EXACT_URL_EXAMPLES

```
Non-QR:  https://app.simsim.example/menu/koshary?payment_callback=pay_3f9a2b1c-...&branch=c1a9ab8d-7f65-4d30-ac18-f8db8a27cbec
QR:      https://app.simsim.example/menu/koshary?payment_callback=pay_3f9a2b1c-...&table=8f2e1a90-...
```

## PARAMETER_SCHEMA

| Parameter | Required | Path | Source | Notes |
|---|---|---|---|---|
| `payment_callback` | Always | both | `paymentIdempotencyKey` (server-resolved at checkout initiation, per `TASK_3_6D_C`'s IDEMPOTENCY decision — client-supplied-and-echoed, or server-generated) | **Activation trigger only** — never authoritative (see SECURITY_MODEL) |
| `branch` | Non-QR only | non-QR | `tenant.branch_id` (already in scope, simply not yet threaded through) | Omitted entirely for QR — redundant there |
| `table` | QR only | QR | `validation.table_qr_token` (unchanged from today's `tableQrToken`) | **Renamed from `t`** to match `PublicMenu.jsx`'s existing, live parameter name |

## QR_BEHAVIOR

Unchanged in substance from today, only the parameter name changes (`t` → `table`). On return, `PublicMenu.jsx`'s **already-existing** `resolve_table_qr` resolution (`src/pages/PublicMenu.jsx:50-76`) picks it up exactly as it already does for any other QR-scoped menu visit — no new resolution logic needed, only the rename closes the gap.

## NON_QR_BEHAVIOR

`branch` is read by `PublicMenu.jsx`'s existing `const branchId = searchParams.get('branch')` (line 39) exactly as it already handles any other non-QR menu visit — again, no new logic, only supplying a value that was previously always absent for payment-first returns specifically.

## MULTI_BRANCH_BEHAVIOR

With `branch` present and correct, `useMenuData(slug, branchId)`'s existing resolution (`resolvedBranch = list.find(b => b.id === branchId) || list.find(b => b.is_primary)`) finds the **exact, correct** branch on the first attempt — the primary-branch fallback path is never exercised for a genuine payment-first return, closing the gap `TASK_3_6D_4_C` found.

## MISSING_BRANCH_BEHAVIOR

If `branch` is ever absent on a non-QR return (should not happen once this contract is implemented, but must degrade safely if it ever does — e.g., a manually-copied/truncated URL): falls through to `useMenuData`'s existing primary-branch fallback — the **same, already-accepted** behavior as any ordinary `/menu/:slug` visit with no `?branch=` at all. Not a new failure mode; simply the pre-existing one, now only reachable in a genuinely anomalous case instead of on every non-QR payment-first return.

## MISSING_TABLE_BEHAVIOR

If `table` is present but `resolve_table_qr` fails (e.g., a QR code disabled between checkout and return): today, `PublicMenu.jsx`'s existing `rawTableQrToken && !tableQr` gate (line 250) **blocks the entire page** with a generic "QR unavailable" screen — which would incorrectly prevent the customer from ever reaching payment-status resolution at all, even though their money may have already been taken. **This contract requires** (as a behavioral rule for the future integration task, not implemented here) that `payment_callback`'s presence take priority over — or otherwise bypass — that specific blocking gate, so a failed QR re-resolution degrades to `useMenuData`'s primary-branch fallback for *menu rendering* purposes, while payment-status resolution proceeds regardless. This restates and sharpens a risk `TASK_3_6D_4_C` already flagged (finding 16 there); this contract makes it an explicit, required behavior rather than an implicit hope.

## MALFORMED_PARAMETER_BEHAVIOR

- Malformed/garbage `payment_callback` → indistinguishable from any other unrecognized key; the RPC returns no row → `UNKNOWN` state (already correctly implemented, no change).
- Malformed `branch` (not a real/matching UUID) → `useMenuData`'s existing `find(...)` simply finds nothing, falls through to the primary-branch default — safe, already-existing behavior.
- Malformed `table` → already handled by the existing `resolve_table_qr` failure path (returns no row → `tableQr` stays `null` → existing blocking-screen behavior, itself subject to the required bypass-for-payment_callback rule above).

## OLD_T_COMPATIBILITY

**None required.** Confirmed (CURRENT_GAPS point 10) that no real `t=`-based URL has ever been issued to any real browser, in any environment. A future implementation task may rename `t` to `table` directly, with no transitional alias, no dual-reading logic, and no migration window needed.

## BACKWARD_COMPATIBILITY

None required, for the same reason.

---

# SECURITY_MODEL

Restated and made explicit and permanent, not weakened by this contract:

1. **`payment_callback`'s value is never proof of anything.** It activates the resolution flow; it is never the actual RPC query argument (`resumedKey`, sourced from `localStorage`, always is — already correctly implemented in `PaymentFirstCallbackLanding`, unchanged by this contract).
2. **`branch`/`table` are context-only parameters.** They influence *which menu renders* and *which `localStorage` namespace is checked* — they do not themselves grant access to any payment data. The RPC's own exact-match-by-key logic (already staging-verified, `TASK_3_6D_4_B_2`) remains the *only* actual authorization boundary.
3. **New, precise risk this audit surfaces**: an **incorrect** (not merely absent) `branch` value does not fail safely to `MISSING_KEY` in every case — if the *same browser* previously checked out at a *different* branch under the *same slug*, and that older attempt never reached a terminal (key-clearing) state, a wrong `branch` value could cause the callback to read that **different, stale** attempt's data instead. This is why `branch` must be **exactly correct**, not merely "a valid-looking branch ID" — a distinction the "false `MISSING_KEY`" framing in `TASK_3_6D_4_C` did not fully capture. Mitigation: since this contract's `branch` value is always server-generated at checkout time from the *already-validated* tenant resolution (never client-editable in the URL by the time it matters — a customer *could* hand-edit the URL, but doing so to their own browser only risks confusing *their own* view of *their own* prior attempts, never another customer's data, since the namespace is always scoped to values only that customer's own checkout flow could have produced).
4. **`providerRef`/internal transaction IDs are never exposed** — in the URL, in the RPC response, or in the rendered UI. Unchanged, already established, re-confirmed by this contract.
5. **No new PII.** `slug`/`branch`/`table` are all already-public identifiers (finding 9); this contract adds no field whose sensitivity hasn't already been assessed and accepted elsewhere in this codebase.

---

# PRIVACY_ANALYSIS

No new personal data of any kind is added to the URL by this contract — `branch` is a restaurant-operational identifier (which physical location), not customer data, and is already exposed identically today via ordinary menu links. No change to this codebase's existing privacy posture.

---

# MIGRATION_PLAN (for the future implementation task — not executed here)

1. Owner approves this contract (or an amended version).
2. A small, scoped change to `buildReturnUrl` (add a `branchId` parameter, thread `tenant.branch_id` into the non-QR call site only, rename `t` to `table`) — itself needing a brief re-approval since it touches already-approved `TASK_3_6D_C`/`TASK_3_6D_E` code, but not a full new spec-and-approval cycle given its small, mechanical scope.
3. Extend the Edge Function's own existing return-URL tests (`PFCX-37`..`40` pattern) to assert the new parameter's presence/absence per path.
4. Re-verify in staging using the same discipline already established (`TASK_3_6D_4_B_1`/`B.2`): no fixture fabrication beyond what's already approved, confirm no production impact, confirm the RPC/webhook/`paymentService.js` remain untouched.
5. Only then does `TASK_3_6D_4_C`'s own `EXACT_INTEGRATION_POINT` (the `PublicMenu.jsx` gate) become safe to implement with full confidence that `branch?.id` will be correct on every payment-first return.

---

# REQUIRED_FUTURE_CODE_CHANGES

- **`supabase/functions/payment-first-checkout/handler.js`**: `buildReturnUrl` gains a `branchId` parameter; the non-QR call site passes `tenant.branch_id`; the QR call site does not; `t` → `table` in the string construction.
- **No other file requires a change to implement this contract itself** — `PublicMenu.jsx`'s existing `branch`/`table` reading logic already works correctly once supplied the right values; no new parsing logic is needed there for this contract specifically (the *gate* that renders `PaymentFirstCallbackLanding` is `TASK_3_6D_4_C`'s own separate concern, not re-scoped here).

---

# REQUIRED_TESTS (for the future implementation task)

- `buildReturnUrl` unit-level: non-QR → `branch=<id>` present, `table` absent; QR → `table=<qrToken>` present (renamed), `branch` absent.
- End-to-end shape check (mirroring existing `PFCX-37`..`40`): the full URL string matches the exact schema above for both paths.
- No change needed to `PaymentFirstCallbackLanding`'s own 18 tests or `useResumedPaymentIdempotencyKey`'s 6 — both are host-agnostic and already correctly consume whatever `branchId` prop they're given.

---

# ROLLBACK_STRATEGY

Single-function, single-file change with no dependent new tables, RPCs, or `localStorage` namespaces — revert is a direct one-file diff revert, with zero coordination needed across other files (unlike Option B's two-sided writer/reader coupling).

---

# OWNER_DECISIONS_REQUIRED

1. **Approve this contract** (Option A, as refined) — canonical parameter names (`branch`, `table`), required/optional rules per path, and the explicit `t`-has-no-users-yet rename with no compatibility shim.
2. **Approve the "payment_callback bypasses the QR-failure blocking gate" behavioral rule** (MISSING_TABLE_BEHAVIOR) as a binding requirement for the future `PublicMenu.jsx` integration task, not merely a suggestion.
3. **Confirm no objection to `payment_callback` continuing to carry the real key value** in the URL (rather than a boolean marker) — no security reason to change it, but flagged as a legitimate, available alternative if the owner prefers additional minimalism for non-security reasons (shorter URLs, less in browser history).
4. **Confirm the small `buildReturnUrl` change's approval path** — treated as a scoped extension of already-approved work, not a full new `TASK_3_6D_C`-style specification cycle, given its size — or direct otherwise.

---

# EXPLICIT_NON_GOALS

- Implementing this contract in `buildReturnUrl` or anywhere else.
- Modifying `PublicMenu.jsx`, the Edge Function, `paymentService.js`, `payment-webhook`, or any SQL/RPC.
- Starting `TASK_3_6D_4_C`'s own implementation, or `3.6D.5`/`3.6D.6`/`3.6D.7`/`3.6E`.
- Deciding `onSucceeded`/`onFailed` wiring (unrelated to this contract).
- Any deployment or production/staging change.

---

# RISKS

- **If `branch` is added but is ever wrong rather than merely absent** (SECURITY_MODEL point 3), the failure mode is subtler than a clean `MISSING_KEY` — a stale, unrelated attempt's data could surface instead. Mitigated by the value always being server-generated from already-validated tenant resolution, never client-editable in a way that could affect *another* customer, but worth the future implementation task's explicit test coverage (a same-browser, two-different-branches scenario).
- **If the MISSING_TABLE_BEHAVIOR rule (bypass QR-failure blocking) is not implemented correctly**, a QR-scoped customer whose table was disabled between checkout and return would see a confusing "QR unavailable" error instead of their actual payment result — a real customer-trust risk if missed, not merely cosmetic.
- **Scope-creep risk**, restated from `TASK_3_6D_4_C`: because this change touches already-approved Edge Function code, there may be a temptation to bundle unrelated improvements into the same future task — this contract recommends keeping it strictly to the `branch`/`table` fix alone.

---

# DEPENDENCIES

This contract's implementation is a **prerequisite** for `TASK_3_6D_4_C`'s own recommended `PublicMenu.jsx` integration gate to be *correct* (not merely present) — the gate can technically be built without this contract, but would inherit both known gaps if done so. No other task in this arc depends on this contract; `3.6D.5`/`3.6D.6`/`3.6D.7`/`3.6E` are all unaffected either way.

---

# GIT_STATUS

No file was created or modified by this task beyond this report. `git status --short`/`git diff --stat` are byte-identical to the pre-task baseline (13 tracked files, 772 insertions(+), 23 deletions(-); no new untracked file except this report). No commit, no push, no merge.

# REGRESSION_BASELINE

**897/897 confirmed unchanged** — this task performed zero code or test changes.

---

# NEXT_STEP

Awaiting explicit owner approval on the `OWNER_DECISIONS_REQUIRED` list above before any implementation begins. Per instruction: **stopping here.** Not starting `TASK_3_6D_4_C`'s implementation, and not proceeding to `3.6D.5`, `3.6D.6`, `3.6D.7`, or `3.6E`.

---

*Report generated 2026-08-27. Specification only — no code, no schema, no deployment, no Moyasar call, no commit, no push, no merge.*
