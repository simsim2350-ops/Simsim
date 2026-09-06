'use client'

import { useEffect, useRef, useState } from 'react'

// Horizontal category tab bar — faithful port of the click-to-scroll +
// scroll-spy behavior from src/features/menu/MenuBody.jsx's own tab bar
// (goToCategory + its IntersectionObserver effect), using the exact same
// rootMargin/threshold/topmost-entry-selection so the "what counts as
// active while scrolling" feel matches the legacy menu precisely. Only the
// supplementary "☰ all categories" bottom-sheet drawer is intentionally not
// ported this round (Section 3: horizontal nav only, no drawer).
//
// Self-contained: activeId lives only in this component's own state, since
// nothing else on the page currently needs to know which category is
// active. Hooks directly into the existing `#cat-${id}` anchors already
// rendered by CategorySection.tsx — no change needed there.
export function CategoryNav({
  categories,
  brandColor,
}: {
  // Real categories only (already filtered by the caller to ones that will
  // actually render a section — is_visible + at least one available
  // product — and in Dashboard sort order), never the synthetic
  // highlight-rail "categories" (best sellers / featured / favorites).
  categories: { id: string; name: string }[]
  brandColor: string
}) {
  const [activeId, setActiveId] = useState(categories[0]?.id ?? '')
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    if (categories.length === 0) return
    if (observerRef.current) observerRef.current.disconnect()

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length === 0) return
        const topMost = visible.reduce((a, b) => (a.boundingClientRect.top <= b.boundingClientRect.top ? a : b))
        const catId = topMost.target.id.replace('cat-', '')
        setActiveId((prev) => {
          if (prev === catId) return prev
          document.getElementById(`tab-${catId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
          return catId
        })
      },
      { rootMargin: '-120px 0px -65% 0px', threshold: 0 }
    )

    const timer = setTimeout(() => {
      categories.forEach((cat) => {
        const el = document.getElementById(`cat-${cat.id}`)
        if (el) observer.observe(el)
      })
    }, 100)

    observerRef.current = observer
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [categories])

  const goToCategory = (catId: string) => {
    setActiveId(catId)
    document.getElementById(`cat-${catId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (categories.length === 0) return null

  return (
    <nav className="category-nav" aria-label="categories">
      {categories.map((cat) => {
        const isActive = activeId === cat.id
        return (
          <button
            key={cat.id}
            id={`tab-${cat.id}`}
            type="button"
            className={`category-nav__tab${isActive ? ' is-active' : ''}`}
            style={isActive ? { borderColor: brandColor } : undefined}
            onClick={() => goToCategory(cat.id)}
          >
            {cat.name}
          </button>
        )
      })}
    </nav>
  )
}
