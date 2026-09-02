'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import Link from 'next/link'
import type { MarketingSiteSettings } from '@/lib/marketing-types'
import { appUrl } from '@/lib/urls'

// منقول من src/components/landing/Navbar.jsx بالموقع القديم: هيدر ss-nav كامل (شعار + روابط
// سطح المكتب + إجراءات + زر الجوال) بحالتين client-only — ss-nav--scrolled بعد 12px تمرير،
// ودرج جانبي (ss-drawer) بمحتوى مطابق. المحتوى (navigation/CTAs) من settings الخاص بـCMS، بدل
// NAV_LINKS/PLANS الثابتة قديماً.
//
// طبقة الدرج والتعتيم تُعرَضان عبر Portal إلى .ss-landing نفسها (وليس <header>) — لأن
// .ss-nav--scrolled يستخدم backdrop-filter، وهذا يُنشئ Containing Block جديداً لأي عنصر
// position:fixed بداخله (نفس ثغرة CSS التي أُصلحت سابقاً في MobileNavDrawer)، فيُحسب الدرج نسبة
// لصندوق الهيدر بدل الشاشة كاملة. البوابة تتوقف عند .ss-landing تحديداً (لا document.body) حتى
// يبقى الدرج داخل نطاق متغيرات CSS المخصّصة (--ss-*) اللازمة لألوانه وخطوطه. تكيّف تقني ضروري،
// وليس اختلافاً تصميمياً عن الموقع القديم.
export function SiteNav({ settings }: { settings: MarketingSiteSettings }) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [portalTarget, setPortalTarget] = useState<Element | null>(null)

  // البوابة تُعرَض داخل .ss-landing (وليس document.body مباشرةً) — .ss-landing لا تملك
  // transform/filter/backdrop-filter على نفسها فلا تُنشئ Containing Block يُفسد position:fixed،
  // لكنها لا تزال تحوي متغيرات CSS المخصّصة (--ss-*) اللازمة لتنسيق الدرج (ألوان/خطوط/إعادة ضبط
  // الروابط). البوابة إلى body مباشرةً كانت تُفلت من مشكلة الهيدر لكنها تفقد هذه المتغيرات تماماً.
  useEffect(() => { setPortalTarget(document.querySelector('.ss-landing')) }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const close = () => setOpen(false)

  const drawer = (
    <>
      <div className={`ss-drawer-overlay${open ? ' is-open' : ''}`} onClick={close} aria-hidden="true" />
      <aside className={`ss-drawer${open ? ' is-open' : ''}`} aria-hidden={!open}>
        <div className="ss-drawer__head">
          <Link href="/" className="ss-logo" aria-label={`${settings.brandName} — الصفحة الرئيسية`} onClick={close}>
            <span className="ss-logo__mark"><Image src={settings.logoPath} width={24} height={34} alt="" style={{ width: 'auto', height: 34 }} /></span>
            <span className="ss-logo__text">{settings.brandName}</span>
          </Link>
          <button type="button" className="ss-drawer__close" aria-label="إغلاق القائمة" onClick={close}>✕</button>
        </div>
        <nav aria-label="روابط التنقل للجوال">
          {settings.navigation.map((item) => <a key={item.href} href={item.href} className="ss-drawer__link" onClick={close}>{item.label}</a>)}
        </nav>
        <div className="ss-drawer__actions">
          <a href={appUrl(settings.secondaryCta.href)} className="ss-btn ss-btn--ghost ss-btn--block" data-track-id={settings.secondaryCta.trackingId} onClick={close}>{settings.secondaryCta.label}</a>
          <a href={appUrl(settings.primaryCta.href)} className="ss-btn ss-btn--primary ss-btn--block" data-track-id={settings.primaryCta.trackingId} onClick={close}>{settings.primaryCta.label}</a>
        </div>
      </aside>
    </>
  )

  return (
    <header className={`ss-nav${scrolled ? ' ss-nav--scrolled' : ''}`}>
      <div className="ss-container ss-nav__inner">
        <Link href="/" className="ss-logo" aria-label={`${settings.brandName} — الصفحة الرئيسية`}>
          <span className="ss-logo__mark"><Image src={settings.logoPath} width={24} height={34} alt="" priority style={{ width: 'auto', height: 34 }} /></span>
          <span className="ss-logo__text">{settings.brandName}</span>
        </Link>

        <nav className="ss-nav__links" aria-label="روابط التنقل">
          {settings.navigation.map((item) => <a key={item.href} href={item.href} className="ss-nav__link">{item.label}</a>)}
        </nav>

        <div className="ss-nav__actions">
          <a href={appUrl(settings.secondaryCta.href)} className="ss-nav__login" data-track-id={settings.secondaryCta.trackingId}>{settings.secondaryCta.label}</a>
          <a href={appUrl(settings.primaryCta.href)} className="ss-btn ss-btn--primary" data-track-id={settings.primaryCta.trackingId}>{settings.primaryCta.label}</a>
        </div>

        <button type="button" className="ss-nav__burger" aria-label="فتح القائمة" aria-expanded={open} onClick={() => setOpen(true)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </div>
      {portalTarget && createPortal(drawer, portalTarget)}
    </header>
  )
}
