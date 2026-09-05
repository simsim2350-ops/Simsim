import { cache } from 'react'
import { supabaseServer } from './supabase/server'
import type { Restaurant, Branch, Category, Product, Rating } from './types'

// Data access only — no rendering here. Mirrors the exact same read pattern
// (tables, filters, ordering) as the current production menu's useMenuData.js,
// against the same RLS policies already in production. No new RPC, no schema
// change, no service_role.

export async function getRestaurantBySlug(slug: string): Promise<Restaurant | null> {
  const supabase = supabaseServer()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('restaurants')
    .select('id, slug, name, description, description_en, logo_url, brand_color, price_color, description_color, currency, is_active, delivery_enabled, delivery_fee, phone, address, maps_url, social_links, allergens, show_social_links, show_allergens, show_hours, show_description, recommendations_enabled, recommendations_count')
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
