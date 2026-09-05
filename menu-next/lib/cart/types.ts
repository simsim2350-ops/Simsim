// Server-verified shape once selected — {groupName, choiceName, price} is the
// exact contract create_order's p_items[].options accepts (price is included
// here for local display/total math only; the checkout payload sent to the
// RPC omits it, since the RPC looks up the real price from products.options
// itself and never trusts a client-supplied one).
export type SelectedOption = {
  groupName: string
  choiceName: string
  price: number
}

export type CartItem = {
  // True line identity: productId + a sorted key of the selected choices.
  // Two lines can share a productId when their options differ — every
  // operation that targets "this cart line" (increment/decrement/remove) must
  // key off cartKey, never productId alone, or it would ambiguously affect
  // every line for that product.
  cartKey: string
  productId: string
  name: string
  nameEn: string | null
  // Per-unit price INCLUDING the selected options' price delta (base +
  // sum(selectedOptions.price)) — same convention as production's cart item
  // `finalPrice` (src/features/menu/hooks/useCart.js), so qty * price is
  // always a correct line total without re-deriving it at render time.
  price: number
  imageUrl: string | null
  emoji: string | null
  qty: number
  selectedOptions: SelectedOption[]
}

export type BranchConflict = {
  cartBranchId: string
  cartBranchName: string
}

// Persisted shape in localStorage — branchId travels with the cart so a
// reload can detect "this cart belongs to a different branch" without
// guessing, same principle as src/features/menu/hooks/useCart.js's
// branchConflict mechanism (ADR-44/TASK-CART-001), ported not invented.
export type StoredCart = {
  branchId: string
  branchName: string
  restaurantSlug: string
  items: CartItem[]
  savedAt: number
}
