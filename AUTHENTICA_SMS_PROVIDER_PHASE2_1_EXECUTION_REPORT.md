# Authentica SMS OTP — Phase 2.1: Go-Live Validation + Abuse Protection

> **Scope: (1) resolve/validate the Authentica custom-OTP contract, (2) add abuse protection before any live deployment.** No customer session, no checkout UI, no `create_order` enforcement, no customer login, no `phone_verification` activation, no loyalty/Orders.jsx/Branches.jsx/menu-theme/Car Pickup changes. No Commit/Push/PR/Merge — awaiting your review.

---

## 1. Executive Summary

**Objective 1 (contract validation): re-investigated thoroughly, conclusion strengthened but still NOT VERIFIED.** Beyond Phase 2's original research, this phase additionally checked the docs site's OpenAPI-rendered HTML reference page and Authentica's own official example scripts (`github.com/AuthenticaSA/Authentica`). Both **independently confirm no `otp` field exists** in the `POST /api/v2/send-otp` schema — consistent with the formal Markdown reference, inconsistent with one unexplained example in a separate guide page. Per your instruction, this is reported as **CUSTOM OTP CONTRACT NOT VERIFIED** (evidence now leans toward "not supported," not merely "ambiguous") — no real SMS was sent, and no fallback to Authentica-generated OTP was implemented.

**Objective 2 (abuse protection): implemented, tested, and verified live against production.** A minimal second-layer, IP-scoped rate limiter (`otp_ip_request_log` + `check_and_log_otp_ip_request`, `service_role`-only) now sits in front of Phase 1's per-phone limits inside `send-phone-otp`, specifically defending against one source hitting many *different* phone numbers — the exact gap Phase 1's identity-scoped limits cannot see. 8 new dedicated tests + full regression (1119/1119) pass.

**`AUTHENTICA_API_KEY` configuration status: could not be verified from this session** — no tool available here can list or check Supabase Edge Function secrets; only the project owner can confirm via the Supabase CLI or Dashboard (exact command in §10).

**Because the contract is unverified and the secret's presence is unconfirmed, the Edge Function was NOT deployed and no real SMS test was performed** — both required preconditions for your §15 GO rule are unmet. **Final assessment: NO-GO for live SMS**, for reasons external to this session's work (§26).

---

## 2. Phase 2 Baseline

Inherited from `AUTHENTICA_SMS_PROVIDER_PHASE2_EXECUTION_REPORT.md`: `send-phone-otp` Edge Function (index.ts/handler.js/authenticaAdapter.js/phoneFormat.js) as source, not deployed; `request_phone_otp_for_delivery` (service_role-only, returns plaintext OTP) added alongside an unchanged `request_phone_otp` wrapper; `verify_phone_otp` untouched; 30 tests passing; contract flagged NOT VERIFIED; real SMS not sent. This phase builds directly on that baseline — re-read and re-inspected before any change (§3 below evidences this).

---

## 3. Authentica Contract Verification

Re-verified, not assumed from Phase 2's report or from your message's summary alone. Three independent official sources checked this phase:

| Source | Method | Finding |
|---|---|---|
| Formal API reference (Markdown) | `docs.authentica.sa/api-reference/otp-verification/send-otp.md` — re-fetched | `method`, `phone`, `email`, `template_id` only. Explicit: *"No field exists in this schema to supply a pre-generated OTP code."* |
| **Same reference, HTML/OpenAPI-rendered view** (new this phase) | `docs.authentica.sa/api-reference/otp-verification/send-otp` | Explicitly derived "Based on the OpenAPI specification provided" — same 4 fields, explicit conclusion: *"No parameter named 'otp' exists... the system generates and sends it [itself]."* |
| **Official GitHub examples** (new this phase, checked at file-tree level) | `github.com/AuthenticaSA/Authentica` | Repo is examples-only (no published SDK/type definitions). Both `otp_send.js` and `otp_send.py` use only `{method, phone}` / `{method, email}` — no custom-code field anywhere. |
| Guide page (the one source *for* custom OTP) | `docs.authentica.sa/guides/otp-workflow.md` | Shows `{"method":"sms","phone":"+9665XXXXXXXXX","template_id":31,"fallback_email":"...","otp":"123456"}` next to *"Supports: Custom OTPs"* — **no explanatory text**, and this field appears nowhere else across 3 independent official sources |

