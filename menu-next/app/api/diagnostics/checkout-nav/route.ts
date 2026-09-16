// ============================================================
// Route Handler: POST /api/diagnostics/checkout-nav
// ============================================================
// Receiving end for lib/checkoutNavDiagnostics.ts — see that file's own
// header comment for the full rationale. This handler does exactly one
// thing: validate the payload against a strict field allow-list, drop
// anything not on it, and console.log the result so it reaches Vercel's
// existing Runtime Logs (correlatable there with everything else, per the
// diagnostic's whole purpose — no new log destination, no database, no
// external service).
//
// The allow-list below is the actual privacy boundary, not an afterthought:
// only route/timing metadata is ever accepted. No phone numbers, names,
// addresses, payment data, tokens, cookies, or cart contents are read from
// the request anywhere in this file — and none of the client module's own
// call sites ever send any (see checkoutNavDiagnostics.ts), so this is a
// belt-and-suspenders check against a future call site doing so by mistake,
// not merely trusting the client to behave.
// ============================================================

import { NextResponse } from 'next/server'

const ALLOWED_EVENTS = new Set([
  'checkout_navigation_started',
  'checkout_navigation_completed',
  'checkout_navigation_slow',
  'checkout_navigation_timeout',
])

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const event = typeof body.event === 'string' ? body.event : null
  if (!event || !ALLOWED_EVENTS.has(event)) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  // Explicit allow-list — every field that can ever be logged, and nothing
  // else, ever, regardless of what else the request body might contain.
  const safe = {
    event,
    correlationId: typeof body.correlationId === 'string' ? body.correlationId.slice(0, 32) : null,
    target: typeof body.target === 'string' ? body.target.slice(0, 200) : undefined,
    targetParamNames: Array.isArray(body.targetParamNames)
      ? body.targetParamNames.filter((p): p is string => typeof p === 'string').slice(0, 10)
      : undefined,
    navigationMethod: typeof body.navigationMethod === 'string' ? body.navigationMethod.slice(0, 32) : undefined,
    prefetch: typeof body.prefetch === 'boolean' ? body.prefetch : undefined,
    durationMs: typeof body.durationMs === 'number' && Number.isFinite(body.durationMs) ? Math.round(body.durationMs) : undefined,
    elapsedMs: typeof body.elapsedMs === 'number' && Number.isFinite(body.elapsedMs) ? Math.round(body.elapsedMs) : undefined,
    pathname: typeof body.pathname === 'string' ? body.pathname.slice(0, 200) : undefined,
    stillOnLoadingBoundary: typeof body.stillOnLoadingBoundary === 'boolean' ? body.stillOnLoadingBoundary : undefined,
    ts: typeof body.ts === 'string' ? body.ts.slice(0, 40) : new Date().toISOString(),
  }

  // eslint-disable-next-line no-console
  console.log(`[checkout-nav-diagnostics] ${JSON.stringify(safe)}`)

  return NextResponse.json({ ok: true })
}
