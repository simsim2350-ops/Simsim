/**
 * app/api/customer/verify-otp/handler.js — Phase 3B (Customer Session issuance)
 *
 * POST { phone, code } → calls the EXISTING, UNMODIFIED verify_phone_otp RPC
 * (Phase 1). On verified=true only, mints a session via the EXISTING,
 * UNMODIFIED create_customer_session RPC (Phase 3A) and sets it as an
 * HttpOnly cookie. Generates no new OTP logic, no new session logic — this
 * file is pure orchestration + HTTP glue.
 *
 * customer_id is NEVER accepted from the request body — it only ever comes
 * from verify_phone_otp's own return value for a call THIS handler made
 * itself, server-side, after a real successful verification. There is no
 * code path in this file that lets a caller assert "I am customer X."
 *
 * The plaintext session token exists in this function's memory for exactly
 * the few lines between receiving it from create_customer_session and
 * writing it into the Set-Cookie header — never logged, never included in
 * the JSON response body, never stored anywhere by this file (only
 * create_customer_session's own INSERT, which stores the hash, ever
 * persists anything).
 *
 * Dependencies injected via buildVerifyOtpHandler({ db }) — same pattern as
 * supabase/functions/send-phone-otp/handler.js and
 * supabase/functions/payment-first-checkout/handler.js — testable with
 * Vitest, no real Supabase project needed.
 */

const CANONICAL_PHONE = /^5[0-9]{8}$/
const OTP_CODE_SHAPE = /^[0-9]{6}$/
const MAX_BODY_BYTES = 512

export const SESSION_COOKIE_NAME = 'simsim_customer_session'
export const SESSION_MAX_AGE_SECONDS = 2592000 // 30 days — matches customer_sessions' own expires_at policy (Phase 3A)

/**
 * @param {{ db: object | null }} deps db is null when service_role isn't configured — handled explicitly (fail closed), never a thrown type error.
 * @returns {(req: Request) => Promise<Response>}
 */
export function buildVerifyOtpHandler({ db }) {
  return async function handleVerifyOtp(req) {
    const requestId = crypto.randomUUID()

    if (req.method !== 'POST') {
      return json({ error: 'method_not_allowed' }, 405)
    }

    let rawBody
    try {
      rawBody = await req.text()
    } catch {
      return json({ error: 'invalid_request' }, 400)
    }
    if (byteLength(rawBody) > MAX_BODY_BYTES) {
      return json({ error: 'invalid_request' }, 400)
    }

    let body
    try {
      body = JSON.parse(rawBody)
    } catch {
      return json({ error: 'invalid_request' }, 400)
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json({ error: 'invalid_request' }, 400)
    }

    const { phone, code } = body
    if (typeof phone !== 'string' || !CANONICAL_PHONE.test(phone)) {
      return json({ error: 'invalid_phone' }, 400)
    }
    if (typeof code !== 'string' || !OTP_CODE_SHAPE.test(code)) {
      return json({ error: 'invalid_code' }, 400)
    }

    if (!db) {
      console.error(`[verify-otp:${requestId}] service_role not configured`)
      return json({ error: 'internal_error' }, 500)
    }

    // Step 1 — the EXISTING, UNMODIFIED verification authority (Phase 1).
    let verifyResult
    try {
      const { data, error } = await db.rpc('verify_phone_otp', { p_phone: phone, p_code: code })
      if (error) {
        console.error(`[verify-otp:${requestId}] verify_rpc_error: ${sanitize(error.message)} maskedPhone=${maskPhone(phone)}`)
        return json({ error: 'internal_error' }, 500)
      }
      verifyResult = data
    } catch (err) {
      console.error(`[verify-otp:${requestId}] verify_exception: ${sanitize(err?.message)}`)
      return json({ error: 'internal_error' }, 500)
    }

    if (!verifyResult?.verified) {
      // Generic failure — identical shape regardless of WHY (wrong code,
      // expired, attempts exhausted, phone never requested). Matches
      // verify_phone_otp's own enumeration-safe contract exactly; this
      // handler adds no new distinguishing information on top of it.
      console.warn(`[verify-otp:${requestId}] otp_not_verified maskedPhone=${maskPhone(phone)}`)
      return json({ verified: false }, 200)
    }

    const customerId = verifyResult.customer_id
    if (typeof customerId !== 'string' || customerId.length === 0) {
      console.error(`[verify-otp:${requestId}] verify_succeeded_but_no_customer_id`)
      return json({ error: 'internal_error' }, 500)
    }

    // Step 2 — the EXISTING, UNMODIFIED session-issuance RPC (Phase 3A).
    let sessionResult
    try {
      const { data, error } = await db.rpc('create_customer_session', { p_customer_id: customerId })
      if (error) {
        console.error(`[verify-otp:${requestId}] session_rpc_error: ${sanitize(error.message)}`)
        return json({ error: 'internal_error' }, 500)
      }
      sessionResult = data
    } catch (err) {
      console.error(`[verify-otp:${requestId}] session_exception: ${sanitize(err?.message)}`)
      return json({ error: 'internal_error' }, 500)
    }

    const token = sessionResult?.token
    if (typeof token !== 'string' || token.length === 0) {
      // Never log `sessionResult` itself — it is exactly the object carrying the token.
      console.error(`[verify-otp:${requestId}] session_created_but_no_token`)
      return json({ error: 'internal_error' }, 500)
    }

    console.log(`[verify-otp:${requestId}] session_issued maskedPhone=${maskPhone(phone)}`)

    const res = json({ verified: true }, 200)
    res.headers.append('Set-Cookie', buildSessionCookie(token, resolveClientHost(req)))
    // `token` is not referenced again after this line — nothing below (there
    // is nothing below) can log or return it.
    return res
  }
}

