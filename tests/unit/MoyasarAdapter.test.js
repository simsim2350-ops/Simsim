// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MoyasarAdapter } from '../../src/payments/adapters/moyasar.js'
import { getAdapter } from '../../src/payments/adapters/index.js'
import { TransactionStatus, WebhookEventType } from '../../src/payments/types/index.js'

const FAKE_KEY = 'test_fake_key_not_real'

const mockPaymentResponse = (overrides = {}) => ({
  ok: true,
  status: 200,
  json: async () => ({
    id: 'pay_test123',
    status: 'initiated',
    source: { transaction_url: 'https://pay.moyasar.com/test' },
    amount: 5000,
    currency: 'SAR',
    ...overrides,
  }),
})

const mockFetch = (response) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))

afterEach(() => {
  vi.unstubAllGlobals()
})

// UT-MAD-001
describe('UT-MAD-001: adapter key', () => {
  it('has key === moyasar', () => {
    const adapter = new MoyasarAdapter(FAKE_KEY)
    expect(adapter.key).toBe('moyasar')
  })
})

// UT-MAD-002
describe('UT-MAD-002: createCharge', () => {
  it('calls POST /v1/payments with Basic auth and returns ChargeResult', async () => {
    mockFetch(mockPaymentResponse())
    const adapter = new MoyasarAdapter(FAKE_KEY)

    const result = await adapter.createCharge({
      restaurantId: 'rest_1',
      amount: 50,
      currency: 'SAR',
      idempotencyKey: 'idem_abc',
      returnUrl: 'https://simsim.com/return',
    })

    const fetchCall = fetch.mock.calls[0]
    expect(fetchCall[0]).toBe('https://api.moyasar.com/v1/payments')
    expect(fetchCall[1].method).toBe('POST')
    expect(fetchCall[1].headers['Authorization']).toMatch(/^Basic /)

    const sentBody = JSON.parse(fetchCall[1].body)
    expect(sentBody.amount).toBe(5000)       // 50 SAR × 100 halala
    expect(sentBody.currency).toBe('SAR')
    expect(sentBody.metadata.idempotency_key).toBe('idem_abc')

    expect(result.providerRef).toBe('pay_test123')
    expect(result.status).toBe(TransactionStatus.INITIATED)
    expect(result.redirectUrl).toBe('https://pay.moyasar.com/test')
  })
})

// UT-MAD-003
describe('UT-MAD-003: verifyPayment', () => {
  it('calls GET /v1/payments/:id and maps paid → SUCCEEDED', async () => {
    mockFetch(mockPaymentResponse({ status: 'paid' }))
    const adapter = new MoyasarAdapter(FAKE_KEY)

    const result = await adapter.verifyPayment('pay_test123')

    const fetchCall = fetch.mock.calls[0]
    expect(fetchCall[0]).toBe('https://api.moyasar.com/v1/payments/pay_test123')
    expect(fetchCall[1].method).toBe('GET')
    expect(result.status).toBe(TransactionStatus.SUCCEEDED)
    expect(result.providerRef).toBe('pay_test123')
  })
})

// UT-MAD-004
describe('UT-MAD-004: mapStatus', () => {
  const adapter = new MoyasarAdapter(FAKE_KEY)

  it('maps all known Moyasar statuses correctly', () => {
    expect(adapter.mapStatus('initiated')).toBe(TransactionStatus.INITIATED)
    expect(adapter.mapStatus('authorized')).toBe(TransactionStatus.PENDING)
    expect(adapter.mapStatus('paid')).toBe(TransactionStatus.SUCCEEDED)
    expect(adapter.mapStatus('failed')).toBe(TransactionStatus.FAILED)
    expect(adapter.mapStatus('refunded')).toBe(TransactionStatus.REFUNDED)
  })

  it('maps unknown status to FAILED (safe default)', () => {
    expect(adapter.mapStatus('unknown_status')).toBe(TransactionStatus.FAILED)
    expect(adapter.mapStatus('')).toBe(TransactionStatus.FAILED)
  })
})

// UT-MAD-005
describe('UT-MAD-005: parseWebhook payment_paid', () => {
  it('returns PAYMENT_SUCCEEDED for payment_paid', () => {
    const adapter = new MoyasarAdapter(FAKE_KEY)
    const result = adapter.parseWebhook(
      { type: 'payment_paid', data: { id: 'pay_abc', status: 'paid' } },
      {}
    )
    expect(result.type).toBe(WebhookEventType.PAYMENT_SUCCEEDED)
    expect(result.eventId).toBe('pay_abc')
    expect(result.providerRef).toBe('pay_abc')
    expect(result.status).toBe(TransactionStatus.SUCCEEDED)
  })
})

