# Task 3.4 — Moyasar Official Webhook Compatibility Audit

**Read-only audit. No code was modified. No deployment, database write, or Moyasar configuration occurred.**

---

# EXECUTIVE SUMMARY

The current implementation was compared, field-by-field, against the official Moyasar Webhook Reference (fetched live in this session — not recalled from memory or third-party sources). **The result is materially worse than "unverified" — it's now a confirmed set of concrete mismatches**, not just an open question:

1. **Authentication mechanism is architecturally different from what's documented.** SimSim verifies an `x-moyasar-signature` HTTP header via HMAC-SHA256. The official docs describe no such header or HMAC scheme at all — the only documented security field is `secret_token`, delivered **inside the JSON body itself**, which SimSim's code never reads. If Moyasar doesn't actually send an `x-moyasar-signature` header (which the docs give no indication it does), **every real webhook would be rejected with 401**, and — per Moyasar's own documented retry policy — would be retried 5 times over ~4 hours and then permanently dropped.
2. **A confirmed, concrete idempotency-key defect**: the official docs show the webhook object has its own top-level `id` ("Event's unique ID"), separate from `data.id` (the payment/card-auth object's ID). SimSim's code uses `data.id` — the **payment's** ID — as the webhook's idempotency key. Since one payment can legitimately generate multiple distinct events (e.g., `payment_authorized` then later `payment_paid`, both carrying the same `data.id`), the second real, distinct event would collide with the first under SimSim's unique constraint and be **silently discarded as a duplicate**.
3. **Event-type string mismatch**: official docs list `payment_faild` (a documented typo — "faild", not "failed"); SimSim's code checks for the correctly-spelled `payment_failed`, which would never match if Moyasar's API actually sends the documented typo'd string.
4. SimSim handles `payment_expired`, which does **not** appear anywhere in the official event list, and does **not** handle four documented event types (`payment_refunded`, `payment_voided`, `payment_captured`, `payment_verified`) or the two `card_auth_*` events at all.

All 22 webhook unit tests and the full 487-test suite still pass — **this is expected and does not contradict the findings above**: the tests validate the code's internal self-consistency (mocked signatures, mocked payloads shaped exactly how the code itself expects them), not compatibility with Moyasar's real, external behavior.

**Final verdict: `MOYASAR_COMPATIBILITY_ISSUES_FOUND`**

---

# OFFICIAL SOURCE

`https://docs.moyasar.com/api/other/webhooks/webhook-reference` — fetched live in this session, twice, with distinct extraction prompts, to independently cross-check authentication details and payload structure. Not sourced from blogs, GitHub discussions, or memory. Quoted directly below where possible.

**A material limitation of this source, stated plainly**: this specific page does not document an HMAC/signature-header mechanism at all (positive or negative — it's simply silent on it), and does not provide a full example payload for a `payment_paid` event (only for `card_auth_authenticated`). Several conclusions below are therefore marked `NOT CONFIRMED BY OFFICIAL DOCUMENTATION` rather than asserted as fact, per your explicit instruction not to invent a conclusion where the source doesn't support one.

---

# CURRENT SIMSIM IMPLEMENTATION

Re-read in full this session (all 5 files named in your instructions):

| File | Role |
|---|---|
| `supabase/functions/payment-webhook/index.ts` | Deno entry point — env vars, client construction |
| `supabase/functions/payment-webhook/handler.js` | HTTP handling, signature check, event dispatch |
| `src/payments/adapters/moyasar.js` | `parseWebhook()` — event-type mapping, data extraction |
| `src/payments/types/index.js` | `WebhookEventType`/`TransactionStatus` enums |
| `tests/unit/paymentWebhook.test.js` | 22 unit tests, all against mocked/self-consistent data |

Extracted mechanics:
- **Auth method**: `x-moyasar-signature` HTTP header, HMAC-SHA256, hex-encoded, verified via `crypto.subtle.verify` against the **raw** request body.
- **Secret handling**: `PAYMENT_MOYASAR_WEBHOOK_SECRET` env var, used only as the HMAC key — `secret_token` (a payload field) is **never referenced anywhere** in the codebase (confirmed via `grep -rn "secret_token" src/ supabase/` → zero matches).
- **Payload parsing**: `payload?.type`, `payload?.data ?? {}` — both read as top-level fields.
- **Event type mapping**: `KNOWN_WEBHOOK_TYPES = {'payment_paid', 'payment_failed', 'payment_authorized', 'payment_expired'}`, switch-mapped to `WebhookEventType.{PAYMENT_SUCCEEDED, PAYMENT_FAILED, PAYMENT_PENDING, PAYMENT_CANCELLED}`; anything else → `UNKNOWN`.
- **Event ID extraction**: `eventId: data.id ?? \`unknown_${Date.now()}\`` — **uses the payment object's `id`, not a top-level event ID.**
- **Payment reference extraction**: `providerRef: data.id` — same field reused as the payment reference.
- **Status mapping**: `status: data.status ? this.mapStatus(data.status) : undefined` — `mapStatus()` maps Moyasar payment-object statuses (`initiated/authorized/paid/failed/refunded`) to internal `TransactionStatus` values.
- **HTTP response behavior**: `200` (OPTIONS/success/duplicate/no-ref/not-found/already-terminal), `400` (malformed body/JSON), `401` (missing/invalid signature), `405` (non-POST), `500` (unconfigured secret/internal error).
- **Retry behavior**: no explicit retry logic in SimSim (correct — retries are Moyasar's responsibility); SimSim's job is only to return the right status code to influence Moyasar's retry decision.
- **Duplicate handling**: DB `UNIQUE(provider, event_id)` on `payment_webhook_events`, `23505` caught → `already_processed`, `200` returned.

---

# AUTHENTICATION COMPARISON

| Area | SimSim implementation | Official Moyasar docs | Result |
|---|---|---|---|
| Mechanism | HTTP header `x-moyasar-signature`, HMAC-SHA256, hex | **Not documented on this page at all** — no header, no HMAC, no algorithm named | **NOT CONFIRMED BY OFFICIAL DOCUMENTATION** |
| Security field actually documented | Not used by SimSim at all | `secret_token` — a field **inside the JSON body**, "assigned by the consumer to secure the webhook" | **MISMATCH** — SimSim implements a mechanism the docs don't describe, and ignores the one the docs do describe |
| Validation method for `secret_token` | N/A (unused) | Not explained by the docs (no comparison method, no header, no query param mentioned) | **NOT DOCUMENTED** |
| Practical consequence if Moyasar sends no `x-moyasar-signature` header | Every real webhook → `401 Missing webhook signature` | — | **HIGH RISK, NOT CONFIRMED EITHER WAY** — cannot be resolved without either better Moyasar documentation (e.g., their dashboard/integration guide, not just this reference page) or actual sandbox delivery |

**This cannot be marked VERIFIED or definitively MISMATCH-and-broken** — the honest state is that SimSim's mechanism is **unconfirmed** by this official source, and the source instead documents a **different, unimplemented** mechanism (`secret_token`). Per your instruction, this is reported as `NOT CONFIRMED BY OFFICIAL DOCUMENTATION` for the HMAC question specifically, while the `secret_token` gap is reported as a confirmed implementation gap (the docs clearly say this field exists and is meant to secure the webhook; SimSim clearly never reads it).

---

# SECRET TOKEN COMPARISON

- Official docs: `secret_token` is a top-level field in every webhook payload, described as assigned by the consumer (i.e., configured on Moyasar's side to match what SimSim expects) to secure the webhook.
- SimSim: `PAYMENT_MOYASAR_WEBHOOK_SECRET` exists as an env var but is used exclusively as an **HMAC key**, never compared against a payload field.
- **Conceptual compatibility**: **Not directly compatible as currently implemented.** If Moyasar's actual security model is "compare the `secret_token` field in the payload to a value you configured," then `PAYMENT_MOYASAR_WEBHOOK_SECRET` *could* still serve as that configured value — but the **comparison logic itself does not exist in the code**. SimSim would need a code change (not made in this audit) to read `payload.secret_token` and compare it, if this turns out to be the real mechanism.

---

# EVENT TYPE COMPARISON

| Event | SimSim handles? | Official docs list it? | Result |
|---|---|---|---|
| `payment_paid` | Yes → `PAYMENT_SUCCEEDED` | Yes | **MATCH** |
| `payment_failed` (SimSim's spelling) | Yes → `PAYMENT_FAILED` | **Not found** — docs list `payment_faild` (documented typo) | **MISMATCH** |
| `payment_faild` (official spelling) | **Not handled** — falls to `UNKNOWN` | Yes | **MISMATCH** (same issue, other direction) |
| `payment_refunded` | **Not handled** | Yes | **MISSING** |
| `payment_voided` | **Not handled** | Yes | **MISSING** |
| `payment_authorized` | Yes → `PAYMENT_PENDING` | Yes | **MATCH** (name matches; semantic mapping to "pending" is a SimSim design choice, not verified against docs either way — docs don't state what internal status "authorized" should imply) |
| `payment_captured` | **Not handled** | Yes | **MISSING** |
| `payment_verified` | **Not handled** | Yes | **MISSING** |
| `payment_expired` | Yes → `PAYMENT_CANCELLED` | **Not found in official list** | **NOT DOCUMENTED** — SimSim handles an event type the official reference doesn't mention at all |
| `card_auth_authenticated` | Not handled | Yes | **MISSING** (likely acceptable — SimSim doesn't appear to use card-auth-only flows, but not independently confirmed as intentionally out of scope) |
| `card_auth_failed` | Not handled | Yes | **MISSING** (same caveat) |

**Per your instruction, no support was added for any missing type — differences only, reported above.**

---

# PAYLOAD COMPARISON

| Field | SimSim expects it at... | Official docs say it's at... | Result |
|---|---|---|---|
| `type` | top-level (`payload.type`) | top-level | **MATCH** |
| `data` | top-level (`payload.data`) | top-level | **MATCH** |
| Payment ID (used as both `providerRef` and `eventId`) | `data.id` | Payment object's own `id` is inside `data` — **but the webhook object also has its own separate top-level `id` ("Event's unique ID"), which SimSim never reads** | **MISMATCH** (see EXECUTIVE SUMMARY #2 — this is the idempotency-key defect) |
| Status | `data.status` | Card-auth example shows a `status` field inside `data`; no `payment_paid`-specific example was available on this page to confirm the field name/values for payment objects specifically | **PLAUSIBLE, NOT INDEPENDENTLY VERIFIED** for the payment-object case specifically (only the card-auth shape was documented with an example) |
| Amount | Not read by SimSim's `parseWebhook` at all (amount comes from SimSim's own `payment_transactions.amount`, set at charge-creation time, not from the webhook) | Present in `data` (shown in the card-auth example) | **N/A** — SimSim intentionally doesn't trust webhook-supplied amounts, which is a reasonable security posture regardless of the exact field name |
| `id` (top-level, event ID) | **Never read** | "Event's unique ID" | **MISMATCH** — see idempotency defect |
| `created_at`, `secret_token`, `account_name`, `live` | Never read | All documented top-level fields | Unused by SimSim — harmless except for `secret_token` (see SECRET TOKEN COMPARISON) |

---

# RETRY COMPARISON

Official docs (quoted): *"Your endpoint must quickly return a successful status code (2xx)... If the webhook recipient does not return a `2xx` HTTP code we will retry to send the webhook 5 more times and then drop the message."* Documented backoff: immediate, then +1min, +10min, +30min, +1hr, +2hr, then dropped (6 attempts total, ~3h41m window).

| SimSim response | When | Triggers Moyasar retry? | Assessment |
|---|---|---|---|
| `200` | Success, duplicate/`already_processed`, `no_provider_ref`, `transaction_not_found`, `already_terminal` | No | Correct for success/duplicate/terminal cases. **Questionable for `transaction_not_found`**: if a webhook legitimately arrives before SimSim's own `payment_transactions` row exists yet (a plausible race — e.g., webhook delivered faster than the charge-creation flow completes), returning `200` here means Moyasar will **never retry**, and that status update is **permanently lost** with no automatic recovery path. This is a real design risk surfaced by comparing against the documented retry semantics, not a certainty — it may be an intentional choice to avoid retry storms for genuinely-unmatched transactions, but it removes the safety net the retry mechanism would otherwise provide for a timing race. |
| `400` | Malformed body/JSON | Yes (5 retries, ~4h, then dropped) | Appropriate — Moyasar would presumably resend the same well-formed payload, so a real malformed-body case is unlikely to be transient and retries would waste the window; low practical impact either way. |
| `401` | Missing/invalid signature | Yes (5 retries, ~4h, then dropped) | **If the signature mechanism itself is wrong (see AUTHENTICATION COMPARISON), every single delivery attempt — all 6 — would fail identically**, since the cause (header format mismatch) wouldn't change between retries. Moyasar would exhaust its retry budget and drop the event permanently, with SimSim never recording anything. |
| `500` | Unconfigured secret / internal error | Yes (5 retries, ~4h, then dropped) | Appropriate for genuinely transient internal errors; for "unconfigured secret" specifically this is a permanent misconfiguration, so retries would be wasted but harmless (eventually dropped, matching what should happen for a config error that needs human intervention anyway). |
| `405` | Non-POST | Yes | Not a real-world concern — Moyasar always sends POST per its own documented model. |

---

# RESPONSE CODE COMPARISON

Already covered in full under RETRY COMPARISON above — every code SimSim can return was evaluated against Moyasar's documented "2xx = stop, non-2xx = retry up to 5 times" rule. No response code is used in a way that outright contradicts the documented policy; the concerns raised are about *consequences* of the two confirmed defects (auth mismatch → 401 storm; `transaction_not_found` → silently-unretried `200`), not about the response-code logic being wrong in isolation.

---

# DATABASE IMPACT

No database write occurred in this audit (confirmed — this session made no `execute_sql`/`apply_migration` calls at all, only `WebhookFetch` and local file/test operations). Assessing impact **in principle**, based on the confirmed code-level findings:

- The idempotency-key defect (using `data.id` instead of a true event ID) would not corrupt existing data — its effect is *silent event loss* (a legitimate second event for the same payment gets treated as an already-processed duplicate and dropped), not incorrect data being written. `payment_transactions.status` could end up stuck at an earlier state (e.g., `pending` from `payment_authorized`) and never advance to `succeeded` (from a later `payment_paid` event for the same payment), because the second event's insert into `payment_webhook_events` would hit the `23505` unique-violation path and return early without ever reaching the `payment_transactions` update.
- No impact on `orders` (already established in the prior Production Readiness audit — the webhook doesn't touch `orders` at all).

---

# SECURITY

- **No hardcoded secrets**: confirmed (re-checked this session — all secret material comes from `Deno.env.get(...)`, none inline).
- **No secret logging**: confirmed (only 2 `console.error` call sites, neither includes `webhookSecret`/`SERVICE_ROLE_KEY`/payload content beyond a short error message).
- **No PII logging**: confirmed — no customer/payment field is ever passed to `console.*`.
- **Webhook remains intentionally public**: unchanged — no Supabase Auth/JWT check in the function code, as appropriate for an externally-called webhook.
- **`verify_jwt` deployment requirement**: still documented (from the prior Production Readiness audit) — must be explicitly set `false` at deploy time or Supabase's platform-level JWT gate would reject Moyasar's calls before the function code runs at all. Unchanged, still applicable, still unexecuted (no deploy occurred).
- **No Production writes**: confirmed — this session's only Production-adjacent action was reading official Moyasar documentation via `WebFetch`, which touches Moyasar's public docs site, not SimSim's Production database or Supabase project at all.

---

# TEST RESULTS

```
$ npx vitest run tests/unit/paymentWebhook.test.js
 Test Files  1 passed (1)
      Tests  22 passed (22)

$ npm test -- --run
 Test Files  36 passed (36)
      Tests  487 passed (487)
```

Both re-run fresh this session, both unchanged (no test file was modified, per instruction). **Important interpretive note**: these results do **not** contradict the compatibility findings above. The test suite mocks its own signature generation (`signHmacSha256`) and its own event payloads (using SimSim's own field names, like `data.id` for both event and payment ID) — it proves the code is internally consistent with *its own assumptions*, not that those assumptions match Moyasar's real behavior. A passing test suite was never capable of catching either of the two confirmed defects, because both defects are about a mismatch between SimSim's assumptions and an *external* system's actual behavior, which mocked tests cannot detect by construction.

---

# COMPATIBILITY MATRIX

| Area | SimSim implementation | Official Moyasar | Result | Risk |
|---|---|---|---|---|
| Authentication mechanism | `x-moyasar-signature` header + HMAC-SHA256 | Not documented on this page; only `secret_token` payload field is described | **NOT CONFIRMED BY OFFICIAL DOCUMENTATION** | **HIGH** — could reject 100% of real deliveries |
| `secret_token` field usage | Never read | Documented as the security mechanism | **MISMATCH** | **HIGH** (same root cause as above) |
| Event ID / idempotency key | Uses `data.id` (payment ID) | Top-level `id` is the documented "Event's unique ID", separate from `data.id` | **MISMATCH** | **HIGH** — confirmed silent-event-loss defect |
| `payment_paid` | Handled, mapped correctly | Documented, matches | **MATCH** | — |
| `payment_failed` vs `payment_faild` | SimSim uses `payment_failed` | Docs use `payment_faild` (typo) | **MISMATCH** | **MEDIUM** — status may fall back correctly via `data.status`, but `event.type` classification would be wrong |
| `payment_authorized` | Handled → `PENDING` | Documented, name matches | **MATCH** (name); semantic mapping unverified | LOW |
| `payment_expired` | Handled → `CANCELLED` | **Not in official list** | **NOT DOCUMENTED** | LOW–MEDIUM (dead code at worst, wrong mapping at worst) |
| `payment_refunded`, `payment_voided`, `payment_captured`, `payment_verified` | Not handled | Documented | **MISSING** | MEDIUM — these events would silently become `UNKNOWN` |
| `card_auth_*` events | Not handled | Documented | **MISSING** | LOW (likely out of current scope, not confirmed) |
| Payload `type`/`data` top-level shape | Matches | Matches | **MATCH** | — |
| Response codes vs retry policy | Mostly aligned | 2xx=stop, else retry×5 over ~4h | **MATCH**, with one design concern (`transaction_not_found` → `200`, no retry safety net) | LOW–MEDIUM |
| Test coverage | 487/487, 22/22 webhook-specific | N/A | **PASS**, but tests don't validate external compatibility | — (informational) |

---

# ISSUES

**I-1 (HIGH): Authentication mechanism unconfirmed against official docs, and docs describe a different mechanism entirely (`secret_token` field, unused by SimSim).** Deploying without resolving this risks total webhook failure.

**I-2 (HIGH, newly discovered this audit): Idempotency key uses the payment's ID (`data.id`) instead of the webhook event's own documented top-level `id`.** Confirmed via direct code read + official field-reference table. Real risk: a second, legitimate, distinct webhook event for the same payment (e.g., authorization followed later by capture/paid) can be silently dropped as a duplicate, leaving `payment_transactions.status` stuck at a stale value.

**I-3 (MEDIUM): `payment_failed` vs. official `payment_faild` spelling mismatch.** If Moyasar's real API uses the documented (typo'd) spelling, SimSim's event-type classification for this event would silently become `UNKNOWN` — though the status may still update correctly via the separate `data.status` fallback path, which itself isn't independently confirmed for payment objects.

**I-4 (MEDIUM): Four documented event types are entirely unhandled** (`payment_refunded`, `payment_voided`, `payment_captured`, `payment_verified`) — each would classify as `UNKNOWN` today.

---

# WARNINGS

- **W-1**: `payment_expired` is handled by SimSim but does not appear in the official event list fetched this session — possibly outdated, possibly just missing from this specific doc page. Not confirmed either way.
- **W-2**: `transaction_not_found` returns `200`, removing Moyasar's retry safety net for a plausible race condition (webhook arriving before the local transaction row exists).
- **W-3**: The payment-object `data.status` field's exact values were not independently confirmed against an official example on this specific page (only the card-auth object's shape was shown) — `mapStatus()`'s assumed values (`initiated/authorized/paid/failed/refunded`) are plausible (they match common Moyasar Payment API knowledge) but not verified against this reference page.
- **W-4** (carried forward, unrelated to this audit): Moyasar sandbox credentials still don't exist; staging's open RLS policies remain a separate, unresolved item.

---

# REMEDIATION PLAN

**Presented as a plan only — nothing in this list was implemented, per your explicit instruction.**

1. Obtain a real Moyasar sandbox account and send one real test webhook to a temporary/logging endpoint (or consult Moyasar's fuller integration guide, if one exists beyond this reference page) to definitively confirm: (a) whether an `x-moyasar-signature`-equivalent header is actually sent, and if so its exact name/algorithm, or (b) whether `secret_token`-in-body is genuinely the only mechanism and how it's meant to be compared.
2. Once confirmed, adjust the authentication check accordingly — either fix the header/algorithm name, or replace the HMAC check with a `secret_token` field comparison (or implement both, if Moyasar's real behavior includes a header in addition to what's shown on this page).
3. Change the idempotency key from `data.id` to the webhook's own top-level `id` field (`payload.id`), and correspondingly change `payment_webhook_events.event_id` to store the event ID rather than the payment ID — this is the highest-confidence, most independently-verified fix in this list.
4. Verify against a real sandbox payload whether Moyasar sends `payment_failed` or `payment_faild`, and correct `KNOWN_WEBHOOK_TYPES`/the switch statement accordingly (possibly supporting both spellings defensively, if uncertainty remains even after sandbox testing).
5. Decide whether to add handling for `payment_refunded`, `payment_voided`, `payment_captured`, `payment_verified` (and the two `card_auth_*` events) based on SimSim's actual product scope — not all of these may be relevant (e.g., refund/void handling may belong to a later phase).
6. Reassess whether `transaction_not_found` should return a non-2xx (to preserve Moyasar's retry safety net for the race-condition case) versus the current `200` — a deliberate design decision, not an obvious bug fix.
7. Re-run the full test suite after any change, and add new unit tests covering the corrected idempotency-key field and the corrected event-type spelling before considering this closed.

**None of the above was executed in this task.**

---

# DEPLOYMENT IMPACT

Given I-1 and I-2 specifically, deploying the webhook **as currently written** carries a real risk of either (a) rejecting all real Moyasar deliveries outright (if the auth mechanism is wrong), or (b) silently losing legitimate status-transition events for payments with multiple webhook deliveries (the idempotency-key defect) — the second risk exists **even if the auth mechanism turns out to be correct**. **Recommendation implied by the evidence, not a decision made here**: resolving remediation items 1–3 before any deployment would materially reduce the chance of a broken or silently-lossy first production webhook integration.

---

# GIT STATUS

```
Branch: phase-3/task-3-4-webhook-edge-function (unchanged)
HEAD:   163ac24 (unchanged — no commit made)
Modified tracked files: none
New untracked file from this task: reports/TASK_3_4_MOYASAR_COMPATIBILITY_AUDIT.md
```

No commit, push, deploy, or merge was performed. No code file was modified.

---

# REPORT FILE

`reports/TASK_3_4_MOYASAR_COMPATIBILITY_AUDIT.md`

# DOWNLOAD COPY

`/sdcard/Download/TASK_3_4_MOYASAR_COMPATIBILITY_AUDIT.md` (copied and verified after this report was written — see final summary).

---

## FINAL VERDICT

**MOYASAR_COMPATIBILITY_ISSUES_FOUND**

Per your explicit rule, `MOYASAR_COMPATIBLE` cannot be used while the authentication/signature mechanism remains unverified — and beyond that unresolved question, this audit additionally surfaced a **confirmed** (not merely suspected) idempotency-key defect and a **confirmed** event-type spelling mismatch, both independently verified against the official reference page's own field table and event list, not assumed. This is a stronger finding than "insufficient documentation" — real, concrete code-vs-docs mismatches were identified.

---

*Report generated 2026-08-26. Read-only audit. No code was modified, no deployment occurred, no database was written to, no Moyasar configuration was touched, and no commit/push/merge was performed. Official documentation was fetched live from docs.moyasar.com in this session, not sourced from memory or third-party references.*
