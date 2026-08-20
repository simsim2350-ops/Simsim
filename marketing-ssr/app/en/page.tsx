import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PublishedMarketingPage } from '@/components/marketing/PublishedMarketingPage'
import { getPublishedPage, getPublishedPlans } from '@/lib/marketing-repository'

export const revalidate = 300

export async function generateMetadata(): Promise<Metadata> {
  const marketing = await getPublishedPage('home', 'en')
  if (!marketing) return { robots: 'noindex,nofollow' }
  const seo = { ...(marketing.settings.seo || {}), ...marketing.page.seo }
  return { title: seo.title, description: seo.description, keywords: seo.keywords, alternates: { canonical: seo.canonicalPath }, robots: seo.robots, openGraph: { type: 'website', locale: 'en_US', title: seo.ogTitle || seo.title, description: seo.ogDescription || seo.description, url: seo.canonicalPath, images: seo.ogImage ? [{ url: seo.ogImage, width: 1200, height: 630, alt: seo.ogTitle || seo.title }] : undefined } }
}

export default async function EnglishHomePage() {
  const [marketing, plans] = await Promise.all([getPublishedPage('home', 'en'), getPublishedPlans('en')])
  if (!marketing) notFound()
  return <PublishedMarketingPage page={marketing.page} settings={marketing.settings} plans={plans} />
}
