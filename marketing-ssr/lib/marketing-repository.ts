import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { homePageSeed, marketingSettingsSeed } from './marketing-seed'
import { marketingSettingsSchema, publicMarketingPayloadSchema, publicPlansSchema } from './marketing-schemas'
import type { MarketingPage, MarketingSiteSettings } from './marketing-types'

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
  const siteSettings = marketingSettingsSeed
  const settingsParsed = marketingSettingsSchema.safeParse(settings)
  const candidateSettings = settingsParsed.success ? settingsParsed.data : {}
  const resolvedSettings = {
    ...siteSettings,
    ...(candidateSettings as Partial<MarketingSiteSettings>),
    footer: { ...siteSettings.footer, ...((candidateSettings as Partial<MarketingSiteSettings>).footer || {}) },
  } as MarketingSiteSettings
  return {
    page: {
      slug: page.slug,
      locale: page.locale,
      status: 'published',
      title: page.title,
      seo: page.seo,
      sections: sections.map((section) => ({
        id: section.id,
        type: section.type,
        content: section.content,
        settings: section.settings,
        sortOrder: section.sortOrder,
        isVisible: section.isVisible,
      })),
    },
    settings: resolvedSettings,
  }
}

async function loadPublishedHome() {
  const supabase = publicClient()
  if (!supabase) return null
  const { data, error } = await supabase.rpc('marketing_public_page', { p_slug: 'home', p_locale: 'ar' })
  if (error) {
    console.error('[marketing] failed to load published page', error.message)
    return null
  }
  return mapPublishedPage(data)
}

const getCachedPublishedHome = unstable_cache(loadPublishedHome, ['marketing-home-ar'], { revalidate: 300, tags: ['marketing-page:home:ar', 'marketing-settings:ar'] })

export async function getPublishedHome() {
  return (await getCachedPublishedHome()) || { page: homePageSeed, settings: marketingSettingsSeed, isFallback: true }
}

async function loadPublishedPlans() {
  const supabase = publicClient()
  if (!supabase) return []
  const { data, error } = await supabase.rpc('marketing_public_plans', { p_locale: 'ar' })
  if (error) {
    console.error('[marketing] failed to load plans', error.message)
    return []
  }
  const parsed = publicPlansSchema.safeParse(data)
  return parsed.success ? parsed.data : []
}

export const getPublishedPlans = unstable_cache(loadPublishedPlans, ['marketing-plans-ar'], { revalidate: 300, tags: ['marketing-plans:ar'] })

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
