// أنواع بيانات عرض المنيو العام (Phase 1 — قراءة فقط).
// تقتصر على الأعمدة التي يعرضها منيو العميل فعلياً؛ لا أسرار ولا حقول إدارية.

export type MenuLayout = 'list' | 'grid' | 'circles' | 'showcase'

export interface OpeningHoursDay {
  open: boolean
  from?: string
  to?: string
}

export interface MenuRestaurant {
  id: string
  slug: string
  name: string
  name_en: string | null
  description: string | null
  description_en: string | null
  logo_url: string | null
  cover_url: string | null
  brand_color: string | null
  price_color: string | null
  description_color: string | null
  menu_layout: MenuLayout | null
  phone: string | null
  address: string | null
  maps_url: string | null
  social_links: Record<string, string> | null
  show_social_links: boolean | null
  show_description: boolean | null
  show_hours: boolean | null
  show_prep_time: boolean | null
  show_allergens: boolean | null
  allergens: string[] | null
  opening_hours: OpeningHoursDay[] | null
  delivery_enabled: boolean | null
  delivery_fee: number | null
}

export interface MenuBranch {
  id: string
  restaurant_id: string
  name: string | null
  name_en: string | null
  address: string | null
  address_en: string | null
  phone: string | null
  maps_url: string | null
  is_primary: boolean | null
  sort_order: number | null
  menu_clone_status: string | null
  opening_hours: OpeningHoursDay[] | null
  is_paused: boolean | null
  delivery_enabled: boolean | null
  delivery_fee: number | null
  takeaway_enabled: boolean | null
}

export interface MenuCategory {
  id: string
  name: string
  name_en: string | null
  emoji: string | null
  cover_url: string | null
  sort_order: number | null
  branch_id: string
}

export interface MenuProductOptionChoice {
  name: string
  name_en?: string
  price?: number
}

export interface MenuProductOptionGroup {
  name: string
  type?: 'single' | 'multiple'
  choices?: MenuProductOptionChoice[]
}

export interface MenuProduct {
  id: string
  category_id: string | null
  name: string
  name_en: string | null
  description: string | null
  description_en: string | null
  price: number
  compare_price: number | null
  image_url: string | null
  emoji: string | null
  calories: number | null
  options: MenuProductOptionGroup[] | null
  is_featured: boolean | null
  is_best_seller: boolean | null
  sort_order: number | null
}

export interface MenuData {
  restaurant: MenuRestaurant
  branch: MenuBranch
  categories: MenuCategory[]
  products: MenuProduct[]
  manualBestSellers: MenuProduct[]
  featuredProducts: MenuProduct[]
  branding: MenuBranding | null
}

export interface MenuBranding {
  show?: boolean
  variant?: 'text' | 'logo' | 'text_logo'
  text?: string
  url?: string
}
