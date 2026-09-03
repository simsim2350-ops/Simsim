import { cache } from 'react'
import { supabaseServer } from './supabase/server'
import type { Restaurant, Branch, Category, Product } from './types'

// Data access only — no rendering here. Mirrors the exact same read pattern
// (tables, filters, ordering) as the current production menu's useMenuData.js,
// against the same RLS policies already in production. No new RPC, no schema
// change, no service_role.

export async function getRestaurantBySlug(slug: string): Promise<Restaurant | null> {
  const supabase = supabaseServer()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('restaurants')
    .select('id, slug, name, description, description_en, logo_url, brand_color, price_color, description_color, currency, is_active')
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
    .select('id, restaurant_id, name, name_en, is_active, is_primary, sort_order')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .order('sort_order')
  if (error || !data) return []
  return data as Branch[]
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
    .select('id, branch_id, category_id, name, name_en, description, description_en, price, compare_price, image_url, emoji, is_available, sort_order')
    .eq('branch_id', branchId)
    .eq('is_available', true)
    .order('sort_order')
  if (error || !data) return []
  return data as Product[]
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
