import type { Metadata } from 'next'
import { loadMenuPage } from '@/lib/data'
import { t } from '@/lib/i18n'
import type { Lang } from '@/lib/types'
import { RestaurantHeader } from '@/components/RestaurantHeader'
import { CategorySection } from '@/components/CategorySection'
import { CartWidget } from '@/components/CartWidget'
import { BranchConflictModal } from '@/components/BranchConflictModal'

type Params = { slug: string }
type Search = { branch?: string; lang?: string }

function resolveLang(search: Search): Lang {
  return search.lang === 'en' ? 'en' : 'ar'
}

// Server Component only — Next.js -> Server Component -> Supabase -> restaurant
// data -> HTML, exactly the chain this POC exists to prove. No client JS at all
// on this route (no 'use client' anywhere in its component tree).
export default async function MenuPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<Search>
}) {
  const { slug } = await params
  const search = await searchParams
  const lang = resolveLang(search)
  const data = await loadMenuPage(slug, search.branch)

  if (!data) {
    return (
      <div className="menu-frame">
        <div className="menu-empty">
          <h1>{t(lang).notFoundTitle}</h1>
          <p>{t(lang).notFoundBody}</p>
        </div>
      </div>
    )
  }

  const { restaurant, branch, branches, categories, products } = data
  const productsByCategory = new Map<string, typeof products>()
  for (const p of products) {
    const key = p.category_id ?? ''
    if (!productsByCategory.has(key)) productsByCategory.set(key, [])
    productsByCategory.get(key)!.push(p)
  }

  const priceColor = restaurant.price_color || restaurant.brand_color || '#FF6A00'
  const currency = restaurant.currency || 'SAR'

  return (
    <div className={`menu-frame${lang === 'en' ? ' lang-en' : ''}`} lang={lang} dir={lang === 'en' ? 'ltr' : 'rtl'}>
      <RestaurantHeader restaurant={restaurant} branches={branches} activeBranch={branch} lang={lang} />

      <div className="menu-toolbar">
        <a
          className="menu-toolbar__lang"
          href={`?${new URLSearchParams({ ...(search.branch ? { branch: search.branch } : {}), lang: lang === 'en' ? 'ar' : 'en' }).toString()}`}
        >
          {t(lang).switchLang}
        </a>
      </div>

      {categories.length === 0 ? (
        <p className="category-section__empty" style={{ padding: '18px 16px' }}>{t(lang).noCategories}</p>
      ) : (
        categories.map((category) => (
          <CategorySection
            key={category.id}
            category={category}
            products={productsByCategory.get(category.id) ?? []}
            lang={lang}
            currency={currency}
            priceColor={priceColor}
            branchId={branch.id}
            branchName={lang === 'en' && branch.name_en ? branch.name_en : branch.name}
          />
        ))
      )}

      <footer className="menu-footer">{t(lang).poweredBy}</footer>
      <CartWidget lang={lang} currency={currency} priceColor={priceColor} branchId={branch.id} slug={slug} products={products} />
      <BranchConflictModal lang={lang} />
    </div>
  )
}

// Dynamic, per-restaurant SEO metadata — generated server-side from real data,
// not a shared static block. This is the concrete gap identified in Phase 1.
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<Search>
}): Promise<Metadata> {
  const { slug } = await params
  const search = await searchParams
  const lang = resolveLang(search)
  const data = await loadMenuPage(slug, search.branch)

  if (!data) {
    return { title: t(lang).notFoundTitle }
  }

  const { restaurant } = data
  const description = (lang === 'en' ? restaurant.description_en || restaurant.description : restaurant.description)
    || restaurant.name

  return {
    title: `${restaurant.name} | SimSim Menu`,
    description,
    openGraph: {
      title: restaurant.name,
      description,
      images: restaurant.logo_url ? [{ url: restaurant.logo_url }] : undefined,
      locale: lang === 'en' ? 'en_US' : 'ar_SA',
    },
  }
}
