'use client'

import { useState } from 'react'
import { useCart } from '@/lib/cart/CartContext'
import { t } from '@/lib/i18n'
import type { Lang, Product } from '@/lib/types'
import { hasSelectableOptions } from '@/lib/options'
import { getProductCompanions } from '@/lib/recommendations'
import { ProductOptionsModal } from './ProductOptionsModal'

export function AddToCartButton({
  product, allProducts, recommendationsMap, branchId, branchName, currency, priceColor, lang,
}: {
  product: { id: string; name: string; nameEn: string | null; price: number; imageUrl: string | null; emoji: string | null; options: unknown }
  allProducts?: Product[]
  recommendationsMap?: Record<string, string[]>
  branchId: string
  branchName: string
  currency: string
  priceColor: string
  lang: Lang
}) {
  const { addToCart } = useCart()
  const [justAdded, setJustAdded] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)

  const hasCompanions = allProducts && recommendationsMap
    ? getProductCompanions(product.id, allProducts, recommendationsMap).length > 0
    : false

  const handleClick = () => {
    // A product with real, non-empty option groups always opens the picker
    // first — its base price alone is never the final price, so it can never
    // go straight into the cart the way an options-free product does.
    //
    // #3b: a product with an owner-configured companion rule also opens the
    // picker (to show "goes well with X"), even with zero option groups —
    // otherwise the migrated companion feature would never actually be
    // reachable for the (common) case of a simple, options-free product,
    // since the fast single-tap-add path never shows any modal at all.
    // Every product with no companions and no options keeps the exact same
    // instant-add behavior as before — this only changes the tap outcome for
    // products an owner has explicitly attached a recommendation rule to.
    if (hasSelectableOptions(product.options) || hasCompanions) {
      setOptionsOpen(true)
      return
    }
    const result = addToCart(product, branchId, branchName)
    if (result === 'added') {
      setJustAdded(true)
      setTimeout(() => setJustAdded(false), 900)
    }
  }

  return (
    <>
      <button type="button" className="add-to-cart-btn" onClick={handleClick} aria-label={`${t(lang).addToCart}: ${product.name}`}>
        {justAdded ? '✓' : '+'}
      </button>
      {optionsOpen && (
        <ProductOptionsModal
          product={product}
          allProducts={allProducts}
          recommendationsMap={recommendationsMap}
          lang={lang}
          currency={currency}
          priceColor={priceColor}
          branchId={branchId}
          branchName={branchName}
          onClose={() => setOptionsOpen(false)}
        />
      )}
    </>
  )
}
