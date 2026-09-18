/**
 * dashboard-login-guard/handler.js — Migration 5.0 (F-01 remediation).
 *
 * Server-side gateway the Dashboard/Staff login form now calls INSTEAD of
 * calling supabase.auth.signInWithPassword() directly from the browser.
 * Supabase Auth remains the sole source of truth for password verification
 * and session/token issuance — this file never re-implements or bypasses it;
 * it only decides WHETHER to forward a given attempt to Supabase Auth at
 * all, based on the atomic rate-limit/lockout functions in
 * sql/phase6_migration5_0_dashboard_login_rate_limiting.sql
 * (check_dashboard_login_allowed / record_dashboard_login_outcome).
 *
 * Scope: Dashboard Owner + Staff Email+Password login ONLY. Does not touch,
 * call, or depend on anything in the Customer OTP/Customer Session system.
 *
 * Enumeration safety (task §6/§17/§20): every rejection path — malformed
 * input, account currently locked, IP currently throttled, wrong password,
 * or an internal/limiter error (fail-closed) — returns the EXACT SAME
 * generic response shape and status. No branch here ever reveals which case
 * occurred.
 *
 * Dependencies injected via buildHandler({...}) — same testable pattern as
 * every other Edge Function handler in this repo (send-phone-otp/handler.js,
 * payment-first-checkout/handler.js): testable with Vitest, no real Deno or
 * Supabase project needed.
 */

import { extractSourceIp, hashIp } from './ipHash.js'

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_BODY_BYTES = 1024

const GENERIC_REJECTION_BODY = { error: 'invalid_credentials', error_description: 'Invalid login credentials' }
const GENERIC_REJECTION_STATUS = 400 // matches Supabase Auth's own wrong-credentials shape/status exactly,
// so a network observer sees no difference between "gateway rejected before calling Supabase Auth" and
// "Supabase Auth itself rejected" — both are indistinguishable by design.

/**
 * @param {{
 *   db: object | null,
 *   authUrl: string,
 *   anonKey: string | undefined,
 *   fetchImpl?: typeof fetch,
 *   allowedOrigins?: string[],
 * }} deps
 * @returns {(req: Request) => Promise<Response>}
 */
