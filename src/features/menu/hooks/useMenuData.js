import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'

// جلب بيانات المنيو: المطعم + الفرع (مستقل بمنيوه/ساعاته) + الأقسام + الأصناف + الأكثر مبيعاً + عدد الطلبات النشطة (حي)
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
  const restaurantLoadChannelRef = useRef(null)

  useEffect(() => {
    fetchMenu()
  }, [slug, branchId])

  useEffect(() => {
    return () => {
      if (restaurantLoadChannelRef.current) supabase.removeChannel(restaurantLoadChannelRef.current)
    }
  }, [])

  const fetchMenu = async () => {
    try {
      // Fetch restaurant
      const { data: rest, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .single()

      if (error || !rest) { setNotFound(true); return }
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

      // عدد الطلبات النشطة حالياً لحساب وقت تجهيز تقديري ديناميكي (عبر RPC آمن)
      const { data: activeCount } = await supabase.rpc('get_active_orders_count', { p_restaurant_id: rest.id })
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

      // هل برنامج الولاء مفعّل؟ (برنامج واحد للمطعم كله — لعرض تشويقي عام في هيدر المنيو)
      try {
        const { data: loy } = await supabase.from('loyalty_programs').select('enabled').eq('restaurant_id', rest.id).maybeSingle()
        setLoyaltyEnabled(!!loy?.enabled)
      } catch { /* تجاهل — التشويق اختياري */ }

      // بانرات العروض وكوبونات النشطة — عامة (بلا فرع) + خاصة بهذا الفرع تحديداً
      try {
        const now = new Date().toISOString()
        const [{ data: bnrs }, { data: cpns }] = await Promise.all([
          supabase.from('banners').select('*').eq('restaurant_id', rest.id).eq('is_active', true).order('sort_order'),
          supabase.from('coupons').select('*').eq('restaurant_id', rest.id).eq('is_active', true),
        ])
        const relevant = (row) => !row.branch_id || row.branch_id === resolvedBranch.id
        setBanners((bnrs || []).filter(b => relevant(b) && (!b.starts_at || b.starts_at <= now) && (!b.ends_at || b.ends_at >= now)))
        setCoupons((cpns || []).filter(c => relevant(c) && (!c.expires_at || c.expires_at >= now)))
      } catch { /* تجاهل — البانرات والكوبونات اختيارية */ }

      // Fetch categories & products — كل فرع منيوه المستقل الخاص به
      const [{ data: cats }, { data: prods }] = await Promise.all([
        supabase.from('categories').select('*').eq('branch_id', resolvedBranch.id).eq('is_visible', true).order('sort_order'),
        supabase.from('products').select('*').eq('branch_id', resolvedBranch.id).eq('is_available', true).order('sort_order'),
      ])

      if (cats) { setCategories(cats); if (cats.length > 0) setActiveCategory(cats[0].id) }
      if (prods) setProducts(prods)

      // حساب الأصناف الأكثر مبيعاً من الطلبات الفعلية (غير الملغاة) خلال آخر 30 يوماً (عبر RPC آمن)
      const { data: pastOrders } = await supabase.rpc('get_recent_order_items', { p_restaurant_id: rest.id })

      if (pastOrders && prods) {
        const salesCount = {}
        pastOrders.forEach(o => {
          const orderItems = Array.isArray(o.items) ? o.items : []
          orderItems.forEach(it => {
            if (it.unavailable) return
            salesCount[it.id] = (salesCount[it.id] || 0) + (it.qty || 1)
          })
        })
        const ranked = prods
          .filter(p => salesCount[p.id] > 0)
          .sort((a, b) => salesCount[b.id] - salesCount[a.id])
          .slice(0, 4)
        setBestSellers(ranked)
      }

      // تحديث عدد الطلبات النشطة لحظياً مع كل طلب جديد أو تغيّر حالة
      if (restaurantLoadChannelRef.current) supabase.removeChannel(restaurantLoadChannelRef.current)
      restaurantLoadChannelRef.current = supabase.channel(`restaurant-load-${rest.id}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${rest.id}` },
          async () => {
            const { data: c } = await supabase.rpc('get_active_orders_count', { p_restaurant_id: rest.id })
            setActiveOrdersCount(c || 0)
          }
        ).subscribe()
    } finally {
      setLoading(false)
    }
  }

  return {
    restaurant, branch, branchList,
    categories, products, bestSellers, loading, notFound,
    activeCategory, setActiveCategory, restaurantActiveOrdersCount, rating, loyaltyEnabled,
    banners, coupons,
  }
}
