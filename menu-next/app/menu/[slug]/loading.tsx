export default function Loading() {
  // Route-level Suspense fallback while the Server Component's data fetch resolves.
  return (
    <div className="menu-frame">
      <div className="menu-empty" role="status" aria-live="polite">
        <p>...جارٍ التحميل</p>
      </div>
    </div>
  )
}
