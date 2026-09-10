# Phase 3B — Customer Session Issuance — Execution Report

> **Status: Code complete, tested, and deployed to a Vercel PREVIEW environment. The production-domain (`simsimmenu.com`) cookie-survival checkpoint could NOT be verified — blocked on a missing prerequisite discovered empirically during testing (`SUPABASE_SERVICE_ROLE_KEY` not configured on Vercel). Per your explicit stop condition, this is reported honestly rather than worked around, and Phase 3C is NOT started.**
> No `create_order`/checkout/`verify_phone_otp`/Phase 3A schema modified. No commit/push/PR/merge. No production deployment attempted.

---

## 1. Executive Summary

Built the smallest possible Route Handler (`POST /api/customer/verify-otp`) that calls the existing, unmodified `verify_phone_otp` and `create_customer_session` RPCs and, on success only, sets an HttpOnly session cookie — exactly the flow specified. 25 new unit tests pass, the full existing regression suite passes unchanged (1144/1144), and both `menu-next` and the Vite dashboard build cleanly.

Deployed the code to a real Vercel **preview** deployment (not production — see §8 for why) and tested it live: input validation, method handling, and the deployment/build pipeline itself all work correctly on real infrastructure. Then, attempting the actual OTP→session success path surfaced a real, previously-unknown blocker: **`SUPABASE_SERVICE_ROLE_KEY` is not configured as a Vercel environment variable for the `simsim-menu-next` project** (at minimum, not for the Preview environment — Production status is separately unconfirmed, see §8). This was discovered empirically, from real production log output, not assumed. The Route Handler's own fail-closed design caught this correctly and safely (generic `500`, no leak) — proving the *code* works exactly as intended even while exposing a *configuration* gap outside this session's control.

Because this blocks reaching the actual cookie-issuance code path at all, it also blocks the specific `simsimmenu.com` proxy-survival checkpoint you flagged as critical — that checkpoint requires a working session first, and (separately) a production deployment, which was not attempted this session (§8 explains the reasoning). **This is reported as the honest state, per your explicit stop-condition instruction, rather than guessed at or worked around.**

---

## 2. Exact Route Handler Files

| File | Role |
|---|---|
| `menu-next/app/api/customer/verify-otp/route.ts` | Thin Next.js entrypoint — reads the service-role client, delegates to `handler.js`. The first Route Handler this app has ever had (previously zero existed anywhere in `menu-next`). |
| `menu-next/app/api/customer/verify-otp/handler.js` | All request/response logic — testable with Vitest, no Next.js runtime required (same `buildHandler({...})`-injection pattern as `supabase/functions/send-phone-otp/handler.js`). |
| `menu-next/lib/supabase/serviceRole.ts` | New, minimal `service_role` client factory — separate from the existing `supabaseServer()` (which deliberately stays on the anon key). Reads `SUPABASE_SERVICE_ROLE_KEY` (not `NEXT_PUBLIC_*`, so it can never reach the browser bundle). Returns `null`, not a fallback client, if unset. |
| `menu-next/.env.local.example` | Documented the new `SUPABASE_SERVICE_ROLE_KEY` variable (no value) — **note**: this file is caught by `menu-next/.gitignore`'s pre-existing `.env*` pattern and was never tracked in git history even before this change (confirmed via `git log` on the file — empty), so this edit exists on disk but produces no git diff. Pre-existing repo quirk, unrelated to this task, not fixed (out of scope). |
| `tests/unit/customerVerifyOtpRoute.test.js` | 25 tests (§7). |

## 3. Exact Request/Response Flow

```
POST /api/customer/verify-otp
{ "phone": "5XXXXXXXX", "code": "XXXXXX" }
        │
        ├─ method/body/phone-format/code-format validation (400 on any failure,
        │  before any RPC is touched)
        │
        ├─ service_role client missing → 500 {"error":"internal_error"} (fail closed)
        │
        ├─ verify_phone_otp(phone, code)   [UNMODIFIED, Phase 1]
        │     │
        │     ├─ verified=false → 200 {"verified": false}  (no cookie, no session RPC call)
        │     │
        │     └─ verified=true, customer_id known
        │           │
        │           ├─ create_customer_session(customer_id)   [UNMODIFIED, Phase 3A]
        │           │     │
        │           │     ├─ RPC error / missing token → 500 {"error":"internal_error"}
        │           │     │
        │           │     └─ token received
        │           │           │
        │           │           └─ 200 {"verified": true}
        │           │              + Set-Cookie: simsim_customer_session=<token>; Path=/;
        │           │                Max-Age=2592000; HttpOnly; Secure; SameSite=Lax
        │           │              (token never in the JSON body, never logged again)
```

