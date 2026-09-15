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
  priority = false, sizes = '96px',
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
  // Performance Optimization Phase 5 (SIMSIM_MENU_PERFORMANCE_AUDIT_REPORT.md
  // §4/§7/§14): both default to the OLD behavior (no priority, flat 96px) if
  // the caller doesn't pass them, so nothing here changes unless ProductCard
  // explicitly opts a specific image in. `priority` should be true for only
  // the single first visible product image on the page (the likely LCP
  // element) — see ProductCard.tsx/CategorySection.tsx for how that one
  // image is chosen. `sizes` should reflect this image's REAL rendered
  // width for the active layout, computed by ProductCard (which knows the
  // layout; this component doesn't) — the previous hardcoded "96px" was
  // wrong for every layout except circles.
  priority?: boolean
  sizes?: string
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
          <Image src={product.image_url} alt={name} fill sizes={sizes} priority={priority} className="product-card__image" />
        ) : (
          <span className="product-card__emoji" aria-hidden>{product.emoji || '🍽️'}</span>
        )}
      </button>
      {detailsOpen && (
        <ProductOptionsModal
          product={{ id: product.id, name: product.name, nameEn: product.name_en, description: product.description, descriptionEn: product.description_en, comparePrice: product.compare_price, isBestSeller: product.is_best_seller, calories: product.calories, price: product.price, imageUrl: product.image_url, emoji: product.emoji, options: product.options }}
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
