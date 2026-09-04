'use client'

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import type { CartItem, StoredCart, BranchConflict, SelectedOption } from './types'
import { buildCartKey, optionsPrice } from '../options'

// Client-side cart state, scoped per restaurant slug (one localStorage entry
// per restaurant, same as production's src/features/menu/hooks/useCart.js).
// Branch isolation is ported from that same file's branchConflict mechanism:
// the branch a cart belongs to travels inside the stored payload, and adding
// an item from a different branch never silently mixes carts — the caller
// gets a conflict object back and must explicitly resolve it.
//
// Phase 6A: cart lines are now keyed by cartKey (productId + selected
// options), mirroring production's own cartKey (product+options+note) —
// same product with the same options merges into one line and bumps qty,
// same product with *different* options is a separate line. Every mutation
// below (increment/decrement/removeItem) must take a cartKey, never a bare
// productId, or it would ambiguously target every line for that product.

type AddToCartProduct = { id: string; name: string; nameEn: string | null; price: number; imageUrl: string | null; emoji: string | null }

type CartContextValue = {
  items: CartItem[]
  branchId: string | null
  branchName: string | null
  restaurantSlug: string | null
  subtotal: number
  count: number
  conflict: BranchConflict | null
  idempotencyKey: string | null
  addToCart: (product: AddToCartProduct, branchId: string, branchName: string, selectedOptions?: SelectedOption[], qty?: number) => 'added' | 'conflict'
  // Replaces one specific existing line's options/qty in place — used only by
  // the cart-item options editor (Phase 6B). Never changes branch, so it
  // never needs the conflict path addToCart has. If the edited selection now
  // matches a different, already-existing line, the two are merged (qty
  // summed) rather than left as two lines with the same cartKey.
  updateCartItem: (originalCartKey: string, product: AddToCartProduct, selectedOptions: SelectedOption[], qty: number) => void
  increment: (cartKey: string) => void
  decrement: (cartKey: string) => void
  removeItem: (cartKey: string) => void
  clearCart: () => void
  resolveConflictKeepNewBranch: () => void
  cancelConflict: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

// Cart older than this is dropped on load rather than trusted with possibly
// stale prices — ported from src/features/menu/hooks/cartHelpers.js's own
// CART_TTL_MS, same 6-hour value, not a new business rule.
const CART_TTL_MS = 6 * 60 * 60 * 1000

function storageKey(slug: string) {
  return `simsim_menu_next_cart_${slug}`
}

// Idempotency-key storage key convention — ported verbatim from
// src/features/menu/hooks/cartHelpers.js's idempotencyStorageKey (TASK-ORD-002),
// same naming scheme, same per-restaurant+branch scope.
function idempotencyStorageKey(slug: string, branchId: string) {
  return `simsim_menu_next_idem_${slug}_${branchId}`
}

function readStoredCart(raw: string | null): StoredCart | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.items) || !parsed.branchId) return null
    if (Date.now() - (parsed.savedAt || 0) >= CART_TTL_MS) return null
    // Defensive against a cart saved by a pre-Phase-6A build (no cartKey /
    // selectedOptions fields yet) still sitting in a returning customer's
    // localStorage within the TTL window — backfill rather than drop the cart.
    const items = (parsed.items as CartItem[]).map((i) => {
      const selectedOptions = Array.isArray(i.selectedOptions) ? i.selectedOptions : []
      return { ...i, selectedOptions, cartKey: i.cartKey || buildCartKey(i.productId, selectedOptions) }
    })
    return { ...parsed, items } as StoredCart
  } catch {
    return null
  }
}