export function buildHandler({ db, authUrl, anonKey, fetchImpl = fetch, allowedOrigins = ['https://simsimmenu.com'] }) {
  return async function handleDashboardLogin(req) {
    const requestId = crypto.randomUUID()
    const origin = req.headers.get('origin')
    const cors = buildCorsHeaders(origin, allowedOrigins)

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }
    if (req.method !== 'POST') {
      return json({ error: 'method_not_allowed' }, 405, cors)
    }

    // STEP 1 — validate request structure BEFORE touching any counter or
    // calling Supabase Auth. A malformed request never reaches the DB.
    let rawBody
    try {
      rawBody = await req.text()
    } catch {
      return genericRejection(cors)
    }
    if (byteLength(rawBody) > MAX_BODY_BYTES) {
      return genericRejection(cors)
    }
    let body
    try {
      body = JSON.parse(rawBody)
    } catch {
      return genericRejection(cors)
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return genericRejection(cors)
    }

    const emailRaw = body.email
    const password = body.password
    if (
      typeof emailRaw !== 'string' ||
      typeof password !== 'string' ||
      password.length === 0 ||
      !EMAIL_SHAPE.test(emailRaw.trim())
    ) {
      return genericRejection(cors)
    }

    // STEP 2 — normalize email (trim + lowercase) = account_key.
    const accountKey = emailRaw.trim().toLowerCase()

    // STEP 3 — extract + hash source IP. Raw IP never persisted anywhere.
    const sourceIp = extractSourceIp(req)
    const ipHash = await hashIp(sourceIp)

    if (!db) {
      console.error(`[dashboard-login-guard:${requestId}] service_role not configured`)
      return genericRejection(cors) // FAIL CLOSED
    }

    // STEP 4 + 5 — atomic precheck: account lockout OR IP sliding-window
    // throttle. Either one blocking is sufficient to reject (logical OR),
    // WITHOUT ever calling Supabase Auth in that case.
    let precheck
    try {
      const { data, error } = await db.rpc('check_dashboard_login_allowed', {
        p_account_key: accountKey,
        p_ip_hash: ipHash,
      })
      if (error) throw new Error(error.message)
      precheck = data
    } catch (err) {
      console.error(`[dashboard-login-guard:${requestId}] precheck_exception: ${sanitize(err?.message)}`)
      return genericRejection(cors) // FAIL CLOSED — never let a limiter error fall through to Supabase Auth
    }

    if (!precheck?.allowed) {
      // Account currently locked OR IP currently throttled — indistinguishable externally.
      return genericRejection(cors)
    }

    // STEP 6 — forward credentials to Supabase Auth (server-side relay of
    // the exact call the browser used to make directly). Supabase Auth
    // remains the sole verifier of the password; this file never inspects,
    // stores, or logs it beyond this one forwarded call.
    let authStatus
    let authBody
    try {
      const res = await fetchImpl(`${authUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: anonKey ?? '', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailRaw.trim(), password }),
      })
      authStatus = res.status
      authBody = await res.json().catch(() => null)
    } catch (err) {
      console.error(`[dashboard-login-guard:${requestId}] auth_forward_exception: ${sanitize(err?.message)}`)
      return genericRejection(cors) // FAIL CLOSED — Supabase Auth itself unreachable
    }
    // `password` is not referenced again after this line.

    const success = authStatus === 200 && typeof authBody?.access_token === 'string' && typeof authBody?.refresh_token === 'string'

    // Pre-existing product behavior (Login.jsx, unchanged by this migration):
    // a just-registered account with an unconfirmed email gets redirected to
    // /verify-email, distinctly from a plain wrong-password rejection.
    // Empirically confirmed (live test against a disposable pre-existing
    // unconfirmed test account, Migration 5.0 implementation task): Supabase
    // Auth validates the PASSWORD FIRST — `email_not_confirmed` is only ever
    // returned when the submitted password was actually correct; a wrong
    // password against an unconfirmed account still returns the ordinary
    // `invalid_credentials`. This means preserving this distinct branch does
    // NOT reopen enumeration on wrong-password attempts (Migration 4.9's own
    // tested/verified case) — it only ever fires for a caller who already
    // has the correct password, which is a materially different, much
    // narrower situation, and one this product already surfaces distinctly
    // today via direct signInWithPassword. Treated as a rate-limit SUCCESS
    // (resets the counter) since the credentials were, in fact, valid.
    const emailNotConfirmed = !success && authBody?.error_code === 'email_not_confirmed'

    // STEP 7A / 7B — record the outcome. Best-effort: a failure to RECORD
    // must not flip an already-decided, authoritative Supabase Auth outcome
    // (the security-relevant decision already happened in STEP 4-6) — it
    // only risks under-counting this one attempt for future rate-limiting,
    // not a bypass of the check that already ran.
    try {
      await db.rpc('record_dashboard_login_outcome', {
        p_account_key: accountKey,
        p_ip_hash: ipHash,
        p_success: success || emailNotConfirmed,
      })
    } catch (err) {
      console.error(`[dashboard-login-guard:${requestId}] record_outcome_exception: ${sanitize(err?.message)}`)
    }

    if (emailNotConfirmed) {
      console.log(`[dashboard-login-guard:${requestId}] email_not_confirmed`)
      return json({ error: 'email_not_confirmed' }, 400, cors)
    }

    if (!success) {
      console.warn(`[dashboard-login-guard:${requestId}] rejected: authStatus=${authStatus}`)
      return genericRejection(cors)
    }

    console.log(`[dashboard-login-guard:${requestId}] success`)
    // Only the two fields the browser needs for supabase.auth.setSession() —
    // never the full Supabase Auth response body, keeping this gateway's own
    // response surface minimal.
    return json({ access_token: authBody.access_token, refresh_token: authBody.refresh_token }, 200, cors)
  }
}

// ——————————— response helpers ———————————

function genericRejection(cors) {
  return json(GENERIC_REJECTION_BODY, GENERIC_REJECTION_STATUS, cors)
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

// ——————————— CORS ———————————

/**
 * Only reflects Access-Control-Allow-Origin when the request's Origin header
 * exactly matches an entry in allowedOrigins — never a wildcard. An
 * unrecognized origin simply gets no CORS header, which the browser itself
 * will then block (no explicit rejection needed on this side).
 */
function buildCorsHeaders(origin, allowedOrigins) {
  const headers = {
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
  if (origin && allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Vary'] = 'Origin'
  }
  return headers
}

// ——————————— safe logging / generic helpers ———————————

function sanitize(msg) {
  const s = typeof msg === 'string' ? msg : 'unknown_error'
  return s.slice(0, 200)
}

function byteLength(str) {
  return new TextEncoder().encode(str).length
}
