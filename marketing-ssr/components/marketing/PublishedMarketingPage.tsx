import { MarketingFooter, MarketingHeader } from '@/components/marketing/MarketingChrome'
import { SectionRenderer } from '@/components/marketing/SectionRenderer'
import type { MarketingPage, MarketingSiteSettings } from '@/lib/marketing-types'
import type { z } from 'zod'
import type { publicPlanSchema } from '@/lib/marketing-schemas'

type PublicPlan = z.infer<typeof publicPlanSchema>

export function PublishedMarketingPage({ page, settings, plans }: { page: MarketingPage; settings: MarketingSiteSettings; plans: PublicPlan[] }) {
  const sections = page.sections.filter((section) => section.isVisible).sort((a, b) => a.sortOrder - b.sortOrder)
  return <>
    <MarketingHeader settings={settings} />
    <main>{sections.map((section) => <SectionRenderer key={section.id} section={section} plans={plans} />)}</main>
    <MarketingFooter settings={settings} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(page.seo.jsonLd || []) }} />
  </>
}
