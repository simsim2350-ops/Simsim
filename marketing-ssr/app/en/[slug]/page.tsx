import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PublishedMarketingPage } from '@/components/marketing/PublishedMarketingPage'
import { getPublishedPage, getPublishedPlans } from '@/lib/marketing-repository'

export const revalidate = 300

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const marketing = await getPublishedPage(slug, 'en')
  if (!marketing) return {}
  const seo = { ...(marketing.settings.seo || {}), ...marketing.page.seo }
  return { title: seo.title, description: seo.description, keywords: seo.keywords, alternates: { canonical: seo.canonicalPath }, robots: seo.robots, openGraph: { type: 'website', locale: 'en_US', siteName: marketing.settings.brandName, title: seo.ogTitle || seo.title, description: seo.ogDescription || seo.description, url: seo.canonicalPath, images: seo.ogImage ? [{ url: seo.ogImage, width: 1200, height: 630, alt: seo.ogTitle || seo.title }] : undefined } }
}

export default async function EnglishMarketingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [marketing, plans] = await Promise.all([getPublishedPage(slug, 'en'), getPublishedPlans('en')])
  if (!marketing) notFound()
  return <PublishedMarketingPage page={marketing.page} settings={marketing.settings} plans={plans} />
}
