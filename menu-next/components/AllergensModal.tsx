'use client'

import { useEffect } from 'react'
import type { Allergen, Lang } from '@/lib/types'
import { t } from '@/lib/i18n'

// Bottom-sheet, data-driven from restaurant.allergens — same shape/behavior as
// the old menu's AllergensModal.jsx (string or {label, label_en, icon} entries).
export function AllergensModal({ open, onClose, allergens, lang }: {
  open: boolean
  onClose: () => void
  allergens: Allergen[] | null
  lang: Lang
}) {
  const strings = t(lang)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const items = (Array.isArray(allergens) ? allergens : [])
    .map((a) => {
      if (a == null) return null
      const item = typeof a === 'string' ? { label: a, icon: '⚠️' } : a
      const label = item.label || item.name || (typeof a === 'string' ? a : '')
      if (!label) return null
      const shown = lang === 'en' && item.label_en ? item.label_en : label
      return { shown, icon: item.icon || '⚠️' }
    })
    .filter((x): x is { shown: string; icon: string } => x !== null)

  return (
    <div className="allergens-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="allergens-modal" onClick={(e) => e.stopPropagation()}>
        <div className="options-modal__handle" />
        <h3 className="allergens-modal__title">⚠️ {strings.allergens}</h3>
        <p className="allergens-modal__desc">{strings.allergensDesc}</p>
        <div className="allergens-modal__list">
          {items.map((item, i) => (
            <div key={i} className="allergens-modal__item">
              <span aria-hidden>{item.icon}</span>
              <span>{item.shown}</span>
            </div>
          ))}
        </div>
        <button type="button" className="allergens-modal__close-btn" onClick={onClose}>{strings.close}</button>
      </div>
    </div>
  )
}
