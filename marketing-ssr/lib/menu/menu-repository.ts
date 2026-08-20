import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import type { Branch, MenuCategory, MenuData, MenuProduct, Restaurant } from './menu-types'

// ============================================================================
// مستودع بيانات منيو المعاينة (SSR) — STEP 4/6.
// كل الوصول لـ Supabase من الخادم فقط، بمفتاح publishable/anon العام (نفس مفتاح الإنتاج
// الذي يستخدمه تطبيق Vite للمنيو العام). لا service_role إطلاقًا. لا Supabase queries داخل UI.
// RLS هي التي تحكم القراءة العامة (لم تُلمَس) — نقرأ نفس ما يقرأه الإنتاج بالضبط.
// ============================================================================

// أعمدة صريحة (لا select("*")) — مطابقة لِما تعرضه مكوّنات المنيو الحالية.
const RESTAURANT_COLUMNS =
  'id, slug, name, description, description_en, phone, address, logo_url, cover_url, brand_color, price_color, description_color, menu_layout, currency, social_links, allergens, maps_url, delivery_enabled, delivery_fee, show_description, show_social_links, show_allergens, show_hours, show_prep_time, is_active, platform_suspended'
const BRANCH_COLUMNS =
  'id, restaurant_id, is_primary, name, name_en, address, address_en, phone, maps_url, opening_hours, is_active, sort_order, delivery_enabled, delivery_fee, takeaway_enabled, is_paused, menu_clone_status'
const CATEGORY_COLUMNS = 'id, name, name_en, emoji, cover_url, sort_order, is_visible, branch_id'
const PRODUCT_COLUMNS =
  'id, category_id, name, name_en, description, description_en, price, compare_price, image_url, emoji, calories, is_available, is_featured, is_best_seller, options, sort_order, branch_id'

/** عميل Supabase خادمي بمفتاح عام. يُرجع null إن غابت متغيرات البيئة (تُسجَّل كـ BLOCKED). */
function menuClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export function isMenuBackendConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
}

/**
 * حلّ رمز الطاولة (?table) إلى الفرع عبر نفس الـRPC العامة التي يستخدمها الإنتاج.
 * للقراءة فقط، fail-open: أي فشل يُرجع null فلا يكسر العرض (STEP 8).
 * لا يُكاش لأنه خاص بالرمز؛ وهو استعلام واحد خفيف.
 */
async function resolveTableBranchId(slug: string, token: string): Promise<string | null> {
  const supabase = menuClient()
  if (!supabase) return null
  try {
    const { data, error } = await supabase
      .rpc('resolve_table_qr', { p_qr_token: token, p_restaurant_slug: slug })
      .single()
    if (error || !data) return null
    return (data as { branch_id?: string }).branch_id ?? null
  } catch {
    return null
  }
}

/**
 * جلب بيانات المنيو الأساسية (مطعم + فرع + أقسام + أصناف) لِـ slug وفرعٍ مطلوب اختياريًا.
 * نفس منطق الاختيار الموجود في useMenuData: فلترة فروع النسخ الجارية/الفاشلة، ثم
 * الفرع المطلوب → الأساسي → الأول.
 */
async function loadMenuData(slug: string, branchId: string | null): Promise<Omit<MenuData, 'requestedBranchId' | 'tableToken'> | null> {
  const supabase = menuClient()
  if (!supabase) return null

  const { data: rest, error } = await supabase
    .from('restaurants')
    .select(RESTAURANT_COLUMNS)
    .eq('slug', slug)
    .eq('is_active', true)
    .single<Restaurant>()

  if (error || !rest || rest.platform_suspended) return null

  const { data: brs } = await supabase
    .from('branches')
    .select(BRANCH_COLUMNS)
    .eq('restaurant_id', rest.id)
    .eq('is_active', true)
    .order('sort_order')
    .returns<Branch[]>()

  const list = (brs || []).filter((b) => b.menu_clone_status !== 'copying' && b.menu_clone_status !== 'failed')
  const branch =
    (branchId ? list.find((b) => b.id === branchId) : undefined) ||
    list.find((b) => b.is_primary) ||
    list[0] ||
    null
  if (!branch) return null

  const [categoriesResult, productsResult] = await Promise.all([
    supabase.from('categories').select(CATEGORY_COLUMNS).eq('branch_id', branch.id).eq('is_visible', true).order('sort_order').returns<MenuCategory[]>(),
    supabase.from('products').select(PRODUCT_COLUMNS).eq('branch_id', branch.id).eq('is_available', true).order('sort_order').returns<MenuProduct[]>(),
  ])

  return {
    restaurant: rest,
    branch,
    categories: categoriesResult.data || [],
    products: productsResult.data || [],
  }
}

/**
 * طبقة بيانات قابلة للكاش (STEP 13). مفتاح الكاش واضح: menu-preview + slug + branch.
 * الوسم يسمح بإبطال لكل مطعم. revalidate قصير حتى تنعكس تعديلات المنيو بسرعة معقولة،
 * دون ادعاء أي سلوك runtime قبل إثباته فعليًا.
 */
function cachedMenuData(slug: string, branchId: string | null) {
  const branchKey = branchId || 'default'
  return unstable_cache(
    () => loadMenuData(slug, branchId),
    ['menu-preview', slug, branchKey],
    { revalidate: 60, tags: [`menu-preview:${slug}`, `menu-preview:${slug}:${branchKey}`] },
  )
}

/**
 * نقطة الدخول للصفحة. تحل رمز الطاولة (إن وُجد) لاشتقاق الفرع، ثم تجلب بيانات المنيو المكاشة.
 * الأولوية للفرع المشتق من رمز الطاولة، ثم ?branch (مطابق لسلوك الإنتاج effectiveBranchId).
 */
export async function getMenuPreview(
  slug: string,
  { branch, table }: { branch?: string | null; table?: string | null },
): Promise<MenuData | null> {
  const tableToken = table || null
  const branchFromTable = tableToken ? await resolveTableBranchId(slug, tableToken) : null
  const effectiveBranchId = branchFromTable || branch || null

  const base = await cachedMenuData(slug, effectiveBranchId)()
  if (!base) return null

  return {
    ...base,
    requestedBranchId: effectiveBranchId,
    tableToken,
  }
}
