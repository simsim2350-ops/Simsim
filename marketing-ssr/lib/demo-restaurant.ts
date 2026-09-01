import { unstable_cache } from 'next/cache'
import { publicClient } from './marketing-repository'

// نفس مطعم العرض الحي الذي يستخدمه الموقع القديم (src/config/landingContent.js → LANDING_DEMO_RESTAURANT_SLUG).
export const DEMO_RESTAURANT_SLUG = 'simsim'

export type DemoRestaurantPreview = {
  name: string
  branchName: string | null
  coverUrl: string | null
  rating: { avg: number; count: number } | null
  open: boolean
  categories: { id: string; name: string }[]
  products: { id: string; name: string; price: number; featured: boolean }[]
}

function localized(ar: unknown, en: unknown): string {
  return (typeof en === 'string' && en) || (typeof ar === 'string' && ar) || ''
}

// نفس منطق computeBranchOpenStatus/computeOpenStatus في features/menu/helpers.js بالتطبيق القديم،
// مختصرة لحقلي is_paused وopening_hours فقط (لا حاجة لباقي حقول الفرع في معاينة تسويقية للقراءة فقط).
export function isBranchOpenNow(branch: { is_paused?: boolean | null; opening_hours?: unknown }): boolean {
  if (branch.is_paused) return false
  const hours = branch.opening_hours
  if (!Array.isArray(hours) || hours.length !== 7) return true

  const toMins = (t: unknown) => {
    if (typeof t !== 'string') return null
    const [h, m] = t.split(':').map(Number)
    return h * 60 + (m || 0)
  }
  const now = new Date()
  const day = now.getDay()
  const mins = now.getHours() * 60 + now.getMinutes()
  const today = hours[day] as { open?: boolean; from?: string; to?: string } | undefined
  const yesterday = hours[(day + 6) % 7] as { open?: boolean; from?: string; to?: string } | undefined

  if (yesterday?.open) {
    const f = toMins(yesterday.from); const t = toMins(yesterday.to)
    if (f !== null && t !== null && t <= f && mins < t) return true
  }
  if (today?.open) {
    const f = toMins(today.from); const t = toMins(today.to)
    if (f !== null && t !== null) return t > f ? (mins >= f && mins < t) : mins >= f
  }
  return false
}

async function loadDemoRestaurantPreview(slug: string): Promise<DemoRestaurantPreview | null> {
  const supabase = publicClient()
  if (!supabase) return null

  const { data: restaurant, error: restaurantError } = await supabase
    .from('restaurants')
    .select('id,name,cover_url,is_active,platform_suspended')
    .eq('slug', slug).eq('is_active', true).single()
  if (restaurantError) console.error('[marketing] demo restaurant lookup failed', restaurantError.message)
  if (!restaurant || restaurant.platform_suspended) return null

  const { data: branches } = await supabase
    .from('branches')
    .select('id,name,is_primary,is_paused,opening_hours')
    .eq('restaurant_id', restaurant.id).eq('is_active', true).order('sort_order')
  const branch = (branches || []).find((row) => row.is_primary) || (branches || [])[0] || null
  if (!branch) return null

  const [{ data: categories }, { data: products }, { data: ratingRows }] = await Promise.all([
    supabase.from('categories').select('id,name,name_en').eq('branch_id', branch.id).eq('is_visible', true).order('sort_order').limit(4),
    supabase.from('products').select('id,name,name_en,price,is_featured').eq('branch_id', branch.id).eq('is_available', true).order('sort_order').limit(12),
    supabase.rpc('get_restaurant_rating', { p_restaurant_id: restaurant.id }),
  ])

  const allProducts = products || []
  const featured = allProducts.filter((product) => product.is_featured)
  const visibleProducts = (featured.length > 0 ? featured : allProducts).slice(0, 4)
  const ratingRow = Array.isArray(ratingRows) ? ratingRows[0] : ratingRows

  return {
    name: restaurant.name,
    branchName: branch.name || null,
    coverUrl: restaurant.cover_url || null,
    rating: ratingRow && Number(ratingRow.review_count) > 0
      ? { avg: Number(ratingRow.avg_rating), count: Number(ratingRow.review_count) }
      : null,
    open: isBranchOpenNow(branch),
    categories: (categories || []).map((category) => ({ id: category.id, name: localized(category.name, category.name_en) })),
    products: visibleProducts.map((product) => ({ id: product.id, name: localized(product.name, product.name_en), price: Number(product.price || 0), featured: Boolean(product.is_featured) })),
  }
}

// معاينة للقراءة فقط — لا كتابة، لا اشتراك Realtime (غير مطلوب لعرض تسويقي زخرفي). كاش قصير (60 ثانية)
// لأن حالة "مفتوح الآن" تعتمد على الوقت الحالي، بمعزل عن الكاش الأطول لبقية محتوى صفحات التسويق.
export function getDemoRestaurantPreview(slug: string = DEMO_RESTAURANT_SLUG) {
  return unstable_cache(
    () => loadDemoRestaurantPreview(slug),
    ['marketing-demo-restaurant', slug],
    { revalidate: 60, tags: [`marketing-demo-restaurant:${slug}`] },
  )()
}
