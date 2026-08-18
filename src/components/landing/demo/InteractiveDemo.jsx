import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import useInteractiveMenu from './useInteractiveMenu'
import { LANDING_DEMO_RESTAURANT_SLUG } from '../../../config/landingContent'

const money = (n) => `${Number(n || 0).toFixed(Number(n || 0) % 1 ? 2 : 0)} ﷼`

const localized = (value, lang) => {
  if (!value) return ''
  if (typeof value === 'string') return value
  return value[lang] || value.ar || value.en || ''
}

const ProductMedia = ({ product, className, alt, children }) => (
  <div className={className}>
    {product.image_url
      ? <img src={product.image_url} alt={alt} />
      : <span aria-hidden="true">{product.emoji || '🍽️'}</span>}
    {children}
  </div>
)

/* ------------------------- نافذة تفاصيل المنتج ------------------------- */
function ProductSheet({ product, lang, t, onAdd, onClose }) {
  const [sel, setSel] = useState(() => {
    const init = {}
    ;(product.options || []).forEach((g) => {
      if (g.type === 'single') init[g.id] = g.required && g.items[0] ? [g.items[0].id] : []
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
    (sel[g.id] || []).map((itemId) => {
      const it = g.items.find((item) => item.id === itemId)
      return it ? { groupId: g.id, itemId, name: it.name, price: it.price } : null
    }).filter(Boolean))
  const unit = product.price + chosen.reduce((sum, option) => sum + option.price, 0)
  const productName = localized(product.name, lang)

  return (
    <div className="ss-demo__sheet" role="dialog" aria-modal="true" aria-label={productName}>
      <button className="ss-demo__sheet-close" onClick={onClose} aria-label={t.close}>✕</button>
      <ProductMedia product={product} className="ss-demo__sheet-hero" alt={productName}>
        {product.best && <span className="ss-demo__hot">{t.best}</span>}
      </ProductMedia>
      <div className="ss-demo__sheet-body">
        <div className="ss-demo__sheet-head">
          <h4>{productName}</h4>
          <span className="ss-demo__sheet-price">{money(product.price)}</span>
        </div>
        {localized(product.desc, lang) && <p className="ss-demo__sheet-desc">{localized(product.desc, lang)}</p>}
        {product.calories != null && <span className="ss-demo__cal">🔥 {product.calories} {t.cal}</span>}

        {(product.options || []).map((group) => (
          <div className="ss-demo__optgroup" key={group.id}>
            <div className="ss-demo__optlabel">
              {localized(group.label, lang)}
              <span className={`ss-demo__optreq ${group.required ? 'is-req' : ''}`}>{group.required ? t.required : t.optional}</span>
            </div>
            {group.items.map((item) => {
              const active = (sel[group.id] || []).includes(item.id)
              return (
                <button type="button" key={item.id} className={`ss-demo__opt ${active ? 'is-active' : ''}`} onClick={() => pick(group, item.id)}>
                  <span className={`ss-demo__optmark ${group.type === 'single' ? 'is-radio' : ''}`}>{active ? '✓' : ''}</span>
                  <span className="ss-demo__optname">{localized(item.name, lang)}</span>
                  {item.price > 0 && <span className="ss-demo__optprice">+{money(item.price)}</span>}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      <div className="ss-demo__sheet-foot">
        <div className="ss-demo__stepper" aria-label={t.qty}>
          <button onClick={() => setQty((count) => Math.max(1, count - 1))} aria-label="-">−</button>
          <span>{qty}</span>
          <button onClick={() => setQty((count) => count + 1)} aria-label="+">+</button>
        </div>
        <button className="ss-demo__addbtn" onClick={() => { onAdd(product, chosen, qty); onClose() }}>
          {t.addToCart} · {money(unit * qty)}
        </button>
      </div>
    </div>
  )
}

/* ------------------------- سلة المعاينة ------------------------- */
function CartSheet({ m }) {
  const { t, lang, cart, cartTotal, inc, dec, removeItem, checkout, orderDone, resetOrder, setCartOpen } = m

  if (orderDone) {
    return (
      <div className="ss-demo__sheet ss-demo__sheet--cart" role="dialog" aria-modal="true" aria-label={t.orderDone}>
        <div className="ss-demo__done">
          <div className="ss-demo__done-ic" aria-hidden="true">✓</div>
          <h4>{t.orderDone}</h4>
          <p>{t.orderDoneSub}</p>
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
            {cart.map((item) => {
              const itemName = localized(item.product.name, lang)
              return (
                <div className="ss-demo__cartrow" key={item.key}>
                  <ProductMedia product={item.product} className="ss-demo__cartthumb" alt={itemName} />
                  <div className="ss-demo__cartinfo">
                    <div className="ss-demo__cartname">{itemName}</div>
                    {item.opts.length > 0 && <div className="ss-demo__cartopts">{item.opts.map((option) => localized(option.name, lang)).join(' · ')}</div>}
                    <div className="ss-demo__cartprice">{money(item.unitPrice * item.qty)}</div>
                  </div>
                  <div className="ss-demo__cartqty">
                    <div className="ss-demo__stepper ss-demo__stepper--sm">
                      <button onClick={() => dec(item.key)} aria-label="-">−</button>
                      <span>{item.qty}</span>
                      <button onClick={() => inc(item.key)} aria-label="+">+</button>
                    </div>
                    <button className="ss-demo__remove" onClick={() => removeItem(item.key)} aria-label="حذف">🗑</button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="ss-demo__cartfoot">
            <div className="ss-demo__totalrow"><span>{t.total}</span><span>{money(cartTotal)}</span></div>
            <button className="ss-demo__addbtn ss-demo__addbtn--wide" onClick={checkout}>{t.checkout} · {money(cartTotal)}</button>
          </div>
        </>
      )}
    </div>
  )
}

/* ------------------------- تطبيق المنيو الحي ------------------------- */
function MenuApp({ m }) {
  const {
    lang, setLang, t, activeCat, setActiveCat, search, setSearch, searchOpen, setSearchOpen,
    list, categories, cartCount, cartTotal, bump, addToCart, sheet, setSheet, cartOpen, setCartOpen,
    restaurant, branch, rating, openStatus, prepTime, loading, notFound,
  } = m
  const listRef = useRef(null)

  useEffect(() => { if (listRef.current) listRef.current.scrollTop = 0 }, [activeCat, search])

  if (loading) {
    return <div className="ss-demo__loading">جارٍ تحميل منيو المطعم...</div>
  }

  if (notFound || !restaurant) {
    return <div className="ss-demo__loading">المنيو غير متاح حالياً</div>
  }

  const isEn = lang === 'en'
  const restaurantName = isEn && restaurant.name_en ? restaurant.name_en : restaurant.name
  const tagline = isEn && restaurant.description_en ? restaurant.description_en : (restaurant.description || branch?.name || '')
  const coverStyle = restaurant.cover_url
    ? { backgroundImage: `linear-gradient(180deg, rgba(11,11,15,.18), rgba(11,11,15,.56)), url("${restaurant.cover_url}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: restaurant.brand_color || 'var(--ss-primary)' }

  return (
    <div className="ss-demo__app">
      <div className="ss-demo__cover" style={coverStyle}>
        <div className="ss-demo__cover-top">
          {branch?.name ? <span className="ss-demo__chip">✦ {branch.name}</span> : <span />}
          <div className="ss-demo__cover-actions">
            <button className="ss-demo__iconbtn" onClick={() => setLang(isEn ? 'ar' : 'en')} aria-label="language">
              {isEn ? 'ع' : 'EN'}
            </button>
            <button className="ss-demo__iconbtn" onClick={() => setSearchOpen((isOpen) => !isOpen)} aria-label={t.search}>🔍</button>
          </div>
        </div>
        <div className="ss-demo__rest">
          <div className="ss-demo__logo">
            {restaurant.logo_url ? <img src={restaurant.logo_url} alt={`شعار ${restaurantName}`} /> : <span aria-hidden="true">{restaurantName?.slice(0, 1)}</span>}
          </div>
          <div>
            <div className="ss-demo__restname">{restaurantName}</div>
            {tagline && <div className="ss-demo__resttag">{tagline}</div>}
          </div>
        </div>
        <div className="ss-demo__restmeta">
          {rating?.avg != null && <><span>⭐ {rating.avg.toFixed(1)} <i>({rating.count})</i></span><span className="ss-demo__dotsep" /></>}
          <span>{openStatus?.open ? '🟢' : '🔴'} {openStatus?.open ? t.open : t.closed}</span>
          {prepTime && <><span className="ss-demo__dotsep" /><span>🕒 {prepTime}</span></>}
        </div>
      </div>

      {searchOpen && (
        <div className="ss-demo__searchwrap">
          <input className="ss-demo__search" autoFocus value={search} placeholder={t.search}
            onChange={(event) => setSearch(event.target.value)} aria-label={t.search} />
          {search && <button className="ss-demo__searchx" onClick={() => setSearch('')} aria-label={t.close}>✕</button>}
        </div>
      )}

      {!search && categories.length > 0 && (
        <div className="ss-demo__tabs" role="tablist">
          {categories.map((category) => (
            <button key={category.id} role="tab" aria-selected={activeCat === category.id}
              className={`ss-demo__tab ${activeCat === category.id ? 'is-active' : ''}`}
              onClick={() => setActiveCat(category.id)}>
              <span aria-hidden="true">{category.icon}</span> {localized(category.name, lang)}
            </button>
          ))}
        </div>
      )}

      <div className="ss-demo__list" ref={listRef}>
        {list.length === 0 ? (
          <div className="ss-demo__noresults">🔍 {t.noResults}</div>
        ) : list.map((product) => {
          const productName = localized(product.name, lang)
          return (
            <button key={product.id} className="ss-demo__card" onClick={() => setSheet(product)}>
              <ProductMedia product={product} className="ss-demo__cardthumb" alt={productName} />
              <div className="ss-demo__cardinfo">
                <div className="ss-demo__cardname">{productName}</div>
                {localized(product.desc, lang) && <div className="ss-demo__carddesc">{localized(product.desc, lang)}</div>}
                <div className="ss-demo__cardbottom">
                  <span className="ss-demo__cardprice">{money(product.price)}</span>
                  {product.best && <span className="ss-demo__cardbadge">🔥 {t.best}</span>}
                </div>
              </div>
              <span className="ss-demo__cardadd" aria-hidden="true">+</span>
            </button>
          )
        })}
      </div>

      {cartCount > 0 && !cartOpen && !sheet && (
        <button className="ss-demo__cartbar" onClick={() => setCartOpen(true)}>
          <span key={bump} className="ss-demo__cartbadge">{cartCount}</span>
          <span className="ss-demo__cartbar-label">{t.cart}</span>
          <span className="ss-demo__cartbar-total">{money(cartTotal)}</span>
        </button>
      )}

      {sheet && <div className="ss-demo__scrim" onClick={() => setSheet(null)} />}
      {sheet && <ProductSheet product={sheet} lang={lang} t={t} onAdd={addToCart} onClose={() => setSheet(null)} />}
      {cartOpen && <div className="ss-demo__scrim" onClick={() => setCartOpen(false)} />}
      {cartOpen && <CartSheet m={m} />}
    </div>
  )
}

/* ------------------------- الغلاف (هاتف مدمج / ملء الشاشة) ------------------------- */
export default function InteractiveDemo({ controllerRef }) {
  const m = useInteractiveMenu(LANDING_DEMO_RESTAURANT_SLUG)
  const { full, setFull, lang, sheet, setSheet, cartOpen, setCartOpen, t, restaurant } = m

  if (controllerRef) controllerRef.current = { openFull: () => setFull(true) }

  useEffect(() => {
    document.body.style.overflow = full ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [full])

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      if (sheet) setSheet(null)
      else if (cartOpen) setCartOpen(false)
      else if (full) setFull(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet, cartOpen, full, setSheet, setCartOpen, setFull])

  return (
    <div className={`ss-demo-holder ${full ? 'is-full' : ''}`}>
      <div className="ss-demo__backdrop" onClick={() => setFull(false)} aria-hidden={!full} />
      <div className="ss-demo" role="group" aria-label={restaurant ? `معاينة تفاعلية لمنيو ${restaurant.name}` : 'معاينة تفاعلية للمنيو'}>
        <div className="ss-demo__screen" dir={lang === 'en' ? 'ltr' : 'rtl'}>
          <MenuApp m={m} />
        </div>
        {full && <button className="ss-demo__exit" onClick={() => setFull(false)} aria-label={t.close}>✕</button>}
      </div>
    </div>
  )
}
