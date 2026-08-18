import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMenuData } from '../../../features/menu/hooks/useMenuData'
import { computeBranchOpenStatus, estimatedPrepTime } from '../../../features/menu/helpers'

const UI_COPY = {
  ar: {
    search: 'ابحث في المنيو…',
    open: 'مفتوح الآن',
    closed: 'مغلق الآن',
    addToCart: 'أضف للسلة',
    cart: 'السلة',
    empty: 'سلتك فارغة',
    emptyHint: 'أضف أصنافاً لتبدأ طلبك',
    total: 'الإجمالي',
    checkout: 'إتمام الطلب',
    required: 'مطلوب',
    optional: 'اختياري',
    cal: 'سعرة',
    best: 'الأكثر طلبًا 🔥',
    orderDone: 'تمت إضافة طلبك للمعاينة',
    orderDoneSub: 'يمكنك متابعة تصفح أصناف مطعم سمسم.',
    startFree: 'أنشئ منيو مطعمك مجاناً',
    backToMenu: 'رجوع للمنيو',
    qty: 'الكمية',
    noResults: 'لا توجد نتائج',
    close: 'إغلاق',
    minutes: 'د',
    mostOrdered: 'الأكثر طلبًا 🔥',
  },
  en: {
    search: 'Search the menu…',
    open: 'Open now',
    closed: 'Closed now',
    addToCart: 'Add to cart',
    cart: 'Cart',
    empty: 'Your cart is empty',
    emptyHint: 'Add items to start your order',
    total: 'Total',
    checkout: 'Checkout',
    required: 'Required',
    optional: 'Optional',
    cal: 'cal',
    best: 'Most ordered',
    orderDone: 'Your preview order was added',
    orderDoneSub: 'Continue browsing Simsim Restaurant items.',
    startFree: 'Create your menu free',
    backToMenu: 'Back to menu',
    qty: 'Qty',
    noResults: 'No results found',
    close: 'Close',
    minutes: 'min',
    mostOrdered: 'Most ordered',
  },
}

const asLocalized = (ar, en) => ({ ar: ar || '', en: en || ar || '' })

function normalizeOptions(options) {
  if (!Array.isArray(options)) return []

  return options.map((group, groupIndex) => ({
    id: group.id || `option-group-${groupIndex}`,
    type: group.type === 'multiple' ? 'multiple' : 'single',
    required: Boolean(group.required),
    label: asLocalized(group.name || group.label, group.name_en || group.label_en),
    items: (Array.isArray(group.choices) ? group.choices : []).map((choice, choiceIndex) => ({
      id: choice.id || `option-${groupIndex}-${choiceIndex}`,
      name: asLocalized(choice.name, choice.name_en),
      price: Number(choice.price || 0),
    })),
  }))
}

function normalizeProduct(product, mostOrderedIds) {
  return {
    id: product.id,
    categoryId: product.category_id,
    name: asLocalized(product.name, product.name_en),
    desc: asLocalized(product.description, product.description_en),
    price: Number(product.price || 0),
    calories: product.calories,
    options: normalizeOptions(product.options),
    image_url: product.image_url || null,
    emoji: product.emoji || '🍽️',
    best: mostOrderedIds.has(product.id),
  }
}

export default function useInteractiveMenu(slug) {
  const [lang, setLang] = useState('ar')
  const [activeCat, setActiveCat] = useState(null)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [sheet, setSheet] = useState(null)
  const [orderDone, setOrderDone] = useState(false)
  const [full, setFull] = useState(false)
  const [bump, setBump] = useState(0)

  const {
    restaurant, branch, categories: liveCategories, products: liveProducts,
    loading, notFound, rating, restaurantActiveOrdersCount,
  } = useMenuData(slug)

  const t = UI_COPY[lang]
  const mostOrderedIds = useMemo(() => new Set((liveProducts || []).filter((product) => product.is_most_ordered).map((product) => product.id)), [liveProducts])
  const products = useMemo(
    () => (liveProducts || []).map((product) => normalizeProduct(product, mostOrderedIds)),
    [liveProducts, mostOrderedIds],
  )

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products])
  const categories = useMemo(() => {
    const actualCategories = (liveCategories || []).map((category) => ({
      id: category.id,
      name: asLocalized(category.name, category.name_en),
      icon: category.emoji || '🍽️',
    }))
    const mostOrdered = (liveProducts || []).filter((product) => product.is_most_ordered && productById.has(product.id))
    return mostOrdered.length > 0
      ? [{ id: 'most-ordered', name: asLocalized(t.mostOrdered, 'Most ordered'), icon: '🔥' }, ...actualCategories]
      : actualCategories
  }, [liveCategories, liveProducts, productById, t.mostOrdered])

  useEffect(() => {
    const ids = categories.map((category) => category.id)
    setActiveCat((current) => ids.includes(current) ? current : (ids[0] || null))
  }, [categories])

  const list = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (query) {
      return products.filter((product) =>
        product.name.ar.toLowerCase().includes(query) || product.name.en.toLowerCase().includes(query))
    }

    if (activeCat === 'most-ordered') {
      return products.filter((product) => product.best)
    }

    return products.filter((product) => product.categoryId === activeCat)
  }, [activeCat, products, search])

  const cartCount = useMemo(() => cart.reduce((count, item) => count + item.qty, 0), [cart])
  const cartTotal = useMemo(() => cart.reduce((total, item) => total + item.unitPrice * item.qty, 0), [cart])

  const addToCart = useCallback((product, opts, qty) => {
    const unitPrice = product.price + opts.reduce((total, option) => total + option.price, 0)
    const key = `${product.id}|${opts.map((option) => option.itemId).sort().join(',')}`
    setCart((previous) => {
      const index = previous.findIndex((item) => item.key === key)
      if (index >= 0) {
        const next = [...previous]
        next[index] = { ...next[index], qty: next[index].qty + qty }
        return next
      }
      return [...previous, { key, product, qty, opts, unitPrice }]
    })
    setBump((value) => value + 1)
  }, [])

  const inc = useCallback((key) => setCart((items) => items.map((item) => item.key === key ? { ...item, qty: item.qty + 1 } : item)), [])
  const dec = useCallback((key) => setCart((items) => items.flatMap((item) => item.key === key ? (item.qty > 1 ? [{ ...item, qty: item.qty - 1 }] : []) : [item])), [])
  const removeItem = useCallback((key) => setCart((items) => items.filter((item) => item.key !== key)), [])
  const checkout = useCallback(() => { if (cart.length) setOrderDone(true) }, [cart.length])
  const resetOrder = useCallback(() => { setCart([]); setOrderDone(false); setCartOpen(false) }, [])

  const openStatus = useMemo(
    () => branch ? computeBranchOpenStatus(branch) : { open: false, unknown: true, nextText: '', todayText: '' },
    [branch],
  )
  const prepTime = restaurant?.show_prep_time === false ? '' : estimatedPrepTime(restaurantActiveOrdersCount)

  return {
    lang, setLang, t,
    activeCat, setActiveCat,
    search, setSearch, searchOpen, setSearchOpen,
    categories, list,
    cart, cartOpen, setCartOpen, cartCount, cartTotal, bump,
    addToCart, inc, dec, removeItem,
    sheet, setSheet,
    orderDone, checkout, resetOrder,
    full, setFull,
    restaurant, branch, rating, openStatus, prepTime, loading, notFound,
  }
}
