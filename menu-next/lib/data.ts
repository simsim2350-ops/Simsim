import { cache } from 'react'
import { supabaseServer } from './supabase/server'
import type { Restaurant, Branch, Category, Product, Rating, Table } from './types'
import type { Banner, DisplayCoupon } from './banners/types'

// Data access only — no rendering here. Mirrors the exact same read pattern
// (tables, filters, ordering) as the current production menu's useMenuData.js,
// against the same RLS policies already in production. No new RPC, no schema
// change, no service_role.

export async function getRestaurantBySlug(slug: string): Promise<Restaurant | null> {
  const supabase = supabaseServer()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('restaurants')
    .select('id, slug, name, description, description_en, logo_url, brand_color, price_color, description_color, currency, is_active, delivery_enabled, delivery_fee, phone, address, maps_url, social_links, allergens, show_social_links, show_allergens, show_hours, show_description, show_prep_time, recommendations_enabled, recommendations_count, cover_url, menu_layout')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()
  if (error || !data) return null
  return data as Restaurant
}

export async function getActiveBranches(restaurantId: string): Promise<Branch[]> {
  const supabase = supabaseServer()
  if (!supabase) return []
  const { data, error } = await supabase
    .from('branches')
    .select('id, restaurant_id, name, name_en, is_active, is_primary, sort_order, delivery_enabled, delivery_fee, takeaway_enabled, opening_hours, is_paused, address, address_en, maps_url, phone, menu_clone_status')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .order('sort_order')
  if (error || !data) return []
  // Same exclusion as the old menu's useMenuData.js: a branch whose menu clone is still in
  // progress or failed has no reliable menu content yet — never offer it as selectable.
  return (data as (Branch & { menu_clone_status: string | null })[])
    .filter((b) => b.menu_clone_status !== 'copying' && b.menu_clone_status !== 'failed')
}

export function pickBranch(branches: Branch[], branchId?: string): Branch | null {
  if (branchId) {
    const match = branches.find((b) => b.id === branchId)
    if (match) return match
  }
  return branches.find((b) => b.is_primary) ?? branches[0] ?? null
}

export async function getVisibleCategories(branchId: string): Promise<Category[]> {
  const supabase = supabaseServer()
  if (!supabase) return []
  const { data, error } = await supabase
    .from('categories')
    .select('id, branch_id, name, name_en, emoji, cover_url, sort_order, is_visible')
    .eq('branch_id', branchId)
    .eq('is_visible', true)
    .order('sort_order')
  if (error || !data) return []
  return data as Category[]
}

export async function getAvailableProducts(branchId: string): Promise<Product[]> {
  const supabase = supabaseServer()
  if (!supabase) return []
  const { data, error } = await supabase
    .from('products')
    .select('id, branch_id, category_id, name, name_en, description, description_en, price, compare_price, image_url, emoji, is_available, sort_order, options, is_featured, is_best_seller, calories')
    .eq('branch_id', branchId)
    .eq('is_available', true)
    .order('sort_order')
  if (error || !data) return []
  return data as Product[]
}

// Rating — same RPC and "hide until at least one real review exists" rule as the old
// menu's useMenuData.js (get_restaurant_rating, unchanged, already live in production).
export async function getRestaurantRating(restaurantId: string): Promise<Rating> {
  const supabase = supabaseServer()
  if (!supabase) return null
  const { data, error } = await supabase.rpc('get_restaurant_rating', { p_restaurant_id: restaurantId } as never)
  if (error) return null
  const row = (Array.isArray(data) ? data[0] : data) as { avg_rating: number; review_count: number } | null
  if (!row || Number(row.review_count) <= 0) return null
  return { avg: Number(row.avg_rating), count: Number(row.review_count) }
}

// "يعجب زبائننا" (Customer Favorites) — ported verbatim from useMenuData.js: rank the branch's
// own available products by total quantity ordered across get_recent_order_items' real,
// non-cancelled orders from the last 30 days (that RPC's own window — unchanged), top 4.
// Same RPC already live and already used for this exact purpose in the old menu.
export async function getCustomerFavorites(restaurantId: string, products: Product[]): Promise<Product[]> {
  if (products.length === 0) return []
  const supabase = supabaseServer()
  if (!supabase) return []
  const { data, error } = await supabase.rpc('get_recent_order_items', { p_restaurant_id: restaurantId } as never)
  if (error || !Array.isArray(data)) return []
  const salesCount: Record<string, number> = {}
  for (const order of data as { items: unknown }[]) {
    const items = Array.isArray(order.items) ? (order.items as { id: string; qty?: number; unavailable?: boolean }[]) : []
    for (const item of items) {
      if (item.unavailable) continue
      salesCount[item.id] = (salesCount[item.id] || 0) + (item.qty || 1)
    }
  }
  return products
    .filter((p) => salesCount[p.id] > 0)
    .sort((a, b) => salesCount[b.id] - salesCount[a.id])
    .slice(0, 4)
}

// Cart-wide recommendations (owner-curated, shown regardless of what's in the
// cart) — same table/filters as src/lib/recommendationsApi.js's
// fetchActiveCartWideIds, unchanged. Read-only, same public RLS policy
// ("Public can read active cart-wide recommendations") already in production.
export async function getActiveCartWideIds(restaurantId: string, branchId: string): Promise<string[]> {
  const supabase = supabaseServer()
  if (!supabase) return []
  const { data, error } = await supabase
    .from('cart_wide_recommendations')
    .select('product_id')
    .eq('restaurant_id', restaurantId)
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('priority')
  if (error || !data) return []
  return (data as { product_id: string }[]).map((r) => r.product_id)
}

