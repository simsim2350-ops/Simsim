import Image from 'next/image'
import Link from 'next/link'
import type { MarketingSiteSettings } from '@/lib/marketing-types'
import { appUrl } from '@/lib/urls'
import { MobileNavDrawer } from './MobileNavDrawer'

export function MarketingHeader({ settings }: { settings: MarketingSiteSettings }) {
  return <header className="site-header"><div className="container nav-wrap">
    <Link href="/" className="brand" aria-label={`${settings.brandName} — الصفحة الرئيسية`}><Image src={settings.logoPath} width={36} height={36} alt="" priority /><span>{settings.brandName}</span></Link>
    <nav className="nav-desktop" aria-label="التنقل الرئيسي">{settings.navigation.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}</nav>
    <div className="nav-actions"><a href={appUrl(settings.secondaryCta.href)} className="text-link" data-track-id={settings.secondaryCta.trackingId}>{settings.secondaryCta.label}</a><a href={appUrl(settings.primaryCta.href)} className="button button-primary small" data-track-id={settings.primaryCta.trackingId}>{settings.primaryCta.label}</a></div>
    <MobileNavDrawer brandName={settings.brandName} logoPath={settings.logoPath} navigation={settings.navigation} secondaryCta={settings.secondaryCta} primaryCta={settings.primaryCta} />
  </div></header>
}

export function MarketingFooter({ settings }: { settings: MarketingSiteSettings }) {
  return <footer className="site-footer"><div className="container footer-grid"><div><div className="brand footer-brand"><Image src={settings.logoPath} width={32} height={32} alt="" /><span>{settings.brandName}</span></div><p>{settings.footer.description}</p></div><div><h2>استكشف</h2>{settings.footer.navigation.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}</div><div><h2>الحساب</h2><a href={appUrl('/login')}>تسجيل الدخول</a><a href={appUrl('/register')}>إنشاء حساب</a><a href="#pricing">الباقات</a></div><div><h2>قانوني</h2>{settings.footer.legal.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}</div></div><div className="container footer-bottom">{settings.footer.copyright}</div></footer>
}
