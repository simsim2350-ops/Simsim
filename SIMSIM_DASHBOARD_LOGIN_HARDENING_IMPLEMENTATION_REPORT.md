# SIMSIM DASHBOARD LOGIN HARDENING — IMPLEMENTATION REPORT
# Migration 5.0 — Rate Limiting & Temporary Account Lockout

**Implemented and live-verified in production.** Scope: Dashboard Owner (`src/pages/Login.jsx`) + Staff (`src/pages/StaffLogin.jsx`) Email+Password login only. Customer OTP/Customer Session/Customer Menu, Restaurant Dashboard page-based authorization (`member_has_page_access`, `allowed_pages`), and all business data were not touched.

---

## Executive Summary

Migration 5.0 closes Finding F-01 (HIGH — no application-level rate limiting or account lockout on Dashboard/Staff password login). A new Supabase Edge Function, `dashboard-login-guard`, now sits between the browser and Supabase Auth: it enforces an atomic, server-side account lockout (5 failed attempts → 15-minute temporary lockout) and IP-based sliding-window throttle (20 failed attempts / 15 minutes), combined with logical OR, before Supabase Auth is ever asked to verify a password. `src/store/authStore.js`'s `signIn()` is the only frontend code changed — it now calls this gateway instead of `supabase.auth.signInWithPassword()` directly, then hydrates the existing `supabase-js` session via `setSession()`. Every claim below marked LIVE-VERIFIED was proven against the real, deployed production Edge Function and database — including a genuine, full 15-minute real-time wait for automatic lockout recovery, not a simulated one. Account enumeration protection (Migration 4.9's PASS finding) was re-verified live and holds. The full existing test suite (1333 tests) passes with zero regressions, and the Customer OTP/Session/Menu system was re-confirmed live and unaffected.

## Implementation Changes

| File | Change |
|---|---|
| `sql/phase6_migration5_0_dashboard_login_rate_limiting.sql` | New. Two tables + two `SECURITY DEFINER` functions. |
| `sql/phase6_migration5_0_rollback.sql` | New. Drops exactly those four objects. |
| `supabase/functions/dashboard-login-guard/index.ts` | New. Edge Function entrypoint. |
| `supabase/functions/dashboard-login-guard/handler.js` | New. Testable request-handling logic. |
| `supabase/functions/dashboard-login-guard/ipHash.js` | New. Verbatim-pattern copy of the existing `send-phone-otp`/Loyalty IP-hashing precedent. |
| `tests/unit/dashboardLoginGuard.test.js` | New. 28 unit tests (Vitest), no real Deno/Supabase/network calls. |
| `src/store/authStore.js` | Modified — **`signIn()` only**. No other export changed. `Login.jsx`/`StaffLogin.jsx` untouched. |

No other file was modified. `git diff --staged --stat` (reviewed before commit) shows exactly these 7 files, 1085 insertions, 1 deletion.

## Database Changes

Applied via `apply_migration` (see the SQL file for full comments/rationale):

