import type { Metadata } from 'next'
import { loadMenuPage } from '@/lib/data'
import { t } from '@/lib/i18n'
import type { Lang } from '@/lib/types'
import { computeBranchOpenStatus, effectiveDeliverySettings } from '@/lib/openStatus'
import { CheckoutForm } from '@/components/CheckoutForm'

type Params = { slug: string }
type Search = { branch?: string; lang?: string }

function resolveLang(search: Search): Lang {
  return search.lang === 'en' ? 'en' : 'ar'
}

// Server Component — fetches restaurant/branch the same way the menu page
// does (same cached loadMenuPage(), same RLS-scoped read). Cart contents
// themselves are browser-only state (CartContext) and are read client-side
// by CheckoutForm — this page never needs to know what's in the cart to
// render the restaurant/branch/order-type/open-status context around it.
export default async function CheckoutPage({
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

  const { restaurant, branch, products } = data
  const priceColor = restaurant.price_color || restaurant.brand_color || '#FF6A00'
  const currency = restaurant.currency || 'SAR'
  const openStatus = computeBranchOpenStatus(branch)
  const delivery = effectiveDeliverySettings(branch, restaurant)
  const takeawayEnabled = branch.takeaway_enabled ?? true

  return (
    <div className={`menu-frame${lang === 'en' ? ' lang-en' : ''}`} lang={lang} dir={lang === 'en' ? 'ltr' : 'rtl'}>
      <CheckoutForm
        slug={slug}
        restaurantId={restaurant.id}
        branchId={branch.id}
        branchName={lang === 'en' && branch.name_en ? branch.name_en : branch.name}
        restaurantName={restaurant.name}
        currency={currency}
        priceColor={priceColor}
        lang={lang}
        openStatus={openStatus}
        deliveryEnabled={delivery.enabled}
        deliveryFee={delivery.fee}
        takeawayEnabled={takeawayEnabled}
        availableProductIds={products.map((p) => p.id)}
      />
    </div>
  )
}

export async function generateMetadata({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }): Promise<Metadata> {
  const { slug } = await params
  const search = await searchParams
  const lang = resolveLang(search)
  const data = await loadMenuPage(slug, search.branch)
  if (!data) return { title: t(lang).notFoundTitle }
  return { title: `${t(lang).checkoutTitle} — ${data.restaurant.name}` }
}
