import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { supabaseServer } from './supabase/server'
import type { Restaurant, Branch, Category, Product, Rating, Table } from './types'
import type { Banner, DisplayCoupon } from './banners/types'

// Data access only — no rendering here. Mirrors the exact same read pattern
// (tables, filters, ordering) as the current production menu's useMenuData.js,
// against the same RLS policies already in production. No new RPC, no schema
// change, no service_role.

// ---------------------------------------------------------------------------
// Caching (Performance Optimization phase, per
// SIMSIM_MENU_PERFORMANCE_AUDIT_REPORT.md §10/§14/§16). This app does NOT set
// `cacheComponents` in next.config.ts, so it's on Next's "Previous Model" —
// `unstable_cache` + `revalidateTag` is the current, documented, supported
// caching API for this mode (confirmed against this exact installed Next 16's
// own docs: node_modules/next/dist/docs/01-app/02-guides/
// caching-without-cache-components.md). Opting into Cache Components instead
// would be a much bigger rendering-model change (mandatory Suspense
// boundaries app-wide, Partial Prerendering) — explicitly out of scope
// ("لا تقم بإعادة بناء المشروع أو تغيير الـ Stack").
//
// Tag scheme: ONE tag per restaurant (`menu-data:<restaurantId>`) covers
// every cacheable table below (branches/categories/products/rating/
// branding/banners/coupons/cart-wide/recommendations). A single, uniform
// tag — rather than one tag per table — was a deliberate choice: it means
// every dashboard save path can invalidate correctly with just the
// restaurant's id (see app/api/revalidate/route.ts), which is far less
// error-prone to wire up consistently across ~20 different save call sites
// in the dashboard app than remembering the exact right combination of
// granular tags per action. The cost is mild over-invalidation (e.g. editing
// one product also invalidates the cached branches list) — an explicitly
// accepted tradeoff per the audit's own "Cache + Explicit Invalidation over
// micro-optimization" priority. `getRestaurantBySlug` additionally needs its
// own `menu-slug:<slug>` tag since the restaurant id isn't known yet at that
// lookup.
//
// Every cached function also carries a 300s (5 minute) `revalidate` as a
// safety net — if an invalidation call from the dashboard ever fails to
// fire (network blip, misconfigured secret), staleness self-heals within 5
// minutes instead of persisting indefinitely.
const CACHE_TTL_SECONDS = 300

function restaurantTag(restaurantId: string) {
  return `menu-data:${restaurantId}`
}

export async function getRestaurantBySlug(slug: string): Promise<Restaurant | null> {
  return unstable_cache(
    async () => {
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
    },
    ['restaurant-by-slug', slug],
    { tags: [`menu-slug:${slug}`], revalidate: CACHE_TTL_SECONDS }
  )()
}

export async function getActiveBranches(restaurantId: string): Promise<Branch[]> {
  return unstable_cache(
    async () => {
      const supabase = supabaseServer()
      if (!supabase) return []
      const { data, error } = await supabase
        .from('branches')
        .select('id, restaurant_id, name, name_en, is_active, is_primary, sort_order, delivery_enabled, delivery_fee, takeaway_enabled, car_pickup_enabled, car_pickup_info_label, car_pickup_info_required, opening_hours, is_paused, address, address_en, maps_url, phone, menu_clone_status')
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)
        .order('sort_order')
      if (error || !data) return []
      // Same exclusion as the old menu's useMenuData.js: a branch whose menu clone is still in
      // progress or failed has no reliable menu content yet — never offer it as selectable.
      return (data as (Branch & { menu_clone_status: string | null })[])
        .filter((b) => b.menu_clone_status !== 'copying' && b.menu_clone_status !== 'failed')
    },
    ['active-branches', restaurantId],
    { tags: [restaurantTag(restaurantId)], revalidate: CACHE_TTL_SECONDS }
  )()
}

