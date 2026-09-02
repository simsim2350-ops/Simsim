import { notFound } from 'next/navigation'
import { MarketingFooter, MarketingHeader } from '@/components/marketing/MarketingChrome'
import { RevealOnScroll } from '@/components/marketing/RevealOnScroll'
import { SectionRenderer } from '@/components/marketing/SectionRenderer'
import { normalizePage } from '@/lib/marketing-content-adapter'
import { getPreviewPage, getPublishedPlans } from '@/lib/marketing-repository'

export const metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  const [preview, plans] = await Promise.all([getPreviewPage(token || ''), getPublishedPlans()])
  if (!preview) notFound()
  const sections = normalizePage(preview.page).sections.filter((section) => section.isVisible).sort((a, b) => a.sortOrder - b.sortOrder)
  let featuresSeen = 0
  return <div className="ss-landing">
    <div style={{ position: 'sticky', top: 0, zIndex: 70, padding: '9px 18px', background: '#7c2d12', color: 'white', textAlign: 'center', fontFamily: 'Tajawal,Arial,sans-serif', fontWeight: 800, fontSize: 13 }}>معاينة غير منشورة — لا يراها الزوار ولا تُفهرس</div>
    <RevealOnScroll />
    <MarketingHeader settings={preview.settings} />
    <main>{sections.map((section) => { const isFirstOfType = section.type === 'FEATURES' ? featuresSeen++ === 0 : undefined; return <SectionRenderer key={section.id} section={section} plans={plans} isFirstOfType={isFirstOfType} /> })}</main>
    <MarketingFooter settings={preview.settings} />
  </div>
}