// Banners (#2b) — same table/filters/ordering as production's useMenuData.js:
// select('*') by restaurant, is_active, ordered by display_priority desc then
// sort_order, then the same client-side branch-scope + starts/ends-at window
// filter (`relevant`) that file applies after the fetch. Not a new read
// pattern — ported exactly, including the "select *" (matches whatever
// columns the admin UI's banner form actually writes, without guessing a
// trimmed column list).
export async function getActiveBanners(restaurantId: string, branchId: string): Promise<Banner[]> {
  const supabase = supabaseServer()
  if (!supabase) return []
  const { data, error } = await supabase
    .from('banners')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .order('display_priority', { ascending: false })
    .order('sort_order')
  if (error || !data) return []
  const now = new Date().toISOString()
  const relevant = (row: Banner) => !row.branch_id || row.branch_id === branchId
  return (data as Banner[]).filter(
    (b) => relevant(b) && (!b.starts_at || b.starts_at <= now) && (!b.ends_at || b.ends_at >= now)
  )
}

// The offers-drawer's "currently active coupons to advertise" list — same
// table as Phase 3's coupon-apply lookup in CheckoutForm.tsx, but a different,
// unrelated read (all active coupons for display vs. one matched by a typed
// code) — same filters as production's useMenuData.js (is_active + the same
// branch-scope + not-yet-expired window).
export async function getActiveCouponsForDisplay(restaurantId: string, branchId: string): Promise<DisplayCoupon[]> {
  const supabase = supabaseServer()
  if (!supabase) return []
  const { data, error } = await supabase
    .from('coupons')
    .select('id, restaurant_id, branch_id, code, discount_type, discount_value, expires_at, is_active')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
  if (error || !data) return []
  const now = new Date().toISOString()
  const relevant = (row: DisplayCoupon) => !row.branch_id || row.branch_id === branchId
  return (data as DisplayCoupon[]).filter((c) => relevant(c) && (!c.expires_at || c.expires_at >= now))
}

// Per-product companion recommendations (#3b, "goes well with X") — same
// table/filters as src/lib/recommendationsApi.js's fetchActiveRecommendationsMap,
// unchanged. Returned as a plain object (not a Map) because this crosses into
// Client Components as a prop, and Maps aren't serializable across the
// Server/Client boundary — a representation change only, not a data-structure
// or query change at the source.
export async function getActiveRecommendationsMap(restaurantId: string): Promise<Record<string, string[]>> {
  const supabase = supabaseServer()
  if (!supabase) return {}
  const { data, error } = await supabase
    .from('product_recommendations')
    .select('source_product_id, recommended_product_id, priority')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .order('priority')
  if (error || !data) return {}
  const map: Record<string, string[]> = {}
  for (const row of data as { source_product_id: string; recommended_product_id: string }[]) {
    if (!map[row.source_product_id]) map[row.source_product_id] = []
    map[row.source_product_id].push(row.recommended_product_id)
  }
  return map
}

// Active-orders count (feeds the estimated prep-time display, #6 audit) —
// same RPC already live and used for this exact purpose in the old menu's
// useMenuData.js. Read-only, no realtime subscription here (that file
// re-subscribes to keep this live across a long-open tab; menu-next's
// Server-Component page re-fetches fresh on every request instead, which is
// the proportionate equivalent for a per-request render).
export async function getActiveOrdersCount(restaurantId: string, branchId: string): Promise<number> {
  const supabase = supabaseServer()
  if (!supabase) return 0
  const { data, error } = await supabase.rpc('get_active_orders_count', { p_restaurant_id: restaurantId, p_branch_id: branchId } as never)
  if (error) return 0
  return Number(data) || 0
}

// Real, active tables for one branch — for the branch-URL (no QR) manual
// table-selection dropdown (#1B). Backed by the get_branch_tables_for_menu
// RPC (restaurant_tables itself is not anon-readable directly), which only
// ever returns {id, table_number} and re-verifies branchId belongs to this
// restaurant slug server-side — never trusts the client's own branch choice
// as a shortcut into another restaurant's tables.
export async function getBranchTablesForMenu(restaurantSlug: string, branchId: string): Promise<Table[]> {
  const supabase = supabaseServer()
  if (!supabase) return []
  const { data, error } = await supabase.rpc('get_branch_tables_for_menu', { p_restaurant_slug: restaurantSlug, p_branch_id: branchId } as never)
  if (error || !Array.isArray(data)) return []
  return data as Table[]
}

export type MenuPageData = {
  restaurant: Restaurant
  branch: Branch
  branches: Branch[]
  categories: Category[]
  products: Product[]
}

// Single entry point the page component calls — keeps the fetch waterfall
// (restaurant -> branches -> categories/products in parallel) in one place,
// same shape as the current app's fetchMenu(), read-only.
// Wrapped in React's cache() so generateMetadata and the page component (both
// calling this per request) share one Supabase round-trip instead of two —
// the same de-duplication pattern Next.js's own docs recommend, and the seam
// a future ISR/revalidation layer would sit behind without changing callers.
export const loadMenuPage = cache(async function loadMenuPage(slug: string, branchId?: string): Promise<MenuPageData | null> {
  const restaurant = await getRestaurantBySlug(slug)
  if (!restaurant) return null

  const branches = await getActiveBranches(restaurant.id)
  const branch = pickBranch(branches, branchId)
  if (!branch) return null

  const [categories, products] = await Promise.all([
    getVisibleCategories(branch.id),
    getAvailableProducts(branch.id),
  ])

  return { restaurant, branch, branches, categories, products }
})
