// دوال خالصة لمنطق السلة (TASK-CART-001/003 — ADR-44/PHASE 2) — بلا حالة React، قابلة للاختبار مباشرة.

const CART_TTL_MS = 6 * 60 * 60 * 1000 // 6 ساعات — سلة أقدم من كذا تُهمَل تفادياً لأسعار قديمة

// تفسّر حمولة localStorage الخام مقابل الفرع الحالي.
// - سلة منتهية الصلاحية أو تالفة ⇒ فارغة بلا نزاع.
// - سلة بلا branchId (محفوظة قبل هذا التغيير) ⇒ تُعامَل كأنها لنفس الفرع (توافق خلفي).
// - سلة لفرع مختلف وبها أصناف ⇒ نزاع يحتاج قرار الزبون؛ الأصناف لا تُحمَّل تلقائياً.
export function readStoredCart(raw, branchId) {
  let saved
  try {
    saved = JSON.parse(raw || 'null')
  } catch {
    return { items: [], conflict: null }
  }
  if (!saved || !Array.isArray(saved.items)) return { items: [], conflict: null }
  if (Date.now() - (saved.savedAt || 0) >= CART_TTL_MS) return { items: [], conflict: null }

  const savedBranchId = saved.branchId || null
  if (savedBranchId && branchId && savedBranchId !== branchId && saved.items.length > 0) {
    return { items: [], conflict: { savedBranchId, itemCount: saved.items.length } }
  }
  return { items: saved.items, conflict: null }
}

// مفتاح تخزين Idempotency لكل مطعم/فرع (TASK-ORD-002) — منفصل عن مفتاح السلة نفسها.
export function idempotencyStorageKey(slug, branchId) {
  return `simsim_idem_${slug}_${branchId}`
}

// مفتاح تخزين إتقان الدفع لكل مطعم/فرع (TASK-PAY-3.6D.3) — شقيق idempotencyStorageKey أعلاه، لكن
// لهوية "محاولة دفع" منفصلة عن هوية "نيّة شراء" السلة (فرق موثَّق أصلاً في checkoutOrchestration.js).
export function paymentIdempotencyStorageKey(slug, branchId) {
  return `simsim_payidem_${slug}_${branchId}`
}

// تطابق كل سطر سلة بالمنتج الحالي من المنيو المحمَّل أصلاً (صفر استعلامات إضافية).
// products هنا مُصفّاة سلفاً بـ is_available=true (useMenuData) — فغياب المعرّف يعني
// أن الصنف حُذف أو أصبح غير متاح، بغضّ النظر عن السبب.
export function validateCartAgainstProducts(cart, products) {
  if (!Array.isArray(products) || products.length === 0) {
    return cart.map(item => ({ ...item, available: true, priceChanged: false, currentBasePrice: null }))
  }
  const byId = new Map(products.map(p => [p.id, p]))
  return cart.map(item => {
    const product = byId.get(item.id)
    const available = Boolean(product)
    const currentBasePrice = product ? Number(product.price) : null
    const priceChanged = available && currentBasePrice != null && currentBasePrice !== Number(item.basePrice)
    return { ...item, available, priceChanged, currentBasePrice }
  })
}
