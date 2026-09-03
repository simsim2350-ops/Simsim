import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The repo root has its own lockfile (the Vite Main app) and so does marketing-ssr —
  // pin this app's root explicitly so Next.js doesn't misdetect the workspace root.
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
  },
  poweredByHeader: false,
}

export default nextConfig
