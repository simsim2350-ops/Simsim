import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import type {
  MenuBranch,
  MenuBranding,
  MenuCategory,
  MenuData,
  MenuProduct,
  MenuRestaurant,
} from './menu-types'

// أعمدة العرض الصريحة فقط — لا select('*') (Phase 1، البند 6): payload أصغر ونقل أسرع.
const RESTAURANT_COLUMNS =
  'id, slug, name, name_en, description, description_en, logo_url, cover_url, brand_color, price_color, description_color, menu_layout, phone, address, maps_url, social_links, show_social_links, show_description, show_hours, show_prep_time, show_allergens, allergens, opening_hours, delivery_enabled, delivery_fee, is_active, platform_suspended'
const BRANCH_COLUMNS =
  'id, restaurant_id, name, name_en, address, address_en, phone, maps_url, is_primary, is_active, sort_order, menu_clone_status, opening_hours, is_paused, delivery_enabled, delivery_fee, takeaway_enabled'
const CATEGORY_COLUMNS = 'id, name, name_en, emoji, cover_url, sort_order, branch_id, is_visible'
const PRODUCT_COLUMNS =
  'id, category_id, name, name_en, description, description_en, price, compare_price, image_url, emoji, calories, options, is_featured, is_best_seller, is_available, sort_order, branch_id'

// نفس نمط lib/marketing-repository.ts: عميل عام (anon/publishable) على الخادم فقط — لا service_role.
function publicClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

// يجلب بيانات العرض الأساسية من Supabase على الخادم.
// waterfall حتمي جزئياً: restaurant (بالـ slug) → branch (بالـ restaurant_id)، لأن branch_id
// غير معروف قبل معرفة المطعم. لكن الموجة الأخيرة (categories + products + branding) تُجلب بالتوازي.
// الطيّ الكامل لموجة واحدة يتطلب RPC مجمّعة في القاعدة — مسجّل كتوصية فقط (Phase 1: ممنوع تعديل DB).
async function loadMenu(slug: string, branchIdParam: string | null): Promise<MenuData | null> {
  const supabase = publicClient()
  if (!supabase) return null

  // الموجة 1: المطعم من الـ slug.
  const { data: rest, error: restError } = await supabase
    .from('restaurants')
    .select(RESTAURANT_COLUMNS)
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (restError || !rest || (rest as { platform_suspended?: boolean }).platform_suspended) return null
  const restaurant = rest as unknown as MenuRestaurant

  // الموجة 2: فروع المطعم النشطة، واختيار الفرع الفعّال (نفس منطق useMenuData).
  const { data: brs } = await supabase
    .from('branches')
    .select(BRANCH_COLUMNS)
    .eq('restaurant_id', restaurant.id)
    .eq('is_active', true)
    .order('sort_order')

  const branchList = ((brs || []) as unknown as MenuBranch[]).filter(
    (b) => b.menu_clone_status !== 'copying' && b.menu_clone_status !== 'failed',
  )
  const branch =
    (branchIdParam && branchList.find((b) => b.id === branchIdParam)) ||
    branchList.find((b) => b.is_primary) ||
    branchList[0] ||
    null
  if (!branch) return null

  // الموجة 3: الأقسام + المنتجات + هوية المنيو بالتوازي (كسر أقصى قدر ممكن للـ waterfall دون RPC جديدة).
  const [categoriesRes, productsRes, brandingRes] = await Promise.all([
    supabase
      .from('categories')
      .select(CATEGORY_COLUMNS)
      .eq('branch_id', branch.id)
      .eq('is_visible', true)
      .order('sort_order'),
    supabase
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('branch_id', branch.id)
      .eq('is_available', true)
      .order('sort_order'),
    // هوية المنيو عبر RPC قراءة موجودة (menu_branding) — fail-open كما في SPA؛ لا إنشاء/تعديل RPC.
    supabase.rpc('menu_branding', { p_restaurant_id: restaurant.id }),
  ])

  if (categoriesRes.error || productsRes.error) return null

  const categories = (categoriesRes.data || []) as unknown as MenuCategory[]
  const products = (productsRes.data || []) as unknown as MenuProduct[]
  const manualBestSellers = products.filter((p) => p.is_best_seller === true).slice(0, 4)
  const featuredProducts = products.filter((p) => p.is_featured === true).slice(0, 4)
  const branding =
    !brandingRes.error && brandingRes.data && typeof brandingRes.data === 'object'
      ? (brandingRes.data as MenuBranding)
      : null

  return { restaurant, branch, categories, products, manualBestSellers, featuredProducts, branding }
}

// ISR (Phase 1، البند 8): يُقرأ المنيو كثيراً ويتغيّر نادراً من طرف المطعم.
// tags تسمح لاحقاً بإبطال دقيق (نفس نمط marketing) دون بناء نظام invalidation معقّد الآن.
export function getMenu(slug: string, branchId: string | null): Promise<MenuData | null> {
  return unstable_cache(
    () => loadMenu(slug, branchId),
    ['menu-preview', slug, branchId || 'default'],
    { revalidate: 300, tags: [`menu:${slug}`] },
  )()
}
