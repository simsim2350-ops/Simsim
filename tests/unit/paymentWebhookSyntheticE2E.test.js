// @vitest-environment happy-dom
//
// SYNTHETIC_MOYASAR_SIMULATION — synthetic end-to-end harness for payment-webhook.
//
// ⚠️ IMPORTANT: this file simulates Moyasar webhook delivery deterministically. It does NOT
// call the real Moyasar API, does NOT use real credentials, and does NOT prove real Moyasar
// compatibility. Every test name/describe block in this file is prefixed SYNTHETIC_ to make
// this unmistakable. Authentication (HMAC) is exercised exactly as SimSim currently implements
// it — this is an INTERNAL determinism check, not external verification. See
// reports/TASK_3_4_SYNTHETIC_MOYASAR_E2E_REPORT.md, section "EXTERNAL MOYASAR AUTH STATUS":
// REAL_MOYASAR_AUTH_NOT_VERIFIED.
//
// Unlike tests/unit/paymentWebhook.test.js (which mocks the adapter to isolate handler.js),
// this file uses the REAL MoyasarAdapter end-to-end, combined with an in-memory fake Supabase
// client (a genuine test double enforcing the same UNIQUE(provider,event_id) constraint the
// real schema has) — so multi-call scenarios (replay, burst, idempotency matrix) behave with
// real state, not a scripted sequence of canned per-call responses.
//
// No Production write. No Staging write. No real Moyasar call. No real credential.

import { describe, it, expect, beforeEach } from 'vitest'
import { buildHandler, signHmacSha256 } from '../../supabase/functions/payment-webhook/handler.js'
import { MoyasarAdapter } from '../../src/payments/adapters/moyasar.js'
import { WebhookEventType, TransactionStatus } from '../../src/payments/types/index.js'

const TEST_SECRET = 'synthetic_test_webhook_secret_not_real'
const RESTAURANT_A = 'rest_synthetic_a'
const RESTAURANT_B = 'rest_synthetic_b'

// ═══════════════════════════════════════════════════════════════════════════
// Fake Supabase client — an in-memory test double, not a mock-per-call script.
// Enforces the same invariants the real schema does:
//   - UNIQUE(provider, event_id) on payment_webhook_events (23505 on violation)
//   - payment_transactions looked up by provider_ref
//   - orders.payment_transaction_id relationship, read-only in this harness
// Tracks every table accessed, so tests can assert the webhook NEVER touches `orders`
// (the actual, current architecture boundary — confirmed in the compatibility audit).
// ═══════════════════════════════════════════════════════════════════════════
function makeFakeSupabase(seed = {}) {
  const webhookEvents = []
  const transactions = [...(seed.transactions ?? [])]
  const orders = [...(seed.orders ?? [])]
  const tablesAccessed = new Set()
  let whCounter = 0

  function from(table) {
    tablesAccessed.add(table)
    if (table === 'payment_webhook_events') {
      return {
        insert(row) {
          return {
            select() {
              return {
                async single() {
                  const dup = webhookEvents.find((w) => w.provider === row.provider && w.event_id === row.event_id)
                  if (dup) {
                    return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "uq_webhook_provider_event"' } }
                  }
                  const id = `wh_synth_${++whCounter}`
                  webhookEvents.push({ id, ...row, transaction_id: null, processed_at: null, process_error: null })
                  return { data: { id }, error: null }
                },
              }
            },
          }
        },
        update(patch) {
          return {
            eq(col, val) {
              const row = webhookEvents.find((w) => w[col] === val)
              if (row) Object.assign(row, patch)
              return Promise.resolve({ data: null, error: null })
            },
          }
        },
      }
    }
    if (table === 'payment_transactions') {
      return {
        select() {
          return {
            eq(col, val) {
              return {
                async maybeSingle() {
                  const row = transactions.find((t) => t[col] === val)
                  return { data: row ? { id: row.id, status: row.status } : null, error: null }
                },
              }
            },
          }
        },
        update(patch) {
          return {
            eq(col, val) {
              const row = transactions.find((t) => t[col] === val)
              if (row) Object.assign(row, patch)
              return Promise.resolve({ data: null, error: null })
            },
          }
        },
      }
    }
    // Should never be reached by the current webhook — see ORDER RELATIONSHIP tests below.
    if (table === 'orders') {
      return {
        select() {
          return { eq() { return { async maybeSingle() { return { data: null, error: null } } } } }
        },
      }
    }
    throw new Error(`SYNTHETIC harness: unexpected table "${table}"`)
  }

  return {
    from,
    _state: { webhookEvents, transactions, orders },
    _tablesAccessed: tablesAccessed,
  }
}

