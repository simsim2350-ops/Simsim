'use client'

import { useEffect, useMemo, useState } from 'react'
import type { DemoMenuData, DemoMenuProduct, DemoOptionGroup } from '@/lib/demo-menu'
import { appUrl } from '@/lib/urls'

// نسخة تفاعلية من جهة العميل لمعاينة منيو مطعم العرض التجريبي — منقولة من
// src/components/landing/demo/{InteractiveDemo.jsx,useInteractiveMenu.js} بالموقع القديم، لكن:
// - بلا اشتراك Supabase Realtime (البيانات تُجلب مرة واحدة من الخادم SSR، غير ضروري لعرض تسويقي).
// - بلا واجهة ملء الشاشة/تبديل اللغة (تبسيط مقصود، القسم مضمّن داخل الصفحة لا تطبيق مستقل).
// - «إتمام الطلب» محاكاة محلية بالكامل: لا يستدعي أي API ولا ينشئ أي طلب/بيانات حقيقية — يطابق
//   بالضبط سلوك checkout() الأصلي بالموقع القديم الذي لم يكن يكتب لأي خادم أصلاً.

type CartLine = {
  key: string
  product: DemoMenuProduct
  qty: number
  selections: { groupId: string; itemId: string; name: string; price: number }[]
  unitPrice: number
}

const money = (n: number) => `${n.toFixed(n % 1 ? 2 : 0)} ﷼`

function ProductMedia({ product, className }: { product: DemoMenuProduct; className: string }) {
  return (
    <div className={className}>
      {product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span aria-hidden="true">{product.emoji}</span>}
    </div>
  )
}