export function CartProvider({ slug, children }: { slug: string; children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [branchId, setBranchId] = useState<string | null>(null)
  const [branchName, setBranchName] = useState<string | null>(null)
  const [conflict, setConflict] = useState<BranchConflict | null>(null)
  const [pendingAdd, setPendingAdd] = useState<{ product: AddToCartProduct; branchId: string; branchName: string; selectedOptions: SelectedOption[]; qty: number } | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null)

  // Load once on mount — reload/refresh survives via localStorage, same as production.
  useEffect(() => {
    const stored = readStoredCart(localStorage.getItem(storageKey(slug)))
    if (stored) {
      setItems(stored.items)
      setBranchId(stored.branchId)
      setBranchName(stored.branchName)
    }
  }, [slug])

  // Persist on every change (skip while a conflict is unresolved, so we never
  // overwrite the other branch's saved cart before the customer decides).
  useEffect(() => {
    if (conflict) return
    if (!branchId) return
    try {
      const payload: StoredCart = { branchId, branchName: branchName ?? '', restaurantSlug: slug, items, savedAt: Date.now() }
      localStorage.setItem(storageKey(slug), JSON.stringify(payload))
    } catch {
      /* localStorage unavailable (private mode etc.) — cart still works for this tab */
    }
  }, [items, branchId, branchName, slug, conflict])

  // Idempotency key — generated once per "purchase intent" (first item added),
  // persisted in localStorage so it survives a refresh mid-checkout, and
  // invalidated when the cart becomes empty (after a success, or manual
  // clear). Ported verbatim from src/features/menu/hooks/useCart.js's own
  // effect (TASK-ORD-002) — same generation trigger, same storage scoping,
  // same invalidation-on-empty rule. create_order's p_idempotency_key exists
  // precisely so a retried submission (e.g. after a network blip) can't
  // create two orders for the same purchase intent.
  useEffect(() => {
    if (!slug || !branchId) return
    const key = idempotencyStorageKey(slug, branchId)
    if (items.length === 0) {
      setIdempotencyKey(null)
      try { localStorage.removeItem(key) } catch { /* ignore */ }
      return
    }
    if (idempotencyKey) return
    try {
      const stored = localStorage.getItem(key)
      if (stored) { setIdempotencyKey(stored); return }
    } catch { /* ignore */ }
    const fresh = crypto.randomUUID()
    setIdempotencyKey(fresh)
    try { localStorage.setItem(key, fresh) } catch { /* ignore */ }
  }, [items.length, slug, branchId, idempotencyKey])

  const addToCart: CartContextValue['addToCart'] = useCallback((product, addBranchId, addBranchName, selectedOptions = [], qty = 1) => {
    if (branchId && branchId !== addBranchId && items.length > 0) {
      setConflict({ cartBranchId: branchId, cartBranchName: branchName ?? '' })
      setPendingAdd({ product, branchId: addBranchId, branchName: addBranchName, selectedOptions, qty })
      return 'conflict'
    }
    setBranchId(addBranchId)
    setBranchName(addBranchName)
    const cartKey = buildCartKey(product.id, selectedOptions)
    const finalPrice = product.price + optionsPrice(selectedOptions)
    setItems((prev) => {
      const existing = prev.find((i) => i.cartKey === cartKey)
      if (existing) {
        return prev.map((i) => (i.cartKey === cartKey ? { ...i, qty: i.qty + qty } : i))
      }
      return [...prev, { cartKey, productId: product.id, name: product.name, nameEn: product.nameEn, price: finalPrice, imageUrl: product.imageUrl, emoji: product.emoji, qty, selectedOptions }]
    })
    return 'added'
  }, [branchId, branchName, items.length])

  // Customer confirms "clear the old branch's cart and start this one" —
  // the one resolution path this phase implements (mirrors production's
  // clearCartForNewBranch, the "start fresh" branch of its two-way choice).
  const resolveConflictKeepNewBranch = useCallback(() => {
    if (!pendingAdd) { setConflict(null); return }
    const { product, branchId: newBranchId, branchName: newBranchName, selectedOptions, qty } = pendingAdd
    setBranchId(newBranchId)
    setBranchName(newBranchName)
    const cartKey = buildCartKey(product.id, selectedOptions)
    const finalPrice = product.price + optionsPrice(selectedOptions)
    setItems([{ cartKey, productId: product.id, name: product.name, nameEn: product.nameEn, price: finalPrice, imageUrl: product.imageUrl, emoji: product.emoji, qty, selectedOptions }])
    // Reset so the idempotency-key effect re-derives fresh for the new
    // branch's own storage key, instead of reusing the old branch's key for
    // what is, from create_order's point of view, a completely different
    // purchase intent.
    setIdempotencyKey(null)
    setConflict(null)
    setPendingAdd(null)
  }, [pendingAdd])

  // Customer dismisses the conflict without switching — old cart is kept as-is,
  // the item that would have caused the mix is simply not added.
  const cancelConflict = useCallback(() => {
    setConflict(null)
    setPendingAdd(null)
  }, [])

  const updateCartItem = useCallback((originalCartKey: string, product: AddToCartProduct, selectedOptions: SelectedOption[], qty: number) => {
    const newCartKey = buildCartKey(product.id, selectedOptions)
    const finalPrice = product.price + optionsPrice(selectedOptions)
    setItems((prev) => {
      const withoutOriginal = prev.filter((i) => i.cartKey !== originalCartKey)
      const mergeTarget = withoutOriginal.find((i) => i.cartKey === newCartKey)
      if (mergeTarget) {
        return withoutOriginal.map((i) => (i.cartKey === newCartKey ? { ...i, qty: i.qty + qty } : i))
      }
      return [...withoutOriginal, { cartKey: newCartKey, productId: product.id, name: product.name, nameEn: product.nameEn, price: finalPrice, imageUrl: product.imageUrl, emoji: product.emoji, qty, selectedOptions }]
    })
  }, [])

  const increment = useCallback((cartKey: string) => {
    setItems((prev) => prev.map((i) => (i.cartKey === cartKey ? { ...i, qty: i.qty + 1 } : i)))
  }, [])

  const decrement = useCallback((cartKey: string) => {
    setItems((prev) => {
      const next = prev.map((i) => (i.cartKey === cartKey ? { ...i, qty: i.qty - 1 } : i)).filter((i) => i.qty > 0)
      return next
    })
  }, [])

  const removeItem = useCallback((cartKey: string) => {
    setItems((prev) => prev.filter((i) => i.cartKey !== cartKey))
  }, [])

  const clearCart = useCallback(() => {
    setItems([])
    try { localStorage.removeItem(storageKey(slug)) } catch { /* ignore */ }
  }, [slug])

  const subtotal = useMemo(() => items.reduce((sum, i) => sum + i.price * i.qty, 0), [items])
  const count = useMemo(() => items.reduce((sum, i) => sum + i.qty, 0), [items])

  const value: CartContextValue = {
    items, branchId, branchName, restaurantSlug: slug,
    subtotal, count, conflict, idempotencyKey,
    addToCart, updateCartItem, increment, decrement, removeItem, clearCart,
    resolveConflictKeepNewBranch, cancelConflict,
  }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