// ——————————— cookie construction ———————————

// The one production, customer-facing registrable domain (see
// menuNextBaseUrl in src/config/index.js — every QR/table/menu link
// generated anywhere in this project already points here, never at the raw
// Vercel deployment host). Confirmed live: both simsimmenu.com and
// www.simsimmenu.com serve this exact app (same content, no redirect
// between them) via the root vercel.json's absolute-URL proxy rule. That is
// the actual, confirmed cause of CUSTOMER_SESSION_REPEAT_OTP_DIAGNOSTIC_REPORT.md's
// finding: a session cookie set while on one of these two hosts was never
// sent back on a later visit that happened to land on the other one.
const CANONICAL_APEX_DOMAIN = 'simsimmenu.com'

/**
 * The host the BROWSER actually connected to, not necessarily the one this
 * server-side handler is running on. The root vercel.json's absolute-URL
 * proxy rule (`/menu/(.+) -> https://simsim-menu-next.vercel.app/menu/$1`)
 * makes this a reverse proxy from the browser's point of view: Vercel's edge
 * forwards the original client-facing host in `x-forwarded-host`, while the
 * plain `Host` header seen here would otherwise reflect the proxy's own
 * upstream destination. Falls back to `Host` for any request that reaches
 * this handler directly (no proxy involved) — e.g. a Vercel preview
 * deployment, localhost, or the raw simsim-menu-next.vercel.app host itself.
 */
function resolveClientHost(req) {
  const forwarded = req.headers.get('x-forwarded-host')
  const raw = (forwarded || req.headers.get('host') || '').trim()
  // A forwarded value can legally be a comma-separated list (multiple
  // proxies) — only the first entry is the one closest to the real client.
  return raw.split(',')[0].trim().toLowerCase()
}

/**
 * HttpOnly, Secure, SameSite=Lax, Path=/, Max-Age=2592000 (30 days) — exactly
 * the attribute set specified for Phase 3B, unchanged.
 *
 * Domain attribute — the actual fix: added ONLY when the request genuinely
 * arrived under simsimmenu.com's own family (the bare apex or any of its
 * subdomains, e.g. www.simsimmenu.com) — never unconditionally. Setting
 * Domain=simsimmenu.com while the browser is actually talking to some other
 * host (localhost, a Vercel preview deployment, or simsim-menu-next.vercel.app
 * directly) is invalid per RFC 6265 (Domain must be the request's own host or
 * a parent of it) and browsers respond by SILENTLY DROPPING the entire
 * cookie — so every one of those environments must keep getting the original
 * host-only cookie, exactly as before this fix, or session persistence would
 * break there instead. Deliberately never a wider value than the exact
 * registrable domain (never ".com", never anything that isn't
 * simsimmenu.com's own family) — this only unifies the two hosts this one
 * app is actually, legitimately served from.
 */
function buildSessionCookie(token, clientHost) {
  const attrs = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ]
  if (clientHost === CANONICAL_APEX_DOMAIN || clientHost.endsWith(`.${CANONICAL_APEX_DOMAIN}`)) {
    attrs.push(`Domain=${CANONICAL_APEX_DOMAIN}`)
  }
  return attrs.join('; ')
}

// ——————————— safe logging helpers ———————————

/** 512345678 -> "5*****678" — never the full phone number in logs (same convention as send-phone-otp). */
function maskPhone(phone) {
  if (typeof phone !== 'string' || phone.length < 4) return '***'
  return `${phone.slice(0, 1)}*****${phone.slice(-3)}`
}

function sanitize(msg) {
  const s = typeof msg === 'string' ? msg : 'unknown_error'
  return s.slice(0, 200)
}

// ——————————— generic helpers ———————————

function byteLength(str) {
  return new TextEncoder().encode(str).length
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
