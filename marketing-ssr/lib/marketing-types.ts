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
  variant: 'primary' | 'secondary'
  trackingId: string
}

export interface MarketingSection<T = Record<string, unknown>> {
  id: string
  type: SectionType
  isVisible: boolean
  sortOrder: number
  content: T
}

export interface MarketingPage {
  slug: string
  locale: Locale
  status: 'published' | 'draft' | 'scheduled' | 'archived'
  title: string
  seo: MarketingSeo
  sections: MarketingSection[]
}

export interface MarketingSiteSettings {
  brandName: string
  logoPath: string
  navigation: Array<{ label: string; href: string }>
  primaryCta: MarketingCta
  secondaryCta: MarketingCta
  footer: {
    description: string
    navigation: Array<{ label: string; href: string }>
    legal: Array<{ label: string; href: string }>
    copyright: string
  }
}
