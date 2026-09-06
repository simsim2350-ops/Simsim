'use client'

import { useState } from 'react'
import Image from 'next/image'
import type { Product, Lang } from '@/lib/types'
import { t } from '@/lib/i18n'
import { ProductOptionsModal } from './ProductOptionsModal'

// Product image = view details, always — a separate, deliberate tap target
// from AddToCartButton's own (+) (= quick add). Reuses the exact same,
// already-existing "product details" experience (ProductOptionsModal) that
// (+) itself opens for a product with options/companions — the only
// difference is this always opens it, even for a simple product that (+)
// would otherwise add instantly, so the customer can review name/price/
// image before deciding. No new product-details page/route is created.
//
// A small, self-contained client component embedded in the server-rendered
// ProductCard — same pattern as AddToCartButton already sitting beside it —
// rather than converting the whole card to a client component.
export function ProductImageButton({
  product, name, allProducts, recommendationsMap, branchId, branchName, currency, priceColor, lang, className,
}: {
  product: Product
  name: string
  allProducts?: Product[]
  recommendationsMap?: Record<string, string[]>
  branchId: string
  branchName: string
  currency: string
  priceColor: string
  lang: Lang
  className?: string
}) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const strings = t(lang)

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setDetailsOpen(true)}
        aria-label={`${strings.viewDetails}: ${name}`}
      >
        {product.image_url ? (
          <Image src={product.image_url} alt={name} fill sizes="96px" className="product-card__image" />
        ) : (
          <span className="product-card__emoji" aria-hidden>{product.emoji || '🍽️'}</span>
        )}
      </button>
      {detailsOpen && (
        <ProductOptionsModal
          product={{ id: product.id, name: product.name, nameEn: product.name_en, price: product.price, imageUrl: product.image_url, emoji: product.emoji, options: product.options }}
          allProducts={allProducts}
          recommendationsMap={recommendationsMap}
          lang={lang}
          currency={currency}
          priceColor={priceColor}
          branchId={branchId}
          branchName={branchName}
          onClose={() => setDetailsOpen(false)}
        />
      )}
    </>
  )
}
