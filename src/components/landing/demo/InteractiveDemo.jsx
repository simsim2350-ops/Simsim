import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import useDemoMenu from './useDemoMenu'
import { DEMO_RESTAURANT, DEMO_CATEGORIES } from './demoData'

const money = (n) => `${Number(n).toFixed(n % 1 ? 2 : 0)} ﷼`

/* ------------------------- نافذة تفاصيل المنتج ------------------------- */
function ProductSheet({ product, lang, t, onAdd, onClose }) {
  // تهيئة الخيارات: كل مجموعة single مطلوبة تبدأ بأول عنصر
  const [sel, setSel] = useState(() => {
    const init = {}
    ;(product.options || []).forEach((g) => {
      if (g.type === 'single') init[g.id] = g.required ? [g.items[0].id] : []
      else init[g.id] = []
    })
    return init
  })
  const [qty, setQty] = useState(1)

  const pick = (g, itemId) => setSel((s) => {
    if (g.type === 'single') return { ...s, [g.id]: [itemId] }
    const has = s[g.id].includes(itemId)
    return { ...s, [g.id]: has ? s[g.id].filter((x) => x !== itemId) : [...s[g.id], itemId] }
  })

  const chosen = (product.options || []).flatMap((g) =>
    sel[g.id].map((itemId) => {
      const it = g.items.find((x) => x.id === itemId)
      return { groupId: g.id, itemId, name: it.name, price: it.price }
    }))
  const unit = product.price + chosen.reduce((s, o) => s + o.price, 0)

  return (
    <div className="ss-demo__sheet" role="dialog" aria-modal="true" aria-label={product.name[lang]}>
      <button className="ss-demo__sheet-close" onClick={onClose} aria-label={t.close}>✕</button>
      <div className="ss-demo__sheet-hero" style={{ background: product.grad }}>
        <span aria-hidden="true">{product.emoji}</span>
        {product.best && <span className="ss-demo__hot">🔥 {t.best}</span>}
      </div>
      <div className="ss-demo__sheet-body">
        <div className="ss-demo__sheet-head">
          <h4>{product.name[lang]}</h4>
          <span className="ss-demo__sheet-price">{money(product.price)}</span>
        </div>
        <p className="ss-demo__sheet-desc">{product.desc[lang]}</p>
        <span className="ss-demo__cal">🔥 {product.calories} {t.cal}</span>

        {(product.options || []).map((g) => (
          <div className="ss-demo__optgroup" key={g.id}>
            <div className="ss-demo__optlabel">
              {g.label[lang]}
              <span className={`ss-demo__optreq ${g.required ? 'is-req' : ''}`}>{g.required ? t.required : t.optional}</span>
            </div>
            {g.items.map((it) => {
              const active = sel[g.id].includes(it.id)
              return (
                <button type="button" key={it.id} className={`ss-demo__opt ${active ? 'is-active' : ''}`} onClick={() => pick(g, it.id)}>
                  <span className={`ss-demo__optmark ${g.type === 'single' ? 'is-radio' : ''}`}>{active ? '✓' : ''}</span>
                  <span className="ss-demo__optname">{it.name[lang]}</span>
                  {it.price > 0 && <span className="ss-demo__optprice">+{money(it.price)}</span>}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      <div className="ss-demo__sheet-foot">
        <div className="ss-demo__stepper" aria-label={t.qty}>
          <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="-">−</button>
          <span>{qty}</span>
          <button onClick={() => setQty((q) => q + 1)} aria-label="+">+</button>
        </div>
        <button className="ss-demo__addbtn" onClick={() => { onAdd(product, chosen, qty); onClose() }}>
          {t.addToCart} · {money(unit * qty)}
        </button>
      </div>
    </div>
  )
}

/* ------------------------- سلة الديمو ------------------------- */
function CartSheet({ m }) {
  const { t, lang, cart, cartTotal, points, inc, dec, removeItem, checkout, orderDone, resetOrder, setCartOpen } = m

  if (orderDone) {
    return (
      <div className="ss-demo__sheet ss-demo__sheet--cart" role="dialog" aria-modal="true" aria-label={t.orderDone}>
        <div className="ss-demo__done">
          <div className="ss-demo__done-ic" aria-hidden="true">✓</div>
          <h4>{t.orderDone}</h4>
          <p>{t.orderDoneSub}</p>
          <span className="ss-demo__done-pts">🎁 +{points} {t.points}</span>
          <Link to="/register" className="ss-demo__cta-full">{t.startFree} 🚀</Link>
          <button className="ss-demo__ghost" onClick={resetOrder}>{t.backToMenu}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="ss-demo__sheet ss-demo__sheet--cart" role="dialog" aria-modal="true" aria-label={t.cart}>
      <div className="ss-demo__sheet-bar">
        <strong>🛒 {t.cart}</strong>
        <button className="ss-demo__sheet-close is-inline" onClick={() => setCartOpen(false)} aria-label={t.close}>✕</button>
      </div>

      {cart.length === 0 ? (
        <div className="ss-demo__empty">
          <span aria-hidden="true">🛒</span>
          <strong>{t.empty}</strong>
          <p>{t.emptyHint}</p>
        </div>
      ) : (
        <>
          <div className="ss-demo__cartlist">
            {cart.map((i) => (
              <div className="ss-demo__cartrow" key={i.key}>
                <div className="ss-demo__cartthumb" style={{ background: i.product.grad }} aria-hidden="true">{i.product.emoji}</div>
                <div className="ss-demo__cartinfo">
                  <div className="ss-demo__cartname">{i.product.name[lang]}</div>
                  {i.opts.length > 0 && <div className="ss-demo__cartopts">{i.opts.map((o) => o.name[lang]).join(' · ')}</div>}
                  <div className="ss-demo__cartprice">{money(i.unitPrice * i.qty)}</div>
                </div>
                <div className="ss-demo__cartqty">
                  <div className="ss-demo__stepper ss-demo__stepper--sm">
                    <button onClick={() => dec(i.key)} aria-label="-">−</button>
                    <span>{i.qty}</span>
                    <button onClick={() => inc(i.key)} aria-label="+">+</button>
                  </div>
                  <button className="ss-demo__remove" onClick={() => removeItem(i.key)} aria-label="حذف">🗑</button>
                </div>
              </div>
            ))}
          </div>

          <div className="ss-demo__cartfoot">
            <div className="ss-demo__earn">🎁 {t.earnHint} <b>+{points} {t.points}</b></div>
            <div className="ss-demo__totalrow"><span>{t.total}</span><span>{money(cartTotal)}</span></div>
            <button className="ss-demo__addbtn ss-demo__addbtn--wide" onClick={checkout}>{t.checkout} · {money(cartTotal)}</button>
          </div>
        </>
      )}
    </div>
  )
}

/* ------------------------- تطبيق المنيو (الشاشة) ------------------------- */
function MenuApp({ m }) {
  const {
    lang, setLang, t, activeCat, setActiveCat, search, setSearch, searchOpen, setSearchOpen,
    list, cartCount, cartTotal, bump, addToCart, sheet, setSheet, cartOpen, setCartOpen,
  } = m
  const r = DEMO_RESTAURANT
  const listRef = useRef(null)

  // عند تبديل القسم: تمرير القائمة لأعلى
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = 0 }, [activeCat, search])

  return (
    <div className="ss-demo__app">
      {/* رأس المطعم */}
      <div className="ss-demo__cover" style={{ background: r.cover }}>
        <div className="ss-demo__cover-top">
          <span className="ss-demo__chip">✦ {t.demo}</span>
          <div className="ss-demo__cover-actions">
            <button className="ss-demo__iconbtn" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} aria-label="language">
              {lang === 'ar' ? 'EN' : 'ع'}
            </button>
            <button className="ss-demo__iconbtn" onClick={() => setSearchOpen((s) => !s)} aria-label={t.search}>🔍</button>
          </div>
        </div>
        <div className="ss-demo__rest">
          <div className="ss-demo__logo" aria-hidden="true">🍔</div>
          <div>
            <div className="ss-demo__restname">{r.name[lang]}</div>
            <div className="ss-demo__resttag">{r.tagline[lang]}</div>
          </div>
        </div>
        <div className="ss-demo__restmeta">
          <span>⭐ {r.rating} <i>({r.reviews})</i></span>
          <span className="ss-demo__dotsep" />
          <span>🟢 {t.open}</span>
          <span className="ss-demo__dotsep" />
          <span>🕒 {r.time[lang]}</span>
        </div>
      </div>

      {/* بحث */}
      {searchOpen && (
        <div className="ss-demo__searchwrap">
          <input className="ss-demo__search" autoFocus value={search} placeholder={t.search}
            onChange={(e) => setSearch(e.target.value)} aria-label={t.search} />
          {search && <button className="ss-demo__searchx" onClick={() => setSearch('')} aria-label={t.close}>✕</button>}
        </div>
      )}

      {/* تبويبات الأقسام */}
      {!search && (
        <div className="ss-demo__tabs" role="tablist">
          {DEMO_CATEGORIES.map((c) => (
            <button key={c.id} role="tab" aria-selected={activeCat === c.id}
              className={`ss-demo__tab ${activeCat === c.id ? 'is-active' : ''}`}
              onClick={() => setActiveCat(c.id)}>
              <span aria-hidden="true">{c.icon}</span> {c.name[lang]}
            </button>
          ))}
        </div>
      )}

      {/* قائمة المنتجات */}
      <div className="ss-demo__list" ref={listRef}>
        {list.length === 0 ? (
          <div className="ss-demo__noresults">🔍 {t.noResults}</div>
        ) : list.map((p) => (
          <button key={p.id} className="ss-demo__card" onClick={() => setSheet(p)}>
            <div className="ss-demo__cardthumb" style={{ background: p.grad }} aria-hidden="true">{p.emoji}</div>
            <div className="ss-demo__cardinfo">
              <div className="ss-demo__cardname">{p.name[lang]}</div>
              <div className="ss-demo__carddesc">{p.desc[lang]}</div>
              <div className="ss-demo__cardbottom">
                <span className="ss-demo__cardprice">{money(p.price)}</span>
                {p.best && <span className="ss-demo__cardbadge">🔥 {t.best}</span>}
              </div>
            </div>
            <span className="ss-demo__cardadd" aria-hidden="true">+</span>
          </button>
        ))}
      </div>

      {/* شريط السلة العائم */}
      {cartCount > 0 && !cartOpen && !sheet && (
        <button className="ss-demo__cartbar" onClick={() => setCartOpen(true)}>
          <span key={bump} className="ss-demo__cartbadge">{cartCount}</span>
          <span className="ss-demo__cartbar-label">{t.cart}</span>
          <span className="ss-demo__cartbar-total">{money(cartTotal)}</span>
        </button>
      )}

      {/* الطبقات */}
      {sheet && <div className="ss-demo__scrim" onClick={() => setSheet(null)} />}
      {sheet && <ProductSheet product={sheet} lang={lang} t={t} onAdd={addToCart} onClose={() => setSheet(null)} />}
      {cartOpen && <div className="ss-demo__scrim" onClick={() => setCartOpen(false)} />}
      {cartOpen && <CartSheet m={m} />}
    </div>
  )
}

/* ------------------------- الغلاف (هاتف مدمج / ملء الشاشة) ------------------------- */
export default function InteractiveDemo({ controllerRef }) {
  const m = useDemoMenu()
  const { full, setFull, lang, sheet, setSheet, cartOpen, setCartOpen, t } = m

  // إتاحة فتح ملء الشاشة من زر القسم الخارجي (بلا رفع كامل الحالة)
  if (controllerRef) controllerRef.current = { openFull: () => setFull(true) }

  // قفل تمرير الصفحة في ملء الشاشة + ESC للإغلاق التدريجي
  useEffect(() => {
    document.body.style.overflow = full ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [full])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (sheet) setSheet(null)
      else if (cartOpen) setCartOpen(false)
      else if (full) setFull(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet, cartOpen, full])

  return (
    <div className={`ss-demo-holder ${full ? 'is-full' : ''}`}>
      <div className="ss-demo__backdrop" onClick={() => setFull(false)} aria-hidden={!full} />
      <div className="ss-demo" role="group" aria-label="ديمو تفاعلي لمنيو مطعم سمسم">
        <div className="ss-demo__screen" dir={lang === 'en' ? 'ltr' : 'rtl'}>
          <MenuApp m={m} />
        </div>
        {full && <button className="ss-demo__exit" onClick={() => setFull(false)} aria-label={t.close}>✕</button>}
      </div>
    </div>
  )
}
