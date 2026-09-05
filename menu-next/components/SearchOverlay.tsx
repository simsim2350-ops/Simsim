'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Product, Lang } from '@/lib/types'
import { rankProducts } from '@/lib/searchUtils'
import { ProductCard } from './ProductCard'
import { t } from '@/lib/i18n'

// Search overlay — same ranking algorithm as the old menu's SearchOverlay.jsx
// (lib/searchUtils.ts, ported verbatim), rendered with the exact same
// ProductCard used by the regular grid, so search results have identical
// behavior (add-to-cart, options modal) to browsing the menu normally —
// no separate result-row UI/logic invented.
export function SearchOverlay({
  open, onClose, products, lang, currency, priceColor, branchId, branchName,
}: {
  open: boolean
  onClose: () => void
  products: Product[]
  lang: Lang
  currency: string
  priceColor: string
  branchId: string
  branchName: string
}) {
  const [query, setQuery] = useState('')
  const strings = t(lang)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const bestSellerIds = useMemo(() => new Set(products.filter((p) => p.is_best_seller).map((p) => p.id)), [products])
  const results = useMemo(() => (query.trim() ? rankProducts(query, products, bestSellerIds) : []), [query, products, bestSellerIds])

  if (!open) return null

  return (
    <div className="search-overlay" role="dialog" aria-modal="true">
      <div className="search-overlay__header">
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={strings.searchPlaceholder}
          className="search-overlay__input"
          dir={lang === 'en' ? 'ltr' : 'rtl'}
        />
        <button type="button" className="search-overlay__close" onClick={onClose} aria-label="close">✕</button>
      </div>
      <div className="search-overlay__body">
        {query.trim() && results.length === 0 && (
          <p className="search-overlay__empty">{strings.noResults}</p>
        )}
        {results.length > 0 && (
          <div className="category-section__grid">
            {results.map((p) => (
              <ProductCard key={p.id} product={p} lang={lang} currency={currency} priceColor={priceColor} branchId={branchId} branchName={branchName} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
