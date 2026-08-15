import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { NAV_LINKS } from '../../config/landingContent'

// شعار سمسم (Logo + أيقونة S) — مكوّن صغير قابل لإعادة الاستخدام.
export function Logo() {
  return (
    <a href="#hero" className="ss-logo" aria-label="سمسم — الصفحة الرئيسية">
      <span className="ss-logo__mark"><img src="/simsim-s.svg" alt="" width="24" height="34" /></span>
      <span className="ss-logo__text">sim<b>sim</b></span>
    </a>
  )
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // قفل تمرير الصفحة عند فتح القائمة الجانبية على الجوال
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <header className={`ss-nav ${scrolled ? 'ss-nav--scrolled' : ''}`}>
      <div className="ss-container ss-nav__inner">
        <Logo />

        <nav className="ss-nav__links" aria-label="روابط التنقل">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="ss-nav__link">{l.label}</a>
          ))}
        </nav>

        <div className="ss-nav__actions">
          <Link to="/login" className="ss-nav__login">تسجيل الدخول</Link>
          <Link to="/register" className="ss-btn ss-btn--primary">أنشئ منيو مجاناً</Link>
        </div>

        <button className="ss-nav__burger" aria-label="فتح القائمة" aria-expanded={open} onClick={() => setOpen(true)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </div>

      {/* Mobile drawer */}
      <div className={`ss-drawer-overlay ${open ? 'is-open' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`ss-drawer ${open ? 'is-open' : ''}`} aria-hidden={!open}>
        <div className="ss-drawer__head">
          <Logo />
          <button className="ss-drawer__close" aria-label="إغلاق القائمة" onClick={() => setOpen(false)}>✕</button>
        </div>
        <nav aria-label="روابط التنقل للجوال">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="ss-drawer__link" onClick={() => setOpen(false)}>{l.label}</a>
          ))}
        </nav>
        <div className="ss-drawer__actions">
          <Link to="/login" className="ss-btn ss-btn--ghost ss-btn--block" onClick={() => setOpen(false)}>تسجيل الدخول</Link>
          <Link to="/register" className="ss-btn ss-btn--primary ss-btn--block" onClick={() => setOpen(false)}>أنشئ منيو مجاناً</Link>
        </div>
      </aside>
    </header>
  )
}
