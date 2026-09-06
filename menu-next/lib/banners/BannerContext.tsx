'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { Banner, DisplayCoupon, DisplayMode, DisplayFrequency } from './types'

// Faithful port of src/features/menu/BannerDisplays.jsx's useBannerDisplayState
// + PublicMenu.jsx's own wiring (useMenuBannerDisplay(banners, restaurantId,
// branchId) called once, offersCount = max(banners.length, coupons.length),
// offersOpen state) — combined into one Context so RestaurantHeader (the
// offers-icon trigger) and the banner placement components (rendered
// elsewhere on the page) can share the same state without prop-drilling
// through page.tsx, the same role CartContext already plays for the cart.
const DISPLAY_MODES: DisplayMode[] = ['fullscreen', 'popup', 'top', 'inline', 'floating']

function normalizeMode(banner?: Banner | null): DisplayMode {
  return banner && DISPLAY_MODES.includes(banner.display_mode as DisplayMode) ? (banner.display_mode as DisplayMode) : 'top'
}
function normalizeFrequency(banner?: Banner | null): DisplayFrequency {
  const f = banner?.display_frequency
  return f === 'once_per_visitor' || f === 'delayed' ? f : 'every_visit'
}
function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

type BannerContextValue = {
  topBanner: Banner | null
  inlineBanner: Banner | null
  floatingBanner: Banner | null
  fullscreenBanner: Banner | null
  popupBanner: Banner | null
  dismissFullscreen: () => void
  dismissPopup: () => void
  banners: Banner[]
  coupons: DisplayCoupon[]
  offersCount: number
  offersOpen: boolean
  openOffers: () => void
  closeOffers: () => void
}

const BannerContext = createContext<BannerContextValue | null>(null)

export function BannerProvider({
  banners, coupons, restaurantId, branchId, children,
}: {
  banners: Banner[]
  coupons: DisplayCoupon[]
  restaurantId: string
  branchId: string
  children: React.ReactNode
}) {
  const [visibleIds, setVisibleIds] = useState<Set<string>>(() => new Set())
  const [fullscreenBanner, setFullscreenBanner] = useState<Banner | null>(null)
  const [popupBanner, setPopupBanner] = useState<Banner | null>(null)
  const [offersOpen, setOffersOpen] = useState(false)
  const presentedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    setVisibleIds(new Set())
    setFullscreenBanner(null)
    setPopupBanner(null)
    presentedRef.current = new Set()
  }, [restaurantId, branchId])

  useEffect(() => {
    if (!restaurantId || banners.length === 0) return undefined
    const timers: number[] = []
    const modesAlreadyScheduled = new Set<DisplayMode>()
    const sorted = [...banners].sort(
      (a, b) => safeNumber(b.display_priority) - safeNumber(a.display_priority) || safeNumber(a.sort_order) - safeNumber(b.sort_order)
    )

    const seenKey = (banner: Banner) => `simsim_banner_seen_${restaurantId}_${banner.id}`
    const shouldSkipForVisitor = (banner: Banner) => {
      if (normalizeFrequency(banner) !== 'once_per_visitor') return false
      try {
        const seenAt = Number(localStorage.getItem(seenKey(banner)) || 0)
        const cooldownMs = Math.max(1, safeNumber(banner.visitor_cooldown_hours, 24)) * 60 * 60 * 1000
        return seenAt > 0 && Date.now() - seenAt < cooldownMs
      } catch {
        return false
      }
    }
    const markSeen = (banner: Banner) => {
      if (normalizeFrequency(banner) !== 'once_per_visitor') return
      try { localStorage.setItem(seenKey(banner), String(Date.now())) } catch { /* localStorage optional */ }
    }
    const present = (banner: Banner) => {
      const key = `${restaurantId}:${branchId || 'all'}:${banner.id}`
      if (presentedRef.current.has(key)) return
      presentedRef.current.add(key)
      markSeen(banner)
      setVisibleIds((prev) => new Set([...prev, banner.id]))
      const mode = normalizeMode(banner)
      if (mode === 'fullscreen') setFullscreenBanner(banner)
      if (mode === 'popup') setPopupBanner(banner)
    }

    sorted.forEach((banner) => {
      const mode = normalizeMode(banner)
      if (modesAlreadyScheduled.has(mode) || shouldSkipForVisitor(banner)) return
      modesAlreadyScheduled.add(mode)
      const delay = normalizeFrequency(banner) === 'delayed' ? Math.min(300, Math.max(0, safeNumber(banner.display_delay_seconds))) * 1000 : 0
      if (delay > 0) timers.push(window.setTimeout(() => present(banner), delay))
      else present(banner)
    })

    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [banners, restaurantId, branchId])

  const visibleByMode = useMemo(() => {
    const values: Partial<Record<DisplayMode, Banner>> = {}
    banners.forEach((banner) => {
      if (!visibleIds.has(banner.id)) return
      const mode = normalizeMode(banner)
      if (!values[mode]) values[mode] = banner
    })
    return values
  }, [banners, visibleIds])

  const value: BannerContextValue = {
    topBanner: visibleByMode.top ?? null,
    inlineBanner: visibleByMode.inline ?? null,
    floatingBanner: visibleByMode.floating ?? null,
    fullscreenBanner,
    popupBanner,
    dismissFullscreen: () => setFullscreenBanner(null),
    dismissPopup: () => setPopupBanner(null),
    banners,
    coupons,
    offersCount: Math.max(banners.length, coupons.length),
    offersOpen,
    openOffers: () => setOffersOpen(true),
    closeOffers: () => setOffersOpen(false),
  }

  return <BannerContext.Provider value={value}>{children}</BannerContext.Provider>
}

export function useMenuBanners(): BannerContextValue {
  const ctx = useContext(BannerContext)
  if (!ctx) throw new Error('useMenuBanners must be used within BannerProvider')
  return ctx
}
