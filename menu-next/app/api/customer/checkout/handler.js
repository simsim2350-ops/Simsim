/**
 * app/api/customer/checkout/handler.js — Phase 3C.2 (server-side order boundary)
 *
 * POST { ...same fields CheckoutForm.tsx already sends to create_order /
 * create_order_from_table_qr today } → reads the EXISTING, UNMODIFIED
 * simsim_customer_session cookie (Phase 3B), validates it via the EXISTING,
 * UNMODIFIED validate_customer_session RPC (Phase 3A), and only if valid
 * calls the EXISTING, UNMODIFIED create_order / create_order_from_table_qr
 * (Phase 1 / Phase 3C.1's additive p_customer_id parameter) with the
 * customer_id taken *exclusively* from that validated session.
 *
 * This file does not implement any new order-creation logic, session logic,
 * or validation logic — it is pure orchestration + HTTP glue, same role as
 * verify-otp/handler.js plays for OTP verification.
 *
 * TRUST BOUNDARY (the entire point of this file): customer_id is NEVER read
 * from the request body. If the body contains a `customer_id` or
 * `p_customer_id` field, it is silently ignored — never logged, never
 * forwarded, never compared against anything. The only source of truth for
 * "which customer is this" is the RETURN VALUE of validate_customer_session
 * for a call this handler made itself, server-side, using the cookie the
 * browser sent — there is no code path here that lets a caller assert "I am
 * customer X." (Same discipline verify-otp/handler.js already applies to
 * "I am already verified.")
 *
 * No session is ever optional here: this endpoint's only reason to exist is
 * to be the authenticated path. Missing/invalid/expired/revoked session all
 * produce the identical generic 401 — no distinguishing information, same
 * anti-enumeration discipline as verify_phone_otp/validate_customer_session
 * themselves.
 *
 * Dependencies injected via buildCheckoutHandler({ db }) — same pattern as
 * verify-otp/handler.js — testable with Vitest, no real Supabase project or
 * Next.js runtime needed.
 */

const SESSION_COOKIE_NAME = 'simsim_customer_session'
const MAX_BODY_BYTES = 20000 // items array can be larger than verify-otp's tiny phone+code body

