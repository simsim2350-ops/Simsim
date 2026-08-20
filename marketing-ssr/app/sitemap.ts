import type { MetadataRoute } from 'next'
import { getPublishedHome } from '@/lib/marketing-repository'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { page } = await getPublishedHome()
  const base = process.env.MARKETING_SITE_URL || 'https://marketing.simsimmenu.com'
  return [
    { url: new URL(page.seo.canonicalPath, base).toString(), lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: new URL('/privacy', base).toString(), lastModified: new Date('2026-08-01'), changeFrequency: 'yearly', priority: 0.2 },
    { url: new URL('/terms', base).toString(), lastModified: new Date('2026-08-01'), changeFrequency: 'yearly', priority: 0.2 },
  ]
}
