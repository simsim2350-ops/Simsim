// Minimal, read-only types for the Phase 2 POC — only the columns actually
// rendered. Not a full port of the existing app's data model.

// Social link keys shown by the old menu's header (src/features/menu/SocialIcons.jsx) —
// only these three are ever rendered there; other keys in the JSONB (if any) are ignored,
// matching that exact behavior.
export type SocialLinks = Partial<Record<'instagram' | 'whatsapp_social' | 'snapchat', string>>

export type Allergen = { label?: string; label_en?: string; name?: string; icon?: string } | string

// The 4 real values written by the Admin Dashboard's "شكل عرض الأصناف" setting
// (src/pages/Settings.jsx) — 'list' is both the DB default and the layout
// menu-next's ProductCard already renders unconditionally, so only the other
// three actually change anything (see ProductCard.tsx).
export type MenuLayout = 'list' | 'grid' | 'showcase' | 'circles'

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
  delivery_enabled: boolean | null
  delivery_fee: number | null
  phone: string | null
  address: string | null
  maps_url: string | null
  social_links: SocialLinks | null
  allergens: Allergen[] | null
  show_social_links: boolean | null
  show_allergens: boolean | null
  show_hours: boolean | null
  show_description: boolean | null
  show_prep_time: boolean | null
  recommendations_enabled: boolean | null
  recommendations_count: number | null
  // Full-bleed banner behind the header (Admin's "Cover upload", distinct
  // from the small circular `logo_url`) — restaurant-scoped, not per-branch.
  cover_url: string | null
  menu_layout: MenuLayout | null
}

export type OpeningHoursDay = { open: boolean; from: string; to: string }

export type Branch = {
  id: string
  restaurant_id: string
  name: string
  name_en: string | null
  is_active: boolean
  is_primary: boolean
  sort_order: number
  delivery_enabled: boolean | null
  delivery_fee: number | null
  takeaway_enabled: boolean | null
  opening_hours: OpeningHoursDay[] | null
  is_paused: boolean | null
  address: string | null
  address_en: string | null
  maps_url: string | null
  phone: string | null
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
  // Raw products.options JSONB — untyped/untrusted at this layer on purpose
  // (no DB constraint on its shape). Normalize with normalizeOptionGroups()
  // before use; never assume it's an array or that entries are well-formed.
  options: unknown
  is_featured: boolean | null
  is_best_seller: boolean | null
  calories: number | null
}

// One real, active row from restaurant_tables — only what
// get_branch_tables_for_menu exposes (never qr_token or any other column).
// Used for the branch-URL (no QR) manual table-selection dropdown; a
// resolved table QR never needs this, since it already carries its own
// trusted table name/id from resolveTableQr().
export type Table = { id: string; table_number: string }

export type Lang = 'ar' | 'en'

// get_restaurant_rating's real shape (verified live against the database) —
// null when the restaurant has zero reviews, matching the old menu's own
// "only show a rating once at least one review exists" rule.
export type Rating = { avg: number; count: number } | null