export function buildCheckoutHandler({ db }) {
  return async function handleCheckout(req) {
    const requestId = crypto.randomUUID()

    if (req.method !== 'POST') {
      return json({ error: 'method_not_allowed' }, 405)
    }

    // Step 1 — the session cookie is the ONLY source of customer_id. Parsed
    // from the raw Cookie header (not next/headers) so this file stays
    // framework-agnostic and unit-testable, matching verify-otp's own style.
    const token = readSessionCookie(req.headers.get('cookie'))
    if (!token) {
      return json({ error: 'unauthorized' }, 401)
    }

    if (!db) {
      console.error(`[checkout:${requestId}] service_role not configured`)
      return json({ error: 'internal_error' }, 500)
    }

    let sessionResult
    try {
      const { data, error } = await db.rpc('validate_customer_session', { p_token: token })
      if (error) {
        console.error(`[checkout:${requestId}] session_validate_rpc_error: ${sanitize(error.message)}`)
        return json({ error: 'internal_error' }, 500)
      }
      sessionResult = data
    } catch (err) {
      console.error(`[checkout:${requestId}] session_validate_exception: ${sanitize(err?.message)}`)
      return json({ error: 'internal_error' }, 500)
    }

    if (!sessionResult?.valid) {
      // Generic — identical shape whether the cookie was missing (handled
      // above), malformed, expired, or revoked. No order is created.
      return json({ error: 'unauthorized' }, 401)
    }

    const customerId = sessionResult.customer_id
    if (typeof customerId !== 'string' || customerId.length === 0) {
      console.error(`[checkout:${requestId}] session_valid_but_no_customer_id`)
      return json({ error: 'internal_error' }, 500)
    }

    // Step 2 — parse and shape-check the body. Business validation (does the
    // restaurant/branch/product exist, is the phone canonical, is the coupon
    // valid, ...) is NOT duplicated here — that authority stays exactly
    // where it already lives, inside create_order / create_order_from_table_qr,
    // unchanged. This handler only checks that fields are the right *shape*
    // to forward, same division of labor verify-otp/handler.js uses for
    // phone/code.
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

    // customer_id / p_customer_id in the body is NEVER read, by design — see
    // the file-level comment. Not even for logging a "rejected" notice,
    // since that itself would be handling client-supplied identity data.
    const isQr = typeof body.p_qr_token === 'string' && body.p_qr_token.length > 0

    if (isQr) {
      if (typeof body.p_items === 'undefined' || typeof body.p_customer_phone !== 'string') {
        return json({ error: 'invalid_request' }, 400)
      }
    } else {
      if (
        typeof body.p_restaurant_id !== 'string' ||
        typeof body.p_branch_id !== 'string' ||
        typeof body.p_type !== 'string' ||
        typeof body.p_customer_phone !== 'string' ||
        typeof body.p_items === 'undefined'
      ) {
        return json({ error: 'invalid_request' }, 400)
      }
    }

    // Step 3 — call the EXISTING, UNMODIFIED order-creation RPCs. customer_id
    // is set from `customerId` above ONLY — this is the one and only place
    // it is written into the call, and it came from the validated session,
    // never from `body`.
    let result
    try {
      result = isQr
        ? await db.rpc('create_order_from_table_qr', {
            p_qr_token: body.p_qr_token,
            p_items: body.p_items,
            p_customer_name: body.p_customer_name ?? null,
            p_customer_phone: body.p_customer_phone,
            p_notes: body.p_notes ?? null,
            p_coupon_code: body.p_coupon_code ?? null,
            p_client_total: body.p_client_total ?? null,
            p_idempotency_key: body.p_idempotency_key ?? null,
            p_customer_id: customerId,
          })
        : await db.rpc('create_order', {
            p_restaurant_id: body.p_restaurant_id,
            p_branch_id: body.p_branch_id,
            p_table_number: body.p_table_number ?? null,
            p_delivery_address: body.p_delivery_address ?? null,
            p_customer_name: body.p_customer_name ?? null,
            p_customer_phone: body.p_customer_phone,
            p_type: body.p_type,
            p_items: body.p_items,
            p_notes: body.p_notes ?? null,
            p_coupon_code: body.p_coupon_code ?? null,
            p_client_total: body.p_client_total ?? null,
            p_idempotency_key: body.p_idempotency_key ?? null,
            p_table_id: body.p_table_id ?? null,
            p_car_info: body.p_car_info ?? null,
            p_customer_id: customerId,
          })
    } catch (err) {
      console.error(`[checkout:${requestId}] create_order_exception: ${sanitize(err?.message)}`)
      return json({ error: 'internal_error' }, 500)
    }

    const { data, error } = result
    if (error) {
      // Same business-rule error strings create_order already returns
      // directly to the anon-key browser client today (e.g. "delivery is
      // unavailable", "invalid or expired coupon") — passed through
      // unchanged so a future frontend migration (Phase 3C.3, not this
      // phase) can keep using its existing mapOrderError(message) unchanged.
      // Not a security-sensitive leak: these are the exact same strings
      // already public today via the direct RPC path.
      return json({ error: sanitize(error.message) }, 400)
    }

    const row = Array.isArray(data) ? data[0] : data
    console.log(`[checkout:${requestId}] order_created maskedPhone=${maskPhone(body.p_customer_phone)}`)
    return json(row ?? null, 200)
  }
}

// ——————————— cookie parsing ———————————

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

// ——————————— safe logging helpers ———————————

/** 512345678 -> "5*****678" — never the full phone number in logs (same convention as verify-otp). */
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
