'use client'

import { useEffect, useState } from 'react'
import { useMenuBanners } from '@/lib/banners/BannerContext'
import type { Banner, DisplayCoupon } from '@/lib/banners/types'
import { t } from '@/lib/i18n'
import type { Lang } from '@/lib/types'

// Faithful port of src/features/menu/MenuOffersDrawer.jsx — same pairing logic
// (banners and coupons are independent lists, paired by index up to
// max(banners.length, coupons.length), same as the old drawer), same
// copy-to-clipboard behavior for coupon codes, new menu-next BEM classes
// instead of the old file's inline styles.
function OffersIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z" />
      <path d="M3 12h18M12 7v10M7.5 7a2.25 2.25 0 1 1 4.5 0M12 7a2.25 2.25 0 1 1 4.5 0" />
    </svg>
  )
}

function CloseIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  )
}

function OfferCard({ banner, coupon, brandColor, lang }: { banner: Banner | null; coupon: DisplayCoupon | null; brandColor: string; lang: Lang }) {
  const [copied, setCopied] = useState(false)
  const strings = t(lang)

  const copyCoupon = async () => {
    if (!coupon?.code) return
    try {
      await navigator.clipboard.writeText(coupon.code)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = coupon.code
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      textarea.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const discount = coupon && (coupon.discount_type === 'percent' ? `${coupon.discount_value}%` : `${coupon.discount_value} ﷼`)

  return (
    <article className="offer-card" style={{ borderColor: `${brandColor}2B`, background: `linear-gradient(130deg, ${brandColor}0C, #FFFFFF 60%)` }}>
      {banner && (
        <div className="offer-card__banner">
          <div className="offer-card__banner-media" style={{ background: `${brandColor}12`, color: brandColor }}>
            {banner.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={banner.image_url} alt={banner.title} loading="lazy" />
            ) : (
              <OffersIcon size={21} />
            )}
          </div>
          <div className="offer-card__banner-copy">
            <div className="offer-card__banner-title">{banner.title}</div>
            {banner.subtitle && <div className="offer-card__banner-subtitle">{banner.subtitle}</div>}
            {coupon && <div className="offer-card__banner-hint" style={{ color: brandColor }}>{strings.offerCouponHint}</div>}
          </div>
        </div>
      )}
      {coupon && (
        <div className="offer-card__coupon" style={{ borderColor: `${brandColor}55` }}>
          <span className="offer-card__coupon-icon" style={{ background: `${brandColor}14`, color: brandColor }}><OffersIcon size={17} /></span>
          <div className="offer-card__coupon-copy">
            <div className="offer-card__coupon-code">{coupon.code}</div>
            <div className="offer-card__coupon-discount">{strings.offerDiscountOff(discount || '')}</div>
          </div>
          <button type="button" className="offer-card__copy-btn" style={{ background: brandColor }} onClick={copyCoupon} aria-label={`${strings.copyCode}: ${coupon.code}`}>
            {copied ? strings.codeCopied : strings.copyCode}
          </button>
        </div>
      )}
    </article>
  )
}

export function MenuOffersDrawer({ brandColor, lang }: { brandColor: string; lang: Lang }) {
  const { offersOpen, closeOffers, banners, coupons } = useMenuBanners()
  const strings = t(lang)

  useEffect(() => {
    if (!offersOpen) return undefined
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') closeOffers() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [offersOpen, closeOffers])

  if (!offersOpen) return null
  const offerCount = Math.max(banners.length, coupons.length)
  const offers = Array.from({ length: offerCount }, (_, index) => ({ banner: banners[index] || null, coupon: coupons[index] || null }))

  return (
    <div className="offers-drawer-overlay" role="presentation" onClick={closeOffers}>
      <section className="offers-drawer" role="dialog" aria-modal="true" aria-label={strings.offersDrawerTitle} onClick={(e) => e.stopPropagation()}>
        <div className="offers-drawer__handle" />
        <div className="offers-drawer__header">
          <span className="offers-drawer__header-icon" style={{ background: `${brandColor}14`, color: brandColor }}><OffersIcon size={18} /></span>
          <div className="offers-drawer__header-copy">
            <div className="offers-drawer__title">{strings.offersDrawerTitle}</div>
            <div className="offers-drawer__count">{strings.offersActiveCount(offerCount)}</div>
          </div>
          <button type="button" className="offers-drawer__close" onClick={closeOffers} aria-label={strings.close}><CloseIcon size={17} /></button>
        </div>
        <div className="offers-drawer__list">
          {offers.map((offer, index) => (
            <OfferCard key={`${offer.banner?.id || 'banner'}-${offer.coupon?.id || 'coupon'}-${index}`} banner={offer.banner} coupon={offer.coupon} brandColor={brandColor} lang={lang} />
          ))}
        </div>
      </section>
    </div>
  )
}
