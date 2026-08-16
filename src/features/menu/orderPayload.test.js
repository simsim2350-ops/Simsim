import { describe, expect, it } from 'vitest'
import { buildOrderPayload, previewOrderTotal } from './orderPayload'

describe('menu order payload', () => {
  it('sends identifiers and selectors, never client prices or names', () => {
    const payload = buildOrderPayload([{
      id: 'p1', name: 'Burger', price: 80, qty: 3,
      selectedOptions: [{ groupName: 'Size', choiceName: 'Large', price: 10 }],
      note: 'No onions',
    }])
    expect(payload).toEqual([{
      product_id: 'p1',
      quantity: 3,
      options: [{ group_name: 'Size', choice_name: 'Large' }],
      notes: 'No onions',
    }])
    expect(payload[0]).not.toHaveProperty('price')
    expect(payload[0]).not.toHaveProperty('name')
  })

  it('clamps invalid quantities in the browser preview', () => {
    expect(buildOrderPayload([{ id: 'p1', qty: 999999 }])[0].quantity).toBe(99)
    expect(buildOrderPayload([{ id: 'p1', qty: 0 }])[0].quantity).toBe(1)
  })

  it('calculates a display-only total with discount and delivery', () => {
    expect(previewOrderTotal(100, 15, 10)).toBe(95)
    expect(previewOrderTotal(100, 999, -4)).toBe(0)
  })
})
