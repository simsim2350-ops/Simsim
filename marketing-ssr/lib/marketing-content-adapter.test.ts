import { describe, expect, it, vi } from 'vitest'
import { normalizePage, normalizeSection } from './marketing-content-adapter'
import type { MarketingPage, MarketingSection } from './marketing-types'

function section(overrides: Partial<MarketingSection>): MarketingSection {
  return {
    id: 'a1a1a1a1-1111-4111-8111-111111111111',
    type: 'HERO',
    isVisible: true,
    sortOrder: 0,
    content: {},
    ...overrides,
  }
}

describe('normalizeSection', () => {
  it('returns a typed section for valid content', () => {
    const result = normalizeSection(section({
      type: 'HERO',
      content: {
        heading: 'منيو رقمي أسرع',
        description: 'وصف مناسب لواجهة تسويقية.',
        primaryCta: { label: 'ابدأ', href: '/register', trackingId: 'hero-signup' },
      },
    }))
    expect(result).not.toBeNull()
    expect(result?.type).toBe('HERO')
    expect(result?.content.heading).toBe('منيو رقمي أسرع')
  })

  it('skips (returns null) an invalid section instead of throwing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = normalizeSection(section({ type: 'HERO', content: { heading: '' } }))
    expect(result).toBeNull()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('skips (returns null) an unrecognized section type', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = normalizeSection(section({ type: 'NOT_A_TYPE' as MarketingSection['type'] }))
    expect(result).toBeNull()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('normalizePage', () => {
  it('drops invalid sections while keeping valid ones, preserving page fields', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const page: MarketingPage = {
      slug: 'home',
      locale: 'ar',
      status: 'published',
      title: 'سمسم',
      seo: { title: 'سمسم', description: 'وصف SEO', canonicalPath: '/', keywords: ['منيو'] },
      sections: [
        section({
          id: 'a1a1a1a1-1111-4111-8111-111111111111',
          type: 'HERO',
          content: { heading: 'عنوان', description: 'وصف مناسب لواجهة تسويقية.', primaryCta: { label: 'ابدأ', href: '/register' } },
        }),
        section({ id: 'b2b2b2b2-2222-4222-8222-222222222222', type: 'HERO', content: { heading: '' } }),
      ],
    }
    const normalized = normalizePage(page)
    expect(normalized.slug).toBe('home')
    expect(normalized.sections).toHaveLength(1)
    expect(normalized.sections[0].id).toBe('a1a1a1a1-1111-4111-8111-111111111111')
  })
})
