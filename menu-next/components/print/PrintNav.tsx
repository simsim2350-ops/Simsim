'use client'

import styles from '../../app/print/print.module.css'

// PHASE 2.5 — this page is always opened as a utility view from the
// Dashboard (Orders' print panel, or Branches' test-print button), usually
// via window.open() in a new tab — so browser history (router.back()) has
// nothing useful to go back to: a fresh tab's history starts right here.
// Both "Back" and "Home" are therefore explicit, deliberate destinations
// instead of relying on browser history:
//   - Back: if this tab really was opened via window.open() from another
//     still-open tab (window.opener set), closing it is the correct
//     "back" — it reveals the exact page that opened it, whatever that
//     was (Order Details, Branches). Otherwise (direct nav / refresh /
//     deep link / opener already closed) it falls back to `returnUrl`
//     (same-origin, passed by whoever opened this page) or, lacking
//     that, the Dashboard home — never the Marketing website.
//   - Home: always an explicit, fixed /dashboard link. Never a bare "/"
//     link — on this domain "/" itself is proxied to the Marketing
//     website (vercel.json), which is what made the Dashboard's own
//     generic 404 "Home" button send a staff member there before this
//     fix; this page never reuses that generic link.
export function PrintNav({ returnUrl, returnLabel }: { returnUrl?: string | null; returnLabel?: string | null }) {
  const handleBack = () => {
    if (typeof window !== 'undefined' && window.opener && !window.opener.closed) {
      window.close()
      return
    }
    window.location.href = returnUrl || '/dashboard'
  }

  return (
    <div className={`${styles.printNav} noPrint`}>
      <button type="button" onClick={handleBack} className={styles.printNavBack}>
        ← {returnLabel || 'رجوع'}
      </button>
      <a href="/dashboard" className={styles.printNavHome}>🏠 لوحة التحكم</a>
    </div>
  )
}
