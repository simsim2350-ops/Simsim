import type { Metadata } from 'next'
import { PublishedMarketingPage } from '@/components/marketing/PublishedMarketingPage'
import { getPublishedHome, getPublishedPlans } from '@/lib/marketing-repository'

// Keep data cached through unstable_cache tags, while rendering HTML per request.
// This prevents a Vercel Full Route Cache entry from masking a successful tag revalidation.
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const marketing = await getPublishedHome()
  const seo = { ...(marketing.settings.seo || {}), ...marketing.page.seo }
  return {
    title: seo.title,
    description: seo.description,
    keywords: seo.keywords,
    alternates: { canonical: seo.canonicalPath },
    robots: seo.robots,
    openGraph: { type: 'website', locale: 'ar_SA', siteName: marketing.settings.brandName, title: seo.ogTitle || seo.title, description: seo.ogDescription || seo.description, url: seo.canonicalPath, images: seo.ogImage ? [{ url: seo.ogImage, width: 1200, height: 630, alt: seo.ogTitle || seo.title }] : undefined },
    twitter: { card: 'summary_large_image', title: seo.ogTitle || seo.title, description: seo.ogDescription || seo.description, images: seo.ogImage ? [seo.ogImage] : undefined },
  }
}

export default async function HomePage() {
  const [marketing, plans] = await Promise.all([getPublishedHome(), getPublishedPlans('ar')])
  return <PublishedMarketingPage page={marketing.page} settings={marketing.settings} plans={plans} />
}
