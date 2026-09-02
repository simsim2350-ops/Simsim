import { MarketingFooter, MarketingHeader } from '@/components/marketing/MarketingChrome'
import { RevealOnScroll } from '@/components/marketing/RevealOnScroll'
import { SectionRenderer } from '@/components/marketing/SectionRenderer'
import { normalizePage, type NormalizedSection } from '@/lib/marketing-content-adapter'
import type { MarketingPage, MarketingSiteSettings } from '@/lib/marketing-types'
import type { z } from 'zod'
import type { publicPlanSchema } from '@/lib/marketing-schemas'

type PublicPlan = z.infer<typeof publicPlanSchema>

// Builds Google-valid FAQPage structured data directly from the page's own published FAQ
// section content — never hardcoded, so it always matches whatever is actually live.
function faqJsonLd(sections: NormalizedSection[]) {
  const faq = sections.find((section): section is NormalizedSection<'FAQ'> => section.type === 'FAQ')
  if (!faq || faq.content.items.length === 0) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.content.items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }
}

export function PublishedMarketingPage({ page, settings, plans }: { page: MarketingPage; settings: MarketingSiteSettings; plans: PublicPlan[] }) {
  const sections = normalizePage(page).sections.filter((section) => section.isVisible).sort((a, b) => a.sortOrder - b.sortOrder)
  let featuresSeen = 0
  const faq = faqJsonLd(sections)
  return <div className={`ss-landing${page.locale === 'en' ? ' ss-ltr' : ''}`} dir={page.locale === 'en' ? 'ltr' : 'rtl'}>
    <RevealOnScroll />
    <MarketingHeader settings={settings} />
    <main>{sections.map((section) => {
      const isFirstOfType = section.type === 'FEATURES' ? featuresSeen++ === 0 : undefined
      return <SectionRenderer key={section.id} section={section} plans={plans} isFirstOfType={isFirstOfType} />
    })}</main>
    <MarketingFooter settings={settings} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(page.seo.jsonLd || []) }} />
    {faq && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }} />}
  </div>
}
