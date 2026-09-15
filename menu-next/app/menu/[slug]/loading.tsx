// Route-level Suspense fallback while the Server Component's data fetch
// resolves. Performance Optimization Phase 7
// (SIMSIM_MENU_PERFORMANCE_AUDIT_REPORT.md §8/§14): replaces the previous
// bare "...جارٍ التحميل" text with a lightweight static skeleton — same
// .menu-frame width/breakpoints as the real page, same gray tokens already
// used elsewhere in globals.css for image placeholders (#F3F4F6/#E5E7EB, no
// new colors), one small CSS-only @keyframes pulse (no JS, no client
// component, no library). This is explicitly a PERCEIVED-performance fix
// only, per the task's own instruction — it does not and cannot reduce
// TTFB/real load time by itself; that's Phase 1/2's job (caching).
export default function Loading() {
  return (
    <div className="menu-frame">
      <div className="menu-skeleton" role="status" aria-live="polite" aria-label="جارٍ تجهيز المنيو">
        <div className="menu-skeleton__hero" />
        <div className="menu-skeleton__body">
          <div className="menu-skeleton__title" />
          <div className="menu-skeleton__nav">
            <span className="menu-skeleton__pill" />
            <span className="menu-skeleton__pill" />
            <span className="menu-skeleton__pill" />
          </div>
          <div className="menu-skeleton__grid">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="menu-skeleton__card">
                <div className="menu-skeleton__card-image" />
                <div className="menu-skeleton__card-line" />
                <div className="menu-skeleton__card-line menu-skeleton__card-line--short" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
