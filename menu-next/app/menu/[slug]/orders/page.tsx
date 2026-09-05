import type { Metadata } from 'next'
import { getRestaurantBySlug } from '@/lib/data'
import { t } from '@/lib/i18n'
import type { Lang } from '@/lib/types'
import { MyOrdersView } from '@/components/MyOrdersView'

type Params = { slug: string }
type Search = { lang?: string }

function resolveLang(search: Search): Lang {
  return search.lang === 'en' ? 'en' : 'ar'
}

// Server Component — fetches only branding (name/phone/colors), the same
// minimal read the order-status page already does. The actual order list
// lives in the browser's localStorage plus live RPC/broadcast reads, so it is
// entirely a client concern (MyOrdersView), not fetched here.
export default async function MyOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<Search>
}) {
  const { slug } = await params
  const search = await searchParams
  const lang = resolveLang(search)
  const strings = t(lang)

  const restaurant = await getRestaurantBySlug(slug)
  if (!restaurant) {
    return (
      <div className="menu-frame">
        <div className="menu-empty">
          <h1>{strings.notFoundTitle}</h1>
          <p>{strings.notFoundBody}</p>
        </div>
      </div>
    )
  }

  const priceColor = restaurant.price_color || restaurant.brand_color || '#FF6A00'
  const brandColor = restaurant.brand_color || priceColor
  const currency = restaurant.currency || 'SAR'

  return (
    <div className={`menu-frame${lang === 'en' ? ' lang-en' : ''}`} lang={lang} dir={lang === 'en' ? 'ltr' : 'rtl'}>
      <MyOrdersView
        slug={slug}
        restaurantId={restaurant.id}
        restaurantName={restaurant.name}
        restaurantPhone={restaurant.phone}
        brandColor={brandColor}
        priceColor={priceColor}
        currency={currency}
        lang={lang}
      />
    </div>
  )
}

export async function generateMetadata({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }): Promise<Metadata> {
  const { slug } = await params
  const search = await searchParams
  const lang = resolveLang(search)
  const restaurant = await getRestaurantBySlug(slug)
  return {
    title: restaurant ? `${t(lang).myOrders} — ${restaurant.name}` : t(lang).notFoundTitle,
    robots: { index: false, follow: false },
  }
}
