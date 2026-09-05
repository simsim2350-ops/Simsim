import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The repo root has its own lockfile (the Vite Main app) and so does marketing-ssr —
  // pin this app's root explicitly so Next.js doesn't misdetect the workspace root.
  turbopack: {
    root: __dirname,
  },
  // simsimmenu.com (the main Vite app's domain) proxies /menu/:slug* to this
  // deployment via an absolute-URL rewrite in the root vercel.json, so the
  // browser's address bar stays on simsimmenu.com. That domain already
  // reserves /_next/* for a different proxied app (marketing-ssr) — an
  // absolute assetPrefix makes this app's own JS/CSS always load directly
  // from its own real domain instead, avoiding any collision, with zero
  // difference in behavior whether this deployment is reached directly or
  // through the simsimmenu.com proxy (same-origin either way in practice).
  assetPrefix: 'https://simsim-menu-next.vercel.app',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
  },
  poweredByHeader: false,
}

export default nextConfig
