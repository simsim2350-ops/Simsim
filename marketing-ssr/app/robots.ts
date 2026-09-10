import type { MetadataRoute } from 'next'
import { marketingSiteUrl } from '@/lib/site-url'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/preview', '/api/', '/login', '/register', '/forgot-password', '/reset-password', '/dashboard', '/admin', '/onboarding', '/billing', '/settings'],
    },
    sitemap: new URL('/sitemap.xml', marketingSiteUrl()).toString(),
  }
}
