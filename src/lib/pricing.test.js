// اختبارات مسار الفلوس — أي كسر في هذه الحسابات يوقف الدمج في CI.
// المرجع: ADR-1 — السعر المعروض شامل ض.ق.م 15%، تُفكّ للخلف.
import { describe, it, expect } from 'vitest'
import { VAT_RATE, vatBreakdown, orderBreakdown, itemsGross } from './pricing'

describe('VAT_RATE', () => {
  it('نسبة الضريبة 15%', () => {
    expect(VAT_RATE).toBe(0.15)
  })
})

describe('vatBreakdown — فك الضريبة من مبلغ شامل', () => {
  it('المثال المرجعي: 23 ﷼ → صافي 20 + ضريبة 3', () => {
    const { gross, net, tax } = vatBreakdown(23)
    expect(gross).toBe(23)
    expect(net).toBeCloseTo(20, 10)
    expect(tax).toBeCloseTo(3, 10)
  })

  it('115 ﷼ → صافي 100 + ضريبة 15', () => {
    const { net, tax } = vatBreakdown(115)
    expect(net).toBeCloseTo(100, 10)
    expect(tax).toBeCloseTo(15, 10)
  })

  it('الصافي + الضريبة = الإجمالي دائماً (لا يضيع ولا يزيد قرش)', () => {
    for (const g of [0.05, 1, 9.99, 57.5, 123.45, 99999]) {
      const { gross, net, tax } = vatBreakdown(g)
      expect(net + tax).toBeCloseTo(gross, 10)
    }
  })

  it('الضريبة لا تُضاف فوق السعر أبداً (net أقل من gross)', () => {
    const { gross, net } = vatBreakdown(100)
    expect(net).toBeLessThan(gross)
  })

  it('صفر → كله أصفار', () => {
    expect(vatBreakdown(0)).toEqual({ gross: 0, net: 0, tax: 0 })
  })

  it('قيمة سالبة تُعامل كصفر', () => {
    expect(vatBreakdown(-50)).toEqual({ gross: 0, net: 0, tax: 0 })
  })

  it('مدخلات غير رقمية (null/undefined/نص) → أصفار بلا انهيار', () => {
    expect(vatBreakdown(null).gross).toBe(0)
    expect(vatBreakdown(undefined).gross).toBe(0)
    expect(vatBreakdown('abc').gross).toBe(0)
  })

  it('نص رقمي يُحوّل بشكل صحيح', () => {
    expect(vatBreakdown('23').net).toBeCloseTo(20, 10)
  })
})

describe('orderBreakdown — فك ضريبة طلب كامل (التوصيل خارج الضريبة)', () => {
  it('طلب بتوصيل: total=123, delivery=8 → gross=115, net=100, tax=15', () => {
    const b = orderBreakdown({ total: 123, delivery_fee: 8 })
    expect(b.total).toBe(123)
    expect(b.deliv).toBe(8)
    expect(b.gross).toBeCloseTo(115, 10)
    expect(b.net).toBeCloseTo(100, 10)
    expect(b.tax).toBeCloseTo(15, 10)
  })

  it('طلب بدون توصيل: total=23 → net=20, tax=3', () => {
    const b = orderBreakdown({ total: 23 })
    expect(b.deliv).toBe(0)
    expect(b.net).toBeCloseTo(20, 10)
    expect(b.tax).toBeCloseTo(3, 10)
  })

  it('قيم نصية من قاعدة البيانات تُحوّل بشكل صحيح', () => {
    const b = orderBreakdown({ total: '123', delivery_fee: '8' })
    expect(b.net).toBeCloseTo(100, 10)
  })

  it('توصيل أكبر من الإجمالي (بيانات تالفة) → لا قيم سالبة', () => {
    const b = orderBreakdown({ total: 5, delivery_fee: 10 })
    expect(b.gross).toBe(0)
    expect(b.net).toBe(0)
    expect(b.tax).toBe(0)
  })

  it('طلب فارغ أو null → أصفار بلا انهيار', () => {
    expect(orderBreakdown({}).total).toBe(0)
    expect(orderBreakdown(null).total).toBe(0)
    expect(orderBreakdown(undefined).gross).toBe(0)
  })
})

describe('itemsGross — إجمالي الأصناف (شامل الضريبة)', () => {
  it('يجمع سعر × كمية', () => {
    expect(itemsGross([
      { price: 10, qty: 2 },
      { price: 5, qty: 1 },
    ])).toBe(25)
  })

  it('يتجاهل الأصناف المعلّمة "غير متوفرة"', () => {
    expect(itemsGross([
      { price: 10, qty: 2 },
      { price: 100, qty: 1, unavailable: true },
    ])).toBe(20)
  })

  it('كمية مفقودة تُعامل كـ 1', () => {
    expect(itemsGross([{ price: 7 }])).toBe(7)
  })

  it('سعر نصي يُحوّل، وسعر مفقود يُعامل كصفر', () => {
    expect(itemsGross([{ price: '12.5', qty: 2 }, { qty: 3 }])).toBe(25)
  })

  it('مصفوفة فارغة أو غير مصفوفة → صفر بلا انهيار', () => {
    expect(itemsGross([])).toBe(0)
    expect(itemsGross(null)).toBe(0)
    expect(itemsGross(undefined)).toBe(0)
  })

  it('كل الأصناف غير متوفرة → صفر (سيناريو إلغاء الطلب كاملاً)', () => {
    expect(itemsGross([
      { price: 10, qty: 1, unavailable: true },
      { price: 20, qty: 2, unavailable: true },
    ])).toBe(0)
  })
})

describe('تكامل: سيناريو فاتورة كامل', () => {
  it('سلة → فك ضريبة → إجمالي طلب متسق مع الفاتورة', () => {
    // سلة: برجر 23×2 + بطاطس 11.5×1 = 57.5 شامل الضريبة، توصيل 10
    const items = [
      { price: 23, qty: 2 },
      { price: 11.5, qty: 1 },
    ]
    const cartTotal = itemsGross(items)
    expect(cartTotal).toBeCloseTo(57.5, 10)

    const { net, tax } = vatBreakdown(cartTotal)
    const total = cartTotal + 10 // كما في PublicMenu عند الإنشاء

    // الفاتورة في Orders تفك نفس الأرقام من الطلب المخزن
    const invoice = orderBreakdown({ total, delivery_fee: 10 })
    expect(invoice.net).toBeCloseTo(net, 10)
    expect(invoice.tax).toBeCloseTo(tax, 10)
    expect(invoice.net).toBeCloseTo(50, 10)
    expect(invoice.tax).toBeCloseTo(7.5, 10)
  })

  it('تعليم صنف غير متوفر يعيد الحساب بشكل متسق (سيناريو Orders)', () => {
    const items = [
      { price: 23, qty: 1 },
      { price: 34.5, qty: 1, unavailable: true },
    ]
    const { gross, net, tax } = vatBreakdown(itemsGross(items))
    expect(gross).toBeCloseTo(23, 10)
    expect(net).toBeCloseTo(20, 10)
    expect(tax).toBeCloseTo(3, 10)
  })
})
