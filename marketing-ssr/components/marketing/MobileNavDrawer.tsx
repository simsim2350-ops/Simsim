'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import Link from 'next/link'
import type { MarketingCta, MarketingNavItem } from '@/lib/marketing-types'
import { appUrl } from '@/lib/urls'

// نسخة "درج جانبي" من قائمة التنقل للجوال — بديل لقائمة <details> المنسدلة السابقة، بنفس سلوك
// القائمة الجانبية بالموقع القديم (src/components/landing/Navbar.jsx): طبقة تعتيم + قفل تمرير
// الصفحة أثناء الفتح + إغلاق تلقائي عند الضغط على أي رابط. التصميم البصري جديد بالكامل ليطابق
// نظام التصميم الحالي، وليس نسخاً من CSS الموقع القديم.
//
// الطبقة والدرج يُعرَضان عبر Portal إلى document.body بدل البقاء أبناءً لـ<header> — لأن
// .site-header يستخدم backdrop-filter، وهذا يُنشئ Containing Block جديداً لأي عنصر position:fixed
// بداخله (نفس سلوك transform/filter في مواصفات CSS)، فكانت الطبقة والدرج يُحسبان نسبة لصندوق
// الهيدر الصغير (~76px) بدل الشاشة كاملة — هذا ما سبّب المشكلة المُبلَّغ عنها (لوحة فارغة لا تغطي
// الصفحة). الزر فقط يبقى داخل الهيدر؛ لا تغيير على MarketingHeader نفسه ولا حدوده Server/Client.
export function MobileNavDrawer({ brandName, logoPath, navigation, secondaryCta, primaryCta }: {
  brandName: string
  logoPath: string
  navigation: MarketingNavItem[]
  secondaryCta: MarketingCta
  primaryCta: MarketingCta
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const close = () => setOpen(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const panel = (
    <>
      <div className={`mobile-nav-overlay${open ? ' is-open' : ''}`} onClick={close} aria-hidden="true" />
      <aside className={`mobile-nav-drawer${open ? ' is-open' : ''}`} aria-hidden={!open}>
        <div className="mobile-nav-drawer-head">
          <Link href="/" className="brand" onClick={close}><Image src={logoPath} width={30} height={30} alt="" /><span>{brandName}</span></Link>
          <button type="button" className="mobile-nav-close" aria-label="إغلاق القائمة" onClick={close}>✕</button>
        </div>
        <nav aria-label="التنقل الرئيسي (جوال)">{navigation.map((item) => <a key={item.href} href={item.href} onClick={close}>{item.label}</a>)}</nav>
        <div className="mobile-nav-actions">
          <a href={appUrl(secondaryCta.href)} className="button button-secondary" data-track-id={secondaryCta.trackingId} onClick={close}>{secondaryCta.label}</a>
          <a href={appUrl(primaryCta.href)} className="button button-primary" data-track-id={primaryCta.trackingId} onClick={close}>{primaryCta.label}</a>
        </div>
      </aside>
    </>
  )

  return (
    <div className="mobile-nav">
      <button type="button" className="mobile-nav-toggle" aria-label="فتح قائمة التنقل" aria-expanded={open} onClick={() => setOpen(true)}>
        <span className="mobile-nav-icon" aria-hidden="true" />
      </button>
      {mounted && createPortal(panel, document.body)}
    </div>
  )
}
