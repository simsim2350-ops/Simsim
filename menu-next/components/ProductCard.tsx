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
// الأصناف" setting (restaurants.menu_layout). 'list' is the DB default;
// every layout (list included) reuses the exact same sub-elements (image,
// name, description, price, AddToCartButton) with CSS-driven structure
// instead of a separate component tree, since the underlying add-to-cart
// interaction (tap -> instant add or options modal) is menu-next's own
// established, unchanged behavior, not itself a "display setting".
// Real rendered widths per layout (menu-next/app/globals.css), used for the
// `sizes` hint below — was a flat, wrong "96px" for every layout before
// (SIMSIM_MENU_PERFORMANCE_AUDIT_REPORT.md §4/§7). Approximate but far closer
// than the previous single value; not meant to be pixel-perfect for every
// breakpoint, just no longer actively wrong.
const IMAGE_SIZES_BY_LAYOUT: Record<MenuLayout, string> = {
  list: '(min-width: 1024px) 136px, (min-width: 600px) 128px, 120px',
  grid: '(min-width: 1024px) 350px, (min-width: 600px) 300px, 45vw',
  showcase: '(min-width: 1024px) 1100px, (min-width: 600px) 720px, 100vw',
  circles: '136px',
}

export function ProductCard({ product, allProducts, recommendationsMap, layout = 'list', lang, currency, priceColor, branchId, branchName, priority = false }: {
  product: Product
  allProducts?: Product[]
  recommendationsMap?: Record<string, string[]>
  layout?: MenuLayout
  lang: Lang
  currency: string
  priceColor: string
  branchId: string
  branchName: string
  // True for exactly one product on the page — the first one rendered,
  // which is the LCP candidate. Set by CategorySection, see there for how
  // it picks that single product. Default false preserves old behavior for
  // every other card.
  priority?: boolean
}) {
  const name = lang === 'en' && product.name_en ? product.name_en : product.name
  const description = lang === 'en' ? product.description_en || product.description : product.description
  // Same per-layout description visibility as ProductItem.jsx: list and
  // showcase show it (2-line clamp), grid and circles never do.
  const showDescription = (layout === 'list' || layout === 'showcase') && !!description

  const addButton = (
    <AddToCartButton
      product={{ id: product.id, name: product.name, nameEn: product.name_en, description: product.description, descriptionEn: product.description_en, comparePrice: product.compare_price, isBestSeller: product.is_best_seller, calories: product.calories, price: product.price, imageUrl: product.image_url, emoji: product.emoji, options: product.options }}
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
          priority={priority}
          sizes={IMAGE_SIZES_BY_LAYOUT[layout]}
        />
        {/* Every layout floats the add button over the image corner (list
            included, as of the Cloud-theme row redesign — CSS repositions
            it per layout, see .product-card--list .product-card__media-add
            in globals.css). A sibling of the image button (never nested
            inside it) so a tap on (+) never also triggers "view details". */}
        <div className="product-card__media-add">{addButton}</div>
      </div>
      <div className="product-card__body">
        <h3 className="product-card__name">{name}</h3>
        {showDescription && <p className="product-card__desc">{description}</p>}
        {priceBlock}
      </div>
    </article>
  )
}
