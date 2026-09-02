'use client'

import { useEffect, useMemo, useState } from 'react'
import type { DemoMenuData, DemoMenuProduct, DemoOptionGroup } from '@/lib/demo-menu'
import { appUrl } from '@/lib/urls'

// نسخة تفاعلية من جهة العميل لمعاينة منيو مطعم العرض التجريبي — منقولة حرفياً (بنية/كلاسات
// ss-demo__*/سلوك) من src/components/landing/demo/{InteractiveDemo.jsx,useInteractiveMenu.js}
// بالموقع القديم، فيما عدا هذين التكيّفين التقنيين الضروريين لسياق تسويقي CMS-driven:
// - بلا اشتراك Supabase Realtime (البيانات تُجلب مرة واحدة من الخادم SSR).
// - بلا تبديل لغة داخلي (الموقع أصلاً مُقسَّم بمسارات /ar و/en منفصلة على مستوى Next.js).
// وضع ملء الشاشة (is-full) منقول بالكامل من الأصل، لكن بزر تفعيل ذاتي داخل رأس الودجت
// (ss-demo__expand) بدل controllerRef خارجي — الودجت هنا مضمّن مباشرة بلا مُتحكِّم أب مخصص.
// «إتمام الطلب» محاكاة محلية بالكامل: لا يستدعي أي API ولا ينشئ أي طلب حقيقي — يطابق تماماً
// سلوك checkout() الأصلي الذي لم يكن يكتب لأي خادم أصلاً.

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
    <div className="ss-demo__sheet" role="dialog" aria-modal="true" aria-label={product.name}>
      <button type="button" className="ss-demo__sheet-close" onClick={onClose} aria-label="إغلاق">✕</button>
      <ProductMedia product={product} className="ss-demo__sheet-hero" />
      <div className="ss-demo__sheet-body">
        <div className="ss-demo__sheet-head">
          <h4>{product.name}</h4>
          <span className="ss-demo__sheet-price">{money(product.price)}</span>
        </div>
        {product.desc && <p className="ss-demo__sheet-desc">{product.desc}</p>}
        {product.options.map((group) => (
          <div className="ss-demo__optgroup" key={group.id}>
            <div className="ss-demo__optlabel">
              <span>{group.label}</span>
              <span className={`ss-demo__optreq${group.required ? ' is-req' : ''}`}>{group.required ? 'مطلوب' : 'اختياري'}</span>
            </div>
            {group.items.map((item) => {
              const active = (selected[group.id] || []).includes(item.id)
              return (
                <button type="button" key={item.id} className={`ss-demo__opt${active ? ' is-active' : ''}`} onClick={() => pick(group, item.id)}>
                  <span className={`ss-demo__optmark${group.type === 'single' ? ' is-radio' : ''}`}>{active ? '✓' : ''}</span>
                  <span className="ss-demo__optname">{item.name}</span>
                  {item.price > 0 && <span className="ss-demo__optprice">+{money(item.price)}</span>}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <div className="ss-demo__sheet-foot">
        <div className="ss-demo__stepper" aria-label="الكمية">
          <button type="button" onClick={() => setQty((value) => Math.max(1, value - 1))} aria-label="-">−</button>
          <span>{qty}</span>
          <button type="button" onClick={() => setQty((value) => value + 1)} aria-label="+">+</button>
        </div>
        <button type="button" className="ss-demo__addbtn" onClick={() => { onAdd(chosen, qty, unitPrice); onClose() }}>
          أضف للسلة · {money(unitPrice * qty)}
        </button>
      </div>
    </div>
  )
}

function CartSheet({ cart, onInc, onDec, onRemove, onClose, onCheckout, orderDone, onReset }: {
  cart: CartLine[]; onInc: (key: string) => void; onDec: (key: string) => void; onRemove: (key: string) => void
  onClose: () => void; onCheckout: () => void; orderDone: boolean; onReset: () => void
}) {
  const total = cart.reduce((sum, line) => sum + line.unitPrice * line.qty, 0)

  if (orderDone) {
    return (
      <div className="ss-demo__sheet ss-demo__sheet--cart" role="dialog" aria-modal="true" aria-label="تمت إضافة الطلب">
        <div className="ss-demo__done">
          <div className="ss-demo__done-ic" aria-hidden="true">✓</div>
          <h4>تمت إضافة طلبك للمعاينة</h4>
          <p>هذا عرض تجريبي فقط، لم يُنشأ أي طلب حقيقي.</p>
          <a href={appUrl('/register')} className="ss-demo__cta-full">أنشئ منيو مطعمك مجاناً 🚀</a>
          <button type="button" className="ss-demo__ghost" onClick={onReset}>رجوع للمنيو</button>
        </div>
      </div>
    )
  }

  return (
    <div className="ss-demo__sheet ss-demo__sheet--cart" role="dialog" aria-modal="true" aria-label="السلة">
      <div className="ss-demo__sheet-bar">
        <strong>🛒 السلة</strong>
        <button type="button" className="ss-demo__sheet-close is-inline" onClick={onClose} aria-label="إغلاق">✕</button>
      </div>
      {cart.length === 0 ? (
        <div className="ss-demo__empty">
          <span aria-hidden="true">🛒</span>
          <strong>سلتك فارغة</strong>
          <p>أضف أصنافاً لتبدأ طلبك</p>
        </div>
      ) : (
        <>
          <div className="ss-demo__cartlist">
            {cart.map((line) => (
              <div className="ss-demo__cartrow" key={line.key}>
                <ProductMedia product={line.product} className="ss-demo__cartthumb" />
                <div className="ss-demo__cartinfo">
                  <div className="ss-demo__cartname">{line.product.name}</div>
                  {line.selections.length > 0 && <div className="ss-demo__cartopts">{line.selections.map((option) => option.name).join(' · ')}</div>}
                  <div className="ss-demo__cartprice">{money(line.unitPrice * line.qty)}</div>
                </div>
                <div className="ss-demo__cartqty">
                  <div className="ss-demo__stepper ss-demo__stepper--sm">
                    <button type="button" onClick={() => onDec(line.key)} aria-label="-">−</button>
                    <span>{line.qty}</span>
                    <button type="button" onClick={() => onInc(line.key)} aria-label="+">+</button>
                  </div>
                  <button type="button" className="ss-demo__remove" onClick={() => onRemove(line.key)} aria-label="حذف">🗑</button>
                </div>
              </div>
            ))}
          </div>
          <div className="ss-demo__cartfoot">
            <div className="ss-demo__totalrow"><span>الإجمالي</span><span>{money(total)}</span></div>
            <button type="button" className="ss-demo__addbtn ss-demo__addbtn--wide" onClick={onCheckout}>إتمام الطلب · {money(total)}</button>
          </div>
        </>
      )}
    </div>
  )
}

function MenuApp({ data, tabs, activeCat, setActiveCat, search, setSearch, searchOpen, setSearchOpen, list, cartCount, cartTotal, setCartOpen, cartOpen, sheet, setSheet }: {
  data: DemoMenuData; tabs: { id: string; name: string }[]; activeCat: string | null; setActiveCat: (id: string) => void
  search: string; setSearch: (value: string) => void; searchOpen: boolean; setSearchOpen: (fn: (value: boolean) => boolean) => void
  list: DemoMenuProduct[]; cartCount: number; cartTotal: number; setCartOpen: (value: boolean) => void; cartOpen: boolean; sheet: DemoMenuProduct | null
  setSheet: (product: DemoMenuProduct | null) => void
}) {
  return (
    <div className="ss-demo__app">
      <div
        className="ss-demo__cover"
        style={data.coverUrl ? { backgroundImage: `linear-gradient(180deg, rgba(11,11,15,.18), rgba(11,11,15,.56)), url("${data.coverUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: 'var(--ss-primary)' }}
      >
        <div className="ss-demo__cover-top">
          {data.branchName ? <span className="ss-demo__chip">✦ {data.branchName}</span> : <span />}
          <div className="ss-demo__cover-actions">
            <button type="button" className="ss-demo__iconbtn" onClick={() => setSearchOpen((value) => !value)} aria-label="بحث">🔍</button>
          </div>
        </div>
        <div className="ss-demo__rest">
          <div className="ss-demo__logo"><span aria-hidden="true">{data.restaurantName?.slice(0, 1)}</span></div>
          <div>
            <div className="ss-demo__restname">{data.restaurantName}</div>
          </div>
        </div>
        <div className="ss-demo__restmeta">
          {data.rating && <><span>⭐ {data.rating.avg.toFixed(1)} <i>({data.rating.count})</i></span><span className="ss-demo__dotsep" /></>}
          <span>{data.open ? '🟢' : '🔴'} {data.open ? 'مفتوح الآن' : 'مغلق الآن'}</span>
        </div>
      </div>

      {searchOpen && (
        <div className="ss-demo__searchwrap">
          <input className="ss-demo__search" autoFocus value={search} placeholder="ابحث في المنيو…"
            onChange={(event) => setSearch(event.target.value)} aria-label="ابحث في المنيو" />
          {search && <button type="button" className="ss-demo__searchx" onClick={() => setSearch('')} aria-label="إغلاق">✕</button>}
        </div>
      )}

      {!search && tabs.length > 0 && (
        <div className="ss-demo__tabs" role="tablist">
          {tabs.map((tab) => (
            <button type="button" key={tab.id} role="tab" aria-selected={activeCat === tab.id}
              className={`ss-demo__tab${activeCat === tab.id ? ' is-active' : ''}`} onClick={() => setActiveCat(tab.id)}>
              {tab.name}
            </button>
          ))}
        </div>
      )}

      <div className="ss-demo__list">
        {list.length === 0 ? (
          <div className="ss-demo__noresults">🔍 لا توجد نتائج</div>
        ) : list.map((product) => (
          <button type="button" key={product.id} className="ss-demo__card" onClick={() => setSheet(product)}>
            <ProductMedia product={product} className="ss-demo__cardthumb" />
            <div className="ss-demo__cardinfo">
              <div className="ss-demo__cardname">{product.name}</div>
              {product.desc && <div className="ss-demo__carddesc">{product.desc}</div>}
              <div className="ss-demo__cardbottom">
                <span className="ss-demo__cardprice">{money(product.price)}</span>
                {product.featured && <span className="ss-demo__cardbadge">🔥 الأكثر طلبًا</span>}
              </div>
            </div>
            <span className="ss-demo__cardadd" aria-hidden="true">+</span>
          </button>
        ))}
      </div>

      {cartCount > 0 && !cartOpen && !sheet && (
        <button type="button" className="ss-demo__cartbar" onClick={() => setCartOpen(true)}>
          <span className="ss-demo__cartbadge">{cartCount}</span>
          <span className="ss-demo__cartbar-label">السلة</span>
          <span className="ss-demo__cartbar-total">{money(cartTotal)}</span>
        </button>
      )}
    </div>
  )
}

export function InteractiveMenuDemo({ data, full: controlledFull, onFullChange }: { data: DemoMenuData; full?: boolean; onFullChange?: (value: boolean) => void }) {
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
  const [localFull, setLocalFull] = useState(false)
  // يُتحكَّم بوضع ملء الشاشة من الأب (زر «فتح المنيو كامل الشاشة» بجانب الودجت، كما بالموقع
  // القديم عبر controllerRef) إن مُرِّرت الخصائص، وإلا يدير الودجت حالته الداخلية بنفسه.
  const full = controlledFull ?? localFull
  const setFull = onFullChange ?? setLocalFull

  useEffect(() => {
    document.body.style.overflow = full ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [full])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (sheet) setSheet(null)
      else if (cartOpen) setCartOpen(false)
      else if (full) setFull(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet, cartOpen, full])

  const list = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (query) return data.products.filter((product) => product.name.toLowerCase().includes(query))
    if (activeCat === 'most-ordered') return data.products.filter((product) => product.featured)
    return data.products.filter((product) => product.categoryId === activeCat)
  }, [activeCat, search, data.products])

  const cartCount = cart.reduce((sum, line) => sum + line.qty, 0)
  const cartTotal = cart.reduce((sum, line) => sum + line.unitPrice * line.qty, 0)

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
    <div className={`ss-demo-holder${full ? ' is-full' : ''}`}>
      <div className="ss-demo__backdrop" onClick={() => setFull(false)} aria-hidden={!full} />
      <div className="ss-demo" role="group" aria-label={`معاينة تفاعلية لمنيو ${data.restaurantName}`}>
        <div className="ss-demo__screen">
          {!full && (
            <button type="button" className="ss-demo__expand" onClick={() => setFull(true)} aria-label="ملء الشاشة">⤢</button>
          )}
          <MenuApp
            data={data} tabs={tabs} activeCat={activeCat} setActiveCat={setActiveCat}
            search={search} setSearch={setSearch} searchOpen={searchOpen} setSearchOpen={setSearchOpen}
            list={list} cartCount={cartCount} cartTotal={cartTotal} setCartOpen={setCartOpen} cartOpen={cartOpen} sheet={sheet} setSheet={setSheet}
          />
          {sheet && <button type="button" className="ss-demo__scrim" onClick={() => setSheet(null)} aria-label="إغلاق" />}
          {sheet && <ProductSheet product={sheet} onAdd={(selections, qty, unitPrice) => addToCart(selections, qty, unitPrice, sheet)} onClose={() => setSheet(null)} />}
          {cartOpen && <button type="button" className="ss-demo__scrim" onClick={() => setCartOpen(false)} aria-label="إغلاق" />}
          {cartOpen && <CartSheet cart={cart} onInc={inc} onDec={dec} onRemove={remove} onClose={() => setCartOpen(false)} onCheckout={checkout} orderDone={orderDone} onReset={reset} />}
        </div>
        {full && <button type="button" className="ss-demo__exit" onClick={() => setFull(false)} aria-label="إغلاق">✕</button>}
      </div>
    </div>
  )
}
