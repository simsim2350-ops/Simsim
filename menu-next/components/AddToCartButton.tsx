'use client'

import { useState } from 'react'
import { useCart } from '@/lib/cart/CartContext'
import { t } from '@/lib/i18n'
import type { Lang } from '@/lib/types'
import { hasSelectableOptions } from '@/lib/options'
import { ProductOptionsModal } from './ProductOptionsModal'

export function AddToCartButton({
  product, branchId, branchName, currency, priceColor, lang,
}: {
  product: { id: string; name: string; nameEn: string | null; price: number; imageUrl: string | null; emoji: string | null; options: unknown }
  branchId: string
  branchName: string
  currency: string
  priceColor: string
  lang: Lang
}) {
  const { addToCart } = useCart()
  const [justAdded, setJustAdded] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)

  const handleClick = () => {
    // A product with real, non-empty option groups always opens the picker
    // first — its base price alone is never the final price, so it can never
    // go straight into the cart the way an options-free product does.
    if (hasSelectableOptions(product.options)) {
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