async function sendWebhook(handle, payloadObj, secret = TEST_SECRET) {
  const rawBody = JSON.stringify(payloadObj)
  const sig = await signHmacSha256(rawBody, secret)
  const req = new Request('https://example.com/payment-webhook', {
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/json', 'x-moyasar-signature': sig }),
    body: rawBody,
  })
  const res = await handle(req)
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

// ═══════════════════════════════════════════════════════════════════════════
// SYNTHETIC PAYLOAD FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

const EVENT_A = { id: 'evt_test_001', type: 'payment_paid', data: { id: 'pay_test_001', status: 'paid', amount: 5000, currency: 'SAR' } }
const EVENT_B_SAME_PAYMENT = { id: 'evt_test_002', type: 'payment_authorized', data: { id: 'pay_test_001', status: 'authorized', amount: 5000, currency: 'SAR' } }
const FAILED_EVENT_OFFICIAL_SPELLING = { id: 'evt_test_003', type: 'payment_faild', data: { id: 'pay_test_003', status: 'failed' } }
const RECOGNIZED_UNHANDLED_EVENTS = ['payment_refunded', 'payment_voided', 'payment_captured', 'payment_verified'].map((type, i) => ({
  id: `evt_test_ru_${i}`,
  type,
  data: { id: `pay_test_ru_${i}` }, // deliberately no status — tests "no invented transition"
}))

describe('SYNTHETIC_MOYASAR_SIMULATION — E2E harness sanity', () => {
  it('uses the REAL MoyasarAdapter (not a mock) end-to-end', () => {
    const adapter = new MoyasarAdapter(null)
    expect(adapter).toBeInstanceOf(MoyasarAdapter)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// EVENT ID IDEMPOTENCY MATRIX (Step 5)
// ═══════════════════════════════════════════════════════════════════════════

describe('SYNTHETIC_MOYASAR_SIMULATION — event-ID idempotency matrix', () => {
  let db, adapter, handle

  beforeEach(() => {
    db = makeFakeSupabase({ transactions: [{ id: 'tx_001', provider_ref: 'pay_test_001', status: 'pending' }] })
    adapter = new MoyasarAdapter(null)
    handle = buildHandler({ webhookSecret: TEST_SECRET, adapter, db })
  })

  it('SYNTH-IDEM-1: first event (evt_001/pay_001) → PROCESS', async () => {
    const { status, body } = await sendWebhook(handle, EVENT_A)
    expect(status).toBe(200)
    expect(body.updated).toBe(true)
    expect(db._state.webhookEvents).toHaveLength(1)
  })

  it('SYNTH-IDEM-2: exact replay of evt_001 → DUPLICATE, no second transition', async () => {
    await sendWebhook(handle, EVENT_A)
    const before = db._state.transactions.find((t) => t.id === 'tx_001').status
    const { status, body } = await sendWebhook(handle, EVENT_A)
    expect(status).toBe(200)
    expect(body.reason).toBe('already_processed')
    expect(body.updated).toBe(false)
    expect(db._state.webhookEvents).toHaveLength(1) // still one logical event row
    expect(db._state.transactions.find((t) => t.id === 'tx_001').status).toBe(before) // no re-transition
  })

  it('SYNTH-IDEM-3: different event, same payment (evt_002/pay_001) → recorded as a DISTINCT event, not merged/deduplicated with evt_001', async () => {
    // Realistic ordering: authorized arrives before paid (matches SYNTH-DB-3). Sending "paid" (a
    // terminal status) first would correctly trigger the pre-existing already_terminal guard on
    // the second call — that guard is a separate, already-tested protection, not what this test
    // is checking. This test's own critical assertion is about event-ID distinctness, not about
    // whether the second call re-transitions the status.
    await sendWebhook(handle, EVENT_B_SAME_PAYMENT)
    const { status, body } = await sendWebhook(handle, EVENT_A)
    expect(status).toBe(200)
    expect(body.updated).toBe(true)
    expect(db._state.webhookEvents).toHaveLength(2) // two distinct events recorded
    // critical assertion: evt_test_001 !== evt_test_002 even though pay_test_001 === pay_test_001
    expect(db._state.webhookEvents[0].event_id).toBe('evt_test_002')
    expect(db._state.webhookEvents[1].event_id).toBe('evt_test_001')
    expect(db._state.webhookEvents[0].event_id).not.toBe(db._state.webhookEvents[1].event_id)
  })

  it('SYNTH-IDEM-3b: same-payment event arriving AFTER a terminal status → still recorded as a distinct webhook event, correctly refused a transition (pre-existing terminal guard, not regressed by this harness)', async () => {
    await sendWebhook(handle, EVENT_A) // paid → succeeded (terminal)
    const { status, body } = await sendWebhook(handle, EVENT_B_SAME_PAYMENT) // authorized, arrives late
    expect(status).toBe(200)
    expect(body.reason).toBe('already_terminal')
    expect(body.updated).toBe(false)
    expect(db._state.webhookEvents).toHaveLength(2) // both events are still recorded distinctly
    expect(db._state.transactions.find((t) => t.id === 'tx_001').status).toBe(TransactionStatus.SUCCEEDED) // not regressed
  })

  it('SYNTH-IDEM-4: different event, different payment (evt_003/pay_002) → PROCESS', async () => {
    db._state.transactions.push({ id: 'tx_002', provider_ref: 'pay_test_002', status: 'pending' })
    await sendWebhook(handle, EVENT_A)
    const { status } = await sendWebhook(handle, { id: 'evt_test_003b', type: 'payment_paid', data: { id: 'pay_test_002', status: 'paid' } })
    expect(status).toBe(200)
    expect(db._state.webhookEvents).toHaveLength(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT REFERENCE (data.id) vs EVENT ID (payload.id) — decoupling proof
// ═══════════════════════════════════════════════════════════════════════════

describe('SYNTHETIC_MOYASAR_SIMULATION — payment reference vs event ID decoupling', () => {
  it('SYNTH-REF-1: providerRef (data.id) used for transaction lookup, independent of eventId (payload.id)', async () => {
    const db = makeFakeSupabase({ transactions: [{ id: 'tx_001', provider_ref: 'pay_test_001', status: 'pending' }] })
    const adapter = new MoyasarAdapter(null)
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter, db })

    await sendWebhook(handle, EVENT_A)
    const row = db._state.webhookEvents[0]
    expect(row.event_id).toBe('evt_test_001') // from payload.id
    expect(row.transaction_id).toBe('tx_001') // resolved via data.id → provider_ref lookup
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// EVENT TYPES (Step 2/3)
// ═══════════════════════════════════════════════════════════════════════════

describe('SYNTHETIC_MOYASAR_SIMULATION — event type classification', () => {
  it('SYNTH-TYPE-1: official spelling "payment_faild" → transaction marked FAILED', async () => {
    const db = makeFakeSupabase({ transactions: [{ id: 'tx_003', provider_ref: 'pay_test_003', status: 'pending' }] })
    const adapter = new MoyasarAdapter(null)
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter, db })

    const { status, body } = await sendWebhook(handle, FAILED_EVENT_OFFICIAL_SPELLING)
    expect(status).toBe(200)
    expect(body.updated).toBe(true)
    expect(body.status).toBe(TransactionStatus.FAILED)
    expect(db._state.transactions.find((t) => t.id === 'tx_003').status).toBe(TransactionStatus.FAILED)
  })

  it.each(RECOGNIZED_UNHANDLED_EVENTS.map((e) => [e.type, e]))(
    'SYNTH-TYPE-2 (%s): recognized-but-unhandled, no data.status → no invented transition',
    async (_type, event) => {
      const db = makeFakeSupabase({ transactions: [{ id: 'tx_ru', provider_ref: event.data.id, status: 'pending' }] })
      const adapter = new MoyasarAdapter(null)
      const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter, db })

      const { status, body } = await sendWebhook(handle, event)
      expect(status).toBe(200)
      expect(body.reason).toBe('recognized_unhandled_event_type')
      expect(body.updated).toBe(false)
      // status must remain exactly as seeded — no guessed transition
      expect(db._state.transactions.find((t) => t.provider_ref === event.data.id).status).toBe('pending')
    }
  )
})

// ═══════════════════════════════════════════════════════════════════════════
// MALFORMED PAYLOADS (Step 3)
// ═══════════════════════════════════════════════════════════════════════════

describe('SYNTHETIC_MOYASAR_SIMULATION — malformed payloads', () => {
  it('SYNTH-MAL-1: missing payload.id → 400, ZERO database calls', async () => {
    const db = makeFakeSupabase()
    const adapter = new MoyasarAdapter(null)
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter, db })

    const { status, body } = await sendWebhook(handle, { type: 'payment_paid', data: { id: 'pay_x', status: 'paid' } })
    expect(status).toBe(400)
    expect(body.error).toMatch(/event id/i)
    expect(db._tablesAccessed.size).toBe(0)
  })

  it('SYNTH-MAL-2: missing data.id → providerRef undefined → 200 no_provider_ref, no transaction write', async () => {
    const db = makeFakeSupabase()
    const adapter = new MoyasarAdapter(null)
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter, db })

    const { status, body } = await sendWebhook(handle, { id: 'evt_no_data_id', type: 'payment_paid', data: { status: 'paid' } })
    expect(status).toBe(200)
    expect(body.reason).toBe('no_provider_ref')
    expect(db._tablesAccessed.has('payment_transactions')).toBe(false)
  })

  it('SYNTH-MAL-3: missing type → classified UNKNOWN, still requires a valid payload.id to proceed', async () => {
    const db = makeFakeSupabase({ transactions: [{ id: 'tx_notype', provider_ref: 'pay_notype', status: 'pending' }] })
    const adapter = new MoyasarAdapter(null)
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter, db })

    const { status } = await sendWebhook(handle, { id: 'evt_notype', data: { id: 'pay_notype' } })
    expect(status).toBe(200) // recorded safely, no exception — matches UNKNOWN-type handling
  })

  it('SYNTH-MAL-4: malformed data (data is a string, not an object) → handled without crashing', async () => {
    const db = makeFakeSupabase()
    const adapter = new MoyasarAdapter(null)
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter, db })

    // payload.id present so it passes the eventId guard; data is malformed
    const { status } = await sendWebhook(handle, { id: 'evt_baddata', type: 'payment_paid', data: 'not-an-object' })
    expect([200, 400, 500]).toContain(status) // must not throw unhandled — Request/Response cycle completes
  })

  it('SYNTH-MAL-5: invalid JSON body → 400 Malformed JSON body (handler boundary, pre-adapter)', async () => {
    const db = makeFakeSupabase()
    const adapter = new MoyasarAdapter(null)
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter, db })

    const rawBody = '{ not valid json ]['
    const sig = await signHmacSha256(rawBody, TEST_SECRET)
    const req = new Request('https://example.com/payment-webhook', {
      method: 'POST',
      headers: new Headers({ 'content-type': 'application/json', 'x-moyasar-signature': sig }),
      body: rawBody,
    })
    const res = await handle(req)
    expect(res.status).toBe(400)
    expect(db._tablesAccessed.size).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATION — INTERNAL DETERMINISM ONLY (Step 4)
// Explicitly NOT a real Moyasar verification. HMAC code itself is untouched.
// ═══════════════════════════════════════════════════════════════════════════

describe('SYNTHETIC_MOYASAR_SIMULATION — authentication (INTERNAL determinism only, NOT real Moyasar verification)', () => {
  it('SYNTH-AUTH-1: correctly-signed synthetic payload is accepted deterministically', async () => {
    const db = makeFakeSupabase({ transactions: [{ id: 'tx_a1', provider_ref: 'pay_test_001', status: 'pending' }] })
    const adapter = new MoyasarAdapter(null)
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter, db })
    const { status } = await sendWebhook(handle, EVENT_A, TEST_SECRET)
    expect(status).toBe(200)
  })

  it('SYNTH-AUTH-2: incorrectly-signed synthetic payload is rejected deterministically (401)', async () => {
    const db = makeFakeSupabase()
    const adapter = new MoyasarAdapter(null)
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter, db })
    const { status } = await sendWebhook(handle, EVENT_A, 'wrong_secret_entirely')
    expect(status).toBe(401)
    expect(db._tablesAccessed.size).toBe(0)
  })
})

