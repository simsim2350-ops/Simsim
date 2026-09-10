/**
 * phoneFormat.js — SimSim canonical (5XXXXXXXX) ↔ E.164 (+9665XXXXXXXX) conversion.
 *
 * The provider boundary (Authentica) is the ONLY place this conversion happens.
 * customer_identities.phone / orders.customer_phone / every DB check constraint
 * stay in the canonical 9-digit format untouched — this file never writes to the
 * database, it only shapes the outbound HTTP payload to Authentica.
 */

const CANONICAL_SHAPE = /^5[0-9]{8}$/

/** @param {string} phone canonical SimSim phone (5XXXXXXXX) */
export function isCanonicalPhone(phone) {
  return typeof phone === 'string' && CANONICAL_SHAPE.test(phone)
}

/**
 * @param {string} phone canonical SimSim phone (5XXXXXXXX)
 * @returns {string|null} E.164 (+9665XXXXXXXX), or null if input isn't canonical
 */
export function toE164(phone) {
  if (!isCanonicalPhone(phone)) return null
  return `+966${phone}`
}
