import type { Metadata } from 'next'
import { loadMenuPage, getRestaurantRating, getCustomerFavorites, getActiveCartWideIds, getActiveBanners, getActiveCouponsForDisplay, getActiveRecommendationsMap, getActiveOrdersCount } from '@/lib/data'
import { t } from '@/lib/i18n'
import type { Lang } from '@/lib/types'
import { resolveTableQr } from '@/lib/tableQr'
import { computeBranchOpenStatus, effectiveDeliverySettings } from '@/lib/openStatus'
import { RestaurantHeader } from '@/components/RestaurantHeader'
import { CategoryNav } from '@/components/CategoryNav'
import { CategorySection } from '@/components/CategorySection'
import { CartWidget } from '@/components/CartWidget'
import { BranchConflictModal } from '@/components/BranchConflictModal'
import { BannerProvider } from '@/lib/banners/BannerContext'
import { TopMenuBanner, InlineMenuBanner, FloatingMenuBanner, MenuBannerOverlays } from '@/components/BannerDisplays'
import { MenuOffersDrawer } from '@/components/MenuOffersDrawer'

type Params = { slug: string }
type Search = { branch?: string; lang?: string; table?: string }

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
  // A resolved table's own branch always wins over ?branch= — same priority
  // as src/pages/PublicMenu.jsx's effectiveBranchId. A failed/invalid token
  // resolves to null and falls back to ?branch= exactly as if no table
  // param had been given at all — never blocks the page.
  const tableQr = await resolveTableQr(search.table, slug)
  const data = await loadMenuPage(slug, tableQr?.branchId || search.branch)

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
  const brandColor = restaurant.brand_color || '#FF6A00'
  const currency = restaurant.currency || 'SAR'
  // #3 category nav — only real categories that will actually render a
  // section (already is_visible-filtered by getVisibleCategories, and here
  // additionally excludes an empty one, matching CategorySection's own
  // `products.length === 0 -> return null`), in the same Dashboard sort
  // order as `categories` itself. Never the synthetic highlight-rail
  // "categories" (best sellers/featured/favorites) built above.
  const navCategories = categories
    .filter((c) => (productsByCategory.get(c.id) ?? []).length > 0)
    .map((c) => ({ id: c.id, name: lang === 'en' && c.name_en ? c.name_en : c.name }))
  const branchName = lang === 'en' && branch.name_en ? branch.name_en : branch.name
  const openStatus = computeBranchOpenStatus(branch)
  const delivery = effectiveDeliverySettings(branch, restaurant)
  // Only a resolved TABLE QR locks the branch switcher (#2, branch isolation)
  // — a table is a physical, one-location context, so offering a one-tap
  // jump to a different branch while "seated" at this table doesn't make
  // sense. A plain `?branch=` link is not the same thing: it's the switcher's
  // own normal navigation mechanism (confirmed by the pre-existing,
  // already-passing branch.spec.ts, which clicks a branch link and expects
  // the switcher to still be visible with the new branch marked active
  // afterwards) — locking on it too would make the switcher unusable after
  // the first switch. This is a UI-level lock on top of the data layer,
  // which was already correctly scoped before this change (every fetch below
  // already keys off the resolved `branch.id`, and a resolved table QR's own
  // branchId always wins over `search.branch` in the loadMenuPage call
  // above, regardless of this flag).
  const branchLocked = Boolean(tableQr)

  // Restaurant info depth (rating) and the three highlight sections — same
  // sources/rules/priority order as the old menu's useMenuData.js/MenuBody.jsx:
  // owner-curated best sellers > owner-curated featured > real order-frequency
  // favorites > plain categories. Fetched in parallel; neither blocks the other.
  const [rating, customerFavorites, cartWideIds, banners, couponsForDisplay, recommendationsMap, activeOrdersCount] = await Promise.all([
    getRestaurantRating(restaurant.id),
    getCustomerFavorites(restaurant.id, products),
    getActiveCartWideIds(restaurant.id, branch.id),
    getActiveBanners(restaurant.id, branch.id),
    getActiveCouponsForDisplay(restaurant.id, branch.id),
    getActiveRecommendationsMap(restaurant.id),
    getActiveOrdersCount(restaurant.id, branch.id),
  ])
  const manualBestSellers = products.filter((p) => p.is_best_seller === true).slice(0, 4)
  const featuredProducts = products.filter((p) => p.is_featured === true).slice(0, 4)

  const highlightSections: { key: string; title: string; products: typeof products }[] = [
    ...(manualBestSellers.length > 0 ? [{ key: 'best-sellers', title: t(lang).manualBestSellers, products: manualBestSellers }] : []),
    ...(featuredProducts.length > 0 ? [{ key: 'featured', title: t(lang).featuredProducts, products: featuredProducts }] : []),
    ...(customerFavorites.length > 0 ? [{ key: 'favorites', title: t(lang).customerFavorites, products: customerFavorites }] : []),
  ]

  return (
    <div className={`menu-frame${lang === 'en' ? ' lang-en' : ''}`} lang={lang} dir={lang === 'en' ? 'ltr' : 'rtl'}>
      <BannerProvider banners={banners} coupons={couponsForDisplay} restaurantId={restaurant.id} branchId={branch.id}>
        <RestaurantHeader
          restaurant={restaurant}
          branches={branches}
          activeBranch={branch}
          lang={lang}
          rating={rating}
          openStatus={openStatus}
          products={products}
          currency={currency}
          priceColor={priceColor}
          slug={slug}
          branchLocked={branchLocked}
          activeOrdersCount={activeOrdersCount}
          deliveryEnabled={delivery.enabled}
          deliveryFee={delivery.fee}
        />

        {/* بانر أعلى المنيو — أول عنصر عند اختيار وضع "أعلى المينيو" (#2b) */}
        <TopMenuBanner brandColor={priceColor} lang={lang} />

        {/* شريط الأقسام الأفقي (#3) — يبقى ملتصقًا أعلى الشاشة، فوق كل المحتوى
            بما فيه صفوف المختارات، تمامًا كما في المنيو القديم. */}
        <CategoryNav categories={navCategories} brandColor={brandColor} />

        <div className="menu-toolbar">
          <a
            className="menu-toolbar__lang"
            // #2 branch isolation: must carry `table` forward too, or
            // switching language on a resolved table-QR page would silently
            // drop the lock and fall back to the primary branch.
            href={`?${new URLSearchParams({ ...(search.branch ? { branch: search.branch } : {}), ...(search.table ? { table: search.table } : {}), lang: lang === 'en' ? 'ar' : 'en' }).toString()}`}
          >
            {t(lang).switchLang}
          </a>
        </div>

        {highlightSections.map((section) => (
          <CategorySection
            key={section.key}
            category={{ id: section.key, branch_id: branch.id, name: section.title, name_en: section.title, emoji: null, cover_url: null, sort_order: -1, is_visible: true }}
            products={section.products}
            allProducts={products}
            recommendationsMap={recommendationsMap}
            // Highlight rails always render as 'grid', regardless of the
            // restaurant's own menu_layout setting — same as legacy's
            // MenuBody.jsx (best-sellers/featured force layout="grid").
            layout="grid"
            lang={lang}
            currency={currency}
            priceColor={priceColor}
            branchId={branch.id}
            branchName={branchName}
          />
        ))}

        {/* بانر منتصف المنيو — بين المختارات والأقسام العادية (#2b) */}
        <InlineMenuBanner brandColor={priceColor} lang={lang} />

        {categories.length === 0 ? (
          <p className="category-section__empty" style={{ padding: '18px 16px' }}>{t(lang).noCategories}</p>
        ) : (
          categories.map((category) => (
            <CategorySection
              key={category.id}
              category={category}
              products={productsByCategory.get(category.id) ?? []}
              allProducts={products}
              recommendationsMap={recommendationsMap}
              layout={restaurant.menu_layout || 'list'}
              lang={lang}
              currency={currency}
              priceColor={priceColor}
              branchId={branch.id}
              branchName={branchName}
            />
          ))
        )}

        <footer className="menu-footer">{t(lang).poweredBy}</footer>
        <CartWidget
          lang={lang}
          currency={currency}
          priceColor={priceColor}
          branchId={branch.id}
          branchName={branchName}
          slug={slug}
          products={products}
          tableToken={tableQr?.token}
          cartWideIds={cartWideIds}
          recommendationsEnabled={restaurant.recommendations_enabled !== false}
          recommendationsCount={restaurant.recommendations_count || 4}
        />
        <BranchConflictModal lang={lang} />

        <FloatingMenuBanner brandColor={priceColor} lang={lang} />
        <MenuBannerOverlays brandColor={priceColor} lang={lang} />
        <MenuOffersDrawer brandColor={priceColor} lang={lang} />
      </BannerProvider>
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
