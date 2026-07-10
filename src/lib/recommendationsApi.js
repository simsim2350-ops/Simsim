import { supabase } from './supabase'

// طبقة وصول بيانات محرك الاقتراحات الذكي (product_recommendations)
// تُستخدم من: لوحة التحكم (ربط/ترتيب/حذف لكل صنف) والمنيو العام (قراءة القواعد المفعّلة فقط)

// قواعد صنف معيّن (لوحة التحكم) — مع بيانات الصنف المقترَح للعرض
export async function fetchRecommendationsForProduct(productId) {
  const { data, error } = await supabase
    .from('product_recommendations')
    .select('id, priority, is_active, recommended:products!recommended_product_id(id, name, name_en, emoji, image_url, price)')
    .eq('source_product_id', productId)
    .order('priority')
  if (error) throw error
  return data || []
}

export async function addRecommendation(restaurantId, sourceProductId, recommendedProductId, priority = 0) {
  const { data, error } = await supabase
    .from('product_recommendations')
    .insert({ restaurant_id: restaurantId, source_product_id: sourceProductId, recommended_product_id: recommendedProductId, priority })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function removeRecommendation(id) {
  const { error } = await supabase.from('product_recommendations').delete().eq('id', id)
  if (error) throw error
}

export async function updateRecommendationPriority(id, priority) {
  const { error } = await supabase.from('product_recommendations').update({ priority }).eq('id', id)
  if (error) throw error
}

// كل القواعد المفعّلة لمطعم (المنيو العام) — تُحمَّل مرة واحدة مع الأصناف والأقسام
export async function fetchActiveRecommendationsMap(restaurantId) {
  const { data, error } = await supabase
    .from('product_recommendations')
    .select('source_product_id, recommended_product_id, priority')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .order('priority')
  if (error) throw error
  const map = new Map()
  for (const row of data || []) {
    if (!map.has(row.source_product_id)) map.set(row.source_product_id, [])
    map.get(row.source_product_id).push(row.recommended_product_id)
  }
  return map
}

// ===== قائمة اقتراحات السلة العامة (cart_wide_recommendations) — مستقلة تماماً عن قواعد الأصناف الفردية =====

// القائمة كاملة (لوحة التحكم) — مع بيانات الصنف للعرض
export async function fetchCartWideList(restaurantId) {
  const { data, error } = await supabase
    .from('cart_wide_recommendations')
    .select('id, priority, is_active, product:products(id, name, name_en, emoji, image_url, price)')
    .eq('restaurant_id', restaurantId)
    .order('priority')
  if (error) throw error
  return data || []
}

export async function addCartWideItem(restaurantId, productId, priority = 0) {
  const { data, error } = await supabase
    .from('cart_wide_recommendations')
    .insert({ restaurant_id: restaurantId, product_id: productId, priority })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function removeCartWideItem(id) {
  const { error } = await supabase.from('cart_wide_recommendations').delete().eq('id', id)
  if (error) throw error
}

export async function updateCartWidePriority(id, priority) {
  const { error } = await supabase.from('cart_wide_recommendations').update({ priority }).eq('id', id)
  if (error) throw error
}

export async function toggleCartWideActive(id, isActive) {
  const { error } = await supabase.from('cart_wide_recommendations').update({ is_active: isActive }).eq('id', id)
  if (error) throw error
}

// معرّفات الأصناف المفعّلة فقط (المنيو العام) — تُحمَّل مرة واحدة مع فتح المنيو، بترتيب الأولوية
export async function fetchActiveCartWideIds(restaurantId) {
  const { data, error } = await supabase
    .from('cart_wide_recommendations')
    .select('product_id')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .order('priority')
  if (error) throw error
  return (data || []).map(r => r.product_id)
}
