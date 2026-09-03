// Minimal, read-only types for the Phase 2 POC — only the columns actually
// rendered. Not a full port of the existing app's data model.

export type Restaurant = {
  id: string
  slug: string
  name: string
  description: string | null
  description_en: string | null
  logo_url: string | null
  brand_color: string | null
  price_color: string | null
  description_color: string | null
  currency: string | null
  is_active: boolean
}

export type Branch = {
  id: string
  restaurant_id: string
  name: string
  name_en: string | null
  is_active: boolean
  is_primary: boolean
  sort_order: number
}

export type Category = {
  id: string
  branch_id: string
  name: string
  name_en: string | null
  emoji: string | null
  cover_url: string | null
  sort_order: number
  is_visible: boolean
}

export type Product = {
  id: string
  branch_id: string
  category_id: string | null
  name: string
  name_en: string | null
  description: string | null
  description_en: string | null
  price: number
  compare_price: number | null
  image_url: string | null
  emoji: string | null
  is_available: boolean
  sort_order: number
}

export type Lang = 'ar' | 'en'
