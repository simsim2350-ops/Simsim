'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useCart } from '@/lib/cart/CartContext'
import { t } from '@/lib/i18n'
import type { Lang, Product } from '@/lib/types'
import { hasSelectableOptions } from '@/lib/options'
import { ProductOptionsModal } from './ProductOptionsModal'
import type { CartItem } from '@/lib/cart/types'

export function CartWidget({ lang, currency, priceColor, branchId, slug, products, tableToken }: { lang: Lang; currency: string; priceColor: string; branchId: string; slug: string; products: Product[]; tableToken?: string }) {
  const { items, count, subtotal, increment, decrement, removeItem } = useCart()
  const [open, setOpen] = useState(false)
  // The cart line currently being edited (Phase 6B) — reopens
  // ProductOptionsModal prefilled with that line's own selections/qty, using
  // the product's real, current option groups looked up from the already
  // server-fetched `products` list (no extra fetch, no new client request).
  const [editingItem, setEditingItem] = useState<CartItem | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (count === 0) return null

  const formatPrice = (n: number) => n.toLocaleString(lang === 'en' ? 'en-US' : 'ar-SA')
  // Absolute path — a relative "checkout" resolves against the URL's last
  // path *segment*, not the route's directory, so from /menu/simsim it would
  // resolve to /menu/simsim/checkout instead of /menu/checkout. Verified with
  // a real click-through during testing, not assumed.
  const checkoutHref = `/menu/${slug}/checkout?${new URLSearchParams({ branch: branchId, ...(lang === 'en' ? { lang: 'en' } : {}), ...(tableToken ? { table: tableToken } : {}) }).toString()}`

  const editingProduct = editingItem ? products.find((p) => p.id === editingItem.productId) : null

  return (
    <>
      <button type="button" className="cart-bar" style={{ background: priceColor }} onClick={() => setOpen(true)}>
        <span className="cart-bar__count">{count}</span>
        <span className="cart-bar__label">{t(lang).cartYours}</span>
        <span className="cart-bar__subtotal">{formatPrice(subtotal)} {currency}</span>
      </button>

      {open && (
        <div className="cart-sheet-overlay" onClick={() => setOpen(false)} role="dialog" aria-modal="true">
          <div className="cart-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="cart-sheet__handle" />
            <div className="cart-sheet__header">
              <h3>{t(lang).cartYours} ({count})</h3>
              <button type="button" className="cart-sheet__close" onClick={() => setOpen(false)} aria-label="close">✕</button>
            </div>
            <div className="cart-sheet__items">
              {items.map((item) => {
                const name = lang === 'en' && item.nameEn ? item.nameEn : item.name
                const optsText = item.selectedOptions.map((o) => o.choiceName).filter(Boolean).join(lang === 'en' ? ', ' : '، ')
                // Editing needs the product's real, current option groups —
                // only offered when that product is still on this branch's
                // menu and still actually has selectable options today.
                const canEdit = item.selectedOptions.length > 0 && products.some((p) => p.id === item.productId && hasSelectableOptions(p.options))
                return (
                  <div key={item.cartKey} className="cart-sheet__item">
                    <div className="cart-sheet__item-media">
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.imageUrl} alt="" loading="lazy" />
                      ) : (
                        <span aria-hidden>{item.emoji || '🍽️'}</span>
                      )}
                    </div>
                    <div className="cart-sheet__item-body">
                      <div className="cart-sheet__item-name-row">
                        <span className="cart-sheet__item-name">{name}</span>
                        {canEdit && (
                          <button type="button" className="cart-sheet__edit" onClick={() => setEditingItem(item)} aria-label={`${t(lang).editItem}: ${name}`}>
                            {t(lang).editItem}
                          </button>
                        )}
                      </div>
                      {optsText && <div className="cart-sheet__item-options">{optsText}</div>}
                      <div className="cart-sheet__item-price">{formatPrice(item.price)} {currency}</div>
                    </div>
                    <div className="cart-sheet__stepper">
                      <button type="button" onClick={() => decrement(item.cartKey)} aria-label="decrease">−</button>
                      <span>{item.qty}</span>
                      <button type="button" onClick={() => increment(item.cartKey)} aria-label="increase">+</button>
                    </div>
                    <button type="button" className="cart-sheet__remove" onClick={() => removeItem(item.cartKey)} aria-label="remove">🗑</button>
                  </div>
                )
              })}
            </div>
            <div className="cart-sheet__summary">
              <div className="cart-sheet__summary-row">
                <span>{t(lang).subtotal}</span>
                <span>{formatPrice(subtotal)} {currency}</span>
              </div>
            </div>
            <Link href={checkoutHref} className="cart-sheet__checkout-btn" style={{ background: priceColor }} onClick={() => setOpen(false)}>
              {t(lang).goToCheckout}
            </Link>
          </div>
        </div>
      )}

      {editingItem && editingProduct && (
        <ProductOptionsModal
          product={{ id: editingProduct.id, name: editingProduct.name, nameEn: editingProduct.name_en, price: editingProduct.price, imageUrl: editingProduct.image_url, emoji: editingProduct.emoji, options: editingProduct.options }}
          lang={lang}
          currency={currency}
          priceColor={priceColor}
          branchId={branchId}
          branchName=""
          editing={{ cartKey: editingItem.cartKey, selectedOptions: editingItem.selectedOptions, qty: editingItem.qty }}
          onClose={() => setEditingItem(null)}
        />
      )}
    </>
  )
}
