'use client'

import { useEffect, useRef, useState } from 'react'
import type { Lang } from '@/lib/types'
import { t } from '@/lib/i18n'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'

// Dual category system — a horizontal, always-visible tab bar plus an "all
// categories" button that opens a vertical list, both driven by the exact
// same `categories` prop and the exact same `activeId` state (one Category
// state, two views onto it — never two separate systems, per the task's
// explicit instruction). Click-to-scroll + scroll-spy are ported from
// src/features/menu/MenuBody.jsx's own tab bar (goToCategory + its
// IntersectionObserver effect), using the same rootMargin/threshold/
// topmost-entry-selection so the "what counts as active while scrolling"
// feel matches the legacy menu precisely.
export function CategoryNav({
  categories,
  brandColor,
  lang,
}: {
  // Real categories only (already filtered by the caller to ones that will
  // actually render a section — is_visible + at least one available
  // product — and in Dashboard sort order), never the synthetic
  // highlight-rail "categories" (best sellers / featured / favorites).
  categories: { id: string; name: string; count: number }[]
  brandColor: string
  lang: Lang
}) {
  const strings = t(lang)
  // Arabic-correct item-count wording for the drawer rows (1 -> "صنف واحد",
  // 2 -> "صنفان", no leading numeral for either — matching how a native
  // speaker would actually say it, per the reference design). Kept local to
  // this component rather than changed inside the shared strings.itemsCount
  // (used elsewhere, e.g. the Checkout order summary) — 3+ still defers to
  // that same shared helper, which already handles the >10 rollover back to
  // singular correctly, so that logic isn't duplicated here.
  const formatCategoryCount = (n: number) => {
    if (lang === 'ar' && n === 1) return 'صنف واحد'
    if (lang === 'ar' && n === 2) return 'صنفان'
    return strings.itemsCount(n)
  }
  const [activeId, setActiveId] = useState(categories[0]?.id ?? '')
  const [drawerOpen, setDrawerOpen] = useState(false)
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

  // Lock background scroll while the drawer is open (this round) — the
  // Hero/page behind it must stay completely still while the user scrolls
  // the drawer's own category list, and resume exactly where it was on
  // close (this is exactly what document.body.style.overflow='hidden'
  // does — it freezes the current scroll position in place and restores it
  // untouched on unlock, no manual scroll-position bookkeeping needed).
  // Same, already-proven technique as the legacy menu's own bottom sheets
  // (src/hooks/useBodyScrollLock.js), ported once into lib/ for menu-next.
  useBodyScrollLock(drawerOpen)

  // Escape closes the vertical drawer — same pattern as AllergensModal.tsx.
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const goToCategory = (catId: string, closeDrawer = false) => {
    setActiveId(catId)
    document.getElementById(`cat-${catId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    if (closeDrawer) setDrawerOpen(false)
  }

  if (categories.length === 0) return null

  return (
    <>
      <div className="category-nav-row">
        <button
          type="button"
          className="category-nav__all-btn"
          onClick={() => setDrawerOpen(true)}
          aria-label={strings.openAllCategories}
          aria-haspopup="dialog"
        >
          ☰
        </button>
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
      </div>

      {drawerOpen && (
        <div className="category-drawer-overlay" onClick={() => setDrawerOpen(false)} role="dialog" aria-modal="true" aria-label={strings.categoryMenuTitle}>
          <div className="category-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="options-modal__handle" />
            <div className="category-drawer__header">
              <button type="button" className="category-drawer__close" onClick={() => setDrawerOpen(false)} aria-label="close">✕</button>
              <h3 className="category-drawer__title">{strings.categoryMenuTitle}</h3>
            </div>
            <div className="category-drawer__list">
              {categories.map((cat) => {
                const isActive = activeId === cat.id
                return (
                  <button
                    key={cat.id}
                    type="button"
                    className={`category-drawer__item${isActive ? ' is-active' : ''}`}
                    style={isActive ? { color: brandColor } : undefined}
                    onClick={() => goToCategory(cat.id, true)}
                  >
                    <span className="category-drawer__item-name">{cat.name}</span>
                    <span className="category-drawer__item-count">{formatCategoryCount(cat.count)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
