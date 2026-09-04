'use client'

import { useEffect, useMemo, useState } from 'react'
import { useCart } from '@/lib/cart/CartContext'
import { normalizeOptionGroups, optionsPrice, selectionsFromResolved, type OptionSelections } from '@/lib/options'
import { t } from '@/lib/i18n'
import type { Lang } from '@/lib/types'
import type { SelectedOption } from '@/lib/cart/types'

type ModalProduct = {
  id: string
  name: string
  nameEn: string | null
  price: number
  imageUrl: string | null
  emoji: string | null
  options: unknown
}

export function ProductOptionsModal({
  product, lang, currency, priceColor, branchId, branchName, onClose, editing,
}: {
  product: ModalProduct
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
  const { addToCart, updateCartItem } = useCart()
  const strings = t(lang)
  const groups = useMemo(() => normalizeOptionGroups(product.options), [product.options])
  const name = lang === 'en' && product.nameEn ? product.nameEn : product.name

  const [qty, setQty] = useState(editing?.qty ?? 1)
  const [selections, setSelections] = useState<OptionSelections>(() => (editing ? selectionsFromResolved(editing.selectedOptions, groups) : {}))
  const [missingGroup, setMissingGroup] = useState<string | null>(null)

  // Same WAI-ARIA dialog expectation as the cart sheet and the branch-conflict
  // dialog (Phase 6B accessibility pass) — Escape closes without confirming.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

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
    const productForCart = { id: product.id, name: product.name, nameEn: product.nameEn, price: product.price, imageUrl: product.imageUrl, emoji: product.emoji }
    if (editing) {
      updateCartItem(editing.cartKey, productForCart, selected, qty)
    } else {
      addToCart(productForCart, branchId, branchName, selected, qty)
    }
    onClose()
  }

  return (
    <div className="options-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="options-modal" onClick={(e) => e.stopPropagation()}>
        <div className="options-modal__handle" />
        <div className="options-modal__header">
          <div className="options-modal__title-row">
            <span className="options-modal__emoji" aria-hidden>{product.emoji || '🍽️'}</span>
            <h3 className="options-modal__name">{name}</h3>
          </div>
          <button type="button" className="options-modal__close" onClick={onClose} aria-label="close">✕</button>
        </div>

        <div className="options-modal__body">
          <div className="options-modal__base-price" style={{ color: priceColor }}>
            {formatPrice(product.price)} {currency}
          </div>

          {groups.map((group, gi) => (
            <div key={group.name + gi} className="options-modal__group">
              <div className="options-modal__group-header">
                <span className="options-modal__group-name">{group.name}</span>
                {group.required
                  ? <span className="options-modal__badge options-modal__badge--required">{strings.optionRequired}</span>
                  : <span className="options-modal__badge">{strings.optionOptional}</span>}
              </div>
              <div className="options-modal__choices">
                {group.choices.map((choice, ci) => {
                  const isSelected = group.type === 'multiple'
                    ? Array.isArray(selections[gi]) && (selections[gi] as number[]).includes(ci)
                    : selections[gi] === ci
                  return (
                    <button
                      type="button"
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
        </div>

        <div className="options-modal__footer">
          <div className="options-modal__qty">
            <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="decrease">−</button>
            <span>{qty}</span>
            <button type="button" onClick={() => setQty((q) => q + 1)} aria-label="increase">+</button>
          </div>
          <button type="button" className="options-modal__confirm" style={{ background: priceColor }} onClick={handleConfirm}>
            <span>{editing ? strings.saveChanges : strings.addToCart}</span>
            <span>{formatPrice(unitPrice * qty)} {currency}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
