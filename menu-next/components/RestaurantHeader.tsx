'use client'

import { useEffect, useRef, useState } from 'react'
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
  langHref,
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
  // resolved table QR, or a plain ?branch= link). No longer drives any UI
  // here — the branch-switcher list itself was removed from the customer
  // menu (#4, this round) — kept only so callers/page.tsx don't need
  // changes; retained for forward-compat, not currently read.
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
  // Pre-built lang-toggle URL (carries ?branch=/?table= forward, computed in
  // page.tsx where those search params already live) — rendered as one of
  // the general menu-utility icons floating on the hero (#2, this round),
  // replacing the old standalone .menu-toolbar link.
  langHref: string
}) {
  const [allergensOpen, setAllergensOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const strings = t(lang)
  const { offersCount, openOffers } = useMenuBanners()

  // Hero/glass scroll behavior (#2) — faithful port of the exact mechanism
  // in src/features/menu/MenuHeader.jsx: a single rAF-throttled `scroll`
  // listener (not a raw per-pixel handler) drives two continuous 0-1
  // progress values, never a boolean "scrolled" flag. `heroOpacity` fades
  // the fixed hero out over a 130px window (scrollY 86->216 — legacy's own
  // tuned constants, reused as-is rather than re-derived, since menu-next's
  // hero height is close enough that the same feel holds); `compactT` fades
  // the separate, always-mounted sticky mini-header in over a 42px window
  // (scrollY 78->120), plus the same small 10px->0 translateY legacy uses.
  // Both are pure derived values recomputed each throttled tick — there is
  // no separate boolean state to fall out of sync.
  const [scrollY, setScrollY] = useState(0)
  useEffect(() => {
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => { setScrollY(window.scrollY); ticking = false })
    }
    // Read the real scroll position once immediately on mount, not only on
    // the next 'scroll' event — otherwise a page that's already scrolled by
    // the time this effect attaches (a fast programmatic scroll landing
    // before hydration finishes, or a browser restoring scroll position on
    // back-navigation) would leave scrollY stuck at its initial 0 until the
    // user scrolls again, showing a fully-opaque hero over already-scrolled
    // content. Found via a real, reproducible flake while testing this
    // exact scenario (an immediate scrollTo right after navigation), not a
    // hypothetical.
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
  const heroOpacity = 1 - clamp01((scrollY - 86) / 130)
  const compactT = clamp01((scrollY - 78) / 42)

  // restaurants has no name_en column in the current schema — only description is bilingual.
  const name = restaurant.name
  const description = lang === 'en' ? restaurant.description_en || restaurant.description : restaurant.description
  const brandColor = restaurant.brand_color || '#FF6A00'

  // Description clamp/expand (#1) — same measure-after-render approach as
  // legacy's own MenuHeader.jsx: only measure while collapsed (2-line
  // clamp), comparing scrollHeight (full content) to clientHeight (clamped
  // box) to know whether "+ المزيد" is actually needed — a description that
  // already fits in 2 lines never shows the toggle.
  const descRef = useRef<HTMLParagraphElement>(null)
  const [descExpanded, setDescExpanded] = useState(false)
  const [descOverflows, setDescOverflows] = useState(false)
  useEffect(() => {
    if (descExpanded) return
    const el = descRef.current
    if (el) setDescOverflows(el.scrollHeight > el.clientHeight + 2)
  }, [description, descExpanded])

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
      {/* Reserves the hero's space in normal flow since the real hero below
          is position:fixed (see globals.css for why). */}
      <div className="menu-header__hero-spacer" />
      <div
        className="menu-header__hero"
        style={{
          opacity: heroOpacity,
          pointerEvents: heroOpacity < 0.5 ? 'none' : 'auto',
          ...(!restaurant.cover_url ? { background: `linear-gradient(160deg, ${brandColor}, ${brandColor}88)` } : {}),
        }}
      >
        {restaurant.cover_url && (
          <Image src={restaurant.cover_url} alt="" fill sizes="480px" className="menu-header__hero-image" priority />
        )}
        <div className="menu-header__hero-scrim" />

        {/* General menu functions (#2, this round) — search, language, my
            orders. Moved out of the glass card entirely (never duplicated
            there); fades and becomes non-interactive together with the hero
            itself since these are plain descendants of it (see globals.css). */}
        <div className="menu-header__hero-actions">
          <button type="button" className="menu-header__action-icon" onClick={() => setSearchOpen(true)} aria-label={strings.searchPlaceholder}>
            🔍
          </button>
          <a href={langHref} className="menu-header__action-icon menu-header__lang-toggle" aria-label={strings.switchLang}>
            {lang === 'en' ? 'ع' : 'EN'}
          </a>
          <Link href={`/menu/${slug}/orders${lang === 'en' ? '?lang=en' : ''}`} aria-label={strings.myOrders} className="menu-header__action-icon">
            🧾
          </Link>
        </div>
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
          {(restaurant.show_description ?? true) && description && (
            <div>
              <p ref={descRef} className={`menu-header__desc${descExpanded ? ' is-expanded' : ''}`}>{description}</p>
              {(descOverflows || descExpanded) && (
                <button type="button" className="menu-header__desc-toggle" style={{ color: brandColor }} onClick={() => setDescExpanded((v) => !v)}>
                  {descExpanded ? strings.descShowLess : strings.descShowMore}
                </button>
              )}
            </div>
          )}
        </div>
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

      {/* Now that My Orders moved out (#2), this row can genuinely be empty
          for a restaurant with no active offers/phone/socials/allergens —
          guarded so an empty flex row never leaves a dangling margin-top gap. */}
      {(offersCount > 0 || phone || socialKeys.length > 0 || showAllergensBtn) && (
        <div className="menu-header__actions">
          {offersCount > 0 && (
            <button type="button" className="menu-header__action-icon menu-header__action-icon--badge" onClick={openOffers} aria-label={strings.openOffers}>
              🎁
              <span className="menu-header__badge" style={{ background: brandColor }}>{offersCount > 9 ? '9+' : offersCount}</span>
            </button>
          )}
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

      {/* #4, this round — branch selection UI removed from the customer
          menu entirely: each branch now gets its own QR/URL, so the
          customer never needs to pick a branch inside the menu itself. The
          underlying branch-resolution logic (loadMenuPage's own
          tableQr?.branchId || search.branch priority) is completely
          untouched — this only removes the switcher UI that used to sit
          here, never the data layer, never QR resolution, never Branch
          URLs' own behavior. */}
      </div>

      {/* Permanent sticky mini-header — always mounted (never conditionally
          rendered) so it never flickers in/out; invisible and
          non-interactive until scroll fades it in (see globals.css). Now
          carries the same general menu functions as the hero-actions row
          (search/language/my-orders, this round) so they stay reachable
          after the hero has fully faded — same components/handlers/hrefs
          reused verbatim (setSearchOpen, langHref, the orders Link), not
          reimplemented. Same icon order as the hero row so the transition
          from one to the other reads as one continuous set, not a
          different, surprising lineup. */}
      <div
        className="menu-header__sticky"
        style={{
          opacity: compactT,
          transform: `translateX(-50%) translateY(${((1 - compactT) * -10).toFixed(1)}px)`,
          pointerEvents: compactT > 0.5 ? 'auto' : 'none',
        }}
      >
        {restaurant.logo_url ? (
          <Image src={restaurant.logo_url} alt={name} width={36} height={36} className="menu-header__sticky-logo" />
        ) : (
          <div className="menu-header__sticky-logo menu-header__sticky-logo--placeholder" style={{ background: brandColor }} aria-hidden />
        )}
        <div style={{ flex: 1 }} />
        <div className="menu-header__sticky-actions">
          <button type="button" className="menu-header__action-icon" onClick={() => setSearchOpen(true)} aria-label={strings.searchPlaceholder}>
            🔍
          </button>
          <a href={langHref} className="menu-header__action-icon menu-header__lang-toggle" aria-label={strings.switchLang}>
            {lang === 'en' ? 'ع' : 'EN'}
          </a>
          <Link href={`/menu/${slug}/orders${lang === 'en' ? '?lang=en' : ''}`} aria-label={strings.myOrders} className="menu-header__action-icon">
            🧾
          </Link>
        </div>
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
