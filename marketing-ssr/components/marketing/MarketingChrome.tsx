import Image from 'next/image'
import Link from 'next/link'
import type { MarketingSiteSettings } from '@/lib/marketing-types'
import { appUrl } from '@/lib/urls'
import { SiteNav } from './SiteNav'

export function MarketingHeader({ settings }: { settings: MarketingSiteSettings }) {
  return <SiteNav settings={settings} />
}

// منقول من src/components/landing/Footer.jsx بالموقع القديم — بما فيه صف أيقونات التواصل
// (روابط عامة #hero كما بالأصل، إذ لا تتوفر روابط تواصل اجتماعي فعلية في CMS حالياً).
export function MarketingFooter({ settings }: { settings: MarketingSiteSettings }) {
  const year = new Date().getFullYear()
  return (
    <footer className="ss-footer">
      <div className="ss-container">
        <div className="ss-footer__top">
          <div className="ss-footer__brand">
            <div className="ss-logo">
              <span className="ss-logo__mark"><Image src={settings.logoPath} width={24} height={34} alt="" style={{ width: 'auto', height: 34 }} /></span>
              <span className="ss-logo__text">{settings.brandName}</span>
            </div>
            <p className="ss-footer__desc">{settings.footer.description}</p>
            <div className="ss-footer__social" aria-label="روابط التواصل">
              <a href="#hero" aria-label="X / تويتر">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2H22l-7.5 8.6L23 22h-6.8l-5.3-6.9L4.8 22H1.7l8-9.2L1 2h6.9l4.8 6.3zM17.7 20.1h1.7L7 3.8H5.2z" /></svg>
              </a>
              <a href="#hero" aria-label="إنستغرام">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>
              </a>
              <a href="#hero" aria-label="واتساب">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.5A10 10 0 1 0 12 2zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-2.9.9.9-2.8-.2-.3A8 8 0 1 1 12 20zm4.4-5.6c-.2-.1-1.4-.7-1.6-.8s-.4-.1-.5.1-.6.8-.8 1-.3.2-.5.1a6.5 6.5 0 0 1-1.9-1.2 7.3 7.3 0 0 1-1.3-1.7c-.1-.2 0-.4.1-.5l.4-.4.2-.4v-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.6 4c.6.3 1.1.4 1.5.6a3.6 3.6 0 0 0 1.6.1c.5-.1 1.4-.6 1.6-1.1a2 2 0 0 0 .1-1.1c-.1-.1-.2-.2-.5-.3z" /></svg>
              </a>
            </div>
          </div>

          <div className="ss-footer__col">
            <h4>الموقع</h4>
            {settings.footer.navigation.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
          </div>

          <div className="ss-footer__col">
            <h4>الحساب</h4>
            <a href={appUrl('/login')}>تسجيل الدخول</a>
            <a href={appUrl('/register')}>إنشاء حساب</a>
            <a href="#pricing">الباقات</a>
          </div>
        </div>

        <div className="ss-footer__bottom">
          <span>{settings.footer.copyright || `© ${year} SIMSIM — جميع الحقوق محفوظة`}</span>
          <span className="ss-footer__legal">
            {settings.footer.legal.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
          </span>
        </div>
      </div>
    </footer>
  )
}
