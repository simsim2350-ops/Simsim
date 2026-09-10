# SimSim — Phase 3: Customer Session — Architecture Design Report

> **DESIGN ONLY.** No code, database, or configuration was modified. No migration created. No deployment. No commit/push/PR/merge. This document is the deliverable — implementation awaits your explicit approval.

---

## 1. Executive Summary

The current architecture has **zero customer-facing session mechanism of any kind** — no cookies, no middleware, no Route Handlers, no Supabase Auth for customers. Every customer interaction (menu browsing, cart, checkout, OTP request/verify) is a stateless, anonymous `anon`-key call directly from browser JS to either a Supabase PostgREST RPC or, for OTP delivery, the `send-phone-otp` Edge Function.

This is the single most consequential fact for the whole design: **introducing any session token that must stay invisible to JavaScript (HttpOnly) requires introducing a new server-side mediation layer that does not exist today**, because PostgREST RPC calls from the browser cannot read an HttpOnly cookie's value to forward it as a parameter — only a server process can. Your own default expectation (HttpOnly Secure cookie) is confirmed as the right choice for the token's *at-rest* security, but it is not a drop-in fit for the *current* "browser calls Postgres directly" pattern without also introducing a thin Next.js Route Handler as the session-issuing/validating layer. Section 5 lays out this finding in full, with the alternatives actually considered.

The domain architecture is simpler than one might assume: there is **one single customer-facing domain** (`simsimmenu.com`, restaurants distinguished by URL path/slug, not by custom domain) proxied via a Vercel absolute-URL rewrite to the `menu-next` deployment. No per-restaurant custom domains exist. This removes an entire class of cross-domain cookie complexity from the design — confirmed by direct schema inspection (`restaurants` has no domain column; `menu_slug_redirects` is a same-domain slug-rename table only), not assumed.

**Recommendation: READY for a phased Phase 3 implementation**, starting with the smallest, fully reversible piece (database session foundation) and deferring the checkout-architecture question (direct-RPC vs Route-Handler-mediated) to its own explicit approval gate before touching `create_order`.

---

## 2. Current Architecture Audit

Performed by direct inspection this turn (not recalled from memory) of the following:

| Area | Finding | Evidence |
|---|---|---|
| Supabase client config | `persistSession: false, autoRefreshToken: false` in both `supabaseBrowser()` and `supabaseServer()` | `menu-next/lib/supabase/client.ts`, `server.ts` (unchanged since Phase 1's own audit) |
| Customer auth | Does not exist | No `signInAnonymously`, no `auth.users` row creation path for customers, no login UI in `menu-next` |
| Customer sessions/cookies | **Do not exist anywhere** | Repo-wide search for `cookies()`, `document.cookie`, `Set-Cookie`, `httpOnly` inside `menu-next/` returned zero matches |
| Middleware | **Does not exist** | No `menu-next/middleware.ts` |
| Next.js Route Handlers / API routes | **Do not exist** | No `menu-next/app/**/route.ts`, no `app/api/` directory |
| Edge Functions for customer-facing flows | Exactly one, currently: `send-phone-otp` (deployed, ACTIVE) | `supabase/functions/send-phone-otp/` — the only customer-reachable Edge Function actually live (`payment-webhook`, `payment-first-checkout`, `create-order-from-payment` exist as source but are **not deployed** — confirmed via `list_edge_functions`) |
| Checkout architecture | Browser JS → PostgREST RPC directly (`create_order` / `create_order_from_table_qr`), `anon` key, no server mediation | `menu-next/components/CheckoutForm.tsx` |
| Menu architecture | Next.js 16 App Router, Server Components for data loading (`loadMenuPage`), Client Components for cart/checkout interactivity | `menu-next/app/menu/[slug]/**`, `package.json` (`"next": "^16.0.0"`) |
| Domain/deployment architecture | **Single customer domain**: `simsimmenu.com/menu/:slug*` → Vercel absolute-URL rewrite → `simsim-menu-next.vercel.app`. Browser's address bar and cookie jar see only `simsimmenu.com` (Vercel proxies server-side; this is not a client redirect) | `vercel.json` routes table, `menu-next/next.config.ts` comment |
| Custom domains per restaurant | **Do not exist** | `restaurants` table has zero domain-related columns (checked directly); `menu_slug_redirects` is old-slug→new-slug only, same domain |
| Can the app safely issue HttpOnly cookies | **Yes, mechanically** (Next.js 16 Route Handlers support this natively; single domain removes multi-domain complexity) — **but requires a new server layer that doesn't exist today** (see §5) | Architectural inference from the above, not yet live-tested |
| Paths that can eventually reach identity/OTP/`create_order` | `CheckoutForm.tsx` (checkout), a future `send-phone-otp`-adjacent flow (OTP entry UI, not yet built), `create_order` / `create_order_from_table_qr` RPCs | Confirmed by reading `CheckoutForm.tsx` in full |

---

## 3. Existing Customer Identity / OTP Architecture (re-confirmed, not modified)

| Object | Role |
|---|---|
| `customer_identities` | One row per verified phone, **platform-wide**, `id uuid`, `phone` (canonical `5XXXXXXXX`, unique), `phone_verified_at` |
| `restaurant_customers` | `(customer_id, restaurant_id)` relationship — isolates per-restaurant association from the global identity |
| `customer_phone_verifications` | OTP lifecycle: hash+salt, expiry (5 min), attempts (max 5), cooldown (60s), hourly send cap (5) |
| `request_phone_otp` / `request_phone_otp_for_delivery` | Anon-facing wrapper / `service_role`-only generator — the only place plaintext OTP ever exists outside the DB, for the duration of one Edge Function call |
| `verify_phone_otp(phone, code)` | The **sole** verification authority — returns `{"verified": true/false}`; **not modified in this phase** |
| `otp_ip_request_log` + `check_and_log_otp_ip_request` | Second-layer, hashed-IP abuse protection, independent of per-phone limits |
| `send-phone-otp` (Edge Function) | Delivery only, via Authentica; live-proven end-to-end with a real SMS test |

**None of this is touched, redesigned, or assumed changed in this report.** Phase 3 begins at the point `verify_phone_otp` already returns `verified: true` and asks: *what happens next?*

---

## 4. Session Architecture Decision

**Recommendation: a database-backed opaque session token, hashed at rest, issued and validated through a thin Next.js Route Handler layer, transported as an HttpOnly Secure SameSite=Lax cookie scoped to `simsimmenu.com`.**

This is your default expectation, **confirmed** — but confirmed only after establishing that a mediating server layer must be introduced alongside it (§5), which is a real, non-trivial addition to the current architecture, not a footnote.

Rejected alternative at the architecture-decision level: reusing Supabase Auth's own session/JWT system for customers. Reasons: (a) it would conflate the customer population with the existing `auth.users` table, which today holds only restaurant staff/owners and platform admins — a fundamentally different security/permissions model; (b) it would require signing customers into Supabase Auth via a workaround (Supabase Auth has no "phone already verified by our own OTP, just mint a session" primitive that fits this exactly without either using Supabase's own phone-OTP flow — which would mean routing SMS through Supabase/Twilio instead of Authentica, contradicting Phase 2 — or abusing a different sign-in method); (c) no precedent for it exists anywhere in this codebase for customers. A custom, minimal `customer_sessions` table stays smaller and fully under SimSim's own control, consistent with "do not add fields/systems beyond what's needed."

