import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { z } from 'zod'
import { homePageSeed, marketingSettingsSeed } from './marketing-seed'
import { marketingSettingsSchema, publicMarketingPayloadSchema, publicPlansSchema } from './marketing-schemas'
import type { Locale, MarketingPage, MarketingSiteSettings } from './marketing-types'

export const SUPPORTED_LOCALES: Locale[] = ['ar', 'en']

function publicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function mapPublishedPage(raw: unknown): { page: MarketingPage; settings: MarketingSiteSettings } | null {
  const parsed = publicMarketingPayloadSchema.safeParse(raw)
  if (!parsed.success) return null
  const { page, settings, sections } = parsed.data
  const candidate = marketingSettingsSchema.safeParse(settings)
  const partial: Partial<MarketingSiteSettings> = candidate.success ? candidate.data : {}
  const resolvedSettings = {
    ...marketingSettingsSeed,
    ...partial,
    footer: { ...marketingSettingsSeed.footer, ...(partial.footer || {}) },
  } as MarketingSiteSettings
  return {
    page: {
      slug: page.slug,
      locale: page.locale,
      status: 'published',
      title: page.title,
      seo: page.seo,
      sections: sections.map((section) => ({
        id: section.id, type: section.type, content: section.content, settings: section.settings,
        analyticsId: section.analyticsId, sortOrder: section.sortOrder, isVisible: section.isVisible,
      })),
    },
    settings: resolvedSettings,
  }
}

async function loadPublishedPage(slug: string, locale: Locale) {
  const supabase = publicClient()
  if (!supabase) return null
  const { data, error } = await supabase.rpc('marketing_public_page', { p_slug: slug, p_locale: locale })
  if (error) {
    console.error('[marketing] failed to load published page', error.message)
    return null
  }
  return mapPublishedPage(data)
}

function pageCache(slug: string, locale: Locale) {
  return unstable_cache(
    () => loadPublishedPage(slug, locale),
    ['marketing-page', slug, locale],
    { revalidate: 300, tags: [`marketing-page:${slug}:${locale}`, `marketing-settings:${locale}`] },
  )
}

export async function getPublishedPage(slug: string, locale: Locale): Promise<{ page: MarketingPage; settings: MarketingSiteSettings; isFallback?: boolean } | null> {
  const published = await pageCache(slug, locale)()
  if (published) return published
  if (slug === 'home' && locale === 'ar') return { page: homePageSeed, settings: marketingSettingsSeed, isFallback: true }
  return null
}

export async function getPublishedHome() {
  return getPublishedPage('home', 'ar').then((value) => value || { page: homePageSeed, settings: marketingSettingsSeed, isFallback: true })
}

async function loadPublishedPlans(locale: Locale) {
  const supabase = publicClient()
  if (!supabase) return []
  const { data, error } = await supabase.rpc('marketing_public_plans', { p_locale: locale })
  if (error) {
    console.error('[marketing] failed to load plans', error.message)
    return []
  }
  const parsed = publicPlansSchema.safeParse(data)
  return parsed.success ? parsed.data : []
}

export function getPublishedPlans(locale: Locale = 'ar') {
  return unstable_cache(
    () => loadPublishedPlans(locale),
    ['marketing-plans', locale],
    { revalidate: 300, tags: [`marketing-plans:${locale}`] },
  )()
}

const publicPageIndexSchema = z.array(z.object({
  slug: z.string().min(1),
  locale: z.enum(['ar', 'en']),
  publishedAt: z.string().nullable().optional(),
}))

export function getPublishedPageIndex(locale: Locale) {
  return unstable_cache(
    async () => {
      const supabase = publicClient()
      if (!supabase) return []
      const { data, error } = await supabase.rpc('marketing_public_pages', { p_locale: locale })
      if (error) {
        console.error('[marketing] failed to load published page index', error.message)
        return []
      }
      const parsed = publicPageIndexSchema.safeParse(data)
      return parsed.success ? parsed.data : []
    },
    ['marketing-page-index', locale],
    { revalidate: 300, tags: [`marketing-page-index:${locale}`, `marketing-settings:${locale}`] },
  )()
}

export async function getPreviewPage(token: string) {
  const supabase = publicClient()
  if (!supabase || !token || !/^[a-f0-9]{64}$/i.test(token)) return null
  const { data, error } = await supabase.rpc('marketing_preview_page', { p_token: token })
  if (error) {
    console.error('[marketing] failed to load preview', error.message)
    return null
  }
  return mapPublishedPage(data)
}