**Conclusion: CUSTOM OTP CONTRACT NOT VERIFIED.** The weight of evidence (3 independent official sources, including the machine-derived OpenAPI schema itself) now leans toward "not actually supported by the current API version," against one unexplained, unreproduced example. This is a **stronger, more specific** finding than Phase 2's original "contradictory" characterization — but it is still not a definitive live-tested confirmation either way, so it is reported exactly as your instruction requires: **not verified**, not guessed.

**Per your explicit instruction, this blocks:** any real SMS test (§12), and Edge Function deployment (§11) — both require the contract to be clearly confirmed first.

---

## 4. Custom OTP Verification Evidence

See §3's table — this section exists to answer your required checklist item directly:

> **Custom OTP confirmed: NOT VERIFIED** (evidence leans "not supported"; not definitively tested against the live API in either direction — no real API call was made in this phase, per your explicit instruction not to guess or test live without confirmation).

---

## 5. Exact API Contract

Unchanged from Phase 2, re-confirmed:

| Item | Value |
|---|---|
| Base URL | `https://api.authentica.sa` |
| Endpoint | `POST /api/v2/send-otp` |
| Auth header | `X-Authorization: <API_KEY>` |
| Required SMS fields | `method: "sms"`, `phone` (E.164) |
| `template_id` | Optional, default `1` |
| Success response | `{"success": true, "data": null, "message": "OTP send successfully"}`, HTTP 200 |
| 401 response | `{"errors":[{"message":"Unauthorized"}]}` |
| Provider request/message ID | **Not documented anywhere found** — `data` is `null` in the only example available. Confirmed absent, not merely unchecked. |
| Delivery status callback/webhook | **Not documented anywhere found** in this phase's research |
| Exact 400/422/429/5xx body shapes | **Not documented** — adapter (unchanged from Phase 2) maps by HTTP status code alone, defensively, not dependent on an assumed body shape |
| Balance endpoint | `GET /api/v2/balance` — existence re-confirmed, **not integrated** (out of scope per your §14 in Phase 2, unchanged here) |

No undocumented field was invented anywhere in this phase's code.

---

## 6. Abuse-Protection Design

**Threat modeled:** Phase 1's limits (5 sends/hour, 60s cooldown) are keyed by `customer_id` — one row per phone number. They provide **zero** protection against one source (`IP A`) requesting OTPs for many *different* phone numbers (`phone A, B, C, D...`), since each is a fresh identity with its own fresh counters. This is exactly the vector your §4/§5 asked to close.

**Inspected first, per your §4 instruction, for a reusable existing mechanism — none found:**
- No IP/rate-limit table or RPC exists anywhere in the codebase (repo-wide search, confirmed before writing any code).
- Supabase Auth's own dashboard rate limits (`reports/TASK_1_4_RATE_LIMITING_VERIFICATION_REPORT.md`) are unrelated — they gate GoTrue's own sign-up/sign-in/token endpoints, not custom Edge Functions/RPCs. That report also records a **distinct, deliberate owner decision**: *"IP Address Forwarding: DISABLED — do NOT enable."* This is Supabase Auth's own setting for its own rate limiter; it does not gate Edge Functions' ability to read `x-forwarded-for` (a separate Deno Deploy-level header), but I could not 100% confirm header visibility without a live deployed-function request — flagged as unverified in `ipHash.js`'s own file comment (§16 note applies here too).
- `analytics_events` exists (generic event log) but repurposing an unrelated analytics table for security enforcement was rejected as scope contamination, not "the smallest mechanism."

**What was built — genuinely minimal, one table + one function:**

```sql
otp_ip_request_log (id, ip_hash, requested_at)   -- append-only log, SHA-256(IP), no raw IP ever stored
check_and_log_otp_ip_request(p_ip_hash, p_max_requests=20, p_window_minutes=15) returns boolean
  -- atomically counts recent rows for this ip_hash, rejects (no insert) at/over the limit,
  -- else inserts and allows. ~1% opportunistic cleanup of rows >1 day old (no cron job added).
```

