# Task 3.4 — Moyasar Webhook Compatibility Remediation Report

**Code changes only. No deploy, no database migration, no Production/Staging change, no Moyasar configuration, no commit, no push.**

---

# EXECUTIVE SUMMARY

Two of the audit's confirmed, high-confidence defects were fixed: the webhook event idempotency key now uses the officially-documented top-level `payload.id` instead of the payment's `data.id`, and event-type classification now correctly recognizes both `payment_failed` and the official `payment_faild` spelling, plus the four previously-unhandled documented event types (`payment_refunded`, `payment_voided`, `payment_captured`, `payment_verified`) — all mapped to a new, explicit `RECOGNIZED_UNHANDLED` classification rather than falling into `UNKNOWN` or having invented business logic applied to them. **Authentication (HMAC signature verification) was not touched in any way**, per the explicit, non-negotiable instruction — it remains an open investigation item requiring real Moyasar sandbox access, not something this task attempted to guess. 10 new/updated tests were added across 2 files; all 497 local tests pass (487 baseline + 10 new). `sql/order_payment_reference.sql` is confirmed byte-for-byte unchanged (checksummed before and after).

**Final status: `TASK_3_4_REMEDIATION_COMPLETE`** (for the approved scope — items A through E; authentication remains an explicitly out-of-scope, still-open blocker, exactly as instructed).

---

# SOURCE AUDIT REFERENCE

`reports/TASK_3_4_MOYASAR_COMPATIBILITY_AUDIT.md`, re-read in full at the start of this task, checksum-verified unchanged from when it was written in the immediately preceding turn (`7aac55fa20923fea9badee1d90eb4eba`). Its 5 confirmed findings map to this task's disposition:

| Audit finding | Disposition this task |
|---|---|
| 1. Idempotency key uses `data.id` instead of documented `payload.id` | **FIXED** |
| 2. `payment_failed` vs. official `payment_faild` | **FIXED** (both now accepted) |
| 3. Missing event types (`payment_refunded`, `payment_voided`, `payment_captured`, `payment_verified`) | **FIXED** — now explicitly recognized (not silently `UNKNOWN`), with no invented business logic |
| 4. Authentication mechanism unconfirmed | **NOT TOUCHED** — remains an open blocker requiring real Moyasar verification, per explicit instruction |
| 5. Moyasar sandbox unavailable | **UNCHANGED** — outside this task's scope entirely |

---

# CHANGES IMPLEMENTED

