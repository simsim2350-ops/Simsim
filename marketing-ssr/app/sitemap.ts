import type { MetadataRoute } from 'next'
import { getPublishedPageIndex } from '@/lib/marketing-repository'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [arabic, english] = await Promise.all([getPublishedPageIndex('ar'), getPublishedPageIndex('en')])
  const base = process.env.MARKETING_SITE_URL || 'https://marketing.simsimmenu.com'
  const pages = [...arabic, ...english].map((page) => {
    const path = page.locale === 'ar' ? (page.slug === 'home' ? '/' : `/${page.slug}`) : (page.slug === 'home' ? '/en' : `/en/${page.slug}`)
    return { url: new URL(path, base).toString(), lastModified: page.publishedAt ? new Date(page.publishedAt) : new Date(), changeFrequency: 'weekly' as const, priority: page.slug === 'home' ? 1 : 0.7 }
  })
  return [
    ...pages,
    { url: new URL('/privacy', base).toString(), lastModified: new Date('2026-08-01'), changeFrequency: 'yearly', priority: 0.2 },
    { url: new URL('/terms', base).toString(), lastModified: new Date('2026-08-01'), changeFrequency: 'yearly', priority: 0.2 },
  ]
}