**Why 20/15min:** a hard trade-off, not a proven-optimal number — documented as tunable in the SQL file's own comment. A shared/NAT IP (e.g., a restaurant's guest WiFi with several real customers verifying around the same time) can legitimately need more than one or two attempts in a short window; this value still hard-bounds worst-case SMS cost per source IP to a small, fixed number regardless of how many distinct phone numbers are tried.

**Enforcement point:** `handler.js` calls this **before** touching `request_phone_otp_for_delivery` at all — abusive traffic never reaches, or costs, the phone-level system.

**Enumeration/leak resistance (your §5 D–G):** IP-blocked responses return the exact same generic shape (`{"status":"rejected","reason":"rejected"}`) as the pre-existing generic RPC-rejection fallback — an attacker cannot distinguish "you hit the IP-wide fence" from any other generic rejection. Logs record only an 8-character hash *prefix*, never the raw IP, never the OTP, never the full phone number, never the API key (tested explicitly, §16).

**Fail-closed:** if the abuse-check RPC itself errors, the handler returns `500` rather than silently letting the request through — protecting SMS balance is prioritized over tolerating a rare infra hiccup, matching this phase's stated priority.

---

## 7. Files Created

| File | Purpose |
|---|---|
| `sql/customer_identity_phase2_1_ip_abuse_protection.sql` | `otp_ip_request_log` table + `check_and_log_otp_ip_request` RPC |
| `supabase/functions/send-phone-otp/ipHash.js` | Source-IP extraction + SHA-256 hashing (pure, tested) |
| `AUTHENTICA_SMS_PROVIDER_PHASE2_1_EXECUTION_REPORT.md` | This report |

## 8. Files Modified

| File | Change |
|---|---|
| `supabase/functions/send-phone-otp/handler.js` | Adds the Step-0 abuse-protection gate (§6) before the existing Step-1 phone-level RPC call. No other logic changed — Step 1/2 (OTP generation call, Authentica send, response/error mapping) are byte-identical to Phase 2. |
| `tests/unit/sendPhoneOtp.test.js` | `makeDb()` made RPC-name-aware (was previously a single blind mock — needed once a second RPC exists); one existing test updated to expect 2 RPC calls instead of 1 (the new IP-check call); 8 new tests added (§16) |

**No other file touched.** `authenticaAdapter.js`, `phoneFormat.js`, `index.ts` — byte-identical to Phase 2.

---

## 9. Database Changes

One new table, one new function — nothing else. **No existing table altered.**

| Object | Type | Notes |
|---|---|---|
| `public.otp_ip_request_log` | New table | `id, ip_hash, requested_at` — RLS enabled, zero policies (identical posture to every Phase 1/2 table) |
| `public.check_and_log_otp_ip_request(text, integer, integer)` | New function | `security definer`, `search_path=public`, granted to `service_role` only (verified via `has_function_privilege` — `anon: false, authenticated: false, service_role: true`) |

**Confirmed untouched:** `orders`, `customers`, `loyalty_accounts`, `create_order`, `verify_phone_otp`, `customer_identities`, `customer_phone_verifications`, `restaurant_customers`, `request_phone_otp`, `request_phone_otp_for_delivery` — zero lines changed in any of them this phase.

**Row counts, before → after (live verification):** `orders` 174→174, `loyalty_accounts` 63→63, `restaurants` 7→7, `branches` 8→8, `customers` (dead table) 0→0, `customer_identities` 0→0, `customer_phone_verifications` 0→0, `feature_flags` 35→35, `plan_features` 66→66, `otp_ip_request_log` 0→0 (test rows cleaned up after verification).

---

## 10. Secret Status

**`AUTHENTICA_API_KEY`: presence could NOT be verified from this session.** No MCP tool available here can list, check, or query Supabase Edge Function secrets (confirmed by searching available tools before reporting this). This is a genuine capability gap, not an assumption of "not configured."

**Exact command for the project owner to check/set it** (never run by me — I do not have, and must not invent, the real value):
```bash
supabase secrets list --project-ref gpwwnuuicywsvmmhxngs           # check presence (never prints existing values)
supabase secrets set AUTHENTICA_API_KEY=<the_real_key> --project-ref gpwwnuuicywsvmmhxngs   # set/update it
```
**Confirmed never present in this session's work:** source code, git, SQL, frontend, this report, logs, HTTP responses, localStorage, cookies.

