import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PublishedMarketingPage } from '@/components/marketing/PublishedMarketingPage'
import { legalSeed } from '@/lib/legal-seed'
import { getPublishedPage, getPublishedPlans } from '@/lib/marketing-repository'

const legalKeys = ['privacy', 'terms'] as const
type LegalKey = (typeof legalKeys)[number]

function isLegalKey(value: string): value is LegalKey {
  return legalKeys.includes(value as LegalKey)
}

function marketingMetadata(page: NonNullable<Awaited<ReturnType<typeof getPublishedPage>>>) : Metadata {
  const seo = { ...(page.settings.seo || {}), ...page.page.seo }
  return {
    title: seo.title,
    description: seo.description,
    keywords: seo.keywords,
    alternates: { canonical: seo.canonicalPath },
    robots: seo.robots,
    openGraph: { type: 'website', locale: page.page.locale === 'ar' ? 'ar_SA' : 'en_US', siteName: page.settings.brandName, title: seo.ogTitle || seo.title, description: seo.ogDescription || seo.description, url: seo.canonicalPath, images: seo.ogImage ? [{ url: seo.ogImage, width: 1200, height: 630, alt: seo.ogTitle || seo.title }] : undefined },
    twitter: { card: 'summary_large_image', title: seo.ogTitle || seo.title, description: seo.ogDescription || seo.description, images: seo.ogImage ? [seo.ogImage] : undefined },
  }
}

export function generateStaticParams() {
  return legalKeys.map((legal) => ({ legal }))
}

export async function generateMetadata({ params }: { params: Promise<{ legal: string }> }): Promise<Metadata> {
  const { legal } = await params
  if (isLegalKey(legal)) {
    const page = legalSeed[legal]
    return { title: page.title, description: page.intro, alternates: { canonical: `/${legal}` }, robots: 'index,follow' }
  }
  const page = await getPublishedPage(legal, 'ar')
  return page ? marketingMetadata(page) : {}
}

export default async function MarketingOrLegalPage({ params }: { params: Promise<{ legal: string }> }) {
  const { legal } = await params
  if (isLegalKey(legal)) {
    const page = legalSeed[legal]
    return <main className="legal-page"><div className="container legal-card"><Link href="/" className="back-link">← العودة للرئيسية</Link><p className="eyebrow">SIMSIM</p><h1>{page.title}</h1><p className="legal-intro">{page.intro}</p>{page.sections.map(([heading, text]) => <section key={heading}><h2>{heading}</h2><p>{text}</p></section>)}<p className="legal-updated">آخر تحديث: أغسطس 2026</p></div></main>
  }
  const [marketing, plans] = await Promise.all([getPublishedPage(legal, 'ar'), getPublishedPlans('ar')])
  if (!marketing) notFound()
  return <PublishedMarketingPage page={marketing.page} settings={marketing.settings} plans={plans} />
}
