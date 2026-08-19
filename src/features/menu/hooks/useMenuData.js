import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { safeSupabaseRequest } from '../../../lib/safeSupabaseRequest'

const DEFAULT_CAPABILITIES = { online_orders: true, reviews: true, loyalty: true, product_details: true }

// جلب بيانات المنيو: المطعم + الفرع (مستقل بمنيوه/ساعاته) + الأقسام + الأصناف + قائمة «يعجب زبائننا» من الطلبات الفعلية + عدد الطلبات النشطة (حي).
export function useMenuData(slug, branchId) {
  const [restaurant, setRestaurant] = useState(null)
  const [branch, setBranch] = useState(null)
  const [branchList, setBranchList] = useState([]) // كل الفروع النشطة (لعرض اسم الفرع/تبديله)
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [contentError, setContentError] = useState(null)
  const [customerFavorites, setCustomerFavorites] = useState([]) // سلوك طلبات فعلي: «يعجب زبائننا»
  const [manualBestSellers, setManualBestSellers] = useState([]) // اختيار المالك اليدوي: «الأكثر مبيعًا»
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [activeCategory, setActiveCategory] = useState(null)
  const [restaurantActiveOrdersCount, setActiveOrdersCount] = useState(0)
  const [rating, setRating] = useState(null) // { avg, count } — متوسط تقييم المطعم للعرض العام
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false) // هل برنامج الولاء مفعّل؟ (بلا حاجة لهوية الزبون — لعرض تشويقي عام)
  const [banners, setBanners] = useState([]) // بانرات العروض النشطة (عامة + خاصة بهذا الفرع)
  const [coupons, setCoupons] = useState([]) // الكوبونات النشطة (عامة + خاصة بهذا الفرع)
  // قدرات منيو الزبون من سجل القدرات (PCR — ADR-40) — الافتراضي كله مفعّل (fail-open، غير كاسر)
  const [capabilities, setCapabilities] = useState(DEFAULT_CAPABILITIES)
  const [branding, setBranding] = useState(null) // هوية المنيو «صمم بواسطة سمسم» — من الإعداد المركزي
  const restaurantLoadChannelRef = useRef(null)
  const menuDataChannelRef = useRef(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    fetchMenu()
    return () => {
      // يمنع نتيجة طلب قديم من الكتابة فوق حالة فرع/رابط أحدث.
      requestIdRef.current += 1
    }
  }, [slug, branchId])

  useEffect(() => {
    return () => {
      if (restaurantLoadChannelRef.current) supabase.removeChannel(restaurantLoadChannelRef.current)
      if (menuDataChannelRef.current) supabase.removeChannel(menuDataChannelRef.current)
    }
  }, [])

  const fetchMenu = async () => {
    const requestId = ++requestIdRef.current
    const isCurrent = () => requestId === requestIdRef.current
    const commit = (setter, value) => {
      if (isCurrent()) setter(value)
    }
    commit(setLoading, true)
    commit(setNotFound, false)
    commit(setContentError, null)
    commit(setRating, null)
    commit(setBanners, [])
    commit(setCoupons, [])
    commit(setCustomerFavorites, [])
    commit(setManualBestSellers, [])
    commit(setLoyaltyEnabled, false)
    commit(setBranding, null)
    commit(setCapabilities, DEFAULT_CAPABILITIES)

    try {
      // الموجة الأولى: لا يمكن معرفة الفرع قبل استرجاع المطعم من الرابط.
      const { data: rest, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .single()

      if (!isCurrent()) return
      if (error || !rest || rest.platform_suspended) {
        commit(setNotFound, true)
        return
      }
      commit(setRestaurant, rest)

      // الموجة الثانية: اختيار الفرع النشط من قائمة فروع المطعم.
      const { data: brs } = await supabase
        .from('branches')
        .select('*')
        .eq('restaurant_id', rest.id)
        .eq('is_active', true)
        .order('sort_order')

      if (!isCurrent()) return
      const list = (brs || []).filter(branch => branch.menu_clone_status !== 'copying' && branch.menu_clone_status !== 'failed')
      commit(setBranchList, list)

      const resolvedBranch = (branchId && list.find(branch => branch.id === branchId))
        || list.find(branch => branch.is_primary)
        || list[0]
        || null
      if (!resolvedBranch) {
        commit(setNotFound, true)
        return
      }
      commit(setBranch, resolvedBranch)

      // الموجة الثالثة: بيانات العرض الأساسية متوازية. لا ننتظر التحليلات أو البيانات الاختيارية.
      const categoriesRequest = safeSupabaseRequest(
        supabase.from('categories').select('*').eq('branch_id', resolvedBranch.id).eq('is_visible', true).order('sort_order'),
      )
      const productsRequest = safeSupabaseRequest(
        supabase.from('products').select('*').eq('branch_id', resolvedBranch.id).eq('is_available', true).order('sort_order'),
      )

      // كل هذه تحسينات للواجهة فقط؛ تبدأ بالتوازي ولا تحجب ظهور الأقسام والأصناف.
      const activeOrdersRequest = safeSupabaseRequest(
        supabase.rpc('get_active_orders_count', { p_restaurant_id: rest.id, p_branch_id: resolvedBranch.id }),
      )
      const ratingRequest = safeSupabaseRequest(
        supabase.rpc('get_restaurant_rating', { p_restaurant_id: rest.id }),
      )
      const capabilitiesRequest = safeSupabaseRequest(
        supabase.rpc('menu_capabilities', { p_restaurant_id: rest.id }),
      )
      const brandingRequest = safeSupabaseRequest(
        supabase.rpc('menu_branding', { p_restaurant_id: rest.id }),
      )
      const loyaltyRequest = safeSupabaseRequest(
        supabase.from('loyalty_programs').select('enabled').eq('restaurant_id', rest.id).maybeSingle(),
      )
      const bannersRequest = safeSupabaseRequest(
        supabase.from('banners').select('*').eq('restaurant_id', rest.id).eq('is_active', true).order('display_priority', { ascending:false }).order('sort_order'),
      )
      const couponsRequest = safeSupabaseRequest(
        supabase.from('coupons').select('*').eq('restaurant_id', rest.id).eq('is_active', true),
      )
      const pastOrdersRequest = safeSupabaseRequest(
        supabase.rpc('get_recent_order_items', { p_restaurant_id: rest.id }),
      )

      const [categoriesResult, productsResult] = await Promise.all([categoriesRequest, productsRequest])
      if (!isCurrent()) return
      if (categoriesResult.error || productsResult.error) {
        commit(setContentError, 'تعذر تحميل أقسام المنيو أو أصنافه. حاول مرة أخرى.')
        return
      }

      const nextCategories = categoriesResult.data || []
      const nextProducts = productsResult.data || []
      commit(setCategories, nextCategories)
      commit(setProducts, nextProducts)
      // Best Sellers قائمة يحددها مالك المطعم فقط؛ لا تستعمل الطلبات أو is_featured أو أي ترتيب تلقائي.
      commit(setManualBestSellers, nextProducts.filter(product => product.is_best_seller === true).slice(0, 4))
      if (isCurrent()) {
        setActiveCategory(previous => nextCategories.some(category => category.id === previous) ? previous : (nextCategories[0]?.id || null))
      }

      // تحديث عدد الطلبات النشطة لحظياً مع كل طلب جديد أو تغيّر حالة — عبر Realtime Broadcast
      // (الاشتراك المباشر بالجدول postgres_changes لا يعمل للزبون العابر أصلاً، يحتاج صلاحية قراءة
      // مغلقة عمداً — ADR-9؛ نفس حل تتبّع حالة الطلب، بمعزل عن أي بيانات — restaurant_id ليس سرياً)
      const refreshActiveOrdersCount = async () => {
        const { data: count } = await supabase.rpc('get_active_orders_count', { p_restaurant_id: rest.id, p_branch_id: resolvedBranch.id })
        if (isCurrent()) setActiveOrdersCount(count || 0)
      }
      if (restaurantLoadChannelRef.current) supabase.removeChannel(restaurantLoadChannelRef.current)
      restaurantLoadChannelRef.current = supabase.channel(`restaurant-orders:${rest.id}`, { config: { private: true } })
        .on('broadcast', { event: 'INSERT' }, refreshActiveOrdersCount)
        .on('broadcast', { event: 'UPDATE' }, refreshActiveOrdersCount)
        .subscribe()

      // ربط حيّ لنفس مصادر Supabase المستخدمة في التحميل الأولي؛ لا توجد بيانات واجهة بديلة أو ثابتة.
      if (menuDataChannelRef.current) supabase.removeChannel(menuDataChannelRef.current)
      menuDataChannelRef.current = supabase.channel(`menu-data:${rest.id}:${resolvedBranch.id}`)
        .on('postgres_changes', { event:'*', schema:'public', table:'restaurants', filter:`id=eq.${rest.id}` }, fetchMenu)
        .on('postgres_changes', { event:'*', schema:'public', table:'branches', filter:`restaurant_id=eq.${rest.id}` }, fetchMenu)
        .on('postgres_changes', { event:'*', schema:'public', table:'categories', filter:`branch_id=eq.${resolvedBranch.id}` }, fetchMenu)
        .on('postgres_changes', { event:'*', schema:'public', table:'products', filter:`branch_id=eq.${resolvedBranch.id}` }, fetchMenu)
        .on('postgres_changes', { event:'*', schema:'public', table:'banners', filter:`restaurant_id=eq.${rest.id}` }, fetchMenu)
        .on('postgres_changes', { event:'*', schema:'public', table:'coupons', filter:`restaurant_id=eq.${rest.id}` }, fetchMenu)
        .subscribe()

      // تُحدَّث العناصر الاختيارية عند اكتمالها؛ لا تؤخر أول عرض قابل للاستخدام.
      Promise.all([
        activeOrdersRequest,
        ratingRequest,
        capabilitiesRequest,
        brandingRequest,
        loyaltyRequest,
        bannersRequest,
        couponsRequest,
        pastOrdersRequest,
      ]).then(([
        { data: activeCount },
        { data: ratingData, error: ratingError },
        { data: capabilityData },
        { data: brandData },
        { data: loyaltyData },
        { data: bannerData },
        { data: couponData },
        { data: pastOrders },
      ]) => {
        if (!isCurrent()) return

        const nextCapabilities = capabilityData && typeof capabilityData === 'object'
          ? { ...DEFAULT_CAPABILITIES, ...capabilityData }
          : DEFAULT_CAPABILITIES
        commit(setActiveOrdersCount, activeCount || 0)
        commit(setCapabilities, nextCapabilities)
        if (!ratingError) {
          const ratingRow = Array.isArray(ratingData) ? ratingData[0] : ratingData
          if (ratingRow && Number(ratingRow.review_count) > 0) {
            commit(setRating, { avg: Number(ratingRow.avg_rating), count: Number(ratingRow.review_count) })
          }
        }
        if (brandData && typeof brandData === 'object') commit(setBranding, brandData)
        commit(setLoyaltyEnabled, !!loyaltyData?.enabled && nextCapabilities.loyalty)

        const now = new Date().toISOString()
        const relevant = (row) => !row.branch_id || row.branch_id === resolvedBranch.id
        commit(setBanners, (bannerData || []).filter(banner => relevant(banner) && (!banner.starts_at || banner.starts_at <= now) && (!banner.ends_at || banner.ends_at >= now)))
        commit(setCoupons, (couponData || []).filter(coupon => relevant(coupon) && (!coupon.expires_at || coupon.expires_at >= now)))

        // «يعجب زبائننا» توصية مستقلة من الطلبات الفعلية غير الملغاة خلال آخر 30 يومًا.
        if (pastOrders && nextProducts.length > 0) {
          const salesCount = {}
          pastOrders.forEach(order => {
            const orderItems = Array.isArray(order.items) ? order.items : []
            orderItems.forEach(item => {
              if (item.unavailable) return
              salesCount[item.id] = (salesCount[item.id] || 0) + (item.qty || 1)
            })
          })
          const ranked = nextProducts
            .filter(product => salesCount[product.id] > 0)
            .sort((a, b) => salesCount[b.id] - salesCount[a.id])
            .slice(0, 4)
          commit(setCustomerFavorites, ranked)
        }
      })
    } finally {
      commit(setLoading, false)
    }
  }

  return {
    restaurant, branch, branchList,
    categories, products, contentError, customerFavorites, manualBestSellers, loading, notFound,
    activeCategory, setActiveCategory, restaurantActiveOrdersCount, rating, loyaltyEnabled,
    banners, coupons, capabilities, branding,
    reloadMenu: fetchMenu,
  }
}