`customer_id` is **never** accepted from the request body — it only ever comes from `verify_phone_otp`'s own return value for a call this handler made itself (tested explicitly, §7).

## 4. Cookie Attributes

```
simsim_customer_session=<64-char hex token>; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax
```
- `Max-Age=2592000` = exactly 30 days, matching Phase 3A's `expires_at` policy.
- No `Domain` attribute — host-only cookie (the more conservative default; not requested in your attribute list, not added).
- Exact attribute set verified by unit test (§7) and by static code review of `buildSessionCookie()` — **not yet verified against a real browser's cookie jar**, since that requires the blocked live flow (§8/§9).

## 5. Service-Role Boundary

- `SUPABASE_SERVICE_ROLE_KEY` is read only in `serviceRole.ts`, server-side, via a plain (non-`NEXT_PUBLIC_`) env var — Next.js's own build-time bundling rule is what actually enforces this never reaches client JavaScript (any `NEXT_PUBLIC_*`-prefixed var is inlined into the browser bundle; anything else is not).
- The `service_role` client itself is never imported into any Client Component, never returned in any response, never logged.
- Verified in the deployed preview's real runtime logs (§8): the only thing logged when the key is missing is the literal string `"service_role not configured"` — no key value, no client object, nothing sensitive.

## 6. Security Analysis

