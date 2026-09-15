// ============================================================
// Route Handler: POST /api/revalidate — Performance Optimization, Phase 2
// ============================================================
// Explicit cache invalidation for the menu-data caching introduced in
// lib/data.ts (see SIMSIM_MENU_PERFORMANCE_AUDIT_REPORT.md §10/§14 and
// SIMSIM_MENU_PERFORMANCE_OPTIMIZATION_EXECUTION_REPORT.md §5). Called by
// the Dashboard app (a separate Vite SPA, no backend of its own) directly
// after a successful save to restaurant/branch/category/product/branding/
// banner/coupon data — see src/lib/menuCacheInvalidation.js in the root repo
// for every call site.
//
// Required env var (server-only, NOT NEXT_PUBLIC_-prefixed — never shipped
// to any browser bundle): REVALIDATE_SECRET
// Status as of this implementation: NOT confirmed configured on Vercel for
// this project — this endpoint fails closed (401) with no fallback if it's
// unset, exactly like verify-otp/route.ts's SUPABASE_SERVICE_ROLE_KEY
// precedent above it in this same app. Until it's configured (in BOTH this
// project's and the Dashboard project's Vercel environment variables, using
// the SAME value — see the execution report's Cache Strategy section for
// the exact variable names on each side), cache freshness falls back to the
// 300s TTL safety net already built into every cached function in
// lib/data.ts — menu edits still show up, just within 5 minutes instead of
// instantly.
//
// Security note (documented honestly, not glossed over): because the
// Dashboard is a pure browser SPA with no server of its own, the token it
// sends here is necessarily bundled into its own public JS (a Vite
// `VITE_`-prefixed env var) — it is a best-effort anti-abuse token, not a
// true secret. Worst case if it leaks: someone can force extra cache
// misses (real reads, real Supabase load) for a restaurant they know the
// id of — not a data-exposure or data-integrity risk, since this endpoint
// only ever calls revalidateTag, never reads or writes any row.
// ============================================================

import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'

// Called cross-origin, directly from the Dashboard's own browser bundle (a
// pure SPA with no backend of its own — see the security note above), so
// the browser sends a CORS preflight (OPTIONS) before the real POST because
// of the custom x-revalidate-secret header. Reflects the request's Origin
// only when it's in this small, explicit allowlist — the production
// dashboard domain plus its local Vite dev server — rather than a wildcard,
// even though the token itself isn't a true secret (see above): no reason
// to let an arbitrary third-party site issue these requests from a
// signed-in owner's browser session.
const ALLOWED_ORIGINS = new Set(['https://simsimmenu.com', 'http://localhost:5173'])

function corsHeaders(origin: string | null): HeadersInit {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-revalidate-secret',
  }
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function POST(req: Request) {
  const headers = corsHeaders(req.headers.get('origin'))
  const secret = process.env.REVALIDATE_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'REVALIDATE_SECRET not configured' }, { status: 401, headers })
  }
  if (req.headers.get('x-revalidate-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers })
  }

  let body: { restaurantId?: string; slug?: string; branchId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400, headers })
  }

  const { restaurantId, slug, branchId } = body
  if (!restaurantId || typeof restaurantId !== 'string') {
    return NextResponse.json({ error: 'restaurantId is required' }, { status: 400, headers })
  }

  const tags = [`menu-data:${restaurantId}`]
  if (slug) tags.push(`menu-slug:${slug}`)
  if (branchId) tags.push(`menu-branch:${branchId}`)

  // This Next.js version (16) deprecates the single-argument revalidateTag(tag)
  // form (confirmed against this exact install's own docs:
  // node_modules/next/dist/docs/.../revalidateTag.md — a real API change
  // from earlier Next.js versions, per menu-next/AGENTS.md's own warning).
  // { expire: 0 } is the documented choice specifically for "invalidation
  // from outside a Server Action, e.g. a webhook or another service calling
  // a Route Handler" — exactly this endpoint's situation — and it expires
  // the data immediately rather than serving stale-while-revalidate content,
  // which is the correct behavior here: the whole point of this endpoint is
  // that the customer's next refresh shows the admin's edit right away, not
  // a possibly-stale cached copy while a background revalidation runs.
  for (const tag of tags) {
    revalidateTag(tag, { expire: 0 })
  }

  return NextResponse.json({ revalidated: true, tags }, { headers })
}
