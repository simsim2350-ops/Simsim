import { describe, it, expect } from 'vitest'
import { toCSV, buildTable, stampName } from './exportUtils'

// حارس تنسيق التصدير — دوال نقيّة تُختبر بلا شبكة/DOM (نمط pricing.test.js)
describe('toCSV', () => {
  const cols = [
    { key: 'name', label: 'الاسم' },
    { key: 'qty', label: 'الكمية' },
  ]

  it('يكتب صف العناوين ثم الصفوف', () => {
    const csv = toCSV([{ name: 'شاورما', qty: 2 }], cols)
    expect(csv).toBe('الاسم,الكمية\r\nشاورما,2')
  })

  it('يهرّب الفواصل داخل القيم (وإلا انزاحت الأعمدة)', () => {
    const csv = toCSV([{ name: 'برجر, دجاج', qty: 1 }], cols)
    expect(csv.split('\r\n')[1]).toBe('"برجر, دجاج",1')
  })

  it('يضاعف علامات الاقتباس داخل القيم', () => {
    const csv = toCSV([{ name: 'وصف "خاص"', qty: 1 }], cols)
    expect(csv.split('\r\n')[1]).toBe('"وصف ""خاص""",1')
  })

  it('يهرّب الأسطر الجديدة داخل الخلية', () => {
    const csv = toCSV([{ name: 'سطر\nثانٍ', qty: 1 }], cols)
    expect(csv.split('\r\n')[1]).toBe('"سطر\nثانٍ",1')
  })

  it('يحوّل null/undefined إلى خلية فارغة لا إلى نص "null"', () => {
    const csv = toCSV([{ name: null, qty: undefined }], cols)
    expect(csv.split('\r\n')[1]).toBe(',')
  })

  it('يدعم مفتاحاً دالةً ودالة تنسيق', () => {
    const csv = toCSV([{ a: 3, b: 4 }], [
      { key: r => r.a + r.b, label: 'مجموع' },
      { key: 'a', label: 'قيمة', format: v => `${v} ﷼` },
    ])
    expect(csv).toBe('مجموع,قيمة\r\n7,3 ﷼')
  })

  it('يُرجع العناوين فقط لقائمة فارغة', () => {
    expect(toCSV([], cols)).toBe('الاسم,الكمية')
  })
})

describe('buildTable', () => {
  it('يهرّب HTML فلا يُحقَن وسم من بيانات العميل', () => {
    const html = buildTable([{ c: '<script>x</script>' }], [{ key: 'c', label: 'تعليق' }])
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })
})

describe('stampName', () => {
  it('يُلحق تاريخ اليوم بالاسم', () => {
    expect(stampName('customers')).toMatch(/^customers-\d{8}$/)
  })
})
