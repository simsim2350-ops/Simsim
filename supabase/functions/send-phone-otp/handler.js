/**
 * send-phone-otp/handler.js
 *
 * Phase 2 — Authentica SMS delivery for SimSim's existing Customer Identity OTP
 * foundation (Phase 1). This function is DELIVERY ONLY: it never generates an
 * OTP itself, never stores OTP state, never verifies a code. All of that stays
 * exactly where Phase 1 put it (request_phone_otp_for_delivery /
 * verify_phone_otp / customer_phone_verifications) — this file just calls the
 * one existing, service_role-only RPC that returns the plaintext code at the
 * moment of generation, forwards it to Authentica, and forgets it.
 *
 * Dependencies fully injected via buildHandler({...}) — same pattern as
 * supabase/functions/payment-first-checkout/handler.js — so this is testable
 * with Vitest, without Deno, without a real Supabase project, without a real
 * Authentica call.
 */

import { createAuthenticaAdapter } from './authenticaAdapter.js'
import { isCanonicalPhone, toE164 } from './phoneFormat.js'
import { extractSourceIp, hashIp } from './ipHash.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_BODY_BYTES = 2 * 1024

// Phase 2.1 — abuse-protection layer (sql/customer_identity_phase2_1_ip_abuse_
// protection.sql). Defends against one source hitting many DIFFERENT phone
// numbers (Phase 1's per-phone limits cannot see across identities). Kept in
// sync with the SQL function's own defaults deliberately, not by accident.
const IP_MAX_REQUESTS = 20
const IP_WINDOW_MINUTES = 15

/**
 * @param {{ db: object, apiKey: string|undefined, adapterFactory?: Function, fetchImpl?: typeof fetch }} deps
 * @returns {(req: Request) => Promise<Response>}
 */
