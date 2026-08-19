import { z } from 'zod'

const ctaSchema = z.object({
  label: z.string().trim().min(1).max(80),
  href: z.string().trim().min(1).max(500),
  variant: z.enum(['primary', 'secondary']).optional(),
  trackingId: z.string().trim().regex(/^[a-z][a-z0-9-]{2,62}$/).optional(),
})

const itemTextSchema = z.string().trim().min(1).max(180)

const seoSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(320),
  canonicalPath: z.string().trim().min(1).max(500),
  keywords: z.array(z.string().trim().min(1).max(80)).max(24),
  ogTitle: z.string().trim().max(160).optional(),
  ogDescription: z.string().trim().max(320).optional(),
  ogImage: z.string().trim().max(500).optional(),
  robots: z.string().trim().max(120).optional(),
  jsonLd: z.array(z.record(z.string(), z.unknown())).max(10).optional(),
})

export const sectionSchemas = {
  HERO: z.object({
    eyebrow: z.string().trim().max(90).optional(),
    heading: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(360),
    primaryCta: ctaSchema,
    secondaryCta: ctaSchema.optional(),
    proof: z.string().trim().max(160).optional(),
  }),
  PROBLEM: z.object({ eyebrow: z.string().trim().max(90).optional(), heading: z.string().trim().min(1).max(120), items: z.array(itemTextSchema).min(1).max(8) }),
  BENEFITS: z.object({ eyebrow: z.string().trim().max(90).optional(), heading: z.string().trim().min(1).max(120), description: z.string().trim().max(360).optional(), items: z.array(itemTextSchema).min(1).max(10) }),
  STEPS: z.object({
    eyebrow: z.string().trim().max(90).optional(), heading: z.string().trim().min(1).max(120),
    steps: z.array(z.object({ number: z.string().trim().max(8), title: z.string().trim().min(1).max(100), description: z.string().trim().min(1).max(240) })).min(1).max(6),
  }),
  MENU_PREVIEW: z.object({ eyebrow: z.string().trim().max(90).optional(), heading: z.string().trim().min(1).max(120), description: z.string().trim().max(360).optional(), points: z.array(itemTextSchema).min(1).max(6) }),
  FEATURES: z.object({
    eyebrow: z.string().trim().max(90).optional(), heading: z.string().trim().min(1).max(120),
    items: z.array(z.object({ title: z.string().trim().min(1).max(100), description: z.string().trim().min(1).max(240) })).min(1).max(18),
  }),
  TRUST: z.object({ eyebrow: z.string().trim().max(90).optional(), heading: z.string().trim().min(1).max(120), items: z.array(itemTextSchema).min(1).max(12) }),
  PRICING: z.object({ eyebrow: z.string().trim().max(90).optional(), heading: z.string().trim().min(1).max(120), description: z.string().trim().max(360).optional(), source: z.literal('plans') }),
  FAQ: z.object({
    eyebrow: z.string().trim().max(90).optional(), heading: z.string().trim().min(1).max(120),
    items: z.array(z.object({ question: z.string().trim().min(1).max(180), answer: z.string().trim().min(1).max(1200) })).min(1).max(20),
  }),
  CTA: z.object({ heading: z.string().trim().min(1).max(120), description: z.string().trim().max(360).optional(), primaryCta: ctaSchema }),
} as const

export const sectionTypeSchema = z.enum(['HERO', 'PROBLEM', 'BENEFITS', 'STEPS', 'MENU_PREVIEW', 'FEATURES', 'TRUST', 'PRICING', 'FAQ', 'CTA'])

export const marketingSectionSchema = z.object({
  id: z.string().uuid(),
  type: sectionTypeSchema,
  content: z.record(z.string(), z.unknown()),
  settings: z.record(z.string(), z.unknown()).default({}),
  analyticsId: z.string().nullable().optional(),
  sortOrder: z.number().int(),
  isVisible: z.boolean(),
})

export const marketingSettingsSchema = z.object({
  brandName: z.string().trim().min(1).max(80),
  logoPath: z.string().trim().min(1).max(500),
  navigation: z.array(z.object({ label: z.string().trim().min(1).max(80), href: z.string().trim().min(1).max(500) })).max(10),
  primaryCta: ctaSchema,
  secondaryCta: ctaSchema,
  footer: z.object({
    description: z.string().trim().max(360),
    navigation: z.array(z.object({ label: z.string().trim().min(1).max(80), href: z.string().trim().min(1).max(500) })).max(10),
    legal: z.array(z.object({ label: z.string().trim().min(1).max(80), href: z.string().trim().min(1).max(500) })).max(10),
    copyright: z.string().trim().max(180),
  }),
})

export const publicMarketingPayloadSchema = z.object({
  page: z.object({
    id: z.string().uuid(),
    slug: z.string().min(1),
    revisionId: z.string().uuid(),
    locale: z.enum(['ar', 'en']),
    title: z.string().min(1),
    description: z.string().nullable().optional(),
    seo: seoSchema,
    publishedAt: z.string(),
  }),
  settings: z.record(z.string(), z.unknown()),
  sections: z.array(marketingSectionSchema),
})

export const publicPlanSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  billingCycle: z.string().min(1),
  price: z.coerce.number().nonnegative(),
  sortOrder: z.number().int(),
  features: z.array(z.object({ key: z.string(), name: z.string(), included: z.boolean(), value: z.unknown().nullable().optional() })),
})

export const publicPlansSchema = z.array(publicPlanSchema)

export function validateSectionContent(type: z.infer<typeof sectionTypeSchema>, content: unknown) {
  return sectionSchemas[type].safeParse(content)
}
