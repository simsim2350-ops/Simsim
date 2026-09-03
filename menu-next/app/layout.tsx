import type { Metadata } from 'next'
import './globals.css'

// Default document language/direction — Arabic-first, matching the current
// production menu's default. The English variant (?lang=en) applies its own
// dir="ltr" wrapper at the page level rather than on <html>, since Next.js
// layouts don't receive searchParams (by design, for shared route caching).
export const metadata: Metadata = {
  title: 'SimSim Menu (Next.js POC)',
  description: 'Phase 2 read-only proof-of-concept — not the production menu.',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