export function buildHandler({ db, apiKey, adapterFactory = createAuthenticaAdapter, fetchImpl }) {
  const adapter = adapterFactory({ apiKey, fetchImpl })

  return async function handleRequest(req) {
    const requestId = crypto.randomUUID()

    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }
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
      console.warn(`[send-phone-otp:${requestId}] rejected: body_too_large`)
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

    if (!isCanonicalPhone(body.phone)) {
      return json({ error: 'invalid_phone' }, 400)
    }
    const phone = body.phone

    // Configuration error (missing secret) — never invented, never defaulted.
    if (!apiKey) {
      console.error(`[send-phone-otp:${requestId}] AUTHENTICA_API_KEY not configured`)
      return json({ error: 'internal_error' }, 500)
    }

    // Step 0 — Phase 2.1 abuse protection: bound how many OTP requests one
    // source IP can trigger, regardless of how many DIFFERENT phone numbers
    // it tries (Phase 1's per-phone limits alone cannot see this pattern —
    // each new phone is a brand-new, fully-reset counter). Runs BEFORE the
    // phone-level RPC so abusive traffic never reaches — or costs — it.
    // Failure of this check itself fails CLOSED (protecting SMS balance
    // matters more here than tolerating a rare infra hiccup).
    const sourceIp = extractSourceIp(req)
    const ipHash = await hashIp(sourceIp)
    let ipAllowed
    try {
      const { data, error } = await db.rpc('check_and_log_otp_ip_request', {
        p_ip_hash: ipHash,
        p_max_requests: IP_MAX_REQUESTS,
        p_window_minutes: IP_WINDOW_MINUTES,
      })
      if (error) throw new Error(error.message)
      ipAllowed = data
    } catch (err) {
      console.error(`[send-phone-otp:${requestId}] ip_check_exception: ${sanitizeErrorMessage(err)}`)
      return json({ error: 'internal_error' }, 500)
    }
    if (!ipAllowed) {
      // Deliberately the SAME shape as the generic RPC-rejection fallback
      // below (reason: 'rejected') — never a distinguishable "you tripped the
      // IP-wide fence" signal (Phase 2.1 §5: "do not reveal which specific
      // limit triggered internally").
      console.warn(`[send-phone-otp:${requestId}] ip_abuse_blocked: ipHashPrefix=${ipHash.slice(0, 8)}`)
      return json({ status: 'rejected', reason: 'rejected' }, 200)
    }

    // Step 1 — SimSim's own OTP generation/rate-limit/state machine (Phase 1,
    // unchanged logic, only exposed here via the service_role-only RPC added
    // in Phase 2). This is the ONLY place in the whole system that ever sees
    // the plaintext code outside the database itself.
    let issued
    try {
      const { data, error } = await db.rpc('request_phone_otp_for_delivery', { p_phone: phone })
      if (error) {
        const reason = mapRpcError(error.message)
        console.warn(`[send-phone-otp:${requestId}] rpc_rejected: ${reason} maskedPhone=${maskPhone(phone)}`)
        return json({ status: 'rejected', reason }, 200)
      }
      issued = data
    } catch (err) {
      console.error(`[send-phone-otp:${requestId}] rpc_exception: ${sanitizeErrorMessage(err)}`)
      return json({ error: 'internal_error' }, 500)
    }

    const otpCode = issued && typeof issued === 'object' ? issued.otp_code : undefined
    if (!issued?.requested || typeof otpCode !== 'string') {
      // Never log `issued` itself here — it is exactly the object that carries otp_code.
      console.error(`[send-phone-otp:${requestId}] rpc_returned_unexpected_shape`)
      return json({ error: 'internal_error' }, 500)
    }

    // Step 2 — provider boundary. E.164 conversion happens here only; nothing
    // upstream or downstream of this line ever sees a non-canonical phone.
    const phoneE164 = toE164(phone)
    const sendResult = await adapter.sendOtpSms({ phoneE164, otpCode })
    // otpCode is not referenced again after this line — nothing below can log or return it.

    if (!sendResult.ok) {
      console.warn(
        `[send-phone-otp:${requestId}] provider_send_failed: provider=${adapter.providerName} category=${sendResult.errorCategory} httpStatus=${sendResult.httpStatus ?? 'n/a'} maskedPhone=${maskPhone(phone)}`,
      )
      return json({ status: 'failed', reason: mapProviderErrorForCaller(sendResult.errorCategory) }, 200)
    }

    console.log(`[send-phone-otp:${requestId}] sent: provider=${adapter.providerName} httpStatus=${sendResult.httpStatus} maskedPhone=${maskPhone(phone)}`)
    return json({ status: 'sent' }, 200)
  }
}

// ——————————— error mapping ———————————

/** Maps request_phone_otp_for_delivery's raised exception messages to a safe caller-facing reason. */
function mapRpcError(message) {
  if (message === 'otp_cooldown') return 'cooldown'
  if (message === 'otp_rate_limited') return 'rate_limited'
  if (message === 'invalid phone format') return 'invalid_phone'
  return 'rejected'
}

/** Never leaks the provider's name/internals or raw HTTP details to the caller. */
function mapProviderErrorForCaller(category) {
  if (category === 'rate_limited' || category === 'timeout' || category === 'network_error' || category === 'provider_error') {
    return 'try_again_later'
  }
  return 'delivery_failed'
}

// ——————————— safe logging helpers ———————————

/** 512345678 -> "5*****678" — never the full phone number in logs (Phase 2 §9). */
function maskPhone(phone) {
  if (typeof phone !== 'string' || phone.length < 4) return '***'
  return `${phone.slice(0, 1)}*****${phone.slice(-3)}`
}

/** Truncates and strips a caught error down to a short message — never a full object/stack. */
function sanitizeErrorMessage(err) {
  const msg = err && typeof err.message === 'string' ? err.message : 'unknown_error'
  return msg.slice(0, 200)
}

// ——————————— generic helpers ———————————

function byteLength(str) {
  return new TextEncoder().encode(str).length
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
