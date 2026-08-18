import { describe, expect, it } from 'vitest'
import { productBadgeState } from './productBadgeState.js'

describe('product badge state independence', () => {
  it.each([
    [{ is_featured: true, is_best_seller: false }, { restaurantPick: true, bestSeller: false }],
    [{ is_featured: false, is_best_seller: true }, { restaurantPick: false, bestSeller: true }],
    [{ is_featured: true, is_best_seller: true }, { restaurantPick: true, bestSeller: true }],
    [{ is_featured: false, is_best_seller: false }, { restaurantPick: false, bestSeller: false }],
  ])('returns independent states for %o', (product, expected) => {
    expect(productBadgeState(product)).toEqual(expected)
  })

  it('does not infer best seller from featured or ordering fields', () => {
    expect(productBadgeState({ is_featured: true, order_count: 999 })).toEqual({ restaurantPick: true, bestSeller: false })
    expect(productBadgeState({ is_featured: false, order_count: 999 })).toEqual({ restaurantPick: false, bestSeller: false })
  })
})