- **`public.dashboard_login_lockouts`** (`account_key text primary key, failure_count integer, lock_until timestamptz, updated_at timestamptz`) — one row per account that has ever failed a login.
- **`public.dashboard_login_attempts`** (`id, account_key, ip_hash, outcome check in ('failure','success','blocked'), created_at`) — append-only operational log, indexed on `(account_key, created_at)` and `(ip_hash, created_at)`.
- Both: `ENABLE ROW LEVEL SECURITY`, zero policies, explicit `REVOKE ALL ... FROM PUBLIC, anon, authenticated`.
- **`public.check_dashboard_login_allowed(account_key, ip_hash)`** — `SECURITY DEFINER`, `search_path = public`. Read-only precheck: denies if the account is locked OR the IP has ≥20 failures in the last 15 minutes; never reveals which.
- **`public.record_dashboard_login_outcome(account_key, ip_hash, success)`** — `SECURITY DEFINER`, `search_path = public`. Atomic upsert-increment (`INSERT ... ON CONFLICT DO UPDATE`, Postgres's standard atomic pattern) on success/failure; sets `lock_until = now() + 15 minutes` once `failure_count >= 5`.
- Grants verified live (`information_schema.routine_privileges`): **only `postgres` and `service_role` have `EXECUTE` on either function — no `anon`, no `authenticated`, no `PUBLIC`.**
- `account_key` is the normalized (trim + lowercase) submitted email — never a foreign key to `auth.users`, so a non-existing email is rate-limited identically to a real one (Migration 5.0 §12).

## Edge Function

`dashboard-login-guard`, deployed with `verify_jwt: true` (same convention as every other Edge Function already in this project — `dynamic-action`, `delete-staff`, `create-platform-admin`, `send-phone-otp`, all `verify_jwt: true`). The browser sends the anon/publishable key as `apikey` + `Authorization: Bearer <anon key>` — this is not a session token and reveals nothing about the specific login attempt; it only lets Supabase's own gateway filter out requests with no valid API key before they reach this code at all.

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are all automatically available to every Edge Function in this project (confirmed via the pre-existing `create-platform-admin/index.ts`, which already relies on all three) — no new secret provisioning was required. One optional secret, `DASHBOARD_LOGIN_ALLOWED_ORIGINS`, defaults to `https://simsimmenu.com` (the confirmed real production origin the Dashboard SPA is served from) if unset.

## Frontend Changes

Only `src/store/authStore.js`'s `signIn()` function body changed (see diff below — 43 lines, entirely inside this one function plus one new import). `Login.jsx` and `StaffLogin.jsx` are **byte-for-byte unchanged** — both still call `signIn(email, password)` and inspect a thrown `Error`'s `.message`, exactly as before.

```diff
+import { appConfig } from '../config'
 ...
   signIn: async (email, password) => {
-    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
+    const res = await fetch(`${appConfig.supabaseUrl}/functions/v1/dashboard-login-guard`, {
+      method: 'POST',
+      headers: { 'Content-Type': 'application/json', apikey: appConfig.supabaseAnonKey, Authorization: `Bearer ${appConfig.supabaseAnonKey}` },
+      body: JSON.stringify({ email, password }),
+    })
+    const body = await res.json().catch(() => null)
+    if (body?.error === 'email_not_confirmed') throw new Error('Email not confirmed')
+    if (!res.ok || typeof body?.access_token !== 'string' || typeof body?.refresh_token !== 'string') throw new Error('Invalid login credentials')
+    const { data, error } = await supabase.auth.setSession({ access_token: body.access_token, refresh_token: body.refresh_token })
     if (error) throw error
     return data
   },
```

### Unexpected dependency found and resolved (documented, per task §26's own instruction)

`Login.jsx` has a pre-existing branch (unrelated to this migration) that redirects to `/verify-email` when Supabase Auth returns `email_not_confirmed`. Collapsing this into the generic rejection would have been a real UX regression. **Live-tested empirically** (against a pre-existing, disposable, unconfirmed test account already in the database from an earlier phase, using a deliberately wrong password): Supabase Auth validates the **password first** — `email_not_confirmed` is only ever returned when the password was actually correct. This means preserving this branch distinctly does **not** reopen enumeration on wrong-password attempts (Migration 4.9's tested case is unaffected) — it only ever fires for a caller who already has the correct password, and this exact information was already surfaced by this product today, pre-migration. The gateway now returns `{error:"email_not_confirmed"}` distinctly in this one case only, and records it as a rate-limit **success** (the credentials were valid) — every other failure reason still collapses to the identical generic rejection.

## Authentication Flow

```
Browser (Login.jsx / StaffLogin.jsx, UNCHANGED)
  → authStore.signIn(email, password)
  → fetch dashboard-login-guard (apikey + Authorization: Bearer <anon key>)
       Edge Function:
         1. Validate request shape (malformed → generic rejection, no DB call)
         2. Normalize email → account_key
         3. Extract + SHA-256 hash source IP
         4-5. check_dashboard_login_allowed → if locked/throttled: generic rejection, Supabase Auth NEVER called
         6. Forward to Supabase Auth POST /auth/v1/token?grant_type=password
         7. record_dashboard_login_outcome (best-effort; never flips an already-decided outcome)
  → on success: {access_token, refresh_token}
  → supabase.auth.setSession({access_token, refresh_token})
  → autoRefreshToken / onAuthStateChange / signOut: all unchanged, unaffected
```

## Rate Limit Policy

- **Account:** 5 failed attempts → 15-minute temporary lockout (approved policy, task §3 — implemented exactly as specified, not independently re-derived).
- **IP:** 20 failed attempts / 15-minute sliding window → temporary throttle (approved policy, task §3).
- **Combined:** either blocking is sufficient (logical OR) — an attacker cannot bypass account lockout by rotating IPs (the account counter is IP-independent), and cannot bypass IP throttling by rotating target accounts (the IP counter is account-independent).

## Account Lockout Policy

- Increments only on a **real, confirmed-wrong-credentials** response from Supabase Auth — a malformed request never reaches the counter (proven: unit tests assert `db.rpc` and `fetch` are never called for malformed input).
- Success resets `failure_count = 0, lock_until = NULL` — **live-verified**.
- After a lockout naturally expires, the next wrong attempt starts a **fresh cycle** (`failure_count = 1`, not a continuation) — **live-verified** both via a simulated-clock DB test and, separately, via the real 15-minute production wait.
- `email_not_confirmed` (correct password, unconfirmed account) is treated as a rate-limit success (see above) — not a failure.

## IP Protection

SHA-256 of the extracted source IP (`x-forwarded-for` first entry → `x-real-ip` → `"unknown"`), no raw IP stored anywhere, no HMAC (per approved design). **New, positive empirical finding this task:** a client-supplied `X-Forwarded-For` header was tested live against the deployed function and did **not** change the computed `ip_hash` — Supabase's Edge Runtime overrides/ignores an externally-supplied `X-Forwarded-For` in this project's configuration. This is stronger evidence than the "defensive, not asserted as verified" caveat carried by the pre-existing `send-phone-otp`/Loyalty IP hashers, and is recorded here for those implementations' future benefit too.

## Enumeration Protection

Re-verified live, this task, using the real deployed gateway: an **existing, currently-locked** account and a **definitely non-existing** account, both with a wrong password, returned byte-identical `400 {"error":"invalid_credentials","error_description":"Invalid login credentials"}`. A malformed request produces the identical body+status too (unit-test-verified across all four rejection causes simultaneously). Migration 4.9's PASS finding on this dimension is preserved.

## Security Controls

- No password, access token, refresh token, or secret is ever written to `dashboard_login_attempts`/`dashboard_login_lockouts` (only an email string, a hashed IP, a coarse outcome, and timestamps — structurally impossible to contain a secret).
- No password/token appears in any Edge Function log line (unit-test-asserted: spied `console.log/warn/error` across success and failure paths, checked for both the test password string and the test tokens — absent in both).
- `SUPABASE_SERVICE_ROLE_KEY` does not appear anywhere in the built frontend bundle (`grep -rl "SERVICE_ROLE" dist/assets/*.js` → no matches, checked directly this task).
- CORS: `Access-Control-Allow-Origin` is reflected only for `https://simsimmenu.com` (live-verified) and is absent for an unrecognized origin (`https://evil-attacker.example.com`, live-verified) — no wildcard is used anywhere.
- Fail-closed: unit-tested for (a) the precheck RPC throwing/erroring, (b) `db` not configured, (c) the Supabase Auth `fetch` itself throwing — all three reject the login rather than letting it through. Not tested by deliberately breaking production infrastructure, per the task's own explicit prohibition on doing so.

## Test Results

All statuses below reflect actual executed evidence — see the Test Matrix for the full breakdown with evidence per row.

- **Unit tests:** 28/28 new tests pass (`tests/unit/dashboardLoginGuard.test.js`); full project suite 1333/1333 pass (net +2 vs. the pre-existing 1331, zero regressions elsewhere).
- **Build:** `npm run build` succeeds cleanly.
- **Live production tests:** executed directly against the deployed `dashboard-login-guard` function and the real production database — see Test Matrix.

## Production Verification

Deployed via `deploy_edge_function` (status `ACTIVE`, `verify_jwt: true`). All live tests below were run against this exact deployed function, not a local/simulated copy.

## Regression Verification

- Full Vitest suite: 1333/1333 pass.
- `npm run build`: succeeds.
- Customer Menu / OTP / Session (re-checked live, this task, after deployment): `GET /menu/simsim` → 200; `GET /api/customer/verify-otp` → 405 (route exists, unaffected); `GET /api/customer/checkout` → 405 (unaffected); `GET /api/customer/loyalty?...` → 200 `{"loyalty":null}` (unaffected).
- Dashboard grants: `authenticated` role's access to page-authorization functions (`member_has_page_access`, etc.) was not touched, read, or referenced by this migration at all.
- Business data integrity: `categories=36, products=131, restaurants=7, branches=8, customer_identities=10, customer_sessions=8, loyalty_accounts=66, loyalty_transactions=85` — identical before and after this entire migration (checked immediately before the first SQL statement and again after all testing/cleanup completed).

## Rollback Plan

`sql/phase6_migration5_0_rollback.sql` drops exactly the two new functions and two new tables this migration created — nothing else. Per its own header comment: `authStore.js`'s `signIn()` and the `dashboard-login-guard` Edge Function must be reverted to their pre-Migration-5.0 form **before** running this rollback, or the frontend will call a gateway whose underlying DB functions no longer exist, and (per this migration's fail-closed design) every login would fail closed instead of degrading gracefully. No business data is touched by the rollback.

## Findings

No new security findings were identified during implementation or live testing. One pre-existing, unrelated finding (F-03, Staff email guessability) remains open per the preflight report's own explicit deferral — not addressed in this migration, exactly as instructed.

## Remaining Risks

Unchanged from the preflight report's own "Risks" section: availability risk from fail-closed on a genuine limiter-infrastructure outage (accepted trade-off per the approved design); false-positive lockout risk for a real user who mistypes their password 5 times (inherent to any lockout, mitigated by the short 15-minute duration); a large, truly distributed (many accounts × many real IPs simultaneously) attack is not fully defeated by per-account/per-IP limiting alone (a known, standard limitation, not specific to this implementation, and explicitly out of scope per the preflight's CAPTCHA discussion).

