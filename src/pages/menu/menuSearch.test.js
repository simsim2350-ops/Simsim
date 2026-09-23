import { describe, it, expect } from 'vitest'
import {
  filterCategories,
  filterProductsBySearch,
  filterProductsByFilters,
  countActiveFilters,
  isDefaultProductFilters,
  DEFAULT_PRODUCT_FILTERS,
} from './menuSearch'

const categories = [
  { id: 'c1', name: 'برجر', name_en: 'Burgers' },
  { id: 'c2', name: 'مشروبات', name_en: 'Drinks' },
]
const categoriesById = new Map(categories.map(c => [c.id, c]))
categoriesById.set(null, undefined)

const products = [
  { id: 'p1', name: 'برجر كلاسيك', name_en: 'Classic Burger', category_id: 'c1', is_available: true, is_best_seller: true, is_featured: false },
  { id: 'p2', name: 'عصير برتقال', name_en: 'Orange Juice', category_id: 'c2', is_available: false, is_best_seller: false, is_featured: true },
  { id: 'p3', name: 'بطاطس', name_en: 'Fries', category_id: null, is_available: true, is_best_seller: false, is_featured: false },
]

describe('filterCategories', () => {
  it('returns all categories when query is empty', () => {
    expect(filterCategories(categories, '')).toEqual(categories)
  })
  it('matches Arabic name', () => {
    expect(filterCategories(categories, 'مشروب')).toEqual([categories[1]])
  })
  it('matches English name case-insensitively', () => {
    expect(filterCategories(categories, 'BURGER')).toEqual([categories[0]])
  })
})

describe('filterProductsBySearch', () => {
  it('returns all products when query is empty', () => {
    expect(filterProductsBySearch(products, categoriesById, '')).toEqual(products)
  })
  it('matches by product Arabic name', () => {
    expect(filterProductsBySearch(products, categoriesById, 'بطاطس')).toEqual([products[2]])
  })
  it('matches by product English name', () => {
    expect(filterProductsBySearch(products, categoriesById, 'orange')).toEqual([products[1]])
  })
  it('matches by parent category name', () => {
    expect(filterProductsBySearch(products, categoriesById, 'مشروبات')).toEqual([products[1]])
  })
  it('does not throw for products with no category', () => {
    expect(() => filterProductsBySearch(products, categoriesById, 'بطاطس')).not.toThrow()
  })
})

describe('filterProductsByFilters', () => {
  it('returns everything with default filters', () => {
    expect(filterProductsByFilters(products, DEFAULT_PRODUCT_FILTERS)).toEqual(products)
  })
  it('filters by category id, using "none" for uncategorized', () => {
    expect(filterProductsByFilters(products, { ...DEFAULT_PRODUCT_FILTERS, categoryId: 'none' })).toEqual([products[2]])
  })
  it('filters by availability', () => {
    expect(filterProductsByFilters(products, { ...DEFAULT_PRODUCT_FILTERS, availability: 'unavailable' })).toEqual([products[1]])
  })
  it('filters by best seller', () => {
    expect(filterProductsByFilters(products, { ...DEFAULT_PRODUCT_FILTERS, bestSeller: true })).toEqual([products[0]])
  })
  it('filters by featured', () => {
    expect(filterProductsByFilters(products, { ...DEFAULT_PRODUCT_FILTERS, featured: true })).toEqual([products[1]])
  })
  it('combines multiple filters with AND semantics', () => {
    expect(filterProductsByFilters(products, { ...DEFAULT_PRODUCT_FILTERS, availability: 'available', bestSeller: true })).toEqual([products[0]])
  })
})

describe('filter state helpers', () => {
  it('isDefaultProductFilters is true only for the default', () => {
    expect(isDefaultProductFilters(DEFAULT_PRODUCT_FILTERS)).toBe(true)
    expect(isDefaultProductFilters({ ...DEFAULT_PRODUCT_FILTERS, featured: true })).toBe(false)
  })
  it('countActiveFilters counts each non-default field once', () => {
    expect(countActiveFilters(DEFAULT_PRODUCT_FILTERS)).toBe(0)
    expect(countActiveFilters({ categoryId: 'c1', availability: 'available', bestSeller: true, featured: true })).toBe(4)
  })
})