---

## 11. Deployment Status

**`send-phone-otp`: NOT deployed.** Both your §15 preconditions for deployment ("custom OTP contract verified" + implicitly, a working key to deploy against) are unmet:
1. §3/§4: contract **not** clearly confirmed.
2. §10: key presence **not** confirmed from this session.

**No unrelated Edge Function was touched or deployed.** `list_edge_functions` re-checked this phase: only `dynamic-action`, `delete-staff`, `create-platform-admin` remain live — unchanged from Phase 2's own finding. `send-phone-otp` remains source-only, exactly as Phase 2 left it, now with the abuse-protection layer added to that source.

---

## 12. Real SMS Test

**NOT PERFORMED.** Precondition (contract confirmed) unmet per §3/§4. No test phone was contacted. No SMS was sent.

## 13. OTP Verification Test (against a real received SMS)

**NOT TESTED** — depends entirely on §12, which did not run.

## 14. Replay Test (against a real received SMS)

**NOT TESTED** — same dependency. (Replay protection *itself* — `verify_phone_otp` invalidating the code after one success — remains unmodified from Phase 1, where it was already live-tested and confirmed working; this section specifically refers to re-confirming it against a real Authentica-delivered code, which did not happen.)

---

## 15. Provider Failure Tests

All performed via mocks only — **zero real calls to Authentica this phase**, consistent with your §9 instruction. Re-run from Phase 2's suite (unchanged behavior, still passing): 200 success, 400, 401, 422, 429, 500, 503, malformed JSON, unexpected success-shape, network failure, timeout (distinct from network failure). All map to safe, generic caller-facing reasons; no provider secret/detail exposed in any case (asserted directly in tests).

## 16. Abuse-Protection Tests

8 new tests in `tests/unit/sendPhoneOtp.test.js`:

```
✅ extractSourceIp reads the first entry of x-forwarded-for
✅ extractSourceIp falls back to x-real-ip, then to "unknown"
✅ hashIp is deterministic and produces a sha256-shaped hex digest
✅ check_and_log_otp_ip_request is called BEFORE the phone-level RPC; phone RPC
   and provider are never reached when the IP check blocks
✅ IP-blocked response is generic — identical shape to the generic phone-level
   rejection, no "ip"/"abuse"/"volume" wording anywhere in the response
✅ max_requests/window_minutes passed to the RPC match the documented
   defaults (20 / 15) — a silent drift between JS and SQL would fail this
✅ IP-check RPC error → fails CLOSED (500), never silently allows the request through
✅ the raw (unhashed) source IP never appears in any log line
```

Plus **live verification directly against production** (privileged SQL, not inferred):
```sql
check_and_log_otp_ip_request('zz_test_ip_hash_abc', 3, 15)  → true, true, true, false, false
-- 3 rows logged for this ip_hash, exactly matching the 3 allowed calls (4th/5th correctly
-- blocked AND correctly not logged)
check_and_log_otp_ip_request('zz_test_ip_hash_xyz', 2, 15)  → true   -- a different IP is isolated, unaffected
```
ACL directly inspected (`has_function_privilege`): `anon: false, authenticated: false, service_role: true`. All test rows deleted after verification.

## 17. Security Tests

| Item | Result |
|---|---|
| A. Valid test phone → succeeds | ✅ (mocked provider success path — real end-to-end blocked by §12) |
| B. Immediate resend → blocked | ✅ Phase 1 behavior re-confirmed unaffected (cooldown check untouched) |
| C. Excessive attempts → blocked | ✅ Phase 1 behavior re-confirmed unaffected (`verify_phone_otp` untouched) |
| D. Invalid phone format → rejected | ✅ (both at Edge Function level and DB level, tested) |
| E. Anon/authenticated gateway security intended | ✅ `request_phone_otp_for_delivery` and `check_and_log_otp_ip_request` both `service_role`-only, verified via direct ACL query, not inferred |
| F. Edge Function never returns OTP | ✅ Tested explicitly (success and failure paths) |
| G. Edge Function never returns provider credentials | ✅ Tested explicitly |
| H. Logs contain no OTP/API key/full phone/raw IP | ✅ Tested explicitly, all four |
| I. Abuse protection blocks rapid repeated requests | ✅ Tested live against production DB (§16) and via mocks (§16) |

