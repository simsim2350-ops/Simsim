// منطق البحث والفلترة — دوال خالصة (بلا state/DOM) لتسهيل اختبارها بمعزل عن الواجهة.
// تعمل على البيانات المحمّلة أصلاً في الصفحة (بلا استعلام جديد، بلا إعادة تحميل).

const norm = (s) => (s || '').toString().trim().toLowerCase()

// بحث الأقسام: بالاسم العربي أو الإنجليزي
export function filterCategories(categories, query) {
  const q = norm(query)
  if (!q) return categories
  return categories.filter(cat => norm(cat.name).includes(q) || norm(cat.name_en).includes(q))
}

// بحث الأصناف: بالاسم العربي/الإنجليزي أو اسم القسم الذي ينتمي إليه
export function filterProductsBySearch(products, categoriesById, query) {
  const q = norm(query)
  if (!q) return products
  return products.filter(p => {
    const cat = categoriesById.get(p.category_id || null)
    return (
      norm(p.name).includes(q) ||
      norm(p.name_en).includes(q) ||
      norm(cat?.name).includes(q) ||
      norm(cat?.name_en).includes(q)
    )
  })
}

export const DEFAULT_PRODUCT_FILTERS = { categoryId: 'all', availability: 'all', bestSeller: false, featured: false }

export function isDefaultProductFilters(filters) {
  return (
    filters.categoryId === DEFAULT_PRODUCT_FILTERS.categoryId &&
    filters.availability === DEFAULT_PRODUCT_FILTERS.availability &&
    !filters.bestSeller &&
    !filters.featured
  )
}

export function countActiveFilters(filters) {
  let n = 0
  if (filters.categoryId !== 'all') n++
  if (filters.availability !== 'all') n++
  if (filters.bestSeller) n++
  if (filters.featured) n++
  return n
}

// فلترة الأصناف حسب القسم/التوفر/الأكثر مبيعًا/مختارات المطعم
export function filterProductsByFilters(products, filters) {
  return products.filter(p => {
    if (filters.categoryId !== 'all' && (p.category_id || 'none') !== filters.categoryId) return false
    if (filters.availability === 'available' && !p.is_available) return false
    if (filters.availability === 'unavailable' && p.is_available) return false
    if (filters.bestSeller && !p.is_best_seller) return false
    if (filters.featured && !p.is_featured) return false
    return true
  })
}
