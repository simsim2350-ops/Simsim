import { describe, expect, it } from 'vitest'
import { marketingSettingsSchema, publicMarketingPayloadSchema, validateSectionContent } from './marketing-schemas'

describe('marketing content schemas', () => {
  it('accepts a valid hero section', () => {
    const result = validateSectionContent('HERO', {
      heading: 'منيو رقمي أسرع',
      description: 'وصف مناسب لواجهة تسويقية.',
      primaryCta: { label: 'ابدأ', href: '/register', trackingId: 'hero-signup' },
    })
    expect(result.success).toBe(true)
  })

  it('rejects a hero without required copy', () => {
    const result = validateSectionContent('HERO', { heading: '', primaryCta: { label: 'ابدأ', href: '/register' } })
    expect(result.success).toBe(false)
  })

  it('accepts a complete published payload and rejects incomplete SEO', () => {
    const base = {
      page: {
        id: 'bd805865-9155-4e28-a47b-9f9cd872a4ab', slug: 'home', revisionId: 'b116f2e5-9e77-46af-8b7c-6dc34c9e5437',
        locale: 'ar', title: 'سمسم', description: 'وصف', publishedAt: '2026-08-19T00:00:00.000Z',
        seo: { title: 'سمسم', description: 'وصف SEO', canonicalPath: '/', keywords: ['منيو'] },
      },
      settings: {},
      sections: [],
    }
    expect(publicMarketingPayloadSchema.safeParse(base).success).toBe(true)
    expect(publicMarketingPayloadSchema.safeParse({ ...base, page: { ...base.page, seo: { title: 'ناقص' } } }).success).toBe(false)
  })

  it('accepts optional blank contact and SEO fields from global settings', () => {
    const settings = {
      brandName: 'سمسم', logoPath: '/simsim-s.svg', navigation: [],
      primaryCta: { label: 'ابدأ', href: '/register' }, secondaryCta: { label: 'دخول', href: '/login' },
      contact: { email: '', phone: '', address: '', social: [] },
      seo: { title: '', description: '', canonicalPath: '/', keywords: [] },
      footer: { description: 'وصف', navigation: [], legal: [], copyright: '© 2026' },
    }
    expect(marketingSettingsSchema.safeParse(settings).success).toBe(true)
  })
})