function ProductSheet({ product, onAdd, onClose }: { product: DemoMenuProduct; onAdd: (selections: CartLine['selections'], qty: number, unitPrice: number) => void; onClose: () => void }) {
  const [selected, setSelected] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {}
    product.options.forEach((group) => {
      init[group.id] = group.type === 'single' && group.required && group.items[0] ? [group.items[0].id] : []
    })
    return init
  })
  const [qty, setQty] = useState(1)

  const pick = (group: DemoOptionGroup, itemId: string) => {
    setSelected((current) => {
      if (group.type === 'single') return { ...current, [group.id]: [itemId] }
      const has = current[group.id]?.includes(itemId)
      const rest = current[group.id] || []
      return { ...current, [group.id]: has ? rest.filter((id) => id !== itemId) : [...rest, itemId] }
    })
  }

  const chosen = product.options.flatMap((group) =>
    (selected[group.id] || []).map((itemId) => {
      const item = group.items.find((candidate) => candidate.id === itemId)
      return item ? { groupId: group.id, itemId, name: item.name, price: item.price } : null
    }).filter((value): value is CartLine['selections'][number] => Boolean(value)))
  const unitPrice = product.price + chosen.reduce((sum, option) => sum + option.price, 0)

  return (
    <div className="demo-sheet" role="dialog" aria-modal="true" aria-label={product.name}>
      <button type="button" className="demo-sheet__close" onClick={onClose} aria-label="إغلاق">✕</button>
      <ProductMedia product={product} className="demo-sheet__hero" />
      <div className="demo-sheet__body">
        <h4>{product.name}</h4>
        <p className="demo-sheet__price">{money(product.price)}</p>
        {product.desc && <p className="demo-sheet__desc">{product.desc}</p>}
        {product.options.map((group) => (
          <div className="demo-optgroup" key={group.id}>
            <div className="demo-optgroup__label">
              <span>{group.label}</span>
              <span className={`demo-optgroup__req${group.required ? ' is-req' : ''}`}>{group.required ? 'مطلوب' : 'اختياري'}</span>
            </div>
            {group.items.map((item) => {
              const active = (selected[group.id] || []).includes(item.id)
              return (
                <button type="button" key={item.id} className={`demo-opt${active ? ' is-active' : ''}`} onClick={() => pick(group, item.id)}>
                  <span className="demo-opt__mark">{active ? '✓' : ''}</span>
                  <span className="demo-opt__name">{item.name}</span>
                  {item.price > 0 && <span>+{money(item.price)}</span>}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <div className="demo-sheet__foot">
        <div className="demo-stepper" aria-label="الكمية">
          <button type="button" onClick={() => setQty((value) => Math.max(1, value - 1))} aria-label="-">−</button>
          <span>{qty}</span>
          <button type="button" onClick={() => setQty((value) => value + 1)} aria-label="+">+</button>
        </div>
        <button type="button" className="demo-addbtn" onClick={() => { onAdd(chosen, qty, unitPrice); onClose() }}>
          أضف للسلة · {money(unitPrice * qty)}
        </button>
      </div>
    </div>
  )
}

function CartPanel({ cart, onInc, onDec, onRemove, onClose, onCheckout, orderDone, onReset }: {
  cart: CartLine[]; onInc: (key: string) => void; onDec: (key: string) => void; onRemove: (key: string) => void
  onClose: () => void; onCheckout: () => void; orderDone: boolean; onReset: () => void
}) {
  const total = cart.reduce((sum, line) => sum + line.unitPrice * line.qty, 0)

  if (orderDone) {
    return (
      <div className="demo-cart" role="dialog" aria-modal="true" aria-label="تم إضافة الطلب">
        <div className="demo-done">
          <div className="demo-done__ic" aria-hidden="true">✓</div>
          <h4>تمت إضافة طلبك للمعاينة</h4>
          <p>هذا عرض تجريبي فقط — لم يُنشأ أي طلب حقيقي.</p>
          <a href={appUrl('/register')} className="demo-addbtn">أنشئ منيو مطعمك مجاناً 🚀</a>
          <button type="button" className="demo-widget__cartbar" onClick={onReset}>رجوع للمنيو</button>
        </div>
      </div>
    )
  }

  return (
    <div className="demo-cart" role="dialog" aria-modal="true" aria-label="السلة">
      <div className="demo-cart__bar">
        <strong>🛒 السلة</strong>
        <button type="button" className="demo-sheet__close" style={{ position: 'static' }} onClick={onClose} aria-label="إغلاق">✕</button>
      </div>
      {cart.length === 0 ? (
        <div className="demo-cart__empty">
          <span aria-hidden="true" style={{ fontSize: 28 }}>🛒</span>
          <strong>سلتك فارغة</strong>
          <p>أضف أصنافاً لتبدأ طلبك التجريبي</p>
        </div>
      ) : (
        <>
          <div className="demo-cart__list">
            {cart.map((line) => (
              <div className="demo-cart__row" key={line.key}>
                <ProductMedia product={line.product} className="demo-cart__row-thumb" />
                <div className="demo-cart__row-info">
                  <div className="demo-cart__row-name">{line.product.name}</div>
                  {line.selections.length > 0 && <div className="demo-cart__row-opts">{line.selections.map((option) => option.name).join(' · ')}</div>}
                  <div className="demo-cart__row-price">{money(line.unitPrice * line.qty)}</div>
                </div>
                <div className="demo-stepper demo-stepper--sm">
                  <button type="button" onClick={() => onDec(line.key)} aria-label="-">−</button>
                  <span>{line.qty}</span>
                  <button type="button" onClick={() => onInc(line.key)} aria-label="+">+</button>
                </div>
                <button type="button" className="demo-cart__remove" onClick={() => onRemove(line.key)} aria-label="حذف">🗑</button>
              </div>
            ))}
          </div>
          <div className="demo-cart__foot">
            <div className="demo-cart__total"><span>الإجمالي</span><span>{money(total)}</span></div>
            <button type="button" className="demo-addbtn" onClick={onCheckout}>إتمام الطلب · {money(total)}</button>
          </div>
        </>
      )}
    </div>
  )
}

export function InteractiveMenuDemo({ data }: { data: DemoMenuData }) {
  const hasFeatured = data.products.some((product) => product.featured)
  const tabs = useMemo(() => [
    ...(hasFeatured ? [{ id: 'most-ordered', name: 'الأكثر طلبًا 🔥' }] : []),
    ...data.categories,
  ], [hasFeatured, data.categories])

  const [activeCat, setActiveCat] = useState<string | null>(tabs[0]?.id ?? null)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [sheet, setSheet] = useState<DemoMenuProduct | null>(null)
  const [cart, setCart] = useState<CartLine[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [orderDone, setOrderDone] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (sheet) setSheet(null)
      else if (cartOpen) setCartOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet, cartOpen])

  const list = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (query) return data.products.filter((product) => product.name.toLowerCase().includes(query))
    if (activeCat === 'most-ordered') return data.products.filter((product) => product.featured)
    return data.products.filter((product) => product.categoryId === activeCat)
  }, [activeCat, search, data.products])

  const cartCount = cart.reduce((sum, line) => sum + line.qty, 0)

  const addToCart = (selections: CartLine['selections'], qty: number, unitPrice: number, product: DemoMenuProduct) => {
    const key = `${product.id}|${selections.map((option) => option.itemId).sort().join(',')}`
    setCart((current) => {
      const index = current.findIndex((line) => line.key === key)
      if (index >= 0) {
        const next = [...current]
        next[index] = { ...next[index], qty: next[index].qty + qty }
        return next
      }
      return [...current, { key, product, qty, selections, unitPrice }]
    })
  }

  const inc = (key: string) => setCart((lines) => lines.map((line) => line.key === key ? { ...line, qty: line.qty + 1 } : line))
  const dec = (key: string) => setCart((lines) => lines.flatMap((line) => line.key === key ? (line.qty > 1 ? [{ ...line, qty: line.qty - 1 }] : []) : [line]))
  const remove = (key: string) => setCart((lines) => lines.filter((line) => line.key !== key))
  const checkout = () => { if (cart.length) setOrderDone(true) }
  const reset = () => { setCart([]); setOrderDone(false); setCartOpen(false) }

  return (
    <div className="demo-widget" role="group" aria-label={`معاينة تفاعلية لمنيو ${data.restaurantName}`}>
      <div className="demo-widget__head">
        <div>
          <strong>{data.branchName || data.restaurantName}</strong>
          <span className="demo-widget__meta">
            {data.rating ? `⭐ ${data.rating.avg.toFixed(1)} · ` : ''}{data.open ? '🟢 مفتوح الآن' : '🔴 مغلق الآن'}
          </span>
        </div>
        <button type="button" className="demo-widget__searchtoggle" onClick={() => setSearchOpen((value) => !value)} aria-label="بحث">🔍</button>
      </div>

      {searchOpen && (
        <input className="demo-widget__search" autoFocus value={search} placeholder="ابحث في المنيو…"
          onChange={(event) => setSearch(event.target.value)} aria-label="ابحث في المنيو" />
      )}

      {!search && tabs.length > 0 && (
        <div className="demo-widget__tabs" role="tablist">
          {tabs.map((tab) => (
            <button type="button" key={tab.id} role="tab" aria-selected={activeCat === tab.id}
              className={activeCat === tab.id ? 'is-active' : undefined} onClick={() => setActiveCat(tab.id)}>
              {tab.name}
            </button>
          ))}
        </div>
      )}

      <div className="demo-widget__list">
        {list.length === 0 ? (
          <div className="demo-widget__empty">🔍 لا توجد نتائج</div>
        ) : list.map((product) => (
          <button type="button" key={product.id} className="demo-widget__card" onClick={() => setSheet(product)}>
            <ProductMedia product={product} className="demo-widget__thumb" />
            <div className="demo-widget__info">
              <div className="demo-widget__name">{product.name}</div>
              {product.desc && <div className="demo-widget__desc">{product.desc}</div>}
              <div className="demo-widget__bottom">
                <span className="demo-widget__price">{money(product.price)}</span>
                {product.featured && <span className="demo-widget__badge">🔥 الأكثر طلبًا</span>}
              </div>
            </div>
            <span className="demo-widget__add" aria-hidden="true">+</span>
          </button>
        ))}
      </div>

      {cartCount > 0 && !cartOpen && !sheet && (
        <button type="button" className="demo-widget__cartbar" onClick={() => setCartOpen(true)}>
          <span>🛒 السلة · {cartCount}</span>
          <span>{money(cart.reduce((sum, line) => sum + line.unitPrice * line.qty, 0))}</span>
        </button>
      )}

      {sheet && <ProductSheet product={sheet} onAdd={(selections, qty, unitPrice) => addToCart(selections, qty, unitPrice, sheet)} onClose={() => setSheet(null)} />}
      {cartOpen && <CartPanel cart={cart} onInc={inc} onDec={dec} onRemove={remove} onClose={() => setCartOpen(false)} onCheckout={checkout} orderDone={orderDone} onReset={reset} />}
    </div>
  )
}
