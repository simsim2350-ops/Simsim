import Image from 'next/image'
import type { Product, Lang } from '@/lib/types'
import { AddToCartButton } from './AddToCartButton'

// Ported from src/features/menu/helpers.js's getCalorieBadge — same thresholds, same three emoji tiers.
function calorieBadge(calories: number): string {
  if (calories < 300) return '🟢'
  if (calories <= 600) return '🟡'
  return '🔴'
}

export function ProductCard({ product, allProducts, recommendationsMap, lang, currency, priceColor, branchId, branchName }: {
  product: Product
  allProducts?: Product[]
  recommendationsMap?: Record<string, string[]>
  lang: Lang
  currency: string
  priceColor: string
  branchId: string
  branchName: string
}) {
  const name = lang === 'en' && product.name_en ? product.name_en : product.name
  const description = lang === 'en' ? product.description_en || product.description : product.description

  return (
    <article className="product-card">
      <div className="product-card__media">
        {product.image_url ? (
          <Image src={product.image_url} alt={name} fill sizes="96px" className="product-card__image" />
        ) : (
          <span className="product-card__emoji" aria-hidden>{product.emoji || '🍽️'}</span>
        )}
      </div>
      <div className="product-card__body">
        <h3 className="product-card__name">{name}</h3>
        {description && <p className="product-card__desc">{description}</p>}
        <div className="product-card__price" style={{ color: priceColor }}>
          {product.price.toLocaleString(lang === 'en' ? 'en-US' : 'ar-SA')} {currency}
          {product.compare_price && product.compare_price > product.price && (
            <span className="product-card__compare">
              {product.compare_price.toLocaleString(lang === 'en' ? 'en-US' : 'ar-SA')} {currency}
            </span>
          )}
          {product.calories != null && (
            <span className="product-card__calories">{calorieBadge(product.calories)} {product.calories}</span>
          )}
        </div>
      </div>
      <AddToCartButton
        product={{ id: product.id, name: product.name, nameEn: product.name_en, price: product.price, imageUrl: product.image_url, emoji: product.emoji, options: product.options }}
        allProducts={allProducts}
        recommendationsMap={recommendationsMap}
        branchId={branchId}
        branchName={branchName}
        currency={currency}
        priceColor={priceColor}
        lang={lang}
      />
    </article>
  )
}