export function pickBranch(branches: Branch[], branchId?: string): Branch | null {
  if (branchId) {
    const match = branches.find((b) => b.id === branchId)
    if (match) return match
  }
  return branches.find((b) => b.is_primary) ?? branches[0] ?? null
}

// `restaurantId` is only used for the cache tag here (categories are looked
// up by branch alone) — passed through by the one caller (loadMenuPage,
// below) which already has it in scope, so every cache entry can always be
// busted by the single restaurant-wide tag, in addition to the more precise
// branch tag.
export async function getVisibleCategories(branchId: string, restaurantId: string): Promise<Category[]> {
  return unstable_cache(
    async () => {
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
    },
    ['visible-categories', branchId],
    { tags: [restaurantTag(restaurantId), `menu-branch:${branchId}`], revalidate: CACHE_TTL_SECONDS }
  )()
}

export async function getAvailableProducts(branchId: string, restaurantId: string): Promise<Product[]> {
  return unstable_cache(
    async () => {
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
    },
    ['available-products', branchId],
    { tags: [restaurantTag(restaurantId), `menu-branch:${branchId}`], revalidate: CACHE_TTL_SECONDS }
  )()
}

// Rating — same RPC and "hide until at least one real review exists" rule as the old
// menu's useMenuData.js (get_restaurant_rating, unchanged, already live in production).
export async function getRestaurantRating(restaurantId: string): Promise<Rating> {
  return unstable_cache(
    async () => {
      const supabase = supabaseServer()
      if (!supabase) return null
      const { data, error } = await supabase.rpc('get_restaurant_rating', { p_restaurant_id: restaurantId } as never)
      if (error) return null
      const row = (Array.isArray(data) ? data[0] : data) as { avg_rating: number; review_count: number } | null
      if (!row || Number(row.review_count) <= 0) return null
      return { avg: Number(row.avg_rating), count: Number(row.review_count) }
    },
    ['restaurant-rating', restaurantId],
    { tags: [restaurantTag(restaurantId)], revalidate: CACHE_TTL_SECONDS }
  )()
}

// "صُمم بواسطة سمسم" footer (#2, this round) — the real, existing Super
// Admin setting (public.platform_branding, RPC menu_branding, already
// live), never a hardcoded footer string. `show` is already the fully
// resolved decision (platform-level `enabled` AND NOT this restaurant's own
// `branding_hidden` override) — this function does no additional logic of
// its own, it only reads what the RPC already decided. Returns null on any
// failure so the caller can safely render nothing rather than guess.
export async function getMenuBranding(restaurantId: string): Promise<{ show: boolean; text: string | null; url: string | null; variant: string | null } | null> {
  return unstable_cache(
    async () => {
      const supabase = supabaseServer()
      if (!supabase) return null
      const { data, error } = await supabase.rpc('menu_branding', { p_restaurant_id: restaurantId } as never)
      if (error || !data) return null
      const row = data as { show?: boolean; text?: string | null; url?: string | null; variant?: string | null }
      return { show: Boolean(row.show), text: row.text ?? null, url: row.url ?? null, variant: row.variant ?? null }
    },
    ['menu-branding', restaurantId],
    { tags: [restaurantTag(restaurantId)], revalidate: CACHE_TTL_SECONDS }
  )()
}

// Phase 3C.3 — resolves the EXISTING, UNMODIFIED Feature Registry capability
// `phone_verification` for this restaurant via the EXISTING, UNMODIFIED
// feature_value() resolver (restaurant override → plan → global default —
// unchanged, platform-admin-controlled chain, never a restaurant self-toggle).
// Fails closed to `false` (today's exact checkout behavior) on any error or
// missing client, matching this file's own null/false-on-failure convention
// throughout — an RPC hiccup must never accidentally start requiring a
// session that doesn't exist yet.
export async function getPhoneVerificationEnabled(restaurantId: string): Promise<boolean> {
  const supabase = supabaseServer()
  if (!supabase) return false
  const { data, error } = await supabase.rpc('feature_value', { p_restaurant_id: restaurantId, p_key: 'phone_verification' } as never)
  if (error) return false
  return data === true
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
  return unstable_cache(
    async () => {
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
    },
    ['active-cart-wide-ids', restaurantId, branchId],
    { tags: [restaurantTag(restaurantId), `menu-branch:${branchId}`], revalidate: CACHE_TTL_SECONDS }
  )()
}

