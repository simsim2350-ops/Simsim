import type { Metadata } from 'next'
import { MarketingFooter, MarketingHeader } from '@/components/marketing/MarketingChrome'
import { SectionRenderer } from '@/components/marketing/SectionRenderer'
import { getPublishedHome, getPublishedPlans } from '@/lib/marketing-repository'

export const revalidate = 300

export async function generateMetadata(): Promise<Metadata> {
  const { page } = await getPublishedHome()
  const seo = page.seo
  return {
    title: seo.title,
    description: seo.description,
    keywords: seo.keywords,
    alternates: { canonical: seo.canonicalPath },
    robots: seo.robots,
    openGraph: {
      type: 'website',
      locale: page.locale === 'ar' ? 'ar_SA' : 'en_US',
      title: seo.ogTitle || seo.title,
      description: seo.ogDescription || seo.description,
      url: seo.canonicalPath,
      images: seo.ogImage ? [{ url: seo.ogImage, width: 1200, height: 630, alt: seo.ogTitle || seo.title }] : undefined,
    },
    twitter: { card: 'summary_large_image', title: seo.ogTitle || seo.title, description: seo.ogDescription || seo.description, images: seo.ogImage ? [seo.ogImage] : undefined },
  }
}

export default async function HomePage() {
  const [{ page, settings }, plans] = await Promise.all([getPublishedHome(), getPublishedPlans()])
  const sections = page.sections.filter((section) => section.isVisible).sort((a, b) => a.sortOrder - b.sortOrder)
  return <><MarketingHeader settings={settings} /><main>{sections.map((section) => <SectionRenderer key={section.id} section={section} plans={plans} />)}</main><MarketingFooter settings={settings} /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(page.seo.jsonLd || []) }} /></>
}
