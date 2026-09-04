'use client'

import { useEffect } from 'react'
import { useCart } from '@/lib/cart/CartContext'
import { t } from '@/lib/i18n'
import type { Lang } from '@/lib/types'

// Rendered exactly once (in the [slug] layout, alongside CartProvider) — not
// per product card. Global cart state (conflict) is shared across every
// AddToCartButton instance, so the overlay itself must be singular too.
export function BranchConflictModal({ lang }: { lang: Lang }) {
  const { conflict, resolveConflictKeepNewBranch, cancelConflict } = useCart()
  const strings = t(lang)

  // Escape maps to the same safe choice the Cancel button makes (keep the
  // existing cart, don't switch branches) — never to the destructive confirm
  // action, matching the WAI-ARIA alertdialog convention (Phase 6B pass).
  useEffect(() => {
    if (!conflict) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelConflict() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [conflict, cancelConflict])

  if (!conflict) return null
  return (
    <div className="branch-conflict-overlay" role="alertdialog" aria-modal="true">
      <div className="branch-conflict-card">
        <div className="branch-conflict-title">{strings.branchConflictTitle}</div>
        <div className="branch-conflict-body">{strings.branchConflictBody(conflict.cartBranchName)}</div>
        <div className="branch-conflict-actions">
          <button type="button" className="branch-conflict-cancel" onClick={() => cancelConflict()}>{strings.branchConflictCancel}</button>
          <button type="button" className="branch-conflict-confirm" onClick={() => resolveConflictKeepNewBranch()}>{strings.branchConflictConfirm}</button>
        </div>
      </div>
    </div>
  )
}
