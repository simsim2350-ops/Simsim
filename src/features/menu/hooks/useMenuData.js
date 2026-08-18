import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'

// جلب بيانات المنيو: المطعم + الفرع (مستقل بمنيوه/ساعاته) + الأقسام + الأصناف + قائمة «يعجب زبائننا» من الطلبات الفعلية + عدد الطلبات النشطة (حي).
export function useMenuData(slug, branchId) {
  const [restaurant, setRestaurant] = useState(null)
  const [branch, setBranch] = useState(null)
  const [branchList, setBranchList] = useState([]) // كل الفروع النشطة (لعرض اسم الفرع/تبديله)
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [bestSellers, setBestSellers] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [activeCategory, setActiveCategory] = useState(null)
  const [restaurantActiveOrdersCount, setActiveOrdersCount] = useState(0)
  const [rating, setRating] = useState(null) // { avg, count } — متوسط تقييم المطعم للعرض العام
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false) // هل برنامج الولاء مفعّل؟ (بلا حاجة لهوية الزبون — لعرض تشويقي عام)
  const [banners, setBanners] = useState([]) // بانرات العروض النشطة (عامة + خاصة بهذا الفرع)
  const [coupons, setCoupons] = useState([]) // الكوبونات النشطة (عامة + خاصة بهذا الفرع)
  // قدرات منيو الزبون من سجل القدرات (PCR — ADR-40) — الافتراضي كله مفعّل (fail-open، غير كاسر)
  const [capabilities, setCapabilities] = useState({ online_orders: true, reviews: true, loyalty: true, product_details: true })
  const [branding, setBranding] = useState(null) // هوية المنيو «صمم بواسطة سمسم» — من الإعداد المركزي
  const restaurantLoadChannelRef = useRef(null)
  const menuDataChannelRef = useRef(null)

  useEffect(() => {
    fetchMenu()
  }, [slug, branchId])

  useEffect(() => {
    return () => {
      if (restaurantLoadChannelRef.current) supabase.removeChannel(restaurantLoadChannelRef.current)
      if (menuDataChannelRef.current) supabase.removeChannel(menuDataChannelRef.current)
    }
  }, [])

  const fetchMenu = async () => {
    setLoading(true)
    setNotFound(false)
    setRating(null)
    setBanners([])
    setCoupons([])
    setBestSellers([])
    try {
      // Fetch restaurant
      const { data: rest, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .single()

      if (error || !rest) { setNotFound(true); return }
      // مطعم معلَّق من المنصّة: لا يُفتح منيوه إطلاقاً (يُعامَل كغير متاح، كإيقاف المالك)
      if (rest.platform_suspended) { setNotFound(true); return }
      setRestaurant(rest)

      // كل الفروع النشطة — لتحديد الفرع الحالي (من الرابط أو الأساسي افتراضياً) ولعرض قائمة التبديل
      const { data: brs } = await supabase
        .from('branches')
        .select('*')
        .eq('restaurant_id', rest.id)
        .eq('is_active', true)
        .order('sort_order')
      const list = brs || []
      setBranchList(list)

      const resolvedBranch = (branchId && list.find(b => b.id === branchId))
        || list.find(b => b.is_primary)
        || list[0]
        || null
      if (!resolvedBranch) { setNotFound(true); return }
      setBranch(resolvedBranch)

      // عدد الطلبات النشطة حالياً لحساب وقت تجهيز تقديري ديناميكي — لهذا الفرع فقط (كل فرع مطبخه مستقل)
      const { data: activeCount } = await supabase.rpc('get_active_orders_count', { p_restaurant_id: rest.id, p_branch_id: resolvedBranch.id })
      setActiveOrdersCount(activeCount || 0)

      // متوسط تقييم المطعم (RPC آمن — sql/get_restaurant_rating.sql)
      // لو الدالة غير منفذة في Supabase بعد: نتجاهل بصمت وتُخفى النجوم
      try {
        const { data: rt, error: rtErr } = await supabase.rpc('get_restaurant_rating', { p_restaurant_id: rest.id })
        const row = Array.isArray(rt) ? rt[0] : rt
        if (!rtErr && row && Number(row.review_count) > 0) {
          setRating({ avg: Number(row.avg_rating), count: Number(row.review_count) })
        }
      } catch { /* تجاهل — النجوم اختيارية */ }

      // قدرات منيو الزبون من السجل (PCR): طلبات أونلاين / تقييمات / ولاء — دالة آمنة لـanon.
      // fail-open: عند أي خطأ تبقى القيم الافتراضية (كلها مفعّلة) فلا حجب خاطئ.
      let caps = { online_orders: true, reviews: true, loyalty: true, product_details: true }
      try {
        const { data: c } = await supabase.rpc('menu_capabilities', { p_restaurant_id: rest.id })
        if (c && typeof c === 'object') caps = { ...caps, ...c }
      } catch { /* تجاهل — fail-open */ }
      setCapabilities(caps)

      // هوية المنيو «صمم بواسطة سمسم» — من الإعداد المركزي (RPC آمن). fail-safe: لا شيء عند الخطأ.
      try {
        const { data: brand } = await supabase.rpc('menu_branding', { p_restaurant_id: rest.id })
        if (brand && typeof brand === 'object') setBranding(brand)
      } catch { /* تجاهل — البراندينغ اختياري */ }

      // هل برنامج الولاء مفعّل؟ (إعداد المطعم) — ويُشترَط أيضاً أن قدرة الولاء مفعّلة في الباقة (PCR)
      try {
        const { data: loy } = await supabase.from('loyalty_programs').select('enabled').eq('restaurant_id', rest.id).maybeSingle()
        setLoyaltyEnabled(!!loy?.enabled && caps.loyalty)
      } catch { /* تجاهل — التشويق اختياري */ }

      // بانرات العروض وكوبونات النشطة — عامة (بلا فرع) + خاصة بهذا الفرع تحديداً
      try {
        const now = new Date().toISOString()
        const [{ data: bnrs }, { data: cpns }] = await Promise.all([
          supabase.from('banners').select('*').eq('restaurant_id', rest.id).eq('is_active', true).order('display_priority', { ascending:false }).order('sort_order'),
          supabase.from('coupons').select('*').eq('restaurant_id', rest.id).eq('is_active', true),
        ])
        const relevant = (row) => !row.branch_id || row.branch_id === resolvedBranch.id
        setBanners((bnrs || []).filter(b => relevant(b) && (!b.starts_at || b.starts_at <= now) && (!b.ends_at || b.ends_at >= now)))
        setCoupons((cpns || []).filter(c => relevant(c) && (!c.expires_at || c.expires_at >= now)))
      } catch { setBanners([]); setCoupons([]) }

      // Fetch categories & products — كل فرع منيوه المستقل الخاص به
      const [{ data: cats }, { data: prods }] = await Promise.all([
        supabase.from('categories').select('*').eq('branch_id', resolvedBranch.id).eq('is_visible', true).order('sort_order'),
        supabase.from('products').select('*').eq('branch_id', resolvedBranch.id).eq('is_available', true).order('sort_order'),
      ])

      const nextCategories = cats || []
      const nextProducts = prods || []
      setCategories(nextCategories)
      setProducts(nextProducts)
      setActiveCategory(previous => nextCategories.some(category => category.id === previous) ? previous : (nextCategories[0]?.id || null))

      // حساب قائمة «يعجب زبائننا» من الطلبات الفعلية غير الملغاة خلال آخر 30 يومًا (عبر RPC آمن)، وهي مستقلة عن المنتجات المميزة.
      const { data: pastOrders } = await supabase.rpc('get_recent_order_items', { p_restaurant_id: rest.id })

      if (pastOrders && nextProducts.length > 0) {
        const salesCount = {}
        pastOrders.forEach(o => {
          const orderItems = Array.isArray(o.items) ? o.items : []
          orderItems.forEach(it => {
            if (it.unavailable) return
            salesCount[it.id] = (salesCount[it.id] || 0) + (it.qty || 1)
          })
        })
        const ranked = nextProducts
          .filter(p => salesCount[p.id] > 0)
          .sort((a, b) => salesCount[b.id] - salesCount[a.id])
          .slice(0, 4)
        setBestSellers(ranked)
      }

      // تحديث عدد الطلبات النشطة لحظياً مع كل طلب جديد أو تغيّر حالة — عبر Realtime Broadcast
      // (الاشتراك المباشر بالجدول postgres_changes لا يعمل للزبون العابر أصلاً، يحتاج صلاحية قراءة
      // مغلقة عمداً — ADR-9؛ نفس حل تتبّع حالة الطلب، بمعزل عن أي بيانات — restaurant_id ليس سرياً)
      const refreshActiveOrdersCount = async () => {
        const { data: c } = await supabase.rpc('get_active_orders_count', { p_restaurant_id: rest.id, p_branch_id: resolvedBranch.id })
        setActiveOrdersCount(c || 0)
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
    } finally {
      setLoading(false)
    }
  }

  return {
    restaurant, branch, branchList,
    categories, products, bestSellers, loading, notFound,
    activeCategory, setActiveCategory, restaurantActiveOrdersCount, rating, loyaltyEnabled,
    banners, coupons, capabilities, branding,
  }
}