---

## 5. Recommended Schema — `customer_sessions`

| Field | Purpose | Security implication | Required now? |
|---|---|---|---|
| `id uuid` | Primary key, internal reference | None (never exposed to browser) | **Required** |
| `customer_id uuid` (→ `customer_identities.id`) | Who this session belongs to | The whole point of the table | **Required** |
| `session_token_hash text` | SHA-256 (or similar) of the opaque token, **never the plaintext token** | If the DB is ever read (backup leak, compromised replica), tokens cannot be reconstructed — same pattern as `customer_phone_verifications.otp_code_hash` and `marketing_preview_tokens.token_hash`, both already established in this codebase | **Required** |
| `created_at timestamptz` | Audit / debugging | Low | **Required** |
| `expires_at timestamptz` | Absolute session lifetime enforcement (§6) | Central to revocation-by-time | **Required** |
| `last_seen_at timestamptz` | Idle-timeout enforcement, "sessions used recently" UX (e.g., a future "log out other devices" screen) | Low, but touched on every validated request — see rate/cost note below | **Required** |
| `revoked_at timestamptz` (nullable) | Explicit logout / admin-forced revocation, independent of `expires_at` | Lets a session be killed instantly without waiting for natural expiry | **Required** |

**Fields deliberately NOT proposed, with reasoning (per your "do not add fields just because they're common" instruction):**

| Field considered | Verdict | Reasoning |
|---|---|---|
| `device_id` / `device_fingerprint` | **Rejected as security proof; optional metadata only, deferred** | Your own instruction (§7) is explicit: device ID must never be the security proof. A *non-authoritative* `user_agent text` column (informational only, e.g. for a future "Chrome on iPhone, last used 2 days ago" logout screen) could be added later without any migration risk — but nothing in Phase 3's actual security model needs it, so it is deferred, not built speculatively now. |
| `ip_address` | **Deferred** | Could be useful for anomaly detection later (e.g., "this session is being used from a new country"), but that's a Phase-4-or-later feature, not a Phase 3 requirement. Storing raw IPs also raises the same privacy question already resolved for `otp_ip_request_log` (hash it, don't store raw) — if ever added, it should follow that same hashed pattern, not be bolted on now. |
| `session_token` (plaintext) | **Explicitly rejected** | Directly contradicts your own requirement — hash only. |
| `rotated_from` / rotation-chain tracking | **Deferred** | Only matters if/when token rotation-on-use is adopted (§6 discusses this as optional, not required for v1). |
| `restaurant_id` | **Rejected entirely** | The session is deliberately **global**, not restaurant-scoped — adding this would silently reintroduce the restaurant-scoping problem your own Phase 1 mandate explicitly rejected (§8 covers how restaurant context is derived instead, without living on the session row). |

