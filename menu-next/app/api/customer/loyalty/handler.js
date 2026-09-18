/**
 * app/api/customer/loyalty/handler.js — Phase 6 Migration 4 (RPC-002 closure)
 *
 * GET ?restaurant_id=<uuid> → reads the EXISTING, UNMODIFIED
 * simsim_customer_session cookie (Phase 3B), validates it via the EXISTING,
 * UNMODIFIED validate_customer_session RPC (Phase 3A), and only if valid
 * calls the EXISTING, UNMODIFIED get_customer_loyalty RPC with the phone
 * taken *exclusively* from that validated session. Same orchestration-only
 * role and trust-boundary discipline as checkout/handler.js and
 * verify-otp/handler.js.
 *
 * TRUST BOUNDARY: no phone is ever accepted from the request (no body, no
 * query param) — the only source of truth for "whose loyalty is this" is the
 * RETURN VALUE of validate_customer_session for a call this handler made
 * itself, server-side, using the cookie the browser sent.
 *
 * Missing cookie, malformed token, expired session, and revoked session all
 * produce the IDENTICAL outcome — { loyalty: null }, HTTP 200 — no
 * distinguishing information, same anti-enumeration discipline
 * verify_phone_otp/validate_customer_session themselves already use. This is
 * a best-effort UI widget, not a hard auth gate: a customer without a valid
 * session simply doesn't see a loyalty card, the page never breaks.
 *
 * Dependencies injected via buildLoyaltyHandler({ db }) — same pattern as
 * checkout/handler.js and verify-otp/handler.js — testable with Vitest, no
 * real Supabase project or Next.js runtime needed.
 *
 * RATE LIMITING (Phase 6 Migration 4.1): an independent IP-hash + sliding-
 * window gate (check_and_log_loyalty_rate, its own table
 * loyalty_lookup_rate_log — NOT otp_ip_request_log, which is OTP-specific
 * and must not be shared) runs FIRST, before any session lookup, so abusive
 * traffic never reaches — or costs — session validation. Rate limiting is
 * NOT authorization: it runs in addition to, never instead of, the session
 * checks below. A rate-limited caller gets HTTP 429 with no loyalty data,
 * no customer-existence signal, no phone, no session-internals — same
 * "reveal nothing beyond the one bit needed" discipline as the rest of this
 * boundary.
 */

import { extractSourceIp, hashIp } from './ipHash.js'

const RATE_LIMIT_MAX_REQUESTS = 30
const RATE_LIMIT_WINDOW_MINUTES = 5

export function buildLoyaltyHandler({ db }) {
  return async function handleLoyalty(req) {
    const requestId = crypto.randomUUID()

    if (req.method !== 'GET') {
      return json({ error: 'method_not_allowed' }, 405)
    }

    let restaurantId
    try {
      const url = new URL(req.url)
      restaurantId = url.searchParams.get('restaurant_id')
    } catch {
      return json({ error: 'invalid_request' }, 400)
    }
    if (typeof restaurantId !== 'string' || restaurantId.length === 0) {
      return json({ error: 'invalid_request' }, 400)
    }

    if (!db) {
      console.error(`[loyalty:${requestId}] service_role not configured`)
      return json({ error: 'internal_error' }, 500)
    }

    // Step 0 — rate limit, before session validation (same ordering
    // rationale as send-phone-otp/handler.js's own IP check).
    const sourceIp = extractSourceIp(req)
    const ipHash = await hashIp(sourceIp)
    let rateAllowed
    try {
      const { data, error } = await db.rpc('check_and_log_loyalty_rate', {
        p_ip_hash: ipHash,
        p_max_requests: RATE_LIMIT_MAX_REQUESTS,
        p_window_minutes: RATE_LIMIT_WINDOW_MINUTES,
      })
      if (error) {
        console.error(`[loyalty:${requestId}] rate_check_rpc_error: ${sanitize(error.message)}`)
        return json({ error: 'internal_error' }, 500)
      }
      rateAllowed = data
    } catch (err) {
      console.error(`[loyalty:${requestId}] rate_check_exception: ${sanitize(err?.message)}`)
      return json({ error: 'internal_error' }, 500)
    }
    if (!rateAllowed) {
      console.warn(`[loyalty:${requestId}] rate_limited: ipHashPrefix=${ipHash.slice(0, 8)}`)
      return json({ error: 'rate_limited' }, 429)
    }

    // Step 1 — the session cookie is the ONLY source of identity. Parsed from
    // the raw Cookie header (not next/headers) so this file stays
    // framework-agnostic and unit-testable, matching checkout/verify-otp.
    const token = readSessionCookie(req.headers.get('cookie'))
    if (!token) {
      return json({ loyalty: null }, 200)
    }

    let sessionResult
    try {
      const { data, error } = await db.rpc('validate_customer_session', { p_token: token })
      if (error) {
        console.error(`[loyalty:${requestId}] session_validate_rpc_error: ${sanitize(error.message)}`)
        return json({ error: 'internal_error' }, 500)
      }
      sessionResult = data
    } catch (err) {
      console.error(`[loyalty:${requestId}] session_validate_exception: ${sanitize(err?.message)}`)
      return json({ error: 'internal_error' }, 500)
    }

    if (!sessionResult?.valid) {
      // Generic — identical shape whether missing, malformed, expired, or
      // revoked. No loyalty data is ever computed in this branch.
      return json({ loyalty: null }, 200)
    }

    const verifiedPhone = sessionResult.phone
    if (typeof verifiedPhone !== 'string' || verifiedPhone.length === 0) {
      // customer_sessions has an ON DELETE CASCADE FK to customer_identities
      // — a valid session pointing at a deleted/phoneless identity should
      // not be reachable, but fail closed rather than assuming that holds.
      console.error(`[loyalty:${requestId}] session_valid_but_no_phone`)
      return json({ loyalty: null }, 200)
    }

    // Step 2 — the EXISTING, UNMODIFIED loyalty lookup, called with the
    // session's own verified phone ONLY. No client-supplied phone exists
    // anywhere in this request shape for it to be confused with.
    let result
    try {
      result = await db.rpc('get_customer_loyalty', { rest_id: restaurantId, phone: verifiedPhone })
    } catch (err) {
      console.error(`[loyalty:${requestId}] get_customer_loyalty_exception: ${sanitize(err?.message)}`)
      return json({ error: 'internal_error' }, 500)
    }

    const { data, error } = result
    if (error) {
      console.error(`[loyalty:${requestId}] get_customer_loyalty_rpc_error: ${sanitize(error.message)}`)
      return json({ error: 'internal_error' }, 500)
    }

    const row = Array.isArray(data) ? data[0] : data
    return json({ loyalty: row && row.enabled ? row : null }, 200)
  }
}

// ——————————— cookie parsing (identical to checkout/handler.js) ———————————

const SESSION_COOKIE_NAME = 'simsim_customer_session'

function readSessionCookie(cookieHeader) {
  if (typeof cookieHeader !== 'string' || cookieHeader.length === 0) return null
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const name = part.slice(0, eq).trim()
    if (name === SESSION_COOKIE_NAME) {
      const value = part.slice(eq + 1).trim()
      return value.length > 0 ? value : null
    }
  }
  return null
}

// ——————————— safe logging + generic helpers ———————————

function sanitize(msg) {
  const s = typeof msg === 'string' ? msg : 'unknown_error'
  return s.slice(0, 200)
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
