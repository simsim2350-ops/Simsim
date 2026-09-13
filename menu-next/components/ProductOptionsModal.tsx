'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useCart } from '@/lib/cart/CartContext'
import { buildCartKey, normalizeOptionGroups, optionsPrice, selectionsFromResolved, type OptionSelections } from '@/lib/options'
import { getProductCompanions } from '@/lib/recommendations'
import { detectContentBox, type FramingResult } from '@/lib/smartImageFraming'
import { t } from '@/lib/i18n'
import type { Lang, Product } from '@/lib/types'
import type { SelectedOption } from '@/lib/cart/types'

type ModalProduct = {
  id: string
  name: string
  nameEn: string | null
  description?: string | null
  descriptionEn?: string | null
  price: number
  // Real, already-fetched Product fields (products.compare_price/is_best_seller/
  // calories) — optional because two of the three call sites into this modal
  // still pass a slimmer object; when omitted, the badge/row they drive simply
  // doesn't render (never a fake/zero fallback).
  comparePrice?: number | null
  isBestSeller?: boolean | null
  calories?: number | null
  imageUrl: string | null
  emoji: string | null
  options: unknown
}

export function ProductOptionsModal({
  product, allProducts, recommendationsMap, lang, currency, priceColor, branchId, branchName, onClose, editing,
}: {
  product: ModalProduct
  // Companion recommendations (#3b) — only offered on the "add new item" path
  // (both provided), never while editing an existing cart line (see the
  // `!editing` gate below): editing is about adjusting a line already in the
  // cart, not a moment for discovering something else to add.
  allProducts?: Product[]
  recommendationsMap?: Record<string, string[]>
  lang: Lang
  currency: string
  priceColor: string
  branchId: string
  branchName: string
  onClose: () => void
  // Present only when reopening this modal to edit an existing cart line
  // (Phase 6B) — prefills qty/selections from that line and, on confirm,
  // replaces it in place instead of adding a new one.
  editing?: { cartKey: string; selectedOptions: SelectedOption[]; qty: number }
}) {
  const { addToCart, updateCartItem, removeItem, items } = useCart()
  const strings = t(lang)
  const groups = useMemo(() => normalizeOptionGroups(product.options), [product.options])
  const name = lang === 'en' && product.nameEn ? product.nameEn : product.name
  // Real product.description(_en) only — never invented. Same lang-fallback
  // pattern ProductCard.tsx already uses for the menu-list description.
  const description = lang === 'en' ? product.descriptionEn || product.description : product.description
  const companions = !editing && allProducts && recommendationsMap
    ? getProductCompanions(product.id, allProducts, recommendationsMap)
    : []

  const [qty, setQty] = useState(editing?.qty ?? 1)
  const [selections, setSelections] = useState<OptionSelections>(() => (editing ? selectionsFromResolved(editing.selectedOptions, groups) : {}))
  const [missingGroup, setMissingGroup] = useState<string | null>(null)
  // Guards against a rapid double-tap on Confirm dispatching addToCart/
  // updateCartItem twice before onClose() unmounts this modal.
  const [confirming, setConfirming] = useState(false)
  // "أكمل وجبتك" (companions) shows from the first open whenever valid
  // companions exist for this product — independent of whether the main
  // product itself is in the cart (owner decision: gating visibility on
  // that made the section appear/disappear unpredictably as the customer
  // added/removed the main item). addedOnce still only drives the footer's
  // post-confirm state below, not this section's visibility.
  const [addedOnce, setAddedOnce] = useState(false)
  const showCompanions = !editing && companions.length > 0
  // Each companion's own added/not-added state now reads live from
  // CartContext's `items` (see the render below) instead of a transient
  // per-tap flash — CartContext is the single source of truth for "is this
  // companion in the cart", so it stays correct across reopening this modal,
  // visiting the cart and coming back, or removing the item from the cart
  // sheet itself.
  // Description clamp: a character-count heuristic (not a DOM measurement)
  // decides whether "Show more" even appears — simple and avoids a layout-
  // thrashing ResizeObserver for what is, at most, a 2-line CSS clamp.
  const DESCRIPTION_CLAMP_THRESHOLD = 100
  const [descExpanded, setDescExpanded] = useState(false)
  // Fullscreen single-image viewer — the product only ever has one photo
  // (products.image_url is a single column, not a gallery), so this is a
  // simple full-viewport view of that same photo, not a carousel.
  const [imageExpanded, setImageExpanded] = useState(false)

  // Smart Image Framing (Product Details image) — see lib/smartImageFraming.ts
  // for the full algorithm. In short: the photo's own pixels are analyzed
  // once (cached per URL) to find the real subject's bounding box, trimming
  // large uniform-color margins baked into the source file (internal white
  // space, or letterbox/black bars) — then the subject itself is scaled to
  // fill the available container as much as possible without ever cropping
  // it. Purely content/dimension-driven; no product-specific logic.
  const mediaRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [framing, setFraming] = useState<FramingResult | null>(null)
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null)
  // The media container's own laid-out height before any scroll-shrink is
  // applied (captured once on mount/resize) — the base the shrink below
  // subtracts from, so it never has to duplicate the CSS clamp() that sets
  // that base height in globals.css.
  const [baseMediaHeight, setBaseMediaHeight] = useState<number | null>(null)
  // Product Hero: shrinks gradually as the body scrolls up, so the image
  // never keeps eating screen space once the customer is reading options —
  // same intent as a drag-to-shrink sheet gesture, but implemented against
  // the body's own scroll (the sheet itself doesn't have a resize-by-drag
  // gesture to hook into) so it can't conflict with existing scroll/drag
  // behavior. rAF-throttled: at most one state update per frame.
  const [scrollTop, setScrollTop] = useState(0)
  const rafPending = useRef(false)

  useEffect(() => {
    if (!product.imageUrl) return
    let cancelled = false
    detectContentBox(product.imageUrl).then((result) => { if (!cancelled) setFraming(result) })
    return () => { cancelled = true }
  }, [product.imageUrl])

  useEffect(() => {
    if (!product.imageUrl || !mediaRef.current) return
    const measure = () => {
      const rect = mediaRef.current?.getBoundingClientRect()
      if (!rect) return
      setContainerSize({ w: rect.width, h: rect.height })
      setBaseMediaHeight((prev) => prev ?? rect.height)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [product.imageUrl])

  const SHRINK_RANGE = 90
  const MIN_MEDIA_HEIGHT = 110
  const shrunkMediaHeight = baseMediaHeight != null
    ? Math.max(MIN_MEDIA_HEIGHT, baseMediaHeight - Math.min(scrollTop, SHRINK_RANGE))
    : null

  // Re-measure right after the shrink above changes the container's actual
  // height, so imgStyle (below) keeps placing the photo correctly around
  // its detected subject at the new size — reuses the exact same
  // getBoundingClientRect() read the mount/resize effect already uses,
  // rather than computing a second, parallel size.
  useEffect(() => {
    if (!product.imageUrl || !mediaRef.current || shrunkMediaHeight == null) return
    const rect = mediaRef.current.getBoundingClientRect()
    setContainerSize((prev) => (prev && prev.h === rect.height && prev.w === rect.width ? prev : { w: rect.width, h: rect.height }))
  }, [shrunkMediaHeight, product.imageUrl])

  const handleBodyScroll = () => {
    if (rafPending.current) return
    rafPending.current = true
    requestAnimationFrame(() => {
      rafPending.current = false
      setScrollTop(bodyRef.current?.scrollTop ?? 0)
    })
  }

  // Final placement: scale so the detected content box (not the raw file's
  // own canvas) fills as much of the container as possible while staying
  // fully inside it (never crops the subject), then center that box in the
  // container. Falls back to a plain, unpositioned contain-fit image (the
  // same safe default this component always had) until both the analysis
  // and a real container measurement are ready — this only shows briefly
  // on a genuinely new image; every repeat open of the same photo resolves
  // from cache before the sheet's own open animation even finishes.
  const imgStyle = useMemo(() => {
    if (!framing || !containerSize || !framing.naturalWidth || !framing.naturalHeight) return null
    const { box, naturalWidth: w, naturalHeight: h } = framing
    const bboxW = (box.right - box.left) * w
    const bboxH = (box.bottom - box.top) * h
    if (bboxW <= 0 || bboxH <= 0 || containerSize.w <= 0 || containerSize.h <= 0) return null
    const scale = Math.min(containerSize.w / bboxW, containerSize.h / bboxH)
    const scaledW = w * scale
    const scaledH = h * scale
    const bboxCenterX = ((box.left + box.right) / 2) * w
    const bboxCenterY = ((box.top + box.bottom) / 2) * h
    const left = containerSize.w / 2 - bboxCenterX * scale
    const top = containerSize.h / 2 - bboxCenterY * scale
    return { position: 'absolute' as const, width: scaledW, height: scaledH, left, top, maxWidth: 'none' }
  }, [framing, containerSize])

  // Same WAI-ARIA dialog expectation as the cart sheet and the branch-conflict
  // dialog (Phase 6B accessibility pass) — Escape closes without confirming.
  // While the lightbox is open, Escape closes just that (it's the top-most
  // layer) rather than also dismissing the whole product sheet underneath.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (imageExpanded) { setImageExpanded(false); return }
      onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, imageExpanded])

  const toggleSingle = (gi: number, ci: number) => {
    setSelections((prev) => ({ ...prev, [gi]: ci }))
    setMissingGroup(null)
  }

  const toggleMultiple = (gi: number, ci: number) => {
    setSelections((prev) => {
      const current = Array.isArray(prev[gi]) ? (prev[gi] as number[]) : []
      const next = current.includes(ci) ? current.filter((i) => i !== ci) : [...current, ci]
      return { ...prev, [gi]: next }
    })
    setMissingGroup(null)
  }

  const resolveSelections = (): SelectedOption[] => {
    const resolved: SelectedOption[] = []
    groups.forEach((group, gi) => {
      const sel = selections[gi]
      if (sel == null) return
      if (group.type === 'multiple') {
        (Array.isArray(sel) ? sel : []).forEach((ci) => {
          const choice = group.choices[ci]
          if (choice) resolved.push({ groupName: group.name, choiceName: choice.name, price: choice.price })
        })
      } else {
        const choice = group.choices[sel as number]
        if (choice) resolved.push({ groupName: group.name, choiceName: choice.name, price: choice.price })
      }
    })
    return resolved
  }

  const selected = resolveSelections()
  const unitPrice = product.price + optionsPrice(selected)
  const formatPrice = (n: number) => n.toLocaleString(lang === 'en' ? 'en-US' : 'ar-SA')

  const handleConfirm = () => {
    if (confirming) return
    // Required-group validation — a required "multiple" group only demands at
    // least one choice (the data carries no min/max beyond required/optional,
    // so "at least one" is the only limit that isn't invented); a required
    // "single" group demands exactly the one pick the UI already enforces.
    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi]
      if (!group.required) continue
      const sel = selections[gi]
      const missing = group.type === 'multiple' ? !Array.isArray(sel) || sel.length === 0 : sel == null
      if (missing) { setMissingGroup(group.name); return }
    }
    setConfirming(true)
    const productForCart = { id: product.id, name: product.name, nameEn: product.nameEn, price: product.price, imageUrl: product.imageUrl, emoji: product.emoji }
    if (editing) {
      updateCartItem(editing.cartKey, productForCart, selected, qty)
      onClose()
      return
    }
    const result = addToCart(productForCart, branchId, branchName, selected, qty)
    // A 'conflict' (a different branch is already in the cart) means the
    // product was NOT actually added — BranchConflictModal (rendered by a
    // parent, unchanged here) takes over from here exactly as it already
    // did before this task; showing "added" + companions for something that
    // wasn't added would be wrong, so this still just closes.
    if (result !== 'added') { onClose(); return }
    if (companions.length > 0) {
      setAddedOnce(true)
    } else {
      onClose()
    }
  }

  return (
    <div className="options-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="options-modal" onClick={(e) => e.stopPropagation()}>
        {/* Product image — Smart Image Framing (see lib/smartImageFraming.ts
            for the full algorithm): a bounded-height container regardless
            of the source photo's own dimensions, a softly blurred copy of
            the same photo as a visual-filler backdrop only (never relied on
            to compensate for a small foreground), and the real photo on top
            scaled/centered around its ACTUAL detected subject — not the
            raw file's own canvas — so internal white space or letterbox
            bars baked into the source never make the product look small or
            show visible junk. The subject itself is never cropped. No new
            image, no edit to the source file — every layer is the exact
            same product photo, same URL. Products without a real photo keep
            exactly the same emoji-in-title-row they already had.
            Close/handle/expand sit as overlays ON the photo (the hero is
            meant to dominate the top of the sheet) rather than in a
            separate chrome row above it. */}
        {product.imageUrl ? (
          <div className="options-modal__media" ref={mediaRef} style={shrunkMediaHeight != null ? { height: shrunkMediaHeight } : undefined}>
            <div className="options-modal__media-fill" style={{ backgroundImage: `url(${product.imageUrl})` }} aria-hidden="true" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={product.imageUrl}
              alt={name}
              loading="eager"
              className="options-modal__media-img"
              style={imgStyle ?? undefined}
            />
            <div className="options-modal__handle options-modal__handle--overlay" />
            <button type="button" className="options-modal__close options-modal__close--overlay" onClick={onClose} aria-label="close">✕</button>
            <button type="button" className="options-modal__expand" onClick={() => setImageExpanded(true)} aria-label={strings.expandImage}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="options-modal__no-media-bar">
            <div className="options-modal__handle" />
            <button type="button" className="options-modal__close" onClick={onClose} aria-label="close">✕</button>
          </div>
        )}

        <div className="options-modal__body" ref={bodyRef} onScroll={handleBodyScroll}>
          <div className="options-modal__title-row">
            {!product.imageUrl && (
              <span className="options-modal__emoji" aria-hidden>{product.emoji || '🍽️'}</span>
            )}
            <h3 className="options-modal__name">{name}</h3>
          </div>

          {(product.isBestSeller || (product.comparePrice && product.comparePrice > product.price)) && (
            <div className="options-modal__badges">
              {product.isBestSeller && <span className="options-modal__badge-pill options-modal__badge-pill--best">{strings.badgeBestSeller}</span>}
              {product.comparePrice != null && product.comparePrice > product.price && (
                <span className="options-modal__badge-pill options-modal__badge-pill--offer">{strings.badgeOffer}</span>
              )}
            </div>
          )}

          <div className="options-modal__price-row">
            <span className="options-modal__base-price" style={{ color: priceColor }}>
              {formatPrice(product.price)} {currency}
            </span>
            {product.comparePrice != null && product.comparePrice > product.price && (
              <span className="options-modal__compare-price">{formatPrice(product.comparePrice)} {currency}</span>
            )}
            {product.calories != null && (
              <span className="options-modal__calories">🔥 {product.calories} {strings.calorieUnit}</span>
            )}
          </div>

          {description && (
            <div className="options-modal__description-wrap">
              <p className={`options-modal__description${descExpanded ? '' : ' is-clamped'}`}>{description}</p>
              {description.length > DESCRIPTION_CLAMP_THRESHOLD && (
                <button type="button" className="options-modal__desc-toggle" onClick={() => setDescExpanded((v) => !v)}>
                  {descExpanded ? strings.readLess : strings.readMore}
                </button>
              )}
            </div>
          )}

          {groups.map((group, gi) => (
            <div key={group.name + gi} className="options-modal__group">
              <div className="options-modal__group-header">
                <div className="options-modal__group-heading">
                  <span className="options-modal__group-name">{group.name}</span>
                  <span className="options-modal__group-type">{group.type === 'multiple' ? strings.multiChoiceLabel : strings.singleChoiceLabel}</span>
                </div>
                {group.required
                  ? <span className="options-modal__badge options-modal__badge--required">{strings.optionRequired}</span>
                  : <span className="options-modal__badge">{strings.optionOptional}</span>}
              </div>
              <div
                className="options-modal__choices"
                role={group.type === 'multiple' ? 'group' : 'radiogroup'}
                aria-label={group.name}
                aria-required={group.required}
              >
                {group.choices.map((choice, ci) => {
                  const isSelected = group.type === 'multiple'
                    ? Array.isArray(selections[gi]) && (selections[gi] as number[]).includes(ci)
                    : selections[gi] === ci
                  return (
                    <button
                      type="button"
                      role={group.type === 'multiple' ? 'checkbox' : 'radio'}
                      aria-checked={isSelected}
                      key={choice.name + ci}
                      className={`options-modal__choice${isSelected ? ' is-selected' : ''}`}
                      style={isSelected ? { borderColor: priceColor, background: `${priceColor}14` } : undefined}
                      onClick={() => (group.type === 'multiple' ? toggleMultiple(gi, ci) : toggleSingle(gi, ci))}
                    >
                      <span className={`options-modal__mark${group.type === 'multiple' ? ' options-modal__mark--square' : ''}`} style={isSelected ? { borderColor: priceColor, background: priceColor } : undefined}>
                        {isSelected && '✓'}
                      </span>
                      <span className="options-modal__choice-name">{choice.name}</span>
                      {choice.price > 0 && <span className="options-modal__choice-price" style={{ color: priceColor }}>+{formatPrice(choice.price)} {currency}</span>}
                    </button>
                  )
                })}
              </div>
              {missingGroup === group.name && <span className="checkout-form__error">{strings.optionChooseError}</span>}
            </div>
          ))}

          {showCompanions && (
            <div className="options-modal__companions">
              <div className="options-modal__companions-title">{strings.companionTitle}</div>
              <p className="options-modal__companions-subtitle">{strings.companionSubtitle}</p>
              <div className="options-modal__companions-row">
                {companions.map((p) => {
                  const cName = lang === 'en' && p.name_en ? p.name_en : p.name
                  // A companion is always added with no selectedOptions (see
                  // the onClick below — unchanged from before this task), so
                  // its cart line's key is fully deterministic. Checking
                  // `items` (CartContext's own live list) for that exact key
                  // is what makes this reflect real cart state — reopening
                  // this modal, visiting the cart and coming back, or
                  // removing it from the cart sheet itself all stay correct
                  // automatically, with no separate local "added" flag.
                  const companionCartKey = buildCartKey(p.id, [])
                  const inCart = items.some((i) => i.cartKey === companionCartKey)
                  const media = (
                    <span className="options-modal__companion-media">
                      {p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image_url} alt="" loading="lazy" />
                      ) : (p.emoji || '🍽️')}
                      {!inCart && <span className="options-modal__companion-badge" style={{ background: priceColor }} aria-hidden="true">+</span>}
                    </span>
                  )
                  const info = (
                    <>
                      <span className="options-modal__companion-name">{cName}</span>
                      <span className="options-modal__companion-price" style={{ color: priceColor }}>{formatPrice(p.price)} {currency}</span>
                    </>
                  )
                  // Not in cart: the whole card is the add action (same
                  // touch target as before this task). In cart: the card
                  // itself is no longer a single button (it would otherwise
                  // nest a second, differently-purposed button inside it) —
                  // it becomes a status block with one explicit "إزالة"
                  // action, using CartContext's own existing removeItem(),
                  // not a new remove/delete implementation.
                  return inCart ? (
                    <div key={p.id} className="options-modal__companion is-added">
                      {media}
                      {info}
                      <span className="options-modal__companion-added-label">✓ {strings.companionAdded}</span>
                      <button type="button" className="options-modal__companion-remove" onClick={() => removeItem(companionCartKey)}>
                        {strings.companionRemove}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      key={p.id}
                      className="options-modal__companion"
                      aria-label={`${strings.addToCart}: ${cName}`}
                      onClick={() => addToCart({ id: p.id, name: p.name, nameEn: p.name_en, price: p.price, imageUrl: p.image_url, emoji: p.emoji }, branchId, branchName)}
                    >
                      {media}
                      {info}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="options-modal__footer">
          {addedOnce ? (
            // Replaces qty/confirm entirely once the main product is
            // actually in the cart — matches the brief's mockup exactly
            // (a single confirmation line, not a lingering editable qty for
            // a line that's already committed). Re-adding another unit or
            // changing options now happens the same way any other cart line
            // is edited — from the cart itself (unchanged, existing flow).
            <div className="options-modal__added-bar" role="status">{strings.productAddedConfirmation}</div>
          ) : (
            <>
              <div className="options-modal__qty">
                <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="decrease">−</button>
                <span>{qty}</span>
                <button type="button" onClick={() => setQty((q) => q + 1)} aria-label="increase">+</button>
              </div>
              <button type="button" className="options-modal__confirm" style={{ background: priceColor }} onClick={handleConfirm} disabled={confirming} aria-busy={confirming}>
                <span>{editing ? strings.saveChanges : strings.addToCart}</span>
                <span>{formatPrice(unitPrice * qty)} {currency}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Fullscreen single-photo viewer — same photo, same URL, no gallery
          (products.image_url is one column, not an array); just a bigger,
          unobstructed look at it. Sits above the sheet itself, closes on
          Escape/backdrop/close-button without affecting any selection or
          cart state. */}
      {imageExpanded && product.imageUrl && (
        <div className="options-modal__lightbox" onClick={() => setImageExpanded(false)} role="dialog" aria-modal="true" aria-label={strings.expandImage}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.imageUrl} alt={name} className="options-modal__lightbox-img" />
          <button type="button" className="options-modal__lightbox-close" onClick={() => setImageExpanded(false)} aria-label="close">✕</button>
        </div>
      )}
    </div>
  )
}
