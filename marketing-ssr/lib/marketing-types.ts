export type Locale = 'ar' | 'en'

export type SectionType =
  | 'HERO'
  | 'PROBLEM'
  | 'BENEFITS'
  | 'STEPS'
  | 'MENU_PREVIEW'
  | 'FEATURES'
  | 'TRUST'
  | 'PRICING'
  | 'FAQ'
  | 'CTA'
  | 'VIDEO'
  | 'IMAGE_TEXT'
  | 'TESTIMONIALS'
  | 'STATS'
  | 'LOGOS'
  | 'COMPARISON'
  | 'CONTACT'

export interface MarketingSeo {
  title: string
  description: string
  canonicalPath: string
  keywords: string[]
  ogTitle?: string
  ogDescription?: string
  ogImage?: string
  robots?: string
  jsonLd?: Record<string, unknown>[]
}

export interface MarketingCta {
  label: string
  href: string
  variant?: 'primary' | 'secondary'
  trackingId?: string
}

export interface MarketingSection<T = Record<string, unknown>> {
  id: string
  type: SectionType
  isVisible: boolean
  sortOrder: number
  content: T
  settings?: Record<string, unknown>
  analyticsId?: string | null
}

export interface MarketingPage {
  slug: string
  locale: Locale
  status: 'published' | 'draft' | 'scheduled' | 'archived'
  title: string
  seo: MarketingSeo
  sections: MarketingSection[]
}

export interface MarketingNavItem {
  label: string
  href: string
}

export interface MarketingSiteSettings {
  brandName: string
  logoPath: string
  navigation: MarketingNavItem[]
  primaryCta: MarketingCta
  secondaryCta: MarketingCta
  contact?: {
    email?: string
    phone?: string
    address?: string
    social?: Array<{ label: string; href: string }>
  }
  seo?: Partial<MarketingSeo>
  footer: {
    description: string
    navigation: MarketingNavItem[]
    legal: MarketingNavItem[]
    copyright: string
  }
}
