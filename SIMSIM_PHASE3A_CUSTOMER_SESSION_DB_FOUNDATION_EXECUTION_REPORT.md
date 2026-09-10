# Phase 3A — Customer Session Database Foundation — Execution Report

> **Database foundation only, exactly as approved.** No Route Handler, no cookie, no Edge Function, no change to `verify_phone_otp`/`create_order`/checkout/`restaurant_customers`/`customer_identities`/OTP logic/Feature Registry/loyalty/menu. No commit/push/PR/merge.

---

## 1. Executive Summary

Implemented exactly the four objects approved in `SIMSIM_PHASE3_CUSTOMER_SESSION_DESIGN_REPORT.md` §5/§11: the `customer_sessions` table and `create_customer_session` / `validate_customer_session` / `revoke_customer_session` / `revoke_all_customer_sessions`. All four functions are `service_role`-only, verified directly via `has_function_privilege` (not inferred). All access paths (table RLS, all 4 RPCs) were confirmed blocked for `anon` via real, live HTTP calls against production — not assumed. 20 distinct test scenarios executed against real (disposable, fully cleaned-up) data, all passing. Nothing in the current codebase calls any of these new functions yet — this migration alone changes zero observable behavior for any existing user or flow, confirmed by an unchanged full regression suite (1119/1119) and identical production row counts before and after.

---

## 2. Exact Schema

```sql
create table public.customer_sessions (
  id                 uuid primary key default gen_random_uuid(),
  customer_id        uuid not null references public.customer_identities(id) on delete cascade,
  session_token_hash text not null unique,
  created_at         timestamptz not null default now(),
  expires_at         timestamptz not null,
  last_seen_at       timestamptz,
  revoked_at         timestamptz
);
create index idx_customer_sessions_customer on public.customer_sessions (customer_id);
```

Matches the design report's approved field list exactly — no `device_id`, no `ip_address`, no `restaurant_id`, no plaintext token column, none of the fields the design report explicitly deferred or rejected.

## 3. Exact Functions / RPCs

