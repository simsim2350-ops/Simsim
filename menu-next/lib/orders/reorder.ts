import { supabaseBrowser } from '@/lib/supabase/client'
import type { Product } from '@/lib/types'
import type { StoredOrder } from './types'

// Faithful port of src/pages/PublicMenu.jsx's reorderToCart(): match each past
// order item against the product's CURRENT state (current price, current
// availability, current options) — never a stale, locally-cached price or
// option set. Old menu had this current-state list already loaded in memory;
// this app fetches it fresh for the order's own branch (a past order can
// belong to a branch other than whichever one is currently selected).
export type ReorderResult = {
  matched: { product: Product; qty: number }[]
  skippedCount: number
}

export async function resolveReorder(order: StoredOrder): Promise<ReorderResult> {
  const client = supabaseBrowser()
  if (!client || !order.branchId) return { matched: [], skippedCount: order.items.length }

  const ids = order.items.map((i) => i.id)
  const { data, error } = await client
    .from('products')
    .select('id, branch_id, category_id, name, name_en, description, description_en, price, compare_price, image_url, emoji, is_available, sort_order, options, is_featured, is_best_seller, calories')
    .eq('branch_id', order.branchId)
    .eq('is_available', true)
    .in('id', ids)

  if (error || !data) return { matched: [], skippedCount: order.items.length }

  const currentById = new Map((data as Product[]).map((p) => [p.id, p]))
  const matched: { product: Product; qty: number }[] = []
  let skippedCount = 0
  for (const item of order.items) {
    const product = currentById.get(item.id)
    if (!product) { skippedCount += 1; continue }
    matched.push({ product, qty: item.qty || 1 })
  }
  return { matched, skippedCount }
}