- **A. Event idempotency key fix** — done.
- **B. Documented event type compatibility** — done (`payment_faild` alias + 4 new recognized-but-unhandled types).
- **C. Tests for corrected behavior** — done (10 new/updated tests).
- **D. Defensive handling where clearly safe** — done: rejecting a webhook payload with no top-level `id` (400, no DB write) instead of fabricating an identity; skipping a status-transition guess for recognized-but-unhandled event types when no explicit `data.status` is present.
- **E. Documentation/comments** — done: every changed block is annotated `TASK-PAY-3.4-REMEDIATION` with a one-line rationale, in both Arabic (matching the file's existing convention) and reflected here in English.

---

# EVENT ID FIX

**Before**: `eventId: data.id ?? \`unknown_${Date.now()}\`` — used the payment's own ID as the webhook event's idempotency key, with a fabricated fallback identity when even that was missing.

**After** (`src/payments/adapters/moyasar.js`): `eventId: payload?.id` — uses the officially-documented top-level "Event's unique ID" field. No fallback fabrication.

**Handler-side guard** (`supabase/functions/payment-webhook/handler.js`): immediately after `adapter.parseWebhook(...)` runs, `if (!event.eventId) return json({ error: 'Missing webhook event ID' }, 400)` — added **before** any database interaction, so a payload missing the event ID is rejected cleanly (`400`, zero DB calls) rather than either crashing on a `NOT NULL` violation or silently proceeding with an ambiguous key.

`providerRef` (the payment reference) still correctly comes from `data.id`, unchanged — the two concepts are now genuinely decoupled, proven by a new test asserting they hold different values (`evt_abc` vs. `pay_abc`) for the same webhook.

**No new database migration was needed or created** — `payment_webhook_events.event_id` is already `text`, and the value it now receives (`payload.id`, a Moyasar-assigned string) is structurally the same kind of value it received before (`data.id`, also a Moyasar-assigned string) — only *which* field supplies it changed.

---

# EVENT TYPE FIX

**3.1 — `payment_faild` alias**: `KNOWN_WEBHOOK_TYPES` now includes both `'payment_failed'` and `'payment_faild'`; the `switch` statement's `case 'payment_failed':` falls through to a new `case 'payment_faild':`, both resolving to `WebhookEventType.PAYMENT_FAILED`. Neither spelling was removed — both are now accepted, exactly as instructed.

**3.2 — Recognized-but-unhandled types**: a new enum value `WebhookEventType.RECOGNIZED_UNHANDLED = 'recognized_unhandled'` was added (`src/payments/types/index.js`), distinct from `UNKNOWN`. `payment_refunded`, `payment_voided`, `payment_captured`, and `payment_verified` are now added to `KNOWN_WEBHOOK_TYPES` and explicitly mapped to this new classification — **no status-transition business logic was invented for any of them.** In `handler.js`, a new guard intercepts this classification **before** the status-guessing fallback (`_eventTypeToStatus`, whose `default:` case returns `FAILED` — which would have been actively wrong for e.g. a `payment_captured` event): if no explicit `data.status` accompanies a `recognized_unhandled` event, the webhook is recorded and marked processed (so Moyasar doesn't keep retrying it), but `payment_transactions.status` is **left untouched**, and the response reports `reason: 'recognized_unhandled_event_type'`. If Moyasar *does* supply an explicit `data.status` for one of these events, that status is trusted and applied exactly as it already was for every other event type (no special-casing needed there — verified by a dedicated new test).

**3.3 — `payment_authorized` and `payment_expired`**: **not modified in any way** — confirmed by `git diff`, both `case` blocks are unchanged, outside the diff entirely.

---

# AUTHENTICATION STATUS (UNCHANGED)

Explicitly confirmed, per your instruction:

- **HMAC verification logic**: unchanged — `verifyHmacSha256()`, `signHmacSha256()`, and the `crypto.subtle` calls inside them are byte-for-byte identical to before this task (outside the diff entirely).
- **Signature header**: unchanged — `SIG_HEADER = 'x-moyasar-signature'` untouched.
- **No `secret_token` comparison was added** — the payload's `secret_token` field (documented by Moyasar, per the audit) is still never read anywhere in the codebase.
- **The authentication mechanism remains unresolved and explicitly requires real Moyasar sandbox verification** before any change to it should be made — this task did not guess, did not weaken, and did not replace the existing HMAC check.

---

# FILES CHANGED

| File | Change |
|---|---|
| `src/payments/types/index.js` | +3 lines — new `RECOGNIZED_UNHANDLED` enum value |
| `src/payments/adapters/moyasar.js` | +20/−1 — `payment_faild` alias, 4 new recognized types, `eventId` now from `payload.id` |
| `supabase/functions/payment-webhook/handler.js` | +19 — reject-missing-eventId guard, recognized-unhandled-skip guard |
| `tests/unit/MoyasarAdapter.test.js` | +57/−7 — updated/new tests for eventId source, `payment_faild`, recognized-unhandled types, genuinely-unknown-stays-unknown |
| `tests/unit/paymentWebhook.test.js` | +95 — `SAMPLE_PAYLOAD` now includes a top-level `id`; two new `describe` blocks (WEBHOOK-015, WEBHOOK-016) |

**Not changed**: `supabase/functions/payment-webhook/index.ts` (not in the diff at all — confirmed via `git status`), `sql/order_payment_reference.sql` (checksum-verified identical before and after: `62b9dfec8945c7585c5476ef3a3cdf02`).

---

# TESTS

New/updated test cases, this session:

- `UT-MAD-005` updated: `eventId` now asserted to come from top-level `payload.id`, distinct from `providerRef` (`data.id`).
- New: missing `payload.id` → `eventId` is `undefined`, not a fabricated value; `providerRef` still resolves independently.
- `UT-MAD-006` extended: new case for `payment_faild` (official spelling) mapping to `PAYMENT_FAILED`, alongside the existing `payment_failed` case.
- New `UT-MAD-006c` (`it.each`): all 4 newly-recognized types (`payment_refunded`, `payment_voided`, `payment_captured`, `payment_verified`) map to `RECOGNIZED_UNHANDLED`, explicitly asserted `!== UNKNOWN`.
- `UT-MAD-007` extended: new case confirming a genuinely unknown type still resolves to `UNKNOWN`, explicitly asserted `!== RECOGNIZED_UNHANDLED` — proving the two classifications stay distinct.
- New `WEBHOOK-015`: adapter returning no `eventId` → handler returns `400`, `db.from` never called.
- New `WEBHOOK-016` (2 cases): a `recognized_unhandled` event with no `data.status` → webhook recorded, `payment_transactions` untouched, `reason: 'recognized_unhandled_event_type'`; the same event type *with* an explicit `data.status` → status applied normally, proving the fallback-skip only engages when genuinely needed.

---

# TEST RESULTS

```
$ npx vitest run tests/unit/paymentWebhook.test.js tests/unit/MoyasarAdapter.test.js
 Test Files  2 passed (2)
      Tests  46 passed (46)
```

Both files, all tests, actually executed — not assumed.

---

# REGRESSION

```
$ npm test -- --run
 Test Files  36 passed (36)
      Tests  497 passed (497)
```

(One earlier run in this session failed with a Vitest tooling-level error — `Projects "" and "" have different 'maxWorkers'...` — unrelated to any file this task touched; a bare retry succeeded cleanly, confirming it was transient, not a regression. Reported honestly rather than omitted.)

**497 = 487 baseline + 10 new tests added this task.** Zero pre-existing test was broken or removed.

---

# SECURITY REVIEW

- **No weakening of signature verification**: confirmed via diff review — zero lines inside `verifyHmacSha256`/`signHmacSha256` or the signature-check block in `handleRequest` were touched.
- **No new unchecked database writes**: the one new write path (marking a `recognized_unhandled` webhook event as processed) uses the exact same `payment_webhook_events` update pattern already used by three other existing branches (`no_provider_ref`, `transaction_not_found`, `already_terminal`) — same table, same columns, same guard structure.
- **No removal of duplicate protection**: the `23505`/`already_processed` unique-violation handling is completely unchanged and still runs before any of the new logic.
- **No hardcoded secret introduced**: none of the new code references any secret material.
- **No accidental modification of `sql/order_payment_reference.sql`**: checksum-verified identical.

---

# COMPATIBILITY IMPACT

If Moyasar's real webhook delivery matches the official reference documentation (still unconfirmed for the auth layer, but now confirmed-by-design for everything else fixed here):

- A payment that generates two distinct events sharing the same `data.id` (e.g., authorized then later paid) will now be correctly recorded as **two separate events**, instead of the second being silently dropped as a false duplicate.
- Failed-payment events will be correctly classified as `PAYMENT_FAILED` regardless of which spelling (`payment_failed` or the documented `payment_faild`) Moyasar actually sends.
- Refund/void/capture/verify events will be safely recorded (not silently discarded as `UNKNOWN`) without the system inventing an incorrect status transition for business logic that hasn't been designed yet.

**Authentication remains the single largest open risk** — none of the above matters if real webhooks are still rejected at the signature-check stage. This was intentionally left untouched and is the clear next blocker to resolve, via real Moyasar sandbox access (not guessing).

---

# REMAINING ISSUES

- **Authentication mechanism still unconfirmed** — exactly as before this task; requires real sandbox delivery or fuller Moyasar integration documentation.
- **`transaction_not_found` still returns `200`** (no retry safety net for the race-condition case identified in the audit) — not in this task's approved scope, not touched.
- Whether `payment_authorized`'s mapping to `PAYMENT_PENDING` and `payment_expired`'s mapping to `PAYMENT_CANCELLED` are themselves correct per Moyasar's intended semantics remains unconfirmed (the audit didn't flag these as broken, so per Step 3.3 they were left exactly as they were).
- The payment-object `data.status` field's exact real-world values are still not independently confirmed against an official `payment_paid` example (the docs page never showed one) — `mapStatus()` was not touched in this task.

---

# BLOCKERS

**None for the approved scope (A–E) — all completed.** Authentication remains a **known, explicitly out-of-scope blocker** for actual deployment (not a blocker for this task's completion, which was correctly scoped to exclude it).

---

# GIT STATUS

```
$ git status --short
 M src/payments/adapters/moyasar.js
 M src/payments/types/index.js
 M supabase/functions/payment-webhook/handler.js
 M tests/unit/MoyasarAdapter.test.js
 M tests/unit/paymentWebhook.test.js
 (plus the same pre-existing untracked report/sql files from prior sessions, unchanged)

$ git diff --stat
 src/payments/adapters/moyasar.js              | 20 +++++-
 src/payments/types/index.js                   |  3 +
 supabase/functions/payment-webhook/handler.js | 19 ++++++
 tests/unit/MoyasarAdapter.test.js             | 57 ++++++++++++++--
 tests/unit/paymentWebhook.test.js             | 95 +++++++++++++++++++++++++++
 5 files changed, 187 insertions(+), 7 deletions(-)
```

**No commit, no push, no merge.** Branch `phase-3/task-3-4-webhook-edge-function`, HEAD `163ac24`, unchanged (working-tree changes only).

---

# REPORT FILE

`reports/TASK_3_4_MOYASAR_COMPATIBILITY_REMEDIATION_REPORT.md`

# DOWNLOAD COPY

`/sdcard/Download/TASK_3_4_MOYASAR_COMPATIBILITY_REMEDIATION_REPORT.md` (copied and verified after this report was written).

---

## FINAL STATUS

**TASK_3_4_REMEDIATION_COMPLETE**

All approved-scope items (A–E) were implemented, tested, and verified. Authentication was deliberately and completely left untouched, exactly as instructed, and remains documented as the one real blocker to eventual deployment.

---

*Report generated 2026-08-26. Code changes only — 5 files modified, all within approved scope. No deployment, no database write, no Moyasar configuration, no commit, no push, no merge.*
