// Minimal index — this app has no public entry point of its own yet; it exists
// to prove /menu/[slug] works. Convenience link only, not part of the POC scope.
export default function Home() {
  return (
    <div className="menu-frame">
      <div className="menu-empty">
        <h1>SimSim Menu — Next.js POC</h1>
        <p>Phase 2 read-only proof-of-concept. Try <a href="/menu/simsim">/menu/simsim</a>.</p>
      </div>
    </div>
  )
}
