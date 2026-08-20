import { describe, expect, it } from 'vitest'
import { readStoredCart, validateCartAgainstProducts, idempotencyStorageKey } from './cartHelpers'

describe('readStoredCart', () => {
  const branchA = 'branch-a'
  const branchB = 'branch-b'
  const items = [{ cartKey: 'p1__', id: 'p1', qty: 1, price: 10, basePrice: 10 }]

  it('UT-CART-009: سلة محفوظة لفرع مختلف تُكتشف كنزاع بدل التحميل الصامت', () => {
    const raw = JSON.stringify({ items, savedAt: Date.now(), branchId: branchA })
    const result = readStoredCart(raw, branchB)
    expect(result.items).toEqual([])
    expect(result.conflict).toEqual({ savedBranchId: branchA, itemCount: 1 })
  })

  it('سلة لنفس الفرع تُحمَّل عادياً بلا نزاع', () => {
    const raw = JSON.stringify({ items, savedAt: Date.now(), branchId: branchA })
    const result = readStoredCart(raw, branchA)
    expect(result.items).toEqual(items)
    expect(result.conflict).toBeNull()
  })

  it('سلة قديمة بلا branchId (قبل هذا التغيير) تُعامَل بتوافق خلفي بلا نزاع', () => {
    const raw = JSON.stringify({ items, savedAt: Date.now() })
    const result = readStoredCart(raw, branchA)
    expect(result.items).toEqual(items)
    expect(result.conflict).toBeNull()
  })

  it('سلة فارغة من فرع مختلف لا تُنتج نزاعاً (لا شيء يُفقد)', () => {
    const raw = JSON.stringify({ items: [], savedAt: Date.now(), branchId: branchA })
    const result = readStoredCart(raw, branchB)
    expect(result.items).toEqual([])
    expect(result.conflict).toBeNull()
  })

  it('UT-CART-007 مكافئ: سلة عمرها أكثر من 6 ساعات تُهمَل بلا نزاع', () => {
    const raw = JSON.stringify({ items, savedAt: Date.now() - 7 * 60 * 60 * 1000, branchId: branchA })
    const result = readStoredCart(raw, branchB)
    expect(result.items).toEqual([])
    expect(result.conflict).toBeNull()
  })

  it('حمولة تالفة (JSON غير صالح) تُعامَل كسلة فارغة بلا رمي استثناء', () => {
    const result = readStoredCart('{not json', branchA)
    expect(result.items).toEqual([])
    expect(result.conflict).toBeNull()
  })

  it('لا localStorage مسبقاً (raw=null) ⇒ سلة فارغة بلا نزاع', () => {
    const result = readStoredCart(null, branchA)
    expect(result.items).toEqual([])
    expect(result.conflict).toBeNull()
  })
})

describe('idempotencyStorageKey — TASK-ORD-002', () => {
  it('مفتاح منفصل عن مفتاح السلة، ومختلف لكل فرع من نفس المطعم', () => {
    expect(idempotencyStorageKey('koshary', 'branch-a')).toBe('simsim_idem_koshary_branch-a')
    expect(idempotencyStorageKey('koshary', 'branch-a')).not.toBe(idempotencyStorageKey('koshary', 'branch-b'))
  })
})

describe('validateCartAgainstProducts', () => {
  const cart = [
    { cartKey: 'available__', id: 'p1', qty: 1, price: 10, basePrice: 10 },
    { cartKey: 'deleted__', id: 'p2', qty: 1, price: 20, basePrice: 20 },
    { cartKey: 'repriced__', id: 'p3', qty: 1, price: 15, basePrice: 15 },
  ]
  const products = [
    { id: 'p1', price: 10 },
    { id: 'p3', price: 18 }, // ارتفع سعره منذ إضافته للسلة
  ]

  it('صنف لم يعد موجوداً في المنيو المحمَّل (حُذف أو أصبح غير متاح) يُعلَّم available=false', () => {
    const result = validateCartAgainstProducts(cart, products)
    const deleted = result.find(i => i.id === 'p2')
    expect(deleted.available).toBe(false)
    expect(deleted.currentBasePrice).toBeNull()
  })

  it('صنف قائم بنفس السعر يبقى available=true وpriceChanged=false', () => {
    const result = validateCartAgainstProducts(cart, products)
    const stable = result.find(i => i.id === 'p1')
    expect(stable.available).toBe(true)
    expect(stable.priceChanged).toBe(false)
  })

  it('صنف قائم بسعر مختلف يُعلَّم priceChanged=true مع السعر الحالي', () => {
    const result = validateCartAgainstProducts(cart, products)
    const repriced = result.find(i => i.id === 'p3')
    expect(repriced.available).toBe(true)
    expect(repriced.priceChanged).toBe(true)
    expect(repriced.currentBasePrice).toBe(18)
  })

  it('عند عدم اكتمال تحميل المنيو بعد (products فارغة) لا يُعلَّم أي صنف كغير متوفر خطأً', () => {
    const result = validateCartAgainstProducts(cart, [])
    expect(result.every(i => i.available === true && i.priceChanged === false)).toBe(true)
  })
})
