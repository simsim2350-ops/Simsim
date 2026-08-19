import type { Metadata } from 'next'
import './styles.css'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.MARKETING_SITE_URL || 'https://marketing.simsimmenu.com'),
  title: { default: 'سمسم | منيو إلكتروني احترافي لمطعمك', template: '%s | سمسم' },
  description: 'منيو إلكتروني للمطاعم والمقاهي مع QR Code والطلبات والولاء.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl"><body>{children}</body></html>
}
