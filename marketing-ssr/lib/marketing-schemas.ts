import { z } from 'zod'

const safeUrl = z.string().trim().min(1).max(500).refine(
  (value) => value.startsWith('/') || value.startsWith('#') || /^https?:\/\//i.test(value) || /^mailto:|^tel:/i.test(value),
  'يجب أن يكون الرابط داخليًا أو http(s) أو mailto/tel',
)

const optionalUrl = safeUrl.optional()

export const ctaSchema = z.object({
  label: z.string().trim().min(1).max(80),
  href: safeUrl,
  variant: z.enum(['primary', 'secondary']).optional(),
  trackingId: z.string().trim().regex(/^[a-z][a-z0-9-]{2,62}$/).optional(),
})

const itemTextSchema = z.string().trim().min(1).max(180)
const headingSchema = z.string().trim().min(1).max(120)
const eyebrowSchema = z.string().trim().max(90).optional()
const descriptionSchema = z.string().trim().max(360).optional()

export const seoSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(320),
  canonicalPath: z.string().trim().min(1).max(500).refine((value) => value.startsWith('/'), 'Canonical path must be internal'),
  keywords: z.array(z.string().trim().min(1).max(80)).max(24),
  ogTitle: z.string().trim().max(160).optional(),
  ogDescription: z.string().trim().max(320).optional(),
  ogImage: optionalUrl,
  robots: z.string().trim().max(120).optional(),
  jsonLd: z.array(z.record(z.string(), z.unknown())).max(10).optional(),
})

export const sectionSchemas = {
  HERO: z.object({
    eyebrow: eyebrowSchema,
    heading: headingSchema,
    description: z.string().trim().min(1).max(360),
    primaryCta: ctaSchema,
    secondaryCta: ctaSchema.optional(),
    proof: z.string().trim().max(160).optional(),
    imageUrl: optionalUrl,
    imageAlt: z.string().trim().max(180).optional(),
  }),
  PROBLEM: z.object({ eyebrow: eyebrowSchema, heading: headingSchema, description: descriptionSchema, items: z.array(itemTextSchema).min(1).max(8) }),
  BENEFITS: z.object({ eyebrow: eyebrowSchema, heading: headingSchema, description: descriptionSchema, items: z.array(itemTextSchema).min(1).max(10), imageUrl: optionalUrl, imageAlt: z.string().trim().max(180).optional() }),
  STEPS: z.object({
    eyebrow: eyebrowSchema, heading: headingSchema,
    steps: z.array(z.object({ number: z.string().trim().max(8), title: z.string().trim().min(1).max(100), description: z.string().trim().min(1).max(240) })).min(1).max(6),
  }),
  MENU_PREVIEW: z.object({ eyebrow: eyebrowSchema, heading: headingSchema, description: descriptionSchema, points: z.array(itemTextSchema).min(1).max(6), imageUrl: optionalUrl, imageAlt: z.string().trim().max(180).optional() }),
  FEATURES: z.object({
    eyebrow: eyebrowSchema, heading: headingSchema, description: descriptionSchema,
    items: z.array(z.object({ title: z.string().trim().min(1).max(100), description: z.string().trim().min(1).max(240), icon: z.string().trim().max(40).optional() })).min(1).max(18),
  }),
  TRUST: z.object({ eyebrow: eyebrowSchema, heading: headingSchema, description: descriptionSchema, items: z.array(itemTextSchema).min(1).max(12) }),
  PRICING: z.object({
    eyebrow: eyebrowSchema, heading: headingSchema, description: descriptionSchema, source: z.literal('plans'),
    planOrder: z.array(z.string().uuid()).max(20).optional(),
    hiddenPlanIds: z.array(z.string().uuid()).max(20).optional(),
    badges: z.record(z.string().uuid(), z.string().trim().max(80)).optional(),
    primaryCta: ctaSchema.optional(),
  }),
  FAQ: z.object({
    eyebrow: eyebrowSchema, heading: headingSchema, description: descriptionSchema,
    items: z.array(z.object({ question: z.string().trim().min(1).max(180), answer: z.string().trim().min(1).max(1200) })).min(1).max(20),
  }),
  CTA: z.object({ heading: headingSchema, description: descriptionSchema, primaryCta: ctaSchema, imageUrl: optionalUrl }),
  VIDEO: z.object({
    eyebrow: eyebrowSchema, heading: headingSchema, description: descriptionSchema,
    videoUrl: safeUrl, posterUrl: optionalUrl, caption: z.string().trim().max(240).optional(), primaryCta: ctaSchema.optional(),
  }),
  IMAGE_TEXT: z.object({
    eyebrow: eyebrowSchema, heading: headingSchema, description: z.string().trim().min(1).max(600),
    imageUrl: safeUrl, imageAlt: z.string().trim().min(1).max(180), imagePosition: z.enum(['start', 'end']).default('end'), primaryCta: ctaSchema.optional(),
  }),
  TESTIMONIALS: z.object({
    eyebrow: eyebrowSchema, heading: headingSchema, description: descriptionSchema,
    items: z.array(z.object({ quote: z.string().trim().min(1).max(600), name: z.string().trim().min(1).max(120), role: z.string().trim().max(140).optional(), avatarUrl: optionalUrl })).min(1).max(12),
  }),
  STATS: z.object({
    eyebrow: eyebrowSchema, heading: headingSchema, description: descriptionSchema,
    items: z.array(z.object({ value: z.string().trim().min(1).max(32), label: z.string().trim().min(1).max(100), description: z.string().trim().max(160).optional() })).min(1).max(8),
  }),
  LOGOS: z.object({
    eyebrow: eyebrowSchema, heading: headingSchema, description: descriptionSchema,
    items: z.array(z.object({ name: z.string().trim().min(1).max(100), logoUrl: safeUrl, href: optionalUrl })).min(1).max(24),
  }),
  COMPARISON: z.object({
    eyebrow: eyebrowSchema, heading: headingSchema, description: descriptionSchema,
    columns: z.array(z.string().trim().min(1).max(80)).min(2).max(5),
    rows: z.array(z.object({ label: z.string().trim().min(1).max(120), values: z.array(z.union([z.boolean(), z.string().trim().max(120)])).min(2).max(5) })).min(1).max(20),
  }),
  CONTACT: z.object({
    eyebrow: eyebrowSchema, heading: headingSchema, description: descriptionSchema,
    email: z.string().trim().email().max(180).optional(), phone: z.string().trim().max(60).optional(), address: z.string().trim().max(300).optional(), primaryCta: ctaSchema.optional(),
  }),
} as const

