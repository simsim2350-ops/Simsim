import type { Metadata, Viewport } from 'next'
import '../styles.css'
import { marketingSiteUrl } from '@/lib/site-url'

export const metadata: Metadata = {
  metadataBase: new URL(marketingSiteUrl()),
  title: { default: 'سمسم | منيو إلكتروني احترافي لمطعمك', template: '%s | سمسم' },
  description: 'منيو إلكتروني للمطاعم والمقاهي مع QR Code والطلبات والولاء.',
}

// Matches the existing --orange brand variable in app/styles.css.
export const viewport: Viewport = { themeColor: '#FF6A00' }

export default function ArabicRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl"><body>{children}</body></html>
}
