'use client'

import { useCart } from '@/lib/cart/CartContext'
import { getCartRecommendations } from '@/lib/recommendations'
import { t } from '@/lib/i18n'
import type { Lang, Product } from '@/lib/types'

// Smart Cart Recommendations (#3) — same ranking logic as
// src/features/menu/hooks/useSmartSuggestions.js (cart-wide curated -> same
// category -> featured fallback), rendered inside the existing cart sheet.
// Options-bearing products are skipped here (a one-tap add can't safely
// choose required options on the customer's behalf) — that matches
// AddToCartButton's own behavior of opening a picker for those instead of
// silently guessing a choice.
export function CartRecommendations({
  products, cartWideIds, recommendationsEnabled, recommendationsCount, branchId, branchName, currency, priceColor, lang,
}: {
  products: Product[]
  cartWideIds: string[]
  recommendationsEnabled: boolean
  recommendationsCount: number
  branchId: string
  branchName: string
  currency: string
  priceColor: string
  lang: Lang
}) {
  const { items, addToCart } = useCart()
  const strings = t(lang)

  const recommendations = getCartRecommendations({
    cart: items, products, cartWideIds, recommendationsEnabled, recommendationsCount,
  }).filter((r) => {
    const opts = r.product.options
    return !(Array.isArray(opts) && opts.length > 0)
  })

  if (recommendations.length === 0) return null

  const formatPrice = (n: number) => n.toLocaleString(lang === 'en' ? 'en-US' : 'ar-SA')

  return (
    <div className="cart-recs">
      <div className="cart-recs__title">{strings.cartRecsTitle}</div>
      <div className="cart-recs__row">
        {recommendations.map(({ product }) => {
          const name = lang === 'en' && product.name_en ? product.name_en : product.name
          return (
            <div key={product.id} className="cart-recs__item">
              <div className="cart-recs__item-media">
                {product.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.image_url} alt="" loading="lazy" />
                ) : (
                  <span aria-hidden>{product.emoji || '🍽️'}</span>
                )}
              </div>
              <div className="cart-recs__item-name">{name}</div>
              <div className="cart-recs__item-price" style={{ color: priceColor }}>{formatPrice(product.price)} {currency}</div>
              <button
                type="button"
                className="cart-recs__add"
                style={{ background: priceColor }}
                onClick={() => addToCart({ id: product.id, name: product.name, nameEn: product.name_en, price: product.price, imageUrl: product.image_url, emoji: product.emoji }, branchId, branchName)}
              >
                + {strings.addToCart}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
