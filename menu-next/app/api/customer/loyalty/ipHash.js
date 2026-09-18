/**
 * ipHash.js — extracts the source IP from a request and hashes it.
 *
 * Faithful port of supabase/functions/send-phone-otp/ipHash.js's own
 * extraction logic and trust-model documentation, adapted to the standard
 * Web `Request` object Next.js Route Handlers already use (same interface,
 * no behavior difference). Not duplicated logic invented fresh — same
 * defensive posture, same fallback, same reasoning.
 *
 * The raw IP is never persisted — only its SHA-256 hex digest leaves this
 * module (see loyalty_lookup_rate_log's column, sql/phase6_migration4_1_
 * loyalty_rate_limiting.sql). Hashing is unsalted/deterministic on purpose:
 * abuse counting requires the SAME source IP to always produce the SAME
 * hash.
 *
 * On Vercel specifically, `x-forwarded-for` is set by Vercel's own edge
 * network for every request reaching a Route Handler — more reliable here
 * than in the Deno Edge Function context the original comment describes,
 * but the same defensive fallback is kept regardless: a missing/unparseable
 * header degrades to a shared "unknown" bucket rather than skipping the
 * check — an attacker who can suppress this header does not bypass
 * rate-limiting, they just share a (fairly tight) bucket with anyone else
 * who also has no header.
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
