import { describe, expect, it } from 'vitest'
import { rankProducts } from './searchUtils'

describe('rankProducts', () => {
  it('gives featured products priority as the most ordered list', () => {
    const products = [
      { id: 'regular', name: 'شاورما عادية', description: '', is_featured: false },
      { id: 'featured', name: 'شاورما مميزة', description: '', is_featured: true },
    ]

    const result = rankProducts('شاورما', products, { bestSellerIds: new Set() })

    expect(result.map(product => product.id)).toEqual(['featured', 'regular'])
  })

  it('uses actual order popularity only after featured products', () => {
    const products = [
      { id: 'sales-only', name: 'برجر مبيعات', description: '', is_featured: false },
      { id: 'featured', name: 'برجر مميز', description: '', is_featured: true },
    ]

    const result = rankProducts('برجر', products, { bestSellerIds: new Set(['sales-only']) })

    expect(result.map(product => product.id)).toEqual(['featured', 'sales-only'])
  })
})
