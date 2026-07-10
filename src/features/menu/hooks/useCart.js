import { useState } from 'react'
import { toast } from 'react-hot-toast'

// حالة السلة وعملياتها — المفتاح الفريد: نفس الصنف بخيارات/ملاحظة مختلفة = عنصر سلة مختلف
export function useCart(t) {
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)

  // selectedOptions: [{ groupName, choiceName, price }] — قائمة مفسّرة من الخيارات المختارة
  // silent: يكتم توست الإضافة (يُستخدم عند إعادة الطلب لتفادي عشرات التوستات — ملخّص واحد بدلها)
  const addToCart = (product, qty = 1, note = '', selectedOptions = [], silent = false) => {
    const optionsPrice = selectedOptions.reduce((s, o) => s + (o.price || 0), 0)
    const finalPrice = product.price + optionsPrice
    // مفتاح فريد للعنصر: نفس الصنف بخيارات مختلفة = عنصر سلة مختلف
    const optionsKey = selectedOptions.map(o => `${o.groupName}:${o.choiceName}`).sort().join('|')
    const cartKey = `${product.id}__${optionsKey}__${note}`

    setCart(prev => {
      const existing = prev.find(i => i.cartKey === cartKey)
      if (existing) return prev.map(i => i.cartKey === cartKey ? { ...i, qty: i.qty + qty } : i)
      return [...prev, {
        cartKey, id: product.id, name: product.name, emoji: product.emoji, image_url: product.image_url,
        price: finalPrice, basePrice: product.price, qty, note,
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
    setCart(prev => prev.map(i => i.cartKey === cartKey ? { ...i, qty: i.qty + 1 } : i))
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
