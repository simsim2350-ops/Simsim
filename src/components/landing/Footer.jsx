import { Link } from 'react-router-dom'
import { Logo } from './Navbar'
import { FOOTER_LINKS } from '../../config/landingContent'

export default function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="ss-footer">
      <div className="ss-container">
        <div className="ss-footer__top">
          <div className="ss-footer__brand">
            <Logo />
            <p className="ss-footer__desc">سمسم — منيو إلكتروني أسهل للمطاعم.</p>
            <div className="ss-footer__social" aria-label="روابط التواصل">
              <a href="#hero" aria-label="X / تويتر">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2H22l-7.5 8.6L23 22h-6.8l-5.3-6.9L4.8 22H1.7l8-9.2L1 2h6.9l4.8 6.3zM17.7 20.1h1.7L7 3.8H5.2z"/></svg>
              </a>
              <a href="#hero" aria-label="إنستغرام">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>
              </a>
              <a href="#hero" aria-label="واتساب">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.5A10 10 0 1 0 12 2zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-2.9.9.9-2.8-.2-.3A8 8 0 1 1 12 20zm4.4-5.6c-.2-.1-1.4-.7-1.6-.8s-.4-.1-.5.1-.6.8-.8 1-.3.2-.5.1a6.5 6.5 0 0 1-1.9-1.2 7.3 7.3 0 0 1-1.3-1.7c-.1-.2 0-.4.1-.5l.4-.4.2-.4v-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.6 4c.6.3 1.1.4 1.5.6a3.6 3.6 0 0 0 1.6.1c.5-.1 1.4-.6 1.6-1.1a2 2 0 0 0 .1-1.1c-.1-.1-.2-.2-.5-.3z"/></svg>
              </a>
            </div>
          </div>

          <div className="ss-footer__col">
            <h4>الموقع</h4>
            {FOOTER_LINKS.map((l) => (
              <a href={l.href} key={l.href}>{l.label}</a>
            ))}
          </div>

          <div className="ss-footer__col">
            <h4>الحساب</h4>
            <Link to="/login">تسجيل الدخول</Link>
            <Link to="/register">إنشاء حساب</Link>
            <a href="#pricing">الباقات</a>
          </div>
        </div>

        <div className="ss-footer__bottom">
          <span>© {year} SIMSIM — جميع الحقوق محفوظة</span>
          <span className="ss-footer__legal">
            <a href="#hero">الخصوصية</a>
            <a href="#hero">الشروط والأحكام</a>
          </span>
        </div>
      </div>
    </footer>
  )
}
