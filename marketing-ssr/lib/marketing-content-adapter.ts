import type { z } from 'zod'
import { sectionSchemas, validateSectionContent } from './marketing-schemas'
import type { MarketingPage, MarketingSection, SectionType } from './marketing-types'

export type HeroContent = z.infer<typeof sectionSchemas.HERO>
export type ProblemContent = z.infer<typeof sectionSchemas.PROBLEM>
export type BenefitsContent = z.infer<typeof sectionSchemas.BENEFITS>
export type StepsContent = z.infer<typeof sectionSchemas.STEPS>
export type MenuPreviewContent = z.infer<typeof sectionSchemas.MENU_PREVIEW>
export type FeaturesContent = z.infer<typeof sectionSchemas.FEATURES>
export type TrustContent = z.infer<typeof sectionSchemas.TRUST>
export type PricingContent = z.infer<typeof sectionSchemas.PRICING>
export type FaqContent = z.infer<typeof sectionSchemas.FAQ>
export type CtaContent = z.infer<typeof sectionSchemas.CTA>
export type VideoContent = z.infer<typeof sectionSchemas.VIDEO>
export type ImageTextContent = z.infer<typeof sectionSchemas.IMAGE_TEXT>
export type TestimonialsContent = z.infer<typeof sectionSchemas.TESTIMONIALS>
export type StatsContent = z.infer<typeof sectionSchemas.STATS>
export type LogosContent = z.infer<typeof sectionSchemas.LOGOS>
export type ComparisonContent = z.infer<typeof sectionSchemas.COMPARISON>
export type ContactContent = z.infer<typeof sectionSchemas.CONTACT>

export type SectionContentByType = {
  HERO: HeroContent
  PROBLEM: ProblemContent
  BENEFITS: BenefitsContent
  STEPS: StepsContent
  MENU_PREVIEW: MenuPreviewContent
  FEATURES: FeaturesContent
  TRUST: TrustContent
  PRICING: PricingContent
  FAQ: FaqContent
  CTA: CtaContent
  VIDEO: VideoContent
  IMAGE_TEXT: ImageTextContent
  TESTIMONIALS: TestimonialsContent
  STATS: StatsContent
  LOGOS: LogosContent
  COMPARISON: ComparisonContent
  CONTACT: ContactContent
}

export type NormalizedSection<T extends SectionType = SectionType> = {
  id: string
  type: T
  isVisible: boolean
  sortOrder: number
  analyticsId?: string | null
  content: SectionContentByType[T]
}

export type NormalizedPage = Omit<MarketingPage, 'sections'> & { sections: NormalizedSection[] }

// Invalid/unrecognized sections are logged and skipped rather than failing the whole page.
export function normalizeSection(section: MarketingSection): NormalizedSection | null {
  if (!(section.type in sectionSchemas)) {
    console.error('[marketing-content-adapter] unknown section type', section.type, section.id)
    return null
  }
  const parsed = validateSectionContent(section.type as keyof typeof sectionSchemas, section.content)
  if (!parsed.success) {
    console.error('[marketing-content-adapter] invalid section content, skipping', section.type, section.id, parsed.error.flatten())
    return null
  }
  return {
    id: section.id,
    type: section.type,
    isVisible: section.isVisible,
    sortOrder: section.sortOrder,
    analyticsId: section.analyticsId,
    content: parsed.data as SectionContentByType[typeof section.type],
  }
}

export function normalizePage(page: MarketingPage): NormalizedPage {
  const sections = page.sections
    .map((section) => normalizeSection(section))
    .filter((section): section is NormalizedSection => section !== null)
  return { ...page, sections }
}
