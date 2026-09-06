// Same shape as production's `banners`/`coupons` tables (select('*') there, so
// this type only names the fields these components actually read — extra
// columns are simply ignored, same tolerance src/features/menu/BannerDisplays.jsx
// and MenuOffersDrawer.jsx already have).
export type DisplayMode = 'fullscreen' | 'popup' | 'top' | 'inline' | 'floating'
export type DisplayFrequency = 'every_visit' | 'once_per_visitor' | 'delayed'

export type Banner = {
  id: string
  restaurant_id: string
  branch_id: string | null
  title: string
  subtitle: string | null
  image_url: string | null
  display_mode: string | null
  display_frequency: string | null
  display_priority: number | null
  sort_order: number | null
  display_delay_seconds: number | null
  visitor_cooldown_hours: number | null
  cta_text: string | null
  is_active: boolean
  starts_at: string | null
  ends_at: string | null
}

// The offers-drawer's own "currently active coupons to advertise" list — a
// different read than CheckoutForm.tsx's apply-by-code lookup (Phase 3): that
// one fetches a single coupon matching a customer-typed code; this one lists
// every active coupon for display, same table, same restaurant/branch scope.
export type DisplayCoupon = {
  id: string
  restaurant_id: string
  branch_id: string | null
  code: string
  discount_type: 'percent' | 'fixed'
  discount_value: number
  expires_at: string | null
  is_active: boolean
}
