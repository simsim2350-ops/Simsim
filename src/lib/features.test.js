// اختبار طبقة Domain لسجل القدرات (features.js) — دوال حسم نقيّة (ADR-40 · M4)
import { describe, it, expect } from 'vitest'
import { has, value, state, isRuntimeUsable } from './features.js'

const M = {
  menu:          { value: true,  type: 'feature', runtime_status: 'enabled', name: 'المنيو' },
  orders_refund: { value: false, type: 'feature', runtime_status: 'preview', name: 'استرجاع', upgrade_message: 'رقِّ باقتك' },
  beta_thing:    { value: true,  type: 'feature', runtime_status: 'beta' },
  disabled_feat: { value: true,  type: 'feature', runtime_status: 'disabled' },
  products_limit:{ value: 50,    type: 'limit',   runtime_status: 'enabled' },
  no_limit:      { value: null,  type: 'limit',   runtime_status: 'enabled' },
  delivery_mode: { value: 'self',type: 'mode',    runtime_status: 'enabled' },
}

describe('features.has', () => {
  it('feature مفعّلة = true', () => expect(has(M, 'menu')).toBe(true))
  it('feature في preview = false (غير مُتاح)', () => expect(has(M, 'orders_refund')).toBe(false))
  it('feature في beta = true (مُتاح)', () => expect(has(M, 'beta_thing')).toBe(true))
  it('feature runtime=disabled = false', () => expect(has(M, 'disabled_feat')).toBe(false))
  it('limit بقيمة = true', () => expect(has(M, 'products_limit')).toBe(true))
  it('limit بلا قيمة (null) = true؟ لا — null يعني غير محدَّد فيُعتبر متاحاً بلا حد', () =>
    expect(has(M, 'no_limit')).toBe(false)) // null value → غير «متاح» بمعنى محدَّد
  it('mode بقيمة = true', () => expect(has(M, 'delivery_mode')).toBe(true))
  it('fail-open: مفتاح غير مسجَّل = true', () => expect(has(M, 'ghost_key')).toBe(true))
  it('fail-open: خريطة فارغة = true', () => expect(has({}, 'menu')).toBe(true))
})

describe('features.value', () => {
  it('يرجع قيمة الحد', () => expect(value(M, 'products_limit')).toBe(50))
  it('يرجع قيمة الوضع', () => expect(value(M, 'delivery_mode')).toBe('self'))
  it('مفتاح غير موجود = undefined', () => expect(value(M, 'ghost')).toBeUndefined())
})

describe('features.state', () => {
  it('قدرة مقفلة تحمل رسالة الترقية', () => {
    const s = state(M, 'orders_refund')
    expect(s.known).toBe(true)
    expect(s.locked).toBe(true)
    expect(s.upgrade_message).toBe('رقِّ باقتك')
  })
  it('مفتاح غير مسجَّل: known=false و usable=true (fail-open)', () => {
    const s = state(M, 'ghost')
    expect(s.known).toBe(false)
    expect(s.usable).toBe(true)
  })
})

describe('isRuntimeUsable', () => {
  it('enabled/beta = true', () => {
    expect(isRuntimeUsable('enabled')).toBe(true)
    expect(isRuntimeUsable('beta')).toBe(true)
  })
  it('preview/disabled = false', () => {
    expect(isRuntimeUsable('preview')).toBe(false)
    expect(isRuntimeUsable('disabled')).toBe(false)
  })
  it('غير معروف/فارغ = true (fail-open)', () => expect(isRuntimeUsable(null)).toBe(true))
})