| Requirement | Status |
|---|---|
| `service_role` server-side only, never sent to browser | ✅ By construction (env var naming) + verified via real log inspection |
| Browser never receives `customer_id` as a credential | ✅ Response body is `{"verified": true}` only — no `customer_id` field anywhere in any response |
| `customer_id` never accepted from the browser as authority | ✅ Tested explicitly — a client-supplied `customer_id` in the request body is silently ignored; only `verify_phone_otp`'s own return value is ever used |
| No client-supplied session token accepted for issuance | ✅ The endpoint only ever *creates* new sessions from a freshly-verified OTP; it has no code path that accepts an existing token as input at all |
| Phone/code input validated | ✅ Canonical `5XXXXXXXX` regex, 6-digit code regex, both enforced before any RPC call |
| Generic OTP failure response | ✅ `{"verified": false}`, identical shape regardless of the underlying reason (matches `verify_phone_otp`'s own Phase 1 contract, unmodified) |
| No token in logs/errors/URLs/response body | ✅ Tested explicitly (5 dedicated tests, §7) and confirmed by inspecting real deployed logs (§8) |
| No `localStorage`/`sessionStorage` used for the credential | ✅ The only place the token is written is a `Set-Cookie` response header — no client-side JS in this deliverable touches storage at all |

## 7. Tests and Exact Results

**25/25 passing** in `tests/unit/customerVerifyOtpRoute.test.js` (Vitest, no real Supabase/Next.js runtime):

| Category | Tests | Result |
|---|---|---|
| Request validation | non-POST rejected, malformed JSON rejected, invalid phone (6 variants) rejected before any RPC call, invalid code (6 variants) rejected before any RPC call, missing service_role → safe 500 | ✅ 5/5 |
| Successful flow | correct RPC call order/args, `customer_id` from body ignored (attacker-supplied value never used), `{"verified":true}` + 200, exact cookie attribute string match, no `Domain` attribute, token never in JSON body | ✅ 6/6 |
| Failed OTP | `{"verified":false}` + 200 + no session RPC call, no `Set-Cookie` on failure, expired/wrong/replayed OTP all produce the identical generic shape | ✅ 4/4 |
| DB error handling | `verify_phone_otp` RPC error → safe 500 (raw message never leaked), `create_customer_session` RPC error → safe 500 + no cookie, defensive checks for missing `customer_id`/missing `token` in otherwise-successful RPC responses, thrown exceptions caught and mapped safely | ✅ 5/5 |
| Logging safety | token never logged, phone never logged, code never logged, `customer_id` never logged, DB error messages never logged raw/unsanitized | ✅ 5/5 |

Mapped to your required list: "successful OTP → session created" (§7 successful-flow group + §8 live proof of the *attempt* reaching the right RPC), "invalid OTP → no session" (✅ unit-tested), "expired OTP → no session" (✅ unit-tested, via `verify_phone_otp`'s uniform false-shape), "replayed OTP → no new session" (✅ unit-tested), "session cookie attributes" (✅ unit-tested), "no token in response body" (✅ unit-tested), "no token in logs" (✅ unit-tested + confirmed live, §8).

## 8. Vercel Rewrite Cookie Verification — **BLOCKED, NOT COMPLETED**

**What was attempted, in order:**

1. Deployed `menu-next` to a Vercel **preview** deployment (not production) — `vercel deploy --project simsim-menu-next` from the repo root (the project's configured Root Directory is `menu-next`, so the deploy source must include the repo root, not just the `menu-next` subfolder — discovered by a first failed attempt, corrected). Build succeeded; `/api/customer/verify-otp` correctly listed as a dynamic route in the build output.
2. The preview URL is protected by Vercel's own Deployment Protection (SSO) — expected, standard Vercel behavior for previews, not a bug. Used Vercel's own suggested tool (`vercel curl`, which handles the protection-bypass token automatically) to reach it.
3. Safe smoke test (invalid phone format) — **passed**: `{"error":"invalid_phone"}`, proving the deployment is live and routes correctly.
4. Real functional test — used the existing, already-proven disposable-test-fixture technique (a test `customer_identities` row with a **known** OTP hash injected directly via SQL, exactly the method already used and reported in Phases 1/2/2.1) instead of triggering a new real SMS send, per your explicit "minimize real SMS usage" instruction. Called the endpoint with the matching phone+code.
5. **Result: `HTTP 500 {"error":"internal_error"}`.**
6. Inspected the real deployment's runtime logs directly (`vercel logs`, not guessed): the log line was exactly `[verify-otp:<id>] service_role not configured` — the handler's own fail-closed branch, working exactly as designed, given a missing secret.

**Conclusion: `SUPABASE_SERVICE_ROLE_KEY` is not configured for this Vercel project (confirmed for the Preview environment scope; Production scope is separately unconfirmed — not tested, since no production deployment was attempted).**

**Why no production deployment was attempted, even though it might have had the secret configured differently:** (a) testing the `simsimmenu.com`-specific proxy-survival checkpoint specifically requires the code to be live at the exact production alias (`simsim-menu-next.vercel.app`, which is what `vercel.json`'s rewrite targets) — a preview URL cannot substitute for this; (b) reaching production requires either a git-based deploy (explicitly forbidden this phase) or a direct `vercel deploy --prod` CLI call, which — unlike a reversible, non-customer-facing preview — would push new, security-sensitive, not-yet-reviewed code straight to the live app every real customer uses, bypassing the git/PR review process this entire project has consistently required before any production-affecting action; (c) given the missing secret would very likely reproduce the exact same failure in production anyway (making the risk-for-no-benefit trade especially poor right now), the responsible choice was to stop and report rather than escalate to a higher-risk action to chase a check that can't succeed yet regardless.

**This directly matches your own instruction's stop condition** ("If the Vercel rewrite does not preserve the cookie correctly... STOP immediately... Report the exact failure") — the specific failure mode found is one step earlier than anticipated (a missing prerequisite rather than a rewrite/cookie incompatibility), but the same STOP-and-report response applies.

**Items 4-9 of your required empirical proof list (browser receives the cookie / attributes / survives the rewrite / persists across navigation / JS cannot read it / no token in DB-logs-response) could not be attempted** — all require a working session to exist first, which requires the missing secret.

**Item 9 specifically (no plaintext token in DB/logs/response body) IS independently confirmed** — not for lack of trying, but because it holds trivially true in the blocked state: zero sessions were created (§9), so there is no token anywhere to have leaked, and the failure-path logs were directly inspected and confirmed clean (§8.6).

## 9. Session DB Row Before/After

| | Before | After |
|---|---|---|
| `customer_sessions` for the test fixture | 0 | **0** — the flow never reached `create_customer_session` (it fails closed one step earlier), confirmed by direct query |
| `customer_identities`, `customer_phone_verifications` (test fixture) | 0 | 0 (created for the test, then deleted immediately after — same disposable-fixture discipline as every prior phase) |
| Production `orders` / `loyalty_accounts` / `restaurants` / `branches` | 174 / 63 / 7 / 8 | **174 / 63 / 7 / 8** — unchanged |

## 10. Logs Inspection

Queried real Vercel runtime logs for the preview deployment directly (`vercel logs`). Two entries found for this endpoint:
```
info   POST /api/customer/verify-otp   (the safe smoke-test request)
error  POST /api/customer/verify-otp
[verify-otp:<request-id>] service_role not configured
```
**No token, no phone number, no OTP code, no `customer_id`, no API key, no service-role key value appears in either entry.** This is real, direct evidence — not inferred from code review alone.

## 11. Regression / Build Results

```
npx vitest run           → 60 Test Files passed, 1144 Tests passed  (1119 prior + 25 new)
npm run build (Vite)     → ✓ built in 31.46s
cd menu-next && npm run build → ✓ Compiled successfully, TypeScript passed, /api/customer/verify-otp
                                  correctly listed as a dynamic route
```
One build issue found and fixed during implementation (§13).

## 12. Files Created / Modified

**Created:**
- `menu-next/app/api/customer/verify-otp/route.ts`
- `menu-next/app/api/customer/verify-otp/handler.js`
- `menu-next/lib/supabase/serviceRole.ts`
- `tests/unit/customerVerifyOtpRoute.test.js`

**Modified:**
- `menu-next/.env.local.example` (documentation only — adds the `SUPABASE_SERVICE_ROLE_KEY` line; produces no git diff, §2)

**Not touched:** everything else, including all of Phase 3A's SQL, `verify_phone_otp`, `create_order`, `CheckoutForm.tsx`, `restaurant_customers`, `customer_identities`, Feature Registry, loyalty, menu themes — confirmed via `git status` (§15).

## 13. Problems Found / Fixed

1. **TypeScript build error**: `buildVerifyOtpHandler({ db })`'s JSDoc typed `db` as `object`, but `serviceRole.ts` can return `null` — Next.js's `tsc` check failed on this mismatch. **Fixed**: widened the JSDoc type to `object | null` (a documentation-only change, zero runtime effect, already reflected in the code shown in §2/§7).
2. **Vercel deploy targeting the wrong project**: the repo root's own `.vercel/project.json` links to the `simsim` (Vite dashboard) project, not `simsim-menu-next` — a first deploy attempt from inside `menu-next/` uploaded the wrong directory structure (missing the expected `menu-next/` subfolder the project's Root Directory setting expects), and a second attempt from the repo root without an explicit `--project` flag deployed to the wrong project entirely. **Fixed**: `vercel deploy --project simsim-menu-next` from the repo root, which correctly targets the right project while uploading the full structure it expects.
3. **`SUPABASE_SERVICE_ROLE_KEY` missing on Vercel** — not a code problem, reported as a blocker (§8), not silently worked around.

## 14. Rollback Procedure

All four new files can be deleted with no residual effect — nothing else in the repository imports or calls any of them (this route is unreachable from any existing page/component; nothing links to `/api/customer/verify-otp` anywhere yet). No database change was made this phase (Phase 3A's schema is untouched). The one preview deployment created (`simsim-menu-next-c0iebvpbv-...vercel.app`) is inert, protected by Vercel's own SSO, not linked from anywhere customer-facing, and can be left as-is or removed via `vercel remove` at your discretion — it does not affect production.

## 15. Explicit Confirmation — Everything NOT Changed

**`create_order`**: untouched. **Checkout / `CheckoutForm.tsx`**: untouched. **`verify_phone_otp`**: untouched — called, never modified. **Phase 3A schema/functions** (`customer_sessions`, `create_customer_session`, `validate_customer_session`, `revoke_customer_session`, `revoke_all_customer_sessions`): untouched — called, never modified, no blocking defect was found that would have justified touching them. **`restaurant_customers`**: untouched. **`customer_identities`**: untouched (only referenced, never altered). **Loyalty, Feature Registry, menu/themes**: untouched — no file in any of those areas was opened or edited. **Session validation** (a separate, later operation): not implemented — only issuance, exactly as scoped. **Logout**: not implemented. **Customer UI integration**: not implemented — nothing in the existing UI calls this new endpoint yet. **Git status** confirms this precisely: exactly 4 new files + 1 modified-but-untracked documentation file, plus the same 9 pre-existing unrelated modified files carried unchanged through every prior turn this session.

## 16. Explicit Confirmation — No Git Actions

**No `git add`, `git commit`, `git push`, branch creation, PR, or merge occurred this turn.** The one Vercel action taken was a **preview** deployment via direct CLI upload (not a git-triggered deployment, not production) — explicitly distinct from, and not a substitute for, the git actions your instructions prohibit.

---

## Recommendation

**To unblock:** configure `SUPABASE_SERVICE_ROLE_KEY` as a Vercel environment variable for the `simsim-menu-next` project (Vercel Dashboard → Project → Settings → Environment Variables — value is the Supabase project's `service_role` key from the Supabase Dashboard → Settings → API; scope it to at least Preview to re-run this exact verification, and to Production once you're ready for that step). I did not set this myself and did not invent a value, per the same discipline applied to `AUTHENTICA_API_KEY` in Phase 2.

**Stopping here, per your instruction — Phase 3C is not started, awaiting your review.**