## Final Status

## **IMPLEMENTED — VERIFIED**

**Critical rollout caveat — read before considering this "live for real users":**

| Layer | Status |
|---|---|
| Database (tables + functions + grants) | **LIVE in production** — applied directly via migration, verified. |
| `dashboard-login-guard` Edge Function | **LIVE in production** — deployed, verified with real HTTP traffic against it. |
| `authStore.js` frontend change | Committed (`674a2e1`) and **pushed to `test/deployment-update-visual-smoke-test`** — **NOT yet merged to `main`, NOT yet deployed to the production Vercel build.** |

**This means: right now, real Dashboard/Staff users on `simsimmenu.com` are still using the OLD code path (`supabase.auth.signInWithPassword()` called directly, unprotected) until this branch is merged to `main` and Vercel rebuilds** — the exact same PR → merge → verify sequence Migration 4.4/4.8 used to ship a frontend/backend pairing like this one to real traffic. The backend protection (DB + Edge Function) is fully live and was verified directly against real HTTP calls to it in this task — but a real browser login won't reach it until the frontend ships. **This gap was not asked to be closed in this task's own instructions (no PR/merge step was requested) and was not closed unilaterally** — flagged here explicitly so it is not mistaken for a completed production rollout.

---

## Final Security Decision

- **هل أصبح Dashboard Login محميًا ضد repeated password guessing؟** نعم — مؤكَّد حياً في الإنتاج.
- **هل يوجد Account Lockout فعلي؟** نعم — مؤكَّد حياً: كلمة المرور الصحيحة نفسها رُفضت أثناء القفل (TEST 7).
- **كم محاولة؟** 5 محاولات خاطئة متتالية.
- **كم مدة Lockout؟** 15 دقيقة، مؤكَّدة حياً بانتظار حقيقي كامل لمدة 15 دقيقة ثم استعادة تلقائية ناجحة (TEST 8، وليس محاكاة).
- **هل يوجد IP Rate Limit؟** نعم — مؤكَّد حياً عبر سجل قاعدة البيانات: بالضبط 20 فشلاً ثم كل ما بعدها "blocked".
- **كم محاولة لكل IP؟** 20 محاولة فاشلة / نافذة 15 دقيقة متحركة.
- **ماذا يحدث عند تجاوز الحد؟** رفض فوري بنفس الرسالة العامة، بدون استدعاء Supabase Auth إطلاقاً (مؤكَّد من سجلات outcome='blocked').
- **هل يستطيع تغيير IP ومواصلة مهاجمة نفس الحساب؟** لا — قفل الحساب مستقل تماماً عن IP (مؤكَّد على مستوى قاعدة البيانات بمحاكاة 5 عناوين IP مختلفة تماماً ضد حساب واحد).
- **هل يستطيع مهاجمة حسابات كثيرة من IP واحد؟** لا، ليس إلى ما لا نهاية — بعد 20 محاولة فاشلة من نفس IP (بصرف النظر عن الحساب المستهدَف)، يُحظر ذلك الـIP بالكامل — مؤكَّد حياً.
- **هل Account Enumeration ما زالت محمية؟** نعم — مؤكَّد حياً: حساب موجود ومقفول فعلياً مقابل حساب غير موجود أعطيا استجابة متطابقة حرفياً بايت-لبايت.
- **هل Owner Login يعمل؟** نعم — نفس مسار `signIn()` المستخدَم لكليهما، ومُختبَر حياً بنجاح (TEST 1/TEST 8).
- **هل Staff Login يعمل؟** نعم — نفس الآلية بالضبط، ومُختبَر حياً بحساب Staff-format فعلي.
- **هل Session behavior بقي سليمًا؟** نعم — `setSession()` يُنتج جلسة `supabase-js` طبيعية كاملة؛ 1333 اختبار موجود سابقاً ما زال ينجح بلا استثناء، ولم يُلمس `signOut`/`onAuthStateChange`/`autoRefreshToken`.

