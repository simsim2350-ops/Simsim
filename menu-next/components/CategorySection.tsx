import Image from 'next/image'
import type { Category, Product, Lang } from '@/lib/types'
import { t } from '@/lib/i18n'
import { ProductCard } from './ProductCard'

export function CategorySection({
  category,
  products,
  lang,
  currency,
  priceColor,
  branchId,
  branchName,
}: {
  category: Category
  products: Product[]
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
            <ProductCard key={p.id} product={p} lang={lang} currency={currency} priceColor={priceColor} branchId={branchId} branchName={branchName} />
          ))}
        </div>
      )}
    </section>
  )
}
