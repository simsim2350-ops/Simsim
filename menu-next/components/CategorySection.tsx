import Image from 'next/image'
import type { Category, Product, Lang, MenuLayout } from '@/lib/types'
import { ProductCard } from './ProductCard'

export function CategorySection({
  category,
  products,
  allProducts,
  recommendationsMap,
  layout = 'list',
  horizontalScroll = false,
  lang,
  currency,
  priceColor,
  branchId,
  branchName,
  firstSection = false,
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
  // "الأكثر طلبًا" only (this round) — renders the same cards (still driven
  // by `layout`, normally 'list' for this case) in a horizontally-scrolling
  // row instead of the standard vertical grid. Every other section is
  // unaffected — this is a pure CSS presentation switch on the wrapping
  // grid element, not a different component tree or a new ProductCard
  // layout variant.
  horizontalScroll?: boolean
  lang: Lang
  currency: string
  priceColor: string
  branchId: string
  branchName: string
  // True only for the very first CategorySection rendered on the page (set
  // by page.tsx) — this section's own first product then becomes the single
  // priority-loaded image on the whole page (the LCP candidate). Every
  // other section/product keeps the old default lazy behavior.
  // (SIMSIM_MENU_PERFORMANCE_AUDIT_REPORT.md §4/§7/§14.)
  firstSection?: boolean
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
      <div className={`category-section__grid category-section__grid--${layout}${horizontalScroll ? ' category-section__grid--horizontal-scroll' : ''}`}>
        {products.map((p, i) => (
          <ProductCard key={p.id} product={p} allProducts={allProducts} recommendationsMap={recommendationsMap} layout={layout} lang={lang} currency={currency} priceColor={priceColor} branchId={branchId} branchName={branchName} priority={firstSection && i === 0} />
        ))}
      </div>
    </section>
  )
}
