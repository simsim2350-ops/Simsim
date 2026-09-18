/**
 * ipHash.js — extracts the source IP from a request and hashes it.
 *
 * Verbatim-pattern copy of supabase/functions/send-phone-otp/ipHash.js and
 * menu-next/app/api/customer/loyalty/ipHash.js — same defensive-not-verified
 * extraction, same unsalted SHA-256 (deterministic on purpose: abuse counting
 * requires the SAME source IP to always produce the SAME hash). The raw IP is
 * never persisted — only this hex digest leaves this module.
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
