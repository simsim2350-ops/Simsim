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
    res.headers.append('Set-Cookie', buildSessionCookie(token))
    // `token` is not referenced again after this line — nothing below (there
    // is nothing below) can log or return it.
    return res
  }
}

// ——————————— cookie construction ———————————

/**
 * HttpOnly, Secure, SameSite=Lax, Path=/, Max-Age=2592000 (30 days) — exactly
 * the attribute set specified for Phase 3B. No Domain attribute (host-only
 * cookie, the more conservative default) — not requested, not added.
 */
function buildSessionCookie(token) {
  return [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; ')
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