No high-volume test was run against the real Authentica API, per your §10 instruction — all volume/rate-limit testing used mocks or direct DB calls only.

---

## 18. Full Regression Tests

```
npx vitest run
→ Test Files  59 passed (59)
→ Tests      1119 passed (1119)   (1111 pre-existing + 8 new this phase)
```
Zero failures, zero skipped.

## 19. Build Results

```
npm run build   → ✓ built in 19.23s
```
`menu-next` not run — zero files there touched (this phase, and Phase 2 before it).

## 20. Production Data Before/After

| Table | Before | After |
|---|---|---|
| `orders` | 174 | 174 |
| `loyalty_accounts` | 63 | 63 |
| `restaurants` | 7 | 7 |
| `branches` | 8 | 8 |
| `customers` (dead table) | 0 | 0 |

No production customer, order, or loyalty row was created, modified, or deleted.

## 21. Git Status — Before

```
 M .gitignore
 M SIMSIM_TASK_PHASE2_STAGING_DATA_SEED_AND_FINAL_VERIFICATION_REPORT.md
 M marketing-ssr/.gitignore
 M marketing-ssr/components/marketing/MarketingChrome.tsx
 M marketing-ssr/components/marketing/PublishedMarketingPage.tsx
 M marketing-ssr/lib/site-url.ts
 M marketing-ssr/next-env.d.ts
 M scripts/checkRegistryDrift.test.js
 M src/pages/Orders.jsx
 M src/registry/features.manifest.js
 M vercel.json
?? [Phase 2's own untracked files: sql/customer_identity_phase2_otp_delivery.sql,
    supabase/functions/send-phone-otp/, tests/unit/sendPhoneOtp.test.js,
    AUTHENTICA_SMS_PROVIDER_PHASE2_EXECUTION_REPORT.md]
?? [dozens of pre-existing untracked report .md files, unrelated]
```

## 22. Git Status — After

```
 M .gitignore                                                          ← pre-existing, untouched
 M SIMSIM_TASK_PHASE2_STAGING_DATA_SEED_AND_FINAL_VERIFICATION_REPORT.md ← pre-existing, untouched
 M marketing-ssr/.gitignore                                            ← pre-existing, untouched
 M marketing-ssr/components/marketing/MarketingChrome.tsx              ← pre-existing, untouched
 M marketing-ssr/components/marketing/PublishedMarketingPage.tsx       ← pre-existing, untouched
 M marketing-ssr/lib/site-url.ts                                       ← pre-existing, untouched
 M marketing-ssr/next-env.d.ts                                         ← pre-existing, untouched
 M scripts/checkRegistryDrift.test.js                                  ← pre-existing (Phase 1), untouched
 M src/pages/Orders.jsx                                                ← pre-existing PHASE-7, untouched
 M src/registry/features.manifest.js                                  ← pre-existing (Phase 1), untouched
 M vercel.json                                                         ← pre-existing, untouched
?? sql/customer_identity_phase2_1_ip_abuse_protection.sql              ← THIS phase
?? sql/customer_identity_phase2_otp_delivery.sql                       ← Phase 2 (unchanged)
?? supabase/functions/send-phone-otp/                                  ← Phase 2 dir, files edited THIS phase (§8)
?? tests/unit/sendPhoneOtp.test.js                                     ← Phase 2 file, edited THIS phase (§8)
?? AUTHENTICA_SMS_PROVIDER_PHASE2_EXECUTION_REPORT.md                  ← Phase 2 (unchanged)
?? AUTHENTICA_SMS_PROVIDER_PHASE2_1_EXECUTION_REPORT.md                ← this report
?? [same dozens of pre-existing untracked report .md files, unchanged]
```

**No Commit. No Push. No PR. No Merge.**

## 23. Pre-existing Changes Preserved

