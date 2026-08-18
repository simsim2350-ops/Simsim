import { describe, expect, it } from 'vitest'
import { rankProducts } from './searchUtils'

describe('rankProducts', () => {
  it('gives the manual most-ordered flag priority independently from featured', () => {
    const products = [
      { id: 'featured-only', name: 'شاورما مميزة', description: '', is_featured: true, is_most_ordered: false },
      { id: 'most-ordered-only', name: 'شاورما مطلوبة', description: '', is_featured: false, is_most_ordered: true },
    ]

    const result = rankProducts('شاورما', products, { bestSellerIds: new Set() })

    expect(result.map(product => product.id)).toEqual(['most-ordered-only', 'featured-only'])
  })

  it('uses actual order popularity only after the manual most-ordered flag', () => {
    const products = [
      { id: 'sales-only', name: 'برجر مبيعات', description: '', is_featured: false, is_most_ordered: false },
      { id: 'most-ordered', name: 'برجر مطلوب', description: '', is_featured: false, is_most_ordered: true },
    ]

    const result = rankProducts('برجر', products, { bestSellerIds: new Set(['sales-only']) })

    expect(result.map(product => product.id)).toEqual(['most-ordered', 'sales-only'])
  })
})