**Token generation**: same proven pattern already used twice in this codebase (`create_order`'s `access_token` via `extensions.gen_random_bytes(32)`, and Phase 1's own OTP-code generation) — `encode(extensions.gen_random_bytes(32), 'hex')` for the plaintext (256 bits of entropy, opaque, cryptographically random), immediately hashed before storage, exactly mirroring the OTP-hashing precedent. Not a new pattern to invent.

---

## 6. Session Token Transport — Options Evaluated

| Option | XSS resistance | CSRF | Mobile browsers | Multi-device | Custom domains | Next.js fit | Edge Function fit | Revocation | Leakage risk | Complexity |
|---|---|---|---|---|---|---|---|---|---|---|
| **A. HttpOnly Secure SameSite cookie** | **Strong** — JS cannot read it | Needs `SameSite=Lax` (or `Strict`) + no state-changing GETs; low risk for this app's actual request shapes (POST-only mutations) | Works natively, well-supported | Fully compatible — one cookie per device/browser, exactly matching your requirement | N/A here — single domain confirmed (§2) | **Requires a new Route Handler layer** (cookies aren't visible to direct browser→PostgREST calls) | Edge Functions can also read/set cookies from `Request`/`Response` headers directly — equally compatible | Trivial — `revoked_at` + delete-cookie response | Low — never touches JS-readable storage or DB in plaintext | **Medium** — the new mediation layer is the real cost |
| **B. Authorization Bearer token** | **Weak** — must live somewhere JS can read it (memory/localStorage) to attach the header | N/A (no ambient credential) | Fine | Fine | Fine | Fits the *current* direct-RPC pattern perfectly (just another RPC parameter) — **zero new server layer needed** | Fine | Trivial | **Higher** — any XSS reads it directly | **Lowest** — matches today's architecture exactly |
| **C. localStorage token** | **Weakest** — first place an XSS payload looks | N/A | Fine | Fine, but not shareable across a Safari Private/Incognito boundary reliably | Fine | Same as B | Same as B | Trivial | **Highest** | Lowest |
| **D. Supabase Auth session** | Strong (Supabase's own cookie/JWT handling) | Supabase handles this | Fine | Supabase supports multi-session | Fine | Requires wiring `@supabase/ssr` cookie helpers (not currently used anywhere in `menu-next`) | Requires the customer to actually exist in `auth.users` | Supabase-native | Low | **High** — conflates customer population with staff/admin auth system (§4) |
| **E. Hybrid: HttpOnly cookie minted/read by a Route Handler, which resolves `customer_id` and forwards it to Postgres RPCs server-side** | Strong (inherits A) | Same as A | Same as A | Same as A | Same as A | **This *is* the practical shape of Option A once the mediation layer is built** — not a separate option, the concrete implementation of A | Same as A | Same as A | Same as A | Same as A, explicitly named to make the "A requires a server hop" point unmissable |

**Decision: Option A (HttpOnly Secure SameSite=Lax cookie), implemented via Option E's concrete shape — a Route Handler mediation layer.**

**Why, despite the added complexity over Option B:** your own instruction states phone ownership is the ultimate proof and the session must not be trivially stealable. Option B/C place the bearer token somewhere JS — and therefore any successful XSS — can read it outright; Option A structurally cannot be read by JS at all, which is the entire reason HttpOnly cookies exist. The added Route Handler is real cost, but it is a **one-time, isolated** piece of new infrastructure (a handful of small endpoints — §10), not a rearchitecture of the whole app. Given this system protects a customer's phone-linked identity across potentially many restaurants, the stronger XSS posture is worth that one-time cost.

**What this decision means concretely for later phases (flagged now, not glossed over):** once a session gates something like `create_order`, the browser can no longer call that RPC directly with the session attached (it has no way to read the cookie to pass it). Either (a) `create_order` itself grows a way to be called *by the Route Handler* (server-to-server, using `service_role` or a signed assertion) instead of directly by the browser, or (b) the Route Handler mints a short-lived, JS-visible proof for that one call. **This is explicitly Phase 3F's problem to solve, not this phase's** — flagged here so it isn't a surprise later.

---

## 7. Session Lifetime Policy

| Parameter | Recommendation | Reasoning |
|---|---|---|
| Session lifetime (absolute) | **30 days** | Long enough that a returning customer within a month doesn't need to re-verify (matches the product goal — "should not need to re-enter OTP for every restaurant"), short enough to bound a stolen-cookie's blast radius meaningfully. Not a security-critical number in isolation (revocation below matters more) — reasonable industry default for a low-stakes consumer session (no payment credentials stored in it). |
| Idle timeout | **None enforced separately from absolute expiry, initially** | Adding a second timer (idle vs absolute) is real complexity for a customer flow that's fundamentally "order food occasionally" — a customer who orders once a week shouldn't be logged out for idling between orders. `last_seen_at` is still recorded (useful for a future "revoke sessions inactive >90 days" cleanup job), just not used to force early expiry in v1. |
| `last_seen_at` update frequency | **Best-effort, not on every single validation call** — e.g., only update if the stored value is >1 hour stale | Updating on every request turns a read-mostly table into a write-heavy one for no real benefit; a coarse-grained "roughly when was this last used" is sufficient for its only current purpose (future cleanup/UX), so no reason to pay a write on every page load. |
| Renewal / rotation | **Not required for v1; deferred** | Silent rolling renewal (extending `expires_at` on use) is a reasonable future addition but adds a mutation to every validated request. Given the 30-day window is already generous, deferring this keeps v1 simpler; the open question of "rotate the token value itself on each use" (defense against replay of a sniffed cookie) is explicitly deferred too — it meaningfully raises complexity (client must always use the newest token, races on concurrent requests) for a threat (network-level cookie sniffing) that HTTPS-only + `Secure` flag already mitigates. |
| Revocation | **Immediate, via `revoked_at`** | Logout, or a future "log out all devices," simply stamps this column — every subsequent validation call checks it, no propagation delay. |
| OTP-triggered new session | **Every successful `verify_phone_otp` call may mint a *new* session row** — it does not need to look for/reuse an existing one | Matches §7 of your instructions directly: Device A's session must not be invalidated by Device B re-verifying. Each verification event is independent. |
| Behavior after expiration | **Fail closed, treat as anonymous** | An expired/revoked/missing session simply means "this request has no known customer" — never an error state the customer must explicitly handle; they're just prompted for OTP again if/when the app needs to know who they are (e.g., at checkout). |

---

## 8. Multi-Device Model

Directly satisfied by the schema in §5: `customer_sessions` has no unique constraint on `customer_id` alone — many rows can exist for one `customer_id` simultaneously, each with its own `session_token_hash`, `expires_at`, `revoked_at`. Device A verifying does not touch Device B's row at all (they don't share any key). No device-identity table, no fingerprinting, no `device_id` column anywhere — matches §7 of your instructions exactly. A future "your active sessions" UI (out of scope for Phase 3) would simply list `customer_sessions` rows for the caller's own `customer_id` and let them individually `revoke`.

