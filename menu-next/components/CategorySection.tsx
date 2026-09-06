import Image from 'next/image'
import type { Category, Product, Lang } from '@/lib/types'
import { t } from '@/lib/i18n'
import { ProductCard } from './ProductCard'

export function CategorySection({
  category,
  products,
  allProducts,
  recommendationsMap,
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
  lang: Lang
  currency: string
  priceColor: string
  branchId: string
  branchName: string
}) {
  const name = lang === 'en' && category.name_en ? category.name_en : category.name

  return (
    <section id={`cat-${category.id}`} className="category-section">
      <h2 className="category-section__title">
        {category.cover_url ? (
          <Image src={category.cover_url} alt="" width={28} height={28} className="category-section__cover" aria-hidden />
        ) : (
          category.emoji && <span aria-hidden>{category.emoji} </span>
        )}
        {name}
      </h2>
      {products.length === 0 ? (
        <p className="category-section__empty">{t(lang).noProducts}</p>
      ) : (
        <div className="category-section__grid">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} allProducts={allProducts} recommendationsMap={recommendationsMap} lang={lang} currency={currency} priceColor={priceColor} branchId={branchId} branchName={branchName} />
          ))}
        </div>
      )}
    </section>
  )
}
