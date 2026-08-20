import { describe, expect, it } from 'vitest'
import { validateSection } from './marketingSectionRegistry'

describe('Marketing typed section registry', () => {
  it('يقبل أقسام الفيديو والشهادات والإحصاءات والمقارنة والتواصل الصحيحة', () => {
    const samples = [
      ['VIDEO', { heading: 'شاهد المنصة', description: '', videoUrl: 'https://cdn.example.com/demo.mp4', posterUrl: '', caption: '', primaryCta: { label: 'ابدأ', href: '/register' } }],
      ['TESTIMONIALS', { heading: 'آراء العملاء', description: '', items: [{ quote: 'وفرنا وقتاً يومياً.', name: 'مها', role: 'مديرة مطعم', avatarUrl: '' }] }],
      ['STATS', { heading: 'نتائج ملموسة', description: '', items: [{ value: '30%', label: 'وقت أقل', description: '' }] }],
      ['COMPARISON', { heading: 'قارن الحلول', description: '', columns: ['الميزة', 'سمسم'], rows: [{ label: 'تحديث المنيو', values: ['يدوي', 'فوري'] }] }],
      ['CONTACT', { heading: 'تواصل معنا', description: '', email: 'sales@example.com', phone: '', address: '', primaryCta: { label: 'ابدأ', href: '/register' } }],
    ]
    for (const [type, content] of samples) expect(validateSection(type, content).success).toBe(true)
  })

  it('يرفض رابط فيديو غير آمن', () => {
    const result = validateSection('VIDEO', { heading: 'فيديو', description: '', videoUrl: 'javascript:alert(1)', posterUrl: '', caption: '' })
    expect(result.success).toBe(false)
  })

  it('يفرض حقول عناصر الشهادات والمقارنة بدلاً من قبول كائنات حرة', () => {
    expect(validateSection('TESTIMONIALS', { heading: 'آراء', description: '', items: [{ quote: '', name: '' }] }).success).toBe(false)
    expect(validateSection('COMPARISON', { heading: 'مقارنة', description: '', columns: ['الميزة'], rows: [] }).success).toBe(false)
  })
})