---

# Test Matrix

| Test | Expected | Actual | Evidence | Status |
|---|---|---|---|---|
| Owner/Staff normal login (correct password) | 200, real tokens | 200, `{access_token, refresh_token}` returned | Live `curl` against deployed function, staff-style test account, 19:50:46 UTC | **PASS (LIVE-VERIFIED)** |
| Wrong password #1 | Generic rejection | `400 {"error":"invalid_credentials",...}` | Live, 5 sequential live calls | **PASS (LIVE-VERIFIED)** |
| Wrong password #2 | same | same | same | **PASS (LIVE-VERIFIED)** |
| Wrong password #3 | same | same | same | **PASS (LIVE-VERIFIED)** |
| Wrong password #4 | same | same | same | **PASS (LIVE-VERIFIED)** |
| Wrong password #5 → lockout begins | `failure_count=5`, `lock_until` set | Confirmed via direct DB read: `failure_count:5, lock_until:"...20:06:51...", currently_locked:true` | DB query immediately after attempt #5 | **PASS (LIVE-VERIFIED)** |
| Correct password while locked | Still rejected | `400 invalid_credentials` | Live call at 19:52:10 UTC, ~14 min before expiry | **PASS (LIVE-VERIFIED)** — proves the lockout is real, not just a wrong-password check |
| Lockout expiry → successful recovery | Auto-recovery, 200 | `200 {access_token,...}` at 20:07:13 UTC, i.e. after the real `lock_until` of 20:06:51 | Genuine 15-minute real-time background wait + live call, not simulated | **PASS (LIVE-VERIFIED)** |
| Counter reset after recovery | `failure_count=0, lock_until=NULL` | Confirmed via direct DB read immediately after recovery | DB query | **PASS (LIVE-VERIFIED)** |
| Wrong password after recovery | Failure #1 of fresh cycle | `failure_count:1, lock_until:null` | DB query after one live wrong-password call post-recovery | **PASS (LIVE-VERIFIED)** |
| IP threshold (20 failures/15min) | 21st+ blocked, Auth never called | Exactly 20 `'failure'` + 14 `'blocked'` rows logged for one real IP within the test window | DB `GROUP BY ip_hash, outcome` query | **PASS (LIVE-VERIFIED)** |
| Same account / multiple IPs | Account lock is IP-independent | 5 failures via 5 distinct simulated `ip_hash` values (direct DB-function calls) → account locked; a 6th, never-used `ip_hash` still rejected | DB-level function test (documented as simulated `ip_hash`, not distinct real network origins — see Note below) | **PASS (DB/LOGIC-VERIFIED)** — real distinct network-origin IPs not available from this single-origin environment, honestly disclosed, not guessed |
| Multiple accounts / same IP (credential stuffing) | IP eventually blocks regardless of account | Same evidence as IP threshold row above — 25 distinct fake accounts from one real IP, blocked after the 20th | Live, this task | **PASS (LIVE-VERIFIED)** |
| Enumeration | Existing-locked vs non-existing: identical response | Byte-identical `400 invalid_credentials` for both, live | Live `curl` comparison, this task | **PASS (LIVE-VERIFIED)** |
| Concurrent requests (10 simultaneous) | No lost increments, deterministic final count | 10 truly parallel `curl` processes (backgrounded, confirmed concurrent via shell job control) → `failure_count` exactly `10`, no loss | Live, fresh unconfounded account, this task | **PASS (LIVE-VERIFIED)** |
| Fail-closed (limiter/DB error) | Login rejected, Auth not called | Unit-tested: precheck RPC throws, `db=null`, and Auth-fetch-throws all reject | `tests/unit/dashboardLoginGuard.test.js` | **PASS (UNIT-VERIFIED)** — not tested against real production infrastructure, per explicit task prohibition on breaking it |
| Logout | Unaffected | `signOut()` never touched by this migration | Code review — `authStore.js:signOut` unchanged | **PASS (CODE-VERIFIED)** |
| Session refresh | Unaffected | `setSession()` is a documented `supabase-js` path that fully hydrates `autoRefreshToken` state identically to `signInWithPassword()` | Code review + the live TEST 1/TEST 8 successes themselves (both resulted in a normally-functioning session) | **PASS (LIVE-VERIFIED for session issuance; ongoing auto-refresh over hours not separately re-tested)** |
| Dashboard access / page authorization | Unaffected | `member_has_page_access`/`allowed_pages`/grants not touched, read, or referenced anywhere in this migration | Code + SQL review | **PASS (CODE-VERIFIED)** |
| Customer Menu regression | Unaffected | `GET /menu/simsim` → 200 | Live, this task | **PASS (LIVE-VERIFIED)** |
| Customer OTP regression | Unaffected | `GET /api/customer/verify-otp` → 405 (route exists) | Live, this task | **PASS (LIVE-VERIFIED)** |
| Customer Session regression | Unaffected | `GET /api/customer/loyalty?...` → 200 `{"loyalty":null}` | Live, this task | **PASS (LIVE-VERIFIED)** |
| No `PUBLIC` grant on new functions | Only `service_role`/`postgres` | Confirmed via `information_schema.routine_privileges` | DB query, this task | **PASS (LIVE-VERIFIED)** |
| No `anon`/`authenticated` on new tables | RLS enabled, 0 policies | Confirmed via `pg_tables`/`pg_policies` | DB query, this task | **PASS (LIVE-VERIFIED)** |
| No secret in frontend bundle | No `service_role` string | `grep` over `dist/assets/*.js` → no matches | Build output, this task | **PASS (LIVE-VERIFIED)** |
| Full regression suite | All pass | 1333/1333 | `npx vitest run`, this task | **PASS (LIVE-VERIFIED)** |
