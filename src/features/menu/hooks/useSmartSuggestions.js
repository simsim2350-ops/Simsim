import { useMemo } from 'react'

// محرك الاقتراحات الذكي — سلسلة أولويات تتوقف حين يكتمل العدد المطلوب:
// 1) قواعد يدوية (ربطها المطعم) 2) نفس القسم 3) الأكثر طلباً (شبكة أمان أخيرة)
// كل اقتراح يحمل reason لعرض شارة السبب في الواجهة (rules | category | bestseller)
export function useSmartSuggestions({ cart, products, restaurant, recommendationsMap }) {
  const cartKey = cart.map(i => i.id).sort().join(',') // تغيّر الكمية فقط لا يُعيد الحساب
  const enabled = restaurant?.recommendations_enabled !== false
  const count = restaurant?.recommendations_count || 4

  return useMemo(() => {
    if (!enabled || cart.length === 0) return []
    const cartIds = new Set(cart.map(i => i.id))
    const picked = new Map() // product_id -> { product, reason } — أول مصدر يرشّح الصنف يفوز

    const tryAdd = (product, reason) => {
      if (!product || !product.is_available) return
      if (cartIds.has(product.id) || picked.has(product.id)) return
      picked.set(product.id, { product, reason })
    }

    // 1) قواعد يدوية — بترتيب أصناف السلة
    for (const item of cart) {
      if (picked.size >= count) break
      const recommendedIds = recommendationsMap.get(item.id) || []
      for (const rid of recommendedIds) {
        if (picked.size >= count) break
        tryAdd(products.find(p => p.id === rid), 'rules')
      }
    }

    // 2) نفس القسم — لأقسام أصناف السلة، لو ما اكتمل العدد بعد
    if (picked.size < count) {
      const cartCategoryIds = new Set(
        cart.map(i => products.find(p => p.id === i.id)?.category_id).filter(Boolean)
      )
      for (const catId of cartCategoryIds) {
        if (picked.size >= count) break
        for (const p of products.filter(p => p.category_id === catId)) {
          if (picked.size >= count) break
          tryAdd(p, 'category')
        }
      }
    }

    // 3) الأكثر مبيعاً — آخر خيار وليس الأول
    if (picked.size < count) {
      for (const p of products.filter(p => p.is_featured)) {
        if (picked.size >= count) break
        tryAdd(p, 'bestseller')
      }
    }

    return [...picked.values()].slice(0, count)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey, enabled, count, products, recommendationsMap])
}