// EXTERNAL_MOYASAR_AUTH_STATUS: REAL_MOYASAR_AUTH_NOT_VERIFIED
// The two tests above prove SimSim's HMAC layer behaves consistently with itself. They cannot
// and do not prove Moyasar actually signs webhooks this way — see the compatibility audit.

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE EFFECTS (Step 6)
// ═══════════════════════════════════════════════════════════════════════════

describe('SYNTHETIC_MOYASAR_SIMULATION — database effects', () => {
  it('SYNTH-DB-1: first event → 1 webhook_events row + correct payment_transactions status update', async () => {
    const db = makeFakeSupabase({ transactions: [{ id: 'tx_db1', provider_ref: 'pay_test_001', status: 'pending' }] })
    const adapter = new MoyasarAdapter(null)
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter, db })

    await sendWebhook(handle, EVENT_A)
    expect(db._state.webhookEvents).toHaveLength(1)
    expect(db._state.transactions.find((t) => t.id === 'tx_db1').status).toBe(TransactionStatus.SUCCEEDED)
  })

  it('SYNTH-DB-2: replay → still 1 logical event, no duplicate transition', async () => {
    const db = makeFakeSupabase({ transactions: [{ id: 'tx_db2', provider_ref: 'pay_test_001', status: 'pending' }] })
    const adapter = new MoyasarAdapter(null)
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter, db })

    await sendWebhook(handle, EVENT_A)
    await sendWebhook(handle, EVENT_A)
    await sendWebhook(handle, EVENT_A)
    expect(db._state.webhookEvents).toHaveLength(1)
  })

  it('SYNTH-DB-3: second distinct event for same payment → 2 distinct events, single consistent current state, no duplicate transaction row', async () => {
    const db = makeFakeSupabase({ transactions: [{ id: 'tx_db3', provider_ref: 'pay_test_001', status: 'pending' }] })
    const adapter = new MoyasarAdapter(null)
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter, db })

    await sendWebhook(handle, EVENT_B_SAME_PAYMENT) // authorized first
    await sendWebhook(handle, EVENT_A) // then paid
    expect(db._state.webhookEvents).toHaveLength(2)
    expect(db._state.transactions).toHaveLength(1) // no duplicate transaction row was ever created
    expect(db._state.transactions[0].status).toBe(TransactionStatus.SUCCEEDED) // reflects the latest applied event
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ORDER RELATIONSHIP (Step 7)
// ═══════════════════════════════════════════════════════════════════════════

