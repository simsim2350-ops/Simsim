'use client'

import { useState } from 'react'
import Image from 'next/image'
import type { Restaurant, Branch, Product, Lang, Rating } from '@/lib/types'
import type { OpenStatus } from '@/lib/openStatus'
import { t } from '@/lib/i18n'
import { SOCIAL_ICONS } from './SocialIcons'
import { AllergensModal } from './AllergensModal'
import { SearchOverlay } from './SearchOverlay'

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
}) {
  const [allergensOpen, setAllergensOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const strings = t(lang)

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

  return (
    <header className="menu-header" style={{ borderColor: brandColor }}>
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

      {(address || mapsUrl) && (
        <div className="menu-header__location">
          {address && <span className="menu-header__address">📍 {address}</span>}
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="menu-header__map-link" style={{ color: brandColor }}>
              {strings.mapBtn}
            </a>
          )}
        </div>
      )}

      {(phone || socialKeys.length > 0 || showAllergensBtn) && (
        <div className="menu-header__actions">
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
        </div>
      )}

      {branches.length > 1 && (
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
