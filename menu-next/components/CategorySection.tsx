import Image from 'next/image'
import type { Category, Product, Lang, MenuLayout } from '@/lib/types'
import { ProductCard } from './ProductCard'

export function CategorySection({
  category,
  products,
  allProducts,
  recommendationsMap,
  layout = 'list',
  lang,
  currency,
  priceColor,
  branchId,
  branchName,
}: {
  category: Category
  products: Product[]
  // Full branch product list + companion-recommendation rules (#3b) — a
  // companion can belong to a different category than the product card it's
  // suggested from, so resolving it needs the whole branch, not just this
  // section's own `products`. Optional so this component still works
  // anywhere companions aren't relevant (none currently, kept optional to
  // avoid forcing every call site to pass it).
  allProducts?: Product[]
  recommendationsMap?: Record<string, string[]>
  // Admin's "شكل عرض الأصناف" (restaurants.menu_layout) — defaults to 'list',
  // the same default the database itself uses.
  layout?: MenuLayout
  lang: Lang
  currency: string
  priceColor: string
  branchId: string
  branchName: string
}) {
  const name = lang === 'en' && category.name_en ? category.name_en : category.name

  // A category with zero available products is never shown at all — ported
  // from src/features/menu/MenuBody.jsx's own `if (catProducts.length === 0)
  // return null`, not an empty-state message (menu-next previously showed one
  // here; that was a parity gap, not an intentional menu-next behavior).
  if (products.length === 0) return null

  return (
    <section id={`cat-${category.id}`} className="category-section">
      <h2 className="category-section__title">
        {category.cover_url ? (
          <Image src={category.cover_url} alt="" width={28} height={28} className="category-section__cover" aria-hidden />
        ) : (
          category.emoji && <span aria-hidden>{category.emoji} </span>
        )}
        {name}
        <span className="category-section__count">{products.length}</span>
      </h2>
      <div className={`category-section__grid category-section__grid--${layout}`}>
        {products.map((p) => (
          <ProductCard key={p.id} product={p} allProducts={allProducts} recommendationsMap={recommendationsMap} layout={layout} lang={lang} currency={currency} priceColor={priceColor} branchId={branchId} branchName={branchName} />
        ))}
      </div>
    </section>
  )
}