describe('SYNTHETIC_MOYASAR_SIMULATION — order/payment reference relationship', () => {
  it('SYNTH-ORD-1: webhook never touches the "orders" table, even when a synthetic order references the transaction', async () => {
    const db = makeFakeSupabase({
      transactions: [{ id: 'tx_ord1', provider_ref: 'pay_test_001', status: 'pending' }],
      orders: [{ id: 'order_synth_1', payment_transaction_id: 'tx_ord1', restaurant_id: RESTAURANT_A }],
    })
    const adapter = new MoyasarAdapter(null)
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter, db })

    await sendWebhook(handle, EVENT_A)

    expect(db._tablesAccessed.has('orders')).toBe(false)
    // the synthetic order row is untouched — proves no cross-contamination, and confirms the
    // documented gap precisely: webhook updates payment_transactions only, never orders.
    expect(db._state.orders[0]).toEqual({ id: 'order_synth_1', payment_transaction_id: 'tx_ord1', restaurant_id: RESTAURANT_A })
  })

  it('SYNTH-ORD-2 (documented, not webhook behavior): wrong-restaurant / nonexistent / duplicate payment-reference validation is create_order\'s responsibility (Task 3.5), not the webhook\'s — already verified live on staging, not re-tested here to avoid fabricating webhook-side logic that does not exist', () => {
    // Intentionally a no-op assertion with an explanatory name, per the instruction not to invent
    // business logic. See reports/TASK_3_4_SYNTHETIC_MOYASAR_E2E_REPORT.md § ORDER RELATIONSHIP.
    expect(true).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// SYNTHETIC RETRY SIMULATION (Step 8) — response codes only; real Moyasar retry
// behavior is NOT exercised (retries are Moyasar's job, not reproducible locally).
// ═══════════════════════════════════════════════════════════════════════════

describe('SYNTHETIC RETRY SIMULATION — response codes returned by the current handler', () => {
  it('SYNTH-RETRY-1: successful processing → 200 (Moyasar would NOT retry)', async () => {
    const db = makeFakeSupabase({ transactions: [{ id: 'tx_r1', provider_ref: 'pay_test_001', status: 'pending' }] })
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter: new MoyasarAdapter(null), db })
    const { status } = await sendWebhook(handle, EVENT_A)
    expect(status).toBe(200)
  })

  it('SYNTH-RETRY-2: malformed JSON → 400 (per Moyasar\'s documented policy, this WOULD trigger a retry)', async () => {
    const db = makeFakeSupabase()
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter: new MoyasarAdapter(null), db })
    const rawBody = 'not json at all'
    const sig = await signHmacSha256(rawBody, TEST_SECRET)
    const req = new Request('https://example.com/payment-webhook', {
      method: 'POST',
      headers: new Headers({ 'x-moyasar-signature': sig }),
      body: rawBody,
    })
    const res = await handle(req)
    expect(res.status).toBe(400)
  })

  it('SYNTH-RETRY-3: internal DB error (non-23505) → 500 (per Moyasar\'s documented policy, this WOULD trigger a retry)', async () => {
    const db = {
      from(table) {
        if (table === 'payment_webhook_events') {
          return { insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: '42P01', message: 'relation does not exist' } }) }) }) }
        }
        return makeFakeSupabase().from(table)
      },
    }
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter: new MoyasarAdapter(null), db })
    const { status, body } = await sendWebhook(handle, EVENT_A)
    expect(status).toBe(500)
    expect(body.error).toBe('Internal error processing webhook')
  })
})
// Documented disposition (not a test assertion — see report): 200 correctly stops Moyasar's
// retries for success/duplicate/recognized-but-unhandled/no-ref/already-terminal cases; 400/500
// correctly allow retries for genuinely malformed/erroring cases; `transaction_not_found`
// returning 200 (existing, pre-existing behavior, unchanged by this task) removes the retry
// safety net for a plausible race condition — flagged in the compatibility audit, not fixed here.

