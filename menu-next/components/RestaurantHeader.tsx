'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { Restaurant, Branch, Product, Lang, Rating } from '@/lib/types'
import type { OpenStatus } from '@/lib/openStatus'
import { t } from '@/lib/i18n'
import { SOCIAL_ICONS } from './SocialIcons'
import { AllergensModal } from './AllergensModal'
import { SearchOverlay } from './SearchOverlay'
import { useMenuBanners } from '@/lib/banners/BannerContext'
import { estimatedPrepTime } from '@/lib/prepTime'

// Restaurant info depth ported from the old menu's MenuHeader.jsx: rating,
// open/closed status + today's hours (or next-opening text), location + map
// link, phone, social links, allergens — same data sources, same visibility
// toggles (restaurant.show_*), same "only show a rating once reviews exist"
// rule. Visual layout follows menu-next's own existing design (not the old
// header's UI) — only the underlying behavior/data is carried over.
export function RestaurantHeader({
  restaurant,
  branches,
  activeBranch,
  lang,
  rating,
  openStatus,
  products,
  currency,
  priceColor,
  slug,
  branchLocked = false,
  activeOrdersCount = 0,
  deliveryEnabled = false,
  deliveryFee = 0,
}: {
  restaurant: Restaurant
  branches: Branch[]
  activeBranch: Branch
  lang: Lang
  rating: Rating
  openStatus: OpenStatus
  products: Product[]
  currency: string
  priceColor: string
  slug: string
  // True when the current URL/QR already made an explicit branch choice (a
  // resolved table QR, or a plain ?branch= link) — the switcher must not
  // offer a casual way out of that choice (#2, branch isolation). Defaults to
  // false so any caller that doesn't pass it keeps today's behavior.
  branchLocked?: boolean
  // Feeds the estimated prep-time display below (restaurant.show_prep_time) —
  // defaults to 0 so any caller that doesn't pass it just shows the base
  // "10-20 min" estimate rather than breaking.
  activeOrdersCount?: number
  // Feeds the delivery-fee meta item below — same effectiveDeliverySettings()
  // resolution already used at checkout, computed once by the page and
  // passed down rather than recomputed here.
  deliveryEnabled?: boolean
  deliveryFee?: number
}) {
  const [allergensOpen, setAllergensOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const strings = t(lang)
  const { offersCount, openOffers } = useMenuBanners()

  // restaurants has no name_en column in the current schema — only description is bilingual.
  const name = restaurant.name
  const description = lang === 'en' ? restaurant.description_en || restaurant.description : restaurant.description
  const brandColor = restaurant.brand_color || '#FF6A00'

  const address = activeBranch.address || restaurant.address
  const mapsUrl = activeBranch.maps_url || restaurant.maps_url
  const phone = activeBranch.phone || restaurant.phone
  const showHours = restaurant.show_hours ?? true
  const hoursDetail = showHours
    ? (openStatus.open ? (!openStatus.unknown && openStatus.todayText ? openStatus.todayText : '') : (openStatus.nextText || ''))
    : ''

  const showSocial = (restaurant.show_social_links ?? true) && !!restaurant.social_links
  const socialKeys = (showSocial
    ? (['instagram', 'whatsapp_social', 'snapchat'] as const).filter((key) => restaurant.social_links?.[key])
    : [])
  const showAllergensBtn = (restaurant.show_allergens ?? true) && Array.isArray(restaurant.allergens) && restaurant.allergens.length > 0
  const showPrepTime = restaurant.show_prep_time ?? true

  return (
    <header className="menu-header" style={{ borderColor: brandColor }}>
      {/* Hero banner (Admin's "Cover upload", restaurants.cover_url) — ported
          from src/features/menu/MenuHeader.jsx: always renders as a full-width
          band above the identity row, the real cover image if the owner set
          one, else the same brand-color gradient fallback (never blank).
          Simplified vs. the old header's fixed-position scroll-parallax
          treatment — this page is Server-Component-first, so a static band is
          the proportionate port rather than adding scroll-driven client JS. */}
      <div className="menu-header__hero" style={!restaurant.cover_url ? { background: `linear-gradient(160deg, ${brandColor}, ${brandColor}88)` } : undefined}>
        {restaurant.cover_url && (
          <Image src={restaurant.cover_url} alt="" fill sizes="480px" className="menu-header__hero-image" priority />
        )}
        <div className="menu-header__hero-scrim" />
      </div>

      {/* Frosted-glass identity card, floating over the hero image — faithful
          port of src/features/menu/MenuHeader.jsx's own floating card
          (rgba(255,255,255,0.72) + blur(12px) + 22px radius + the same
          box-shadow), which wraps exactly this same content there: identity
          row, location, actions, branch switcher. Reusable — no restaurant-
          specific values are hardcoded here, only brandColor (already a prop
          everywhere else in this file). */}
      <div className="menu-header__card">
      <div className="menu-header__top">
        {restaurant.logo_url ? (
          <Image
            src={restaurant.logo_url}
            alt={name}
            width={64}
            height={64}
            className="menu-header__logo"
            priority
          />
        ) : (
          <div className="menu-header__logo menu-header__logo--placeholder" style={{ background: brandColor }} aria-hidden />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="menu-header__name">{name}</h1>
          {rating && (
            <div className="menu-header__rating">
              ★ {rating.avg} <span>({rating.count} {strings.reviewsWord})</span>
            </div>
          )}
          {showHours && (
            <div className={`menu-header__status ${openStatus.open ? 'is-open' : 'is-closed'}`}>
              <span className="menu-header__status-dot" aria-hidden />
              {openStatus.open ? strings.openNow : strings.closedNow}
              {hoursDetail && <span className="menu-header__status-detail"> · {hoursDetail}</span>}
            </div>
          )}
          {(restaurant.show_description ?? true) && description && <p className="menu-header__desc">{description}</p>}
        </div>
        <button type="button" className="menu-header__search-btn" onClick={() => setSearchOpen(true)} aria-label={strings.searchPlaceholder}>
          🔍
        </button>
      </div>

      {(address || mapsUrl || showPrepTime || deliveryEnabled) && (
        <div className="menu-header__location">
          {address && <span className="menu-header__address">📍 {address}</span>}
          {/* Estimated prep time (restaurant.show_prep_time) — ported from
              src/features/menu/MenuHeader.jsx's own meta row: base 10 minutes
              + 3 per currently-active order, same "min-max" range. A fresh
              per-request snapshot here rather than the old header's live
              realtime-updated counter — proportionate for a Server Component
              page that already re-renders per request. */}
          {showPrepTime && <span className="menu-header__prep-time">⏱️ {estimatedPrepTime(activeOrdersCount)} {strings.minShort}</span>}
          {/* Delivery fee shown upfront while browsing, not only at checkout —
              same meta item as legacy's own header. */}
          {deliveryEnabled && (
            <span className="menu-header__prep-time">🚚 {deliveryFee > 0 ? `${deliveryFee.toFixed(0)} ${currency}` : strings.freeDelivery}</span>
          )}
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="menu-header__map-link" style={{ color: brandColor }}>
              {strings.mapBtn}
            </a>
          )}
        </div>
      )}

      <div className="menu-header__actions">
        <Link href={`/menu/${slug}/orders${lang === 'en' ? '?lang=en' : ''}`} aria-label={strings.myOrders} className="menu-header__action-icon">
          🧾
        </Link>
        {offersCount > 0 && (
          <button type="button" className="menu-header__action-icon menu-header__action-icon--badge" onClick={openOffers} aria-label={strings.openOffers}>
            🎁
            <span className="menu-header__badge" style={{ background: brandColor }}>{offersCount > 9 ? '9+' : offersCount}</span>
          </button>
        )}
        {(phone || socialKeys.length > 0 || showAllergensBtn) && (
          <>
          {phone && (
            <a href={`tel:${phone}`} aria-label={strings.call} className="menu-header__action-icon">📞</a>
          )}
          {socialKeys.map((key) => {
            const Icon = SOCIAL_ICONS[key]
            return (
              <a key={key} href={restaurant.social_links![key]} target="_blank" rel="noopener noreferrer" className="menu-header__action-icon">
                <Icon />
              </a>
            )
          })}
          {showAllergensBtn && (
            <button type="button" className="menu-header__allergens-btn" onClick={() => setAllergensOpen(true)}>
              ⚠️ {strings.allergens}
            </button>
          )}
          </>
        )}
      </div>

      {/* #2 branch isolation: a URL/QR that already named an explicit branch
          must not also offer a one-tap way to a different branch. Only a
          plain restaurant-level visit (no ?branch=, no resolved table QR)
          shows this. */}
      {!branchLocked && branches.length > 1 && (
        <nav className="menu-header__branches" aria-label={strings.branches}>
          {branches.map((b) => {
            const label = lang === 'en' && b.name_en ? b.name_en : b.name
            const isActive = b.id === activeBranch.id
            return (
              <a
                key={b.id}
                href={`?branch=${b.id}${lang === 'en' ? '&lang=en' : ''}`}
                className={`menu-header__branch${isActive ? ' is-active' : ''}`}
                style={isActive ? { background: brandColor, borderColor: brandColor } : undefined}
              >
                {label}
              </a>
            )
          })}
        </nav>
      )}
      </div>

      <AllergensModal open={allergensOpen} onClose={() => setAllergensOpen(false)} allergens={restaurant.allergens} lang={lang} />
      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        products={products}
        lang={lang}
        currency={currency}
        priceColor={priceColor}
        branchId={activeBranch.id}
        branchName={lang === 'en' && activeBranch.name_en ? activeBranch.name_en : activeBranch.name}
      />
    </header>
  )
}
