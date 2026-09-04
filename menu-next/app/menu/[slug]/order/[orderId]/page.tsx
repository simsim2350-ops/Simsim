import type { Metadata } from 'next'
import { getRestaurantBySlug } from '@/lib/data'
import { t } from '@/lib/i18n'
import type { Lang } from '@/lib/types'
import { OrderStatusView } from '@/components/OrderStatusView'

type Params = { slug: string; orderId: string }
type Search = { token?: string; fresh?: string; branch?: string; placedAt?: string; lang?: string }

function resolveLang(search: Search): Lang {
  return search.lang === 'en' ? 'en' : 'ar'
}

// Server Component — resolves only branding (restaurant name/colors) via the
// same existing, safe, RLS-scoped getRestaurantBySlug() every other page in
// this app already uses. The order's own data (status, total, order_number)
// is never fetched here and never touches the orders table directly — that
// table's RLS is staff-only (verified in Phase 4E) — it is fetched
// client-side by OrderStatusView through get_orders_status_secure, the one
// real, existing, token-gated customer path (verified in Phase 4F).
export default async function OrderStatusPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<Search>
}) {
  const { slug, orderId } = await params
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

  if (!search.token) {
    return (
      <div className={`menu-frame${lang === 'en' ? ' lang-en' : ''}`} lang={lang} dir={lang === 'en' ? 'ltr' : 'rtl'}>
        <div className="menu-empty">
          <h1>{strings.orderErrorLoadTitle}</h1>
          <p>{strings.orderErrorLoadBody}</p>
        </div>
      </div>
    )
  }

  const priceColor = restaurant.price_color || restaurant.brand_color || '#FF6A00'
  const currency = restaurant.currency || 'SAR'

  return (
    <div className={`menu-frame${lang === 'en' ? ' lang-en' : ''}`} lang={lang} dir={lang === 'en' ? 'ltr' : 'rtl'}>
      <OrderStatusView
        orderId={orderId}
        accessToken={search.token}
        slug={slug}
        restaurantName={restaurant.name}
        branchName={search.branch ?? null}
        placedAt={search.placedAt ?? null}
        currency={currency}
        priceColor={priceColor}
        lang={lang}
        isFresh={search.fresh === '1'}
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
    title: restaurant ? `${t(lang).orderStatusTitle} — ${restaurant.name}` : t(lang).notFoundTitle,
    robots: { index: false, follow: false },
  }
}
