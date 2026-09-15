import type { Metadata } from 'next'
import { Tajawal } from 'next/font/google'
import './globals.css'
import { CANONICAL_ORIGIN } from '@/lib/canonicalOrigin'

// Performance Optimization Phase 6 (SIMSIM_MENU_PERFORMANCE_AUDIT_REPORT.md
// §4/§11/§14): replaces the previous render-blocking
// <link rel="stylesheet" href="https://fonts.googleapis.com/..."> with
// next/font/google — Next fetches and self-hosts the font files at build
// time, so the customer's browser never makes a separate round-trip to
// fonts.googleapis.com/fonts.gstatic.com at all (both origins, and the
// preconnect hints for them, are removed below). `display: 'swap'` keeps
// the exact same fallback-then-swap behavior the old <link> already had
// (no FOIT either way).
//
// Weights kept at all 5 originally requested (400/500/700/800/900), NOT
// trimmed, despite the task asking to reduce weights "if safe": grepping
// every font-weight in globals.css + inline styles found 500/700/800/900
// explicitly used, PLUS 600 (which was never even in the original 5 — a
// pre-existing gap, left alone, out of scope) — and no explicit use of 400,
// but 400 is the browser's own default for any text node that never sets a
// weight at all, which is real, common, and not safely greppable (can't
// prove a negative that some Arabic paragraph somewhere never renders at
// default weight). Removing it risked a real, hard-to-fully-verify visual
// regression for a secondary metric (a few extra KB / one more variable-
// font-axis point), so per the task's own tie-breaker rule ("اختر الأقل
// خطورة"), this dimension of the optimization was skipped — documented
// here rather than guessed at.
const tajawal = Tajawal({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '700', '800', '900'],
  display: 'swap',
  variable: '--font-tajawal',
})

// Default document language/direction — Arabic-first, matching the current
// production menu's default. The English variant (?lang=en) applies its own
// dir="ltr" wrapper at the page level rather than on <html>, since Next.js
// layouts don't receive searchParams (by design, for shared route caching).
//
// metadataBase — SIMSIM_CANONICAL_ORIGIN_UNIFICATION_EXECUTION_REPORT.md:
// resolves every relative `alternates.canonical`/`openGraph.url` set by any
// page in this app against simsimmenu.com, never the host a given request
// actually arrived on (which the CUSTOMER_SESSION_AND_REPEAT_OTP.md /
// HOST_RUNTIME_PATH_READONLY_INVESTIGATION_REPORT.md work already showed is
// not reliably simsimmenu.com itself for proxied traffic). This is metadata
// only — it has no effect on cookies, routing, or the proxy.
export const metadata: Metadata = {
  metadataBase: new URL(CANONICAL_ORIGIN),
  title: 'SimSim Menu (Next.js POC)',
  description: 'Phase 2 read-only proof-of-concept — not the production menu.',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={tajawal.className}>
      <body>{children}</body>
    </html>
  )
}