| Function | Signature | Behavior |
|---|---|---|
| `create_customer_session` | `(p_customer_id uuid) returns jsonb` | Generates a 256-bit random token (`extensions.gen_random_bytes(32)`, hex-encoded — same generator already used for `create_order`'s `access_token` and Phase 1's OTP codes), hashes it (SHA-256, unsalted — matches `marketing_preview_tokens.token_hash`'s own precedent for high-entropy tokens), inserts a row with `expires_at = now() + 30 days`, returns `{session_id, token}` — the **only** place the plaintext token is ever visible, and only once. |
| `validate_customer_session` | `(p_token text) returns jsonb` | Hashes the input, looks up the matching row. Returns `{"valid": false, "customer_id": null}` uniformly for: no token, malformed token, no matching row, revoked, or expired — no branch distinguishes *why*. On a valid hit, opportunistically updates `last_seen_at` only if it's null or >1 hour stale. |
| `revoke_customer_session` | `(p_token text) returns jsonb` | Sets `revoked_at = now()` for the one row matching the token's hash, only if not already revoked. Idempotent — returns `{"revoked": false}` on a no-op (already revoked / not found), never an error. |
| `revoke_all_customer_sessions` | `(p_customer_id uuid) returns jsonb` | Revokes every non-revoked session belonging to exactly that `customer_id`. Returns `{"revoked_count": N}`. |

All four: `language plpgsql`, `security definer`, `set search_path = public` — identical hardening pattern to every function in Phases 1/2/2.1.

## 4. Security Model

- **Token generation**: cryptographically random (`pgcrypto`'s `gen_random_bytes`, not `random()`/`Math.random`), 256 bits of entropy — reused, not reinvented.
- **Plaintext token**: never stored anywhere in the database, at any point — only `session_token_hash` persists. Verified directly (§6, test 2).
- **`customer_id`**: enforced via `references customer_identities(id) on delete cascade` — a session cannot exist for a nonexistent customer, and deleting a `customer_identities` row automatically cleans up its sessions (verified live in test-fixture cleanup, §6).
- **Multiple sessions per customer**: no uniqueness constraint on `customer_id` — proven live with 3 concurrent sessions for one test customer.
- **No `restaurant_id`**: confirmed absent from the schema — the session is structurally incapable of carrying restaurant scope.
- **Fail closed**: every rejection path (expired, revoked, malformed, nonexistent, missing) returns the exact same `{"valid": false, "customer_id": null}` — proven with 4 distinct malformed-input variants including a SQL-injection-shaped string, all safely rejected via normal parameterized comparison (no dynamic SQL anywhere in these functions).
- **Generic errors**: no function ever raises or returns a message distinguishing *why* a token was rejected.

## 5. Grants / RLS

| Object | anon | authenticated | service_role |
|---|---|---|---|
| `customer_sessions` (table) | RLS enabled, **zero policies** → no access | Same → no access | Bypasses RLS (Postgres superuser-class role) |
| `create_customer_session` | ❌ (confirmed via `has_function_privilege` = false, and live 401) | ❌ | ✅ |
| `validate_customer_session` | ❌ | ❌ | ✅ |
| `revoke_customer_session` | ❌ | ❌ | ✅ |
| `revoke_all_customer_sessions` | ❌ | ❌ | ✅ |

Identical posture to `customer_identities`/`customer_phone_verifications`/`otp_ip_request_log` from Phases 1/2.1 — no new pattern invented.

---

## 6. Tests and Exact Results

All against real production (Supabase project `gpwwnuuicywsvmmhxngs`), using two disposable test `customer_identities` (test phones, deleted afterward — **no token, hash, or phone number reproduced here**, per your instruction).

| # | Test | Method | Result |
|---|---|---|---|
| 1 | Create session | `create_customer_session` | ✅ Returned `{session_id, token}`; row created with correct `customer_id`, `expires_at = created_at + 30 days` (verified exactly: 2026-09-10 → 2026-10-10) |
| 2 | Plaintext never stored | Direct inspection of the created row | ✅ Only `session_token_hash` present (64-char hex = SHA-256), no plaintext column anywhere in the schema |
| 3 | Valid session | `validate_customer_session` with the real token | ✅ `{"valid": true, "customer_id": "<correct id>"}` |
| 4 | Invalid token (correct shape, wrong value) | `validate_customer_session` with a 64-zero string | ✅ `{"valid": false, "customer_id": null}` |
| 5 | Malformed token — empty string | Same | ✅ Rejected gracefully, no exception |
| 6 | Malformed token — non-hex garbage | Same | ✅ Rejected gracefully |
| 7 | Malformed token — `null` | Same | ✅ Rejected gracefully |
| 8 | Malformed token — SQL-injection-shaped string (`'; drop table customer_sessions; --`) | Same | ✅ Rejected gracefully; table confirmed still present and intact immediately after (parameterized comparison, no dynamic SQL) |
| 9 | Replay behavior | Same valid token used twice in a row | ✅ Remained valid both times — correct, documented bearer-token behavior (not single-use like OTP) |
| 10 | `last_seen_at` opportunistic update | Inspected before/after first `validate` call | ✅ Was `null`, became set after first validation |
| 11 | Expired session | Manually backdated `expires_at` to the past, then validated | ✅ `{"valid": false, "customer_id": null}` |
| 12 | Revoke (first call) | `revoke_customer_session` | ✅ `{"revoked": true}` |
| 13 | Revoke idempotency (second call, same token) | Same | ✅ `{"revoked": false}` — no error, correct no-op |
| 14 | Revoked session rejected | `validate_customer_session` on the just-revoked token | ✅ `{"valid": false, "customer_id": null}` |
| 15 | Multiple concurrent sessions | Created 2 more sessions for the same customer; revoking one left the other valid | ✅ Session A3 remained `valid: true` after Session A2 was individually revoked |
| 16 | Cross-customer isolation | A 3rd session created for a **different** test customer; unaffected by any operation on the first customer's sessions | ✅ Remained `valid: true` throughout, including after `revoke_all_customer_sessions` on the other customer |
| 17 | `revoke_all_customer_sessions` scoping | Called for customer A only | ✅ `{"revoked_count": 2}` — exactly the 2 non-revoked sessions belonging to A (the 3rd was already individually revoked, correctly excluded from the count); customer B's session completely untouched |
| 18 | RLS — direct anon `SELECT` | Real anon-key HTTP call to `/rest/v1/customer_sessions` | ✅ `200`, `0 rows` (RLS blocks visibility even without an error) |
| 19 | RLS — direct anon `INSERT` | Real anon-key HTTP call | ✅ `401`, `"new row violates row-level security policy"` |
| 20 | RPC permissions — all 4 functions | Real anon-key HTTP calls to each | ✅ All 4 returned `401 permission denied for function <name>` |

**No token, hash, or test phone number is reproduced anywhere in this report** — every row above states the *outcome*, never the value.

---

## 7. Production Row Counts Before/After

| Table | Before | After |
|---|---|---|
| `orders` | 174 | 174 |
| `loyalty_accounts` | 63 | 63 |
| `restaurants` | 7 | 7 |
| `branches` | 8 | 8 |
| `customers` (dead table) | 0 | 0 |
| `customer_identities` | 0 | 0 |
| `customer_phone_verifications` | 0 | 0 |
| `restaurant_customers` | 0 | 0 |
| `otp_ip_request_log` | 0 | 0 |
| `customer_sessions` (new) | — | 0 |
| `feature_flags` | 35 | 35 |
| `plan_features` | 66 | 66 |

All test fixtures (2 disposable `customer_identities`, cascading to their `customer_sessions` rows) deleted after verification — confirmed via the `on delete cascade` FK actually firing (sessions dropped to 0 automatically on identity deletion, not manually cleaned per-row).

---

## 8. Files Created / Modified

| File | Change |
|---|---|
| `sql/customer_session_phase3a.sql` | **New.** The entire Phase 3A migration (table + 4 functions + grants), applied to production and recorded in `schema_migrations`. |

**No other file touched.** Confirmed via `git status` — identical to the state left at the end of the previous (comment-only) turn, plus exactly this one new untracked file.

## 9. Problems Found / Fixed

None. Every function worked as designed on the first application — no bug discovered during testing (unlike Phase 1's `verify_phone_otp`, where live testing did catch a real rollback bug; this phase's testing found nothing to fix).

## 10. Rollback Strategy

Phase 3A is fully isolated and has zero callers anywhere in the codebase — rollback, if ever needed, is:
```sql
drop function if exists public.revoke_all_customer_sessions(uuid);
drop function if exists public.revoke_customer_session(text);
drop function if exists public.validate_customer_session(text);
drop function if exists public.create_customer_session(uuid);
drop table if exists public.customer_sessions;
```
No data migration, no backfill, nothing in any other table references `customer_sessions` (only the reverse: `customer_sessions.customer_id` references `customer_identities`, so dropping `customer_sessions` affects nothing upstream). Safe at any point before Phase 3B introduces a caller.

---

## 11. Explicit Confirmation — NOT Changed

**Route Handlers**: none created — `menu-next/app/**/route.ts` still does not exist anywhere in the repository.
**Cookies**: none created, read, or referenced anywhere — no `cookies()`, `Set-Cookie`, or `document.cookie` usage added.
**`create_order`**: untouched — zero lines changed, not referenced by any object in this migration.
**Checkout** (`CheckoutForm.tsx`, `checkout/page.tsx`): untouched.
**`verify_phone_otp`**: untouched — not referenced, called, or modified by anything in this migration.
**`restaurant_customers`**: untouched.
**`customer_identities`**: untouched (only referenced via FK, never altered).
**OTP logic** (`request_phone_otp`, `request_phone_otp_for_delivery`, `customer_phone_verifications`, `otp_ip_request_log`): untouched.
**Feature Registry** (`feature_flags`, `plan_features`, `features.manifest.js`): untouched.
**Loyalty, menu/themes**: untouched — no file in `src/features/menu`, `menu-next/app/menu/[slug]` (theme components), or loyalty-related paths was opened or edited.
**Edge Functions**: none deployed or modified — `list_edge_functions` was not even re-checked this turn since nothing in this phase could affect it (no `deploy_edge_function` call was made).
**Production sessions**: zero real customer sessions created — only the disposable test fixtures in §6, all deleted.

## 12. Explicit Confirmation — Git

**No `git add`, `git commit`, `git push`, branch creation, PR, or merge occurred this turn.** `git status` at the end of this turn shows exactly one new untracked file (`sql/customer_session_phase3a.sql`) alongside the same 9 pre-existing unrelated modified files carried through every prior turn, unchanged.

---

## Recommendation

**Phase 3A complete and verified. Stopping here, per your instruction — Phase 3B (session issuance / Route Handler / cookie) awaits your explicit review and approval before any work begins.**
