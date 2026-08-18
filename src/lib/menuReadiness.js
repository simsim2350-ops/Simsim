// Menu Readiness — حالة مشتقة من بيانات المطعم والفرع والمنيو الفعلية.
// لا تعتمد على onboarding_completed: الإعداد المكتمل لا يعني منيو صالحاً للمشاركة.

const hasText = (value) => typeof value === 'string' && value.trim().length > 0
const hasObjectContent = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0
const validPrice = (value) => Number.isFinite(Number(value)) && Number(value) > 0

const item = (key, label, complete, kind = 'essential') => ({ key, label, complete: Boolean(complete), kind })

export function calculateMenuReadiness({
  restaurant = null,
  branch = null,
  categories = [],
  products = [],
  banners = [],
  coupons = [],
} = {}) {
  const visibleCategories = categories.filter(category => category?.is_visible !== false)
  const visibleCategoryIds = new Set(visibleCategories.map(category => category?.id).filter(Boolean))
  const availableProducts = products.filter(product => product?.is_available !== false)
  const validProducts = availableProducts.filter(product =>
    visibleCategoryIds.has(product?.category_id) && validPrice(product?.price)
  )

  const essentials = [
    item('restaurant', 'المطعم نشط', Boolean(restaurant?.id && restaurant?.is_active !== false && !restaurant?.platform_suspended)),
    item('branch', 'فرع نشط', Boolean(branch?.id && branch?.is_active !== false && !branch?.is_paused)),
    item('category', 'قسم ظاهر', visibleCategories.length > 0),
    item('product', 'صنف متاح', validProducts.length > 0),
    item('price', 'سعر صالح', validProducts.length > 0),
  ]

  const recommended = [
    item('logo', 'شعار المطعم', hasText(restaurant?.logo_url), 'recommended'),
    item('cover', 'غلاف المطعم', hasText(restaurant?.cover_url), 'recommended'),
    item('product_images', 'صور المنتجات', validProducts.length > 0 && validProducts.every(product => hasText(product?.image_url)), 'recommended'),
    item('product_descriptions', 'وصف المنتجات', validProducts.length > 0 && validProducts.every(product => hasText(product?.description)), 'recommended'),
    item('hours', 'ساعات العمل', hasObjectContent(branch?.opening_hours) || hasObjectContent(restaurant?.opening_hours), 'recommended'),
    item('phone', 'رقم الهاتف', hasText(branch?.phone) || hasText(restaurant?.phone), 'recommended'),
    item('marketing', 'عرض أو كوبون', banners.length > 0 || coupons.length > 0, 'recommended'),
  ]

  const essentialsDone = essentials.filter(entry => entry.complete).length
  const recommendedDone = recommended.filter(entry => entry.complete).length
  const totalItems = essentials.length + recommended.length
  const completedItems = essentialsDone + recommendedDone
  const nextEssential = essentials.find(entry => !entry.complete) || null

  return {
    minimumReady: essentialsDone === essentials.length,
    essentials,
    recommended,
    essentialsDone,
    essentialsTotal: essentials.length,
    recommendedDone,
    recommendedTotal: recommended.length,
    completionPercent: totalItems ? Math.round((completedItems / totalItems) * 100) : 0,
    visibleCategories,
    validProducts,
    nextEssential,
  }
}

export function menuReadyMessage(readiness) {
  if (readiness?.minimumReady) return 'منيوك جاهز للمشاركة 🎉'
  const next = readiness?.nextEssential?.label || 'الأساسيات'
  return `باقي خطوة واحدة ليصبح منيوك جاهزًا: ${next}`
}
