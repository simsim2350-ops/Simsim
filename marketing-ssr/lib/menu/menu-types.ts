// ============================================================================
// أنواع بيانات منيو المعاينة (SSR). أعمدة صريحة مطابقة لِما يعرضه التطبيق الحالي،
// مستخرجة من الاستخدام الفعلي في src/features/menu و schema قاعدة البيانات.
// لا نستخدم select("*") — كل عمود مطلوب للعرض فقط (STEP 5).
// ============================================================================

export type MenuLayout = 'list' | 'grid' | 'circles' | 'showcase'

export type OptionChoice = { name?: string; price?: number }
export type OptionGroup = { name?: string; type?: string; choices?: OptionChoice[] }

export interface Restaurant {
  id: string
  slug: string
  name: string
  description: string | null
  description_en: string | null
  phone: string | null
  address: string | null
  logo_url: string | null
  cover_url: string | null
  brand_color: string | null
  price_color: string | null
  description_color: string | null
  menu_layout: MenuLayout | null
  currency: string | null
  social_links: Record<string, string> | null
  allergens: string[] | null
  maps_url: string | null
  delivery_enabled: boolean | null
  delivery_fee: number | null
  show_description: boolean | null
  show_social_links: boolean | null
  show_allergens: boolean | null
  show_hours: boolean | null
  show_prep_time: boolean | null
  is_active: boolean
  platform_suspended: boolean | null
}

export interface Branch {
  id: string
  restaurant_id: string
  is_primary: boolean | null
  name: string | null
  name_en: string | null
  address: string | null
  address_en: string | null
  phone: string | null
  maps_url: string | null
  opening_hours: unknown
  is_active: boolean | null
  sort_order: number | null
  delivery_enabled: boolean | null
  delivery_fee: number | null
  takeaway_enabled: boolean | null
  is_paused: boolean | null
  menu_clone_status: string | null
}

export interface MenuCategory {
  id: string
  name: string
  name_en: string | null
  emoji: string | null
  cover_url: string | null
  sort_order: number | null
  is_visible: boolean | null
  branch_id: string | null
}

export interface MenuProduct {
  id: string
  category_id: string | null
  name: string
  name_en: string | null
  description: string | null
  description_en: string | null
  price: number | null
  compare_price: number | null
  image_url: string | null
  emoji: string | null
  calories: number | null
  is_available: boolean | null
  is_featured: boolean | null
  is_best_seller: boolean | null
  options: OptionGroup[] | null
  sort_order: number | null
  branch_id: string | null
}

export interface MenuData {
  restaurant: Restaurant
  branch: Branch
  categories: MenuCategory[]
  products: MenuProduct[]
  /** الفرع الذي طُلب صراحةً عبر ?branch أو رمز الطاولة، إن وُجد وتم حلّه. */
  requestedBranchId: string | null
  /** رمز الطاولة الخام من ?table (للقراءة فقط في المرحلة 1). */
  tableToken: string | null
}
