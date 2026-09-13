// The one, single source of truth for this app's public-facing origin, used
// only where an absolute URL is actually required (metadata/canonical/Open
// Graph tags). Internal navigation stays relative (Next.js <Link>/router)
// and never needs this constant — this exists specifically for the
// SIMSIM_CANONICAL_ORIGIN_UNIFICATION_EXECUTION_REPORT.md work: ensuring
// menu-next's own metadata always advertises simsimmenu.com, never
// www.simsimmenu.com or the raw simsim-menu-next.vercel.app deployment host,
// regardless of which of those a given request actually arrived on.
export const CANONICAL_ORIGIN = 'https://simsimmenu.com'
