'use client'

// Lightweight, production-safe diagnostic instrumentation for the Checkout
// client-navigation path only — see SIMSIM_CHECKOUT_CLIENT_NAVIGATION_ROOT_CAUSE_REPORT.md
// and SIMSIM_CHECKOUT_PREFETCH_MITIGATION_EXECUTION_REPORT.md. Purpose: if the
// rare client-navigation hang recurs in real traffic, capture enough to see
// where it stopped. Not a fix, not a retry, not a workaround — this module
// never alters navigation behavior, only observes it.
//
// No new dependency, no new analytics provider — this app has none today
// (confirmed by inspection before writing this). Events are POSTed to this
// app's own /api/diagnostics/checkout-nav, which server-side console.logs
// them so they land in Vercel's existing Runtime Logs, correlatable with
// everything else already there. Sending an event never blocks or throws;
// a failure here must never affect the real navigation it's observing.
//
// Timers below are plain `setTimeout` calls made directly inside the click
// handler's call stack, NOT `useEffect`-registered — this is deliberate:
// a `useEffect`-owned timer is cleared the moment its component unmounts,
// which is exactly what happens to CartWidget once client-side navigation
// away from the menu page begins, defeating a hang-detector that needs to
// keep running through the very condition it exists to catch. A raw
// `setTimeout` is a browser-level timer with no such lifecycle tie — it
// keeps running across the SPA navigation regardless of which component
// scheduled it, for as long as the tab/JS context itself survives (a hard
// reload would of course reset everything, including `pending` below, but
// there is no pending client-side navigation to diagnose at that point
// anyway).

const SLOW_THRESHOLD_MS = 5000
const TIMEOUT_THRESHOLD_MS = 15000

type PendingNav = {
  correlationId: string
  startedAt: number
  completed: boolean
}

// Module-scoped, not component-scoped — survives the CartWidget unmount
// that client-side navigation causes, for the same reason the timers above
// need to. There is only ever one in-flight checkout navigation per tab in
// practice; identity-checked below so a second navigation starting before
// the first's timers fire can't cause a stale event.
let pending: PendingNav | null = null

function sendEvent(event: string, data: Record<string, unknown>) {
  try {
    const body = JSON.stringify({ event, ...data, ts: new Date().toISOString() })
    // navigator.sendBeacon, not fetch — this fires at the exact same instant
    // as the checkout Link's own navigation-triggering request. In local
    // testing, using `fetch` here (even with keepalive, even swallowing its
    // own rejection) measurably competed with that real navigation request
    // for this environment's limited concurrent-connection handling and
    // once pushed the real request into a client-side timeout — precisely
    // the "diagnostics breaking the thing they observe" failure mode this
    // module exists to avoid. sendBeacon is the browser-native, purpose-built
    // mechanism for exactly this case: a low-priority, fire-and-forget report
    // that is handled out-of-band from the page's other network activity and
    // is designed to survive the page being navigated away from immediately
    // after the call, with no response ever read. Falls back to a
    // best-effort fetch only if sendBeacon isn't available at all.
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' })
      navigator.sendBeacon('/api/diagnostics/checkout-nav', blob)
      return
    }
    fetch('/api/diagnostics/checkout-nav', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Diagnostics must never break the real navigation they observe.
  }
}

// Only the pathname and query PARAM NAMES are kept — never param values.
// A branch id value is already treated as safe/non-sensitive elsewhere in
// this app's telemetry conventions, but this module doesn't assume that for
// every current or future query param (a table token, in particular, must
// never be logged) — it logs which params were present, not what they held.
function safeTarget(target: string): { pathname: string; paramNames: string[] } {
  try {
    const url = new URL(target, 'https://placeholder.invalid')
    return { pathname: url.pathname, paramNames: [...url.searchParams.keys()] }
  } catch {
    return { pathname: target.split('?')[0], paramNames: [] }
  }
}

// Call from the checkout Link's onClick, before navigation starts.
export function startCheckoutNavigation(target: string) {
  const correlationId = Math.random().toString(36).slice(2, 10)
  const startedAt = Date.now()
  const nav: PendingNav = { correlationId, startedAt, completed: false }
  pending = nav
  const { pathname, paramNames } = safeTarget(target)

  sendEvent('checkout_navigation_started', {
    correlationId,
    target: pathname,
    targetParamNames: paramNames,
    navigationMethod: 'next-link',
    prefetch: false,
  })

  setTimeout(() => {
    if (nav.completed || pending !== nav) return
    sendEvent('checkout_navigation_slow', {
      correlationId: nav.correlationId,
      target: pathname,
      elapsedMs: Date.now() - nav.startedAt,
      pathname: typeof window !== 'undefined' ? window.location.pathname : null,
    })
  }, SLOW_THRESHOLD_MS)

  setTimeout(() => {
    if (nav.completed || pending !== nav) return
    sendEvent('checkout_navigation_timeout', {
      correlationId: nav.correlationId,
      target: pathname,
      elapsedMs: Date.now() - nav.startedAt,
      pathname: typeof window !== 'undefined' ? window.location.pathname : null,
      // The one visible symptom the original incident showed: stuck on the
      // shared menu-skeleton loading boundary instead of the real page.
      stillOnLoadingBoundary: typeof document !== 'undefined' ? Boolean(document.querySelector('.menu-skeleton')) : null,
    })
  }, TIMEOUT_THRESHOLD_MS)
}

// Call once the checkout page's real form has actually mounted/rendered —
// this is the application-level "navigation truly succeeded" signal, not
// any router-internal event. No-ops safely if no navigation is pending
// (e.g. a hard reload straight to the checkout URL, or a second call).
export function markCheckoutNavigationCompleted() {
  if (!pending || pending.completed) return
  const durationMs = Date.now() - pending.startedAt
  const { correlationId } = pending
  pending.completed = true
  sendEvent('checkout_navigation_completed', { correlationId, durationMs })
}
