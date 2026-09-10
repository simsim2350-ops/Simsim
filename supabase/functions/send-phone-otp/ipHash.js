/**
 * ipHash.js — extracts the source IP from a request and hashes it.
 *
 * The raw IP is never persisted (see otp_ip_request_log's column comment,
 * sql/customer_identity_phase2_1_ip_abuse_protection.sql) — only its SHA-256
 * hex digest leaves this module. Hashing is unsalted/deterministic on purpose:
 * abuse counting requires the SAME source IP to always produce the SAME hash.
 *
 * IP extraction is defensive, not asserted as verified: Supabase Edge
 * Functions run on Deno Deploy infrastructure behind a proxy that
 * conventionally sets `x-forwarded-for` (first entry = original client), but
 * this has NOT been confirmed by an actual deployed-function request in this
 * phase (see AUTHENTICA_SMS_PROVIDER_PHASE2_1_EXECUTION_REPORT.md). A missing
 * or unparseable header degrades to a shared "unknown" bucket rather than
 * skipping the check — an attacker who can suppress this header does not
 * bypass rate-limiting, they just share a (fairly tight) bucket with anyone
 * else who also has no header.
 */

/** @param {Request} req */
export function extractSourceIp(req) {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const realIp = req.headers.get('x-real-ip')
  if (realIp && realIp.trim()) return realIp.trim()
  return 'unknown'
}

/**
 * @param {string} ip
 * @returns {Promise<string>} lowercase hex SHA-256 digest
 */
export async function hashIp(ip) {
  const bytes = new TextEncoder().encode(ip)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
