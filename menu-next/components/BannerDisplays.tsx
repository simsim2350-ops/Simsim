'use client'

import { useState } from 'react'
import { useMenuBanners } from '@/lib/banners/BannerContext'
import type { Banner } from '@/lib/banners/types'
import { t } from '@/lib/i18n'
import type { Lang } from '@/lib/types'

// Faithful port of src/features/menu/BannerDisplays.jsx's five display-mode
// components (top/inline/floating/fullscreen/popup) — same behavior (each
// reads its own slice off the shared banner state via useMenuBanners(),
// mirroring the old PublicMenu.jsx's `bannerDisplay.topBanner` etc.), new
// menu-next BEM classes instead of the old file's inline styles, and lang/isEn
// support added throughout (the old sub-components were Arabic-only; menu-next
// is bilingual by design, so this is a necessary adaptation, not a behavior
// change to anything that existed before).

function BannerIcon({ type = 'spark', size = 18 }: { type?: 'close' | 'spark' | 'arrow'; size?: number }) {
  const paths: Record<string, string> = {
    close: 'm18 6-12 12M6 6l12 12',
    spark: 'm12 2 1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2z',
    arrow: 'm9 18 6-6-6-6',
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[type]} />
    </svg>
  )
}

function BannerImage({ banner, compact = false }: { banner: Banner; compact?: boolean }) {
  if (!banner.image_url) {
    return (
      <span className={`banner-image banner-image--placeholder${compact ? ' is-compact' : ''}`}>
        <BannerIcon size={compact ? 19 : 32} />
      </span>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={`banner-image${compact ? ' is-compact' : ''}`} src={banner.image_url} alt={banner.title} loading="lazy" />
}

function OfferCopy({ banner }: { banner: Banner; lang: Lang }) {
  return (
    <div className="banner-copy">
      <div className="banner-copy__title">{banner.title}</div>
      {banner.subtitle && <div className="banner-copy__subtitle">{banner.subtitle}</div>}
    </div>
  )
}

function DetailOffer({ banner, brandColor, lang, onClose }: { banner: Banner; brandColor: string; lang: Lang; onClose: () => void }) {
  const strings = t(lang)
  return (
    <div className="banner-detail-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={banner.title}>
      <section className="banner-detail" onClick={(e) => e.stopPropagation()}>
        <div className="banner-detail__handle" />
        <div className="banner-detail__row">
          <BannerImage banner={banner} compact />
          <OfferCopy banner={banner} lang={lang} />
          <button type="button" className="banner-detail__close" onClick={onClose} aria-label={strings.close}>
            <BannerIcon type="close" size={16} />
          </button>
        </div>
        <button type="button" className="banner-detail__cta" style={{ background: brandColor }} onClick={onClose}>
          {banner.cta_text || strings.bannerCtaDefault}
        </button>
      </section>
    </div>
  )
}

export function TopMenuBanner({ brandColor, lang }: { brandColor: string; lang: Lang }) {
  const { topBanner } = useMenuBanners()
  const [expanded, setExpanded] = useState(false)
  const strings = t(lang)
  if (!topBanner) return null
  return (
    <section className="banner-top" style={{ background: `linear-gradient(120deg, ${brandColor}18, ${brandColor}0A)`, borderColor: `${brandColor}35` }}>
      <span className="banner-top__icon" style={{ background: brandColor }}><BannerIcon size={16} /></span>
      <OfferCopy banner={topBanner} lang={lang} />
      <button type="button" className="banner-top__view-btn" style={{ color: brandColor }} onClick={() => setExpanded(true)}>{strings.offersViewBtn}</button>
      {expanded && <DetailOffer banner={topBanner} brandColor={brandColor} lang={lang} onClose={() => setExpanded(false)} />}
    </section>
  )
}

export function InlineMenuBanner({ brandColor, lang }: { brandColor: string; lang: Lang }) {
  const { inlineBanner } = useMenuBanners()
  const [expanded, setExpanded] = useState(false)
  const strings = t(lang)
  if (!inlineBanner) return null
  return (
    <>
      <section className="banner-inline" style={{ borderColor: `${brandColor}35` }}>
        <div className="banner-inline__row">
          <BannerImage banner={inlineBanner} compact />
          <OfferCopy banner={inlineBanner} lang={lang} />
          <button type="button" className="banner-inline__arrow" style={{ background: brandColor }} onClick={() => setExpanded(true)} aria-label={`${strings.offersViewBtn}: ${inlineBanner.title}`}>
            <BannerIcon type="arrow" size={16} />
          </button>
        </div>
      </section>
      {expanded && <DetailOffer banner={inlineBanner} brandColor={brandColor} lang={lang} onClose={() => setExpanded(false)} />}
    </>
  )
}

export function FloatingMenuBanner({ brandColor, lang }: { brandColor: string; lang: Lang }) {
  const { floatingBanner } = useMenuBanners()
  const [expanded, setExpanded] = useState(false)
  const strings = t(lang)
  if (!floatingBanner) return null
  return (
    <>
      {expanded && <DetailOffer banner={floatingBanner} brandColor={brandColor} lang={lang} onClose={() => setExpanded(false)} />}
      <button type="button" className="banner-floating" style={{ background: brandColor, boxShadow: `0 8px 22px ${brandColor}66` }} onClick={() => setExpanded(true)} aria-label={`${strings.offersViewBtn}: ${floatingBanner.title}`}>
        <span className="banner-floating__icon"><BannerIcon size={13} /></span>
        <span className="banner-floating__title">{floatingBanner.title}</span>
      </button>
    </>
  )
}

function FullscreenOffer({ banner, brandColor, lang, onDismiss }: { banner: Banner; brandColor: string; lang: Lang; onDismiss: () => void }) {
  const strings = t(lang)
  return (
    <div className="banner-fullscreen-overlay" role="dialog" aria-modal="true" aria-label={banner.title}>
      <section className="banner-fullscreen" style={{ boxShadow: '0 24px 70px rgba(0,0,0,.42)' }}>
        <div className="banner-fullscreen__media" style={{ background: `linear-gradient(145deg, ${brandColor}, ${brandColor}BB)` }}>
          {banner.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="banner-fullscreen__image" src={banner.image_url} alt={banner.title} />
          )}
          <div className="banner-fullscreen__scrim" />
          <button type="button" className="banner-fullscreen__close" onClick={onDismiss} aria-label={strings.bannerEnterMenu}>
            <BannerIcon type="close" size={18} />
          </button>
          <div className="banner-fullscreen__copy">
            <div className="banner-fullscreen__title">{banner.title}</div>
            {banner.subtitle && <div className="banner-fullscreen__subtitle">{banner.subtitle}</div>}
          </div>
        </div>
        <div className="banner-fullscreen__actions">
          <button type="button" className="banner-fullscreen__cta" style={{ background: brandColor }} onClick={onDismiss}>{banner.cta_text || strings.bannerCtaDefault}</button>
          <button type="button" className="banner-fullscreen__secondary" onClick={onDismiss}>{strings.bannerEnterMenu}</button>
        </div>
      </section>
    </div>
  )
}

function PopupOffer({ banner, brandColor, lang, onDismiss }: { banner: Banner; brandColor: string; lang: Lang; onDismiss: () => void }) {
  const strings = t(lang)
  return (
    <div className="banner-popup-overlay" onClick={onDismiss} role="dialog" aria-modal="true" aria-label={banner.title}>
      <section className="banner-popup" onClick={(e) => e.stopPropagation()}>
        <div className="banner-popup__row">
          <BannerImage banner={banner} compact />
          <OfferCopy banner={banner} lang={lang} />
          <button type="button" className="banner-popup__close" onClick={onDismiss} aria-label={strings.closeOffer}>
            <BannerIcon type="close" size={15} />
          </button>
        </div>
        <button type="button" className="banner-popup__cta" style={{ background: brandColor }} onClick={onDismiss}>{banner.cta_text || strings.bannerCtaDefault}</button>
      </section>
    </div>
  )
}

export function MenuBannerOverlays({ brandColor, lang }: { brandColor: string; lang: Lang }) {
  const { fullscreenBanner, popupBanner, dismissFullscreen, dismissPopup } = useMenuBanners()
  return (
    <>
      {fullscreenBanner && <FullscreenOffer banner={fullscreenBanner} brandColor={brandColor} lang={lang} onDismiss={dismissFullscreen} />}
      {popupBanner && <PopupOffer banner={popupBanner} brandColor={brandColor} lang={lang} onDismiss={dismissPopup} />}
    </>
  )
}
