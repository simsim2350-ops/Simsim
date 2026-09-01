import { unstable_cache } from 'next/cache'
import { publicClient } from './marketing-repository'
import { DEMO_RESTAURANT_SLUG, isBranchOpenNow } from './demo-restaurant'

export type DemoOptionItem = { id: string; name: string; price: number }
export type DemoOptionGroup = { id: string; type: 'single' | 'multiple'; required: boolean; label: string; items: DemoOptionItem[] }
export type DemoMenuProduct = {
  id: string
  categoryId: string | null
  name: string
  desc: string
  price: number
  imageUrl: string | null
  emoji: string
  featured: boolean
  options: DemoOptionGroup[]
}
export type DemoMenuCategory = { id: string; name: string }
export type DemoMenuData = {
  restaurantName: string
  branchName: string | null
  coverUrl: string | null
  rating: { avg: number; count: number } | null
  open: boolean
  categories: DemoMenuCategory[]
  products: DemoMenuProduct[]
}

function localized(ar: unknown, en: unknown): string {
  return (typeof ar === 'string' && ar) || (typeof en === 'string' && en) || ''
}

// نفس منطق normalizeOptions في src/components/landing/demo/useInteractiveMenu.js بالتطبيق القديم —
// خيارات الصنف (مقاسات/إضافات) مخزّنة كـJSON غير موثوق في عمود options، فتُقرأ دفاعياً بلا افتراض بنية ثابتة.
function normalizeOptions(raw: unknown): DemoOptionGroup[] {
  if (!Array.isArray(raw)) return []
  return raw.map((value, groupIndex) => {
    const group = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
    const choices = Array.isArray(group.choices) ? group.choices : []
    return {
      id: typeof group.id === 'string' ? group.id : `option-group-${groupIndex}`,
      type: group.type === 'multiple' ? 'multiple' as const : 'single' as const,
      required: Boolean(group.required),
      label: localized(group.name ?? group.label, group.name_en ?? group.label_en),
      items: choices.map((choiceValue, choiceIndex) => {
        const choice = (choiceValue && typeof choiceValue === 'object' ? choiceValue : {}) as Record<string, unknown>
        return {
          id: typeof choice.id === 'string' ? choice.id : `option-${groupIndex}-${choiceIndex}`,
          name: localized(choice.name, choice.name_en),
          price: Number(choice.price || 0),
        }
      }),
    }
  })
}

async function loadDemoMenu(slug: string): Promise<DemoMenuData | null> {
  const supabase = publicClient()
  if (!supabase) return null

  const { data: restaurant, error: restaurantError } = await supabase
    .from('restaurants')
    .select('id,name,cover_url,is_active,platform_suspended')
    .eq('slug', slug).eq('is_active', true).single()
  if (restaurantError) console.error('[marketing] demo menu: restaurant lookup failed', restaurantError.message)
  if (!restaurant || restaurant.platform_suspended) return null

  const { data: branches } = await supabase
    .from('branches')
    .select('id,name,is_primary,is_paused,opening_hours')
    .eq('restaurant_id', restaurant.id).eq('is_active', true).order('sort_order')
  const branch = (branches || []).find((row) => row.is_primary) || (branches || [])[0] || null
  if (!branch) return null

  const [{ data: categories }, { data: products }, { data: ratingRows }] = await Promise.all([
    supabase.from('categories').select('id,name,name_en').eq('branch_id', branch.id).eq('is_visible', true).order('sort_order'),
    supabase.from('products').select('id,category_id,name,name_en,description,description_en,price,image_url,emoji,is_featured,options').eq('branch_id', branch.id).eq('is_available', true).order('sort_order'),
    supabase.rpc('get_restaurant_rating', { p_restaurant_id: restaurant.id }),
  ])

  const ratingRow = Array.isArray(ratingRows) ? ratingRows[0] : ratingRows

  return {
    restaurantName: restaurant.name,
    branchName: branch.name || null,
    coverUrl: restaurant.cover_url || null,
    rating: ratingRow && Number(ratingRow.review_count) > 0
      ? { avg: Number(ratingRow.avg_rating), count: Number(ratingRow.review_count) }
      : null,
    open: isBranchOpenNow(branch),
    categories: (categories || []).map((category) => ({ id: category.id, name: localized(category.name, category.name_en) })),
    products: (products || []).map((product) => ({
      id: product.id,
      categoryId: product.category_id ?? null,
      name: localized(product.name, product.name_en),
      desc: localized(product.description, product.description_en),
      price: Number(product.price || 0),
      imageUrl: product.image_url || null,
      emoji: product.emoji || '🍽️',
      featured: Boolean(product.is_featured),
      options: normalizeOptions(product.options),
    })),
  }
}

// معاينة تفاعلية للقراءة فقط — بيانات حقيقية من نفس مطعم العرض، لكن بلا أي كتابة API ولا اشتراك
// Realtime (السلة والدفع التجريبي بالكامل حالة محلية على المتصفح، مطابقة لسلوك الموقع القديم في
// useInteractiveMenu.js حيث checkout() لا يستدعي أي واجهة خلفية، فقط يبدّل حالة العرض محلياً).
export function getDemoMenu(slug: string = DEMO_RESTAURANT_SLUG) {
  return unstable_cache(
    () => loadDemoMenu(slug),
    ['marketing-demo-menu', slug],
    { revalidate: 60, tags: [`marketing-demo-menu:${slug}`] },
  )()
}