---

## 9. Restaurant Isolation Model

**The session proves *global* identity (`customer_id`) only. It carries no restaurant context whatsoever, and must never be asked to.**

```
customer_session → resolves to → customer_id (global)
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                                        ▼
      restaurant_customers(customer_id, A)      restaurant_customers(customer_id, B)
         — queried/created ONLY when            — queried/created ONLY when
           the request is scoped to               the request is scoped to
           restaurant A                            restaurant B
```

**The authorization boundary is enforced exactly the same way it already is for every other restaurant-scoped object in this codebase** (orders, branches, products, coupons — all filtered by `restaurant_id` at the query/RPC level, never inferred from a broader credential). A session by itself answers *"who is this customer, globally?"* — it never answers *"what is this customer's history at restaurant X?"*; that second question is always a separate, explicitly `restaurant_id`-scoped query against `restaurant_customers` (and, eventually, `orders`), the same way `has_restaurant_access(restaurant_id)` already gates every *staff*-side query today. A session token, however global, is structurally incapable of becoming a cross-restaurant data-access mechanism, because nothing in this design ever resolves "all restaurants this customer_id has touched" as a single unscoped query path exposed to any restaurant's own context.

---

## 10. OTP → Session Handoff

**Decision: keep verification and session creation as two separate steps (Option B in your framing), not folded into `verify_phone_otp` itself.**

