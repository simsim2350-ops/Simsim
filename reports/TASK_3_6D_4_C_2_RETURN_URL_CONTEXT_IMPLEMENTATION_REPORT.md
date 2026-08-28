# Task 3.6D.4-C.2 — Payment-First Return URL Context Implementation

**Implements the owner-approved TASK_3_6D_4_C_1 contract exactly. No PublicMenu.jsx/App.jsx wiring, no deploy, no bundled fixes.**

---

# EXECUTIVE_SUMMARY

Implemented the approved return-URL context contract in `buildReturnUrl` (`supabase/functions/payment-first-checkout/handler.js`): the non-QR path now includes `branch=<tenant.branch_id>`; the QR path's parameter is renamed from `t` to `table`, with no compatibility alias (correctly, since this Edge Function has never been deployed anywhere); `branch` is never present on a QR return and `table` is never present on a non-QR return, enforced structurally inside `buildReturnUrl` itself (an `if`/`else if`, not two independent conditions the caller could accidentally trigger together). `payment_callback` is untouched — still the literal key value, still only ever consumed as an activation trigger by `PaymentFirstCallbackLanding` (unmodified, unaffected by this task). Six tests added/renamed to the Edge Function's existing return-URL test suite. 903/903 tests pass (897 baseline + 6 new). Nothing was deployed to staging or production — this task never reached a staging-verification phase, per its own scope, and none was attempted.

---

# APPROVED_CONTRACT

`reports/TASK_3_6D_4_C_1_RETURN_URL_CONTEXT_CONTRACT.md`, as amended by the owner's explicit approval: `branch` required for non-QR, omitted for QR; `table` required for QR, omitted for non-QR; `t` deprecated with **no** compatibility alias; `payment_callback` remains, value-only-as-trigger invariant unchanged; no provider reference or internal transaction ID in the URL; `branch` passed from `tenant.branch_id` (already-resolved server context), never derived from slug, no new `localStorage` namespace. Implemented literally, with no reinterpretation.

---

# EXACT_FILES_MODIFIED

- **`supabase/functions/payment-first-checkout/handler.js`** — `buildReturnUrl`'s signature and body, and its one call site.
- **`supabase/functions/payment-first-checkout/handler.test.js`** — return-URL tests updated/extended.
- **`reports/TASK_3_6D_4_C_2_RETURN_URL_CONTEXT_IMPLEMENTATION_REPORT.md`** (this file).

No other file was touched. `PublicMenu.jsx`, `App.jsx`, `paymentService.js`, `payment-webhook`, every SQL/RPC file, and every other payment-first source file are confirmed unmodified (`git diff --stat` for `PublicMenu.jsx`/`App.jsx` shows zero lines changed; `paymentService.js`'s diff is identical to every prior task's pre-existing baseline, untouched by this task specifically).

---

# BUILD_RETURN_URL_BEFORE_AFTER

**Before**:
```js
function buildReturnUrl({ publicAppBaseUrl, restaurantSlug, paymentIdempotencyKey, tableQrToken }) {
  let url = `${publicAppBaseUrl}/menu/${encodeURIComponent(restaurantSlug)}?payment_callback=${encodeURIComponent(paymentIdempotencyKey)}`
  if (tableQrToken) {
    url += `&t=${encodeURIComponent(tableQrToken)}`
  }
  return url
}
```
Called with `{ publicAppBaseUrl, restaurantSlug: tenant.restaurant_slug, paymentIdempotencyKey, tableQrToken: isQr ? validation.table_qr_token : null }` — no branch information passed at all, for either path.

**After**:
```js
function buildReturnUrl({ publicAppBaseUrl, restaurantSlug, paymentIdempotencyKey, tableQrToken, branchId }) {
  let url = `${publicAppBaseUrl}/menu/${encodeURIComponent(restaurantSlug)}?payment_callback=${encodeURIComponent(paymentIdempotencyKey)}`
  if (tableQrToken) {
    url += `&table=${encodeURIComponent(tableQrToken)}`
  } else if (branchId) {
    url += `&branch=${encodeURIComponent(branchId)}`
  }
  return url
}
```
Called with the same fields plus `branchId: isQr ? null : tenant.branch_id` added. The `if (tableQrToken) {...} else if (branchId) {...}` structure makes `branch`/`table` mutual exclusivity a **property of the function itself**, not merely an artifact of how the one current call site happens to invoke it — matching the approved contract's own framing ("`branch` OMITTED for QR", "`table` OMITTED for non-QR") as a hard rule, not an incidental outcome.

