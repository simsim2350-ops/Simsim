import { describe, it, expect } from 'vitest'
import { computeDrift, manifestExpected } from './checkRegistryDrift.mjs'

// فحص انحراف سجل القدرات — اختبار منطق المقارنة النقيّ (بلا شبكة).
describe('computeDrift', () => {
  it('لا انحراف حين تطابق القاعدة الـManifest تماماً', () => {
    const expected = new Map([['menu_cart', 'feature'], ['branches_limit', 'limit']])
    const actual = new Map([['menu_cart', 'feature'], ['branches_limit', 'limit']])
    const d = computeDrift(expected, actual)
    expect(d.hasDrift).toBe(false)
    expect(d.missingInDb).toEqual([])
    expect(d.orphanInDb).toEqual([])
    expect(d.typeMismatch).toEqual([])
  })

  it('يكشف خطأ النوع (السيناريو الحقيقي: menu_cart كـ limit)', () => {
    const expected = new Map([['menu_cart', 'feature']])
    const actual = new Map([['menu_cart', 'limit']])
    const d = computeDrift(expected, actual)
    expect(d.hasDrift).toBe(true)
    expect(d.typeMismatch).toEqual([{ key: 'menu_cart', manifest: 'feature', db: 'limit' }])
  })

  it('يكشف مفتاحاً ناقصاً في القاعدة', () => {
    const d = computeDrift(new Map([['branches_limit', 'limit']]), new Map())
    expect(d.hasDrift).toBe(true)
    expect(d.missingInDb).toEqual(['branches_limit'])
  })

  it('يكشف مفتاحاً يتيماً في القاعدة (السيناريو الحقيقي: numberofbranches)', () => {
    const expected = new Map([['branches_limit', 'limit']])
    const actual = new Map([['branches_limit', 'limit'], ['numberofbranches', 'limit']])
    const d = computeDrift(expected, actual)
    expect(d.hasDrift).toBe(true)
    expect(d.orphanInDb).toEqual(['numberofbranches'])
  })

  it('manifestExpected يغطّي كل قدرات الـManifest بالنوع الصحيح', () => {
    const m = manifestExpected()
    expect(m.size).toBe(34)
    expect(m.get('branding_hidden')).toBe('feature')
    expect(m.get('branding_hideable')).toBe('feature')
    expect(m.get('menu_cart')).toBe('feature')
    expect(m.get('menu_product_details')).toBe('feature')
    expect(m.get('branches_limit')).toBe('limit')
    expect(m.get('delivery_mode')).toBe('mode')
  })
})