// Banners (#2b) — same table/filters/ordering as production's useMenuData.js:
// select('*') by restaurant, is_active, ordered by display_priority desc then
// sort_order, then the same client-side branch-scope + starts/ends-at window
// filter (`relevant`) that file applies after the fetch. Not a new read
// pattern — ported exactly, including the "select *" (matches whatever
// columns the admin UI's banner form actually writes, without guessing a
// trimmed column list).
export async function getActiveBanners(restaurantId: string, branchId: string): Promise<Banner[]> {
  const rows = await unstable_cache(
    async () => {
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
      return data as Banner[]
    },
    ['active-banners', restaurantId],
    { tags: [restaurantTag(restaurantId)], revalidate: CACHE_TTL_SECONDS }
  )()
  // The starts_at/ends_at window check stays OUTSIDE the cached function and
  // is re-evaluated on every call (not just every cache miss) — a banner
  // whose schedule window opens or closes mid-TTL must never wait for a
  // revalidation to start/stop showing, since nothing "saves" at that
  // moment to trigger an explicit invalidation.
  const now = new Date().toISOString()
  const relevant = (row: Banner) => !row.branch_id || row.branch_id === branchId
  return rows.filter((b) => relevant(b) && (!b.starts_at || b.starts_at <= now) && (!b.ends_at || b.ends_at >= now))
}

// The offers-drawer's "currently active coupons to advertise" list — same
// table as Phase 3's coupon-apply lookup in CheckoutForm.tsx, but a different,
// unrelated read (all active coupons for display vs. one matched by a typed
// code) — same filters as production's useMenuData.js (is_active + the same
// branch-scope + not-yet-expired window).
export async function getActiveCouponsForDisplay(restaurantId: string, branchId: string): Promise<DisplayCoupon[]> {
  const rows = await unstable_cache(
    async () => {
      const supabase = supabaseServer()
      if (!supabase) return []
      const { data, error } = await supabase
        .from('coupons')
        .select('id, restaurant_id, branch_id, code, discount_type, discount_value, expires_at, is_active')
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)
      if (error || !data) return []
      return data as DisplayCoupon[]
    },
    ['active-coupons-for-display', restaurantId],
    { tags: [restaurantTag(restaurantId)], revalidate: CACHE_TTL_SECONDS }
  )()
  // expires_at is re-checked on every call, outside the cache, for the same
  // reason as getActiveBanners above — a coupon must stop advertising itself
  // the moment it expires, not just on the next cache revalidation.
  const now = new Date().toISOString()
  const relevant = (row: DisplayCoupon) => !row.branch_id || row.branch_id === branchId
  return rows.filter((c) => relevant(c) && (!c.expires_at || c.expires_at >= now))
}

// Per-product companion recommendations (#3b, "goes well with X") — same
// table/filters as src/lib/recommendationsApi.js's fetchActiveRecommendationsMap,
// unchanged. Returned as a plain object (not a Map) because this crosses into
// Client Components as a prop, and Maps aren't serializable across the
// Server/Client boundary — a representation change only, not a data-structure
// or query change at the source.
export async function getActiveRecommendationsMap(restaurantId: string): Promise<Record<string, string[]>> {
  return unstable_cache(
    async () => {
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
    },
    ['active-recommendations-map', restaurantId],
    { tags: [restaurantTag(restaurantId)], revalidate: CACHE_TTL_SECONDS }
  )()
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
    getVisibleCategories(branch.id, restaurant.id),
    getAvailableProducts(branch.id, restaurant.id),
  ])

  return { restaurant, branch, branches, categories, products }
})