Verified identical before/after this turn: `.gitignore`, `SIMSIM_TASK_PHASE2_STAGING_DATA_SEED_AND_FINAL_VERIFICATION_REPORT.md`, all `marketing-ssr/*` files, `scripts/checkRegistryDrift.test.js`, `src/pages/Orders.jsx` (PHASE-7), `src/registry/features.manifest.js`, `vercel.json`. None read for modification, none staged, none committed.

---

## 24. Problems / Blockers

1. **Authentica custom-OTP contract remains unverified** — now with stronger (but still not conclusive) evidence against support (§3). This is the primary blocker for both real-SMS-test and deployment.
2. **`AUTHENTICA_API_KEY` presence cannot be checked from this session** — a tooling gap, not a negative finding. Needs the project owner to confirm directly (§10).
3. **`x-forwarded-for` header visibility for Supabase Edge Functions was not confirmed by an actual deployed-function request** — reasoned from Deno Deploy's general infrastructure convention, flagged explicitly as unverified in `ipHash.js`'s own comment. Low risk (degrades to a shared "unknown" bucket, not an open bypass — see §6/§16), but worth confirming once the function is actually deployed.

## 25. Decisions Made

- Treated the strengthened (OpenAPI + example-script) evidence as still "not verified" rather than "confirmed not supported" — your instruction's bar is explicit confirmation either way before acting, and a live test is the only way to truly settle it.
- Built abuse protection as a genuinely new, minimal table+function rather than forcing it into `analytics_events` or an in-memory-only mechanism — explained in §6, matching your "explain why before new persistent infrastructure" instruction.
- Kept the IP check's generic-rejection response byte-identical in shape to the existing generic fallback, rather than inventing a new "reason" value — directly satisfies "do not reveal which specific limit triggered."
- Did not deploy and did not attempt a live IP-header-visibility test via an actual request to a deployed function, since deployment itself is gated on the two unmet preconditions above — sequencing preserved as your §7 specifies ("only after... deploy").

## 26. Final GO/NO-GO Assessment

**NO-GO for live SMS**, per your own §15 rule — two required conditions are unmet:
- ❌ Custom OTP is **not** clearly confirmed (§3/§4).
- ❌ API key configuration **not** confirmed from this session (§10) — status unknown, not "no."

**Everything within this session's control is GO:**
- ✅ Abuse protection implemented, tested (16 tests total across mocked + live-DB), and does not weaken any Phase 1 control.
- ✅ Full regression passes (1119/1119).
- ✅ Build passes.
- ✅ No secrets exposed anywhere (explicitly tested).
- ✅ No production data changed.
- ✅ No scope creep — zero customer-flow, checkout, session, `create_order`, or menu-theme files touched.

**Path to GO:** resolve §3 (contact Authentica support or their sandbox directly for a definitive answer on the `otp` field) and §10 (owner confirms/sets the secret) — both are external actions this session cannot perform.

---

### Direct answers to your required checklist

| Question | Answer |
|---|---|
| Custom OTP confirmed | **NOT VERIFIED** (evidence leans "not supported" — 3 independent sources show no such field; 1 unexplained guide example claims otherwise) |
| Real SMS sent | **NO** |
| Received OTP matched SimSim-generated OTP | **NOT TESTED** |
| SimSim `verify_phone_otp` accepted it | **NOT TESTED** (against a real received code — the function itself is unmodified and was already live-verified working in Phase 1) |
| Replay blocked | **NOT TESTED** (against a real received code — the underlying mechanism is unmodified from Phase 1, where it was already live-verified) |
| Abuse protection | **PASS** (8 dedicated tests + live DB verification, all passing) |
| `AUTHENTICA_API_KEY` configured | **NOT VERIFIED FROM THIS SESSION** — no tool available to check; not "NO," genuinely unknown here |
| Edge Function deployed | **NO** |
| Any database tables changed | **YES** — one new table (`otp_ip_request_log`), no existing table altered |
| `create_order` changed | **NO** |
| Checkout changed | **NO** |
| Customer Session changed | **NO** (not implemented — out of scope, unchanged from Phase 1/2) |
| Existing menu themes changed | **NO** |
| Any production customer/order data changed | **NO** |
| Tests | **1119/1119** |
| Build | **PASS** |