// UT-MAD-006
describe('UT-MAD-006: parseWebhook payment_failed', () => {
  it('returns PAYMENT_FAILED for payment_failed', () => {
    const adapter = new MoyasarAdapter(FAKE_KEY)
    const result = adapter.parseWebhook(
      { type: 'payment_failed', data: { id: 'pay_xyz', status: 'failed' } },
      {}
    )
    expect(result.type).toBe(WebhookEventType.PAYMENT_FAILED)
    expect(result.status).toBe(TransactionStatus.FAILED)
  })
})

// UT-MAD-007
describe('UT-MAD-007: parseWebhook unknown type', () => {
  it('returns UNKNOWN for unrecognised webhook type', () => {
    const adapter = new MoyasarAdapter(FAKE_KEY)

    const unknown = adapter.parseWebhook({ type: 'some_future_event', data: {} }, {})
    expect(unknown.type).toBe(WebhookEventType.UNKNOWN)

    const noType = adapter.parseWebhook({ data: {} }, {})
    expect(noType.type).toBe(WebhookEventType.UNKNOWN)
  })
})

// UT-MAD-008
describe('UT-MAD-008: refundPayment', () => {
  it('calls POST /v1/payments/:id/refund and returns RefundResult', async () => {
    mockFetch({
      ok: true,
      status: 200,
      json: async () => ({ id: 'rfnd_001', status: 'refunded' }),
    })
    const adapter = new MoyasarAdapter(FAKE_KEY)

    const result = await adapter.refundPayment({
      providerRef: 'pay_test123',
      amount: 25,
      reason: 'customer request',
      idempotencyKey: 'ref_idem_1',
    })

    const fetchCall = fetch.mock.calls[0]
    expect(fetchCall[0]).toBe('https://api.moyasar.com/v1/payments/pay_test123/refund')
    expect(fetchCall[1].method).toBe('POST')
    expect(result.refundRef).toBe('rfnd_001')
    expect(result.status).toBe('refunded')
  })
})

// UT-MAD-009
describe('UT-MAD-009: HTTP 4xx error — no secret leak', () => {
  it('throws with status code and does NOT include API key in message', async () => {
    mockFetch({
      ok: false,
      status: 422,
      json: async () => ({ message: 'Invalid card number' }),
    })
    const adapter = new MoyasarAdapter(FAKE_KEY)

    let thrown
    try {
      await adapter.createCharge({
        restaurantId: 'rest_1',
        amount: 50,
        currency: 'SAR',
        idempotencyKey: 'idem_1',
        returnUrl: 'https://simsim.com/return',
      })
    } catch (err) {
      thrown = err
    }

    expect(thrown).toBeDefined()
    expect(thrown.message).toMatch(/422/)
    expect(thrown.message).toMatch(/Invalid card number/)
    expect(thrown.message).not.toContain(FAKE_KEY)
  })
})

// UT-MAD-010
describe('UT-MAD-010: HTTP 5xx error', () => {
  it('throws with "server error" message', async () => {
    mockFetch({ ok: false, status: 503, json: async () => ({}) })
    const adapter = new MoyasarAdapter(FAKE_KEY)

    await expect(
      adapter.createCharge({ restaurantId: 'r', amount: 1, currency: 'SAR', idempotencyKey: 'k', returnUrl: '' })
    ).rejects.toThrow(/server error.*503/i)
  })
})

// UT-MAD-011
describe('UT-MAD-011: network failure', () => {
  it('throws with "network error" message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')))
    const adapter = new MoyasarAdapter(FAKE_KEY)

    await expect(
      adapter.createCharge({ restaurantId: 'r', amount: 1, currency: 'SAR', idempotencyKey: 'k', returnUrl: '' })
    ).rejects.toThrow(/network error/i)
  })
})

// UT-MAD-012
describe('UT-MAD-012: missing API key', () => {
  it('throws before any HTTP call when key is absent', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const adapter = new MoyasarAdapter(null)

    await expect(
      adapter.createCharge({ restaurantId: 'r', amount: 1, currency: 'SAR', idempotencyKey: 'k', returnUrl: '' })
    ).rejects.toThrow(/PAYMENT_MOYASAR_SECRET_KEY is not configured/)

    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

// UT-MAD-013
describe('UT-MAD-013: adapter registry', () => {
  it('getAdapter("moyasar") returns a MoyasarAdapter instance', () => {
    const adapter = getAdapter('moyasar')
    expect(adapter).toBeInstanceOf(MoyasarAdapter)
    expect(adapter.key).toBe('moyasar')
  })
})