---

# NON_QR_BEHAVIOR

`buildReturnUrl` receives `branchId: tenant.branch_id` — the **server-resolved** value from `resolveSlugTenant` (itself sourced from the client's checkout request, per the already-approved `TASK_3_6D_C` `REQUEST_CONTRACT`, but resolved and held server-side in `tenant` by the time `buildReturnUrl` runs). Result: `...?payment_callback=<key>&branch=<tenant.branch_id>` — exactly the approved shape, with no `table` parameter present. Verified live in `PFCX-42a` (`branch` equals the exact `tenant.branch_id` value, URL-encoded) and `PFCX-42c` (the full parameter set is exactly `{branch, payment_callback}`, nothing more).

---

# QR_BEHAVIOR

`buildReturnUrl` receives `tableQrToken: validation.table_qr_token` and `branchId: null` (explicitly, via the `isQr ? null : tenant.branch_id` ternary at the call site). Result: `...?payment_callback=<key>&table=<qrToken>` — no `branch` parameter, and the parameter name is now `table`, not `t`. Verified live in `PFCX-39` (renamed assertion), `PFCX-42b` (`branch` absent), `PFCX-42d` (full parameter set exactly `{payment_callback, table}`), and `PFCX-40b` (the deprecated `t` parameter never appears on **either** path — checked via a regex boundary match, `/[?&]t=/`, not a naive substring check, so it cannot be fooled by `t` appearing inside another parameter's name or value).

---

# SECURITY_INVARIANTS

All explicitly re-verified unchanged, none weakened by this task:
- **`payment_callback`'s value remains only an activation trigger.** This task did not touch `PaymentFirstCallbackLanding.jsx` or `useResumedPaymentIdempotencyKey.js` at all — the RPC query key still comes exclusively from `localStorage`, never from the URL. Nothing in this change alters that file or that behavior.
- **No provider reference or internal transaction ID was added to the URL** — `buildReturnUrl`'s new `branchId` parameter is the same, already-public `branch_id` value `PublicMenu.jsx` already exposes today (per `TASK_3_6D_4_C_1`'s own finding 9); nothing sensitive was introduced.
- **`branch` is never derived from `slug`** — it comes exclusively from `tenant.branch_id`, itself either server-resolved via QR lookup (unused here, since QR omits `branch` entirely) or passed through from the already-validated non-QR checkout request. No new derivation logic was written.
- **No new `localStorage` namespace was introduced** — this task touches only the Edge Function's outbound URL construction; `PaymentFirstCheckoutPanel`/`usePaymentIdempotencyKey`/`useResumedPaymentIdempotencyKey` are all untouched.
- **URL encoding preserved** — `encodeURIComponent` is applied to `branchId` exactly as it already was (and still is) applied to `restaurantSlug`, `paymentIdempotencyKey`, and `tableQrToken`; no new encoding scheme was introduced.

---

# TESTS_ADDED_UPDATED

In `supabase/functions/payment-first-checkout/handler.test.js`:
- **`PFCX-39`** (updated, not merely renamed cosmetically): now asserts `&table=<qrToken>`, replacing the old `&t=<qrToken>` assertion — updated *because* the approved contract explicitly changes the canonical QR parameter name, not to paper over a failure.
- **`PFCX-40`** (updated): now asserts `&table=` is absent from the non-QR return URL (previously asserted `&t=` absent) — same rationale.
- **`PFCX-40b`** (new): the deprecated `t` parameter never appears on **either** the QR or non-QR return URL — the explicit "no compatibility alias" requirement, verified directly rather than merely implied by the other renamed assertions.
- **`PFCX-42a`** (new): non-QR return URL's `branch` value exactly equals `tenant.branch_id` (`'branch-1'` in the test fixture), URL-encoded correctly.
- **`PFCX-42b`** (new): QR return URL never includes a `branch` parameter at all — no redundancy.
- **`PFCX-42c`** (new): the non-QR return URL's **complete** parameter set is exactly `{branch, payment_callback}` — proves no additional, unapproved parameter sneaks in, not merely that the two expected ones are present.
- **`PFCX-42d`** (new): the QR return URL's **complete** parameter set is exactly `{payment_callback, table}` — same completeness guarantee for the QR path.
- **`PFCX-42e`** (new): the return URL's base/slug/`payment_callback` shape is unchanged by this contract — a regression guard specifically for "did this change accidentally touch something the contract didn't ask for."

No existing test outside this file's return-URL block needed any change — `SEC-05` (client-supplied `returnUrl` never forwarded verbatim) and every other Edge Function test remain valid and unaffected, confirmed by all 67 tests in this file passing together.

---

# FOCUSED_RESULTS

```
npx vitest run supabase/functions/payment-first-checkout/handler.test.js
 Test Files  1 passed (1)
      Tests  67 passed (67)
```

---

# FULL_REGRESSION

```
npx vitest run
 Test Files  50 passed (50)
      Tests  903 passed (903)

npm test -- --run
 Test Files  50 passed (50)
      Tests  903 passed (903)
```

903 = 897 (the `TASK_3_6D_4_C_1` baseline) + 6 new (`PFCX-40b`, `PFCX-42a`..`42e`). Both commands ran to completion with zero failures; no pre-existing test outside the return-URL block was modified.

---

# STAGING_STATUS

**Not deployed.** This task's own scope explicitly limits staging deployment to "if the task explicitly reaches the staging verification phase and target is confirmed" — it did not reach that phase; this task ended at local implementation and test verification only, per instruction ("STOP after implementation and tests").

# PRODUCTION_STATUS

**Not deployed, not applied.** `payment-first-checkout` remains undeployed to any environment, exactly as it has been throughout every prior task in this arc.

---

# BLOCKERS

None.

---

# WARNINGS

1. This change touches already-approved `TASK_3_6D_C`/`TASK_3_6D_E` code — consistent with `TASK_3_6D_4_C_1`'s own `OWNER_DECISIONS_REQUIRED` item 4 (treated as a scoped extension of already-approved work, per that report's framing, not a full new specification cycle) and with this task's own explicit authorization to modify `buildReturnUrl`.
2. The `PublicMenu.jsx` integration gate (`TASK_3_6D_4_C`'s own recommended architecture) still has **not** been implemented — this task only makes the return URL *capable* of carrying correct context; nothing yet consumes `branch`/`table` for payment-callback purposes on the receiving end (though `PublicMenu.jsx`'s existing, unrelated `branch`/`table` reading logic will already work correctly with these values once that separate integration task is authorized).
3. The `MISSING_TABLE_BEHAVIOR` requirement from `TASK_3_6D_4_C_1` ("`payment_callback` presence must bypass the QR-failure blocking gate") remains **unimplemented** — it is a `PublicMenu.jsx`-side behavior, explicitly out of this task's scope, and is not accidentally satisfied by this Edge Function change alone.