Reasoning:
- Your own instruction is explicit: *do not modify `verify_phone_otp` in this phase.* Folding session creation into it would require exactly that.
- `verify_phone_otp` is a pure `security definer` SQL RPC — it has no natural way to hand an opaque token to the browser in an HttpOnly cookie (SQL functions don't set HTTP headers). Session *issuance* is inherently an HTTP-layer concern (§6), so it belongs in the mediating server layer, not in Postgres.
- Separation keeps `verify_phone_otp`'s existing, already-proven contract (`{"verified": true/false}`, enumeration-safe, replay-safe) completely stable — a real, valuable property given it has already passed a live E2E test with real SMS.

**Concrete flow (design only, not built):**
```
Browser (has entered phone + received code)
        │
        ▼
Route Handler: POST /api/customer/verify-otp  { phone, code }
        │
        ├─→ calls verify_phone_otp(phone, code)  [unchanged RPC, anon-equivalent call from server side]
        │
        ├─→ if verified=false → return generic failure (same shape verify_phone_otp already returns)
        │
        └─→ if verified=true:
                ├─→ resolve customer_id (already returned by verify_phone_otp)
                ├─→ generate opaque token, hash it
                ├─→ INSERT customer_sessions row (via a new, minimal, service_role-only RPC — §11)
                └─→ Set-Cookie: HttpOnly, Secure, SameSite=Lax, the PLAINTEXT token, Max-Age=30d
        │
        ▼
Browser now holds an HttpOnly cookie it cannot read — future requests simply include it automatically
```
The browser never receives `customer_id`, the token hash, or any database row shape — only the opaque cookie value itself, exactly once, set by the server.

---

## 11. Session API / RPC Design (design only — none of this exists yet)

Kept intentionally minimal — five operations, not a generic session framework:

| Operation | Input | Output | Mechanism | `SECURITY DEFINER`? | Exposed to browser? |
|---|---|---|---|---|---|
| `create_customer_session` | `customer_id uuid` | `{ session_id, token }` (plaintext token returned **once**, here only) | **SQL RPC**, `service_role`-only (same grant pattern as `request_phone_otp_for_delivery`) | Yes — must write `customer_sessions` regardless of RLS, but only the Route Handler (holding `service_role`, exactly as `send-phone-otp` already does) may call it | **No** — only the Route Handler calls it server-to-server |
| `validate_customer_session` | `token text` (plaintext, hashed inside the function before lookup) | `{ valid: bool, customer_id: uuid \| null }` | **SQL RPC** — could be `anon`-grantable in principle (it only ever reveals a `customer_id` to whoever already possesses the correct token, which is the point of a session), but routing it through the Route Handler anyway keeps the token consistently server-side only, so **`service_role`-only**, called by the Route Handler on every request that needs to know "who is this" | Yes | **No** |
| `revoke_customer_session` | `session_id uuid` (or `token`) | `{ revoked: bool }` | **SQL RPC**, `service_role`-only, called by the Route Handler in response to an explicit logout request from the browser | Yes | **No** |
| `revoke_all_customer_sessions` | `customer_id uuid` | `{ revoked_count: int }` | **SQL RPC**, `service_role`-only — "log out everywhere," a natural pairing with `revoke_customer_session` for v1 rather than a later addition, since it's the same shape of operation | Yes | **No** |
| `touch_customer_session` | `session_id uuid` | `{ ok: bool }` | Folded into `validate_customer_session` itself (updates `last_seen_at` opportunistically per §7's "not every call" rule) rather than a separate operation — avoids a second round-trip for a purely best-effort side effect | Yes (as part of `validate_customer_session`) | **No** |

**What must never be exposed to the browser, for any of the above:** the token's hash, any other customer's `customer_id`, raw row contents of `customer_sessions`, and — as with every RPC already in this codebase — no raw internal error text (same `raise exception` → generic-message mapping pattern already established for `verify_phone_otp`/`request_phone_otp`).

**Why a Route Handler and not a direct browser→RPC call for these:** every one of these operations either needs to read/write an HttpOnly cookie (impossible for a direct browser→PostgREST call) or needs `service_role` (which must never reach the browser). This is the direct, concrete consequence of the §6 decision — not a new, separate design choice.

---

## 12. Security Threat Model

| Threat | Mitigation |
|---|---|
| Session token theft (network) | HTTPS-only (already enforced platform-wide), `Secure` cookie flag — token never traverses plaintext |
| XSS | HttpOnly — JS (including injected XSS payloads) cannot read the cookie value at all |
| CSRF | `SameSite=Lax` blocks the cookie from being sent on cross-site subresource/form submissions to state-changing endpoints; all session-consuming endpoints are `POST`-only (matches existing RPC-call conventions), never triggered by a plain cross-site `GET` |
| Session fixation | Token is always server-generated (never accepted as client input to "set my own session id"); a fresh token is minted on every successful OTP verification, never reused |
| Replay (of a valid, unexpired token) | Structurally possible until the legitimate holder revokes it — this is inherent to any bearer-style session, mitigated by (a) HttpOnly transport making theft hard in the first place, (b) `expires_at` bounding the window, (c) `revoked_at` giving instant kill-switch once theft is suspected |
| Token leakage (logs, errors, URLs) | Token lives only in a cookie header, never in a URL/query string; server-side logging must mask it exactly as OTP/API-key masking already does (`maskPhone`-equivalent pattern) — an explicit implementation requirement to carry into Phase 3B, not yet built |
| Database compromise | Only `session_token_hash` is stored — a DB dump alone cannot reconstruct usable tokens, same guarantee already relied on for OTP hashes |
| Expired sessions | `validate_customer_session` checks `expires_at` and treats an expired row as invalid (fail closed → anonymous) |
| Revoked sessions | Same check against `revoked_at` |
| OTP replay | Already solved, unmodified — `verify_phone_otp` clears the hash on success (Phase 1) |
| Phone enumeration | Already solved, unmodified — `verify_phone_otp`'s uniform failure shape (Phase 1) |
| Cross-restaurant authorization | Structurally impossible by design — see §9; the session never carries `restaurant_id`, so there is nothing to leak across restaurants at the session layer itself |
| Concurrent sessions | Explicitly supported, not a threat — §8 |
| Session rotation | Deferred (§7) — accepted residual risk is bounded by the 30-day absolute expiry + instant revocation |
| Logout | `revoke_customer_session` + cookie cleared in the same response |
| Stolen browser/device | Equivalent to "stolen cookie" above — the customer's own recourse is `revoke_all_customer_sessions` (a future "log out everywhere" UI), which is designed into the RPC surface now even though the UI for it isn't built in Phase 3 |

---

## 13. Privacy / Data Minimization

The session cookie itself carries **zero claims** — it is an opaque token; all identity resolution happens server-side against `customer_sessions`/`customer_identities`. Consequently:
- The phone number is never embedded in the session or sent to the browser as part of it.
- No restaurant history, cross-restaurant order history, or loyalty balance is ever attached to the session token itself — each is a separately authorized, `restaurant_id`-scoped query, fetched only when actually needed, by whatever page needs it.
- No internal database ID other than what a Route Handler explicitly, deliberately returns in a specific response is ever exposed — `validate_customer_session`'s output shape given to *server-side* callers includes `customer_id` (needed to do anything useful with it), but this is never itself echoed back to the browser as a cookie/localStorage value; the browser only ever holds the opaque token.

---

## 14. Order Integration Strategy (design only — `create_order` NOT touched)

- **Should Phase 3 add `customer_id` to `orders`?** No — deferred to a later, dedicated phase. Reasoning: `orders.customer_phone` already exists and is untouched by design (Phase 1's explicit mandate); adding a `customer_id` FK is a schema change to a live, high-traffic table (174+ rows and growing) that deserves its own careful, isolated migration and testing pass — bundling it into "session foundation" work risks exactly the kind of large, risky migration your own instructions ask to avoid (§14/§15 of this phase's brief).
- **How should `create_order` eventually prove the session's `customer_id` matches the verified phone being submitted?** Conceptually: the Route Handler (or an equivalent trusted layer) resolves `customer_id` from the session, independently confirms `customer_identities.phone = p_customer_phone` for that same `customer_id` (i.e., the phone in the order request must be *this session's own* verified phone, not an arbitrary one the session holder claims), and only then is the order allowed to proceed (or is tagged with `customer_id`, once that column exists). This check belongs inside `create_order` itself when that phase arrives (matching how every other server-side guarantee in `create_order` already lives inside the function, not in application code) — not designed further here, since it directly touches `create_order`, which is out of scope this phase.
- **`restaurant_id` enforcement**: unaffected and unchanged — `create_order` already independently validates `restaurant_id`/`branch_id` today, and nothing in this design proposes weakening or bypassing that; a future session-aware `create_order` would add a *new* check on top, never replace the existing one.
- **Recommendation**: treat "sessions exist and work" (this phase) and "orders know about sessions" (a later phase) as fully separate, independently reversible pieces of work — the smallest safe change is to build and prove the session layer in complete isolation first, exactly as Phase 1 did for Customer Identity before Phase 2 touched delivery.

---

## 15. Proposed Implementation Phases

Derived from the actual repository's current shape (no Route Handlers/middleware exist yet at all — that gap has to be crossed exactly once, as early as possible, so every later phase builds on real infrastructure rather than a stub):

| Phase | Scope | Why this order |
|---|---|---|
| **3A — Database session foundation** | `customer_sessions` table + the five RPCs (§11), `service_role`-only, RLS enabled with zero policies (matching every Phase 1/2 table). No caller yet. | Fully isolated, fully reversible (drop table + functions), directly testable via privileged SQL exactly like Phase 1/2's own DB-level testing — zero risk to anything live. |
| **3B — Route Handler: session issuance** | One new endpoint (`POST /api/customer/verify-otp` or similar) that calls the *existing, unmodified* `verify_phone_otp`, then on success calls `create_customer_session`, sets the cookie. First point the app ever sets an HttpOnly cookie — proves the mechanism works on this exact domain/proxy setup (§2's Vercel-rewrite cookie-survival question gets answered empirically here, not assumed). | Smallest possible "does this actually work end-to-end on our real infrastructure" checkpoint, before building anything that depends on it. |
| **3C — Route Handler: session validation** | A second endpoint (or a shared server-side helper other Route Handlers call) wrapping `validate_customer_session`, used to answer "is there a valid session on this request." | Needed before anything can *use* a session for anything. |
| **3D — Logout / revocation** | Wires `revoke_customer_session` (and, if useful by then, `revoke_all_customer_sessions`) to a logout action; clears the cookie in the response. | Small, isolated, high user-trust value ("I can log out"), no dependency on checkout. |
| **3E — Non-critical UI integration** | Something low-stakes reads "is there a valid session" to adjust UI (e.g., pre-filling the phone field on Checkout for a recognized returning customer) — **without** yet gating anything security-relevant on it. | Proves the session is genuinely usable end-to-end from a real page, while the blast radius of a bug is "wrong pre-fill," not "wrong authorization." |
| **3F — Checkout / `create_order` integration** | The `customer_id`-on-orders question (§14), and any change to `create_order` itself. | Deliberately last, and explicitly its own approval gate — this is the only phase that touches a live, high-traffic, revenue-relevant table/function, and per your own instructions deserves the most scrutiny and the smallest possible diff once it's reached. |

This is not assumed to be the final word — it's the sequence that follows from what actually exists in the repo today (nothing → DB → issuance → validation → revocation → low-stakes usage → high-stakes usage), each phase depending only on the one directly before it.

---

## 16. Migration / Rollback Strategy

**New database objects Phase 3A would introduce** (not created this turn): `public.customer_sessions` (table, RLS enabled, zero policies) + `create_customer_session` / `validate_customer_session` / `revoke_customer_session` / `revoke_all_customer_sessions` (functions, `service_role`-only grants, `security definer`, `search_path = public` — matching every convention already established in Phases 1/2).

**Existing objects that remain untouched by this design, end to end**: `customer_identities`, `customer_phone_verifications`, `restaurant_customers`, `request_phone_otp`, `request_phone_otp_for_delivery`, `verify_phone_otp`, `otp_ip_request_log`, `check_and_log_otp_ip_request`, `orders` (any column), `create_order`, `create_order_from_table_qr`, `feature_flags`/`plan_features`/`phone_verification`'s registration, every menu/theme/loyalty table.

**Backward compatibility**: total — nothing existing reads or writes `customer_sessions`, so its mere existence changes no current behavior. An anonymous customer with no session cookie behaves exactly as every customer does today.

**Rollback strategy**: Phase 3A is a pure `DROP TABLE`/`DROP FUNCTION` away from a clean revert at any point before 3B ships a caller — no data migration, no backfill, nothing to "undo" in any other table. Once 3B-3F are live, rollback becomes "stop issuing new sessions" (trivial — just stop calling `create_customer_session`) rather than a schema rollback, since existing sessions simply age out via `expires_at` regardless.

**Test data cleanup**: identical discipline to every prior phase in this project — any test `customer_sessions` row created during implementation-phase testing gets deleted immediately after, verified via row-count before/after, exactly as done for every Phase 1/2/2.1 test fixture.

**Production safety**: no phase in this sequence touches `orders`, `create_order`, or any other live-traffic path until 3F, which is explicitly gated on its own separate review.

---

## 17. Complete Test Plan (for when implementation begins — not run now)

| # | Test | Layer |
|---|---|---|
| 1 | Session creation after successful OTP | DB (privileged SQL, mirroring Phase 1/2's own test methodology) |
| 2 | Invalid OTP cannot create a session | DB + HTTP (Route Handler) |
| 3 | Expired session rejected by `validate_customer_session` | DB |
| 4 | Revoked session rejected | DB |
| 5 | Multiple concurrent sessions for the same customer, independently valid | DB |
| 6 | Session token replay — a used-but-still-valid token remains valid until expiry/revocation (this is expected bearer-token behavior, not a bug — the test confirms the *documented* behavior, not a "should fail" assumption) | DB |
| 7 | A stolen/malformed/nonexistent token is rejected, with a generic response indistinguishable from "expired" (enumeration-safety, matching `verify_phone_otp`'s own established pattern) | DB + HTTP |
| 8 | Logout revokes the session and clears the cookie | HTTP (Route Handler) + browser E2E |
| 9 | Restaurant isolation — a session's `customer_id` used against `restaurant_customers` for Restaurant A never returns Restaurant B's rows | DB |
| 10 | Customer identity isolation — two different `customer_id`s' sessions never cross-resolve | DB |
| 11 | Session validation response never includes the token hash, phone number, or unrelated internal fields | Unit (Route Handler response shape) |
| 12 | No phone enumeration via any new endpoint (same generic-failure-shape discipline as Phase 1) | HTTP |
| 13 | Existing customer/order/loyalty behavior completely unchanged (row counts before/after, exactly as every prior phase's regression check) | DB (count-based regression) |
| 14 | A request with no cookie / an anonymous browser behaves exactly as today (no session-related change in observable behavior) | Browser E2E |
| 15 | Full existing regression suite + build | Unit (`npx vitest run`, `npm run build`) |

**Layer breakdown**: *Unit* — pure-function-level assertions on Route Handler response shapes (mirroring `sendPhoneOtp.test.js`'s own `buildHandler` testing pattern). *DB* — privileged SQL against a real (test-fixture-isolated) database state, exactly the methodology already used and proven across Phases 1/2/2.1. *HTTP* — real requests against the deployed Route Handler/Edge Function with the public anon-equivalent path, mirroring the `test_customer_identity.mjs`-style scripts already used this session. *Browser/E2E* — Playwright, for anything that depends on the actual cookie being set/read by a real browser (this is the one category prior phases haven't needed until now, precisely because nothing before this involved a cookie).

---

## 18. Risks / Open Decisions

| # | Item | Why it's open |
|---|---|---|
| 1 | **Does the Vercel absolute-URL rewrite (`simsimmenu.com` → `simsim-menu-next.vercel.app`) actually preserve `Set-Cookie` headers as first-party for `simsimmenu.com`?** | Reasoned as "should work" from Vercel's documented rewrite-proxy behavior, but **not yet empirically tested** — this is exactly why Phase 3B is scoped as the first, smallest possible live checkpoint rather than assumed and built around blindly. |
| 2 | **Route Handler vs. extending an Edge Function for session issuance/validation** | Both are technically workable (§6); Route Handler was favored as slightly more idiomatic for a flow that's otherwise entirely within the Next.js app, but this is a genuine, reasonable place for your preference to decide before 3B starts. |
| 3 | **Exact session lifetime (30 days) and idle-timeout policy (none in v1)** | Product/security trade-off, not a technical constraint — presented with reasoning in §7, open to adjustment. |
| 4 | **Whether `restaurant_customers` rows should be created automatically the first time a session is used in a restaurant's context, or only at actual order time** | Not resolved here — deliberately deferred, since it depends on decisions Phase 3E/3F will make about *when* restaurant context first becomes relevant to a logged-in-but-not-yet-ordering customer. |
| 5 | **Token rotation-on-use** | Explicitly deferred in §7 as unnecessary complexity for v1 — flagged as a legitimate future hardening step, not a gap being silently ignored. |
| 6 | **`orders.customer_id`** | Explicitly deferred to its own phase (§14/§15) — not a Phase 3 decision at all. |

---

## 19. Files Inspected This Turn

`menu-next/lib/supabase/client.ts`, `menu-next/lib/supabase/server.ts`, `menu-next/components/CheckoutForm.tsx` (already fully read in prior turns, re-confirmed unchanged), `menu-next/next.config.ts`, `menu-next/package.json`, `vercel.json`, `sql/menu_ready_activation_v1.sql` (for `menu_slug_redirects`), live schema inspection of `restaurants` and `menu_slug_redirects` columns (read-only `information_schema` queries), `list_edge_functions` (live, read-only), plus repository-wide greps for `middleware`, `route.ts`, `cookies()`, `document.cookie`, `Set-Cookie`, `httpOnly`, and `domain`-named columns. All Phase 1/2/2.1 SQL and Edge Function source files were re-referenced from this session's own established, already-verified knowledge (not re-read line-by-line again, since their content was already exhaustively audited and is unchanged).

## 20. Explicit Confirmation — No Files/Database/Runtime Modified

**Confirmed.** No file was created, edited, or deleted this turn except this report. No `apply_migration`, no `execute_sql` write statement (every SQL query this turn was a read-only `SELECT` against `information_schema` or a metadata-listing call) was executed. No Edge Function was deployed or modified. No test customer identity, session, or OTP was created. `git status` was not even required to be re-run, since nothing was touched — the working tree is identical to the state left at the end of the previous (comment-only) turn.

## 21. Explicit Confirmation — No Git Actions

**Confirmed.** No `git add`, `git commit`, `git push`, branch creation, PR, or merge occurred this turn.

## 22. Recommendation

# READY for Phase 3 implementation, phased per §15

The architecture gap (no cookies/middleware/Route Handlers exist yet) is real but well-understood and small in absolute size — a handful of new, isolated files, not a rearchitecture. Phase 3A (database foundation) carries essentially zero risk and can begin as soon as you approve it, fully independent of resolving the open items in §18. Item #1 in §18 (cookie survival through the Vercel rewrite) should be treated as a **hard go/no-go checkpoint at the end of Phase 3B specifically** — if it doesn't work as reasoned, the transport decision in §6 needs revisiting before any further phase proceeds, which is precisely why that phase is scoped as small and early as it is.
