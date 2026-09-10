import type { Metadata } from 'next'
import { loadMenuPage, getBranchTablesForMenu, getPhoneVerificationEnabled } from '@/lib/data'
import { t } from '@/lib/i18n'
import type { Lang } from '@/lib/types'
import { computeBranchOpenStatus, effectiveDeliverySettings } from '@/lib/openStatus'
import { resolveTableQr } from '@/lib/tableQr'
import { CheckoutForm } from '@/components/CheckoutForm'

type Params = { slug: string }
type Search = { branch?: string; lang?: string; table?: string }

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
  // Re-resolved independently here rather than trusting a value carried over
  // from the menu page — same "never trust the query string alone" contract
  // as resolveTableQr's own doc comment. A failed/invalid token falls back
  // to ?branch= exactly as if no table param had been given.
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

  const { restaurant, branch, products } = data
  const priceColor = restaurant.price_color || restaurant.brand_color || '#FF6A00'
  const currency = restaurant.currency || 'SAR'
  const openStatus = computeBranchOpenStatus(branch)
  const delivery = effectiveDeliverySettings(branch, restaurant)
  const takeawayEnabled = branch.takeaway_enabled ?? true
  // Car Pickup (Phase 2) — same shape as takeawayEnabled: a plain branch
  // column, no restaurant-level fallback. Already selected by the same
  // getActiveBranches() query as the rest of `branch` (Phase 1's schema
  // addition), so no extra request is needed here.
  const carPickupEnabled = branch.car_pickup_enabled ?? false
  const carPickupInfoLabel = branch.car_pickup_info_label ?? null
  const carPickupInfoRequired = branch.car_pickup_info_required ?? false
  // Section 1B: a plain branch-URL visit (no resolved table QR) gets a real
  // dropdown of this branch's own active tables instead of free-text entry.
  // A resolved table QR already carries its own locked, server-verified
  // table — it never needs this list. Empty for a branch with no configured
  // tables (falls back to the existing free-text input in CheckoutForm).
  const branchTables = tableQr ? [] : await getBranchTablesForMenu(slug, branch.id)
  // Phase 3C.3 — resolved server-side, same trust level as every other flag
  // on this page (delivery/takeaway/car pickup). When false (today's global
  // default), CheckoutForm's behavior is byte-for-byte unchanged from before
  // this phase.
  const phoneVerificationEnabled = await getPhoneVerificationEnabled(restaurant.id)

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
        carPickupEnabled={carPickupEnabled}
        carPickupInfoLabel={carPickupInfoLabel}
        carPickupInfoRequired={carPickupInfoRequired}
        availableProductIds={products.map((p) => p.id)}
        resolvedTableName={tableQr?.tableName ?? null}
        resolvedTableToken={tableQr?.token ?? null}
        branchTables={branchTables}
        phoneVerificationEnabled={phoneVerificationEnabled}
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