---

# SCOPE_DEVIATIONS

None. Only `buildReturnUrl` and its one call site were changed, plus their existing test file. `PublicMenu.jsx`, `App.jsx`, `paymentService.js`, `payment-webhook`, and every SQL/RPC file are confirmed untouched. No new Edge Function was created. No callback UI wiring was implemented. No deployment of any kind occurred. No unrelated fix was bundled in.

---

# GIT_STATUS

Modified this task (both files already untracked from `TASK_3_6D-E`'s original, never-committed work — remain untracked, now with new content):
```
supabase/functions/payment-first-checkout/handler.js
supabase/functions/payment-first-checkout/handler.test.js
```
New file:
```
reports/TASK_3_6D_4_C_2_RETURN_URL_CONTEXT_IMPLEMENTATION_REPORT.md
```

Tracked-file diff (`git diff --stat`): byte-identical to every prior task's baseline in this arc (13 files, 772 insertions(+), 23 deletions(-)) — zero new tracked-file changes. `PublicMenu.jsx`/`App.jsx` individually confirmed at zero diff. No commit, no push, no merge, no deploy.

---

# EXACT_NEXT_STEP

Per instruction: **stopping here.** Not proceeding automatically to the `PublicMenu.jsx` integration gate, `3.6D.5`, `3.6D.6`, `3.6D.7`, or `3.6E`, and not deploying anything. Awaiting explicit owner instruction on when to authorize the `PublicMenu.jsx` integration task (`TASK_3_6D_4_C`'s own recommended architecture), which can now proceed with confidence that the return URL itself carries correct, complete context for both the QR and non-QR paths.

---

*Report generated 2026-08-27. Local implementation and tests only — no deployment, no Moyasar call, no commit, no push, no merge.*
