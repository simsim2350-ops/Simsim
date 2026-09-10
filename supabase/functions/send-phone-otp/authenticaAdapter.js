/**
 * authenticaAdapter.js — small OTP-provider adapter for Authentica (api.authentica.sa).
 *
 * Encapsulates: request payload shape, auth header, base URL, response parsing,
 * provider-error mapping, and timeout. Intentionally small (Phase 2 §7) — the
 * point is to let a future provider replace Authentica without touching
 * Customer Identity / handler.js, not to build a general provider framework.
 *
 * ✅ CUSTOM OTP CONFIRMED (Phase 2.1 final go-live) — Phase 2's own web research
 * (formal Markdown reference, OpenAPI-rendered page, official GitHub examples)
 * found no `otp` field and flagged this as unverified/contradictory. That
 * finding is superseded: the project owner provided direct screenshots from
 * Authentica's own API documentation (Send OTP request body) explicitly
 * showing an optional `otp` field — "custom OTP to be sent to your customer,
 * accept only numbers" — plus a cURL example using `"otp": "123456"`, and a
 * separate Verify OTP endpoint accepting phone/email/otp (confirming Authentica
 * only ever validates its OWN copy of the code if asked to — which SimSim
 * never does, see the architecture note below). See
 * AUTHENTICA_SMS_PROVIDER_PHASE2_1_FINAL_GO_LIVE_REPORT.md §3 for the full
 * evidence trail. Do not reopen this as unverified without new contradicting
 * evidence.
 *
 * Architecture (unchanged, load-bearing): SimSim generates the OTP, hashes and
 * stores it (customer_phone_verifications), and sends the SAME plaintext code
 * to Authentica via this `otp` field purely for SMS transport. Authentica's own
 * `/api/v2/verify-otp` endpoint is never called anywhere in this codebase —
 * `verify_phone_otp()` (Postgres) remains SimSim's sole verification authority.
 */

const DEFAULT_BASE_URL = 'https://api.authentica.sa'
const SEND_OTP_PATH = '/api/v2/send-otp'
const DEFAULT_TIMEOUT_MS = 10000

/**
 * @param {{ apiKey: string|undefined, fetchImpl?: typeof fetch, baseUrl?: string, timeoutMs?: number }} config
 */
export function createAuthenticaAdapter({ apiKey, fetchImpl = fetch, baseUrl = DEFAULT_BASE_URL, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return {
    providerName: 'authentica',

    /**
     * @param {{ phoneE164: string, otpCode: string }} args
     * @returns {Promise<{ ok: true, httpStatus: number } | { ok: false, errorCategory: string, httpStatus?: number }>}
     */
    async sendOtpSms({ phoneE164, otpCode }) {
      if (!apiKey) return { ok: false, errorCategory: 'config_error' }
      if (typeof phoneE164 !== 'string' || !/^\+[1-9]\d{6,14}$/.test(phoneE164)) {
        return { ok: false, errorCategory: 'invalid_phone' }
      }
      if (typeof otpCode !== 'string' || !/^[0-9]{4,8}$/.test(otpCode)) {
        return { ok: false, errorCategory: 'invalid_otp' }
      }

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let res
      try {
        res = await fetchImpl(`${baseUrl}${SEND_OTP_PATH}`, {
          method: 'POST',
          headers: {
            'X-Authorization': apiKey,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          // method:'sms' + phone: E.164 + otp:<SimSim-generated code> — all three
          // confirmed by the formal API reference + owner-provided documentation
          // screenshots (see file-level comment above). No template_id sent —
          // relies on the documented account default, per Phase 2.1 §2 ("do not
          // invent a template ID"). No fallback_email, no WhatsApp — SMS only.
          body: JSON.stringify({ method: 'sms', phone: phoneE164, otp: otpCode }),
          signal: controller.signal,
        })
      } catch (err) {
        clearTimeout(timer)
        if (err && err.name === 'AbortError') return { ok: false, errorCategory: 'timeout' }
        return { ok: false, errorCategory: 'network_error' }
      }
      clearTimeout(timer)

      let rawText
      try {
        rawText = await res.text()
      } catch {
        return { ok: false, errorCategory: 'malformed_response', httpStatus: res.status }
      }

      let body = null
      if (rawText) {
        try {
          body = JSON.parse(rawText)
        } catch {
          return { ok: false, errorCategory: 'malformed_response', httpStatus: res.status }
        }
      }

      if (res.status === 401) return { ok: false, errorCategory: 'auth_error', httpStatus: 401 }
      if (res.status === 400 || res.status === 422) return { ok: false, errorCategory: 'invalid_request', httpStatus: res.status }
      if (res.status === 429) return { ok: false, errorCategory: 'rate_limited', httpStatus: 429 }
      if (res.status >= 500) return { ok: false, errorCategory: 'provider_error', httpStatus: res.status }
      if (res.status !== 200) return { ok: false, errorCategory: 'unknown_error', httpStatus: res.status }

      // Documented success shape: {"success": true, "data": null, "message": "..."}.
      if (!body || body.success !== true) return { ok: false, errorCategory: 'unexpected_success_shape', httpStatus: res.status }

      return { ok: true, httpStatus: res.status }
    },
  }
}
