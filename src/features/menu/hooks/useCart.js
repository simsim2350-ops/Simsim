import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { readStoredCart, idempotencyStorageKey } from './cartHelpers'

// حالة السلة وعملياتها — المفتاح الفريد: نفس الصنف بخيارات/ملاحظة مختلفة = عنصر سلة مختلف
// السلة تُحفظ في localStorage فتنجو من تحديث الصفحة (F5) أو إغلاق المتصفح بالخطأ
// معزولة بالفرع (ADR-44/TASK-CART-001): branchId جزء من الحمولة المحفوظة؛ سلة فرع آخر بها أصناف
// تُطرح كنزاع صريح (branchConflict) بدل تحميلها صامتة في فرع لا تنتمي إليه.
export function useCart(slug, branchId, t) {
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [branchConflict, setBranchConflict] = useState(null) // { savedBranchId, itemCount } | null
  const [idempotencyKey, setIdempotencyKey] = useState(null) // TASK-ORD-002 — مفتاح ثابت لكل "نيّة شراء"
  const CART_STORAGE_KEY = `simsim_cart_${slug}`

  // تحميل السلة المحفوظة عند معرفة الفرع الفعلي (ننتظره لتفادي نزاع وهمي أثناء تحميل بيانات المطعم)
  useEffect(() => {
    if (!slug || !branchId) return
    try {
      const { items, conflict } = readStoredCart(localStorage.getItem(CART_STORAGE_KEY), branchId)
      setBranchConflict(conflict)
      setCart(conflict ? [] : items)
    } catch {
      setBranchConflict(null)
      setCart([])
    }
  }, [slug, branchId])

  // حفظ السلة في localStorage عند أي تغيير — يُعلَّق أثناء نزاع فرع غير محسوم حتى لا تُمحى سلة الفرع الآخر قبل أن يقرر الزبون
  useEffect(() => {
    if (!slug || !branchId || branchConflict) return
    try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ items: cart, savedAt: Date.now(), branchId })) } catch { /* تجاهل */ }
  }, [cart, slug, branchId, branchConflict])

  // مزامنة بين التبويبات (TASK-CART-002): تعديل في تبويب آخر لنفس السلة ينعكس هنا فوراً
  useEffect(() => {
    if (!slug || !branchId) return
    const onStorage = (e) => {
      if (e.key !== CART_STORAGE_KEY) return
      try {
        const { items, conflict } = readStoredCart(e.newValue, branchId)
        setBranchConflict(conflict)
        setCart(conflict ? [] : items)
      } catch { /* تجاهل */ }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [slug, branchId])

  // القرار الأول لنزاع الفرع: تفريغ سلة الفرع القديم والبدء من هذا الفرع (القرار الثاني — الرجوع
  // للفرع السابق — تنقّل بين الصفحات، يُدار من الصفحة المستدعية عبر savedBranchId في branchConflict)
  const clearCartForNewBranch = () => {
    setBranchConflict(null)
    setCart([])
  }

  // TASK-ORD-002: مفتاح Idempotency يُولَّد مرة واحدة عند أول فتح للسلة بمحتوى (لا عند كل ضغطة)،
  // يُحفظ في localStorage فينجو من refresh أثناء الإرسال، ويُبطَل (يُولَّد غيره) بعد نجاح الطلب
  // وتفريغ السلة — نفس السلوك عند تفريغها لأي سبب آخر (لا حاجة لمفتاح لسلة فارغة).
  useEffect(() => {
    if (!slug || !branchId) return
    const storageKey = idempotencyStorageKey(slug, branchId)
    if (cart.length === 0) {
      setIdempotencyKey(null)
      try { localStorage.removeItem(storageKey) } catch { /* تجاهل */ }
      return
    }
    if (idempotencyKey) return
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) { setIdempotencyKey(stored); return }
    } catch { /* تجاهل */ }
    const fresh = crypto.randomUUID()
    setIdempotencyKey(fresh)
    try { localStorage.setItem(storageKey, fresh) } catch { /* تجاهل */ }
  }, [cart.length, slug, branchId, idempotencyKey])

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

  return {
    cart, setCart, cartOpen, setCartOpen, addToCart, removeFromCart, incrementCartItem, deleteCartItem, updateCartItem, cartTotal, cartCount,
    branchConflict, clearCartForNewBranch, idempotencyKey,
  }
}
