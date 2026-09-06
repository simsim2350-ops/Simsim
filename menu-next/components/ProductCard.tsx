import type { Product, Lang, MenuLayout } from '@/lib/types'
import { AddToCartButton } from './AddToCartButton'
import { ProductImageButton } from './ProductImageButton'

// Ported from src/features/menu/helpers.js's getCalorieBadge — same thresholds, same three emoji tiers.
function calorieBadge(calories: number): string {
  if (calories < 300) return '🟢'
  if (calories <= 600) return '🟡'
  return '🔴'
}

// 4 layouts, matching src/features/menu/ProductItem.jsx's own 4 branches
// (list/grid/showcase/circles) driven by the Admin Dashboard's "شكل عرض
// الأصناف" setting (restaurants.menu_layout). 'list' is both the DB default
// and this component's original, unchanged design — every other layout
// reuses the exact same sub-elements (image, name, description, price,
// AddToCartButton) with CSS-driven structure instead of a separate component
// tree, since the underlying add-to-cart interaction (tap -> instant add or
// options modal) is menu-next's own established, unchanged behavior, not
// itself a "display setting" to reproduce from the old per-card quick-add
// stepper.
export function ProductCard({ product, allProducts, recommendationsMap, layout = 'list', lang, currency, priceColor, branchId, branchName }: {
  product: Product
  allProducts?: Product[]
  recommendationsMap?: Record<string, string[]>
  layout?: MenuLayout
  lang: Lang
  currency: string
  priceColor: string
  branchId: string
  branchName: string
}) {
  const name = lang === 'en' && product.name_en ? product.name_en : product.name
  const description = lang === 'en' ? product.description_en || product.description : product.description
  // Same per-layout description visibility as ProductItem.jsx: list and
  // showcase show it (2-line clamp), grid and circles never do.
  const showDescription = (layout === 'list' || layout === 'showcase') && !!description

  const addButton = (
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
  )

  const priceBlock = (
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
  )

  return (
    <article className={`product-card product-card--${layout}`}>
      <div className="product-card__media">
        <ProductImageButton
          product={product}
          name={name}
          allProducts={allProducts}
          recommendationsMap={recommendationsMap}
          branchId={branchId}
          branchName={branchName}
          currency={currency}
          priceColor={priceColor}
          lang={lang}
          className="product-card__media-btn"
        />
        {/* grid/showcase/circles float the add button over the image corner,
            matching ProductItem.jsx's quick-add positioning for those modes.
            A sibling of the image button (never nested inside it) so a tap
            on (+) never also triggers "view details". */}
        {layout !== 'list' && <div className="product-card__media-add">{addButton}</div>}
      </div>
      <div className="product-card__body">
        <h3 className="product-card__name">{name}</h3>
        {showDescription && <p className="product-card__desc">{description}</p>}
        {priceBlock}
      </div>
      {layout === 'list' && addButton}
    </article>
  )
}