export const sectionTypeSchema = z.enum([
  'HERO', 'PROBLEM', 'BENEFITS', 'STEPS', 'MENU_PREVIEW', 'FEATURES', 'TRUST', 'PRICING', 'FAQ', 'CTA',
  'VIDEO', 'IMAGE_TEXT', 'TESTIMONIALS', 'STATS', 'LOGOS', 'COMPARISON', 'CONTACT',
])

export const marketingSectionSchema = z.object({
  id: z.string().uuid(),
  type: sectionTypeSchema,
  content: z.record(z.string(), z.unknown()),
  settings: z.record(z.string(), z.unknown()).default({}),
  analyticsId: z.string().nullable().optional(),
  sortOrder: z.number().int(),
  isVisible: z.boolean(),
})

const navItemSchema = z.object({ label: z.string().trim().min(1).max(80), href: safeUrl })

export const marketingSettingsSchema = z.object({
  brandName: z.string().trim().min(1).max(80),
  logoPath: safeUrl,
  navigation: z.array(navItemSchema).max(10),
  primaryCta: ctaSchema,
  secondaryCta: ctaSchema,
  contact: z.object({
    email: z.string().trim().email().max(180).optional(), phone: z.string().trim().max(60).optional(), address: z.string().trim().max(300).optional(),
    social: z.array(navItemSchema).max(12).optional(),
  }).optional(),
  seo: seoSchema.partial().optional(),
  footer: z.object({
    description: z.string().trim().max(360), navigation: z.array(navItemSchema).max(10), legal: z.array(navItemSchema).max(10), copyright: z.string().trim().max(180),
  }),
})

export const publicMarketingPayloadSchema = z.object({
  page: z.object({
    id: z.string().uuid(), slug: z.string().min(1), revisionId: z.string().uuid(), locale: z.enum(['ar', 'en']),
    title: z.string().min(1), description: z.string().nullable().optional(), seo: seoSchema, publishedAt: z.string().nullable().optional(),
  }),
  settings: z.record(z.string(), z.unknown()),
  sections: z.array(marketingSectionSchema),
})

export const publicPlanSchema = z.object({
  id: z.string().uuid(), name: z.string().min(1), billingCycle: z.string().min(1), price: z.coerce.number().nonnegative(), sortOrder: z.number().int(),
  features: z.array(z.object({ key: z.string(), name: z.string(), included: z.boolean(), value: z.unknown().nullable().optional() })),
})

export const publicPlansSchema = z.array(publicPlanSchema)

export function validateSectionContent(type: z.infer<typeof sectionTypeSchema>, content: unknown) {
  return sectionSchemas[type].safeParse(content)
}
