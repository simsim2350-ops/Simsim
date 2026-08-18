import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'

const CART_TTL_MS = 6 * 60 * 60 * 1000 // 6 ساعات — سلة أقدم من كذا تُهمَل تفادياً لأسعار قديمة

// حالة السلة وعملياتها — المفتاح الفريد: نفس الصنف بخيارات/ملاحظة مختلفة = عنصر سلة مختلف
// السلة تُحفظ في localStorage فتنجو من تحديث الصفحة (F5) أو إغلاق المتصفح بالخطأ
export function useCart(slug, t) {
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const CART_STORAGE_KEY = `simsim_cart_${slug}`

  // تحميل السلة المحفوظة عند فتح المطعم لأول مرة في هذه الجلسة
  useEffect(() => {
    if (!slug) return
    try {
      const saved = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || 'null')
      if (saved && Date.now() - (saved.savedAt || 0) < CART_TTL_MS && Array.isArray(saved.items)) {
        setCart(saved.items)
      }
    } catch { /* تجاهل */ }
  }, [slug])

  // حفظ السلة في localStorage عند أي تغيير
  useEffect(() => {
    if (!slug) return
    try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ items: cart, savedAt: Date.now() })) } catch { /* تجاهل */ }
  }, [cart, slug])

  // selectedOptions: [{ groupName, choiceName, price }] — قائمة مفسّرة من الخيارات المختارة
  // silent: يكتم توست الإضافة (يُستخدم عند إعادة الطلب لتفادي عشرات التوستات — ملخّص واحد بدلها)
  const addToCart = (product, qty = 1, note = '', selectedOptions = [], silent = false) => {
    const safeQty = Math.min(99, Math.max(1, Number(qty) || 1))
    const optionsPrice = selectedOptions.reduce((s, o) => s + (o.price || 0), 0)
    const finalPrice = product.price + optionsPrice
    // مفتاح فريد للعنصر: نفس الصنف بخيارات مختلفة = عنصر سلة مختلف
    const optionsKey = selectedOptions.map(o => `${o.groupName}:${o.choiceName}`).sort().join('|')
    const cartKey = `${product.id}__${optionsKey}__${note}`

    setCart(prev => {
      const existing = prev.find(i => i.cartKey === cartKey)
      if (existing) return prev.map(i => i.cartKey === cartKey ? { ...i, qty: Math.min(99, i.qty + safeQty) } : i)
      return [...prev, {
        cartKey, id: product.id, name: product.name, emoji: product.emoji, image_url: product.image_url,
        price: finalPrice, basePrice: product.price, qty: safeQty, note,
        selectedOptions,
      }]
    })
    if (!silent) toast.success(`✅ ${t('tAdded')}`)
  }

  const removeFromCart = (cartKey) => {
    setCart(prev => {
      const item = prev.find(i => i.cartKey === cartKey)
      if (!item) return prev
      if (item.qty <= 1) return prev.filter(i => i.cartKey !== cartKey)
      return prev.map(i => i.cartKey === cartKey ? { ...i, qty: i.qty - 1 } : i)
    })
  }

  const incrementCartItem = (cartKey) => {
    setCart(prev => prev.map(i => i.cartKey === cartKey ? { ...i, qty: Math.min(99, i.qty + 1) } : i))
  }

  // حذف السطر بالكامل مهما كانت الكمية (زر 🗑 في السلة)
  const deleteCartItem = (cartKey) => {
    setCart(prev => prev.filter(i => i.cartKey !== cartKey))
  }

  // استبدال عنصر بعد تعديله من المودال (زر ✎) — لو نتج سطر مطابق لسطر موجود يُدمجان
  const updateCartItem = (oldCartKey, product, qty, note, selectedOptions = []) => {
    const optionsPrice = selectedOptions.reduce((s, o) => s + (o.price || 0), 0)
    const finalPrice = product.price + optionsPrice
    const optionsKey = selectedOptions.map(o => `${o.groupName}:${o.choiceName}`).sort().join('|')
    const cartKey = `${product.id}__${optionsKey}__${note}`
    setCart(prev => {
      const existing = prev.find(i => i.cartKey === cartKey && i.cartKey !== oldCartKey)
      if (existing) {
        return prev.filter(i => i.cartKey !== oldCartKey)
          .map(i => i.cartKey === cartKey ? { ...i, qty: i.qty + qty } : i)
      }
      return prev.map(i => i.cartKey === oldCartKey
        ? { cartKey, id: product.id, name: product.name, emoji: product.emoji, image_url: product.image_url, price: finalPrice, basePrice: product.price, qty, note, selectedOptions }
        : i)
    })
  }

  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0)
  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0)

  return { cart, setCart, cartOpen, setCartOpen, addToCart, removeFromCart, incrementCartItem, deleteCartItem, updateCartItem, cartTotal, cartCount }
}
