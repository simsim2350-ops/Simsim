import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// rpc mock عبر vi.hoisted (يُرفع مع vi.mock لتفادي خطأ التهيئة)
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn(() => Promise.resolve({ data: null, error: null })) }))
vi.mock('./supabase', () => ({ supabase: { rpc } }))

import { track, trackOwnerEvent, trackRegistrationEvent, getSessionId } from './analytics.js'

// window مزيّف (بيئة node بلا jsdom) — sessionStorage بسيط + crypto.randomUUID
function fakeWindow() {
  const store = new Map()
  return {
    sessionStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      clear: () => store.clear(),
    },
    crypto: { randomUUID: () => 'sid-fixed-1234' },
  }
}

describe('analytics.track (عقد المنتِج — ADR-42/M1)', () => {
  beforeEach(() => { rpc.mockClear(); globalThis.window = fakeWindow() })
  afterEach(() => { delete globalThis.window })

  it('getSessionId يُرجع معرّفاً مستقراً عبر الاستدعاءات', () => {
    const a = getSessionId()
    const b = getSessionId()
    expect(a).toBeTruthy()
    expect(a).toBe(b)
  })

  it('يستدعي track_event بالوسائط الصحيحة', () => {
    track('menu.product_viewed', { restaurantId: 'r1', entityType: 'product', entityId: 'p9' })
    expect(rpc).toHaveBeenCalledTimes(1)
    const [fn, args] = rpc.mock.calls[0]
    expect(fn).toBe('track_event')
    expect(args.p_event_type).toBe('menu.product_viewed')
    expect(args.p_restaurant_id).toBe('r1')
    expect(args.p_entity_id).toBe('p9')
    expect(args.p_session_id).toBeTruthy()
  })

  it('يتجاهل الإرسال بلا restaurantId (لا استدعاء)', () => {
    track('menu.viewed', {})
    expect(rpc).not.toHaveBeenCalled()
  })

  it('لا يرمي أبداً حتى لو فشل RPC (fire-and-forget)', () => {
    rpc.mockImplementationOnce(() => Promise.reject(new Error('network')))
    expect(() => track('cart.item_added', { restaurantId: 'r1' })).not.toThrow()
  })

  it('يرسل حدث تفعيل المالك عبر track_owner_event من دون بيانات جلسة شخصية', () => {
    trackOwnerEvent('menu_minimum_ready', { restaurantId: 'r1', props: { source: 'test' } })
    const [fn, args] = rpc.mock.calls[0]
    expect(fn).toBe('track_owner_event')
    expect(args.p_event_type).toBe('menu_minimum_ready')
    expect(args.p_restaurant_id).toBe('r1')
    expect(args.p_session_id).toBeTruthy()
  })

  it('يرسل حدث التسجيل المسموح به قبل المصادقة عبر track_registration_event', () => {
    trackRegistrationEvent('registration_started', { source: 'test' })
    const [fn, args] = rpc.mock.calls[0]
    expect(fn).toBe('track_registration_event')
    expect(args.p_event_type).toBe('registration_started')
    expect(args.p_session_id).toBeTruthy()
  })
})
