import { useState, useMemo, useCallback } from 'react'
import { DEMO_PRODUCTS, DEMO_T } from './demoData'

// حالة الديمو التفاعلي كلها في مكان واحد (بلا شبكة) — قابلة لإعادة الاستخدام
// بين النسخة المدمجة داخل الهاتف ونسخة ملء الشاشة (نفس الحالة = السلة محفوظة).
export default function useDemoMenu() {
  const [lang, setLang] = useState('ar')
  const [activeCat, setActiveCat] = useState('popular')
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [cart, setCart] = useState([])          // [{ key, product, qty, opts:[{groupId,itemId,name,price}], unitPrice }]
  const [cartOpen, setCartOpen] = useState(false)
  const [sheet, setSheet] = useState(null)       // المنتج المفتوح في نافذة التفاصيل
  const [orderDone, setOrderDone] = useState(false)
  const [full, setFull] = useState(false)
  const [bump, setBump] = useState(0)            // مؤشر لتحريك شارة السلة عند الإضافة

  const t = DEMO_T[lang]

  // منتجات القسم الحالي (أو الأكثر طلباً) مع فلترة البحث
  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    let items = DEMO_PRODUCTS
    if (q) {
      items = items.filter((p) =>
        p.name.ar.toLowerCase().includes(q) || p.name.en.toLowerCase().includes(q))
    } else if (activeCat === 'popular') {
      items = items.filter((p) => p.best)
    } else {
      items = items.filter((p) => p.cat === activeCat)
    }
    return items
  }, [activeCat, search])

  const cartCount = useMemo(() => cart.reduce((n, i) => n + i.qty, 0), [cart])
  const cartTotal = useMemo(() => cart.reduce((s, i) => s + i.unitPrice * i.qty, 0), [cart])
  const points = Math.round(cartTotal)

  const addToCart = useCallback((product, opts, qty) => {
    const unitPrice = product.price + opts.reduce((s, o) => s + o.price, 0)
    const key = product.id + '|' + opts.map((o) => o.itemId).sort().join(',')
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.key === key)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], qty: next[idx].qty + qty }
        return next
      }
      return [...prev, { key, product, qty, opts, unitPrice }]
    })
    setBump((b) => b + 1)
  }, [])

  const inc = useCallback((key) => setCart((p) => p.map((i) => i.key === key ? { ...i, qty: i.qty + 1 } : i)), [])
  const dec = useCallback((key) => setCart((p) => p.flatMap((i) => i.key === key ? (i.qty > 1 ? [{ ...i, qty: i.qty - 1 }] : []) : [i])), [])
  const removeItem = useCallback((key) => setCart((p) => p.filter((i) => i.key !== key)), [])

  const checkout = useCallback(() => { if (cart.length) setOrderDone(true) }, [cart.length])
  const resetOrder = useCallback(() => { setCart([]); setOrderDone(false); setCartOpen(false) }, [])

  return {
    lang, setLang, t,
    activeCat, setActiveCat,
    search, setSearch, searchOpen, setSearchOpen,
    list,
    cart, cartOpen, setCartOpen, cartCount, cartTotal, points, bump,
    addToCart, inc, dec, removeItem,
    sheet, setSheet,
    orderDone, checkout, resetOrder,
    full, setFull,
  }
}