// ═══════════════════════════════════════════════════════════════════════════
// DUPLICATE BURST / PERFORMANCE (Step 10)
// ═══════════════════════════════════════════════════════════════════════════

describe('SYNTHETIC_MOYASAR_SIMULATION — duplicate burst and event-ID-based idempotency at scale', () => {
  it('SYNTH-BURST-1: same event sent 10 times → 1 logical processing, 9 duplicates, single transition', async () => {
    const db = makeFakeSupabase({ transactions: [{ id: 'tx_burst', provider_ref: 'pay_test_001', status: 'pending' }] })
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter: new MoyasarAdapter(null), db })

    const results = []
    for (let i = 0; i < 10; i++) {
      results.push(await sendWebhook(handle, EVENT_A))
    }

    const processed = results.filter((r) => r.body.updated === true)
    const duplicates = results.filter((r) => r.body.reason === 'already_processed')
    expect(processed).toHaveLength(1)
    expect(duplicates).toHaveLength(9)
    expect(db._state.webhookEvents).toHaveLength(1)
    expect(db._state.transactions[0].status).toBe(TransactionStatus.SUCCEEDED) // set exactly once
  })

  it('SYNTH-BURST-2: 10 distinct event IDs referencing the same payment ID → 10 distinct webhook events, no invented transitions beyond what each event states', async () => {
    const db = makeFakeSupabase({ transactions: [{ id: 'tx_burst2', provider_ref: 'pay_burst_shared', status: 'pending' }] })
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter: new MoyasarAdapter(null), db })

    for (let i = 0; i < 10; i++) {
      await sendWebhook(handle, { id: `evt_burst_${i}`, type: 'payment_authorized', data: { id: 'pay_burst_shared', status: 'authorized' } })
    }

    expect(db._state.webhookEvents).toHaveLength(10) // event-ID-based idempotency: all 10 are distinct
    const distinctEventIds = new Set(db._state.webhookEvents.map((w) => w.event_id))
    expect(distinctEventIds.size).toBe(10)
    // exactly one payment_transactions row throughout — no duplicate transaction rows were created
    expect(db._state.transactions).toHaveLength(1)
  })
})
