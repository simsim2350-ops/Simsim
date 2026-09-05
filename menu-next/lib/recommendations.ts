import type { CartItem } from './cart/types'
import type { Product } from './types'

// Faithful TypeScript port of src/features/menu/hooks/useSmartSuggestions.js —
// same priority chain (cart-wide curated -> same-category -> featured
// fallback), same exclusion rules (already in cart, unavailable), same cap.
// Pure function, no Supabase dependency of its own — the caller supplies the
// already-fetched cartWideIds (getActiveCartWideIds) and products list.
export type Recommendation = { product: Product; reason: 'curated' | 'category' | 'mostOrdered' }

export function getCartRecommendations({
  cart, products, cartWideIds, recommendationsEnabled, recommendationsCount,
}: {
  cart: CartItem[]
  products: Product[]
  cartWideIds: string[]
  recommendationsEnabled: boolean
  recommendationsCount: number
}): Recommendation[] {
  if (!recommendationsEnabled || cart.length === 0) return []
  const cartIds = new Set(cart.map((i) => i.productId))
  const picked = new Map<string, Recommendation>()

  const tryAdd = (product: Product | undefined, reason: Recommendation['reason']) => {
    if (!product || !product.is_available) return
    if (cartIds.has(product.id) || picked.has(product.id)) return
    picked.set(product.id, { product, reason })
  }

  for (const pid of cartWideIds) {
    if (picked.size >= recommendationsCount) break
    tryAdd(products.find((p) => p.id === pid), 'curated')
  }

  if (picked.size < recommendationsCount) {
    const cartCategoryIds = new Set(
      cart.map((i) => products.find((p) => p.id === i.productId)?.category_id).filter((id): id is string => Boolean(id))
    )
    for (const catId of cartCategoryIds) {
      if (picked.size >= recommendationsCount) break
      for (const p of products.filter((p) => p.category_id === catId)) {
        if (picked.size >= recommendationsCount) break
        tryAdd(p, 'category')
      }
    }
  }

  if (picked.size < recommendationsCount) {
    for (const p of products.filter((p) => p.is_featured)) {
      if (picked.size >= recommendationsCount) break
      tryAdd(p, 'mostOrdered')
    }
  }

  return [...picked.values()].slice(0, recommendationsCount)
}
